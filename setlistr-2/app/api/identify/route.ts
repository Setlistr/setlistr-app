import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audioFile = formData.get('audio') as File
    if (!audioFile) return NextResponse.json({ error: 'No audio' }, { status: 400 })

    const host = process.env.ACRCLOUD_HOST!
    const accessKey = process.env.ACRCLOUD_ACCESS_KEY!
    const accessSecret = process.env.ACRCLOUD_ACCESS_SECRET!

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer())
    const sampleBytes = audioBuffer.length

    const timestamp = Math.floor(Date.now() / 1000).toString()
    const stringToSign = `POST\n/v1/identify\n${accessKey}\naudio\n1\n${timestamp}`
    const signature = crypto.createHmac('sha1', accessSecret).update(Buffer.from(stringToSign, 'ascii')).digest('base64')

    console.log('stringToSign:', JSON.stringify(stringToSign))
    console.log('signature:', signature)
    console.log('sampleBytes:', sampleBytes)

    const boundary = `----FormBoundary${crypto.randomBytes(8).toString('hex')}`
    const CRLF = '\r\n'

    function field(name: string, value: string): Buffer {
      return Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}` +
        `${value}${CRLF}`
      )
    }

    const filePart = Buffer.concat([
      Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="sample"; filename="sample.webm"${CRLF}` +
        `Content-Type: audio/webm${CRLF}${CRLF}`
      ),
      audioBuffer,
      Buffer.from(CRLF),
    ])

    const body = Buffer.concat([
      field('access_key', accessKey),
      field('data_type', 'audio'),
      field('signature_version', '1'),
      field('signature', signature),
      field('sample_bytes', sampleBytes.toString()),
      field('timestamp', timestamp),
      filePart,
      Buffer.from(`--${boundary}--${CRLF}`),
    ])

    const res = await fetch(`https://${host}/v1/identify`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length.toString(),
      },
      body,
    })

    const data = await res.json()
    console.log('ACRCloud response:', JSON.stringify(data))

    const hummingMatch = data.metadata?.humming?.[0]
    const musicMatch = data.metadata?.music?.[0]
    const match = hummingMatch || musicMatch

    if (data.status?.code === 0 && match) {
      return NextResponse.json({
        detected: true,
        title: match.title,
        artist: match.artists?.[0]?.name || '',
        album: match.album?.name || '',
        isrc: match.external_ids?.isrc || '',
        score: match.score || null,
        source: hummingMatch ? 'humming' : 'fingerprint',
      })
    } else {
      return NextResponse.json({
        detected: false,
        debug: { code: data.status?.code, msg: data.status?.msg }
      })
    }
  } catch (err) {
    console.error('ACRCloud error:', err)
    return NextResponse.json({ error: 'Identification failed' }, { status: 500 })
  }
}
