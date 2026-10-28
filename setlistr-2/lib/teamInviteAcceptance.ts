import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isInviteExpired } from './teamInviteExpiry'

// Server-only helpers for accepting a team invitation with a fresh inbox
// code (docs/team-invite-admission-validation.md §1, §5). Used by
// app/api/team/accept and app/api/team/accept/code.
//
// Inbox proof: the code is sent to, and verified for, the email of the
// caller's server-verified session (auth.getUser()), never an address from
// the request. Verification happens here on the server against Supabase
// Auth; nothing trusts client state, a decoded JWT or the session's `amr`.
// Codes and invite tokens are never logged.

export const INVITE_COLS = 'id, artist_id, delegate_id, role, accepted_at, declined_at, revoked_at, invited_by, invited_email, invited_at'

export type InviteRow = {
  id: string
  artist_id: string
  delegate_id: string | null
  role: string
  accepted_at: string | null
  declined_at: string | null
  revoked_at: string | null
  invited_by: string
  invited_email: string | null
  invited_at: string | null
}

type SessionUser = { id: string; email?: string | null }

// A manager-initiated REQUEST row (invited_by = delegate_id, never the
// artist) is never acceptable through the invite routes — see the comment
// in app/api/team/accept/route.ts.
export function isManagerRequest(i: InviteRow): boolean {
  return i.invited_by === i.delegate_id && i.invited_by !== i.artist_id
}

// Unbound placeholder under either convention: legacy delegate_id =
// artist_id (pre-0024) or delegate_id = null.
export function isPlaceholder(i: InviteRow): boolean {
  return i.delegate_id === null || i.delegate_id === i.artist_id
}

export function sessionEmailMatches(i: InviteRow, email: string | null | undefined): boolean {
  return !!email && !!i.invited_email && i.invited_email.toLowerCase() === email.toLowerCase()
}

export function isIntendedRecipient(i: InviteRow, user: SessionUser): boolean {
  if (user.id === i.artist_id) return false
  return i.delegate_id === user.id || (isPlaceholder(i) && sessionEmailMatches(i, user.email))
}

export type InviteState =
  | 'not_found'       // a manager request: treated exactly like a missing token
  | 'no_longer_valid' // revoked or declined
  | 'accepted_self'   // accepted, bound to the caller, not revoked
  | 'wrong_account'
  | 'expired'         // pending and older than 14 days (recipient only)
  | 'email_mismatch'  // bound to the caller, but sent to a different address than the session's
  | 'pending'         // the caller may verify a code and accept

// Identity first: "accepted" is only ever reported to the account the
// membership is bound to; anyone else holding the token is told it was
// sent to a different account.
export function classifyInvite(i: InviteRow, user: SessionUser): InviteState {
  if (isManagerRequest(i)) return 'not_found'
  if (i.revoked_at || i.declined_at) return 'no_longer_valid'
  if (user.id === i.artist_id) return 'wrong_account'
  if (i.accepted_at) return i.delegate_id === user.id ? 'accepted_self' : 'wrong_account'
  if (!isIntendedRecipient(i, user)) return 'wrong_account'
  if (isInviteExpired(i.invited_at)) return 'expired'
  // The code goes to the session's own address, so that address must be
  // the one the invitation was sent to.
  if (!sessionEmailMatches(i, user.email)) return 'email_mismatch'
  return 'pending'
}

// ── Preview lock ────────────────────────────────────────────────────────────
// Vercel Preview deployments run against production data, so on Preview the
// invite routes never email anyone, rotate a real invitation's link or accept
// one. Fail-closed by host, exactly like spreadsheet import
// (lib/shows/import/mode.ts): allowed only on the production domain or a
// local host; any other host counts as Preview. SETLISTR_INVITE_PREVIEW=1
// turns the lock on locally, for testing it.
const LIVE_HOSTS = ['setlistr.ai', 'www.setlistr.ai']
export function invitePreviewLocked(host: string | null | undefined): boolean {
  if (process.env.SETLISTR_INVITE_PREVIEW === '1' || process.env.VERCEL_ENV === 'preview') return true
  const h = (host || '').toLowerCase().replace(/:\d+$/, '')
  if (!h) return true
  return !(LIVE_HOSTS.includes(h) || h === 'localhost' || h === '127.0.0.1')
}
export const INVITE_PREVIEW_MESSAGE = 'Invitations are turned off on Preview deployments. No email was sent and nothing was saved.'

