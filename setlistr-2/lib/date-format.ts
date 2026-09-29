// Parses a date/timestamp string into a Date representing that CALENDAR DAY
// in the viewer's local time, ignoring whatever time-of-day and timezone
// offset the string carries. Matches the parseLocalDate already duplicated
// in app/app/dashboard/page.tsx, app/app/history/page.tsx, and
// app/app/review/[id]/page.tsx — this is the same, deliberate fix for the
// classic `new Date("2026-06-29")`-is-UTC-midnight pitfall: calling
// `.toLocaleDateString()` on that raw Date shifts the displayed day
// backward by one for any viewer west of UTC. Extracting the Y-M-D here and
// reconstructing with the local Date(y, m-1, day) constructor sidesteps
// that shift entirely.
//
// app/app/submit/[id]/page.tsx (claim prep) previously parsed
// performance.started_at with a bare `new Date(...)`, without this
// protection — the one screen in the submission flow that could disagree
// with the others on which calendar day a show happened.
export function parseLocalDate(d: string): Date {
  const datePart = d.split('T')[0].split(' ')[0]
  const [y, m, day] = datePart.split('-').map(Number)
  if (y && m && day) return new Date(y, m - 1, day)
  return new Date(d)
}

// Today's date as a "YYYY-MM-DD" string in the viewer's LOCAL calendar day —
// safe to hand straight to an <input type="date">. `new Date().toISOString()
// .slice(0, 10)` (seen as the default for app/app/upload/new/page.tsx's date
// picker) reads the UTC calendar day instead, which can be tomorrow or
// yesterday relative to the viewer depending on their offset and the time of
// day — most visible right around a timezone's local midnight.
export function todayLocalDateInputValue(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
