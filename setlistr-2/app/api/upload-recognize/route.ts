import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { ACR_DAILY_CALL_LIMIT, ACR_LIMIT_MESSAGE } from '@/lib/acr-limits'
import { normalizeSongKey, cleanTitle } from '@/lib/reconciliation/normalize'

// ─── Upload-only: PARALLEL raw recognition ────────────────────────────────────
// Phase 1 of the split upload pipeline (parallel recognition / ordered
// reconciliation). Handles exactly ONE audio chunk: auth, authorize, ACR
// quota, the ACR fingerprint call itself, and the three recognition-phase
// forensic tables (audio_captures, recognition_jobs, recognition_results).
//
// This route NEVER reads or writes detection_events, never runs the
// inclusion cascade, never writes recognition_logs/user_songs, never calls
// MusicBrainz, and makes no performed/not-performed decision — all of that
// is /api/upload-reconcile's job, which must run in strict chunk_index
// order because detection_events is stateful across chunks (see that
// route's own header comment). This route is safe to call with bounded
// client-side concurrency specifically because it touches nothing
// chunk-order-sensitive — traced operation-by-operation before this file
// was written, not assumed.
//
// /api/upload-identify (the original fused sequential route) is left
// completely untouched and still works — it's the known-good comparison
// path until this split architecture is validated. Nothing here imports
// from or modifies it.
//
// Auth/authorize/quota below are copied verbatim from /api/upload-identify,
// not "improved" — this is intentionally still a duplicate, same reasoning
// that route itself gives for duplicating app/api/identify/route.ts's logic.

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

type DetectionSource = 'fingerprint' | 'humming'

