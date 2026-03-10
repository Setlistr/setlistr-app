import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HOST = (process.env.ACRCLOUD_HOST || 'identify-us-west-2.acrcloud.com').trim()
const ACCESS_KEY = (process.env.ACRCLOUD_ACCESS_KEY || '').trim()
const ACCESS_SECRET = (process.env.ACRCLOUD_ACCESS_SECRET || '').trim()

function extractBestMatch(payload: any) {
  if (Array.isArray(payload?.metadata?.humming) && payload.metadata.humming.length > 0) {
    const m = payload.metadata.humming[0]
    return {
      title: m?.title ?? null,
      artist: Array.isArray(m?.artists) ? m.artists.map((a: any) => a?.name).filter(Boolean).join(', ') : null,
      source: 'humming',
    }
  }
  if (Array.isArray(payload?.metadata?.music) && payload.metadata.music.length > 0) {
    const m = payload.metadata.music[0]
    if (m?.title || m?.artists) {
      return {
        title: m?.title ?? null,
        artist: Array.isArray(m?.artists) ? m.artists.map((a: any) => a?.name).filter(Boolean).join(', ') : null,
        source: 'music',
      }
    }
  }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const incoming = await req.formData()
    const audio = incoming.get('audio')
    if (!(audio instanceof File)) {
      return NextResponse.json({ error: 'No audio file' }, { status: 400 })
    }

    const audioBuffer = Buffer.from(await audio.arrayBuffer())
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

    console.log('ACRCloud full response:', JSON.stringify(payload))

    const match = extractBestMatch(payload)

    if (match?.title) {
      return NextResponse.json({ detected: true, title: match.title, artist: match.artist, source: match.source })
    }

    return NextResponse.json({
      detected: false,
      debug: {
        status: payload?.status ?? null,
        metadataKeys: payload?.metadata ? Object.keys(payload.metadata) : [],
        musicCount: Array.isArray(payload?.metadata?.music) ? payload.metadata.music.length : 0,
        hummingCount: Array.isArray(payload?.metadata?.humming) ? payload.metadata.humming.length : 0,
        sampleBytes: audioBuffer.length,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
