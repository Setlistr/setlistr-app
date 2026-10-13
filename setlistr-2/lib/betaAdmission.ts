import type { SupabaseClient } from '@supabase/supabase-js'
// Relative (not '@/'), so scripts/ harnesses can import this under ts-node.
import { ADMIN_EMAILS } from './admin-config'

export type BetaAdmission = 'admitted' | 'not_admitted' | 'error'

// Server-side Setlistr (beta) admission check — the SAME rule middleware.ts
// applies to every /app/* page: an admin email (ADMIN_EMAILS, the single
// source of truth), or a beta_invites row for the session's exact email.
// For API routes, which middleware never runs on (its matcher covers pages
// only), so a page-level gate alone can be bypassed by calling the API
// directly. Always a live DB read: never middleware's signed sl_beta_ok
// cache cookie or any client-held state.
//
// Fails closed: a lookup error returns 'error', never 'admitted' — callers
// must deny on anything other than 'admitted'.
export async function checkBetaAdmission(
  service: SupabaseClient,
  email: string | null | undefined
): Promise<BetaAdmission> {
  if (!email) return 'not_admitted'
  if (ADMIN_EMAILS.includes(email)) return 'admitted'

  const { data, error } = await service
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
