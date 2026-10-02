// Single source of truth for the one redirect-destination this app
// preserves through auth — the team-invite accept flow. Used by
// middleware.ts (Edge runtime, preserving the destination on the FIRST
// unauthenticated hit to /app/accept-invite), app/auth/login/page.tsx
// (preserving it through sign-in/signup), and app/auth/confirm/page.tsx
// (preserving it through email confirmation). One function, three callers,
// so the allowlist can never drift between them.
//
// Deliberately a strict allowlist, not a general redirect-preservation
// mechanism: a `next`/destination value arriving on a URL is
// attacker-controlled input, and this is the one thing standing between it
// and an open redirect. Rejects protocol-relative ("//host") and absolute
// ("https://...") values outright, and anything that isn't exactly this
// one real destination.
export function sanitizeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (raw.startsWith('//') || raw.includes('://')) return null
  // Exact match or exactly this path followed by its own query string —
  // a plain startsWith('/app/accept-invite') would also accept
  // "/app/accept-invite-evil" (a real looseness caught by this file's own
  // test), since that string does start with the right prefix even though
  // it names a path that doesn't exist and was never intended to match.
  if (raw !== '/app/accept-invite' && !raw.startsWith('/app/accept-invite?')) return null
  return raw
}
