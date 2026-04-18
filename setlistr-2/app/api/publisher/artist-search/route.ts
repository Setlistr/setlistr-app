import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TM_API_KEY = process.env.TICKETMASTER_API_KEY!

// ── UMPG Nashville demo seed ──────────────────────────────────────────────────
// Pre-calculated estimated annual royalties for the Cyndi demo.
// Formula: avg shows/yr × 12 songs × per-song rate × territory multiplier
// Replace with live calculation post-funding.
const UMPG_DEMO_SEED: Record<string, { estimatedAnnual: number; tourSize: string }> = {
  'luke combs':        { estimatedAnnual: 42000, tourSize: 'Arena' },
  'keith urban':       { estimatedAnnual: 28500, tourSize: 'Arena' },
  'sam hunt':          { estimatedAnnual: 22000, tourSize: 'Theater' },
  'maren morris':      { estimatedAnnual: 18200, tourSize: 'Theater' },
  'kenny chesney':     { estimatedAnnual: 38000, tourSize: 'Arena' },
  'scotty mccreery':   { estimatedAnnual: 12400, tourSize: 'Theater' },
  'brett kissel':      { estimatedAnnual: 9200,  tourSize: 'Theater' },
  'hunter hayes':      { estimatedAnnual: 8800,  tourSize: 'Theater' },
  'ingrid andress':    { estimatedAnnual: 7200,  tourSize: 'Theater' },
  'morgan wade':       { estimatedAnnual: 4800,  tourSize: 'Club' },
  'cooper alan':       { estimatedAnnual: 5600,  tourSize: 'Theater' },
  'ian munsick':       { estimatedAnnual: 6400,  tourSize: 'Theater' },
  'caylee hammack':    { estimatedAnnual: 4100,  tourSize: 'Club' },
  'caitlyn smith':     { estimatedAnnual: 3800,  tourSize: 'Club' },
  'carter faith':      { estimatedAnnual: 2400,  tourSize: 'Club' },
  'jonah kagen':       { estimatedAnnual: 3200,  tourSize: 'Club' },
  'dylan gossett':     { estimatedAnnual: 2800,  tourSize: 'Club' },
  'dillon james':      { estimatedAnnual: 3100,  tourSize: 'Club' },
  'megan moroney':     { estimatedAnnual: 6800,  tourSize: 'Theater' },
  'laci kaye booth':   { estimatedAnnual: 2600,  tourSize: 'Club' },
  'brandi carlile':    { estimatedAnnual: 14200, tourSize: 'Theater' },
  'shania twain':      { estimatedAnnual: 31000, tourSize: 'Arena' },
  'sara evans':        { estimatedAnnual: 8200,  tourSize: 'Theater' },
}

async function getUpcomingShows(artistName: string): Promise<{ count: number; nextVenue: string; nextDate: string }> {
  if (!TM_API_KEY) return { count: 0, nextVenue: '', nextDate: '' }
  try {
    const params = new URLSearchParams({
      keyword: artistName, classificationName: 'music',
      size: '10', sort: 'date,asc', apikey: TM_API_KEY,
    })
    const res = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`, { next: { revalidate: 3600 } })
    if (!res.ok) return { count: 0, nextVenue: '', nextDate: '' }
    const data = await res.json()
    const events = data?._embedded?.events || []
    const next = events[0]
    const venue = next?._embedded?.venues?.[0]
    return {
      count: events.length,
      nextVenue: venue?.name || '',
      nextDate: next?.dates?.start?.localDate || '',
    }
  } catch {
    return { count: 0, nextVenue: '', nextDate: '' }
  }
}

export async function GET(req: NextRequest) {
  const artistName  = req.nextUrl.searchParams.get('artist')?.trim()
  const publisherId = req.nextUrl.searchParams.get('publisher_id')?.trim()

  if (!artistName) return NextResponse.json({ error: 'artist param required' }, { status: 400 })

  const nameLower = artistName.toLowerCase()

  // ── 1. Check Setlistr profiles ────────────────────────────────────────────
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, artist_name, pro_affiliation, created_at')
    .ilike('artist_name', `%${artistName}%`)
    .limit(3)

  const match = profiles?.[0]

  if (match) {
    // Found in Setlistr — get their show data
    const { data: shows } = await supabase
      .from('performances')
      .select('id, started_at, submission_status')
      .eq('user_id', match.id)
      .not('status', 'in', '("live","pending")')
      .order('started_at', { ascending: false })
      .limit(50)

    const totalShows = shows?.length || 0
    const submitted  = shows?.filter(s => s.submission_status === 'submitted').length || 0
    const lastShow   = shows?.[0]?.started_at || null
    const daysSince  = lastShow ? Math.floor((Date.now() - new Date(lastShow).getTime()) / 86400000) : 999
    const status     = daysSince <= 30 ? 'active' : 'inactive'
    const submissionRate = totalShows > 0 ? Math.round((submitted / totalShows) * 100) : 0

    // Check if already on this publisher's roster
    let alreadyOnRoster = false
    if (publisherId) {
      const { data: rosterCheck } = await supabase
        .from('publisher_roster')
        .select('id')
        .eq('publisher_id', publisherId)
        .eq('artist_user_id', match.id)
        .maybeSingle()
      alreadyOnRoster = !!rosterCheck
    }

    const demo = UMPG_DEMO_SEED[match.artist_name?.toLowerCase() || '']
    const upcomingShows = await getUpcomingShows(match.artist_name || artistName)

    return NextResponse.json({
      found_in_setlistr: true,
      status,
      user_id: match.id,
      artist_name: match.artist_name,
      pro_affiliation: match.pro_affiliation,
      total_shows: totalShows,
      submission_rate: submissionRate,
      last_active: lastShow,
      days_since_active: daysSince,
      already_on_roster: alreadyOnRoster,
      upcoming_shows: upcomingShows,
      estimated_annual_royalties: demo?.estimatedAnnual || Math.round(totalShows * 12 * 2.5),
      tour_size: demo?.tourSize || 'Unknown',
    })
  }

  // ── 2. Not in Setlistr — check if publisher already invited them ──────────
  let alreadyInvited = false
  if (publisherId) {
    const { data: inviteCheck } = await supabase
      .from('publisher_roster_invites')
      .select('id, invited_at')
      .eq('publisher_id', publisherId)
      .ilike('artist_name', `%${artistName}%`)
      .maybeSingle()
    alreadyInvited = !!inviteCheck
  }

  // ── 3. Check UMPG demo seed ───────────────────────────────────────────────
  const demo = UMPG_DEMO_SEED[nameLower]

  // ── 4. Hit Ticketmaster for upcoming shows ────────────────────────────────
  const upcomingShows = await getUpcomingShows(artistName)

  return NextResponse.json({
    found_in_setlistr: false,
    status: alreadyInvited ? 'invited' : 'not_activated',
    user_id: null,
    artist_name: artistName,
    pro_affiliation: null,
    total_shows: 0,
    submission_rate: 0,
    last_active: null,
    days_since_active: null,
    already_on_roster: false,
    already_invited: alreadyInvited,
    upcoming_shows: upcomingShows,
    estimated_annual_royalties: demo?.estimatedAnnual || (upcomingShows.count > 0 ? upcomingShows.count * 12 * 3 : 0),
    tour_size: demo?.tourSize || (upcomingShows.count > 8 ? 'Theater' : 'Club'),
  })
}
