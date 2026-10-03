import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { zonedLocalTimeToUtc } from '@/lib/scheduleTime'

// PATCH — edit a still-scheduled show. Concurrency: venue creation (when
// introducing a brand-new venue) and the show update now happen inside a
// single DB transaction — supabase/migrations/0021_schedule_patch_atomic_
// venue.sql's patch_scheduled_show_with_venue(), which locks the show row
// (FOR UPDATE), re-checks status/updated_at under that lock, and only
// then creates the venue and applies the update. A stale or locked edit
// raises before the venue insert ever runs, so nothing is left orphaned —
// a JS-side pre-check followed by separate insert/update calls could not
// close that window (confirmed by actually hitting the race: a stale/
// locked edit that also introduced a new venue left that venue row behind
// anyway). Authorization (can_write_for) is re-checked inside the
// function itself, same as before.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { expected_updated_at, venue_id, venue_name, venue_city, venue_country, local_date_time, timezone, name, show_type, resolved_utc } = body
  if (!expected_updated_at) return NextResponse.json({ error: 'expected_updated_at required' }, { status: 400 })

  if (venue_name && !venue_id && !venue_city?.trim()) {
    return NextResponse.json({ error: 'Add a city for this venue so it can be told apart from others with the same name.' }, { status: 400 })
  }

  const patch: Record<string, any> = {}
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

  const { data, error } = await supabase.rpc('patch_scheduled_show_with_venue', {
    p_show_id: params.id,
    p_expected_updated_at: expected_updated_at,
    p_venue_id: venue_id || null,
    p_new_venue_name: venue_id ? null : (venue_name?.trim() || null),
    p_new_venue_city: venue_id ? null : (venue_city?.trim() || null),
    p_new_venue_country: venue_id ? null : (venue_country?.trim() || null),
    p_patch: patch,
  })

  if (error) {
    if (error.message?.includes('STALE_VERSION')) {
      return NextResponse.json({ error: 'This was changed elsewhere — reload and try again.' }, { status: 409 })
    }
    if (error.message?.includes('SHOW_LOCKED')) {
      return NextResponse.json({ error: 'This show can no longer be edited — it may have already started.' }, { status: 409 })
    }
    if (error.message?.includes('NOT_AUTHORIZED') || error.message?.includes('NOT_AUTHENTICATED')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
    if (error.message?.includes('SHOW_NOT_FOUND')) {
      return NextResponse.json({ error: 'This show no longer exists.' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Could not save this edit.' }, { status: 500 })
  }

  const row = Array.isArray(data) ? data[0] : data
  return NextResponse.json({ show: row })
}
