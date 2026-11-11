// Explicit permission to send setlist photos and PDFs to Anthropic, which
// reads them with the Claude model (App Review Guideline 5.1.2(i): disclose
// sharing with third-party AI and get explicit permission first).
//
// Remembered per account on this device until withdrawn in Settings. The
// client attaches AI_CONSENT_FIELD only after permission is given, and
// /api/parse-setlist refuses an image or PDF that arrives without it, so a
// page that forgets to ask can't send anything. Plain-text setlists are read
// on our server and never sent to Anthropic, so they need no permission.

export const AI_CONSENT_FIELD = 'ai_consent'
export const AI_CONSENT_GRANTED = 'granted'

const storageKey = (userId: string) => `setlistr_ai_setlist_consent:${userId}`

export function needsAiConsent(file: { type: string; name?: string }): boolean {
  const name = (file.name || '').toLowerCase()
  return !(file.type === 'text/plain' || (!file.type && name.endsWith('.txt')))
}

export function hasAiSetlistConsent(userId: string | null | undefined): boolean {
  if (!userId) return false
  try { return localStorage.getItem(storageKey(userId)) === AI_CONSENT_GRANTED } catch { return false }
}

export function setAiSetlistConsent(userId: string, granted: boolean): void {
  try {
    if (granted) localStorage.setItem(storageKey(userId), AI_CONSENT_GRANTED)
    else localStorage.removeItem(storageKey(userId))
  } catch {}
}
