import { NextRequest, NextResponse } from 'next/server'

const BASE = 'https://api.setlist.fm/rest/1.0'
const HEADERS = {
  'x-api-key': process.env.SETLISTFM_API_KEY || '',
  'Accept': 'application/json',
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const artist = searchParams.get('artist')?.trim()
  if (!artist) return NextResponse.json({ error: 'artist required' }, { status: 400 })

  try {
    // Step 1: search for artist to get mbid
    const searchRes = await fetch(
      `${BASE}/search/artists?artistName=${encodeURIComponent(artist)}&sort=relevance`,
      { headers: HEADERS, next: { revalidate: 3600 } }
    )
    if (!searchRes.ok) return NextResponse.json({ shows: [], cities: [], totalShows: 0 })
    const searchData = await searchRes.json()
    const artists = searchData?.artist
    if (!artists?.length) return NextResponse.json({ shows: [], cities: [], totalShows: 0 })

    // Pick best match — exact name match first, fallback to first result
    const match = artists.find((a: any) =>
      a.name.toLowerCase() === artist.toLowerCase()
    ) || artists[0]

    const mbid = match.mbid
    if (!mbid) return NextResponse.json({ shows: [], cities: [], totalShows: 0 })

    // Step 2: get setlists for this artist (last 3 pages = up to 60 shows)
    const [page1, page2, page3] = await Promise.allSettled([
      fetch(`${BASE}/artist/${mbid}/setlists?p=1`, { headers: HEADERS, next: { revalidate: 3600 } }),
      fetch(`${BASE}/artist/${mbid}/setlists?p=2`, { headers: HEADERS, next: { revalidate: 3600 } }),
      fetch(`${BASE}/artist/${mbid}/setlists?p=3`, { headers: HEADERS, next: { revalidate: 3600 } }),
    ])

    const allSetlists: any[] = []
    for (const result of [page1, page2, page3]) {
      if (result.status === 'fulfilled' && result.value.ok) {
        const data = await result.value.json()
        if (data?.setlist?.length) allSetlists.push(...data.setlist)
      }
    }

    // Get total from first page
    let totalShows = 0
    if (page1.status === 'fulfilled' && page1.value.ok) {
      const data = await (await fetch(
        `${BASE}/artist/${mbid}/setlists?p=1`,
        { headers: HEADERS, next: { revalidate: 3600 } }
      )).json()
      totalShows = data?.total || allSetlists.length
    }

    // Extract cities and shows
    const cities = Array.from(new Set(
      allSetlists
        .map((s: any) => s.venue?.city?.name)
        .filter(Boolean)
    )) as string[]

    const shows = allSetlists.map((s: any) => ({
      date: s.eventDate,
      venue: s.venue?.name || '',
      city: s.venue?.city?.name || '',
      country: s.venue?.city?.country?.name || '',
      songCount: s.sets?.set?.reduce(
        (acc: number, set: any) => acc + (set.song?.length || 0), 0
      ) || 0,
      source: 'setlistfm' as const,
    }))

    return NextResponse.json({
      artistName: match.name,
      totalShows,
      shows,
      cities,
      mbid,
    })
  } catch (err) {
    console.error('Setlist.fm error:', err)
    return NextResponse.json({ shows: [], cities: [], totalShows: 0 })
  }
}
