import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HOST          = 'identify-us-west-2.acrcloud.com'
const ACCESS_KEY    = '81af58b16d932703e6a233f054666f3b'
const ACCESS_SECRET = 'vNLUzrw4OOaiKiaw4FTdPQlqTNTGj3VbCNmotS22'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── Thresholds ───────────────────────────────────────────────────────────────
const ACR_STRONG       = 80   // score >= 80 → strong match, run sanity check
const ACR_SUGGEST      = 40   // score 40-79 → suggest (show pending card)
                               // score < 40  → no_result (too weak, drop)
const FLAP_MIN_COUNT   = 2

// ─── Canonical artist map (sanity check only — failure = suggest, not drop) ──
const CANONICAL_SONG_ARTISTS: Record<string, string[]> = {
  'carrying your love with me': ['george strait'],
  'check yes or no': ['george strait'],
  'tennessee whiskey': ['chris stapleton', 'david allan coe'],
  'friends in low places': ['garth brooks'],
  'i will always love you': ['dolly parton', 'whitney houston'],
  'drift away': ['dobie gray', 'uncle kracker'],
  'fast car': ['tracy chapman', 'luke combs'],
  'jolene': ['dolly parton'],
  'wagon wheel': ['old crow medicine show', 'darius rucker'],
  'take me home country roads': ['john denver'],
  'sweet home alabama': ['lynyrd skynyrd'],
  'brown eyed girl': ['van morrison'],
  'wonderwall': ['oasis'],
  'hotel california': ['eagles'],
  'piano man': ['billy joel'],
  'redemption song': ['bob marley'],
  'hallelujah': ['leonard cohen', 'jeff buckley'],
  'blackbird': ['beatles', 'the beatles'],
  'landslide': ['fleetwood mac', 'stevie nicks'],
  'ring of fire': ['johnny cash'],
  'folsom prison blues': ['johnny cash'],
  'hurt': ['nine inch nails', 'johnny cash'],
}

type ConfidenceLevel = 'auto' | 'suggest' | 'no_result'
type DetectionSource = 'fingerprint' | 'humming' | 'transcript' | 'combined' | 'manual' | 'cloned'

interface CandidateHistoryEntry {
  title: string; artist: string; score: number; timestamp: number
}
interface EnrichedSongData { isrc: string; composer: string; publisher: string }

function normalizeSongKey(title: string): string {
  return title.toLowerCase().trim()
    .replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '')
    .replace(/[-–—]/g, ' ').replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ').trim()
}

function countCandidateFlips(history: CandidateHistoryEntry[]): number {
  if (history.length < 2) return 0
  let flips = 0
  for (let i = 1; i < history.length; i++) {
    if (normalizeSongKey(history[i].title) !== normalizeSongKey(history[i - 1].title)) flips++
  }
  return flips
}

