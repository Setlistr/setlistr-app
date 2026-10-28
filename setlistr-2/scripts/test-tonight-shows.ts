// Unit tests for lib/tonightShows.ts ("Tonight's show, one tap").
// Run: npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-tonight-shows.ts
import { tonightShows, confirmWhenText, isValidZone } from '../lib/tonightShows'

let pass = 0, fail = 0
const check = (n: string, c: boolean, d?: unknown) => { if (c) { pass++; console.log('  ok  ', n) } else { fail++; console.log('  FAIL', n, d === undefined ? '' : JSON.stringify(d)) } }
const s = (id: string, scheduled_at: string | null, timezone: string | null, local_date: string | null = null) => ({ id, scheduled_at, timezone, local_date })
const ids = (r: { show: { id: string } }[]) => r.map(x => x.show.id).join(',')
const CHI = 'America/Chicago', NY = 'America/New_York'

// 6:40 PM CDT, Wed 2026-10-28 (23:40Z); the device is in Chicago unless stated.
const evening = new Date('2026-10-28T23:40:00Z')

console.log('— Eligibility (discoverability, not evidence)')
check('8 PM tonight is offered', tonightShows([s('a', '2026-10-29T01:00:00Z', CHI)], evening, CHI).length === 1)
check('two tonight, ordered by start time; none chosen', ids(tonightShows([s('late', '2026-10-29T03:30:00Z', CHI), s('early', '2026-10-29T00:00:00Z', CHI)], evening, CHI)) === 'early,late')
check('tomorrow 8 PM (25 h away) is not offered', tonightShows([s('t', '2026-10-30T01:00:00Z', CHI)], evening, CHI).length === 0)
check('12:30 AM tomorrow (within 12 h) is offered', tonightShows([s('n', '2026-10-29T05:30:00Z', CHI)], evening, CHI).length === 1)
const afterMidnight = new Date('2026-10-29T05:15:00Z') // 12:15 AM CDT Thu
check('11:30 PM show still offered at 12:15 AM (6 h look-back)', tonightShows([s('m', '2026-10-29T04:30:00Z', CHI)], afterMidnight, CHI).length === 1)
check('a show 7 h past on a previous day is not offered', tonightShows([s('old', '2026-10-28T22:00:00Z', CHI)], afterMidnight, CHI).length === 0)
check('a morning show earlier on its own local today is still offered', tonightShows([s('am', '2026-10-28T15:00:00Z', CHI)], evening, CHI).length === 1)
check('the show’s zone decides "today", not the device’s (device in Sydney)', tonightShows([s('z', '2026-10-29T01:00:00Z', CHI)], evening, 'Australia/Sydney').length === 1)
check('DST fall-back night: the stored instant decides', tonightShows([s('dst', '2026-11-01T07:30:00Z', CHI)], new Date('2026-11-01T05:00:00Z'), CHI).length === 1)

console.log('— Missing or invalid time zones are never inferred from the phone')
check('invalid zone: not offered', tonightShows([s('bad', '2026-10-29T01:00:00Z', 'Not/AZone')], evening, CHI).length === 0)
check('missing zone: not offered', tonightShows([s('none', '2026-10-29T01:00:00Z', null)], evening, CHI).length === 0)
check('isValidZone', isValidZone(CHI) && !isValidZone('') && !isValidZone(null) && !isValidZone('Mars/Base'))

console.log('— Date-only bookings')
check('today: needs a start time (no Start)', (() => { const r = tonightShows([s('d', null, CHI, '2026-10-28')], evening, CHI); return r.length === 1 && r[0].kind === 'needs_time' && r[0].timeText === null })())
check('tomorrow: not offered', tonightShows([s('d2', null, CHI, '2026-10-29')], evening, CHI).length === 0)
check('after timed shows the same day', ids(tonightShows([s('d', null, CHI, '2026-10-28'), s('a', '2026-10-29T01:00:00Z', CHI)], evening, CHI)) === 'a,d')

console.log('— Labels (separate from eligibility)')
const one = (show: ReturnType<typeof s>, now: Date, dev: string | null) => tonightShows([show], now, dev)[0]
check('today, same zone: "Today", "8:00 PM" (no zone needed)', (() => { const r = one(s('a', '2026-10-29T01:00:00Z', CHI), evening, CHI); return r.dayText === 'Today' && r.timeText === '8:00 PM' })(), one(s('a', '2026-10-29T01:00:00Z', CHI), evening, CHI))
check('today, other zone: "8:00 PM EDT"', (() => { const r = one(s('ny', '2026-10-29T00:00:00Z', NY), evening, CHI); return r.dayText === 'Today' && r.timeText === '8:00 PM EDT' })(), one(s('ny', '2026-10-29T00:00:00Z', NY), evening, CHI))
check('tomorrow: "Tomorrow", zone shown ("12:30 AM CDT")', (() => { const r = one(s('n', '2026-10-29T05:30:00Z', CHI), evening, CHI); return r.dayText === 'Tomorrow' && r.timeText === '12:30 AM CDT' })(), one(s('n', '2026-10-29T05:30:00Z', CHI), evening, CHI))
check('previous day: its actual local date and zone ("Wed, Oct 28", "11:30 PM CDT")', (() => { const r = one(s('m', '2026-10-29T04:30:00Z', CHI), afterMidnight, CHI); return r.dayText === 'Wed, Oct 28' && r.timeText === '11:30 PM CDT' })(), one(s('m', '2026-10-29T04:30:00Z', CHI), afterMidnight, CHI))
check('unknown device zone: venue zone always shown', one(s('a', '2026-10-29T01:00:00Z', CHI), evening, null).timeText === '8:00 PM CDT')

console.log('— Confirmation date text')
check('"Wed, Oct 28 (today), 8:00 PM CDT"', confirmWhenText('2026-10-29T01:00:00Z', CHI, evening) === 'Wed, Oct 28 (today), 8:00 PM CDT', confirmWhenText('2026-10-29T01:00:00Z', CHI, evening))
check('after midnight: "Wed, Oct 28 (yesterday), 11:30 PM CDT"', confirmWhenText('2026-10-29T04:30:00Z', CHI, afterMidnight) === 'Wed, Oct 28 (yesterday), 11:30 PM CDT', confirmWhenText('2026-10-29T04:30:00Z', CHI, afterMidnight))
check('tomorrow: "Thu, Oct 29 (tomorrow), 12:30 AM CDT"', confirmWhenText('2026-10-29T05:30:00Z', CHI, evening) === 'Thu, Oct 29 (tomorrow), 12:30 AM CDT', confirmWhenText('2026-10-29T05:30:00Z', CHI, evening))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
