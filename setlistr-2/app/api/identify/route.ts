import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HOST = 'identify-us-west-2.acrcloud.com'
const ACCESS_KEY = '81af58b16d932703e6a233f054666f3b'
const ACCESS_SECRET = 'vNLUzrw4OOaiKiaw4FTdPQlqTNTGj3VbCNmotS22'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── MusicBrainz enrichment ───────────────────────────────────────────────────
// Fetches composer and publisher data using ISRC or title+artist fallback.
// MusicBrainz is free, no API key required. Rate limit: 1 req/sec — fine for our use.

interface EnrichedSongData {
  isrc: string
  composer: string
  publisher: string
}

async function enrichFromMusicBrainz(
  title: string,
  artist: string,
  isrcFromACR: string
): Promise<EnrichedSongData> {
  const result: EnrichedSongData = {
    isrc: isrcFromACR || '',
    composer: '',
    publisher: '',
  }

  try {
    let recordingId: string | null = null

    // ── Strategy 1: Look up by ISRC (most reliable) ───────────────────────────
    if (isrcFromACR) {
      const isrcUrl = `https://musicbrainz.org/ws/2/isrc/${isrcFromACR}?inc=recordings&fmt=json`
      const isrcRes = await fetch(isrcUrl, {
        headers: { 'User-Agent': 'Setlistr/1.0 (setlistr.app)' },
      })

      if (isrcRes.ok) {
        const isrcData = await isrcRes.json()
        recordingId = isrcData?.recordings?.[0]?.id || null
      }
    }

    // ── Strategy 2: Search by title + artist if no ISRC match ────────────────
    if (!recordingId) {
      const query = encodeURIComponent(`recording:"${title}" AND artist:"${artist}"`)
      const searchUrl = `https://musicbrainz.org/ws/2/recording?query=${query}&limit=1&fmt=json`
      const searchRes = await fetch(searchUrl, {
        headers: { 'User-Agent': 'Setlistr/1.0 (setlistr.app)' },
      })

      if (searchRes.ok) {
        const searchData = await searchRes.json()
        const topResult = searchData?.recordings?.[0]

        if (topResult) {
          recordingId = topResult.id

          // If ACRCloud didn't return an ISRC, grab it from MusicBrainz
          if (!result.isrc && topResult.isrcs?.length > 0) {
            result.isrc = topResult.isrcs[0]
          }
        }
      }
    }

    // ── Strategy 3: Fetch full recording details for composer + publisher ─────
    if (recordingId) {
      const detailUrl = `https://musicbrainz.org/ws/2/recording/${recordingId}?inc=artist-credits+work-rels+artists&fmt=json`
      const detailRes = await fetch(detailUrl, {
        headers: { 'User-Agent': 'Setlistr/1.0 (setlistr.app)' },
      })

      if (detailRes.ok) {
        const detail = await detailRes.json()

        // Extract composers from work relationships
        const workRels = detail?.relations?.filter(
          (r: any) => r['target-type'] === 'work'
        ) || []

        if (workRels.length > 0) {
          const workId = workRels[0]?.work?.id
          if (workId) {
            // Fetch the work to get composer credits
            const workUrl = `https://musicbrainz.org/ws/2/work/${workId}?inc=artist-rels&fmt=json`
            const workRes = await fetch(workUrl, {
              headers: { 'User-Agent': 'Setlistr/1.0 (setlistr.app)' },
            })

            if (workRes.ok) {
              const workData = await workRes.json()

              // Composers are artist relations with type "composer" or "writer"
              const composerRels = workData?.relations?.filter(
                (r: any) => r.type === 'composer' || r.type === 'writer' || r.type === 'lyricist'
              ) || []

              if (composerRels.length > 0) {
                result.composer = composerRels
                  .map((r: any) => r.artist?.name)
                  .filter(Boolean)
                  .join(', ')
              }

              // Publishers are label relations on the work
              const publisherRels = workData?.relations?.filter(
                (r: any) => r.type === 'publishing' || r['target-type'] === 'label'
              ) || []

              if (publisherRels.length > 0) {
                result.publisher = publisherRels
                  .map((r: any) => r.label?.name || r.artist?.name)
                  .filter(Boolean)
                  .join(', ')
              }
            }
          }
        }
      }
    }
  } catch (err) {
    // MusicBrainz enrichment is best-effort — never block the main response
    console.error('[MusicBrainz] enrichment failed:', err)
  }

  return result
}

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  let audioBytes = 0
  let performanceId: string | null = null
  let showId: string | null = null
  let setlistId: string | null = null
  let artistId: string | null = null

  try {
    const incoming = await req.formData()
    const audio = incoming.get('audio')
    performanceId = incoming.get('performance_id') as string | null
    showId = incoming.get('show_id') as string | null
    setlistId = incoming.get('setlist_id') as string | null
    artistId = incoming.get('artist_id') as string | null

    if (!(audio instanceof File)) {
      return NextResponse.json({ error: 'No audio file' }, { status: 400 })
    }

    const audioBuffer = Buffer.from(await audio.arrayBuffer())
    audioBytes = audioBuffer.length

    // 1. Store audio capture record
    const { data: capture } = await supabase
      .from('audio_captures')
      .insert({
        show_id: showId,
        artist_id: artistId,
        captured_by: null,
        duration_seconds: 12,
        file_size_bytes: audioBytes,
        mime_type: 'audio/webm',
        captured_at: new Date().toISOString(),
      })
      .select()
      .single()

    // 2. Create recognition job
    const { data: job } = await supabase
      .from('recognition_jobs')
      .insert({
        audio_capture_id: capture?.id || null,
        vendor: 'acrcloud',
        status: 'processing',
        submitted_at: new Date().toISOString(),
        raw_request: {
          host: HOST,
          audio_bytes: audioBytes,
          performance_id: performanceId,
          show_id: showId,
          setlist_id: setlistId,
        },
      })
      .select()
      .single()

    // 3. Call ACRCloud
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const stringToSign = ['POST', '/v1/identify', ACCESS_KEY, 'audio', '1', timestamp].join('\n')
    const signature = crypto.createHmac('sha1', ACCESS_SECRET).update(stringToSign).digest('base64')

    const form = new FormData()
    form.append('access_key', ACCESS_KEY)
    form.append('sample_bytes', audioBuffer.length.toString())
    form.append('sample', new Blob([audioBuffer]), 'sample.webm')
    form.append('timestamp', timestamp)
    form.append('signature', signature)
    form.append('data_type', 'audio')
    form.append('signature_version', '1')

    const res = await fetch(`https://${HOST}/v1/identify`, { method: 'POST', body: form })
    const payload = await res.json()
    const durationSeconds = Math.round((Date.now() - startTime) / 1000)

    const humming = payload?.metadata?.humming?.[0]
    const music = payload?.metadata?.music?.[0]
    const match = humming || music
    const detected = payload.status?.code === 0 && !!match

    // 4. Update job with response
    if (job) {
      await supabase.from('recognition_jobs').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        raw_response: payload,
      }).eq('id', job.id)
    }

    // 5. Store recognition results
    let topResultId: string | null = null
    if (job && payload?.metadata?.music?.length > 0) {
      const candidates = payload.metadata.music.slice(0, 3)
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i]
        const { data: result } = await supabase
          .from('recognition_results')
          .insert({
            job_id: job.id,
            rank: i + 1,
            title: c.title,
            artist_name: c.artists?.[0]?.name || '',
            album: c.album?.name || '',
            isrc: c.external_ids?.isrc || '',
            score: c.score ? parseFloat(c.score) : null,
            raw_data: c,
          })
          .select()
          .single()
        if (i === 0 && result) topResultId = result.id
      }
    }

    if (job && humming && !music) {
      const { data: result } = await supabase
        .from('recognition_results')
        .insert({
          job_id: job.id,
          rank: 1,
          title: humming.title,
          artist_name: humming.artists?.[0]?.name || '',
          score: humming.score ? parseFloat(humming.score) : null,
          raw_data: humming,
        })
        .select()
        .single()
      if (result) topResultId = result.id
    }

    // 6. If detected — enrich with MusicBrainz ────────────────────────────────
    // This runs after ACRCloud returns, adding ISRC + composer + publisher
    let enriched: EnrichedSongData = {
      isrc: match?.external_ids?.isrc || '',
      composer: '',
      publisher: '',
    }

    if (detected && match) {
      enriched = await enrichFromMusicBrainz(
        match.title,
        match.artists?.[0]?.name || '',
        match.external_ids?.isrc || ''
      )
    }

    // 7. Create recognition decision
    let decisionId: string | null = null
    if (job && detected && match) {
      const score = match.score ? parseFloat(match.score) : 0
      const decisionType = score >= 80 ? 'auto' : 'manual_confirm'

      const { data: decision } = await supabase
        .from('recognition_decisions')
        .insert({
          job_id: job.id,
          chosen_result_id: topResultId,
          decision_type: decisionType,
          final_title: match.title,
          final_artist: match.artists?.[0]?.name || '',
          final_isrc: enriched.isrc,
          decided_at: new Date().toISOString(),
        })
        .select()
        .single()
      if (decision) decisionId = decision.id
    }

    // 8. Write setlist_item if detected and we have a setlist
    let setlistItemId: string | null = null
    if (detected && match && setlistId && decisionId) {
      const { data: existing } = await supabase
        .from('setlist_items')
        .select('id')
        .eq('setlist_id', setlistId)
        .ilike('title', match.title)
        .single()

      if (!existing) {
        const { data: lastItem } = await supabase
          .from('setlist_items')
          .select('position')
          .eq('setlist_id', setlistId)
          .order('position', { ascending: false })
          .limit(1)
          .single()

        const position = (lastItem?.position || 0) + 1

        const { data: newItem } = await supabase
          .from('setlist_items')
          .insert({
            setlist_id: setlistId,
            title: match.title,
            artist_name: match.artists?.[0]?.name || '',
            position,
            source: 'recognized',
            recognition_decision_id: decisionId,
          })
          .select()
          .single()

        if (newItem) setlistItemId = newItem.id
      }
    }

    // 9. Legacy recognition_logs
    await supabase.from('recognition_logs').insert({
      performance_id: performanceId || null,
      audio_bytes: audioBytes,
      duration_seconds: durationSeconds,
      acr_status_code: payload.status?.code ?? null,
      acr_message: payload.status?.msg ?? null,
      detected,
      title: match?.title ?? null,
      artist: match?.artists?.[0]?.name ?? null,
      album: match?.album?.name ?? null,
      isrc: enriched.isrc || null,
      score: match?.score ? parseFloat(match.score) : null,
      source: humming ? 'humming' : music ? 'fingerprint' : null,
      raw_response: payload,
      user_agent: req.headers.get('user-agent') ?? null,
    })

    if (detected && match) {
      return NextResponse.json({
        detected: true,
        title: match.title,
        artist: match.artists?.[0]?.name || '',
        // ── Enriched fields — now included in every detection response ──
        isrc: enriched.isrc,
        composer: enriched.composer,
        publisher: enriched.publisher,
        source: humming ? 'humming' : 'fingerprint',
        setlist_item_id: setlistItemId,
        job_id: job?.id,
        decision_id: decisionId,
      })
    }

    return NextResponse.json({
      detected: false,
      job_id: job?.id,
      debug: { status: payload?.status, sampleBytes: audioBytes },
    })

  } catch (err: any) {
    await supabase.from('recognition_logs').insert({
      performance_id: performanceId || null,
      audio_bytes: audioBytes,
      detected: false,
      acr_message: err.message,
      raw_response: { error: err.message },
    })
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
