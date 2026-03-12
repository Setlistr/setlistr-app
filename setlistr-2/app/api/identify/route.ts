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

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  let audioBytes = 0
  let performanceId: string | null = null

  try {
    const incoming = await req.formData()
    const audio = incoming.get('audio')
    performanceId = incoming.get('performance_id') as string | null

    if (!(audio instanceof File)) {
      return NextResponse.json({ error: 'No audio file' }, { status: 400 })
    }

    const audioBuffer = Buffer.from(await audio.arrayBuffer())
    audioBytes = audioBuffer.length
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

    // Log every recognition attempt to Supabase
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
      isrc: match?.external_ids?.isrc ?? null,
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
        isrc: match.external_ids?.isrc || '',
        source: humming ? 'humming' : 'fingerprint',
      })
    }

    return NextResponse.json({
      detected: false,
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
