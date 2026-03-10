import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audioFile = formData.get('audio') as File
    if (!audioFile) return NextResponse.json({ error: 'No audio' }, { status: 400 })

    const form = new FormData()
    form.append('file', audioFile)
    form.append('api_token', process.env.AUDD_API_KEY!)
    form.append('return', 'spotify')

    const res = await fetch('https://api.audd.io/', {
      method: 'POST',
      body: form,
    })

    const data = await res.json()
    console.log('AudD response:', JSON.stringify(data))

    if (data.status === 'success' && data.result) {
      return NextResponse.json({
        detected: true,
        title: data.result.title,
        artist: data.result.artist,
        album: data.result.album,
        isrc: data.result.spotify?.external_ids?.isrc || '',
      })
    }

    return NextResponse.json({ detected: false, debug: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
