import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { zonedLocalTimeToUtc } from '@/lib/scheduleTime'

// PATCH — edit a still-scheduled show. Concurrency: the client must send
// back the expected_updated_at it last read; the UPDATE's own WHERE
// clause includes it, so a stale edit affects zero rows atomically — no
// separate SELECT-then-UPDATE gap. Authorization (can_write_for) and "no
// editing after capture started" (SCHEDULE_LOCKED) are enforced by
// Postgres itself (0020_shared_show_scheduling.sql's trigger), not
// re-checked here — this route does not claim to be the enforcement
// boundary, only to shape the request and translate the DB's rejection
// into a clear response.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { expected_updated_at, venue_id, venue_name, venue_city, venue_country, local_date_time, timezone, name, show_type, resolved_utc } = body
  if (!expected_updated_at) return NextResponse.json({ error: 'expected_updated_at required' }, { status: 400 })

  // Creating a new venue is a real side effect that must not happen for an
  // edit that's obviously going to be rejected anyway (a stale token, or a
  // show that's already live/completed/cancelled) — this pre-check is not
  // itself the concurrency guarantee (the final UPDATE's own WHERE clause
  // plus the DB trigger still are, against a genuine race), it only avoids
  // leaving an orphaned venues row behind in the common, non-racing case
  // where the edit was simply never going to succeed. Confirmed necessary
  // by actually hitting it: without this, a stale/locked edit that also
  // tried to introduce a new venue left that venue row behind anyway.
  if (venue_name && !venue_id) {
    const { data: current } = await supabase.from('shows').select('status, updated_at').eq('id', params.id).maybeSingle()
    if (!current || current.updated_at !== expected_updated_at) {
      return NextResponse.json({ error: 'This was changed elsewhere — reload and try again.' }, { status: 409 })
    }
    if (current.status !== 'scheduled') {
      return NextResponse.json({ error: 'This show can no longer be edited — it may have already started.' }, { status: 409 })
    }
  }

  const patch: Record<string, any> = {}
  if (venue_id) {
    patch.venue_id = venue_id
  } else if (venue_name) {
    // Editing to a brand-new venue (not re-pointing to an existing one) —
    // mirrors the POST route's own creation logic exactly, same
    // never-invent-coordinates rule: city/country are stored as given,
    // nothing geocoded or guessed here.
    if (!venue_city?.trim()) return NextResponse.json({ error: 'Add a city for this venue so it can be told apart from others with the same name.' }, { status: 400 })
    const { data: newVenue, error: venueError } = await supabase
      .from('venues')
      .insert({ name: venue_name.trim(), city: venue_city.trim(), country: venue_country?.trim() || null })
      .select('id').single()
    if (venueError) return NextResponse.json({ error: 'Could not save venue' }, { status: 500 })
    patch.venue_id = newVenue.id
  }
  if (name !== undefined) patch.name = name?.trim() || null
  if (show_type) patch.show_type = show_type

  if (resolved_utc) {
    const d = new Date(resolved_utc)
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid resolved time' }, { status: 422 })
    patch.scheduled_at = d.toISOString()
    if (timezone) patch.timezone = timezone
  } else if (local_date_time || timezone) {
    if (!local_date_time || !timezone) return NextResponse.json({ error: 'Both local_date_time and timezone are required together' }, { status: 400 })
    const converted = zonedLocalTimeToUtc(local_date_time, timezone)
    if (!converted.ok) {
      if (converted.reason === 'ambiguous') {
        return NextResponse.json({ error: 'This time occurs twice today due to a daylight saving change — please specify which one.', reason: 'ambiguous', options: [converted.earlier!.toISOString(), converted.later!.toISOString()] }, { status: 422 })
      }
      if (converted.reason === 'nonexistent') {
        return NextResponse.json({ error: "This time doesn't exist on this date in this timezone — please pick a different time.", reason: 'nonexistent' }, { status: 422 })
      }
      return NextResponse.json({ error: 'Invalid date/time or timezone', reason: converted.reason }, { status: 422 })
    }
    patch.scheduled_at = converted.utc.toISOString()
    patch.timezone = timezone
  }

  const { data, error } = await supabase
    .from('shows')
    .update(patch)
    .eq('id', params.id)
    .eq('updated_at', expected_updated_at)
    .select('id, name, show_type, scheduled_at, timezone, status, updated_at, venue_id')

  if (error) {
    // SCHEDULE_LOCKED from the DB trigger — a real rejection, not "nothing matched."
    return NextResponse.json({ error: 'This show can no longer be edited — it may have already started.' }, { status: 409 })
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'This was changed elsewhere — reload and try again.' }, { status: 409 })
  }
  return NextResponse.json({ show: data[0] })
}
