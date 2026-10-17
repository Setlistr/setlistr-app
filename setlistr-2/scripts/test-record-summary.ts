// DB-free tests for lib/record-summary.ts — the dashboard's hero count,
// milestone ticks, "N of M shows" marked submitted and "Last show" all come
// from one isCapturedShow() set, so they can never disagree with each other.
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-record-summary.ts

import { summarizeRecord, milestoneFor, showDate, lastShowLabel, recordPositionOf, milestoneHeldBy, type RecordShow } from '../lib/record-summary'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

let n = 0
const show = (o: Partial<RecordShow> = {}): RecordShow => ({
  id: `p${++n}`, status: 'complete', submission_status: null, data_source: 'captured',
  venue_name: 'The Fillmore', performance_date: '2026-09-01', started_at: '2026-09-01T02:00:00Z', created_at: '2026-09-01T02:00:00Z', ...o,
})

// ── milestoneFor ───────────────────────────────────────────────────────
{
  const m = milestoneFor(183)
  check('milestone 183 -> block 176..200, 17 to go', m.first === 176 && m.next === 200 && m.toGo === 17, JSON.stringify(m))
  const m2 = milestoneFor(184)
  check('milestone 184 -> 16 to go (follows the current count)', m2.next === 200 && m2.toGo === 16)
  const m3 = milestoneFor(200)
  check('milestone exactly 200 -> next block 201..225, 25 to go', m3.first === 201 && m3.next === 225 && m3.toGo === 25, JSON.stringify(m3))
  const m4 = milestoneFor(0)
  check('milestone 0 -> 1..25', m4.first === 1 && m4.next === 25 && m4.toGo === 25)
  const m5 = milestoneFor(7)
  check('milestone 7 -> 1..25, 18 to go', m5.next === 25 && m5.toGo === 18)
}

// ── summarizeRecord: one definition for every figure ───────────────────
{
  const perfs: RecordShow[] = [
    show({ submission_status: 'submitted' }),
    show({ status: 'review' }),
    show({ status: 'processing', submission_status: 'submitted' }),
    show({ venue_name: '.' }),                                         // placeholder: excluded
    show({ venue_name: '', submission_status: 'submitted' }),           // placeholder, submitted: excluded from both
    show({ status: 'draft' }),                                         // abandoned upload: excluded
    show({ status: 'live' }),                                          // in progress: excluded
    show({ data_source: 'setlistfm_imported', submission_status: 'submitted' }), // imported: excluded
  ]
  const s = summarizeRecord(perfs)
  check('count uses isCapturedShow (3 of 8)', s.count === 3, String(s.count))
  check('submitted counts only within the same set (2, not 4)', s.submitted === 2, String(s.submitted))
  check('milestone derives from the same count', s.milestone.toGo === 25 - 3)
  check('submitted never exceeds the denominator', s.submitted <= s.count)
}

// ── Ending a live show moves every figure together ────────────────────
{
  const base = Array.from({ length: 183 }, (_, i) => show({ submission_status: i < 45 ? 'submitted' : null }))
  const live = show({ status: 'live', venue_name: "Jesse's House" })
  const before = summarizeRecord([...base, live])
  const after = summarizeRecord([...base, { ...live, status: 'review' }])
  check('live show not yet on the record: 183, 45 of 183, 17 to go', before.count === 183 && before.submitted === 45 && before.milestone.toGo === 17)
  check('after End Show (status review): 184, 45 of 184, 16 to go', after.count === 184 && after.submitted === 45 && after.milestone.toGo === 16)
}

// ── Last show: by show date, not creation order ────────────────────────
{
  const older = show({ id: 'older', venue_name: 'Older', performance_date: '2026-08-01', created_at: '2026-10-10T12:00:00Z' }) // uploaded late
  const newer = show({ id: 'newer', venue_name: 'Newer', performance_date: '2026-10-05', created_at: '2026-10-05T03:00:00Z' })
  const placeholderLatest = show({ id: 'ph', venue_name: '..', performance_date: '2026-10-12' })
  const s = summarizeRecord([older, newer, placeholderLatest])
  check('last show = latest show date, not latest created', s.lastShow?.id === 'newer', s.lastShow?.id)
  check('last show ignores rows outside the record (placeholder)', s.lastShow?.id !== 'ph')
  const fallback = summarizeRecord([show({ id: 'a', performance_date: null, started_at: '2026-10-01T03:00:00Z' }), show({ id: 'b', performance_date: null, started_at: '2026-09-01T03:00:00Z', created_at: '2026-10-11T00:00:00Z' })])
  check('without performance_date, started_at decides', fallback.lastShow?.id === 'a', fallback.lastShow?.id)
  check('empty record -> no last show', summarizeRecord([]).lastShow === null)
}

