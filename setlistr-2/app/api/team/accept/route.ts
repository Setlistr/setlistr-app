import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { inviteExpiryCutoff, maskEmail } from '@/lib/teamInviteExpiry'
import {
  INVITE_COLS, INVITE_PREVIEW_MESSAGE, classifyInvite, invitePreviewLocked, isManagerRequest, isPlaceholder, isIntendedRecipient, reserveCodeAttempt, serviceClient, verifyInviteCode,
  type InviteRow,
} from '@/lib/teamInviteAcceptance'

const supabase = serviceClient()

// Owners and managers may invite someone into that artist's workspace
// without separate Setlistr (beta) approval; acceptance never grants general
// beta admission (docs/team-invite-admission-validation.md). What replaces
// the old approval precondition is inbox proof: a fresh 6-digit code sent
// to the signed-in account's own address (POST /api/team/accept/code) and
// verified here, on the server, before the membership is written.

async function artistNameFor(artistId: string): Promise<{ name: string; email: string }> {
  const { data } = await supabase.from('profiles').select('artist_name, full_name, email').eq('id', artistId).maybeSingle()
  return { name: data?.artist_name || data?.full_name || 'An artist', email: data?.email || '' }
}

const expiredMessage = (artist: string) => `This invitation has expired. Ask ${artist} to send it again.`

// GET — look up invite by token, return context for the accept screen.
// is_intended_recipient is computed server-side against the caller's own
// session; the masked recipient address is returned only to that recipient.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const authSupabase = await createServerSupabaseClient()
  const { data: { user } } = await authSupabase.auth.getUser()

  const { data: invite } = await supabase
    .from('artist_delegates')
    .select(INVITE_COLS)
    .eq('invite_token', token)
    .maybeSingle<InviteRow>()

  if (!invite) return NextResponse.json({ error: 'Invite not found or already used.' }, { status: 404 })

  // A manager-initiated REQUEST is never acceptable here (see POST); treated
  // identically to "not found". Revoked or declined → no longer valid; a
  // re-invite after removal always issues a fresh token, so this only ever
  // denies a genuinely still-revoked row.
  if (isManagerRequest(invite)) return NextResponse.json({ error: 'Invite not found or already used.' }, { status: 404 })
  if (invite.revoked_at || invite.declined_at) return NextResponse.json({ error: 'This invite is no longer valid.' }, { status: 404 })

  const state = user ? classifyInvite(invite, user) : null
  const artist = await artistNameFor(invite.artist_id)
  const isRecipient = !!user && (state === 'accepted_self' || (!invite.accepted_at && isIntendedRecipient(invite, user)))

  return NextResponse.json({
    id: invite.id,
    artist_id: invite.artist_id,
    is_intended_recipient: isRecipient,
    role: invite.role,
    artist_name: artist.name,
    artist_email: artist.email,
    already_accepted: state === 'accepted_self',
    expired: isRecipient && state === 'expired',
    email_mismatch: isRecipient && state === 'email_mismatch',
    recipient_email: isRecipient && state === 'pending' ? maskEmail(user!.email) : null,
  })
}

