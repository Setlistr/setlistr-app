// Minimal HTML-entity escaping for user-provided strings interpolated
// into email HTML (names, emails, anything not authored by us). The
// existing email senders (sendInviteEmail, sendBetaInviteEmail) predate
// this and interpolate unescaped — out of scope to change here beyond
// what this feature's own new templates use, but new interpolation of
// user-provided content must not repeat that gap.
export function escapeHtml(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
