// Team-invite expiry and display helpers. Pure — safe in client components,
// API routes and middleware alike.
//
// Approved direction (docs/team-invite-admission-validation.md): a PENDING
// invitation expires 14 days after it was sent (artist_delegates.invited_at);
// resending refreshes invited_at and rotates the token. Expiry never applies
// to an accepted membership — can_act_for()/can_write_for() never read
// invited_at, and nothing here is consulted for accepted rows.

export const INVITE_TTL_DAYS = 14
const INVITE_TTL_MS = INVITE_TTL_DAYS * 24 * 60 * 60 * 1000

// Oldest invited_at still acceptable, as an ISO timestamp — used inside the
// guarded acceptance write itself (invited_at > cutoff), not only for a
// read beforehand.
export function inviteExpiryCutoff(now: number = Date.now()): string {
  return new Date(now - INVITE_TTL_MS).toISOString()
}

// Fails closed: a missing or unreadable invited_at counts as expired.
export function isInviteExpired(invitedAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!invitedAt) return true
  const t = new Date(invitedAt).getTime()
  if (Number.isNaN(t)) return true
  return t <= now - INVITE_TTL_MS
}

// Length of the email code Supabase Auth issues (Authentication → Providers →
// Email → "Email OTP Length"). Production is 8 (read 2026-10-27). This must
// match that setting: the accept screen and POST /api/team/accept accept
// exactly this many digits.
export const INVITE_CODE_LENGTH = 8

// "jesse@example.com" → "j•••@example.com". Shown only to the invite's own
// recipient, so they can recognise which inbox the code went to.
export function maskEmail(email: string | null | undefined): string {
  if (!email) return ''
  const at = email.lastIndexOf('@')
  if (at < 1) return '•••'
  return `${email[0]}•••${email.slice(at)}`
}
