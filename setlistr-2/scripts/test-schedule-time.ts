// Behavioral tests for lib/scheduleTime.ts — run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-schedule-time.ts
// Pure, offline, no network, no DB — exercises real date-fns-tz behavior
// against the specific cases that broke the original handwritten
// single-pass conversion, plus the ones explicitly called out as not yet
// proven: Lord Howe Island's 30-minute DST delta, invalid input, and a
// date-line-crossing zone.

import { zonedLocalTimeToUtc, utcToZonedParts } from '../lib/scheduleTime'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

// ── The exact reported bug: 03:30 the morning of spring-forward is VALID ──
{
  const r = zonedLocalTimeToUtc('2026-03-08T03:30', 'America/Chicago')
  check('2026-03-08T03:30 America/Chicago resolves as a valid, existing time (the reported bug)', r.ok, JSON.stringify(r))
  if (r.ok) {
    const back = utcToZonedParts(r.utc, 'America/Chicago')
    check('round-trips back to the exact same local date/time', back.dateStr === '2026-03-08' && back.timeStr === '03:30', JSON.stringify(back))
  }
}

// ── Chicago spring-forward gap: 02:30 does not exist on 2026-03-08 ──
{
  const r = zonedLocalTimeToUtc('2026-03-08T02:30', 'America/Chicago')
  check('2026-03-08T02:30 America/Chicago (inside the spring-forward gap) is rejected as nonexistent', !r.ok && r.reason === 'nonexistent', JSON.stringify(r))
}

// ── Chicago fall-back overlap: 01:30 on 2026-11-01 occurs twice ──
{
  const r = zonedLocalTimeToUtc('2026-11-01T01:30', 'America/Chicago')
  check('2026-11-01T01:30 America/Chicago (inside the fall-back overlap) is flagged ambiguous', !r.ok && r.reason === 'ambiguous', JSON.stringify(r))
  if (!r.ok && r.reason === 'ambiguous') {
    check('ambiguous result offers two distinct, hour-apart UTC instants', !!r.earlier && !!r.later && (r.later.getTime() - r.earlier.getTime() === 3600_000))
  }
}

// ── Lord Howe Island: a genuine 30-minute DST delta, not the usual 60 ──
{
  // Lord Howe Island DST begins 2026-10-04 02:00 -> 02:30 (clocks forward
  // only half an hour) — 02:15 that night does not exist.
  const gap = zonedLocalTimeToUtc('2026-10-04T02:15', 'Australia/Lord_Howe')
  check('Lord Howe 30-minute spring-forward gap (02:15 on transition night) is rejected as nonexistent', !gap.ok && gap.reason === 'nonexistent', JSON.stringify(gap))

  // An ordinary time well clear of the transition must resolve normally,
  // proving the half-hour offset itself is handled, not just detected.
  const normal = zonedLocalTimeToUtc('2026-10-04T10:00', 'Australia/Lord_Howe')
  check('an ordinary Lord Howe time resolves normally', normal.ok, JSON.stringify(normal))
  if (normal.ok) {
    const back = utcToZonedParts(normal.utc, 'Australia/Lord_Howe')
    check('Lord Howe time round-trips exactly', back.dateStr === '2026-10-04' && back.timeStr === '10:00', JSON.stringify(back))
  }

  // Lord Howe's fall-back is also a half-hour, on 2026-04-05 (verified
  // empirically, not assumed): 02:00 -> 01:30. 01:45 that night occurs twice.
  const ambiguous = zonedLocalTimeToUtc('2026-04-05T01:45', 'Australia/Lord_Howe')
  check('Lord Howe 30-minute fall-back overlap is flagged ambiguous, not silently resolved', !ambiguous.ok && ambiguous.reason === 'ambiguous', JSON.stringify(ambiguous))
  if (!ambiguous.ok && ambiguous.reason === 'ambiguous') {
    check('the two Lord Howe candidates are exactly 30 minutes apart, not 60 — proves the half-hour delta is actually respected, not assumed', !!ambiguous.earlier && !!ambiguous.later && (ambiguous.later.getTime() - ambiguous.earlier.getTime() === 30 * 60_000), JSON.stringify(ambiguous))
  }
}

// ── Invalid input ──
{
  const badZone = zonedLocalTimeToUtc('2026-06-01T20:00', 'Not/AZone')
  check('an invalid IANA zone string is rejected, not silently accepted', !badZone.ok && badZone.reason === 'invalid_timezone', JSON.stringify(badZone))

  const badFormat = zonedLocalTimeToUtc('June 1 2026 8pm', 'America/Chicago')
  check('a malformed local-time string is rejected', !badFormat.ok && badFormat.reason === 'invalid_format', JSON.stringify(badFormat))
}

// ── Date-line-crossing zone: calendar day correctly rolls over ──
{
  // 2026-01-01T05:00 in Pacific/Kiritimati (UTC+14, the earliest zone on
  // Earth) is 05:00 - 14h = 2025-12-31T15:00 UTC — the previous UTC
  // calendar day, not just a different hour.
  const r = zonedLocalTimeToUtc('2026-01-01T05:00', 'Pacific/Kiritimati')
  check('Pacific/Kiritimati (UTC+14) resolves to the correct prior UTC calendar day', r.ok && r.utc.getUTCFullYear() === 2025 && r.utc.getUTCMonth() === 11 && r.utc.getUTCDate() === 31 && r.utc.getUTCHours() === 15, JSON.stringify(r))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
