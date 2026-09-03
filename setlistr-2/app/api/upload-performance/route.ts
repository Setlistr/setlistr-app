import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// ─── Standalone Upload Performance: draft creation + finalize ────────────────
// Authorization pattern mirrors app/api/team/invite/route.ts exactly: the
// caller is authenticated via the existing cookie-based server client, and if
// they're acting on behalf of someone else (targetUserId / the performance's
// owner), an accepted artist_delegates row is verified server-side via the
// service-role client BEFORE any write. This exists because performances'
// own RLS policies (`auth.uid() = user_id`, no delegate carve-out) would
// reject a delegate's insert/update through the plain browser client — see
// the read-only recon this route is built from.

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function authenticate() {
  const authSupabase = await createServerSupabaseClient()
  const { data: { user } } = await authSupabase.auth.getUser()
  return user
}

async function isAuthorizedFor(callerId: string, ownerId: string): Promise<boolean> {
  if (callerId === ownerId) return true
  const { data: delegation } = await service
    .from('artist_delegates')
    .select('id')
    .eq('artist_id', ownerId)
    .eq('delegate_id', callerId)
    .not('accepted_at', 'is', null)
    .maybeSingle()
  return !!delegation
}

// ── POST: create the minimal draft performance needed to obtain a
//    performance_id before any metadata has been entered. ─────────────────
export async function POST(req: NextRequest) {
  try {
    const { targetUserId } = await req.json()
    if (!targetUserId) return NextResponse.json({ error: 'targetUserId required' }, { status: 400 })

    const user = await authenticate()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const authorized = await isAuthorizedFor(user.id, targetUserId)
    if (!authorized) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    // Only past this point does any write occur, via the service-role client.
    //
    // PLACEHOLDER VALUES — flagged, not silently chosen. venue_name and
    // performance_date could not be confirmed NOT NULL from this environment
    // (no raw-SQL/information_schema access available), but both existing
    // upload/creation flows always supply non-empty values and never attempt
    // a null insert, so treating them as required was the safest assumption.
    // venue_name uses '' (empty string — non-null, unambiguously "not yet
    // set", satisfies a NOT NULL constraint either way). performance_date
    // uses "now" (matches the existing default used elsewhere for this same
    // field before a real date is chosen). shows.name uses 'Show', matching
    // the exact fallback string /app/show/new already uses for the same
    // "nothing entered yet" case (`venueQuery.trim() || 'Show'`).
    const nowIso = new Date().toISOString()

    const { data: show, error: showError } = await service.from('shows').insert({
      name: 'Show',
      show_type: 'single',
      started_at: nowIso,
      status: 'completed', // recording is of a show that already happened
      created_by: targetUserId,
    }).select().single()
    if (showError || !show) {
      console.error('[UploadPerformance] show insert failed:', showError)
      return NextResponse.json({ error: 'Failed to create show' }, { status: 500 })
    }

    const { data: performance, error: perfError } = await service.from('performances').insert({
      show_id: show.id,
      user_id: targetUserId,
      artist_name: '',
      venue_name: '',
      performance_date: nowIso,
      status: 'draft',
      set_duration_minutes: null,
      auto_close_buffer_minutes: 5,
      data_source: 'captured',
      started_at: nowIso,
    }).select().single()
    if (perfError || !performance) {
      console.error('[UploadPerformance] performance insert failed:', perfError)
      return NextResponse.json({ error: 'Failed to create performance' }, { status: 500 })
    }

    return NextResponse.json({ performance_id: performance.id, show_id: show.id })
  } catch (err: any) {
    console.error('[UploadPerformance] create-draft error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── PATCH: finalize — save show details and (optionally) write the
//    detected songs, once scanning and metadata are both complete. ────────
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { performance_id, venue_name, performance_date, start_time, show_type, songs, setlist_photo_url } = body
    if (!performance_id) return NextResponse.json({ error: 'performance_id required' }, { status: 400 })
    if (!venue_name || !String(venue_name).trim()) return NextResponse.json({ error: 'venue_name required' }, { status: 400 })
    if (!performance_date) return NextResponse.json({ error: 'performance_date required' }, { status: 400 })

    const user = await authenticate()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Resolve the performance's owner via service role — a delegate can't
    // reliably read the base `performances` table under its own RLS either,
    // so this lookup itself must bypass RLS, same reasoning as create-draft.
    const { data: perfRow } = await service
      .from('performances')
      .select('user_id, show_id')
      .eq('id', performance_id)
      .single()
    if (!perfRow) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    const authorized = await isAuthorizedFor(user.id, perfRow.user_id)
    if (!authorized) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    // ── Idempotency guard ────────────────────────────────────────────────
    // draft → review is a one-way transition this route owns exclusively.
    // Gating the update on `.eq('status', 'draft')` makes it atomic and
    // self-limiting: only the PATCH that actually flips the status gets to
    // proceed to the songs insert below. A repeat PATCH (status already
    // 'review' — or any performance that was never a draft to begin with,
    // e.g. one created by live capture) matches zero rows here and is
    // treated as already-finalized: metadata and songs are left untouched,
    // and the response is still a plain success so the client can navigate
    // to Review either way.
    const { data: updatedRows, error: updateError } = await service
      .from('performances')
      .update({
        venue_name: String(venue_name).trim(),
        performance_date,
        start_time: start_time || null,
        status: 'review',
        ...(setlist_photo_url ? { setlist_photo_url } : {}),
      })
      .eq('id', performance_id)
      .eq('status', 'draft')
      .select('id')
    if (updateError) {
      console.error('[UploadPerformance] performance update failed:', updateError)
      return NextResponse.json({ error: 'Failed to save show details' }, { status: 500 })
    }

    const alreadyFinalized = !updatedRows || updatedRows.length === 0

    if (show_type && perfRow.show_id) {
      const { error: showUpdateError } = await service.from('shows').update({
        show_type,
      }).eq('id', perfRow.show_id)
      if (showUpdateError) {
        console.error('[UploadPerformance] show update failed:', showUpdateError)
        // Non-fatal — show details (venue/date) already saved successfully.
      }
    }

    if (!alreadyFinalized && Array.isArray(songs) && songs.length > 0) {
      const { error: songsError } = await service.from('performance_songs').insert(
        songs.map((song: any, i: number) => ({
          performance_id,
          title: song.title,
          artist: song.artist,
          position: i + 1,
          isrc: song.isrc,
          composer: song.composer,
          publisher: song.publisher,
          source: song.source,
          was_planned: false,
          inclusion_reason: song.inclusion_reason,
          threshold: song.threshold,
          score: song.score,
          confusion_matrix_result: 'TBD',
        }))
      )
      if (songsError) {
        console.error('[UploadPerformance] songs insert failed:', songsError)
        return NextResponse.json({ error: 'Failed to save detected songs' }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true, already_finalized: alreadyFinalized })
  } catch (err: any) {
    console.error('[UploadPerformance] finalize error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
