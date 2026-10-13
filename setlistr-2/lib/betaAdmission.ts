import type { SupabaseClient } from '@supabase/supabase-js'
// Relative (not '@/'), so scripts/ harnesses can import this under ts-node.
import { ADMIN_EMAILS } from './admin-config'

export type BetaAdmission = 'admitted' | 'not_admitted' | 'error'

// Server-side Setlistr (beta) admission check — the SAME rule middleware.ts
// applies to every /app/* page: an admin email (ADMIN_EMAILS, the single
// source of truth), or a beta_invites row for the session's exact email.
// `client` MUST be the caller's own session client (never service role),
// so beta_invites RLS filters the read exactly as it does in middleware —
// otherwise this check can admit sessions middleware would not.
// accepted_at is deliberately NOT required: middleware admits on any row
// and only records accepted_at as first-visit bookkeeping.
// For API routes, which middleware never runs on (its matcher covers pages
// only), so a page-level gate alone can be bypassed by calling the API
// directly. Always a live DB read: never middleware's signed sl_beta_ok
// cache cookie or any client-held state.
//
// Fails closed: a lookup error returns 'error', never 'admitted' — callers
// must deny on anything other than 'admitted'.
export async function checkBetaAdmission(
  client: SupabaseClient,
  email: string | null | undefined
): Promise<BetaAdmission> {
  if (!email) return 'not_admitted'
  if (ADMIN_EMAILS.includes(email)) return 'admitted'

  const { data, error } = await client
    .from('beta_invites')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (error) {
    console.error('Beta admission lookup error:', error)
    return 'error'
  }
  return data ? 'admitted' : 'not_admitted'
}
