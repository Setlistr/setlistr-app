import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HOST          = 'identify-us-west-2.acrcloud.com'
const ACCESS_KEY    = '81af58b16d932703e6a233f054666f3b'
const ACCESS_SECRET = 'vNLUzrw4OOaiKiaw4FTdPQlqTNTGj3VbCNmotS22'

// ─── FIX: Use service role key for server-side writes ────────────────────────
// The anon key client was causing ALL detection_events inserts to silently fail
// because RLS requires an authenticated session, which the singleton anon client
// never has in a serverless context. The service role key bypasses RLS entirely,
// which is correct for a trusted server-side route.
//
// User auth (for user_songs writes) is still read from the Authorization header.
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!   // ← was NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

// ─── Inclusion thresholds — adjust all gating in ONE place ───────────────────
// Each constant is used BOTH as the score gate for its branch AND as the value
// recorded on the detection ("threshold"), so changing a number here updates the
// gate and the recorded value together.
//
//   planned setlist     — song is on this show's planned setlist
//   artist catalogue    — song is already in the artist's catalogue (user_songs)
//   fallback catalogue  — song is in the global catalogue_fallback table
//   multiple detections — unknown song heard this many separate times → add once
const PLANNED_SETLIST_THRESHOLD     = 1
const ARTIST_CATALOGUE_THRESHOLD    = 30
const FALLBACK_CATALOGUE_THRESHOLD  = 30
const MULTIPLE_DETECTIONS_THRESHOLD = 2

// ─── Title normalization ──────────────────────────────────────────────────────
// Strip common version suffixes ACRCloud adds that pollute song titles.
// Applied before any matching AND before displaying to users.
const VERSION_SUFFIX_RE = /\s*[\(\[](alternate|alternative|live|edit|radio edit|radio|album version|acoustic|acoustic version|remaster|remastered|instrumental|original mix|original|extended|extended mix|deluxe|explicit|clean|single|mono|stereo|demo|bonus track|remix|mixed|mix|re-mix|part \d+|teil \d+|vol\.?\s*\d+|version|ver\.?)[^\)\]]*[\)\]]/gi

function cleanTitle(raw: string): string {
  return raw.replace(VERSION_SUFFIX_RE, '').replace(/\s+/g, ' ').trim()
}

// Aggressive key used for matching titles across catalogues + detection history.
function normalizeSongKey(title: string): string {
  return title.toLowerCase().trim()
    .replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '')
    .replace(/[-–—]/g, ' ').replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ').trim()
}

type DetectionSource = 'fingerprint' | 'humming'
interface EnrichedSongData { isrc: string; composer: string; publisher: string }

// ─── Planned setlist lookup ───────────────────────────────────────────────────
// Returns the set of normalized titles on this performance's planned setlist.
// planned_setlists is keyed by performance_id; its songs live in planned_setlist_songs.
async function getPlannedSetlistTitles(performanceId: string | null): Promise<Set<string>> {
  const titles = new Set<string>()
  if (!performanceId) return titles
  try {
    const supabase = getSupabase()
    const { data: planned } = await supabase
      .from('planned_setlists').select('id').eq('performance_id', performanceId).maybeSingle()
    if (!planned?.id) return titles
    const { data: songs } = await supabase
      .from('planned_setlist_songs').select('title').eq('planned_setlist_id', planned.id)
    for (const s of songs || []) {
      const key = normalizeSongKey(s.title || '')
      if (key) titles.add(key)
    }
  } catch (err) {
    console.error('[PlannedSetlist] lookup failed (non-blocking):', err)
  }
  return titles
}

// ─── Artist catalogue lookup ──────────────────────────────────────────────────
// The artist's catalogue = the user's user_songs rows. Membership alone qualifies
// (no confirmed_count requirement). Returns the set of normalized titles.
async function getArtistCatalogueTitles(userId: string | null): Promise<Set<string>> {
  const titles = new Set<string>()
  if (!userId) return titles
  try {
    const supabase = getSupabase()
    const { data } = await supabase
      .from('user_songs').select('song_title').eq('user_id', userId).limit(500)
    for (const row of data || []) {
      const key = normalizeSongKey(row.song_title || '')
      if (key) titles.add(key)
    }
  } catch (err) {
    console.error('[ArtistCatalogue] lookup failed (non-blocking):', err)
  }
  return titles
}

