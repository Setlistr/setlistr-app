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

// ─── Thresholds ───────────────────────────────────────────────────────────────
const ACR_STRONG     = 80
const ACR_SUGGEST    = 55  // raised from 40 — prevents low-confidence wrong detections
const FLAP_MIN_COUNT = 3  // raised from 2 — live shows have natural candidate noise between songs

// ─── Canonical artist map ─────────────────────────────────────────────────────
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

// ─── Title normalization ──────────────────────────────────────────────────────
// Strip common version suffixes ACRCloud adds that pollute song titles.
// Applied before writing to performance_songs AND before displaying to users.
const VERSION_SUFFIX_RE = /\s*[\(\[](alternate|alternative|live|edit|radio edit|radio|album version|acoustic|acoustic version|remaster|remastered|instrumental|original mix|original|extended|extended mix|deluxe|explicit|clean|single|mono|stereo|demo|bonus track|remix|mixed|mix|re-mix|part \d+|teil \d+|vol\.?\s*\d+|version|ver\.?)[^\)\]]*[\)\]]/gi

function cleanTitle(raw: string): string {
  return raw.replace(VERSION_SUFFIX_RE, '').replace(/\s+/g, ' ').trim()
}

function normalizeSongKey(title: string): string {
  return title.toLowerCase().trim()
    .replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '')
    .replace(/[-–—]/g, ' ').replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ').trim()
}

type ConfidenceLevel = 'auto' | 'suggest' | 'no_result'
type DetectionSource = 'fingerprint' | 'humming'

interface CandidateHistoryEntry {
  title: string; artist: string; score: number; timestamp: number
}
interface EnrichedSongData { isrc: string; composer: string; publisher: string }

// ─── Memory bias check ────────────────────────────────────────────────────────
async function checkMemoryBias(
  title: string,
  userId: string | null
): Promise<{ biased: boolean; confirmedCount: number }> {
  if (!userId) return { biased: false, confirmedCount: 0 }
  try {
    const supabase = getSupabase()
    const normalizedTitle = normalizeSongKey(title)
    if (!normalizedTitle || normalizedTitle.length < 3) return { biased: false, confirmedCount: 0 }

    const { data } = await supabase
      .from('user_songs')
      .select('song_title, confirmed_count')
      .eq('user_id', userId)
      .gte('confirmed_count', 2)
      .limit(100)

    if (!data || data.length === 0) return { biased: false, confirmedCount: 0 }

    for (const row of data) {
      const rowKey = normalizeSongKey(row.song_title)
      if (!rowKey) continue
      if (rowKey === normalizedTitle) {
        return { biased: true, confirmedCount: row.confirmed_count }
      }
      const titleWords = normalizedTitle.split(' ').length
      const rowWords   = rowKey.split(' ').length
      if (titleWords >= 4 && rowWords >= 4) {
        if (normalizedTitle.includes(rowKey) || rowKey.includes(normalizedTitle)) {
          return { biased: true, confirmedCount: row.confirmed_count }
        }
      }
    }
    return { biased: false, confirmedCount: 0 }
  } catch (err) {
    console.error('[MemoryBias] check failed (non-blocking):', err)
    return { biased: false, confirmedCount: 0 }
  }
}

function countCandidateFlips(history: CandidateHistoryEntry[]): number {
  if (history.length < 2) return 0
  let flips = 0
  for (let i = 1; i < history.length; i++) {
    if (normalizeSongKey(history[i].title) !== normalizeSongKey(history[i - 1].title)) flips++
  }
  return flips
}

function sanityCheck(title: string, artist: string, previousSongs: string[]): { pass: boolean; reason: string } {
  const normalizedTitle  = normalizeSongKey(title)
  const normalizedArtist = artist.toLowerCase().trim()

  if (previousSongs.some(s => normalizeSongKey(s) === normalizedTitle)) {
    return { pass: false, reason: 'duplicate: already in setlist' }
  }

  const canonicalArtists = CANONICAL_SONG_ARTISTS[normalizedTitle]
  if (canonicalArtists && canonicalArtists.length > 0) {
    const isCanonical = canonicalArtists.some(ca =>
      normalizedArtist.includes(ca) || ca.includes(normalizedArtist.split(' ')[0])
    )
    if (!isCanonical) {
      return { pass: false, reason: `wrong_artist: expected [${canonicalArtists.join(', ')}], got "${artist}"` }
    }
  }

  return { pass: true, reason: 'ok' }
}

