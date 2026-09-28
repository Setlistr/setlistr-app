import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { ACR_DAILY_CALL_LIMIT, ACR_LIMIT_MESSAGE } from '@/lib/acr-limits'
import { normalizeSongKey } from '@/lib/reconciliation/normalize'
import { isWriteCapableRole } from '@/lib/writeCapableRoles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HOST = 'identify-us-west-2.acrcloud.com'
// ACR_ACCESS_KEY / ACR_ACCESS_SECRET — server-only env vars (no
// NEXT_PUBLIC_ prefix: these must never reach the browser bundle), read
// and validated per-request in POST() below, with no hardcoded fallback.
// See that guard for why the check lives there rather than here.

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
//   planned setlist - detected — song is on this show's planned setlist and detected
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
  // Missing configuration returns a controlled error immediately — before
  // formData parsing, auth, quota consumption, or any provider call. The
  // actual values are never logged, only their presence is checked.
  const ACR_ACCESS_KEY    = process.env.ACR_ACCESS_KEY
  const ACR_ACCESS_SECRET = process.env.ACR_ACCESS_SECRET
  if (!ACR_ACCESS_KEY || !ACR_ACCESS_SECRET) {
    console.error('[IdentifyRoute] ACR_ACCESS_KEY/ACR_ACCESS_SECRET are not configured.')
    return NextResponse.json({ error: 'Recognition service is not configured' }, { status: 500 })
  }

  const supabase  = getSupabase()
  const startTime = Date.now()
  let audioBytes  = 0
  let performanceId: string | null = null
  // Gates the catch-all's recognition_logs insert below. Only flips true
  // once the caller is authenticated, authorized (owner or a write-
  // capable, accepted, non-revoked delegate) for the STORED performance,
  // AND any supplied setlist_id has been validated against it — i.e.
  // only once a request has actually earned the right to have its
  // failure logged against real forensic tables. An error that occurs
  // before that point (malformed input, a bad/missing token, an
  // unauthorized target) must never cause a database write; logging it
  // would itself be an unauthorized write triggered by an unauthenticated
  // or unauthorized caller.
  let authorizationComplete = false

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

    // Malformed input is rejected immediately — 400, no database write —
    // regardless of authentication state. This must never reach the
    // catch-all below: parsing a client-supplied field is not itself an
    // authorized operation, and previously this fell through to the
    // generic error handler, which unconditionally inserted a
    // recognition_logs row even for a caller who was never authenticated.
    let previousSongs: string[] = []
    if (prevRaw) {
      try {
        previousSongs = JSON.parse(prevRaw)
      } catch {
        return NextResponse.json({ error: 'Malformed previous_songs' }, { status: 400 })
      }
    }

    if (!(audio instanceof File)) return NextResponse.json({ error: 'No audio file' }, { status: 400 })

    const audioBuffer = Buffer.from(await audio.arrayBuffer())
    audioBytes        = audioBuffer.length

    // ── Authenticate the caller — mandatory, no performance-owner fallback ────
    // Caller identity is NEVER derived from the target performance's own
    // owner column — the previous fallback made "sent no credentials"
    // indistinguishable from "I am the owner," which is exactly backwards.
    // Both web callers (app/app/live/[id]/page.tsx, app/app/show/upload/
    // page.tsx) now send a real Supabase access token — see those files for
    // the matching client-side change. There is no separate native caller:
    // Capacitor loads this same web app in a WebView (capacitor.config.ts),
    // so both platforms share this one authenticated code path.
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: { user }, error: userError } = await anonClient.auth.getUser(authHeader.replace('Bearer ', ''))
    if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const callerId = user.id

    // ── Authorize: resolve the performance's OWNER from the stored row
    // (never from the request), then require the caller BE that owner, or
    // hold a currently accepted, non-revoked, write-capable-role delegation
    // for them. Nonexistent and unauthorized performances answer identically
    // (403) so a caller can't distinguish "doesn't exist" from "not yours"
    // by probing ids — same pattern as app/api/upload-identify/route.ts.
    const { data: perfRow, error: perfError } = await supabase
      .from('performances')
      .select('user_id, show_id, setlist_id, artist_id')
      .eq('id', performanceId)
      .single()
    if (perfError || !perfRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const ownerId = perfRow.user_id

    let authorized = callerId === ownerId
    if (!authorized) {
      const { data: delegation, error: delegationError } = await supabase
        .from('artist_delegates')
        .select('role')
        .eq('artist_id', ownerId)
        .eq('delegate_id', callerId)
        .not('accepted_at', 'is', null)
        .is('revoked_at', null)
        .maybeSingle()
      if (delegationError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      authorized = isWriteCapableRole(delegation?.role)
    }
    if (!authorized) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Recognition/catalogue identity: this is a DELIBERATE CHANGE, not a
    // preserved behavior. The previous code used the real caller's own id
    // whenever an Authorization header was present, and only fell back to
    // the performance's owner when no header was sent. Neither confirmed
    // live caller (app/app/live/[id]/page.tsx, app/app/show/upload/
    // page.tsx) has ever sent that header, so the owner-fallback branch was
    // the only one ever exercised in practice — but the header-present
    // branch's caller-attributed behavior was real, reachable code, not
    // dead code, and this change removes it unconditionally. The route now
    // always attributes catalogue growth and quota consumption to the
    // performance OWNER, matching app/api/upload-identify/route.ts's own
    // explicit, already-reviewed design choice ("the artist's own
    // catalogue/memory is meant to grow regardless of who's running the
    // scan") — intentionally aligning the two routes, not a no-op.
    const userId: string | null = ownerId

    // A supplied setlist_id is VALIDATED against the authorized, stored
    // performance record — before quota consumption, the paid ACRCloud
    // call, or any write — rather than rejected outright or silently
    // trusted. Matching show_id alone would be insufficient: setlists
    // carries its own artist_id and supports multiple artists per show,
    // so show_id agreement alone can't prove the setlist actually belongs
    // to this performance's artist — performances.artist_id (a real,
    // live column, confirmed via information_schema.columns and via a
    // live join against setlists.artist_id: 5 matches, 0 mismatches, 0
    // missing ids) is what closes that gap. Any failure below (id
    // mismatch, a missing setlist row, a lookup error, or a missing
    // required id on the performance itself) denies the whole request
    // outright — never a silent skip of the mirror write further down. A
    // request with no setlist_id at all is unaffected and proceeds
    // exactly as before.
    let verifiedSetlistId: string | null = null
    if (setlistId) {
      // The supplied id must equal the performance's OWN stored
      // setlist_id — a caller can't attach an arbitrary (even otherwise
      // valid) setlist just because that setlist independently checks out.
      if (!perfRow.setlist_id || setlistId !== perfRow.setlist_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      // Both sides of the relationship must be present on the performance
      // to verify against — a missing show_id or artist_id on the
      // performance means there's nothing authoritative to check the
      // setlist against, so this denies rather than assumes a match.
      if (!perfRow.show_id || !perfRow.artist_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const { data: setlistRow, error: setlistError } = await supabase
        .from('setlists')
        .select('show_id, artist_id')
        .eq('id', perfRow.setlist_id)
        .single()
      if (setlistError || !setlistRow) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      if (setlistRow.show_id !== perfRow.show_id || setlistRow.artist_id !== perfRow.artist_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      verifiedSetlistId = perfRow.setlist_id
    }

    // Caller is authenticated, authorized for this stored performance, and
    // any supplied setlist_id has been validated — every check that could
    // legitimately deny the request has now passed. From here on, a
    // failure is a real operational error against an authorized request,
    // which IS worth logging.
    authorizationComplete = true

    // ── Daily ACR quota ───────────────────────────────────────────────────────
    // Sits after the user is resolved and before BOTH the forensic rows and the
    // paid ACRCloud call, so a refused request costs one indexed UPDATE and
    // nothing else — no audio_captures row, no recognition_jobs row, no spend.
    //
    // Detection logic below is untouched: this either returns early or falls
    // through to exactly the previous behaviour.
    //
    // userId is always resolved here now (auth is mandatory, enforced above),
    // so this gate always runs — unlike before, when an unattributable caller
    // (no userId) skipped it entirely (the "open door" previously documented
    // in docs/api-auth-audit.md; that door is closed by the authorization
    // block above, not by this gate). Still fails open on an RPC error only —
    // a quota bug must never be the reason a real show fails to capture.
    if (userId) {
      try {
        const { data: quota, error: quotaError } = await supabase
          .rpc('increment_acr_usage', { p_user_id: userId, p_limit: ACR_DAILY_CALL_LIMIT })
          .single<{ allowed: boolean; calls_today: number; calls_lifetime: number }>()
        if (!quotaError && quota && quota.allowed === false) {
          // 200, not 429: the client treats this as a normal "nothing detected"
          // answer plus a flag, which keeps it out of the capture-health error
          // paths. Capture stays alive; only the paid calls stop.
          return NextResponse.json({
            detected: false,
            quota_exceeded: true,
            message: ACR_LIMIT_MESSAGE,
          })
        }
      } catch { /* non-blocking — fail open */ }
    }

    // ── Pre-flight forensic rows (one capture + one job per chunk) ─────────────
    // show_id AND artist_id are both derived from the AUTHORIZED, STORED
    // perfRow — never from the client-supplied showId/artistId form fields.
    // The authorization block above only ever verified performance_id
    // ownership/delegation, never that a separately-supplied show_id or
    // artist_id actually belongs to this performance, so an unverified
    // client value has no business landing in a forensic write regardless
    // of how low-stakes that write looks. perfRow.artist_id is a real,
    // live, verified column (see the setlist_id validation block above)
    // — using it here attributes the capture to a value this route reads
    // directly from the authorized performance row, not to the caller's
    // own user id and not to anything the request itself supplied. It is
    // null whenever the performance's own stored artist_id is null,
    // which is the common case today (only 5 of 482 non-deleted
    // performances have it set live) — this is a faithful reflection of
    // the authorized record, not a new gap. The raw showId/artistId form
    // fields are still parsed above but deliberately unused here.
    const { data: capture } = await supabase.from('audio_captures').insert({
      show_id: perfRow.show_id, artist_id: perfRow.artist_id, captured_by: null,
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
    const stringToSign = ['POST', '/v1/identify', ACR_ACCESS_KEY, 'audio', '1', timestamp].join('\n')
    const signature    = crypto.createHmac('sha1', ACR_ACCESS_SECRET).update(stringToSign).digest('base64')

    const acrForm = new FormData()
    acrForm.append('access_key', ACR_ACCESS_KEY)
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
      inclusionReason    = 'planned setlist - detected'
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
    // Only reachable with a value when the authorization block above
    // independently verified the supplied setlist_id against the stored
    // performance -> setlist relationship (matching id, show_id, AND
    // artist_id) — see that block for the checks performed. A request
    // with no setlist_id, or one that failed that verification (which
    // denies the whole request before reaching here), never sets this.
    let setlistItemId: string | null = null
    if (verifiedSetlistId) {
      const { data: existing } = await supabase.from('setlist_items').select('id')
        .eq('setlist_id', verifiedSetlistId).ilike('title', title).single()
      if (!existing) {
        const { data: lastItem } = await supabase.from('setlist_items').select('position')
          .eq('setlist_id', verifiedSetlistId).order('position', { ascending: false }).limit(1).single()
        const { data: newItem } = await supabase.from('setlist_items').insert({
          setlist_id: verifiedSetlistId, title, artist_name: artist,
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
    // Only write recognition_logs once authorization + target validation
    // actually completed (see authorizationComplete above) — an error
    // before that point (malformed input, missing/invalid credentials, an
    // unauthorized target) must never cause a database write.
    if (authorizationComplete) {
      await getSupabase().from('recognition_logs').insert({
        performance_id: performanceId || null, audio_bytes: audioBytes, detected: false,
        acr_message: err.message, raw_response: { error: err.message },
      })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
