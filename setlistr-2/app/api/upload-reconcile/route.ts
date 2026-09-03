import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizeSongKey, cleanTitle } from '@/lib/reconciliation/normalize'

// ─── Upload-only: ORDERED reconciliation ──────────────────────────────────────
// Phase 2 of the split upload pipeline (parallel recognition / ordered
// reconciliation). Takes the raw results /api/upload-recognize produced for
// every chunk of one scan and applies the exact same inclusion-decision
// logic /api/upload-identify has always applied per chunk — same lookups,
// same threshold constants, same detection_events semantics — just moved
// into a single batched, STRICTLY SEQUENTIAL loop instead of one HTTP
// request per chunk.
//
// CRITICAL ORDERING GUARANTEE: detection_events is stateful — getDetectionStats
// reads every detection_events row for this performance to compute
// priorDetections/alreadyAdded (the multiple-detection and repeat-song
// logic). For chunk N, this loop always completes
//   getDetectionStats → inclusion decision → awaited detection_events write
// before starting chunk N+1's iteration. That is enforced structurally, not
// by convention: this is one `for` loop in one function invocation, awaiting
// every step — there is no concurrency here to accidentally reorder. This is
// the one piece of the split architecture that must never be parallelized;
// see the read-only recon this route was built from for why naive
// concurrency here previously broke recall.
//
// Everything below (thresholds, lookup functions, MusicBrainz timeout,
// forensic writes) is a deliberate duplicate of app/api/upload-identify/
// route.ts, not a shared import — that route is left completely untouched
// and still works as the known-good sequential comparison path.
//
// PROGRESSIVE RECONCILIATION: this endpoint is called once per contiguous
// chunk-index prefix as it becomes available (see app/app/upload/new/
// page.tsx's tryAdvanceReconciliation), not just once per whole scan.
// Verified safe for that BEFORE implementing the client side: every lookup
// here (getPlannedSetlistTitles, getArtistCatalogueTitles,
// isInFallbackCatalogue, getDetectionStats) reads by performance_id alone,
// with no notion of "which HTTP call" wrote a given row — so a later batch
// correctly sees every detection_events row an earlier batch persisted,
// exactly like today's per-chunk calls already do. writeToUserSongs is
// additionally guarded by user_song_performances' unique constraint.
//
// What this endpoint is NOT: idempotent against literal re-submission of
// the same chunk range. detection_events.chunk_index (see supabase/
// migrations/0004_upload_chunk_index.sql) is written below for forensic/
// reconciliation-evidence linkage only — nothing here reads it back to
// detect "I already reconciled chunk 7", so that guarantee still lives
// entirely in the client only ever sending a chunk index once, after a
// prior batch covering it has already returned success. A response lost
// after the server-side write already committed (rare) would cause a naive
// retry to double-process that range; the client mitigates this by only
// advancing its "reconciled" cursor on a confirmed successful response, so
// an unresolved batch is retried, but a resolved one never has been.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ─── Inclusion thresholds — must match app/api/upload-identify/route.ts and
// app/api/identify/route.ts exactly. Unchanged in this pass. ─────────────────
const PLANNED_SETLIST_THRESHOLD     = 1
const UPLOADED_SETLIST_THRESHOLD    = 1
const ARTIST_CATALOGUE_THRESHOLD    = 30
const FALLBACK_CATALOGUE_THRESHOLD  = 30
const MULTIPLE_DETECTIONS_THRESHOLD = 2

// Latency bound, NOT a recognition threshold — must match
// app/api/upload-identify/route.ts's MUSICBRAINZ_TIMEOUT_MS exactly.
const MUSICBRAINZ_TIMEOUT_MS = 2500

interface RawRecognitionResult {
  chunk_index: number
  detected: boolean
  rawTitle: string | null
  normalizedTitle: string | null
  artist: string
  score: number
  source: 'fingerprint' | 'humming' | null
  isrc: string
  audioBytes?: number
  rawPayload?: any
}

interface EnrichedSongData { isrc: string; composer: string; publisher: string }

// ─── Planned setlist lookup (verbatim from api/upload-identify/route.ts) ─────
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

// ─── Artist catalogue lookup (verbatim from api/upload-identify/route.ts) ────
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

// ─── Fallback catalogue lookup (verbatim from api/upload-identify/route.ts) ──
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