// ─── user_songs write ─────────────────────────────────────────────────────────
async function writeToUserSongs(
  title: string,
  artist: string,
  userId: string,
  performanceId: string,
  source: 'auto' | 'manual_confirm' | 'review_save'
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
      // Now we'll actually see errors instead of silently swallowing them
      console.error('[DetectionEvent] insert failed:', error.message, error.code)
    } else {
      console.log('[Detection]', JSON.stringify({
        title: event.final_title, score: event.acr_score,
        confidence: event.confidence_level, auto: event.auto_confirmed,
      }))
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
    const historyRaw   = incoming.get('candidate_history') as string | null
    const previousSongs: string[]                   = prevRaw    ? JSON.parse(prevRaw)    : []
    const candidateHistory: CandidateHistoryEntry[] = historyRaw ? JSON.parse(historyRaw) : []

    if (!(audio instanceof File)) return NextResponse.json({ error: 'No audio file' }, { status: 400 })

    const mimeType    = audio.type || 'audio/webm'
    const audioBuffer = Buffer.from(await audio.arrayBuffer())
    audioBytes        = audioBuffer.length

    // Get current user for user_songs writes
    // Primary: Authorization header (when sent)
    // Fallback: look up user_id from the performance record using service role key
    // This ensures memory writes work even when the live capture page doesn't send auth headers
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
      // Fallback: read user_id directly from performances table
      if (!userId && performanceId) {
        const { data: perfRow } = await supabase
          .from('performances')
          .select('user_id')
          .eq('id', performanceId)
          .single()
        userId = perfRow?.user_id || null
        if (userId) console.log('[Auth] userId resolved from performance record:', userId)
      }
    } catch { /* non-blocking */ }

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

    const humming     = payload?.metadata?.humming?.[0]
    const music       = payload?.metadata?.music?.[0]
    const acrMatch    = humming || music
    const acrDetected = payload.status?.code === 0 && !!acrMatch
    const source: DetectionSource = humming ? 'humming' : 'fingerprint'

    const rawScore    = acrMatch?.score ? parseFloat(acrMatch.score) : 0
    const acrScore    = humming ? rawScore * 100 : rawScore
    const HUMMING_BOOST_MIN = 45
    const effectiveScore = (humming && acrScore >= HUMMING_BOOST_MIN)
      ? Math.max(acrScore, 85)
      : acrScore

    const flipCount = countCandidateFlips(candidateHistory)

    if (!acrDetected) {
      await logDetectionEvent({
        performance_id: performanceId,
        acr_score: 0, acr_state: 'failed',
        confidence_level: 'no_result',
        auto_confirmed: false,
        fallback_triggered: false, flip_count: 0,
        artist_name: artistName, venue_name: venueName, show_type: showType,
        audio_duration_seconds: durationSeconds,
        detected_at: new Date().toISOString(),
      })
      return NextResponse.json({ detected: false, job_id: job?.id })
    }

    // ── Clean title before any processing ────────────────────────────────────
    // Strip "(Alternate Version)", "(Live)", "(Edit)" etc from ACRCloud results
    const rawTitle = acrMatch.title
    const title    = cleanTitle(rawTitle)
    const artist   = acrMatch.artists?.[0]?.name || ''
    const isrc     = acrMatch.external_ids?.isrc || ''

    await supabase.from('recognition_results').insert({
      job_id: job?.id || null, rank: 1, title, artist_name: artist,
      score: acrScore, raw_data: acrMatch,
    })

    // ─── Decision logic ───────────────────────────────────────────────────────
    let confidenceLevel: ConfidenceLevel
    let sanityPassed  = true
    let failureReason = ''

    // ── Catalog-first check: if song is in user's catalog with score >= 60, auto-confirm
    // This runs BEFORE flip/strong checks so catalog songs aren't penalized by noise
    const isDuplicateFirst = previousSongs.some(s => normalizeSongKey(s) === normalizeSongKey(title))
    if (!isDuplicateFirst && effectiveScore >= 60) {
      const bias = await checkMemoryBias(title, userId)
      if (bias.biased) {
        confidenceLevel = 'auto'
        sanityPassed    = true
        failureReason   = `catalog_boost: score=${acrScore} count=${bias.confirmedCount}`
        console.log(`[CatalogBoost] "${title}" auto-confirmed via catalog, score=${acrScore}`)
      }
    }

    // ── Standard decision logic (only runs if catalog boost didn't resolve it)
    if (!confidenceLevel) {
    if (effectiveScore >= ACR_STRONG && flipCount < FLAP_MIN_COUNT) {
      const sanity = sanityCheck(title, artist, previousSongs)
      sanityPassed  = sanity.pass
      failureReason = sanity.reason
      if (sanity.pass) {
        confidenceLevel = 'auto'
      } else if (sanity.reason.startsWith('duplicate')) {
        confidenceLevel = 'no_result'
      } else {
        confidenceLevel = 'suggest'
      }
    } else if (effectiveScore >= ACR_SUGGEST) {
      const isDuplicate = previousSongs.some(s => normalizeSongKey(s) === normalizeSongKey(title))
      if (isDuplicate) {
        confidenceLevel = 'no_result'
        sanityPassed    = false
        failureReason   = 'duplicate: already in setlist'
      } else {
        const bias = await checkMemoryBias(title, userId)
        if (bias.biased && acrScore >= 60) {
          confidenceLevel = 'auto'
          sanityPassed    = true
          failureReason   = `memory_bias_upgrade: score=${acrScore} count=${bias.confirmedCount}`
        } else {
          confidenceLevel = 'suggest'
          sanityPassed    = false
          failureReason   = bias.biased
            ? `memory_bias_score_too_low: ${acrScore}`
            : `unknown_song_suggest: ${effectiveScore}`
        }
      }
    } else {
      confidenceLevel = 'no_result'
      sanityPassed    = false
      failureReason   = `score_too_low: ${effectiveScore}`
    }
    } // end standard decision block

    // Safety fallback — should never reach here but TypeScript needs it
    if (!confidenceLevel) {
      confidenceLevel = 'no_result'
      failureReason   = 'unresolved_confidence'
    }

    // ── Log detection event (now with venue_name and cleaned title) ───────────
    await logDetectionEvent({
      performance_id:        performanceId,
      acr_title:             rawTitle,      // raw from ACR for debugging
      acr_artist:            artist,
      acr_score:             acrScore,
      acr_state:             effectiveScore >= ACR_STRONG ? 'stable' : 'unstable',
      final_title:           title,         // cleaned title
      final_artist:          artist,
      final_source:          source,
      confidence_level:      confidenceLevel,
      auto_confirmed:        confidenceLevel === 'auto',
      fallback_triggered:    false,
      flip_count:            flipCount,
      artist_name:           artistName,
      venue_name:            venueName,     // ← was always null before
      show_type:             showType,
      audio_duration_seconds: durationSeconds,
      previous_song:         previousSongs[previousSongs.length - 1] || null,
      detected_at:           new Date().toISOString(),
      candidate_pool:        [{ title, artist, source, acrScore, effectiveScore }],
    })

    if (confidenceLevel === 'no_result') {
      return NextResponse.json({
        detected: false, job_id: job?.id,
        debug: { score: effectiveScore, reason: failureReason }
      })
    }

    let enriched: EnrichedSongData = { isrc, composer: '', publisher: '' }
    if (confidenceLevel === 'auto') {
      enriched = await enrichFromMusicBrainz(title, artist, isrc)
    }

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

    if (confidenceLevel === 'auto' && userId && performanceId) {
      writeToUserSongs(title, artist, userId, performanceId, 'auto')
    }

    await supabase.from('recognition_logs').insert({
      performance_id: performanceId || null,
      audio_bytes: audioBytes, duration_seconds: durationSeconds,
      acr_status_code: payload.status?.code ?? null,
      detected: true, title, artist,
      isrc: enriched.isrc || null, score: acrScore,
      source, raw_response: payload,
      user_agent: req.headers.get('user-agent') ?? null,
    })

    return NextResponse.json({
      detected: true, title, artist,
      confidence_level: confidenceLevel, source,
      acr_score: acrScore,
      isrc: enriched.isrc, composer: enriched.composer, publisher: enriched.publisher,
      setlist_item_id: setlistItemId, job_id: job?.id,
      debug: {
        raw_title: rawTitle,
        cleaned_title: title,
        effective_score: effectiveScore,
        sanity_passed: sanityPassed,
        failure_reason: failureReason,
        final_state: confidenceLevel,
      }
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