// ─── Fallback catalogue lookup ────────────────────────────────────────────────
// Global catalogue_fallback table. Requires BOTH a normalized-title match AND an
// artist match — the stored `artist` field is raw and may list several artists
// (e.g. "Old Crow Medicine Show / Darius Rucker"), so we split + normalize in JS.
async function isInFallbackCatalogue(normalizedTitle: string, artist: string): Promise<boolean> {
  if (!normalizedTitle || normalizedTitle.length < 3) return false
  try {
    const { data } = await getSupabase()
      .from('catalogue_fallback').select('artist').eq('normalized_title', normalizedTitle).limit(20)
    if (!data || data.length === 0) return false

    const detectedArtist = normalizeSongKey(artist)
    if (!detectedArtist) return false

    return data.some(row =>
      String(row.artist || '')
        .split(/\s*(?:\/|,|;|&|feat\.?|ft\.?)\s*/i)   // one fallback row may list multiple artists
        .map(a => normalizeSongKey(a))
        .some(a => a && (a === detectedArtist || a.includes(detectedArtist) || detectedArtist.includes(a)))
    )
  } catch (err) {
    console.error('[FallbackCatalogue] lookup failed (non-blocking):', err)
    return false
  }
}

// ─── Cross-chunk detection state ──────────────────────────────────────────────
// This route runs once per audio chunk and is stateless, so "already added" and
// "detected N times" are reconstructed from detection_events, which logs one row
// per chunk. We mark a row's auto_confirmed = true when the song is added, so:
//   priorDetections = how many earlier chunks detected this title
//   alreadyAdded    = an earlier chunk already added it (auto_confirmed = true)
async function getDetectionStats(
  performanceId: string | null,
  normalizedTitle: string
): Promise<{ priorDetections: number; alreadyAdded: boolean }> {
  if (!performanceId || !normalizedTitle) return { priorDetections: 0, alreadyAdded: false }
  try {
    const supabase = getSupabase()
    const { data } = await supabase
      .from('detection_events')
      .select('final_title, auto_confirmed')
      .eq('performance_id', performanceId)
      .limit(1000)
    let priorDetections = 0
    let alreadyAdded = false
    for (const row of data || []) {
      if (!row.final_title) continue
      // Normalize in JS so casing / cleaning differences still match.
      if (normalizeSongKey(row.final_title) !== normalizedTitle) continue
      priorDetections++
      if (row.auto_confirmed) alreadyAdded = true
    }
    return { priorDetections, alreadyAdded }
  } catch (err) {
    console.error('[DetectionStats] lookup failed (non-blocking):', err)
    return { priorDetections: 0, alreadyAdded: false }
  }
}

// ─── user_songs write ─────────────────────────────────────────────────────────
// Grows the artist's catalogue + memory whenever a song is added. The guard table
// (user_song_performances) makes this idempotent per performance.
async function writeToUserSongs(
  title: string,
  artist: string,
  userId: string,
  performanceId: string
): Promise<void> {
  try {
    const supabase        = getSupabase()
    const normalizedTitle = normalizeSongKey(title)

    const { error: guardError } = await supabase
      .from('user_song_performances')
      .insert({ user_id: userId, performance_id: performanceId, normalized_title: normalizedTitle })

    if (guardError) {
      if (guardError.code === '23505') return
      console.error('[UserSongs] guard insert error:', guardError.message)
      return
    }

    const { data: existing } = await supabase
      .from('user_songs')
      .select('id, confirmed_count')
      .eq('user_id', userId)
      .eq('song_title', title)
      .single()

    if (existing) {
      await supabase.from('user_songs').update({
        confirmed_count: existing.confirmed_count + 1,
        canonical_artist: artist || null,
        last_confirmed_at: new Date().toISOString(),
      }).eq('id', existing.id)
    } else {
      await supabase.from('user_songs').insert({
        user_id: userId,
        song_title: title,
        canonical_artist: artist || null,
        confirmed_count: 1,
        last_confirmed_at: new Date().toISOString(),
      })
    }
  } catch (err) {
    console.error('[UserSongs] write failed (non-blocking):', err)
  }
}

