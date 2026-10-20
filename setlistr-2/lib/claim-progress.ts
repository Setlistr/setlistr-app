// Claim-sheet preparation state: where each piece is kept, what a copied
// mark means, and how a "mark as submitted" write is judged.
//
// Everything here is per-device convenience. The database alone says
// whether a show was submitted; nothing kept here can mark one.

// ─── Storage keys ─────────────────────────────────────────────────────────────
// Every key carries the signed-in account (viewerId), so a second account
// on the same browser never sees or reuses the first one's preparation.

// Show details typed on the claim sheet (promoter, ticket price, ...).
// localStorage: they should survive closing the tab.
export function claimInputsKey(viewerId: string, performanceId: string): string {
  return `setlistr:claim:${viewerId}:${performanceId}`
}
// The released key had no account in it. Read once as a fallback, then
// moved under the account that opens the sheet.
export function legacyClaimInputsKey(performanceId: string): string {
  return `setlistr:claim:${performanceId}`
}

// Self-reported prerequisite acknowledgements, per account, artist and
// PRO. localStorage.
export function preflightKey(viewerId: string, ownerId: string, proCode: string): string {
  return `setlistr:preflight:${viewerId}:${ownerId}:${proCode}`
}
// The released key was per artist and PRO only. It is honoured only for
// the artist's own account, which is who could have written it there.
export function legacyPreflightKey(ownerId: string, proCode: string): string {
  return `setlistr:preflight:${ownerId}:${proCode}`
}

// Copied marks and "portal opened", for this tab: sessionStorage, so they
// survive the browser reloading the tab while you're in the portal and
// end with the tab. Per show and PRO: another PRO's sheet has other fields.
export function progressKey(viewerId: string, performanceId: string, proCode: string): string {
  return `setlistr:claim-progress:${viewerId}:${performanceId}:${proCode}`
}
export function scrollKey(viewerId: string, performanceId: string): string {
  return `setlistr:claim-scroll:${viewerId}:${performanceId}`
}

// ─── Copied marks ─────────────────────────────────────────────────────────────
// A mark records which value was copied (as a short fingerprint, so legal
// names and IPI numbers aren't written to storage). It counts only while
// the field still holds that value: editing a detail clears its mark.

export type CopyMarks = Record<string, string>

export function fingerprint(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0
  return `${text.length}:${h.toString(36)}`
}

export function markCopied(marks: CopyMarks, key: string, text: string): CopyMarks {
  return { ...marks, [key]: fingerprint(text) }
}

export function isCopied(marks: CopyMarks, key: string, currentValue: string): boolean {
  return currentValue !== '' && marks[key] === fingerprint(currentValue)
}

export const ALL_SONGS_KEY = 'all-songs'
export function allTitles(titles: string[]): string { return titles.join('\n') }

export function songCopied(marks: CopyMarks, titles: string[], i: number): boolean {
  return isCopied(marks, `song-${i}`, titles[i] ?? '') || isCopied(marks, ALL_SONGS_KEY, allTitles(titles))
}

export function allSongsCopied(marks: CopyMarks, titles: string[]): boolean {
  return titles.length > 0 && titles.every((_, i) => songCopied(marks, titles, i))
}

export function parseProgress(raw: string | null): { marks: CopyMarks; portalOpened: boolean } {
  try {
    const p = raw ? JSON.parse(raw) : null
    const marks: CopyMarks = {}
    if (p && p.marks && typeof p.marks === 'object' && !Array.isArray(p.marks)) {
      for (const [k, v] of Object.entries(p.marks)) if (typeof v === 'string') marks[k] = v
    }
    return { marks, portalOpened: !!(p && p.portalOpened === true) }
  } catch { return { marks: {}, portalOpened: false } }
}

// ─── Recording a submission ───────────────────────────────────────────────────
// The write only changes a show that isn't already submitted, so a retry
// after a lost response matches no row instead of moving submitted_at.
// Whenever the write's own answer isn't a clean single-row success, the
// show is read back and the stored status decides:
//   saved      — this write (or one whose response was lost) recorded it
//   already    — it was already recorded (another tab, device or teammate)
//   not_saved  — the read-back shows it isn't recorded
//   uncertain  — the read-back failed too; nothing can be said either way

export type MarkOutcome = 'saved' | 'already' | 'not_saved' | 'uncertain'

export type ReadBack = { ok: true; submissionStatus: string | null; submittedAt: string | null } | { ok: false }

export function judgeWrite(update: { error: boolean; rows: number }): 'saved' | 'check' {
  return !update.error && update.rows === 1 ? 'saved' : 'check'
}

export function judgeReadBack(update: { error: boolean; rows: number }, readBack: ReadBack): MarkOutcome {
  if (!readBack.ok) return 'uncertain'
  if (readBack.submissionStatus !== 'submitted') return 'not_saved'
  // Recorded. A clean zero-row answer means someone recorded it before this
  // write; an errored or one-row answer means this write did.
  return !update.error && update.rows === 0 ? 'already' : 'saved'
}
