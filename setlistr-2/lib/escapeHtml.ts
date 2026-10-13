// Minimal HTML-entity escaping for user-provided strings interpolated
// into email HTML (names, emails, anything not authored by us). Every
// HTML email body must pass user-provided names through this — plain-
// text fields like the subject line must not (they'd show raw entities).
export function escapeHtml(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
