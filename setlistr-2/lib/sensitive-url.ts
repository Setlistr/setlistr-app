// Auth and invitation pages never run third-party analytics. Their addresses can
// carry bearer values (accept-invite?token=, auth/confirm?token_hash= / ?code=,
// login?next=…token=…, #access_token=), people type credentials there, and
// analytics scripts read the page address when they load and on every later
// history change. Two rules, both tested by components/WebOnlyScripts.tsx and the
// inline <head> tag in app/layout.tsx:
// - a sensitive ROUTE: /auth/* or /app/accept-invite;
// - a sensitive VALUE anywhere in the query or fragment (decoded, so a value
//   nested in ?next= counts).
// Kept as source strings so the inline script and client code test the same thing.
export const SENSITIVE_PATH_SOURCE = '^/(auth|app/accept-invite)(/|$)'
export const SENSITIVE_VALUE_SOURCE = '[?&#](token|token_hash|code|access_token|refresh_token)='

export function isSensitiveLocation(loc: { pathname: string; search: string; hash: string }): boolean {
  if (new RegExp(SENSITIVE_PATH_SOURCE).test(loc.pathname)) return true
  let s = loc.search + loc.hash
  try { s = decodeURIComponent(s) } catch {}
  return new RegExp(SENSITIVE_VALUE_SOURCE, 'i').test(s)
}
