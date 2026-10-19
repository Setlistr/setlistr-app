// DB-free tests for lib/show-date.ts. Run in several viewer zones, e.g.:
//   TZ=America/Toronto npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-show-date.ts
import { showDay, isRealTimeZone } from '../lib/show-date'

let pass = 0, fail = 0
function check(name: string, got: Date | null, want: string) {
  const s = got ? `${got.getFullYear()}-${String(got.getMonth() + 1).padStart(2, '0')}-${String(got.getDate()).padStart(2, '0')}` : 'null'
  if (s === want) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`  FAIL ${name} — got ${s}, want ${want}`) }
}
const viewer = Intl.DateTimeFormat().resolvedOptions().timeZone

// 1. Date-only and UTC-midnight values are the calendar day, in every viewer zone.
check('upload: date-only performance_date', showDay({ performance_date: '2026-10-10', started_at: '2026-10-10T00:00:00+00:00' }), '2026-10-10')
check('upload: UTC-midnight performance_date (ISO)', showDay({ performance_date: '2026-10-10T00:00:00+00:00', started_at: '2026-10-10T00:00:00+00:00' }), '2026-10-10')
check('scheduled start: show-zone date stored as midnight', showDay({ performance_date: '2026-10-10T00:00:00Z', started_at: '2026-10-11T01:05:00Z' }, 'America/Toronto'), '2026-10-10')
check('upload with only started_at at UTC midnight', showDay({ performance_date: null, started_at: '2026-10-10T00:00:00+00:00' }), '2026-10-10')

// 2. An instant with the show's real zone: the day there, whatever the viewer's zone.
check('9pm Toronto show, show zone America/Toronto', showDay({ performance_date: '2026-10-11T01:00:00+00:00', started_at: '2026-10-11T01:00:00+00:00' }, 'America/Toronto'), '2026-10-10')
check('9pm Los Angeles show, show zone America/Los_Angeles', showDay({ performance_date: '2026-10-11T04:00:00+00:00' }, 'America/Los_Angeles'), '2026-10-10')
check('10pm Tokyo show, show zone Asia/Tokyo', showDay({ performance_date: '2026-10-10T13:00:00+00:00' }, 'Asia/Tokyo'), '2026-10-10')

// 3. An instant with the 'UTC' placeholder or no zone: the viewer's day (documented limitation).
const inst = new Date('2026-10-11T01:00:00+00:00')
const local = `${inst.getFullYear()}-${String(inst.getMonth() + 1).padStart(2, '0')}-${String(inst.getDate()).padStart(2, '0')}`
check(`unscheduled capture, 'UTC' placeholder → viewer's day (${viewer})`, showDay({ performance_date: '2026-10-11T01:00:00+00:00' }, 'UTC'), local)
check(`unscheduled capture, no zone → viewer's day (${viewer})`, showDay({ started_at: '2026-10-11T01:00:00+00:00' }), local)
check('an invalid zone falls back to the viewer', showDay({ performance_date: '2026-10-11T01:00:00+00:00' }, 'Mars/Olympus'), local)

// The old behaviour this replaces: the UTC date part of an evening instant.
check('regression guard: not the UTC date part when the show zone is known', showDay({ started_at: '2026-10-11T01:00:00+00:00' }, 'America/Toronto'), '2026-10-10')
check('no date at all', showDay({}), 'null')
if (isRealTimeZone('UTC') || !isRealTimeZone('Europe/London')) { fail++; console.log('  FAIL isRealTimeZone') } else { pass++; console.log('  ok   isRealTimeZone treats UTC as the placeholder') }

console.log(`\n${pass} passed, ${fail} failed (viewer zone ${viewer})`)
process.exit(fail ? 1 : 0)
