import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

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
    const searchRes = await fetch(
      `${BASE}/search/artists?artistName=${encodeURIComponent(artist)}&sort=relevance`,
      { headers: HEADERS, next: { revalidate: 3600 } }
    )
    if (!searchRes.ok) return NextResponse.json({ shows: [], cities: [], totalShows: 0 })
    const searchData = await searchRes.json()
    const artists = searchData?.artist
    if (!artists?.length) return NextResponse.json({ shows: [], cities: [], totalShows: 0 })

    const match = artists.find((a: any) =>
      a.name.toLowerCase() === artist.toLowerCase()
    ) || artists[0]

    const mbid = match.mbid
    if (!mbid) return NextResponse.json({ shows: [], cities: [], totalShows: 0 })

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

    let totalShows = allSetlists.length
    try {
      if (page1.status === 'fulfilled' && page1.value.ok) {
        const freshRes = await fetch(`${BASE}/artist/${mbid}/setlists?p=1`, { headers: HEADERS })
        const freshData = await freshRes.json()
        totalShows = freshData?.total || allSetlists.length
      }
    } catch {}

    const cities = Array.from(new Set(
      allSetlists.map((s: any) => s.venue?.city?.name).filter(Boolean)
    )) as string[]

    const shows = allSetlists.map((s: any) => ({
      date: s.eventDate,
      venue: s.venue?.name || '',
      city: s.venue?.city?.name || '',
      country: s.venue?.city?.country?.name || '',
      songCount: s.sets?.set?.reduce(
        (acc: number, set: any) => acc + (set.song?.length || 0), 0
      ) || 0,
      songs: s.sets?.set?.flatMap((set: any) => set.song?.map((song: any) => song.name) || []) || [],
      source: 'setlistfm' as const,
    }))

    return NextResponse.json({ artistName: match.name, totalShows, shows, cities, mbid })
  } catch (err) {
    console.error('Setlist.fm error:', err)
    return NextResponse.json({ shows: [], cities: [], totalShows: 0 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { shows, artistName, totalShows, careerStartYear } = await req.json()
    if (!shows?.length) return NextResponse.json({ saved: 0 })

    // Check which dates already exist to avoid duplicates
    const { data: existing } = await supabase
      .from('performances')
      .select('performance_date, venue_name')
      .eq('user_id', user.id)
      .eq('data_source', 'setlistfm_imported')

    const existingKeys = new Set(
      (existing || []).map((p: any) => `${p.performance_date}|${p.venue_name}`)
    )

    const toInsert = shows
      .filter((s: any) => {
        const key = `${s.date}|${s.venue}`
        return !existingKeys.has(key)
      })
      .map((s: any) => ({
        user_id: user.id,
        artist_name: artistName,
        venue_name: s.venue || 'Unknown Venue',
        city: s.city || '',
        country: s.country || '',
        performance_date: parseSetlistDate(s.date),
        start_time: '20:00',
        set_duration_minutes: Math.max(30, (s.songCount || 8) * 4),
        status: 'complete',
        data_source: 'setlistfm_imported',
        notes: `Imported from Setlist.fm · ${s.songCount || 0} songs`,
      }))

    if (!toInsert.length) return NextResponse.json({ saved: 0 })

    const { data: inserted, error } = await supabase
      .from('performances')
      .insert(toInsert)
      .select('id')

    if (error) {
      console.error('Supabase insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Update profile with real career totals
    if (totalShows || careerStartYear) {
      const updateData: any = {}
      if (totalShows) updateData.career_total_shows = totalShows
      if (careerStartYear) updateData.career_start_year = careerStartYear
      await supabase.from('profiles').update(updateData).eq('id', user.id)
    }

    return NextResponse.json({ saved: inserted?.length || 0 })
  } catch (err) {
    console.error('POST setlistfm error:', err)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}

function parseSetlistDate(dateStr: string): string {
  // Setlist.fm format: DD-MM-YYYY
  if (!dateStr) return new Date().toISOString().split('T')[0]
  const parts = dateStr.split('-')
  if (parts.length === 3) {
    const [day, month, year] = parts
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  return dateStr
}
