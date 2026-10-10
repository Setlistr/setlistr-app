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
export async function findPendingInviteTokenByEmail(email: string): Promise<string | null> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
  const { data } = await service
    .from('artist_delegates')
    .select('invite_token')
    .eq('invited_email', email.toLowerCase())
    .is('accepted_at', null)
    .is('declined_at', null)
    .is('revoked_at', null)
    .order('invited_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.invite_token ?? null
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
  const { data: invite } = await service
    .from('artist_delegates')
    .select('invite_token, role, artist_id')
    .eq('invited_email', email.toLowerCase())
    .is('accepted_at', null)
    .is('declined_at', null)
    .is('revoked_at', null)
    .order('invited_at', { ascending: false })
    .limit(1)
    .maybeSingle()
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
