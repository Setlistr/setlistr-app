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

    const timestamp = Math.floor(Date.now() / 1000).toString()
    const stringToSign = ['POST', '/v1/identify', accessKey, 'audio', '1', timestamp].join('\n')
    const signature = crypto.createHmac('sha1', accessSecret).update(stringToSign).digest('base64')

    const body = new FormData()
    body.append('access_key', accessKey)
    body.append('sample_bytes', sampleBytes.toString())
    body.append('timestamp', timestamp)
    body.append('signature', signature)
    body.append('data_type', 'audio')
    body.append('signature_version', '1')
    body.append('sample', new Blob([audioBuffer]), 'audio.webm')

    const res = await fetch(`https://${host}/v1/identify`, {
      method: 'POST',
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
