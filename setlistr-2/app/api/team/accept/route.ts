import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET — look up invite by token, return context for the accept screen.
// Returns is_intended_recipient (computed server-side against the caller's
// own session) instead of the raw delegate_id — the client no longer needs
// to see the delegate_id itself to know whether it matches them.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const authSupabase = await createServerSupabaseClient()
  const { data: { user } } = await authSupabase.auth.getUser()

  const { data: invite } = await supabase
    .from('artist_delegates')
    .select('id, artist_id, delegate_id, role, accepted_at, revoked_at, invited_by, invited_email')
    .eq('invite_token', token)
    .maybeSingle()

  if (!invite) return NextResponse.json({ error: 'Invite not found or already used.' }, { status: 404 })

  // This route is the ARTIST-initiated invite flow only (the delegate
  // accepts). A manager-initiated REQUEST (invited_by === delegate_id,
  // see migration 0023) must never be acceptable here — that would let
  // the requesting manager grant themselves access by hitting this
  // endpoint with their own row's token, bypassing the artist's approval
  // in app/api/team/respond entirely.
  //
  // invited_by === delegate_id is NOT on its own sufficient to detect
  // that: a placeholder row (invited email with no account yet) has
  // invited_by = artist_id, and under either placeholder convention
  // (legacy delegate_id = artist_id, or post-migration-0024
  // delegate_id = null is never equal to anything, including
  // artist_id) that same comparison can coincide with artist_id too —
  // confirmed live: this exact bare comparison was 404ing EVERY
  // artist-sent invite to an unregistered email, unconditionally,
  // before this fix. invited_by can never legitimately equal artist_id
  // for a real manager-request row (request/route.ts blocks a manager
  // from requesting access to their own account), so excluding that
  // case is what actually distinguishes a manager-request from a
  // placeholder invite. Treated identically to "not found" rather than
  // a distinct message, since a caller with a valid token doesn't need
  // to be told which kind of row it is.
  const isManagerRequest = invite.invited_by === invite.delegate_id && invite.invited_by !== invite.artist_id
  if (isManagerRequest) {
    return NextResponse.json({ error: 'Invite not found or already used.' }, { status: 404 })
  }

  // Defense in depth, matching can_act_for()'s own revoked_at check
  // (supabase/migrations/0015_delegation_revocation_enforcement.sql): the
  // only revoke path reachable from the UI today is a hard DELETE
  // (app/api/team/delegates DELETE), which already makes this unreachable
  // in practice — a deleted row never matches the token lookup above at
  // all. This exists only so a future writer that sets revoked_at instead
  // of deleting (direct seeding, an admin path, anything else) can never
  // silently let a revoked invite be read or accepted, exactly the gap
  // that migration closed for can_act_for() itself.
  if (invite.revoked_at) return NextResponse.json({ error: 'This invite is no longer valid.' }, { status: 404 })

  // Get artist profile
  const { data: artist } = await supabase
    .from('profiles')
    .select('artist_name, full_name, email')
    .eq('id', invite.artist_id)
    .single()

  // A placeholder row has no real delegate bound yet — recognized under
  // EITHER convention during the rollout: the legacy placeholder
  // (delegate_id === artist_id, written before migration 0024) or the
  // new one (delegate_id === null, written after). The session's own
  // email, matched case-insensitively against invited_email, is what
  // identifies the intended recipient in both cases.
  const isPlaceholder = invite.delegate_id === null || invite.delegate_id === invite.artist_id
  const emailMatches = !!user?.email && !!invite.invited_email &&
    invite.invited_email.toLowerCase() === user.email.toLowerCase()

  return NextResponse.json({
    id: invite.id,
    artist_id: invite.artist_id,
    is_intended_recipient: !!user && (invite.delegate_id === user.id || (isPlaceholder && emailMatches)),
    role: invite.role,
    artist_name: artist?.artist_name || artist?.full_name || 'An artist',
    artist_email: artist?.email || '',
    already_accepted: !!invite.accepted_at,
  })
}

