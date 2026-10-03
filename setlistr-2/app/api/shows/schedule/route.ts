import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { zonedLocalTimeToUtc } from '@/lib/scheduleTime'

// Every write here goes through the authenticated (cookie-based, RLS-
// enforcing) client, never a service-role client — authorization
// (can_write_for) and the schedule-transition guards are enforced by
// Postgres itself (supabase/migrations/0020_shared_show_scheduling.sql),
// not re-implemented here. This route's own job is only request shaping,
// timezone conversion, and the duplicate-warning read.

// GET — upcoming (status='scheduled') shows for one artist, used by both
// the artist dashboard and the manager artist-detail agenda. RLS
// (can_act_for) already scopes this to shows the caller may actually see.
export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get('artist_id')
  if (!artistId) return NextResponse.json({ error: 'artist_id required' }, { status: 400 })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('shows')
    .select('id, name, show_type, scheduled_at, timezone, status, created_by, updated_at, venue_id, scheduled_by, scheduled_by_name, venues(name, city, country)')
    .eq('created_by', artistId)
    .eq('status', 'scheduled')
    .order('scheduled_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'Could not load scheduled shows' }, { status: 500 })
  return NextResponse.json({ shows: data || [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { artist_id, venue_id, venue_name, venue_city, venue_country, local_date_time, timezone, name, show_type, confirm_duplicate, resolved_utc } = body

  if (!artist_id || !local_date_time || !timezone) {
    return NextResponse.json({ error: 'artist_id, local_date_time, and timezone are required' }, { status: 400 })
  }
  if (!venue_id && !venue_name) {
    return NextResponse.json({ error: 'A venue is required' }, { status: 400 })
  }

  let scheduledAtIso: string
  if (resolved_utc) {
    // The client already resolved a flagged ambiguous time to one of the
    // two explicit candidates this same conversion returned — re-validate
    // it's a real date, but don't re-run the ambiguity check against it.
    const d = new Date(resolved_utc)
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid resolved time' }, { status: 422 })
    scheduledAtIso = d.toISOString()
  } else {
    const converted = zonedLocalTimeToUtc(local_date_time, timezone)
    if (!converted.ok) {
      if (converted.reason === 'ambiguous') {
        return NextResponse.json({
          error: 'This time occurs twice today due to a daylight saving change — please specify which one.',
          reason: 'ambiguous',
          options: [converted.earlier!.toISOString(), converted.later!.toISOString()],
        }, { status: 422 })
      }
      if (converted.reason === 'nonexistent') {
        return NextResponse.json({ error: "This time doesn't exist on this date in this timezone due to a daylight saving change — please pick a different time.", reason: 'nonexistent' }, { status: 422 })
      }
      return NextResponse.json({ error: 'Invalid date/time or timezone', reason: converted.reason }, { status: 422 })
    }
    scheduledAtIso = converted.utc.toISOString()
  }

  let resolvedVenueId = venue_id || null
  if (!resolvedVenueId) {
    const { data: newVenue, error: venueError } = await supabase
      .from('venues')
      .insert({ name: venue_name.trim(), city: venue_city?.trim() || null, country: venue_country?.trim() || null })
      .select('id').single()
    if (venueError) return NextResponse.json({ error: 'Could not save venue' }, { status: 500 })
    resolvedVenueId = newVenue.id
  }

  // Duplicate warning — read-only, never blocks, never merges. Same
  // artist, same venue, within a 6-hour window of the requested time.
  if (!confirm_duplicate) {
    const scheduledAtMs = new Date(scheduledAtIso).getTime()
    const windowStart = new Date(scheduledAtMs - 6 * 3600_000).toISOString()
    const windowEnd = new Date(scheduledAtMs + 6 * 3600_000).toISOString()
    const { data: candidates } = await supabase
      .from('shows')
      .select('id, scheduled_at, venues(name)')
      .eq('created_by', artist_id)
      .eq('venue_id', resolvedVenueId)
      .eq('status', 'scheduled')
      .gte('scheduled_at', windowStart)
      .lte('scheduled_at', windowEnd)
    if (candidates && candidates.length > 0) {
      return NextResponse.json({
        warning: 'likely_duplicate',
        message: 'A show at this venue around this time is already scheduled.',
        existing: candidates,
      }, { status: 409 })
    }
  }

  const { data: profile } = await supabase.from('profiles').select('full_name, artist_name').eq('id', user.id).single()
  const actorDisplayName = profile?.artist_name || profile?.full_name || null

  const { data: show, error: showError } = await supabase
    .from('shows')
    .insert({
      created_by: artist_id, venue_id: resolvedVenueId, scheduled_at: scheduledAtIso, timezone,
      name: name?.trim() || null, show_type: show_type || 'single', status: 'scheduled',
      scheduled_by: user.id, scheduled_by_name: actorDisplayName,
    })
    .select('id, name, show_type, scheduled_at, timezone, status, created_by, updated_at, venue_id, scheduled_by, scheduled_by_name')
    .single()

  if (showError) return NextResponse.json({ error: 'Could not create the scheduled show' }, { status: 500 })
  return NextResponse.json({ show })
}