async function enrichFromMusicBrainz(title: string, artist: string, isrcFromACR: string): Promise<EnrichedSongData> {
  const result: EnrichedSongData = { isrc: isrcFromACR || '', composer: '', publisher: '' }
  try {
    let recordingId: string | null = null
    if (isrcFromACR) {
      const r = await fetch(`https://musicbrainz.org/ws/2/isrc/${isrcFromACR}?inc=recordings&fmt=json`, { headers: { 'User-Agent': 'Setlistr/1.0 (setlistr.app)' } })
      if (r.ok) recordingId = (await r.json())?.recordings?.[0]?.id || null
    }
    if (!recordingId) {
      const q = encodeURIComponent(`recording:"${title}" AND artist:"${artist}"`)
      const r = await fetch(`https://musicbrainz.org/ws/2/recording?query=${q}&limit=1&fmt=json`, { headers: { 'User-Agent': 'Setlistr/1.0 (setlistr.app)' } })
      if (r.ok) {
        const d = await r.json()
        const top = d?.recordings?.[0]
        if (top) { recordingId = top.id; if (!result.isrc && top.isrcs?.length) result.isrc = top.isrcs[0] }
      }
    }
    if (recordingId) {
      const r = await fetch(`https://musicbrainz.org/ws/2/recording/${recordingId}?inc=artist-credits+work-rels+artists&fmt=json`, { headers: { 'User-Agent': 'Setlistr/1.0 (setlistr.app)' } })
      if (r.ok) {
        const detail = await r.json()
        const workRels = detail?.relations?.filter((x: any) => x['target-type'] === 'work') || []
        if (workRels.length) {
          const workId = workRels[0]?.work?.id
          if (workId) {
            const wr = await fetch(`https://musicbrainz.org/ws/2/work/${workId}?inc=artist-rels&fmt=json`, { headers: { 'User-Agent': 'Setlistr/1.0 (setlistr.app)' } })
            if (wr.ok) {
              const wd = await wr.json()
              const compRels = wd?.relations?.filter((x: any) => ['composer','writer','lyricist'].includes(x.type)) || []
              if (compRels.length) result.composer = compRels.map((x: any) => x.artist?.name).filter(Boolean).join(', ')
            }
          }
        }
      }
    }
  } catch (err) { console.error('[MusicBrainz] failed:', err) }
  return result
}

async function logDetectionEvent(event: Record<string, any>): Promise<void> {
  try {
    const supabase = getSupabase()
    const { error } = await supabase.from('detection_events').insert(event)
    if (error) {
      // Surface insert errors instead of silently swallowing them.
      console.error('[DetectionEvent] insert failed:', error.message, error.code)
    }
  } catch (err) {
    console.error('[DetectionEvent] log failed:', err)
  }
}