// POST — accept the invite, write accepted_at. Caller identity is derived
// from the verified session, never trusted from the request body.
export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json()
    if (!token) {
      return NextResponse.json({ error: 'token required' }, { status: 400 })
    }

    const authSupabase = await createServerSupabaseClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'You must be logged in to accept an invite.' }, { status: 401 })
    }

    // Look up the invite
    const { data: invite } = await supabase
      .from('artist_delegates')
      .select('id, artist_id, delegate_id, accepted_at, declined_at, revoked_at, invited_by, invited_email')
      .eq('invite_token', token)
      .maybeSingle()

    if (!invite) return NextResponse.json({ error: 'Invite not found.' }, { status: 404 })

    // Same direction guard as GET above: a manager-initiated request can
    // never be self-accepted through this route. Checked here too, not
    // just in GET, since GET is only ever a read used to render the
    // accept screen — this POST is the actual write path and must not
    // rely on the client having honored what GET displayed. See GET's
    // own comment for why invited_by !== artist_id is required, not
    // just invited_by === delegate_id — without it, this was 404ing
    // every placeholder invite too.
    const isManagerRequest = invite.invited_by === invite.delegate_id && invite.invited_by !== invite.artist_id
    if (isManagerRequest) {
      return NextResponse.json({ error: 'Invite not found.' }, { status: 404 })
    }

    // See the matching checks in GET above — revoked_at is defense in
    // depth (not reachable via any revoke path that exists today, which
    // hard-deletes instead); declined_at can never actually be set on a
    // row reachable via THIS direction (respond/route.ts's own direction
    // guard only ever sets it on manager-request rows, already excluded
    // above) — checked anyway as the same defense-in-depth discipline,
    // and because the atomic guards below rely on it being false, not
    // merely assumed to be.
    if (invite.revoked_at || invite.declined_at) return NextResponse.json({ error: 'This invite is no longer valid.' }, { status: 404 })
    if (invite.accepted_at) return NextResponse.json({ success: true, already_accepted: true })

    // An artist is the owner of their own account and must never hold a
    // delegate row for themselves — checked before anything below, since
    // a placeholder row's delegate_id may equal artist_id (legacy
    // convention) and would otherwise satisfy the "already bound" case
    // for the artist's own session.
    if (user.id === invite.artist_id) {
      return NextResponse.json({ error: 'This invite was sent to a different account.' }, { status: 403 })
    }

    if (invite.delegate_id === user.id) {
      // Already bound to this account — accept as today, but atomically
      // guarded on the same terminal-state columns as the placeholder
      // rebind below, for the same reason: a concurrent duplicate
      // request (e.g. a double-click) must resolve idempotently, never
      // as a second write or a confusing error.
      const { data: updated, error } = await supabase
        .from('artist_delegates')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', invite.id)
        .is('accepted_at', null)
        .is('declined_at', null)
        .is('revoked_at', null)
        .select('id')
        .maybeSingle()

      if (error) {
        console.error('Accept invite error:', error)
        return NextResponse.json({ error: 'Failed to accept invite.' }, { status: 500 })
      }

      if (!updated) {
        // Guard matched zero rows — a concurrent request already
        // resolved this exact row between our SELECT and this UPDATE.
        // Re-read its actual current state rather than guessing.
        const { data: current } = await supabase
          .from('artist_delegates')
          .select('accepted_at, declined_at, revoked_at')
          .eq('id', invite.id)
          .maybeSingle()
        if (current?.accepted_at) {
          // A concurrent duplicate (same account) already completed
          // this exact acceptance — idempotent success, not an error.
          return NextResponse.json({ success: true })
        }
        return NextResponse.json({ error: 'This invite is no longer valid.' }, { status: 404 })
      }

      return NextResponse.json({ success: true })
    }

    // Unbound placeholder row (invited email had no Setlistr account at
    // invite time) — a valid token alone is never sufficient to bind it;
    // the session's email must match invited_email case-insensitively.
    // Legacy placeholder rows with a null invited_email fall through to the
    // 403 below rather than being treated as a match. Recognized under
    // EITHER placeholder convention during the rollout (see GET above).
    const isPlaceholder = invite.delegate_id === null || invite.delegate_id === invite.artist_id
    const emailMatches = !!invite.invited_email && !!user.email &&
      invite.invited_email.toLowerCase() === user.email.toLowerCase()

    if (isPlaceholder && emailMatches) {
      // Rebind and accept in one guarded, atomic update. The delegate_id
      // guard matches whichever convention THIS row currently uses —
      // legacy rows still hold artist_id until a later, separately
      // approved backfill; rows created after migration 0024 hold null
      // from the moment they're inserted. Using the wrong guard would
      // just match zero rows and fall into the recovery branch below,
      // never misbind the wrong account. accepted_at/declined_at/
      // revoked_at are ALL required null in the same atomic guard, not
      // just delegate_id — a concurrent accept, decline, or revoke
      // between our SELECT above and this UPDATE must never be silently
      // overwritten by this write.
      const base = supabase
        .from('artist_delegates')
        .update({ delegate_id: user.id, accepted_at: new Date().toISOString() })
        .eq('id', invite.id)
        .is('accepted_at', null)
        .is('declined_at', null)
        .is('revoked_at', null)

      const guarded = invite.delegate_id === null
        ? base.is('delegate_id', null)
        : base.eq('delegate_id', invite.artist_id)

      const { data: rebound, error } = await guarded.select('id, delegate_id').maybeSingle()

      if (error) {
        if (error.code === '23505') {
          // The real account this row is rebinding to already occupies
          // this exact (artist_id, delegate_id) pair elsewhere — an
          // existing accepted connection, or a separate opposing
          // pending request. Fails safely: no duplicate, no overwrite,
          // caught by the unchanged UNIQUE(artist_id, delegate_id)
          // constraint, exactly as it always has.
          return NextResponse.json({ error: 'You already have a connection with this account on this workspace.' }, { status: 409 })
        }
        console.error('Accept invite error:', error)
        return NextResponse.json({ error: 'Failed to accept invite.' }, { status: 500 })
      }

      if (!rebound) {
        // Guard matched zero rows — something about this row changed
        // between our SELECT and this UPDATE. Re-read its actual
        // current state rather than guessing which guard failed.
        const { data: current } = await supabase
          .from('artist_delegates')
          .select('delegate_id, accepted_at, declined_at, revoked_at')
          .eq('id', invite.id)
          .maybeSingle()

        if (current?.delegate_id === user.id && current.accepted_at) {
          // A concurrent duplicate request (same account racing itself)
          // already completed this exact rebind-and-accept — idempotent
          // success, never a second write.
          return NextResponse.json({ success: true })
        }
        if (!current || current.declined_at || current.revoked_at) {
          // Either explicitly declined/revoked, or the row itself is
          // gone — a concurrent cancel/remove (DELETE /api/team/delegates)
          // hard-deletes rather than setting revoked_at, so "no longer
          // valid" is the accurate message here too, not "different
          // account," which would wrongly imply the invite still exists.
          return NextResponse.json({ error: 'This invite is no longer valid.' }, { status: 404 })
        }
        // Rebound to a different account by a concurrent request.
        return NextResponse.json({ error: 'This invite was sent to a different account.' }, { status: 403 })
      }

      if (rebound.delegate_id !== user.id) {
        return NextResponse.json({ error: 'This invite was sent to a different account.' }, { status: 403 })
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'This invite was sent to a different account.' }, { status: 403 })
  } catch (err) {
    console.error('Accept invite route error:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
