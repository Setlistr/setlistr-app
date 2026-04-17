import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function daysUntilDeadline(startedAt: string): number {
  const showDate = new Date(startedAt)
  const deadline = new Date(showDate)
  deadline.setFullYear(deadline.getFullYear() + 1)
  return Math.ceil((deadline.getTime() - Date.now()) / 86400000)
}

function estimateShowValue(songCount: number, showType: string): number {
  if (songCount === 0) return 0
  // Base rate: small venue, weighted by song count
  // Writers rounds earn less per song (split), festivals earn more
  const base = songCount * 2.5
  if (showType === 'writers_round') return Math.round(base * 0.6)
  if (showType === 'festival') return Math.round(base * 2.2)
  return Math.round(base)
}

function urgencyLevel(daysLeft: number): 'critical' | 'warning' | 'monitor' {
  if (daysLeft <= 30) return 'critical'
  if (daysLeft <= 90) return 'warning'
  return 'monitor'
}

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
      return NextResponse.json({
        publisher, artists: [], summary: { totalShows: 0, totalSongs: 0, unsubmittedShows: 0, estimatedUnclaimed: 0, projectedAnnual: 0 },
        recoveryQueue: [],
      })
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

      let estimatedUnclaimed = 0
      artistPerfs
        .filter(p => p.submission_status !== 'submitted')
        .forEach(p => {
          estimatedUnclaimed += estimateShowValue(
            songCounts[p.id] || 0,
            (p as any).shows?.show_type || 'single'
          )
        })

      const recentShows = artistPerfs.slice(0, 8).map(p => ({
        id: p.id,
        venue_name: p.venue_name,
        city: p.city,
        country: p.country,
        started_at: p.started_at,
        status: p.status,
        submission_status: p.submission_status,
        song_count: songCounts[p.id] || 0,
        show_type: (p as any).shows?.show_type || 'single',
        estimated_value: estimateShowValue(songCounts[p.id] || 0, (p as any).shows?.show_type || 'single'),
        days_until_deadline: daysUntilDeadline(p.started_at),
      }))

      return {
        user_id: r.artist_user_id,
        artist_name: r.artist_name,
        added_at: r.added_at,
        totalShows,
        totalSongs,
        unsubmitted,
        estimatedUnclaimed: Math.round(estimatedUnclaimed),
        lastShow: artistPerfs[0] ? {
          venue_name: artistPerfs[0].venue_name,
          city: artistPerfs[0].city,
          started_at: artistPerfs[0].started_at,
          submission_status: artistPerfs[0].submission_status,
        } : null,
        recentShows,
      }
    })

    // ── Recovery Queue — all unsubmitted shows ranked by deadline urgency ──
    const recoveryQueue = artists
      .flatMap(a =>
        a.recentShows
          .filter(s => s.submission_status !== 'submitted' && s.days_until_deadline > 0)
          .map(s => ({
            ...s,
            artist_name: a.artist_name,
            artist_user_id: a.user_id,
            urgency: urgencyLevel(s.days_until_deadline),
          }))
      )
      .sort((a, b) => a.days_until_deadline - b.days_until_deadline)
      .slice(0, 20)

    // ── Projected annual value ──
    // Find data range to extrapolate
    const allDates = (performances || []).map(p => new Date(p.started_at).getTime())
    const earliestShow = allDates.length > 0 ? Math.min(...allDates) : Date.now()
    const monthsCovered = Math.max(1, (Date.now() - earliestShow) / (1000 * 60 * 60 * 24 * 30))
    const totalUnclaimedNow = artists.reduce((a, b) => a + b.estimatedUnclaimed, 0)
    const projectedAnnual = Math.round((totalUnclaimedNow / monthsCovered) * 12)

    // Summary totals
    const summary = {
      totalShows: artists.reduce((a, b) => a + b.totalShows, 0),
      totalSongs: artists.reduce((a, b) => a + b.totalSongs, 0),
      unsubmittedShows: artists.reduce((a, b) => a + b.unsubmitted, 0),
      estimatedUnclaimed: totalUnclaimedNow,
      projectedAnnual,
    }

    return NextResponse.json({ publisher, artists, summary, recoveryQueue })

  } catch (err: any) {
    console.error('Publisher dashboard error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
