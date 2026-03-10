import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HOST = 'identify-us-west-2.acrcloud.com'
const ACCESS_KEY = 'c020f9da8514cf745ae87971153e08b2'
const ACCESS_SECRET = 'yYwlNleqKf9o9xVldVhxcb3lVdZ8jBv1WrNUoVbJ'

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

    console.log('KEY:', ACCESS_KEY)
    console.log('STRING:', stringToSign)
    console.log('SIG:', signature)

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

    console.log('ACRCloud:', JSON.stringify(payload))

    const humming = payload?.metadata?.humming?.[0]
    const music = payload?.metadata?.music?.[0]
    const match = humming || music

    if (payload.status?.code === 0 && match) {
      return NextResponse.json({
        detected: true,
        title: match.title,
        artist: match.artists?.[0]?.name || '',
      })
    }

    return NextResponse.json({
      detected: false,
      debug: {
        status: payload?.status,
        sampleBytes: audioBuffer.length,
      }
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