// ── showDate ───────────────────────────────────────────────────────────
{
  const d = showDate({ performance_date: '2026-10-12' })!
  check('date-only -> that local calendar day', d.getFullYear() === 2026 && d.getMonth() === 9 && d.getDate() === 12)
  const u = showDate({ performance_date: '2026-10-12T00:00:00+00:00' })!
  check('UTC-midnight timestamp -> that calendar day (no west-of-UTC slip)', u.getDate() === 12)
  check('nothing set -> null', showDate({}) === null)
}

// ── lastShowLabel ──────────────────────────────────────────────────────
{
  const now = new Date(2026, 9, 14, 9, 0)
  check('same day -> Today', lastShowLabel(new Date(2026, 9, 14, 1), now) === 'Today')
  check('previous calendar day, under 24h -> Yesterday', lastShowLabel(new Date(2026, 9, 13, 23, 30), now) === 'Yesterday')
  check('9 calendar days -> "9 days ago"', lastShowLabel(new Date(2026, 9, 5), now) === '9 days ago')
  check('over ~2 months -> a date', /2026/.test(lastShowLabel(new Date(2026, 5, 1), now)))
}

// ── recordPositionOf / milestoneHeldBy: earned by a show, in show-date order ──
{
  const days = (k: number) => { const d = new Date(Date.UTC(2026, 0, 1) + k * 86400000); return d.toISOString().slice(0, 10) }
  // 50 shows, created in reverse order of their dates: position follows the show's date, not when it was saved.
  const fifty = Array.from({ length: 50 }, (_, i) => show({ id: `s${i + 1}`, performance_date: days(i), started_at: `${days(i)}T02:00:00Z`, created_at: `2026-12-${String(30 - Math.floor(i / 2)).padStart(2, '0')}T00:00:00Z` }))
  check('position follows show date, not creation order', recordPositionOf(fifty, 's1') === 1 && recordPositionOf(fifty, 's50') === 50)
  check('the 50th show by date holds milestone 50', milestoneHeldBy(fifty, 's50') === 50)
  check('the 25th holds 25; the 24th and 49th hold none', milestoneHeldBy(fifty, 's25') === 25 && milestoneHeldBy(fifty, 's24') === null && milestoneHeldBy(fifty, 's49') === null)
  // A backdated show added later moves every later show up one.
  const backdated = [...fifty, show({ id: 'early', performance_date: '2025-12-15', started_at: '2025-12-15T02:00:00Z', created_at: '2027-01-05T00:00:00Z' })]
  check('backdated show: the old 50th becomes the 51st and holds nothing', recordPositionOf(backdated, 's50') === 51 && milestoneHeldBy(backdated, 's50') === null)
  check('backdated show: the milestone passes to the show before it', milestoneHeldBy(backdated, 's49') === 50 && milestoneHeldBy(backdated, 's24') === 25)
  // Same-day shows: start time decides, then creation, then id.
  const sameDay = [show({ id: 'late', performance_date: '2026-05-01', started_at: '2026-05-01T23:00:00Z' }), show({ id: 'early-set', performance_date: '2026-05-01', started_at: '2026-05-01T19:00:00Z' })]
  check('same day: the earlier start comes first', recordPositionOf(sameDay, 'early-set') === 1 && recordPositionOf(sameDay, 'late') === 2)
  // Only shows the record counts.
  const mixed = [...fifty.slice(0, 24), show({ id: 'imp', data_source: 'setlistfm_imported', performance_date: days(0) }), show({ id: 'draft', status: 'draft', performance_date: days(1) }), show({ id: 'placeholder', venue_name: '', performance_date: days(2) }), fifty[24]]
  check('imports, drafts and placeholder venues are not on the record', recordPositionOf(mixed, 's25') === 25 && milestoneHeldBy(mixed, 's25') === 25 && recordPositionOf(mixed, 'imp') === null && recordPositionOf(mixed, 'draft') === null)
  check('a show already counted in review holds its place too', milestoneHeldBy([...fifty.slice(0, 24), { ...fifty[24], status: 'review' }], 's25') === 25)
  check('unknown id -> null', recordPositionOf(fifty, 'nope') === null)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