// POST { token, code } — accept the invite. Caller identity is derived from
// the verified session, never trusted from the request body.
//   1. Identity first: only the bound recipient is ever told "accepted".
//   2. Already accepted by this caller and not revoked → success, no code.
//   3. Expired → refused.
//   4. The code is verified by Supabase Auth for the session's own email;
//      the account it returns must be the caller.
//   5. One guarded write re-checks token, recipient, pending state,
//      revocation and expiry, so a resend, revoke or expiry racing this
//      request can't be accepted through a superseded link.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const token = typeof body?.token === 'string' ? body.token : ''
    const code = typeof body?.code === 'string' ? body.code.trim() : ''
    if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

    const authSupabase = await createServerSupabaseClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'You must be logged in to accept an invite.' }, { status: 401 })
    }

    const { data: invite } = await supabase
      .from('artist_delegates')
      .select(INVITE_COLS)
      .eq('invite_token', token)
      .maybeSingle<InviteRow>()
    if (!invite) return NextResponse.json({ error: 'Invite not found.' }, { status: 404 })

    const state = classifyInvite(invite, user)
    if (state === 'not_found') return NextResponse.json({ error: 'Invite not found.' }, { status: 404 })
    if (state === 'no_longer_valid') return NextResponse.json({ error: 'This invite is no longer valid.' }, { status: 404 })
    if (state === 'wrong_account') return NextResponse.json({ error: 'This invite was sent to a different account.' }, { status: 403 })
    // Repeat acceptance by the bound, still-authorized recipient: harmless,
    // returns the existing membership, needs no new code, grants nothing new.
    if (state === 'accepted_self') return NextResponse.json({ success: true, already_accepted: true })
    if (state === 'expired') {
      const artist = await artistNameFor(invite.artist_id)
      return NextResponse.json({ error: expiredMessage(artist.name), code: 'expired' }, { status: 410 })
    }
    if (state === 'email_mismatch') {
      return NextResponse.json({ error: 'This invite was sent to a different email address than the one you’re signed in with.', code: 'email_mismatch' }, { status: 403 })
    }

    if (invitePreviewLocked(req.headers.get('host'))) return NextResponse.json({ error: INVITE_PREVIEW_MESSAGE, code: 'preview_disabled' }, { status: 403 })

    // ── Inbox proof ──
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Enter the 6-digit code from your email.', code: 'code_required' }, { status: 400 })
    }
    const reserved = await reserveCodeAttempt(supabase, user.id, 'check')
    if (reserved === 'error') return NextResponse.json({ error: 'Could not check your code right now. Try again.' }, { status: 503 })
    if (reserved === 'limited') {
      return NextResponse.json({ error: 'Too many attempts. Wait an hour, then send a new code.', code: 'too_many_attempts' }, { status: 429 })
    }
    const verified = await verifyInviteCode(supabase, user.email!, code, user.id)
    if (verified === 'rate_limited') {
      return NextResponse.json({ error: 'Too many attempts. Wait a few minutes and try again.', code: 'too_many_attempts' }, { status: 429 })
    }
    if (verified !== 'verified') {
      // A concurrent duplicate (a double tap) may have used this same code
      // and accepted already: for the same bound, unrevoked account that is
      // idempotent success, not a code error.
      const { data: current } = await supabase
        .from('artist_delegates')
        .select('delegate_id, accepted_at, revoked_at')
        .eq('id', invite.id)
        .maybeSingle()
      if (current?.accepted_at && !current.revoked_at && current.delegate_id === user.id) {
        return NextResponse.json({ success: true, already_accepted: true })
      }
      return NextResponse.json({ error: 'That code didn’t work. Check it or send a new one.', code: 'bad_code' }, { status: 400 })
    }

    // ── Guarded acceptance write ──
    // Every condition is re-checked inside the single UPDATE: the same row
    // AND the same token (a resend rotates it), still pending, not declined
    // or revoked, sent within the last 14 days, and addressed to this caller
    // (bound to them, or a placeholder for their address — rebound here).
    const now = new Date().toISOString()
    let write = supabase
      .from('artist_delegates')
      .update(isPlaceholder(invite) ? { delegate_id: user.id, accepted_at: now } : { accepted_at: now })
      .eq('id', invite.id)
      .eq('invite_token', token)
      .is('accepted_at', null)
      .is('declined_at', null)
      .is('revoked_at', null)
      .gt('invited_at', inviteExpiryCutoff())
      .eq('invited_email', invite.invited_email!)
    write = isPlaceholder(invite)
      ? (invite.delegate_id === null ? write.is('delegate_id', null) : write.eq('delegate_id', invite.artist_id))
      : write.eq('delegate_id', user.id)

    const { data: updated, error } = await write.select('id, delegate_id').maybeSingle()

    if (error) {
      if (error.code === '23505') {
        // This account already occupies (artist_id, delegate_id) elsewhere —
        // an existing connection or an opposing pending request. No
        // duplicate, no overwrite.
        return NextResponse.json({ error: 'You already have a connection with this account on this workspace.' }, { status: 409 })
      }
      console.error('Accept invite error:', error.code)
      return NextResponse.json({ error: 'Failed to accept invite.' }, { status: 500 })
    }

    if (!updated) {
      // The guard matched nothing — something changed since the read above.
      // Re-read the row's current state rather than guessing.
      const { data: current } = await supabase
        .from('artist_delegates')
        .select('delegate_id, accepted_at, declined_at, revoked_at, invited_at, invite_token')
        .eq('id', invite.id)
        .maybeSingle()
      if (!current || current.declined_at || current.revoked_at) {
        return NextResponse.json({ error: 'This invite is no longer valid.' }, { status: 404 })
      }
      if (current.accepted_at) {
        // A concurrent duplicate by this same account already accepted:
        // idempotent success. Anyone else: different account.
        return current.delegate_id === user.id
          ? NextResponse.json({ success: true })
          : NextResponse.json({ error: 'This invite was sent to a different account.' }, { status: 403 })
      }
      if (current.invite_token !== token) {
        return NextResponse.json({ error: 'This invitation was sent again with a new link. Open the newest invite email.', code: 'superseded' }, { status: 410 })
      }
      const artist = await artistNameFor(invite.artist_id)
      return NextResponse.json({ error: expiredMessage(artist.name), code: 'expired' }, { status: 410 })
    }

    if (updated.delegate_id !== user.id) {
      return NextResponse.json({ error: 'This invite was sent to a different account.' }, { status: 403 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Accept invite route error:', (err as Error)?.message)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
