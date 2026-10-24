// DB-free tests for lib/shows/import (sheet.ts, review.ts). Run:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-show-import.ts
import { buildSheet, fromExcelDate, serialToDate, headingField, type RawCell, type Field } from '../lib/shows/import/sheet'
import { analyse, breakdown, detectOrder, needsOrder, readTimes, zoneCandidates, question, type Context, type Fix, type Order } from '../lib/shows/import/review'

let pass = 0, fail = 0
function check(name: string, ok: boolean, got?: unknown) { if (ok) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`  FAIL ${name}`, got === undefined ? '' : JSON.stringify(got)) } }
const NOW = new Date('2026-10-24T12:00:00Z')
const EMPTY: Context = { records: [], summaries: {}, knownVenues: {}, imported: {} }
const H = ['Date', 'Venue', 'City', 'State', 'Country', 'Set time']
const sheet = (rows: RawCell[][], headers: string[] = H) => buildSheet('t.xlsx', 'a'.repeat(64), { name: 'Tour', rows: [headers, ...rows] }, ['Tour'])
const run = (rows: RawCell[][], fixes: Record<number, Fix> = {}, ctx: Context = EMPTY, order?: Order | null, headers?: string[]) => {
  const f = sheet(rows, headers); const map = f.guess
  return analyse(f, map, order === undefined ? detectOrder(f, map).order : order, fixes, ctx, NOW)
}
const one = (row: RawCell[], fixes: Fix = {}, ctx: Context = EMPTY, order: Order | null = 'DMY') => run([row], fixes ? { 2: fixes } : {}, ctx, order)[0]

console.log('— sheet: headers, columns, cells')
{
  const f = buildSheet('t.xlsx', 'x', { name: 'S', rows: [['LENA MARSH LIVE'], [], ['Date', 'Event', 'Venue', 'City', 'Country', 'Set time', 'Fee', 'Date'], ['14/02/2025', '', "Lee's Palace", 'Toronto', 'Canada', '9:30pm', '1,500', 'x']] }, ['S'])
  check('header row found below title rows', f.headerRow === 3, f.headerRow)
  check('columns guessed from headings; unknown ones not imported', f.guess.join(',') === 'date,name,venue,city,country,time,skip,skip', f.guess)
  check('a second column with the same guess is left out', f.guess[7] === 'skip')
  check('rows keep their sheet row numbers', f.rows[0][0] === 4)
  const g = buildSheet('t.csv', 'x', { name: 'S', rows: [['when?', 'where'], ['2025-03-01', 'Oslo'], ['2025-03-02', 'Oslo']] }, ['S'])
  check('a date column is found from its values when no heading says so', g.guess[0] === 'date' && g.guess[1] === 'venue', g.guess)
  check('heading synonyms', headingField('Show date') === 'date' && headingField('Time zone') === 'zone' && headingField('Town') === 'city' && headingField('Fee') === null)
  check('Excel date cell read from UTC parts', JSON.stringify(fromExcelDate(new Date(Date.UTC(2025, 1, 14)))) === '{"date":"2025-02-14"}')
  check('Excel time cell (day zero) read as a time', JSON.stringify(fromExcelDate(new Date(Date.UTC(1899, 11, 30, 21, 0)))) === '{"time":"21:00"}')
  check('date serial 45731 → 2025-03-15 (suggestion only)', serialToDate(45731) === '2025-03-15')
  check('small numbers are not date serials', serialToDate(12) === null)
}

