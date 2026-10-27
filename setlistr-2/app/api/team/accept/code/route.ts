import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { maskEmail } from '@/lib/teamInviteExpiry'
import { INVITE_COLS, INVITE_PREVIEW_MESSAGE, classifyInvite, invitePreviewLocked, reserveCodeAttempt, sendInviteCode, serviceClient, type InviteRow } from '@/lib/teamInviteAcceptance'

const supabase = serviceClient()

// POST { token } — email a 6-digit code to the signed-in account's own
// address, so POST /api/team/accept can verify inbox ownership. Sent only
// when the session is this pending, unexpired invite's recipient AND the
// session's email is the address the invite was sent to. Never creates an
// account, never sends to an address from the request.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const token = typeof body?.token === 'string' ? body.token : ''
    if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

    const authSupabase = await createServerSupabaseClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    if (!user || !user.email) return NextResponse.json({ error: 'You must be logged in to accept an invite.' }, { status: 401 })

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
    if (state === 'accepted_self') return NextResponse.json({ already_accepted: true })
    if (state === 'expired') return NextResponse.json({ error: 'This invitation has expired.', code: 'expired' }, { status: 410 })
    if (state === 'email_mismatch') return NextResponse.json({ error: 'This invite was sent to a different email address than the one you’re signed in with.', code: 'email_mismatch' }, { status: 403 })

    if (invitePreviewLocked(req.headers.get('host'))) return NextResponse.json({ error: INVITE_PREVIEW_MESSAGE, code: 'preview_disabled' }, { status: 403 })

    const reserved = await reserveCodeAttempt(supabase, user.id, 'send')
    if (reserved === 'error') return NextResponse.json({ error: 'We couldn’t send a code right now. Try again.' }, { status: 503 })
    if (reserved === 'limited') return NextResponse.json({ error: 'Too many codes requested. Try again in an hour.', code: 'too_many_codes' }, { status: 429 })

    const sent = await sendInviteCode(user.email)
    if (sent === 'too_soon') return NextResponse.json({ error: 'Wait a minute before asking for another code.', code: 'too_soon' }, { status: 429 })
    if (sent === 'failed') return NextResponse.json({ error: 'We couldn’t send a code right now. Try again.' }, { status: 502 })

    return NextResponse.json({ sent: true, email: maskEmail(user.email) })
  } catch (err) {
    console.error('Invite code route error:', (err as Error)?.message)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
