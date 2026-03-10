import { NextRequest, NextResponse } from 'next/server'
// @ts-ignore
import acrcloud from 'acrcloud'

const acr = new acrcloud({
  host: process.env.ACRCLOUD_HOST,
  access_key: process.env.ACRCLOUD_ACCESS_KEY,
  access_secret: process.env.ACRCLOUD_ACCESS_SECRET,
})

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audioFile = formData.get('audio') as File
    if (!audioFile) return NextResponse.json({ error: 'No audio' }, { status: 400 })

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer())

    const data = await acr.identify(audioBuffer)
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