console.log('— date order')
{
  const f = sheet([['03/04/2025', 'A', 'X', '', 'UK', ''], ['14/02/2025', 'B', 'X', '', 'UK', '']]); const m = f.guess
  check('a first part over 12 proves day first', detectOrder(f, m).order === 'DMY')
  const g = sheet([['03/04/2025', 'A', 'X', '', 'UK', ''], ['02/14/2025', 'B', 'X', '', 'UK', '']])
  check('a second part over 12 proves month first', detectOrder(g, g.guess).order === 'MDY')
  const h = sheet([['03/04/2025', 'A', 'X', '', 'UK', ''], ['05/06/2025', 'B', 'X', '', 'UK', '']])
  check('nothing proves it → unknown, and the file needs an answer', detectOrder(h, h.guess).order === null && needsOrder(h, h.guess))
  const rows = analyse(h, h.guess, null, {}, EMPTY, NOW)
  check('rows wait for the date order', rows.every(r => r.status === 'waiting'))
  check('month first reads 03/04/2025 as Mar 4', analyse(h, h.guess, 'MDY', {}, EMPTY, NOW)[0].dates[0] === '2025-03-04')
  const iso = sheet([['2025-04-03', 'A', 'X', '', 'UK', '']])
  check('ISO dates need no order', !needsOrder(iso, iso.guess) && analyse(iso, iso.guess, null, {}, EMPTY, NOW)[0].dates[0] === '2025-04-03')
}

console.log('— dates')
check('two-digit year read as 20YY with a note', (r => r.dates[0] === '2025-08-02' && r.notes.some(n => n.includes('2025')))(one(['2/8/25', 'Oslo', 'London', '', 'UK', ''])))
check('month name with year', one(['12 Apr 2025', 'X', 'London', '', 'UK', '']).dates[0] === '2025-04-12')
check('weekday and ordinal', one(['Sat April 12th, 2025', 'X', 'London', '', 'UK', '']).dates[0] === '2025-04-12')
{
  const r = one(['12 Apr', 'Mercury Lounge', 'New York', 'NY', 'USA', '7:30 PM'])
  check('missing year → asked, never guessed', r.issues[0].k === 'year' && r.dates.length === 0 && question(r) === 'Which year?')
  check('any year can be chosen (2019)', one(['12 Apr', 'Mercury Lounge', 'New York', 'NY', 'USA', ''], { year: 2019 }).dates[0] === '2019-04-12')
}
{
  const r = one(['18-20/07/2025', 'Hillside Island Stage', 'Guelph', 'ON', 'Canada', ''])
  check('a range asks for the dates to add', r.issues[0].k === 'range' && (r.issues[0] as any).days.join() === '18,19,20')
  const r2 = one(['18–20 Jul 2025', 'Hillside Island Stage', 'Guelph', 'ON', 'Canada', ''])
  check('a written range too', r2.issues[0].k === 'range')
  const r3 = one(['18-20/07/2025', 'Hillside Island Stage', 'Guelph', 'ON', 'Canada', ''], { days: [20, 18] })
  check('chosen dates, in order; never every day automatically', r3.dates.join() === '2025-07-18,2025-07-20' && r3.status === 'ready')
}
check('not a real date (31/02)', one(['31/02/2025', 'X', 'London', '', 'UK', '']).issues[0].k === 'invalid')
check('TBC → skipped, no date', (r => r.status === 'out' && r.outReason === 'no_date')(one(['TBC', 'X', 'Vancouver', 'BC', 'Canada', ''])))
{
  const r = one([45731, 'Oslo', 'London', '', 'UK', ''])
  check('a bare number in the date column must be confirmed', r.issues[0].k === 'serial' && r.status === 'decide' && r.outReason === 'unconfirmed_date_number')
  check('confirmed → that date', one([45731, 'Oslo', 'London', '', 'UK', ''], { serialOk: true }).dates[0] === '2025-03-15')
}
check('Excel date cell needs no order', one([{ date: '2025-02-14' }, 'X', 'London', '', 'UK', ''], {}, EMPTY, null).dates[0] === '2025-02-14')

