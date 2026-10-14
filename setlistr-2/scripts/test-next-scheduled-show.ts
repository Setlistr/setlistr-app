// DB-free tests for picking the dashboard's "next" scheduled show and its
// day label (lib/scheduleTime.ts). Past shows still marked 'scheduled'
// (never started or cancelled) must not be shown as next; "today" is judged
// in the show's own timezone; dates outside the current year carry it.
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-next-scheduled-show.ts

import { pickNextScheduled, isUpcomingInZone, relativeDayLabel, zonedToday } from '../lib/scheduleTime'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

const TO = 'America/Toronto', LA = 'America/Los_Angeles', TYO = 'Asia/Tokyo'
// Oct 14 2026, 10:00 in Toronto (14:00Z)
const now = new Date('2026-10-14T14:00:00Z')
function s(id: string, iso: string, tz: string = TO) { return { id, scheduled_at: iso, timezone: tz } }

// The reported case: an Oct 8 show still marked scheduled on Oct 14
{
  const shows = [s('oct8', '2026-10-09T00:00:00Z'), s('oct21', '2026-10-22T00:00:00Z')] // 8 PM Toronto on Oct 8 / Oct 21
  const r = pickNextScheduled(shows, now)
  check('past Oct 8 show is skipped; Oct 21 is next', r.next?.id === 'oct21', r.next?.id)
  check('past still-scheduled shows are counted, not hidden silently', r.pastCount === 1)
}
// Today: earlier today and later today both count as today's show
{
  const earlier = s('earlier', '2026-10-14T12:00:00Z') // 8 AM Toronto, already passed
  const later = s('later', '2026-10-15T00:00:00Z')     // 8 PM Toronto today
  check('a show earlier today is still upcoming (whole venue-local day)', isUpcomingInZone(earlier.scheduled_at, TO, now))
  check('tonight\'s show is upcoming', isUpcomingInZone(later.scheduled_at, TO, now))
  check('earliest of today\'s shows is next', pickNextScheduled([later, earlier], now).next?.id === 'earlier')
  check('label: Today', relativeDayLabel('2026-10-14', zonedToday(now, TO)) === 'Today')
}
// Future
{
  check('label: Tomorrow', relativeDayLabel('2026-10-15', '2026-10-14') === 'Tomorrow')
  check('label: same-year date has no year', relativeDayLabel('2026-10-21', '2026-10-14') === 'Wed, Oct 21', relativeDayLabel('2026-10-21', '2026-10-14'))
  check('label: next-year date carries the year', relativeDayLabel('2027-01-08', '2026-10-14') === 'Fri, Jan 8, 2027', relativeDayLabel('2027-01-08', '2026-10-14'))
  check('label: past-year date carries the year', /2025/.test(relativeDayLabel('2025-10-08', '2026-10-14')))
  check('label: Yesterday', relativeDayLabel('2026-10-13', '2026-10-14') === 'Yesterday')
}
// Timezone edges: judged in the venue's zone, not UTC or the device
{
  // 11:30 PM Oct 14 in LA = 06:30Z Oct 15. At 03:00Z Oct 15 it's still Oct 14 in LA.
  const laNow = new Date('2026-10-15T03:00:00Z')
  check('LA show tonight stays "today" after UTC has rolled over', isUpcomingInZone('2026-10-15T06:30:00Z', LA, laNow) && relativeDayLabel('2026-10-14', zonedToday(laNow, LA)) === 'Today')
  // A Tokyo show on Oct 14 local (ended) when it's already Oct 15 in Tokyo but Oct 14 in Toronto
  const tyoNow = new Date('2026-10-14T16:00:00Z') // Oct 15 01:00 Tokyo
  check('Tokyo show on Oct 14 is past once Tokyo is on Oct 15, even though Toronto is still Oct 14', !isUpcomingInZone('2026-10-14T10:00:00Z', TYO, tyoNow))
  check('an invalid stored timezone does not throw (treated as UTC)', typeof isUpcomingInZone('2026-10-20T00:00:00Z', 'Not/AZone', now) === 'boolean')
}
// Empty and all-past
{
  check('no shows -> no next', pickNextScheduled([], now).next === null)
  const r = pickNextScheduled([s('a', '2026-10-01T00:00:00Z'), s('b', '2026-10-05T00:00:00Z')], now)
  check('all past -> no next, both counted as past', r.next === null && r.pastCount === 2)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
