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
const ACR_AUTO         = 80
const ACR_WEAK         = 30
const ACR_ACOUSTIC     = 60
const FLAP_MIN_COUNT   = 2
const COMBINED_AUTO    = 0.35
const COMBINED_SUGGEST = 0.20

// ─── Known canonical artists for famous songs ─────────────────────────────────
// If a detection returns one of these song titles but NOT from a canonical artist,
// we flag it as a mismatch and downgrade to suggest.
// Key = normalized song title, Value = array of canonical artist name fragments
const CANONICAL_SONG_ARTISTS: Record<string, string[]> = {
  'carrying your love with me': ['george strait'],
  'born again': ['third day', 'newsboys'], // not 'jerry carpenter' etc
  'check yes or no': ['george strait'],
  'tennessee whiskey': ['chris stapleton', 'david allan coe'],
  'friends in low places': ['garth brooks'],
  'i will always love you': ['dolly parton', 'whitney houston'],
  'drift away': ['dobie gray', 'uncle kracker'],
  'cowboy ways': [], // original — no canonical filter needed
  'springsteen': ['eric church'],
  'fast car': ['tracy chapman', 'luke combs'],
  'jolene': ['dolly parton'],
  'wagon wheel': ['old crow medicine show', 'darius rucker'],
  'take me home country roads': ['john denver'],
  'sweet home alabama': ['lynyrd skynyrd'],
  'brown eyed girl': ['van morrison'],
  'wonderwall': ['oasis'],
  'hotel california': ['eagles'],
  'piano man': ['billy joel'],
  'american girl': ['tom petty'],
  'redemption song': ['bob marley'],
  'hallelujah': ['leonard cohen', 'jeff buckley'],
  'blackbird': ['beatles', 'the beatles'],
  'landslide': ['fleetwood mac', 'stevie nicks'],
  'the house of the rising sun': ['animals', 'the animals'],
  'ring of fire': ['johnny cash'],
  'folsom prison blues': ['johnny cash'],
  'man in black': ['johnny cash'],
  'ghost riders in the sky': [],
  'dust in the wind': ['kansas'],
  'knockin on heavens door': ['bob dylan', 'guns n roses'],
  'hurt': ['nine inch nails', 'johnny cash'],
}

// ─── Types ────────────────────────────────────────────────────────────────────

type AcrState = 'strong' | 'weak' | 'unstable' | 'failed' | 'acoustic'
type ConfidenceLevel = 'auto' | 'suggest' | 'manual_review' | 'no_result'
type DetectionSource = 'fingerprint' | 'humming' | 'transcript' | 'combined' | 'manual' | 'cloned'

interface CandidateHistoryEntry {
  title: string
  artist: string
  score: number
  timestamp: number
}

interface SongClues {
  lyric_hooks: string[]
  possible_title: string
  mentioned_artist: string
  transcript_quality: 'low' | 'medium' | 'high'
  enough_signal: boolean
}

interface SongCandidate {
  title: string
  artist: string
  source: DetectionSource
  acrScore: number
  lyricMatch: number
  titleMatch: number
  repeatScore: number
  stabilityScore: number
  combinedScore: number
}

interface EnrichedSongData {
  isrc: string
  composer: string
  publisher: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeSongKey(title: string): string {
  return title.toLowerCase().trim()
    .replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '')
    .replace(/[-–—]/g, ' ').replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ').trim()
}

function titlesMatch(a: string, b: string): boolean {
  return normalizeSongKey(a) === normalizeSongKey(b)
}

function countCandidateFlips(history: CandidateHistoryEntry[]): number {
  if (history.length < 2) return 0
  let flips = 0
  for (let i = 1; i < history.length; i++) {
    if (normalizeSongKey(history[i].title) !== normalizeSongKey(history[i - 1].title)) flips++
  }
  return flips
}

function classifyAcrState(
  detected: boolean,
  score: number,
  flipCount: number,
  showType: string
): AcrState {
  if (!detected) return 'failed'
  if (flipCount >= FLAP_MIN_COUNT) return 'unstable'
  if (showType === 'writers_round' && score < ACR_ACOUSTIC) return 'acoustic'
  if (score >= ACR_AUTO) return 'strong'
  if (score >= ACR_WEAK) return 'weak'
  return 'weak'
}

