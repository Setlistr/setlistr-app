import { createClient } from '@supabase/supabase-js'

// Shared by middleware.ts (Edge) and app/beta/page.tsx (Server Component)
// — both runtimes support plain @supabase/supabase-js, so one
// implementation serves both rather than risking the two drifting.
//
// Looks up a still-pending (not accepted/declined/revoked) invite
// addressed to this exact email. Requires the service-role client:
// artist_delegates' RLS select policy is auth.uid() IN (artist_id,
// delegate_id), and a still-pending invite's delegate_id (NULL, or the
// legacy artist_id placeholder) never yet equals the recipient's own
// uid — an anon-key client bound to their session cannot see it at all.
// A manager-originated REQUEST (app/api/team/request/route.ts, "I want to
// manage this artist") stores invited_email = the TARGET ARTIST's email
// while delegate_id and invited_by are BOTH the requesting manager's own
// id — the same signature app/api/team/delegates/route.ts's
// isIncomingRequest check uses to tell these apart from a real invite.
// That row is never an invite TO this email; it's a request ABOUT it,
// headed the opposite direction, and must never surface here as "you were
// invited" — the target artist would see a backwards, confusing message
// ("invited you") when actually a manager asked to join THEM.
function isRealInvite(d: { delegate_id: string | null; invited_by: string }): boolean {
  return !(d.delegate_id && d.delegate_id === d.invited_by)
}

export async function findPendingInviteTokenByEmail(email: string): Promise<string | null> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
  // ilike, not eq: every known write site (app/api/team/invite,
  // app/api/team/request) lowercases invited_email before insert, but this
  // makes the lookup itself resilient to any row stored with different
  // casing instead of depending on every future write site getting that
  // right too.
  const { data } = await service
    .from('artist_delegates')
    .select('invite_token, delegate_id, invited_by')
    .ilike('invited_email', email.toLowerCase())
    .is('accepted_at', null)
    .is('declined_at', null)
    .is('revoked_at', null)
    .order('invited_at', { ascending: false })
  // Deliberate when more than one real invite is still pending (e.g. two
  // different artists both invited the same email): picks the most
  // recently invited one, not an arbitrary or random row.
  return data?.find(isRealInvite)?.invite_token ?? null
}

export type PendingInviteDetails = { token: string; role: string; artistName: string }

// Same lookup as above, plus the inviting artist's display name and the
// role actually stored on the row — for /beta's authenticated waiting
// state, which names who invited them and what role, rather than a bare
// "you have an invite." Two queries (not an embedded join): artist_id is
// one of TWO possible foreign keys from artist_delegates to profiles
// (artist_id, delegate_id), so an embedded select needs the constraint
// name spelled out either way — this matches the plainer two-query style
// already used throughout app/api/team/*.
export async function findPendingInviteDetailsByEmail(email: string): Promise<PendingInviteDetails | null> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
  const { data } = await service
    .from('artist_delegates')
    .select('invite_token, role, artist_id, delegate_id, invited_by')
    .ilike('invited_email', email.toLowerCase())
    .is('accepted_at', null)
    .is('declined_at', null)
    .is('revoked_at', null)
    .order('invited_at', { ascending: false })
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
