import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HOST = (process.env.ACRCLOUD_HOST || 'identify-us-west-2.acrcloud.com').trim()
const ACCESS_KEY = (process.env.ACRCLOUD_ACCESS_KEY || '').trim()
const ACCESS_SECRET = (process.env.ACRCLOUD_ACCESS_SECRET || '').trim()

export async function POST(req: NextRequest) {
  try {
    const incoming = await req.formData()
    const audio = incoming.get('audio')
    if (!(audio instanceof File)) {
      return NextResponse.json({ error: 'No audio file' }, { status: 400 })
    }

    const audioBuffer = Buffer.from(await audio.arrayBuffer())
    const timestamp = Math.floor(Date.now() / 1000).toString()

    console.log('Runtime:', process.version)
    console.log('Audio bytes:', audioBuffer.length)
    console.log('ACCESS_KEY:', ACCESS_KEY)

    const stringToSign = [
      'POST',
      '/v1/identify',
      ACCESS_KEY,
      'audio',
      '1',
      timestamp,
    ].join('\n')

    console.log('STRING TO SIGN:', stringToSign)

    const signature = crypto
      .createHmac('sha1', ACCESS_SECRET)
      .update(stringToSign)
      .digest('base64')

    console.log('SIGNATURE:', signature)

    const form = new FormData()
    form.append('access_key', ACCESS_KEY)
    form.append('sample_bytes', audioBuffer.length.toString())
    form.append('sample', new Blob([audioBuffer]), 'sample.webm')
    form.append('timestamp', timestamp)
    form.append('signature', signature)
    form.append('data_type', 'audio')
    form.append('signature_version', '1')

    const res = await fetch(`https://${HOST}/v1/identify`, {
      method: 'POST',
      body: form,
    })

    const data = await res.json()
    console.log('ACRCloud response:', JSON.stringify(data))

    const humming = data?.metadata?.humming?.[0]
    const music = data?.metadata?.music?.[0]
    const match = humming || music

    if (data.status?.code === 0 && match) {
      return NextResponse.json({
        detected: true,
        title: match.title,
        artist: match.artists?.[0]?.name || '',
        isrc: match.external_ids?.isrc || '',
        source: humming ? 'humming' : 'fingerprint',
      })
    }

    return NextResponse.json({ detected: false, debug: data.status })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
