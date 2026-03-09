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

    // Convert file to buffer to get exact byte length
    const arrayBuffer = await audioFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const sampleBytes = buffer.length

    console.log('ACR: audio size bytes:', sampleBytes)

    const httpMethod = 'POST'
    const httpUri = '/v1/identify'
    const dataType = 'audio'
    const signatureVersion = '1'
    const timestamp = Math.floor(Date.now() / 1000).toString()

    const stringToSign = [httpMethod, httpUri, accessKey, dataType, signatureVersion, timestamp].join('\n')
    const signature = crypto.createHmac('sha1', accessSecret).update(stringToSign).digest('base64')

    console.log('ACR: stringToSign:', stringToSign)
    console.log('ACR: signature:', signature)

    const acrForm = new FormData()
    const audioBlob = new Blob([buffer], { type: audioFile.type || 'audio/webm' })
    acrForm.append('sample', audioBlob, 'audio.webm')
    acrForm.append('access_key', accessKey)
    acrForm.append('data_type', dataType)
    acrForm.append('signature_version', signatureVersion)
    acrForm.append('signature', signature)
    acrForm.append('sample_bytes', sampleBytes.toString())
    acrForm.append('timestamp', timestamp)

    const res = await fetch(`https://${host}/v1/identify`, {
      method: 'POST',
      body: acrForm,
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
