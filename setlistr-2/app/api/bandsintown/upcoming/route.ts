import { NextRequest, NextResponse } from 'next/server'

const APP_ID = process.env.BANDSINTOWN_APP_ID!

export async function GET(req: NextRequest) {
  const artist = req.nextUrl.searchParams.get('artist')?.trim()
  if (!artist) {
    return NextResponse.json({ error: 'artist param required' }, { status: 400 })
  }
  if (!APP_ID) {
    return NextResponse.json({ error: 'BANDSINTOWN_APP_ID not set' }, { status: 500 })
  }

  try {
    const url = `https://rest.bandsintown.com/artists/${encodeURIComponent(artist)}/events?app_id=${APP_ID}&api_version=3.0`
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 3600 }, // cache for 1 hour
    })

    if (!res.ok) {
      console.error('Bandsintown error:', res.status, await res.text())
      return NextResponse.json({ events: [] })
    }

    const data = await res.json()

    // Bandsintown returns a string "warn=notfound" when artist doesn't exist
    if (!Array.isArray(data)) {
      return NextResponse.json({ events: [] })
    }

    // Shape the events into what the dashboard needs
    const events = data.map((e: any) => ({
      id: e.id,
      datetime: e.datetime,          // "2025-04-15T20:00:00"
      venueName: e.venue?.name || '',
      venueCity: e.venue?.city || '',
      venueRegion: e.venue?.region || '',
      venueCountry: e.venue?.country || '',
      url: e.url || '',
      lineup: e.lineup || [],
      description: e.description || '',
    }))

    return NextResponse.json({ events })
  } catch (err: any) {
    console.error('Bandsintown fetch error:', err)
    return NextResponse.json({ events: [] })
  }
}
