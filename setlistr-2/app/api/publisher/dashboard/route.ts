import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const publisherId = req.nextUrl.searchParams.get('publisher_id')
  if (!publisherId) {
    return NextResponse.json({ error: 'publisher_id required' }, { status: 400 })
  }

  try {
    // Get publisher account
    const { data: publisher } = await supabase
      .from('publisher_accounts')
      .select('*')
      .eq('id', publisherId)
      .single()

    if (!publisher) {
      return NextResponse.json({ error: 'Publisher not found' }, { status: 404 })
    }

    // Get roster artists
    const { data: roster } = await supabase
      .from('publisher_roster')
      .select('artist_user_id, artist_name, added_at')
      .eq('publisher_id', publisherId)

    if (!roster || roster.length === 0) {
      return NextResponse.json({ publisher, artists: [], summary: { totalShows: 0, totalSongs: 0, unsubmittedShows: 0, estimatedUnclaimed: 0 } })
    }

    const artistIds = roster.map(r => r.artist_user_id)

    // Get all performances for roster artists
    const { data: performances } = await supabase
      .from('performances')
      .select('id, user_id, venue_name, city, country, status, submission_status, started_at, ended_at, created_at, shows(show_type), venues(capacity)')
      .in('user_id', artistIds)
      .not('status', 'in', '("live","pending")')
      .order('started_at', { ascending: false })

    // Get song counts for all performances
    const perfIds = (performances || []).map(p => p.id)
    let songCounts: Record<string, number> = {}

    if (perfIds.length > 0) {
      const { data: songs } = await supabase
        .from('performance_songs')
        .select('performance_id')
        .in('performance_id', perfIds)

      songs?.forEach(s => {
        songCounts[s.performance_id] = (songCounts[s.performance_id] || 0) + 1
      })
    }

    // Build per-artist data
    const artists = roster.map(r => {
      const artistPerfs = (performances || []).filter(p => p.user_id === r.artist_user_id)
      const totalShows = artistPerfs.length
      const totalSongs = artistPerfs.reduce((acc, p) => acc + (songCounts[p.id] || 0), 0)
      const unsubmitted = artistPerfs.filter(p => p.submission_status !== 'submitted').length
      const lastShow = artistPerfs[0] || null

      // Estimate unclaimed royalties
      let estimatedUnclaimed = 0
      artistPerfs
        .filter(p => p.submission_status !== 'submitted')
        .forEach(p => {
          const songs = songCounts[p.id] || 0
          if (songs > 0) {
            // Simple heuristic: avg $2 per song per show
            estimatedUnclaimed += songs * 2
          }
        })

      // Recent shows (last 5)
      const recentShows = artistPerfs.slice(0, 5).map(p => ({
        id: p.id,
        venue_name: p.venue_name,
        city: p.city,
        country: p.country,
        started_at: p.started_at,
        status: p.status,
        submission_status: p.submission_status,
        song_count: songCounts[p.id] || 0,
        show_type: (p as any).shows?.show_type || 'single',
      }))

      return {
        user_id: r.artist_user_id,
        artist_name: r.artist_name,
        added_at: r.added_at,
        totalShows,
        totalSongs,
        unsubmitted,
        estimatedUnclaimed: Math.round(estimatedUnclaimed),
        lastShow: lastShow ? {
          venue_name: lastShow.venue_name,
          city: lastShow.city,
          started_at: lastShow.started_at,
          submission_status: lastShow.submission_status,
        } : null,
        recentShows,
      }
    })

    // Summary totals
    const summary = {
      totalShows: artists.reduce((a, b) => a + b.totalShows, 0),
      totalSongs: artists.reduce((a, b) => a + b.totalSongs, 0),
      unsubmittedShows: artists.reduce((a, b) => a + b.unsubmitted, 0),
      estimatedUnclaimed: artists.reduce((a, b) => a + b.estimatedUnclaimed, 0),
    }

    return NextResponse.json({ publisher, artists, summary })

  } catch (err: any) {
    console.error('Publisher dashboard error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
