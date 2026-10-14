// The dashboard's record figures — the hero count, the next-milestone
// ticks, "N of M shows" marked submitted, and "Last show" — derived from
// ONE set of shows: isCapturedShow() (lib/performance-status.ts), the same
// definition history's "Your Record" list, the Filing Queue and Manager
// Overview use. Before this, the milestone counted its own looser set
// (anything not imported/draft/live, placeholder venues included), so the
// ticks could run a show or two ahead of the hero number beside them, and
// "last show" came from the most recently CREATED row rather than the most
// recent show date.

import { isCapturedShow, isSubmitted, type PerformanceLifecycleFields } from './performance-status'

export type RecordShow = PerformanceLifecycleFields & {
  id: string
  venue_name?: string | null
  performance_date?: string | null
  started_at?: string | null
  created_at?: string | null
}

export const MILESTONE_STEP = 25

export type RecordSummary = {
  count: number
  submitted: number
  milestone: { first: number; next: number; toGo: number }
  lastShow: { id: string; venueName: string | null; date: Date } | null
}

// The day a show happened. performance_date is the show's own date (an
// upload can be filed days after the gig); started_at is when live capture
// began; created_at is only a last resort. Date-only values and UTC-midnight
// timestamps are read as that calendar day in local time, so a show dated
// the 12th never displays as the 11th west of UTC.
export function showDate(p: Pick<RecordShow, 'performance_date' | 'started_at' | 'created_at'>): Date | null {
  const raw = p.performance_date || p.started_at || p.created_at
  if (!raw) return null
  const datePart = raw.split('T')[0].split(' ')[0]
  const isDateOnly = datePart === raw || /T00:00:00(\.0+)?(Z|\+00:?00)?$/.test(raw)
  if (isDateOnly) {
    const [y, m, d] = datePart.split('-').map(Number)
    if (y && m && d) return new Date(y, m - 1, d)
  }
  const t = new Date(raw)
  return isNaN(t.getTime()) ? null : t
}

// The block of MILESTONE_STEP shows the current count sits in: shows
// first..next, filled through `count`. Reaching a milestone exactly starts
// the next block (200 → 201..225, 25 to go).
export function milestoneFor(count: number): RecordSummary['milestone'] {
  const next = (Math.floor(Math.max(0, count) / MILESTONE_STEP) + 1) * MILESTONE_STEP
  return { first: next - MILESTONE_STEP + 1, next, toGo: next - count }
}

export function summarizeRecord(perfs: RecordShow[]): RecordSummary {
  const shows = perfs.filter(isCapturedShow)
  let lastShow: RecordSummary['lastShow'] = null
  for (const p of shows) {
    const d = showDate(p)
    if (d && (!lastShow || d.getTime() > lastShow.date.getTime())) lastShow = { id: p.id, venueName: p.venue_name ?? null, date: d }
  }
  return {
    count: shows.length,
    submitted: shows.filter(isSubmitted).length,
    milestone: milestoneFor(shows.length),
    lastShow,
  }
}

// "Today", "Yesterday", "9 days ago" — calendar days, not 24-hour periods —
// then a plain date once it's more than ~2 months back.
export function lastShowLabel(date: Date, now: Date = new Date()): string {
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const days = Math.round((b - a) / 86400000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 60) return `${days} days ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
