import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { ACR_DAILY_CALL_LIMIT, ACR_LIMIT_MESSAGE } from '@/lib/acr-limits'
import { normalizeSongKey, cleanTitle } from '@/lib/reconciliation/normalize'

// ─── Upload-only recognition route ────────────────────────────────────────────
// Phase 1: isolates processUploadedFile()'s traffic from the shared, fragile
// live-capture route (app/api/identify/route.ts) so upload can be optimized
// independently later without ever touching that file. This is a behavioral
// duplicate for now, not a rewrite — recognition-critical logic below is
// reproduced verbatim from api/identify/route.ts, not "improved."
//
// Unlike api/identify, this route REQUIRES a verified session and proves the
// caller owns (or has an accepted delegation on) performance_id before any
// service-role read/write happens — api/identify currently has no such check
// (see docs/api-auth-audit.md). That gap is intentionally not reproduced here.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HOST          = 'identify-us-west-2.acrcloud.com'
const ACCESS_KEY    = '81af58b16d932703e6a233f054666f3b'
const ACCESS_SECRET = 'vNLUzrw4OOaiKiaw4FTdPQlqTNTGj3VbCNmotS22'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ─── Inclusion thresholds — must match app/api/identify/route.ts exactly ─────
const PLANNED_SETLIST_THRESHOLD     = 1
const ARTIST_CATALOGUE_THRESHOLD    = 30
const FALLBACK_CATALOGUE_THRESHOLD  = 30
const MULTIPLE_DETECTIONS_THRESHOLD = 2

// ─── Upload-only: uploaded-setlist recognition context ───────────────────────
// Not present in app/api/identify/route.ts — this is an upload-specific
// addition, isolated to this route. Same threshold value and same role as
// PLANNED_SETLIST_THRESHOLD (a title-match still requires ACR to have
// returned *some* nonzero score on its own; this never substitutes for
// audio evidence, it only lowers how strong that evidence needs to be for a
// title that was also independently expected). Kept as its own named
// constant rather than reusing PLANNED_SETLIST_THRESHOLD so the two sources
// stay distinguishable in logs/observability, per instruction.
const UPLOADED_SETLIST_THRESHOLD = 1

type DetectionSource = 'fingerprint' | 'humming'
interface EnrichedSongData { isrc: string; composer: string; publisher: string }

// ─── Planned setlist lookup (verbatim from api/identify/route.ts) ────────────
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

// ─── Artist catalogue lookup (verbatim from api/identify/route.ts) ───────────
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

// ─── Fallback catalogue lookup (verbatim from api/identify/route.ts) ─────────
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
        .split(/\s*(?:\/|,|;|&|feat\.?|ft\.?)\s*/i)
        .map(a => normalizeSongKey(a))
        .some(a => a && (a === detectedArtist || a.includes(detectedArtist) || detectedArtist.includes(a)))
    )
  } catch (err) {
    console.error('[FallbackCatalogue] lookup failed (non-blocking):', err)
    return false
  }
}

// ─── Cross-chunk detection state (verbatim from api/identify/route.ts) ───────
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

// ─── user_songs write (verbatim from api/identify/route.ts) ──────────────────
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

// ─── MusicBrainz enrichment (verbatim from api/identify/route.ts) ────────────
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

