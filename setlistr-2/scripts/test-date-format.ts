// Focused, DB-free tests for lib/date-format.ts — the date-parsing/default
// helpers behind the Upload Performance date-mismatch fix (upload form vs
// review vs completion vs claim prep disagreeing on a show's date).
//
// Core requirement under test: parseLocalDate must extract a timestamp's
// Y-M-D and reconstruct it as a LOCAL calendar date, never letting a raw
// `new Date(iso)` + `.toLocaleDateString()` shift the displayed day
// backward for a viewer west of UTC — which is exactly what app/app/submit/
// [id]/page.tsx did before this fix (every other screen — dashboard,
// history, review — already had their own protected copy of this logic).
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-date-format.ts

import { parseLocalDate, todayLocalDateInputValue } from '../lib/date-format'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

// ── 1. Plain date-only string ─────────────────────────────────────────────
{
  const d = parseLocalDate('2026-06-29')
  check('1. plain date-only: year', d.getFullYear() === 2026, String(d.getFullYear()))
  check('1. plain date-only: month (0-indexed)', d.getMonth() === 5, String(d.getMonth()))
  check('1. plain date-only: day', d.getDate() === 29, String(d.getDate()))
}

// ── 2. Full UTC-midnight ISO timestamp — the exact shape
//    `new Date(showDate).toISOString()` produces upstream, and the exact
//    shape that broke raw `new Date(iso).toLocaleDateString()` for anyone
//    west of UTC (UTC midnight on the 29th is still the 28th in the US). ──
{
  const d = parseLocalDate('2026-06-29T00:00:00.000Z')
  check('2. UTC-midnight ISO: month', d.getMonth() === 5, String(d.getMonth()))
  check('2. UTC-midnight ISO: day stays 29 regardless of local timezone', d.getDate() === 29, String(d.getDate()))
}

// ── 3. A timestamp carrying a real time-of-day, near a UTC day boundary —
//    the exact case a raw `new Date(iso)` handles "correctly" (a real
//    instant) but which disagreed with every OTHER screen's Y-M-D-only
//    reading of the same string. parseLocalDate must ignore the time
//    entirely and always land on the string's own date component. ────────
{
  const d = parseLocalDate('2026-09-29T02:15:00.000Z') // late evening Sept 28 in US timezones
  check('3. late-UTC timestamp: still reads the 29th (date component wins over embedded time)', d.getDate() === 29, String(d.getDate()))
  check('3. late-UTC timestamp: month', d.getMonth() === 8, String(d.getMonth()))
}

// ── 4. Space-separated (Postgres-style) timestamp ─────────────────────────
{
  const d = parseLocalDate('2026-12-31 23:59:59')
  check('4. space-separated timestamp: day', d.getDate() === 31, String(d.getDate()))
  check('4. space-separated timestamp: month', d.getMonth() === 11, String(d.getMonth()))
}

// ── 5. Year boundary — a date near a timezone boundary AND a year rollover ─
{
  const d = parseLocalDate('2027-01-01T00:00:00.000Z')
  check('5. year-boundary UTC-midnight: year', d.getFullYear() === 2027, String(d.getFullYear()))
  check('5. year-boundary UTC-midnight: month', d.getMonth() === 0, String(d.getMonth()))
  check('5. year-boundary UTC-midnight: day', d.getDate() === 1, String(d.getDate()))
}

// ── 6. Malformed input falls back to a plain Date parse rather than
//    throwing — matches the pre-existing per-file copies' own behavior. ──
{
  const d = parseLocalDate('not-a-real-date')
  check('6. malformed input: does not throw, returns a Date', d instanceof Date)
}

// ── 7. todayLocalDateInputValue — local calendar day, not UTC's. Directly
//    exercises the exact scenario that produced the wrong DEFAULT date on
//    the upload form: `new Date().toISOString().slice(0,10)` reads the UTC
//    day, which is a different calendar day from local "today" for part of
//    every 24 hours, for any non-UTC timezone. ───────────────────────────
{
  // Just before local midnight, in a timezone west of UTC — UTC has
  // already rolled over to the next day; the LOCAL day must not.
  const beforeMidnightLocal = new Date(2026, 5, 29, 23, 30, 0) // June 29, 11:30pm, constructed in local time
  check('7a. just before local midnight: still the 29th', todayLocalDateInputValue(beforeMidnightLocal) === '2026-06-29', todayLocalDateInputValue(beforeMidnightLocal))

  const justAfterMidnightLocal = new Date(2026, 5, 30, 0, 5, 0) // June 30, 12:05am local
  check('7b. just after local midnight: rolls to the 30th', todayLocalDateInputValue(justAfterMidnightLocal) === '2026-06-30', todayLocalDateInputValue(justAfterMidnightLocal))

  // Single-digit month/day are zero-padded
  const earlyInYear = new Date(2026, 0, 5, 12, 0, 0) // Jan 5
  check('7c. zero-pads single-digit month/day', todayLocalDateInputValue(earlyInYear) === '2026-01-05', todayLocalDateInputValue(earlyInYear))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