function shouldRunFallback(acrState: AcrState, manualAssist: boolean): boolean {
  if (manualAssist) return true
  return acrState === 'failed' || acrState === 'unstable' || acrState === 'acoustic'
}

// ─── Fast path sanity check ───────────────────────────────────────────────────
// Returns { pass: true } if the match looks canonical
// Returns { pass: false, reason: string } if it looks like a wrong version

interface SanityResult {
  pass: boolean
  reason?: string
}

function runFastPathSanityCheck(
  title: string,
  artist: string,
  previousSongs: string[],
  allCandidates: { title: string; artist: string; score: number }[]
): SanityResult {
  const normalizedTitle  = normalizeSongKey(title)
  const normalizedArtist = artist.toLowerCase().trim()

  // Check 1: Is this a known famous song with canonical artists defined?
  const canonicalArtists = CANONICAL_SONG_ARTISTS[normalizedTitle]
  if (canonicalArtists !== undefined && canonicalArtists.length > 0) {
    const isCanonical = canonicalArtists.some(ca =>
      normalizedArtist.includes(ca) || ca.includes(normalizedArtist.split(' ')[0])
    )
    if (!isCanonical) {
      // Check if a better canonical candidate exists in the pool
      const betterCandidate = allCandidates.find(c => {
        const cTitle  = normalizeSongKey(c.title)
        const cArtist = c.artist.toLowerCase()
        return cTitle === normalizedTitle &&
          canonicalArtists.some(ca => cArtist.includes(ca) || ca.includes(cArtist.split(' ')[0]))
      })
      if (betterCandidate) {
        return {
          pass: false,
          reason: `famous_title_wrong_artist: "${title}" matched ${artist} but canonical is ${betterCandidate.artist}`,
        }
      }
      // Even without a better candidate in pool, flag as suspicious
      return {
        pass: false,
        reason: `famous_title_obscure_artist: "${title}" matched ${artist} — not a recognized canonical version`,
      }
    }
  }

  // Check 2: Did we just confirm this song? Duplicate protection
  const alreadyPlayed = previousSongs.some(s =>
    normalizeSongKey(s) === normalizedTitle
  )
  if (alreadyPlayed) {
    return { pass: false, reason: `duplicate: "${title}" already in setlist` }
  }

  // Check 3: Multiple competing candidates with similar scores — unstable result
  if (allCandidates.length >= 2) {
    const top    = allCandidates[0].score
    const second = allCandidates[1].score
    const gap    = top - second
    const titlesAreDifferent = normalizeSongKey(allCandidates[0].title) !== normalizeSongKey(allCandidates[1].title)
    if (gap < 15 && titlesAreDifferent) {
      return {
        pass: false,
        reason: `competing_candidates: "${allCandidates[0].title}" (${top}) vs "${allCandidates[1].title}" (${second}) — gap too small`,
      }
    }
  }

  return { pass: true }
}

// ─── OpenAI transcription ─────────────────────────────────────────────────────

async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
  artistName?: string
): Promise<string | null> {
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) { console.warn('[Transcription] OPENAI_API_KEY not set'); return null }

  try {
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(audioBuffer)], { type: mimeType }), 'audio.webm')
    form.append('model', 'gpt-4o-mini-transcribe')
    form.append('response_format', 'text')
    if (artistName) form.append('prompt', `Live music performance by ${artistName}.`)

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}` },
      body: form,
    })

    if (!res.ok) { console.error('[Transcription] Failed:', await res.text()); return null }
    const text = (await res.text()).trim()
    return text.length >= 5 ? text : null
  } catch (err) {
    console.error('[Transcription] Error:', err)
    return null
  }
}

// ─── Clue extraction ──────────────────────────────────────────────────────────

async function extractSongClues(
  transcript: string,
  context: { artistName?: string; showType?: string; previousSongs?: string[] }
): Promise<SongClues | null> {
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) return null

  try {
    const contextHints = [
      context.artistName ? `Performer: ${context.artistName}.` : '',
      context.showType === 'writers_round' ? 'This is a songwriter showcase — original songs are common.' : '',
      context.previousSongs?.length ? `Already played: ${context.previousSongs.slice(0, 5).join(', ')}.` : '',
    ].filter(Boolean).join(' ')

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 250,
        messages: [
          {
            role: 'system',
            content: `You are a music clue extractor for a live setlist tracker.
