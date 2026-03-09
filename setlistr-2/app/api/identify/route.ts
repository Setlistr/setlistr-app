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

    const arrayBuffer = await audioFile.arrayBuffer()
    const audioBuffer = Buffer.from(arrayBuffer)
    const sampleBytes = audioBuffer.length

    const httpMethod = 'POST'
    const httpUri = '/v1/identify'
    const dataType = 'audio'
    const signatureVersion = '1'
    const timestamp = (Date.now() / 1000).toString()

    const stringToSign = [httpMethod, httpUri, accessKey, dataType, signatureVersion, timestamp].join('\n')
    const signature = crypto.createHmac('sha1', accessSecret).update(stringToSign).digest('base64')

    console.log('ACR bytes:', sampleBytes, 'ts:', timestamp, 'sig:', signature)

    // Build multipart body manually to avoid any FormData quirks
    const boundary = '----ACRCloudBoundary' + Date.now()
    const CRLF = '\r\n'

    function textPart(name: string, value: string): Buffer {
      return Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}` +
        `${value}${CRLF}`
      )
    }

    const filePart = Buffer.concat([
      Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="sample"; filename="audio.wav"${CRLF}` +
        `Content-Type: audio/wav${CRLF}${CRLF}`
      ),
      audioBuffer,
      Buffer.from(CRLF),
    ])

    const body = Buffer.concat([
      textPart('access_key', accessKey),
      textPart('data_type', dataType),
      textPart('signature_version', signatureVersion),
      textPart('signature', signature),
      textPart('sample_bytes', sampleBytes.toString()),
      textPart('timestamp', timestamp),
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
    console.log('ACR response:', JSON.stringify(data))

    if (data.status?.code === 0 && data.metadata?.music?.length > 0) {
      const match = data.metadata.music[0]
      return NextResponse.json({
        detected: true,
        title: match.title,
        artist: match.artists?.[0]?.name || '',
        album: match.album?.name || '',
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
