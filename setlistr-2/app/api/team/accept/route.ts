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
    .select('id, artist_id, delegate_id, role, accepted_at, invited_email')
    .eq('invite_token', token)
    .maybeSingle()

  if (!invite) return NextResponse.json({ error: 'Invite not found or already used.' }, { status: 404 })

  // Get artist profile
  const { data: artist } = await supabase
    .from('profiles')
    .select('artist_name, full_name, email')
    .eq('id', invite.artist_id)
    .single()

  // A placeholder row (delegate_id === artist_id, written when the invited
  // email had no Setlistr account yet) has no real delegate bound — the
  // session's own email, matched case-insensitively against invited_email,
  // is what identifies the intended recipient in that case.
  const isPlaceholder = invite.delegate_id === invite.artist_id
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
      .select('id, artist_id, delegate_id, accepted_at, invited_email')
      .eq('invite_token', token)
      .maybeSingle()

    if (!invite) return NextResponse.json({ error: 'Invite not found.' }, { status: 404 })
    if (invite.accepted_at) return NextResponse.json({ success: true, already_accepted: true })

    // An artist is the owner of their own account and must never hold a
    // delegate row for themselves — checked before anything below, since a
    // placeholder row's delegate_id equals artist_id and would otherwise
    // satisfy the "already bound" case for the artist's own session.
    if (user.id === invite.artist_id) {
      return NextResponse.json({ error: 'This invite was sent to a different account.' }, { status: 403 })
    }

    if (invite.delegate_id === user.id) {
      // Already bound to this account — accept as today.
      const { error } = await supabase
        .from('artist_delegates')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', invite.id)

      if (error) {
        console.error('Accept invite error:', error)
        return NextResponse.json({ error: 'Failed to accept invite.' }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    // Unbound placeholder row (invited email had no Setlistr account at
    // invite time) — a valid token alone is never sufficient to bind it;
    // the session's email must match invited_email case-insensitively.
    // Legacy placeholder rows with a null invited_email fall through to the
    // 403 below rather than being treated as a match.
    const isPlaceholder = invite.delegate_id === invite.artist_id
    const emailMatches = !!invite.invited_email && !!user.email &&
      invite.invited_email.toLowerCase() === user.email.toLowerCase()

    if (isPlaceholder && emailMatches) {
      // Rebind and accept in one guarded update — .eq('delegate_id', ...)
      // ensures a concurrent accept can't double-bind the same placeholder
      // row to two different accounts. The update's own returned row is
      // the re-read: if the guard didn't match (another request already
      // rebound it first), nothing comes back and this account is not
      // treated as bound.
      const { data: rebound, error } = await supabase
        .from('artist_delegates')
        .update({ delegate_id: user.id, accepted_at: new Date().toISOString() })
        .eq('id', invite.id)
        .eq('delegate_id', invite.artist_id)
        .select('id, delegate_id')
        .maybeSingle()

      if (error) {
        console.error('Accept invite error:', error)
        return NextResponse.json({ error: 'Failed to accept invite.' }, { status: 500 })
      }

      if (!rebound || rebound.delegate_id !== user.id) {
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
