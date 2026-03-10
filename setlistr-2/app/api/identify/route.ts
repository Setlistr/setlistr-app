import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'

export const runtime = 'nodejs'

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

    const bytes = Buffer.from(await audio.arrayBuffer())
    const timestamp = Math.floor(Date.now() / 1000).toString()

    const stringToSign = [
      'POST',
      '/v1/identify',
      ACCESS_KEY,
      'audio',
      '1',
      timestamp,
    ].join('\n')

    const signature = crypto
      .createHmac('sha1', ACCESS_SECRET)
      .update(stringToSign, 'utf8')
      .digest('base64')

    // Build params as URL-encoded fields + raw audio
    const params = new URLSearchParams()
    params.append('access_key', ACCESS_KEY)
    params.append('sample_bytes', String(bytes.length))
    params.append('timestamp', timestamp)
    params.append('signature', signature)
    params.append('data_type', 'audio')
    params.append('signature_version', '1')

    const boundary = '--------ACRCloud' + Date.now()
    const CRLF = '\r\n'

    const parts: Buffer[] = []

    for (const [key, value] of params.entries()) {
      parts.push(Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="${key}"${CRLF}${CRLF}` +
        `${value}${CRLF}`
      ))
    }

    parts.push(Buffer.concat([
      Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="sample"; filename="sample.webm"${CRLF}` +
        `Content-Type: audio/webm${CRLF}${CRLF}`
      ),
      bytes,
      Buffer.from(CRLF),
    ]))

    parts.push(Buffer.from(`--${boundary}--${CRLF}`))

    const body = Buffer.concat(parts)

    const res = await fetch(`https://${HOST}/v1/identify`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(body.length),
      },
      // @ts-ignore
      body,
      duplex: 'half',
    })

    const data = await res.json()
    console.log('ACRCloud:', JSON.stringify(data))

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
