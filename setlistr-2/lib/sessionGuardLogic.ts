// Pure decision logic behind useSessionGuard.ts — deliberately has zero
// imports (no React, no Supabase client, no '@/' path-aliased modules) so
// it can be imported directly from a plain ts-node script without pulling
// in the browser-only Supabase client or needing path-alias resolution
// configured for the scripts/ harness.

export type SessionGuardState =
  | { invalid: false }
  | { invalid: true; reason: 'signed_out' | 'account_changed' }

// The id-mismatch check is deliberately event-name-agnostic: it applies to
// every event Supabase can emit with a resolved user id attached —
// SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED, INITIAL_SESSION, etc. — not
// just SIGNED_IN. Any of them carrying a different user id than the one
// this form was loaded under invalidates the form; only the identity
// actually matters, not which event announced it. SIGNED_OUT is the one
// event checked by name, since it carries no user id to compare.
export function evaluateAuthEvent(
  event: string,
  currentUserId: string | null,
  loadedViewerId: string | null,
): SessionGuardState | null {
  if (event === 'SIGNED_OUT') {
    return { invalid: true, reason: 'signed_out' }
  }
  if (currentUserId && loadedViewerId && currentUserId !== loadedViewerId) {
    return { invalid: true, reason: 'account_changed' }
  }
  return null
}
