import { NextRequest, NextResponse } from 'next/server'

const BASE = 'https://ws.audioscrobbler.com/2.0'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const artist = searchParams.get('artist')?.trim()
  if (!artist) return NextResponse.json({ error: 'artist required' }, { status: 400 })

  const key = process.env.LASTFM_API_KEY
  if (!key) return NextResponse.json({ found: false })

  try {
    // Get artist info for validation and listener count
    const infoRes = await fetch(
      `${BASE}/?method=artist.getinfo&artist=${encodeURIComponent(artist)}&api_key=${key}&format=json`,
      { next: { revalidate: 3600 } }
    )
    if (!infoRes.ok) return NextResponse.json({ found: false })
    const info = await infoRes.json()
    if (info.error || !info.artist) return NextResponse.json({ found: false })

    const artistData = info.artist
    const listeners = parseInt(artistData.stats?.listeners || '0')
    const playcount = parseInt(artistData.stats?.playcount || '0')

    // Get top tracks to help seed catalog
    const tracksRes = await fetch(
      `${BASE}/?method=artist.gettoptracks&artist=${encodeURIComponent(artist)}&api_key=${key}&format=json&limit=20`,
      { next: { revalidate: 3600 } }
    )
    let topTracks: string[] = []
    if (tracksRes.ok) {
      const tracksData = await tracksRes.json()
      topTracks = tracksData?.toptracks?.track?.map((t: any) => t.name) || []
    }

    return NextResponse.json({
      found: true,
      artistName: artistData.name,
      listeners,
      playcount,
      topTracks,
      url: artistData.url,
    })
  } catch (err) {
    console.error('Last.fm error:', err)
    return NextResponse.json({ found: false })
  }
}
