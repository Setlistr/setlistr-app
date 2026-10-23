// How a claim deadline is worded, on the Submit page and in the exported claim
// sheet alike. The wording follows the deadline's basis (lib/pro-rules.ts
// `confidence`); the dates themselves come from the PRO rules, unchanged.
//
//   official   — "Due …"                 an official PRO deadline (ASCAP, BMI)
//   unverified — "Working window to …"   Setlistr's 12-month default (SOCAN, PRS, APRA)
//   reminder   — "Reminder …"            no published deadline (SESAC, GMR)

import type { DeadlineResult, Urgency } from './pro-rules'

type Confidence = DeadlineResult['confidence']

// The term before the date, open or passed.
export function deadlineTerm(confidence: Confidence, passed: boolean): string {
  if (passed) return confidence === 'official' ? 'Deadline passed' : confidence === 'unverified' ? 'Working window passed' : 'Reminder date passed'
  return confidence === 'official' ? 'Due' : confidence === 'unverified' ? 'Working window to' : 'Reminder'
}

// The basis in a few words: the Submit page's disclosure label.
export function deadlineQualifier(confidence: Confidence, proName: string): string {
  return confidence === 'unverified' ? 'Setlistr default, not a published deadline'
    : confidence === 'reminder' ? 'No published deadline'
    : `From ${proName}’s published rule`
}

// What sits behind a date that isn't an official deadline. `confirmWith` is
// who to check timing with: the PRO, or its rep.
export function deadlineExplanation(confidence: Confidence, proName: string, confirmWith: string): string | null {
  if (confidence === 'unverified') return `Setlistr uses 12 months from the show as a working window. ${proName} hasn’t published a deadline Setlistr has confirmed, so check it in the portal.`
  if (confidence === 'reminder') return `${proName} doesn’t publish a deadline. ${reminderNote(confirmWith)}`
  return null
}

function reminderNote(confirmWith: string): string {
  return `This is a Setlistr reminder at six months; confirm timing with ${confirmWith}.`
}

// The Submit page's one-line deadline, with days left where it matters.
export function deadlineLine(deadline: DeadlineResult, daysLeft: number, urgency: Urgency, fmt: (d: Date) => string): string {
  const daysText = daysLeft >= 0 ? `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left` : null
  if (urgency === 'expired') return `${deadlineTerm(deadline.confidence, true)} ${fmt(deadline.date)}`
  if (deadline.confidence === 'official') return `${deadlineTerm('official', false)} ${fmt(deadline.date)} · ${daysText}`
  return `${deadlineTerm(deadline.confidence, false)} ${fmt(deadline.date)}${urgency !== 'open' ? ` · ${daysText}` : ''}`
}

// The exported sheet's deadline lines. A file is read later, so it carries
// the date and its basis, not a count of days left. The early cutoff is
// listed only while it's still open, as on the page.
export function claimSheetDeadlineLines(
  deadline: DeadlineResult,
  opts: { proName: string; confirmWith: string; passed: boolean; earlyStillOpen: boolean; fmt: (d: Date) => string },
): string[] {
  const { proName, confirmWith, passed, earlyStillOpen, fmt } = opts
  const field = (label: string, value: string) => `${(label + ':').padEnd(14)} ${value}`
  const lines: string[] = []
  if (earlyStillOpen && deadline.earlyCutoff) {
    lines.push(field('Early cutoff', `${fmt(deadline.earlyCutoff)} (${deadline.earlyCutoffNote || 'earlier distribution'})`))
  }
  const term = deadlineTerm(deadline.confidence, passed)
  // "Working window to" reads as one phrase before its date.
  lines.push(term.endsWith(' to') ? field(term.slice(0, -3), `to ${fmt(deadline.date)}`) : field(term, fmt(deadline.date)))
  const qualifier = deadlineQualifier(deadline.confidence, proName)
  // The basis leads; the detail doesn't repeat it.
  const detail = deadline.confidence === 'official'
    ? `${deadline.rule}.${deadline.sourceUrl ? ` Source: ${deadline.sourceUrl.replace(/^https?:\/\/(www\.)?/, '')}` : ''}`
    : deadline.confidence === 'reminder' ? reminderNote(confirmWith)
    : deadlineExplanation(deadline.confidence, proName, confirmWith)
  lines.push(field('Basis', `${qualifier}. ${detail}`))
  return lines
}