// ─── detection_events write (verbatim from api/identify/route.ts) ────────────
async function logDetectionEvent(event: Record<string, any>): Promise<void> {
  try {
    const supabase = getSupabase()
    const { error } = await supabase.from('detection_events').insert(event)
    if (error) {
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
    // ── Parse the upload-only contract: audio, performance_id, previous_songs ──
    // No show_id/setlist_id/artist_id/artist_name/venue_name/show_type — the
    // upload caller never sends these, and this route doesn't accept them.
    const incoming = await req.formData()
    const audio    = incoming.get('audio')
    performanceId  = incoming.get('performance_id') as string | null
    const prevRaw  = incoming.get('previous_songs') as string | null
    const previousSongs: string[] = prevRaw ? JSON.parse(prevRaw) : []

    // Optional recognition context from an uploaded setlist photo/file —
    // parsed client-side once via /api/parse-setlist, sent compactly on every
    // chunk. Absent entirely for the no-setlist case, matching prior behavior
    // exactly. Malformed/oversized input degrades to "no context" rather than
    // failing the request — this is a prior, not a required input.
    const uploadedSetlistRaw = incoming.get('uploaded_setlist') as string | null
    let uploadedSetlistTitles = new Set<string>()
    if (uploadedSetlistRaw) {
      try {
        const parsed = JSON.parse(uploadedSetlistRaw)
        if (Array.isArray(parsed)) {
          for (const song of parsed.slice(0, 60)) {
            const key = normalizeSongKey(String(song?.title || ''))
            if (key) uploadedSetlistTitles.add(key)
          }
        }
      } catch { /* malformed context — treat as no setlist provided */ }
    }

    // Fixed values matching what upload's calls to api/identify already
    // resolve to today (it never sends these fields either) — kept as
    // named constants purely so the forensic-write shapes below read the
    // same as the reference route, not because they vary per request.
    const artistName: string | null = null
    const venueName: string | null  = null
    const showType                  = 'single'

    if (!(audio instanceof File)) return NextResponse.json({ error: 'No audio file' }, { status: 400 })

    const audioBuffer = Buffer.from(await audio.arrayBuffer())
    audioBytes        = audioBuffer.length

    // ── Authenticate ────────────────────────────────────────────────────────
    // Unlike api/identify, this header is REQUIRED, not an optional fallback.
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: { user }, error: userError } = await anonClient.auth.getUser(authHeader.replace('Bearer ', ''))
    if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const callerId = user.id

    // ── Authorize: caller must own performance_id, or hold an accepted ────────
    // delegation from its owner. Nonexistent and unauthorized performances are
    // treated identically (403) so a caller can't distinguish "doesn't exist"
    // from "not yours" by probing ids.
    const { data: perfRow } = await supabase
      .from('performances')
      .select('user_id')
      .eq('id', performanceId)
      .single()

    if (!perfRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const ownerId = perfRow.user_id

    let authorized = callerId === ownerId
    if (!authorized) {
      const { data: delegation } = await supabase
        .from('artist_delegates')
        .select('id')
        .eq('artist_id', ownerId)
        .eq('delegate_id', callerId)
        .not('accepted_at', 'is', null)
        .maybeSingle()
      authorized = !!delegation
    }
    if (!authorized) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Recognition/catalogue identity is always the performance OWNER, never
    // the delegate operating the session — matches how the artist's own
    // catalogue/memory is meant to grow regardless of who's running the scan.
    const userId = ownerId

    // ── Daily ACR quota (verbatim behavior from api/identify/route.ts) ───────
    // userId is always resolved here (auth is mandatory), so this gate always
    // runs — unlike api/identify, where it's skipped for any unattributable
    // caller. That's an intentional side effect of requiring auth, not a
    // deliberate quota-behavior change.
    try {
      const { data: quota, error: quotaError } = await supabase
        .rpc('increment_acr_usage', { p_user_id: userId, p_limit: ACR_DAILY_CALL_LIMIT })
        .single<{ allowed: boolean; calls_today: number; calls_lifetime: number }>()
      if (!quotaError && quota && quota.allowed === false) {
        return NextResponse.json({
          detected: false,
          quota_exceeded: true,
          message: ACR_LIMIT_MESSAGE,
        })
      }
    } catch { /* non-blocking — fail open */ }

    // ── Pre-flight forensic rows (one capture + one job per chunk) ───────────
    const { data: capture } = await supabase.from('audio_captures').insert({
      show_id: null, artist_id: null, captured_by: null,
      duration_seconds: 14, file_size_bytes: audioBytes,
      mime_type: 'audio/webm', captured_at: new Date().toISOString(),
    }).select().single()

    const { data: job } = await supabase.from('recognition_jobs').insert({
      audio_capture_id: capture?.id || null, vendor: 'acrcloud', status: 'processing',
      submitted_at: new Date().toISOString(),
      raw_request: { host: HOST, audio_bytes: audioBytes, performance_id: performanceId },
    }).select().single()

    // ── Call ACRCloud (verbatim from api/identify/route.ts) ──────────────────
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

    // ── Read the ACR match + score (humming scores are scaled ×100) ──────────
    const humming     = payload?.metadata?.humming?.[0]
    const music       = payload?.metadata?.music?.[0]
    const acrMatch    = humming || music
    const acrDetected = payload.status?.code === 0 && !!acrMatch
    const source: DetectionSource = humming ? 'humming' : 'fingerprint'

    const rawScore = acrMatch?.score ? parseFloat(acrMatch.score) : 0
    const score    = humming ? rawScore * 100 : rawScore

    const now   = new Date()
    const clock = now.toTimeString().slice(0, 8)

    // ── No ACR match → log a failed detection event and bail ─────────────────
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
      console.log(`${clock} — — — 0 — IGNORE — no_detection (upload)`)
      return NextResponse.json({ detected: false })
    }

    // ── Clean the ACR title (strip "(Live)", "(Remix)", etc.) ────────────────
    const rawTitle        = acrMatch.title
    const title           = cleanTitle(rawTitle)
    const artist          = acrMatch.artists?.[0]?.name || ''
    const isrc             = acrMatch.external_ids?.isrc || ''
    const normalizedTitle = normalizeSongKey(title)

    await supabase.from('recognition_results').insert({
      job_id: job?.id || null, rank: 1, title, artist_name: artist,
      score, raw_data: acrMatch,
    })

    // ── Gather everything the inclusion cascade needs (in parallel) ──────────
    const [plannedTitles, artistCatalogueTitles, inFallback, stats] = await Promise.all([
      getPlannedSetlistTitles(performanceId),
      getArtistCatalogueTitles(userId),
      isInFallbackCatalogue(normalizedTitle, artist),
      getDetectionStats(performanceId, normalizedTitle),
    ])
    const thisDetectionCount = stats.priorDetections + 1

    // ── ALREADY ADDED: an earlier chunk already added this song → never twice ─
    if (stats.alreadyAdded) {
      console.log(`${clock} — ${artist} — ${title} — ${score} — ALREADY ADDED (upload)`)
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
      return NextResponse.json({ detected: false })
    }

    // ── Inclusion cascade (first branch that matches wins) ───────────────────
    let inclusionReason: string | null = null
    let inclusionThreshold = 0
    let inclusionScore = 0

    // Computed once, reused for both the cascade condition below and the
    // observability fields on the response/detection_events row — this does
    // NOT feed ACR, does not affect the fingerprint match itself, and (per
    // the branch order below) can only ever raise inclusionScore for a title
    // ACR already returned some nonzero score for on its own.
    const uploadedSetlistMatch = uploadedSetlistTitles.has(normalizedTitle)

    if (plannedTitles.has(normalizedTitle) && score >= PLANNED_SETLIST_THRESHOLD) {
      inclusionReason    = 'planned setlist - detected'
      inclusionThreshold = PLANNED_SETLIST_THRESHOLD
      inclusionScore     = score
    } else if (uploadedSetlistMatch && score >= UPLOADED_SETLIST_THRESHOLD) {
      inclusionReason    = 'uploaded setlist - detected'
      inclusionThreshold = UPLOADED_SETLIST_THRESHOLD
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
      inclusionScore     = thisDetectionCount
    }

    const added = inclusionReason !== null

    console.log(`${clock} — ${artist} — ${title} — ${score} — ${added ? 'ADD' : 'IGNORE'}${inclusionReason ? ` — ${inclusionReason}` : ''} (upload)`)

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
        // Observability only — did this title appear in the uploaded
        // setlist context, regardless of which branch (if any) fired.
        // Not read by processUploadedFile; exists so we can tell whether
        // the new prior actually influenced a decision.
        uploaded_setlist_match: uploadedSetlistMatch,
      }],
    })

    // ── Not added → return a non-detection so processUploadedFile ignores it ──
    if (!added) {
      return NextResponse.json({ detected: false, uploaded_setlist_match: uploadedSetlistMatch })
    }

    // ── Added → enrich + preserve the existing add-time side effects ─────────
    const enriched = await enrichFromMusicBrainz(title, artist, isrc)

    // No legacy setlist_items mirror — upload never sends setlist_id, and this
    // route doesn't accept it at all. setlist_item_id is always null here.
    const setlistItemId: string | null = null

    // Grow the artist catalogue / memory — always the OWNER's userId.
    if (userId && performanceId) {
      writeToUserSongs(title, artist, userId, performanceId)
    }

    await supabase.from('recognition_logs').insert({
      performance_id: performanceId || null,
      audio_bytes: audioBytes, duration_seconds: durationSeconds,
      acr_status_code: payload.status?.code ?? null,
      detected: true, title, artist,
      isrc: enriched.isrc || null, score,
      source, raw_response: payload,
      user_agent: req.headers.get('user-agent') ?? null,
    })

    // ── Response — trimmed to only the fields processUploadedFile consumes,
    // plus uploaded_setlist_match for observability/testing (unread by the
    // client's own handling, additive only). ─────────────────────────────────
    return NextResponse.json({
      detected: true, title, artist,
      confidence_level: 'auto', source,
      inclusion_reason: inclusionReason,
      threshold: inclusionThreshold,
      score: Math.round(inclusionScore),
      isrc: enriched.isrc, composer: enriched.composer, publisher: enriched.publisher,
      setlist_item_id: setlistItemId,
      uploaded_setlist_match: uploadedSetlistMatch,
    })

  } catch (err: any) {
    console.error('[UploadIdentifyRoute] Error:', err)
    await getSupabase().from('recognition_logs').insert({
      performance_id: performanceId || null, audio_bytes: audioBytes, detected: false,
      acr_message: err.message, raw_response: { error: err.message },
    })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
