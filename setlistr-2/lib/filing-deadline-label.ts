import { getProRule, daysUntil, urgencyFor, type Urgency } from './pro-rules'

export interface DeadlineLabel { label: string; color: string; urgency: Urgency }

// Callers should only surface a deadline prominently once it needs
// attention — a comfortably-open deadline on every row is noise, not
// useful. 'open' is the one urgency tier that doesn't.
export function deadlineNeedsAttention(urgency: Urgency): boolean {
  return urgency !== 'open'
}

// Shared theme tokens (app/globals.css), so the label reads in Light and
// Dark alike — the same danger/warn colours the Submit page's deadline
// banner uses. Previously fixed dark-theme hex, which fell to ~2.2–2.8:1
// on a Light page. Urgency itself is unchanged (lib/pro-rules.ts).
const URGENCY_COLOR: Record<Urgency, string> = {
  expired: 'var(--sl-danger)', urgent: 'var(--sl-danger)', soon: 'var(--sl-warn)', open: 'var(--sl-text-3)',
}

// Pure — the same deadline computation app/app/submit/[id]/page.tsx's own
// deadline banner already uses (lib/pro-rules.ts's deadline()/daysUntil()/
// urgencyFor(), untouched by this), reformatted as a compact one-line
// label for a Filing Queue row instead of a full banner. Returns null
// when there's no PRO to compute a deadline against — never invents one.
export function filingDeadlineLabel(proCode: string | null | undefined, showDate: Date): DeadlineLabel | null {
  const rule = getProRule(proCode)
  if (!rule) return null
  const deadline = rule.deadline(showDate)
  const days = daysUntil(deadline.date)
  const urgency = urgencyFor(days)
  const dateStr = deadline.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const label = days < 0
    ? `Window closed ${dateStr}`
    : `${days} day${days === 1 ? '' : 's'} left · ${dateStr}`
  return { label, color: URGENCY_COLOR[urgency], urgency }
}
