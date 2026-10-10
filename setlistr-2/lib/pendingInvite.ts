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