export function serviceClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// A client that never stores or refreshes a session — verification's
// temporary session must not leak into cookies or be reused.
function sessionlessAuthClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

// ── Attempt bounds ──────────────────────────────────────────────────────────
// Supabase Auth already refuses a second code within 60 seconds for the same
// address and limits emails per hour. It can't bound wrong guesses per
// account here, because verification calls come from the app server (one
// shared IP), so the app bounds both, per account, per rolling hour.
//
// Insert-then-count in product_events (no schema change): each request
// records its own attempt first, then counts, so concurrent requests can't
// all see a count below the limit — at most LIMIT of them proceed.
export const CODE_SENDS_PER_HOUR = 5
export const CODE_CHECKS_PER_HOUR = 10

export async function reserveCodeAttempt(
  service: SupabaseClient,
  userId: string,
  kind: 'send' | 'check'
): Promise<'ok' | 'limited' | 'error'> {
  const event_name = kind === 'send' ? 'team_invite_code_sent' : 'team_invite_code_checked'
  const limit = kind === 'send' ? CODE_SENDS_PER_HOUR : CODE_CHECKS_PER_HOUR
  const { error: insertError } = await service.from('product_events').insert({ event_name, user_id: userId, actor_type: 'server' })
  if (insertError) {
    console.error('[team-invite-code] attempt record failed:', insertError.code)
    return 'error'
  }
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error } = await service
    .from('product_events')
    .select('id', { count: 'exact', head: true })
    .eq('event_name', event_name)
    .eq('user_id', userId)
    .gte('occurred_at', since)
  if (error || count === null) {
    console.error('[team-invite-code] attempt count failed:', error?.code)
    return 'error'
  }
  return count > limit ? 'limited' : 'ok'
}

// ── Send ────────────────────────────────────────────────────────────────────
// shouldCreateUser: false — never creates an account. The address is the
// caller's own session email (an existing account by definition).
// A 429 is either the per-address 60-second throttle ("…only request this
// after N seconds") or a shared limit: Supabase's per-IP request limit (all
// sends come from the app server) or the project-wide emails-per-hour limit,
// which password-reset emails also count against. Only the first is "wait a
// minute"; the shared ones are reported as such.
export async function sendInviteCode(email: string): Promise<'sent' | 'too_soon' | 'busy' | 'failed'> {
  const { error } = await sessionlessAuthClient().auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
  if (!error) return 'sent'
  if (error.status === 429) {
    if (/after \d+ seconds?/i.test(error.message || '')) return 'too_soon'
    console.error('[team-invite-code] send refused by a shared Supabase limit:', error.code)
    return 'busy'
  }
  console.error('[team-invite-code] send failed:', error.status, error.code)
  return 'failed'
}

// ── Verify ──────────────────────────────────────────────────────────────────
// Supabase Auth checks the code (expiry, single use, cancelled by a newer
// code). Success creates a temporary session; it is revoked at once with
// scope 'local', which ends ONLY that session — the caller's own session
// and their other devices stay signed in. Never 'global' or 'others'.
export async function verifyInviteCode(
  service: SupabaseClient,
  email: string,
  code: string,
  userId: string
): Promise<'verified' | 'rejected' | 'wrong_account' | 'rate_limited'> {
  const { data, error } = await sessionlessAuthClient().auth.verifyOtp({ email, token: code, type: 'email' })
  const tempToken = data?.session?.access_token
  if (tempToken) {
    const { error: revokeError } = await service.auth.admin.signOut(tempToken, 'local')
    if (revokeError) console.error('[team-invite-code] temporary session revoke failed:', revokeError.status)
  }
  if (error) return error.status === 429 ? 'rate_limited' : 'rejected'
  if (!data?.user || data.user.id !== userId) return 'wrong_account'
  return 'verified'
}
