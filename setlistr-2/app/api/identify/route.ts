import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audioFile = formData.get('audio') as File
    if (!audioFile) return NextResponse.json({ error: 'No audio' }, { status: 400 })

    const arrayBuffer = await audioFile.arrayBuffer()
    const audioBuffer = Buffer.from(arrayBuffer)

    console.log('Shazam: audio bytes:', audioBuffer.length)

    const res = await fetch('https://shazam-song-recognition-api.p.rapidapi.com/recognize/file', {
      method: 'POST',
      headers: {
        'x-rapidapi-host': 'shazam-song-recognition-api.p.rapidapi.com',
        'x-rapidapi-key': process.env.RAPIDAPI_KEY!,
        'Content-Type': 'audio/webm',
      },
      body: audioBuffer,
    })

    const data = await res.json()
    console.log('Shazam response:', JSON.stringify(data))

    if (data?.track?.title) {
      return NextResponse.json({
        detected: true,
        title: data.track.title,
        artist: data.track.subtitle || '',
      })
    } else {
      return NextResponse.json({
        detected: false,
        debug: data
      })
    }
  } catch (err) {
    console.error('Shazam error:', err)
    return NextResponse.json({ error: 'Identification failed' }, { status: 500 })
  }
}