export async function POST(req: NextRequest) {
  const supabase  = getSupabase()
  const startTime = Date.now()
  let audioBytes  = 0
  let performanceId: string | null = null

  try {
    // ── Parse the incoming request ────────────────────────────────────────────
    const incoming     = await req.formData()
    const audio        = incoming.get('audio')
    performanceId      = incoming.get('performance_id') as string | null
    const showId       = incoming.get('show_id') as string | null
    const setlistId    = incoming.get('setlist_id') as string | null
    const artistId     = incoming.get('artist_id') as string | null
    const artistName   = incoming.get('artist_name') as string | null
    const venueName    = incoming.get('venue_name') as string | null
    const showType     = (incoming.get('show_type') as string | null) || 'single'
    const prevRaw      = incoming.get('previous_songs') as string | null
    const previousSongs: string[] = prevRaw ? JSON.parse(prevRaw) : []

    if (!(audio instanceof File)) return NextResponse.json({ error: 'No audio file' }, { status: 400 })

    const audioBuffer = Buffer.from(await audio.arrayBuffer())
    audioBytes        = audioBuffer.length

    // ── Resolve the current user (for catalogue lookup + user_songs writes) ────
    // Primary: Authorization header (when sent).
    // Fallback: look up user_id from the performance record using the service role key,
    // so memory writes work even when the live capture page doesn't send auth headers.
    let userId: string | null = null
    try {
      const authHeader = req.headers.get('authorization')
      if (authHeader) {
        const anonClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )
        const { data: { user } } = await anonClient.auth.getUser(authHeader.replace('Bearer ', ''))
        userId = user?.id || null
      }
      if (!userId && performanceId) {
        const { data: perfRow } = await supabase
          .from('performances')
          .select('user_id')
          .eq('id', performanceId)
          .single()
        userId = perfRow?.user_id || null
      }
    } catch { /* non-blocking */ }

    // ── Pre-flight forensic rows (one capture + one job per chunk) ─────────────
    const { data: capture } = await supabase.from('audio_captures').insert({
      show_id: showId, artist_id: artistId, captured_by: null,
      duration_seconds: 14, file_size_bytes: audioBytes,
      mime_type: 'audio/webm', captured_at: new Date().toISOString(),
    }).select().single()

    const { data: job } = await supabase.from('recognition_jobs').insert({
      audio_capture_id: capture?.id || null, vendor: 'acrcloud', status: 'processing',
      submitted_at: new Date().toISOString(),
      raw_request: { host: HOST, audio_bytes: audioBytes, performance_id: performanceId },
    }).select().single()

    // ── Call ACRCloud ─────────────────────────────────────────────────────────
    const timestamp    = Math.floor(Date.now() / 1000).toString()
    const stringToSign = ['POST', '/v1/identify', ACCESS_KEY, 'audio', '1', timestamp].join('\n')
    const signature    = crypto.createHmac('sha1', ACCESS_SECRET).update(stringToSign).digest('base64')

    const acrForm = new FormData()
    acrForm.append('access_key', ACCESS_KEY)
    acrForm.append('sample_bytes', audioBuffer.length.toString())
    acrForm.append('sample', new Blob([audioBuffer]), 'sample.webm')
    acrForm.append('timestamp', timestamp)
    acrForm.append('signature', signature)
    acrForm.append('data_type', 'audio')
    acrForm.append('signature_version', '1')

    const acrRes  = await fetch(`https://${HOST}/v1/identify`, { method: 'POST', body: acrForm })
    const payload = await acrRes.json()
    const durationSeconds = Math.round((Date.now() - startTime) / 1000)

    if (job) await supabase.from('recognition_jobs').update({
      status: 'completed', completed_at: new Date().toISOString(), raw_response: payload,
    }).eq('id', job.id)

    // ── Read the ACR match + score (humming scores are scaled ×100) ───────────
    const humming     = payload?.metadata?.humming?.[0]
    const music       = payload?.metadata?.music?.[0]
    const acrMatch    = humming || music
    const acrDetected = payload.status?.code === 0 && !!acrMatch
    const source: DetectionSource = humming ? 'humming' : 'fingerprint'

    const rawScore = acrMatch?.score ? parseFloat(acrMatch.score) : 0
    const score    = humming ? rawScore * 100 : rawScore   // keep humming ×100

    // Wall-clock stamp for the per-chunk console line (route has no chunk offset).
    const now   = new Date()
    const clock = now.toTimeString().slice(0, 8)  // HH:MM:SS

    // ── No ACR match → log a failed detection event and bail ──────────────────
    if (!acrDetected) {
      await logDetectionEvent({
        performance_id: performanceId,
        acr_score: 0, acr_state: 'failed',
        confidence_level: 'no_result', auto_confirmed: false,
        fallback_triggered: false, flip_count: 0,
        artist_name: artistName, venue_name: venueName, show_type: showType,
        audio_duration_seconds: durationSeconds,
        detected_at: now.toISOString(),
      })
      console.log(`${clock} — — — 0 — IGNORE — no_detection`)
      return NextResponse.json({ detected: false, job_id: job?.id, chunk: { artist: '', title: '', score: 0, status: 'no detection', inclusion_reason: null } })
    }

    // ── Clean the ACR title (strip "(Live)", "(Remix)", etc.) ─────────────────
    const rawTitle        = acrMatch.title
    const title           = cleanTitle(rawTitle)
    const artist          = acrMatch.artists?.[0]?.name || ''
    const isrc            = acrMatch.external_ids?.isrc || ''
    const normalizedTitle = normalizeSongKey(title)

    // Keep the per-job recognition result row (rank 1).
    await supabase.from('recognition_results').insert({
      job_id: job?.id || null, rank: 1, title, artist_name: artist,
      score, raw_data: acrMatch,
    })

    // ── Gather everything the inclusion cascade needs (in parallel) ───────────
    const [plannedTitles, artistCatalogueTitles, inFallback, stats] = await Promise.all([
      getPlannedSetlistTitles(performanceId),
      getArtistCatalogueTitles(userId),
      isInFallbackCatalogue(normalizedTitle, artist),
      getDetectionStats(performanceId, normalizedTitle),
    ])
    const thisDetectionCount = stats.priorDetections + 1   // includes the current chunk

    // ── ALREADY ADDED: an earlier chunk already added this song → never twice ──
    if (stats.alreadyAdded) {
      console.log(`${clock} — ${artist} — ${title} — ${score} — ALREADY ADDED`)
      await logDetectionEvent({
        performance_id: performanceId,
        acr_title: rawTitle, acr_artist: artist, acr_score: score,
        acr_state: 'unstable',
        final_title: title, final_artist: artist, final_source: source,
        confidence_level: 'no_result', auto_confirmed: false,
        fallback_triggered: false, flip_count: 0,
        artist_name: artistName, venue_name: venueName, show_type: showType,
        audio_duration_seconds: durationSeconds,
        previous_song: previousSongs[previousSongs.length - 1] || null,
        detected_at: now.toISOString(),
        candidate_pool: [{ title, artist, source, score, status: 'already_added' }],
      })
      return NextResponse.json({ detected: false, job_id: job?.id, debug: { status: 'already_added' }, chunk: { artist, title, score, status: 'ALREADY ADDED', inclusion_reason: null } })
    }

    // ── Inclusion cascade (first branch that matches wins) ────────────────────
    // inclusionReason stays null when the song should be IGNORED. Each branch
    // records the constant that allowed the add as its threshold.
    let inclusionReason: string | null = null
    let inclusionThreshold = 0
    let inclusionScore = 0

    if (plannedTitles.has(normalizedTitle) && score >= PLANNED_SETLIST_THRESHOLD) {
      inclusionReason    = 'planned setlist'
      inclusionThreshold = PLANNED_SETLIST_THRESHOLD
      inclusionScore     = score
    } else if (artistCatalogueTitles.has(normalizedTitle) && score >= ARTIST_CATALOGUE_THRESHOLD) {
      inclusionReason    = 'artist catalogue'
      inclusionThreshold = ARTIST_CATALOGUE_THRESHOLD
      inclusionScore     = score
    } else if (inFallback && score >= FALLBACK_CATALOGUE_THRESHOLD) {
      inclusionReason    = 'fallback catalogue'
      inclusionThreshold = FALLBACK_CATALOGUE_THRESHOLD
      inclusionScore     = score
    } else if (thisDetectionCount >= MULTIPLE_DETECTIONS_THRESHOLD) {
      inclusionReason    = 'multiple detections'
      inclusionThreshold = MULTIPLE_DETECTIONS_THRESHOLD
      inclusionScore     = thisDetectionCount   // score = number of detections
    }

    const added = inclusionReason !== null

    // ── Per-chunk console line ────────────────────────────────────────────────
    // time — artist — song — score — ADD|IGNORE — inclusion_reason (if added)
    console.log(`${clock} — ${artist} — ${title} — ${score} — ${added ? 'ADD' : 'IGNORE'}${inclusionReason ? ` — ${inclusionReason}` : ''}`)

    // ── Log the detection event (auto_confirmed marks it as added) ────────────
    // inclusion_reason/threshold/score ride in the existing candidate_pool JSONB
    // column — no schema change needed.
    await logDetectionEvent({
      performance_id: performanceId,
      acr_title: rawTitle, acr_artist: artist, acr_score: score,
      acr_state: added ? 'stable' : 'unstable',
      final_title: title, final_artist: artist, final_source: source,
      confidence_level: added ? 'auto' : 'no_result',
      auto_confirmed: added,
      fallback_triggered: inclusionReason === 'fallback catalogue',
      flip_count: 0,
      artist_name: artistName, venue_name: venueName, show_type: showType,
      audio_duration_seconds: durationSeconds,
      previous_song: previousSongs[previousSongs.length - 1] || null,
      detected_at: now.toISOString(),
      candidate_pool: [{
        title, artist, source, score,
        inclusion_reason: inclusionReason, threshold: inclusionThreshold,
        detections: thisDetectionCount,
      }],
    })

    // ── Not added → return a non-detection so the (unchanged) live page ignores ─
    if (!added) {
      return NextResponse.json({
        detected: false, job_id: job?.id,
        debug: { score, reason: 'below_thresholds', detections: thisDetectionCount },
        chunk: { artist, title, score, status: 'IGNORE', inclusion_reason: null }
      })
    }

    // ── Added → enrich + preserve the existing add-time side effects ──────────
    const enriched = await enrichFromMusicBrainz(title, artist, isrc)

    // Legacy setlist mirror (unchanged behaviour from the old 'auto' path).
    let setlistItemId: string | null = null
    if (setlistId) {
      const { data: existing } = await supabase.from('setlist_items').select('id')
        .eq('setlist_id', setlistId).ilike('title', title).single()
      if (!existing) {
        const { data: lastItem } = await supabase.from('setlist_items').select('position')
          .eq('setlist_id', setlistId).order('position', { ascending: false }).limit(1).single()
        const { data: newItem } = await supabase.from('setlist_items').insert({
          setlist_id: setlistId, title, artist_name: artist,
          position: (lastItem?.position || 0) + 1, source,
        }).select().single()
        if (newItem) setlistItemId = newItem.id
      }
    }

    // Grow the artist catalogue / memory (unchanged from the old 'auto' path).
    if (userId && performanceId) {
      writeToUserSongs(title, artist, userId, performanceId)
    }

    // Keep the recognition_logs row for added songs.
    await supabase.from('recognition_logs').insert({
      performance_id: performanceId || null,
      audio_bytes: audioBytes, duration_seconds: durationSeconds,
      acr_status_code: payload.status?.code ?? null,
      detected: true, title, artist,
      isrc: enriched.isrc || null, score,
      source, raw_response: payload,
      user_agent: req.headers.get('user-agent') ?? null,
    })

    // ── Response ──────────────────────────────────────────────────────────────
    // confidence_level:'auto' keeps the current (unchanged) live page working;
    // inclusion_reason/threshold/score are the new fields the live page will
    // eventually carry into performance_songs.
    return NextResponse.json({
      detected: true, title, artist,
      confidence_level: 'auto', source,
      acr_score: score,
      inclusion_reason: inclusionReason,
      threshold: inclusionThreshold,
      score: Math.round(inclusionScore),
      isrc: enriched.isrc, composer: enriched.composer, publisher: enriched.publisher,
      setlist_item_id: setlistItemId, job_id: job?.id,
      debug: {
        raw_title: rawTitle, cleaned_title: title,
        inclusion_reason: inclusionReason, threshold: inclusionThreshold,
        detections: thisDetectionCount,
      },
      chunk: { artist, title, score, status: 'ADD', inclusion_reason: inclusionReason }
    })

  } catch (err: any) {
    console.error('[IdentifyRoute] Error:', err)
    await getSupabase().from('recognition_logs').insert({
      performance_id: performanceId || null, audio_bytes: audioBytes, detected: false,
      acr_message: err.message, raw_response: { error: err.message },
    })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