console.log('— times')
check('9:30pm', readTimes({ text: '9:30pm' })[0] === '21:30')
check('8pm', readTimes({ text: '8pm' })[0] === '20:00')
check('21:00', readTimes({ text: '21:00' })[0] === '21:00')
check('20h and 20h30', readTimes({ text: '20h' })[0] === '20:00' && readTimes({ text: '20h30' })[0] === '20:30')
check('8.30 p.m.', readTimes({ text: '8.30 p.m.' })[0] === '20:30', readTimes({ text: '8.30 p.m.' }))
check('Excel time cell', readTimes({ text: '21:00', time: '21:00' })[0] === '21:00')
check('TBA → no time', readTimes({ text: 'TBA' }).length === 0)
{
  const r = one(['14/11/2026', 'Massey Hall', 'Toronto', 'ON', 'Canada', 'Doors 7pm / show 8:30pm'], { zone: 'America/Toronto' })
  check('two times → asked which is the start', r.issues[0].k === 'times' && (r.issues[0] as any).options.join() === '19:00,20:30')
  check('chosen start time resolves it', one(['14/11/2026', 'Massey Hall', 'Toronto', 'ON', 'Canada', 'Doors 7pm / show 8:30pm'], { zone: 'America/Toronto', time: '20:30' }).status === 'ready')
}
check('date only stays date only (no midnight)', (r => r.time === null && r.scheduledAt === null && r.status === 'ready')(one(['15/02/2025', 'Horseshoe Tavern', 'Toronto', 'ON', 'Canada', ''])))

console.log('— time zones')
{
  const r = one(['05/04/2025', 'Le Ritz PDB', 'Montréal', 'QC', 'Canada', '21:00'])
  check('past, multi-zone country, with a time → zone asked; the time is kept as written', r.issues[0].k === 'zone-time' && r.time === '21:00' && r.scheduledAt === null)
  const k = one(['05/04/2025', 'Le Ritz PDB', 'Montréal', 'QC', 'Canada', '21:00'], { noZone: true })
  check('kept as written: time stored, no zone, no instant', k.status === 'ready' && k.timeAsWritten && k.time === '21:00' && k.zone === null && k.scheduledAt === null)
  const u = one(['07/11/2026', 'The Sinclair', 'Cambridge', 'MA', 'USA', '9pm'], { noZone: true })
  check('upcoming: a zone is required even if “as written” was chosen', u.issues[0].k === 'zone-up' && u.status === 'decide')
  check('one-zone country gives the zone', one(['31/10/2026', 'Union Chapel', 'London', '', 'UK', '19:30']).zone === 'Europe/London')
  check('a venue in the artist’s records gives its zone', one(['14/02/2025', "Lee's Palace", 'Toronto', 'ON', 'Canada', '9:30pm'], {}, { ...EMPTY, knownVenues: { "lee's palace|toronto": 'America/Toronto' } }).zoneFrom === 'venue')
  check('zone column with a named zone is used', run([['01/05/2027', 'X', 'Denver', 'CO', 'USA', '8pm', 'America/Denver']], {}, EMPTY, 'DMY', [...H, 'Time zone'])[0].zone === 'America/Denver')
  check('zone column with an abbreviation is refused and asked', run([['01/05/2027', 'X', 'Denver', 'CO', 'USA', '8pm', 'MST']], {}, EMPTY, 'DMY', [...H, 'Time zone'])[0].issues[0].k === 'zone-bad')
  check('past date-only row with no zone is fine', one(['15/02/2025', 'X', 'Nashville', 'TN', 'USA', '']).status === 'ready')
  check('no zone, dated today → zone needed (upcoming or not is unknown)', one(['24/10/2026', 'X', 'Nashville', 'TN', 'USA', '']).issues[0].k === 'zone-up')
}

console.log('— daylight saving')
{
  const r = one(['01/11/2026', "Baby's All Right", 'Brooklyn', 'NY', 'USA', '1:30am'], { zone: 'America/New_York' })
  check('repeated 1:30 AM → two instants offered', r.issues[0].k === 'dst-overlap' && (r.issues[0] as any).options.length === 2)
  const opts = (r.issues[0] as any).options
  check('either offered instant resolves it', one(['01/11/2026', "Baby's All Right", 'Brooklyn', 'NY', 'USA', '1:30am'], { zone: 'America/New_York', instant: opts[1] }).scheduledAt === opts[1])
  check('an instant that wasn’t offered is ignored', one(['01/11/2026', "Baby's All Right", 'Brooklyn', 'NY', 'USA', '1:30am'], { zone: 'America/New_York', instant: '2026-11-01T00:00:00.000Z' }).status === 'decide')
  const g = one(['08/03/2026', 'Rockwood Music Hall', 'New York', 'NY', 'USA', '2:30am'], { zone: 'America/New_York' })
  check('skipped 2:30 AM → asked; suggestion is labelled data only', g.issues[0].k === 'dst-gap' && g.scheduledAt === null && (g.issues[0] as any).suggestion === '03:30')
  check('the intended time resolves it', one(['08/03/2026', 'Rockwood Music Hall', 'New York', 'NY', 'USA', '2:30am'], { zone: 'America/New_York', time: '01:45' }).status === 'ready')
}

