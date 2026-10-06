// Absolute-URL base for emails/redirects, branched on Vercel's own
// platform-injected env vars (VERCEL_ENV / VERCEL_URL) — never a request
// header, which a client could spoof. On Production this resolves
// identically to the old inline `NEXT_PUBLIC_APP_URL || 'https://setlistr.ai'`
// expression it replaces; on Preview it now uses that deployment's own
// VERCEL_URL instead of falling through to the production literal.
export function getBaseUrl(): string {
  if (process.env.VERCEL_ENV === 'production') {
    return process.env.NEXT_PUBLIC_APP_URL || 'https://setlistr.ai'
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  return process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000'
}
