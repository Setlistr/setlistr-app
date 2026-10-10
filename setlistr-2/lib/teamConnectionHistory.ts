import type { SupabaseClient } from '@supabase/supabase-js'

// Whether this user has EVER been an accepted delegate for any artist —
// regardless of whether that access has since been revoked. This is the
// signal that distinguishes a team-only user whose last connection was
// removed (real history as a team member; needs a disconnected-workspace
// recovery state, never artist onboarding) from a genuinely new user who
// has never been connected to anyone (needs first-time artist onboarding).
//
// Deliberately does NOT filter revoked_at — an accepted-then-revoked row
// still proves real history; only a row that was NEVER accepted (still
// pending, or declined) does not count. RLS (artist_delegates: auth.uid()
// IN (artist_id, delegate_id)) still allows a user to see their own row
// here even after revocation, since delegate_id is never changed by
// revocation — only revoked_at is set.
export async function hasEverBeenConnected(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('artist_delegates')
    .select('id')
    .eq('delegate_id', userId)
    .not('accepted_at', 'is', null)
    .limit(1)
  return !!data && data.length > 0
}