// Sanity check — failure means SUGGEST, never drop
function sanityCheck(title: string, artist: string, previousSongs: string[]): { pass: boolean; reason: string } {
  const normalizedTitle  = normalizeSongKey(title)
  const normalizedArtist = artist.toLowerCase().trim()

  // Duplicate check
  if (previousSongs.some(s => normalizeSongKey(s) === normalizedTitle)) {
    return { pass: false, reason: `duplicate: already in setlist` }
  }

  // Canonical artist check
  const canonicalArtists = CANONICAL_SONG_ARTISTS[normalizedTitle]
  if (canonicalArtists && canonicalArtists.length > 0) {
    const isCanonical = canonicalArtists.some(ca =>
      normalizedArtist.includes(ca) || ca.includes(normalizedArtist.split(' ')[0])
    )
    if (!isCanonical) {
      return { pass: false, reason: `wrong_artist: expected one of [${canonicalArtists.join(', ')}], got ${artist}` }
    }
  }

  return { pass: true, reason: 'ok' }
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
    await supabase.from('detection_events').insert(event)
    // Always log to console for debugging
    console.log('[Detection]', JSON.stringify({
      title: event.final_title,
      score: event.acr_score,
      final_state: event.final_state,
      sanity_passed: event.sanity_passed,
      failure_reason: event.failure_reason,
      source: event.final_source,
    }))
  } catch (err) { console.error('[DetectionEvent] log failed:', err) }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  let audioBytes  = 0
  let performanceId: string | null = null

  try {
    const incoming     = await req.formData()
    const audio        = incoming.get('audio')
    performanceId      = incoming.get('performance_id') as string | null
    const showId       = incoming.get('show_id') as string | null
    const setlistId    = incoming.get('setlist_id') as string | null
    const artistId     = incoming.get('artist_id') as string | null
    const artistName   = incoming.get('artist_name') as string | null
    const showType     = (incoming.get('show_type') as string | null) || 'single'
    const prevRaw      = incoming.get('previous_songs') as string | null
    const historyRaw   = incoming.get('candidate_history') as string | null
    const previousSongs: string[]                   = prevRaw    ? JSON.parse(prevRaw)    : []
    const candidateHistory: CandidateHistoryEntry[] = historyRaw ? JSON.parse(historyRaw) : []

    if (!(audio instanceof File)) return NextResponse.json({ error: 'No audio file' }, { status: 400 })

    const mimeType    = audio.type || 'audio/webm'
    const audioBuffer = Buffer.from(await audio.arrayBuffer())
    audioBytes        = audioBuffer.length

    // Store capture + job
    const { data: capture } = await supabase.from('audio_captures').insert({
      show_id: showId, artist_id: artistId, captured_by: null,
      duration_seconds: 12, file_size_bytes: audioBytes,
      mime_type: 'audio/webm', captured_at: new Date().toISOString(),
    }).select().single()

    const { data: job } = await supabase.from('recognition_jobs').insert({
      audio_capture_id: capture?.id || null, vendor: 'acrcloud', status: 'processing',
      submitted_at: new Date().toISOString(),
      raw_request: { host: HOST, audio_bytes: audioBytes, performance_id: performanceId },
    }).select().single()

    // Call ACRCloud
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

    // Parse ACR result
    const humming     = payload?.metadata?.humming?.[0]
    const music       = payload?.metadata?.music?.[0]
    const acrMatch    = humming || music
    const acrScore    = acrMatch?.score ? parseFloat(acrMatch.score) : 0
    const acrDetected = payload.status?.code === 0 && !!acrMatch
    const source: DetectionSource = humming ? 'humming' : 'fingerprint'

    // Humming boost — melody matching is reliable for acoustic
    const effectiveScore = humming ? Math.max(acrScore, 85) : acrScore

    console.log(`[ACR] detected=${acrDetected} score=${acrScore} effectiveScore=${effectiveScore} humming=${!!humming} title="${acrMatch?.title}"`)

    // ── NO DETECTION ──────────────────────────────────────────────────────────
    if (!acrDetected) {
      await logDetectionEvent({
        performance_id: performanceId, acr_score: 0, final_state: 'no_result',
        sanity_passed: false, failure_reason: 'acr_no_match',
        artist_name: artistName, show_type: showType,
      })
      return NextResponse.json({ detected: false, job_id: job?.id })
    }

    const title  = acrMatch.title
    const artist = acrMatch.artists?.[0]?.name || ''
    const isrc   = acrMatch.external_ids?.isrc || ''

    // Store result
    await supabase.from('recognition_results').insert({
      job_id: job?.id || null, rank: 1, title, artist_name: artist, score: acrScore,
      raw_data: acrMatch,
    })

    const flipCount = countCandidateFlips(candidateHistory)

    // ─── DECISION LOGIC ───────────────────────────────────────────────────────
    // Rule: NOTHING is silently dropped. Every detection surfaces.
    //
    // score >= ACR_STRONG (80): run sanity check
    //   → pass: auto_confirm
    //   → fail: suggest (NOT dropped)
    //
    // score >= ACR_SUGGEST (40): suggest
    //
    // score < ACR_SUGGEST (40): no_result (too weak to be useful)
    // ─────────────────────────────────────────────────────────────────────────

    let confidenceLevel: ConfidenceLevel
    let sanityPassed = true
    let failureReason = ''

    if (effectiveScore >= ACR_STRONG && flipCount < FLAP_MIN_COUNT) {
      // Strong match — run sanity check, but failure = suggest not drop
      const sanity = sanityCheck(title, artist, previousSongs)
      sanityPassed  = sanity.pass
      failureReason = sanity.reason

      if (sanity.pass) {
        confidenceLevel = 'auto'
      } else if (sanity.reason.startsWith('duplicate')) {
        // Duplicate — genuinely no_result
        confidenceLevel = 'no_result'
      } else {
        // Wrong artist / other sanity fail → suggest so user can confirm
        confidenceLevel = 'suggest'
      }
    } else if (effectiveScore >= ACR_SUGGEST) {
      confidenceLevel = 'suggest'
      sanityPassed    = false
      failureReason   = `score_below_strong: ${effectiveScore}`
    } else {
      // Too weak — drop
      confidenceLevel = 'no_result'
      sanityPassed    = false
      failureReason   = `score_too_low: ${effectiveScore}`
    }

    console.log(`[Decision] title="${title}" score=${effectiveScore} confidence=${confidenceLevel} sanity=${sanityPassed} reason="${failureReason}"`)

    await logDetectionEvent({
      performance_id: performanceId,
      acr_title: title, acr_artist: artist, acr_score: acrScore,
      final_title: title, final_artist: artist, final_source: source,
      confidence_level: confidenceLevel,
      final_state: confidenceLevel,
      sanity_passed: sanityPassed,
      failure_reason: failureReason,
      flip_count: flipCount,
      auto_confirmed: confidenceLevel === 'auto',
      artist_name: artistName, show_type: showType,
    })

    // ── NO RESULT ─────────────────────────────────────────────────────────────
    if (confidenceLevel === 'no_result') {
      return NextResponse.json({ detected: false, job_id: job?.id, debug: { score: effectiveScore, reason: failureReason } })
    }

    // ── ENRICH (auto only — don't slow down suggest with MB lookup) ───────────
    let enriched: EnrichedSongData = { isrc, composer: '', publisher: '' }
    if (confidenceLevel === 'auto') {
      enriched = await enrichFromMusicBrainz(title, artist, isrc)
    }

    // ── WRITE SETLIST ITEM (auto only) ────────────────────────────────────────
    let setlistItemId: string | null = null
    if (confidenceLevel === 'auto' && setlistId) {
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

    // ── LOG ───────────────────────────────────────────────────────────────────
    await supabase.from('recognition_logs').insert({
      performance_id: performanceId || null,
      audio_bytes: audioBytes, duration_seconds: durationSeconds,
      acr_status_code: payload.status?.code ?? null,
      detected: true, title, artist,
      isrc: enriched.isrc || null, score: acrScore,
      source, raw_response: payload,
      user_agent: req.headers.get('user-agent') ?? null,
    })

    // ── RESPONSE ──────────────────────────────────────────────────────────────
    return NextResponse.json({
      detected: true,
      title,
      artist,
      confidence_level: confidenceLevel,
      source,
      acr_score: acrScore,
      isrc: enriched.isrc,
      composer: enriched.composer,
      publisher: enriched.publisher,
      setlist_item_id: setlistItemId,
      job_id: job?.id,
      // Debug info always included
      debug: {
        effective_score: effectiveScore,
        sanity_passed: sanityPassed,
        failure_reason: failureReason,
        final_state: confidenceLevel,
      }
    })

  } catch (err: any) {
    console.error('[IdentifyRoute] Error:', err)
    await supabase.from('recognition_logs').insert({
      performance_id: performanceId || null,
      audio_bytes: audioBytes, detected: false,
      acr_message: err.message, raw_response: { error: err.message },
    })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
