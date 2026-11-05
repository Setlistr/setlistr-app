// Auth and invitation addresses carry bearer values in the query string or hash
// (accept-invite?token=, auth/confirm?token_hash= / ?code=, login?next=…token=…,
// #access_token=). Third-party analytics read the page address when they load,
// so on such a page none of them load. Decoded first, so a value nested in
// ?next= is caught. Kept as a source string so the inline <head> script and
// client components test exactly the same thing.
export const SENSITIVE_URL_SOURCE = '[?&#](token|token_hash|code|access_token|refresh_token)='

export function isSensitiveUrl(search: string, hash: string): boolean {
  let s = search + hash
  try { s = decodeURIComponent(s) } catch {}
  return new RegExp(SENSITIVE_URL_SOURCE, 'i').test(s)
}