console.log('— multi-zone US/Canada tour: bulk zone choice')
{
  const tour: RawCell[][] = [
    ['01/12/2026', 'Mercury Lounge', 'New York', 'NY', 'USA', '8pm'],
    ['02/12/2026', 'Bowery Ballroom', 'New York', 'NY', 'USA', '9pm'],
    ['03/12/2026', "Baby's All Right", 'Brooklyn', 'NY', 'USA', '9pm'],
    ['04/12/2026', 'Metro', 'Chicago', 'IL', 'USA', '8pm'],
    ['05/12/2026', 'Bluebird', 'Denver', 'CO', 'USA', '8pm'],
    ['06/12/2026', 'Crescent Ballroom', 'Phoenix', 'AZ', 'USA', '8pm'],
    ['07/12/2026', 'Crystal Ballroom', 'Portland', 'OR', 'USA', '8pm'],
    ['08/12/2026', 'State Theatre', 'Portland', 'ME', 'USA', '8pm'],
    ['09/12/2026', 'Commodore Ballroom', 'Vancouver', 'BC', 'Canada', '8pm'],
    ['10/12/2026', 'The Marquee', 'Halifax', 'NS', 'Canada', '8pm'],
    ['11/12/2026', 'Danforth Music Hall', 'Toronto', 'ON', 'Canada', '8pm'],
    ['12/12/2026', 'Mystery Room', '', '', 'USA', '8pm'],
  ]
  const rows = run(tour, {}, EMPTY, 'DMY')
  check('every row in a multi-zone country needs a zone (none guessed)', rows.every(r => r.issues.some(i => i.k === 'zone-up')), rows.map(r => r.issues[0]?.k))
  const ny = rows[0]
  const c = zoneCandidates(rows, ny)
  check('from New York: only the other New York row is suggested', c.filter(x => x.samePlace).map(x => x.row.city).join() === 'New York', c.filter(x => x.samePlace).map(x => x.row.n))
  check('Brooklyn is offered but not ticked', c.some(x => x.row.city === 'Brooklyn' && !x.samePlace))
  check('Chicago, Denver, Phoenix, Vancouver are never ticked from New York', c.filter(x => ['Chicago', 'Denver', 'Phoenix', 'Vancouver'].includes(x.row.city)).every(x => !x.samePlace))
  const por = zoneCandidates(rows, rows[6])
  check('Portland OR does not tick Portland ME', por.find(x => x.row.region === 'ME')!.samePlace === false)
  check('a row with no city is never ticked', c.find(x => x.row.city === '')!.samePlace === false)
  const fixes: Record<number, Fix> = { 2: { zone: 'America/New_York' }, 3: { zone: 'America/New_York' } }
  const after = run(tour, fixes, EMPTY, 'DMY')
  check('ticked rows resolved; unticked rows stay unresolved', after[0].status === 'ready' && after[1].status === 'ready' && after.slice(2).every(r => r.status === 'decide'))
  check('Phoenix keeps its own zone when chosen (no DST)', run(tour, { 7: { zone: 'America/Phoenix' } }, EMPTY, 'DMY')[5].scheduledAt === '2026-12-07T03:00:00.000Z')
}