Extract structured clues from a live song transcript. Do NOT identify or name the song yourself.
${contextHints}
Return ONLY valid JSON (no markdown, no explanation):
{
  "lyric_hooks": ["repeated phrase 1", "repeated phrase 2"],
  "possible_title": "only if clearly spoken or sung as a title",
  "mentioned_artist": "only if explicitly said by name",
  "transcript_quality": "low|medium|high",
  "enough_signal": true|false
}
enough_signal is true only if there is enough lyric content to attempt matching.`,
          },
          { role: 'user', content: `Transcript: "${transcript}"` },
        ],
      }),
    })

    if (!res.ok) { console.error('[ClueExtraction] Failed:', await res.text()); return null }
    const data = await res.json()
    const raw  = data.choices?.[0]?.message?.content?.trim()
    if (!raw) return null
    return JSON.parse(raw) as SongClues
  } catch (err) {
    console.error('[ClueExtraction] Error:', err)
    return null
  }
}

// ─── Candidate scoring ────────────────────────────────────────────────────────

function scoreCandidates(
  acrCandidates: { title: string; artist: string; score: number }[],
  clues: SongClues | null,
  history: CandidateHistoryEntry[],
  flipCount: number
): SongCandidate[] {
  const candidates: SongCandidate[] = []

  // Score all ACR candidates, not just the top one
  for (const acrCandidate of acrCandidates) {
    const acrNorm      = acrCandidate.score / 100
    const lyricMatch   = clues?.lyric_hooks?.some(hook =>
      normalizeSongKey(acrCandidate.title).includes(normalizeSongKey(hook)) ||
      normalizeSongKey(hook).includes(normalizeSongKey(acrCandidate.title).split(' ')[0])
    ) ? 0.7 : 0
    const titleMatch     = clues?.possible_title ? (titlesMatch(clues.possible_title, acrCandidate.title) ? 1.0 : 0) : 0
    const repeatCount    = history.filter(h => titlesMatch(h.title, acrCandidate.title)).length
    const repeatScore    = Math.min(repeatCount / 3, 1.0)
    const stabilityScore = Math.max(0, 1 - (flipCount * 0.3))

    // Boost canonical matches
    const normalizedTitle = normalizeSongKey(acrCandidate.title)
    const canonicalArtists = CANONICAL_SONG_ARTISTS[normalizedTitle]
    const canonicalBoost = canonicalArtists && canonicalArtists.length > 0 &&
      canonicalArtists.some(ca =>
        acrCandidate.artist.toLowerCase().includes(ca) || ca.includes(acrCandidate.artist.toLowerCase().split(' ')[0])
      ) ? 0.15 : 0

    const combinedScore = Math.min(
      acrNorm * 0.45 + lyricMatch * 0.20 + titleMatch * 0.15 + repeatScore * 0.10 + stabilityScore * 0.05 + canonicalBoost,
      1.0
    )

    candidates.push({
      title: acrCandidate.title, artist: acrCandidate.artist,
      source: 'fingerprint', acrScore: acrCandidate.score,
      lyricMatch, titleMatch, repeatScore, stabilityScore, combinedScore,
    })
  }

  // Add transcript candidate if exists
  if (clues?.possible_title && clues.enough_signal) {
    const alreadyIn = candidates.some(c => titlesMatch(c.title, clues.possible_title))
    if (!alreadyIn) {
      const lyricMatch    = clues.lyric_hooks?.length ? 0.6 : 0.3
      const repeatScore   = history.filter(h => titlesMatch(h.title, clues.possible_title)).length > 0 ? 0.5 : 0
      const combinedScore = lyricMatch * 0.25 + 1.0 * 0.15 + repeatScore * 0.10 + 0.5 * 0.05
      candidates.push({
        title: clues.possible_title, artist: clues.mentioned_artist || '',
        source: 'transcript', acrScore: 0,
        lyricMatch, titleMatch: 1.0, repeatScore, stabilityScore: 0.5, combinedScore,
      })
    } else {
      const existing = candidates.find(c => titlesMatch(c.title, clues.possible_title))
      if (existing) {
        existing.combinedScore = Math.min(existing.combinedScore + 0.12, 1.0)
        existing.source = 'combined'
      }
    }
  }

  return candidates.sort((a, b) => b.combinedScore - a.combinedScore)
}

function classifyConfidence(candidates: SongCandidate[], clues: SongClues | null): ConfidenceLevel {
  if (candidates.length === 0) return clues?.enough_signal ? 'manual_review' : 'no_result'
  const top = candidates[0].combinedScore
  if (top >= COMBINED_AUTO)    return 'auto'
  if (top >= COMBINED_SUGGEST) return 'suggest'
  return 'manual_review'
}

// ─── MusicBrainz enrichment ───────────────────────────────────────────────────

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
              const pubRels = wd?.relations?.filter((x: any) => x.type === 'publishing' || x['target-type'] === 'label') || []
              if (pubRels.length) result.publisher = pubRels.map((x: any) => x.label?.name || x.artist?.name).filter(Boolean).join(', ')
            }
          }
        }
      }
    }
  } catch (err) { console.error('[MusicBrainz] failed:', err) }
  return result
}

// ─── Detection event logger ───────────────────────────────────────────────────

async function logDetectionEvent(event: Record<string, any>): Promise<void> {
  try {
    await supabase.from('detection_events').insert(event)
    console.debug('[DetectionEvent]', JSON.stringify(event))
  } catch (err) { console.error('[DetectionEvent] log failed:', err) }
}

// ─── Main route ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  let audioBytes  = 0
  let performanceId: string | null = null
  let showId: string | null = null
  let setlistId: string | null = null
  let artistId: string | null = null

  try {
    const incoming     = await req.formData()
    const audio        = incoming.get('audio')
    performanceId      = incoming.get('performance_id') as string | null
    showId             = incoming.get('show_id') as string | null
    setlistId          = incoming.get('setlist_id') as string | null
    artistId           = incoming.get('artist_id') as string | null
    const artistName   = incoming.get('artist_name') as string | null
    const showType     = (incoming.get('show_type') as string | null) || 'single'
    const manualAssist = incoming.get('manual_assist') === 'true'
    const prevRaw      = incoming.get('previous_songs') as string | null
    const historyRaw   = incoming.get('candidate_history') as string | null
    const previousSongs: string[]                   = prevRaw    ? JSON.parse(prevRaw)    : []
    const candidateHistory: CandidateHistoryEntry[] = historyRaw ? JSON.parse(historyRaw) : []

    if (!(audio instanceof File)) {
      return NextResponse.json({ error: 'No audio file' }, { status: 400 })
    }

    const mimeType    = audio.type || 'audio/webm'
    const audioBuffer = Buffer.from(await audio.arrayBuffer())
    audioBytes        = audioBuffer.length

    // ── 1. Store audio capture ────────────────────────────────────────────────
    const { data: capture } = await supabase.from('audio_captures').insert({
      show_id: showId, artist_id: artistId, captured_by: null,
      duration_seconds: 12, file_size_bytes: audioBytes,
      mime_type: 'audio/webm', captured_at: new Date().toISOString(),
    }).select().single()

    // ── 2. Create recognition job ─────────────────────────────────────────────
    const { data: job } = await supabase.from('recognition_jobs').insert({
      audio_capture_id: capture?.id || null, vendor: 'acrcloud', status: 'processing',
      submitted_at: new Date().toISOString(),
      raw_request: { host: HOST, audio_bytes: audioBytes, performance_id: performanceId, show_id: showId, setlist_id: setlistId },
    }).select().single()

    // ── 3. Call ACRCloud ──────────────────────────────────────────────────────
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

    const humming     = payload?.metadata?.humming?.[0]
    const music       = payload?.metadata?.music?.[0]
    const acrMatch    = humming || music
    const acrScore    = acrMatch?.score ? parseFloat(acrMatch.score) : 0
    const acrDetected = payload.status?.code === 0 && !!acrMatch

    // Collect ALL music candidates (up to 5) for scoring and sanity checks
    const allAcrCandidates: { title: string; artist: string; score: number }[] = []
    if (payload?.metadata?.music?.length > 0) {
      payload.metadata.music.slice(0, 5).forEach((c: any) => {
        allAcrCandidates.push({
          title: c.title,
          artist: c.artists?.[0]?.name || '',
          score: c.score ? parseFloat(c.score) : 0,
        })
      })
    }
    if (humming && !payload?.metadata?.music?.length) {
      allAcrCandidates.push({
        title: humming.title,
        artist: humming.artists?.[0]?.name || '',
        score: humming.score ? parseFloat(humming.score) : 0,
      })
    }

    const effectiveScore = humming ? Math.max(acrScore, 85) : acrScore

    // Update job
    if (job) await supabase.from('recognition_jobs').update({
      status: 'completed', completed_at: new Date().toISOString(), raw_response: payload,
    }).eq('id', job.id)

    // Store top 3 ACR results
    let topResultId: string | null = null
    for (let i = 0; i < Math.min(allAcrCandidates.length, 3); i++) {
      const c = allAcrCandidates[i]
      const { data: result } = await supabase.from('recognition_results').insert({
        job_id: job?.id || null, rank: i + 1, title: c.title,
        artist_name: c.artist, score: c.score, raw_data: payload?.metadata?.music?.[i] || null,
      }).select().single()
      if (i === 0 && result) topResultId = result.id
    }

    // ── 4. Classify ACR state ─────────────────────────────────────────────────
    const flipCount = countCandidateFlips(candidateHistory)
    const acrState  = classifyAcrState(acrDetected, effectiveScore, flipCount, showType)
    console.debug(`[ACR] state=${acrState} rawScore=${acrScore} effectiveScore=${effectiveScore} humming=${!!humming} flips=${flipCount} candidates=${allAcrCandidates.length}`)

    // ── 5. FAST PATH with sanity check ───────────────────────────────────────
    if (acrState === 'strong' && acrMatch) {
      const topTitle  = acrMatch.title
      const topArtist = acrMatch.artists?.[0]?.name || ''

      const sanity = runFastPathSanityCheck(topTitle, topArtist, previousSongs, allAcrCandidates)
      console.debug(`[SanityCheck] pass=${sanity.pass} reason=${sanity.reason || 'ok'}`)

      if (sanity.pass) {
        // ── CONFIRMED: fast path passes sanity ───────────────────────────────
        const enriched = await enrichFromMusicBrainz(topTitle, topArtist, acrMatch.external_ids?.isrc || '')

        let setlistItemId: string | null = null
        if (setlistId) {
          const { data: existing } = await supabase.from('setlist_items').select('id')
            .eq('setlist_id', setlistId).ilike('title', topTitle).single()
          if (!existing) {
            const { data: lastItem } = await supabase.from('setlist_items').select('position')
              .eq('setlist_id', setlistId).order('position', { ascending: false }).limit(1).single()
            const { data: newItem } = await supabase.from('setlist_items').insert({
              setlist_id: setlistId, title: topTitle, artist_name: topArtist,
              position: (lastItem?.position || 0) + 1,
              source: humming ? 'humming' : 'fingerprint',
            }).select().single()
            if (newItem) setlistItemId = newItem.id
          }
        }

        await supabase.from('recognition_logs').insert({
          performance_id: performanceId || null,
          audio_bytes: audioBytes, duration_seconds: durationSeconds,
          acr_status_code: payload.status?.code ?? null,
          acr_message: payload.status?.msg ?? null,
          detected: true, title: topTitle, artist: topArtist,
          isrc: enriched.isrc || null, score: acrScore,
          source: humming ? 'humming' : 'fingerprint',
          raw_response: payload,
          user_agent: req.headers.get('user-agent') ?? null,
        })

        await logDetectionEvent({
          performance_id: performanceId,
          acr_title: topTitle, acr_score: acrScore, acr_state: 'strong',
          fallback_triggered: false, flip_count: flipCount,
          final_title: topTitle, final_source: humming ? 'humming' : 'fingerprint',
          confidence_level: 'auto', auto_confirmed: true,
          auto_confirmed_reason: `high_score(${acrScore}) + sanity_pass${humming ? ' + humming' : ''}`,
          artist_name: artistName, show_type: showType,
          candidate_pool: allAcrCandidates,
        })

        return NextResponse.json({
          detected: true,
          title: topTitle,
          artist: topArtist,
          confidence_level: 'auto',
          source: humming ? 'humming' : 'fingerprint',
          isrc: enriched.isrc,
          composer: enriched.composer,
          publisher: enriched.publisher,
          acr_title: topTitle,
          acr_artist: topArtist,
          acr_score: acrScore,
          setlist_item_id: setlistItemId,
          job_id: job?.id,
          // Return top 3 for UI display
          candidates: allAcrCandidates.slice(0, 3),
        })

      } else {
        // ── DOWNGRADED: sanity failed — drop to suggest ───────────────────────
        console.debug(`[FastPath] Downgraded to suggest: ${sanity.reason}`)

        await logDetectionEvent({
          performance_id: performanceId,
          acr_title: topTitle, acr_score: acrScore, acr_state: 'strong',
          fallback_triggered: false, flip_count: flipCount,
          final_title: topTitle, final_source: humming ? 'humming' : 'fingerprint',
          confidence_level: 'suggest', auto_confirmed: false,
          downgraded_reason: sanity.reason,
          artist_name: artistName, show_type: showType,
          candidate_pool: allAcrCandidates,
        })

        return NextResponse.json({
          detected: true,
          title: topTitle,
          artist: topArtist,
          confidence_level: 'suggest',
          source: humming ? 'humming' : 'fingerprint',
          acr_title: topTitle,
          acr_artist: topArtist,
          acr_score: acrScore,
          downgraded_reason: sanity.reason,
          job_id: job?.id,
          // Return all candidates so UI can show top 3
          candidates: allAcrCandidates.slice(0, 3),
        })
      }
    }

    // ── 6. Transcription fallback ─────────────────────────────────────────────
    let transcript: string | null = null
    let clues: SongClues | null   = null
    const fallbackTriggered = shouldRunFallback(acrState, manualAssist)

    if (fallbackTriggered) {
      console.debug('[Fallback] Running transcription...')
      transcript = await transcribeAudio(audioBuffer, mimeType, artistName || undefined)
      if (transcript) {
        clues = await extractSongClues(transcript, {
          artistName: artistName || undefined,
          showType,
          previousSongs,
        })
        console.debug('[Clues]', clues)
      }
    }

    // ── 7. Score all candidates ───────────────────────────────────────────────
    const candidates      = scoreCandidates(allAcrCandidates, clues, candidateHistory, flipCount)
    const confidenceLevel = classifyConfidence(candidates, clues)
    const topCandidate    = candidates[0] || null

    console.debug(`[Confidence] level=${confidenceLevel} top=${topCandidate?.title} score=${topCandidate?.combinedScore}`)

    // ── 8. MusicBrainz enrichment ─────────────────────────────────────────────
    let enriched: EnrichedSongData = { isrc: acrMatch?.external_ids?.isrc || '', composer: '', publisher: '' }
    if (topCandidate && confidenceLevel !== 'no_result') {
      enriched = await enrichFromMusicBrainz(
        topCandidate.title, topCandidate.artist,
        acrMatch?.external_ids?.isrc || ''
      )
    }

    // ── 9. Recognition decision ───────────────────────────────────────────────
    let decisionId: string | null = null
    if (job && topCandidate && confidenceLevel !== 'no_result') {
      const { data: decision } = await supabase.from('recognition_decisions').insert({
        job_id: job.id, chosen_result_id: topResultId,
        decision_type: confidenceLevel,
        final_title: topCandidate.title, final_artist: topCandidate.artist,
        final_isrc: enriched.isrc, decided_at: new Date().toISOString(),
      }).select().single()
      if (decision) decisionId = decision.id
    }

    // ── 10. Write setlist_item (auto only) ────────────────────────────────────
    let setlistItemId: string | null = null
    if (topCandidate && confidenceLevel === 'auto' && setlistId && decisionId) {
      const { data: existing } = await supabase.from('setlist_items').select('id')
        .eq('setlist_id', setlistId).ilike('title', topCandidate.title).single()
      if (!existing) {
        const { data: lastItem } = await supabase.from('setlist_items').select('position')
          .eq('setlist_id', setlistId).order('position', { ascending: false }).limit(1).single()
        const { data: newItem } = await supabase.from('setlist_items').insert({
          setlist_id: setlistId, title: topCandidate.title, artist_name: topCandidate.artist,
          position: (lastItem?.position || 0) + 1,
          source: topCandidate.source, recognition_decision_id: decisionId,
        }).select().single()
        if (newItem) setlistItemId = newItem.id
      }
    }

    // ── 11. Legacy log ────────────────────────────────────────────────────────
    await supabase.from('recognition_logs').insert({
      performance_id: performanceId || null,
      audio_bytes: audioBytes, duration_seconds: durationSeconds,
      acr_status_code: payload.status?.code ?? null,
      acr_message: payload.status?.msg ?? null,
      detected: !!topCandidate && confidenceLevel !== 'no_result',
      title: topCandidate?.title ?? null, artist: topCandidate?.artist ?? null,
      isrc: enriched.isrc || null, score: acrScore || null,
      source: topCandidate?.source ?? null, raw_response: payload,
      user_agent: req.headers.get('user-agent') ?? null,
    })

    // ── 12. Detection event log ───────────────────────────────────────────────
    await logDetectionEvent({
      performance_id: performanceId, audio_duration_seconds: durationSeconds,
      acr_title: acrMatch?.title ?? null, acr_artist: acrMatch?.artists?.[0]?.name ?? null,
      acr_score: acrScore, acr_state: acrState,
      fallback_triggered: fallbackTriggered, flip_count: flipCount,
      transcript_text: transcript, clues,
      final_title: topCandidate?.title ?? null, final_artist: topCandidate?.artist ?? null,
      final_source: topCandidate?.source ?? null, confidence_level: confidenceLevel,
      candidate_pool: candidates, auto_confirmed: confidenceLevel === 'auto',
      artist_name: artistName, show_type: showType,
    })

    // ── 13. Response ──────────────────────────────────────────────────────────
    if (confidenceLevel === 'no_result' || !topCandidate) {
      return NextResponse.json({
        detected: false,
        job_id: job?.id,
        debug: { acr_state: acrState, fallback_triggered: fallbackTriggered },
      })
    }

    if (confidenceLevel === 'manual_review') {
      return NextResponse.json({
        detected: true,
        confidence_level: 'manual_review',
        title: topCandidate.title || '',
        artist: topCandidate.artist || '',
        source: topCandidate.source,
        clues,
        candidates: candidates.slice(0, 3),
        job_id: job?.id,
      })
    }

    return NextResponse.json({
      detected: true,
      title: topCandidate.title,
      artist: topCandidate.artist,
      confidence_level: confidenceLevel,
      source: topCandidate.source,
      isrc: enriched.isrc,
      composer: enriched.composer,
      publisher: enriched.publisher,
      clues,
      acr_title: acrMatch?.title ?? null,
      acr_artist: acrMatch?.artists?.[0]?.name ?? null,
      acr_score: acrScore,
      setlist_item_id: setlistItemId,
      job_id: job?.id,
      decision_id: decisionId,
      candidates: candidates.slice(0, 3),
    })

  } catch (err: any) {
    await supabase.from('recognition_logs').insert({
      performance_id: performanceId || null,
      audio_bytes: audioBytes, detected: false,
      acr_message: err.message, raw_response: { error: err.message },
    })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