// ─── Cross-chunk detection state (verbatim from api/upload-identify/route.ts) ─
// The one lookup in this file that is genuinely chunk-order-sensitive — see
// this route's header comment for the ordering guarantee that makes it safe
// to call from inside the sequential loop below.
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

// ─── user_songs write (verbatim from api/upload-identify/route.ts) ───────────
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

// ─── MusicBrainz enrichment (verbatim from api/upload-identify/route.ts) ─────
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

// ─── detection_events write (verbatim from api/upload-identify/route.ts) ─────
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
  const supabase = getSupabase()
  let performanceId: string | null = null

  try {
    const body: any = await req.json()
    performanceId = body.performance_id || null
    const results: RawRecognitionResult[] = Array.isArray(body.results) ? body.results : []
    const uploadedSetlistRaw = body.uploaded_setlist

    if (!performanceId) return NextResponse.json({ error: 'performance_id required' }, { status: 400 })

    // ── Authenticate — identical required-Bearer pattern to /api/upload-identify ──
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: { user }, error: userError } = await anonClient.auth.getUser(authHeader.replace('Bearer ', ''))
    if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const callerId = user.id

    // ── Authorize ONCE for the whole batch — performance_id's owner/
    // delegation status doesn't change mid-scan, so this is equivalent
    // security to re-checking on every chunk, just paid once instead of N
    // times. ────────────────────────────────────────────────────────────────
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

    const userId = ownerId

    // ── Uploaded-setlist context — same parse/threshold semantics as
    // /api/upload-identify, just received once for the whole batch instead
    // of once per chunk (recognition never needed it). ─────────────────────
    let uploadedSetlistTitles = new Set<string>()
    if (Array.isArray(uploadedSetlistRaw)) {
      for (const song of uploadedSetlistRaw.slice(0, 60)) {
        const key = normalizeSongKey(String(song?.title || ''))
        if (key) uploadedSetlistTitles.add(key)
      }
    }

    // Defensive re-sort — the client is required to sort by chunk_index
    // before sending, but correctness here must not depend on trusting
    // that promise; this is a cheap, harmless safety net.
    const ordered = [...results].sort((a, b) => a.chunk_index - b.chunk_index)

    // Fixed values matching what api/upload-identify's forensic writes
    // already resolve to today (upload never sends these fields).
    const artistName: string | null = null
    const venueName: string | null  = null
    const showType                  = 'single'

    const addedSongs: Array<{
      title: string; artist: string | null; isrc: string | null; composer: string | null
      publisher: string | null; source: string; inclusion_reason: string | null
      threshold: number | null; score: number | null
    }> = []
    // Mirrors the old client-tracked previous_songs — rebuilt here since
    // reconciliation now has full visibility into the ordered sequence
    // itself. Purely forensic (detection_events.previous_song), never
    // decision-relevant, same as before.
    const confirmedTitles: string[] = []

    // ── STRICTLY SEQUENTIAL — see header comment. Never parallelize this
    // loop. ──────────────────────────────────────────────────────────────
    for (const raw of ordered) {
      const itemStart = Date.now()
      const now   = new Date()
      const clock = now.toTimeString().slice(0, 8)

      if (!raw?.detected) {
        await logDetectionEvent({
          performance_id: performanceId,
          acr_score: 0, acr_state: 'failed',
          confidence_level: 'no_result', auto_confirmed: false,
          fallback_triggered: false, flip_count: 0,
          artist_name: artistName, venue_name: venueName, show_type: showType,
          audio_duration_seconds: Math.round((Date.now() - itemStart) / 1000),
          detected_at: now.toISOString(),
          chunk_index: raw?.chunk_index ?? null,
        })
        console.log(`${clock} — — — 0 — IGNORE — no_detection (upload-parallel, chunk ${raw?.chunk_index})`)
        continue
      }

      const title           = cleanTitle(raw.rawTitle || '')
      const artist           = raw.artist || ''
      const score             = raw.score
      const isrc               = raw.isrc || ''
      const source             = raw.source
      const normalizedTitle   = raw.normalizedTitle || normalizeSongKey(title)
      const rawTitle           = raw.rawTitle

      // ── Gather everything the inclusion cascade needs (in parallel —
      // these four lookups are read-only reference data with no cross-chunk
      // ordering dependency; only getDetectionStats' RESULT feeds a
      // chronologically-sensitive decision, and it's read here strictly
      // after every earlier chunk's detection_events write completed. ─────
      const [plannedTitles, artistCatalogueTitles, inFallback, stats] = await Promise.all([
        getPlannedSetlistTitles(performanceId),
        getArtistCatalogueTitles(userId),
        isInFallbackCatalogue(normalizedTitle, artist),
        getDetectionStats(performanceId, normalizedTitle),
      ])
      const thisDetectionCount = stats.priorDetections + 1

      // ── ALREADY ADDED: an earlier chunk already added this song → never twice ─
      if (stats.alreadyAdded) {
        console.log(`${clock} — ${artist} — ${title} — ${score} — ALREADY ADDED (upload-parallel)`)
        await logDetectionEvent({
          performance_id: performanceId,
          acr_title: rawTitle, acr_artist: artist, acr_score: score,
          acr_state: 'unstable',
          final_title: title, final_artist: artist, final_source: source,
          confidence_level: 'no_result', auto_confirmed: false,
          fallback_triggered: false, flip_count: 0,
          artist_name: artistName, venue_name: venueName, show_type: showType,
          audio_duration_seconds: Math.round((Date.now() - itemStart) / 1000),
          previous_song: confirmedTitles[confirmedTitles.length - 1] || null,
          detected_at: now.toISOString(),
          candidate_pool: [{ title, artist, source, score, status: 'already_added' }],
          chunk_index: raw.chunk_index,
        })
        continue
      }

      // ── Inclusion cascade (first branch that matches wins) — order and
      // thresholds unchanged. ─────────────────────────────────────────────
      let inclusionReason: string | null = null
      let inclusionThreshold = 0
      let inclusionScore = 0

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

      console.log(`${clock} — ${artist} — ${title} — ${score} — ${added ? 'ADD' : 'IGNORE'}${inclusionReason ? ` — ${inclusionReason}` : ''} (upload-parallel)`)

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
        audio_duration_seconds: Math.round((Date.now() - itemStart) / 1000),
        previous_song: confirmedTitles[confirmedTitles.length - 1] || null,
        detected_at: now.toISOString(),
        candidate_pool: [{
          title, artist, source, score,
          inclusion_reason: inclusionReason, threshold: inclusionThreshold,
          detections: thisDetectionCount,
          uploaded_setlist_match: uploadedSetlistMatch,
        }],
        chunk_index: raw.chunk_index,
      })

      if (!added) continue

      // ── Added → enrich + preserve the existing add-time side effects ─────
      // Same timeout bound as /api/upload-identify — happy path identical,
      // only worst-case tail latency bounded.
      const enriched = await Promise.race([
        enrichFromMusicBrainz(title, artist, isrc),
        new Promise<EnrichedSongData>(resolve =>
          setTimeout(() => resolve({ isrc: isrc || '', composer: '', publisher: '' }), MUSICBRAINZ_TIMEOUT_MS)
        ),
      ])

      // Grow the artist catalogue / memory — always the OWNER's userId.
      // Fire-and-forget, matching the pre-existing (pre-speed-pass)
      // behavior in /api/upload-identify.
      if (userId && performanceId) {
        writeToUserSongs(title, artist, userId, performanceId)
      }

      await supabase.from('recognition_logs').insert({
        performance_id: performanceId,
        audio_bytes: raw.audioBytes || 0,
        duration_seconds: Math.round((Date.now() - itemStart) / 1000),
        acr_status_code: raw.rawPayload?.status?.code ?? null,
        detected: true, title, artist,
        isrc: enriched.isrc || null, score,
        source, raw_response: raw.rawPayload ?? null,
        user_agent: req.headers.get('user-agent') ?? null,
      })

      confirmedTitles.push(title)
      addedSongs.push({
        title,
        artist: artist || null,
        isrc: enriched.isrc || null,
        composer: enriched.composer || null,
        publisher: enriched.publisher || null,
        source: source || 'recognized',
        inclusion_reason: inclusionReason,
        threshold: inclusionThreshold,
        score: Math.round(inclusionScore),
      })
    }

    return NextResponse.json({ songs: addedSongs, processed: ordered.length })
  } catch (err: any) {
    console.error('[UploadReconcileRoute] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
