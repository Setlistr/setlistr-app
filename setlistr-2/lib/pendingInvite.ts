import { createClient } from '@supabase/supabase-js'

// Team-invite token handling outside the accept routes. Security model
// (R1 — token possession): an invite token only ever reaches a browser
// because that browser PRESENTED it (opened the invite link, or carries the
// cookie saved when it did), or because it was delivered to the invited
// inbox (the invite email, the approval email). An email match alone —
// a signed-in session whose email equals invited_email — must never
// disclose a token or an invite's details: signup does not verify inbox
// ownership (production's "Confirm email" is off), so a session email is
// self-asserted and anyone can claim one. This restores token-possession
// security; it does NOT verify inbox ownership (see
// docs/team-invite-identity.md for the open R2 decision).

// Holds a team-invite token the user actually presented at
// /app/accept-invite?token=… while not yet admitted. Navigation context
// only — never authorization: whatever it names is re-validated against
// current invite state and the authenticated recipient before use
// (getPresentedInviteDetails below, and /api/team/accept itself).
export const PENDING_INVITE_COOKIE = 'sl_pending_team_invite'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function serviceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
}

// A manager-originated REQUEST (app/api/team/request/route.ts, "I want to
// manage this artist") stores invited_email = the TARGET ARTIST's email
// while delegate_id and invited_by are BOTH the requesting manager's own
// id — the same signature app/api/team/delegates/route.ts's
// isIncomingRequest check uses to tell these apart from a real invite.
// That row is never an invite TO this email; it's a request ABOUT it.
function isRealInvite(d: { delegate_id: string | null; invited_by: string; artist_id: string }): boolean {
  return !(d.delegate_id && d.delegate_id === d.invited_by && d.invited_by !== d.artist_id)
}

export type PresentedInviteDetails = { role: string; artistName: string }

// Details (inviting artist + role) for an invite token the user presented
// (via the pending-invite cookie), shown on /beta's awaiting-approval
// state. Returned ONLY if the invite is still pending (not accepted,
// declined, or revoked), is a real artist-sent invite (not a manager
// request), and is addressed to THIS authenticated user — already bound to
// them, or an unbound placeholder whose invited_email matches their
// session email. Anything else, including a lookup error, returns null
// (fail closed: the page falls back to its generic copy).
export async function getPresentedInviteDetails(
  token: string | null | undefined,
  user: { id: string; email?: string | null }
): Promise<PresentedInviteDetails | null> {
  if (!token || !UUID_RE.test(token)) return null
  const service = serviceClient()
  if (!service) return null

  const { data: invite, error } = await service
    .from('artist_delegates')
    .select('role, artist_id, delegate_id, invited_by, invited_email, accepted_at, declined_at, revoked_at')
    .eq('invite_token', token)
    .maybeSingle()
  if (error || !invite) return null
  if (invite.accepted_at || invite.declined_at || invite.revoked_at) return null
  if (!isRealInvite(invite)) return null

  const isPlaceholder = invite.delegate_id === null || invite.delegate_id === invite.artist_id
  const emailMatches = !!user.email && !!invite.invited_email &&
    invite.invited_email.toLowerCase() === user.email.toLowerCase()
  const isRecipient = invite.delegate_id === user.id || (isPlaceholder && emailMatches)
  if (!isRecipient || user.id === invite.artist_id) return null

  const { data: artist, error: artistError } = await service
    .from('profiles')
    .select('artist_name, full_name')
    .eq('id', invite.artist_id)
    .maybeSingle()
  if (artistError) return null

  return { role: invite.role, artistName: artist?.artist_name || artist?.full_name || 'An artist' }
}

export type InboxDeliveryInvite = { token: string; role: string; artistName: string }

// INBOX DELIVERY ONLY — for app/api/admin/beta-invite's approval email,
// which sends the link to the invited address itself (the one channel an
// email match is allowed to drive). Never use this to redirect, display,
// or set a cookie for a signed-in session: that is exactly the email-match
// disclosure R1 removed.
export async function findPendingInviteForInboxDelivery(email: string): Promise<InboxDeliveryInvite | null> {
  const service = serviceClient()
  if (!service) return null
  // ilike, not eq: every known write site lowercases invited_email, but
  // this keeps the lookup resilient to any row stored with other casing.
  const { data } = await service
    .from('artist_delegates')
    .select('invite_token, role, artist_id, delegate_id, invited_by')
    .ilike('invited_email', email.toLowerCase())
    .is('accepted_at', null)
    .is('declined_at', null)
    .is('revoked_at', null)
    .order('invited_at', { ascending: false })
  // Most recently invited real invite, when more than one is pending.
  const invite = data?.find(isRealInvite)
  if (!invite) return null

  const { data: artist } = await service
    .from('profiles')
    .select('artist_name, full_name')
    .eq('id', invite.artist_id)
    .maybeSingle()

  return {
    token: invite.invite_token,
    role: invite.role,
    artistName: artist?.artist_name || artist?.full_name || 'An artist',
  }
}
