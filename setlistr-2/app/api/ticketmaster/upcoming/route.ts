import { NextRequest, NextResponse } from 'next/server'

const API_KEY = process.env.TICKETMASTER_API_KEY!

export async function GET(req: NextRequest) {
  const artist = req.nextUrl.searchParams.get('artist')?.trim()
  if (!artist) {
    return NextResponse.json({ error: 'artist param required' }, { status: 400 })
  }
  if (!API_KEY) {
    return NextResponse.json({ error: 'TICKETMASTER_API_KEY not set' }, { status: 500 })
  }

  try {
    const params = new URLSearchParams({
      keyword: artist,
      classificationName: 'music',
      size: '5',
      sort: 'date,asc',
      apikey: API_KEY,
    })

    const url = `https://app.ticketmaster.com/discovery/v2/events.json?${params}`
    const res = await fetch(url, { next: { revalidate: 3600 } })

    if (!res.ok) {
      console.error('Ticketmaster error:', res.status)
      return NextResponse.json({ events: [] })
    }

    const data = await res.json()
    const raw = data?._embedded?.events

    if (!Array.isArray(raw) || raw.length === 0) {
      return NextResponse.json({ events: [] })
    }

    const events = raw.map((e: any) => {
      const venue = e._embedded?.venues?.[0]
      return {
        id: e.id,
        name: e.name,
        datetime: e.dates?.start?.dateTime || `${e.dates?.start?.localDate}T${e.dates?.start?.localTime || '00:00:00'}`,
        venueName: venue?.name || '',
        venueCity: venue?.city?.name || '',
        venueRegion: venue?.state?.stateCode || venue?.state?.name || '',
        venueCountry: venue?.country?.countryCode || '',
        url: e.url || '',
      }
    })

    return NextResponse.json({ events })
  } catch (err: any) {
    console.error('Ticketmaster fetch error:', err)
    return NextResponse.json({ events: [] })
  }
}