export async function POST(req: NextRequest) {
  const supabase = getSupabase()
  let audioBytes = 0
  let performanceId: string | null = null
  let chunkIndex: number | null = null

  try {
    const incoming       = await req.formData()
    const audio          = incoming.get('audio')
    performanceId        = incoming.get('performance_id') as string | null
    const chunkIndexRaw   = incoming.get('chunk_index') as string | null
    const parsedIndex     = chunkIndexRaw !== null ? parseInt(chunkIndexRaw, 10) : NaN
    chunkIndex            = Number.isFinite(parsedIndex) ? parsedIndex : null

    // Deliberately does NOT accept uploaded_setlist or previous_songs —
    // recognition never needs either; both are reconciliation-only inputs.
    if (!(audio instanceof File)) return NextResponse.json({ error: 'No audio file' }, { status: 400 })
    if (!performanceId) return NextResponse.json({ error: 'performance_id required' }, { status: 400 })
    if (chunkIndex === null || chunkIndex < 0) {
      return NextResponse.json({ error: 'chunk_index required' }, { status: 400 })
    }

    const audioBuffer = Buffer.from(await audio.arrayBuffer())
    audioBytes         = audioBuffer.length

    // ── Authenticate — identical required-Bearer pattern to /api/upload-identify ──
    const authHeader = req.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized', chunk_index: chunkIndex }, { status: 401 })

    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: { user }, error: userError } = await anonClient.auth.getUser(authHeader.replace('Bearer ', ''))
    if (userError || !user) return NextResponse.json({ error: 'Unauthorized', chunk_index: chunkIndex }, { status: 401 })
    const callerId = user.id

    // ── Authorize — identical owner/delegate pattern to /api/upload-identify ──────
    // Nonexistent and unauthorized performances are treated identically
    // (403) so a caller can't distinguish "doesn't exist" from "not yours".
    const { data: perfRow } = await supabase
      .from('performances')
      .select('user_id')
      .eq('id', performanceId)
      .single()

    if (!perfRow) return NextResponse.json({ error: 'Forbidden', chunk_index: chunkIndex }, { status: 403 })
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
    if (!authorized) return NextResponse.json({ error: 'Forbidden', chunk_index: chunkIndex }, { status: 403 })

    const userId = ownerId

    // ── Daily ACR quota — identical atomic RPC/limit to /api/upload-identify ──────
    // increment_acr_usage is a single atomic UPDATE (see
    // supabase/migrations/0003_acr_call_limits.sql) — Postgres row locking
    // serializes concurrent calls for the same user, so calling this from
    // several concurrent recognition requests is race-safe by construction,
    // not by assumption. Quota rules/limit themselves are unchanged.
    try {
      const { data: quota, error: quotaError } = await supabase
        .rpc('increment_acr_usage', { p_user_id: userId, p_limit: ACR_DAILY_CALL_LIMIT })
        .single<{ allowed: boolean; calls_today: number; calls_lifetime: number }>()
      if (!quotaError && quota && quota.allowed === false) {
        return NextResponse.json({ chunk_index: chunkIndex, quota_exceeded: true, message: ACR_LIMIT_MESSAGE })
      }
    } catch { /* non-blocking — fail open, identical to /api/upload-identify */ }

    // ── Call ACRCloud — verbatim HMAC signing from /api/upload-identify ───────────
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

    // Forensic pre-writes run concurrently with the ACR call itself — same
    // proven-safe overlap /api/upload-identify's own speed pass established.
    // Both fully awaited before anything else happens.
    const [job, payload] = await Promise.all([
      (async () => {
        const { data: capture } = await supabase.from('audio_captures').insert({
          show_id: null, artist_id: null, captured_by: null,
          duration_seconds: 14, file_size_bytes: audioBytes,
          mime_type: 'audio/webm', captured_at: new Date().toISOString(),
        }).select().single()
        const { data: job } = await supabase.from('recognition_jobs').insert({
          audio_capture_id: capture?.id || null, vendor: 'acrcloud', status: 'processing',
          submitted_at: new Date().toISOString(),
          raw_request: { host: HOST, audio_bytes: audioBytes, performance_id: performanceId, chunk_index: chunkIndex },
        }).select().single()
        return job
      })(),
      fetch(`https://${HOST}/v1/identify`, { method: 'POST', body: acrForm }).then(r => r.json()),
    ])

    if (job) await supabase.from('recognition_jobs').update({
      status: 'completed', completed_at: new Date().toISOString(), raw_response: payload,
    }).eq('id', job.id)

    // ── Read the ACR match + score — verbatim scaling from /api/upload-identify ───
    const humming     = payload?.metadata?.humming?.[0]
    const music       = payload?.metadata?.music?.[0]
    const acrMatch    = humming || music
    const acrDetected = payload.status?.code === 0 && !!acrMatch
    const source: DetectionSource | null = acrDetected ? (humming ? 'humming' : 'fingerprint') : null

    const rawScore = acrMatch?.score ? parseFloat(acrMatch.score) : 0
    const score    = humming ? rawScore * 100 : rawScore

    if (!acrDetected) {
      // No cascade, no detection_events — reconciliation writes the
      // "failed" detection_events row for this chunk_index itself, so the
      // no-match branch stays part of the ordered, stateful phase.
      return NextResponse.json({
        chunk_index: chunkIndex,
        detected: false,
        rawTitle: null, normalizedTitle: null, artist: '', score: 0, source: null, isrc: '',
        audioBytes, rawPayload: payload,
      })
    }

    const rawTitle       = acrMatch.title
    const title           = cleanTitle(rawTitle)
    const artist          = acrMatch.artists?.[0]?.name || ''
    const isrc             = acrMatch.external_ids?.isrc || ''
    const normalizedTitle = normalizeSongKey(title)

    // Recognition-phase forensic write — not decision-dependent, never read
    // by reconciliation, safe to own entirely here.
    await supabase.from('recognition_results').insert({
      job_id: job?.id || null, rank: 1, title, artist_name: artist,
      score, raw_data: acrMatch,
    })

    return NextResponse.json({
      chunk_index: chunkIndex,
      detected: true,
      rawTitle,
      normalizedTitle,
      artist,
      score,
      source,
      isrc,
      audioBytes,
      rawPayload: payload,
    })
  } catch (err: any) {
    console.error('[UploadRecognizeRoute] Error:', err)
    return NextResponse.json({ error: err.message, chunk_index: chunkIndex }, { status: 500 })
  }
}