console.log('— duplicates and re-imports')
{
  const ctx: Context = {
    records: [{ key: 'p:h4', venueId: 'v', venueName: "Lee's Palace", city: 'Toronto', country: 'Canada', localDate: '2025-02-14', instant: Date.parse('2025-02-15T02:40:00Z') },
      { key: 's:imp1', venueId: 'v2', venueName: 'Union Chapel', city: 'London', country: 'UK', localDate: '2026-10-31', instant: Date.parse('2026-10-31T19:30:00Z') }],
    summaries: { 'p:h4': { date: '2025-02-14', venue: "Lee's Palace", city: 'Toronto', line: 'Recognised live' }, 's:imp1': { date: '2026-10-31', venue: 'Union Chapel', city: 'London', line: 'Imported' } },
    knownVenues: { "lee's palace|toronto": 'America/Toronto' }, imported: { 's:imp1': { file: 'tour.xlsx', at: '2026-10-20T10:00:00Z', time: '19:30' } },
  }
  const d = one(['14/02/2025', "Lee's Palace", 'Toronto', 'ON', 'Canada', '9:30pm'], {}, ctx)
  check('possible duplicate of a capture → decision needed', d.status === 'decide' && d.pair?.key === 'p:h4' && !d.pair.alreadyImported)
  check('skip → left out as a skipped duplicate', one(['14/02/2025', "Lee's Palace", 'Toronto', 'ON', 'Canada', '9:30pm'], { decision: 'skip' }, ctx).outReason === 'possible_duplicate_skipped')
  check('import as another record → ready', one(['14/02/2025', "Lee's Palace", 'Toronto', 'ON', 'Canada', '9:30pm'], { decision: 'keep' }, ctx).status === 'ready')
  const a = one(['31/10/2026', 'Union Chapel', 'London', '', 'UK', '19:30'], {}, ctx)
  check('the same booking from an earlier import → left out as already imported', a.status === 'out' && a.outReason === 'already_imported' && a.pair?.alreadyImported?.file === 'tour.xlsx')
  check('…unless imported as another record', one(['31/10/2026', 'Union Chapel', 'London', '', 'UK', '19:30'], { decision: 'keep' }, ctx).status === 'ready')
  const t = one(['31/10/2026', 'Union Chapel', 'London', '', 'UK', '20:00'], {}, ctx)
  check('a different time is a possible duplicate, not “already imported”', t.status === 'decide' && !t.pair?.alreadyImported)
  const s = run([['02/08/2025', 'Oslo', 'London', '', 'UK', '20:30'], ['2/8/25', 'Oslo', 'London', '', 'UK', '8:30pm']], {}, EMPTY, 'DMY')
  check('repeat within the sheet: the later row asks, the earlier is noted', s[1].pair?.rowNo === 2 && s[0].repeatedBy === 3 && s[0].status === 'ready')
}

{
  const pairCtx: Context = { ...EMPTY, records: [
    { key: 's:a', venueId: 'v', venueName: 'Massey Hall', city: 'Toronto', country: 'Canada', localDate: '2026-11-14', instant: null },
    { key: 's:b', venueId: 'v', venueName: 'Massey Hall', city: 'Toronto', country: 'Canada', localDate: '2026-11-14', instant: null }] }
  check('two existing records that pair with each other are ignored (no crash)', run([['31/10/2026', 'Union Chapel', 'London', '', 'UK', '19:30']], {}, pairCtx, 'DMY')[0].status === 'ready')
}

console.log('— breakdown: rows versus shows')
{
  const rows = run([['18-20/07/2025', 'Hillside', 'Guelph', 'ON', 'Canada', ''], ['31/10/2026', 'Union Chapel', 'London', '', 'UK', '19:30'], ['TBC', 'X', 'Y', '', 'UK', ''], ['12 Apr', 'Z', 'London', '', 'UK', '']], { 2: { days: [18, 20] } })
  const b = breakdown(rows)
  check('2 ready rows become 3 shows (a range with 2 dates)', b.ready.length === 2 && b.shows.length === 3 && b.multi.length === 1)
  check('future 1, past 2', b.future === 1 && b.past === 2)
  check('left out: no date + unresolved year, with reasons', b.skippedRows.map(x => `${x.row}:${x.reason}`).join() === '4:no_date,5:unresolved_year')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
