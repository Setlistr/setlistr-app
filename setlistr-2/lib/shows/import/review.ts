// Spreadsheet import review (docs/spreadsheet-import-plan.md). Pure; no I/O.
//
// - Dates are calendar dates as written. The date order comes from the
//   column; when nothing proves it, the person chooses. A missing year, the
//   dates of a range and a bare Excel day number are never guessed.
// - A time is the venue's wall-clock time, never dropped or converted while
//   its zone is unknown: the person picks the zone or (past rows only) keeps
//   the time as written with the zone not recorded.
// - A booking with no time stays date-only; midnight is never assumed.
// - Repeated (clocks back) and skipped (clocks forward) times are asked.
// - Past rows become listings ("No capture linked"), never performed shows.
// - Possible duplicates come from the released matcher, unchanged. A row
//   that is exactly a show from an earlier import is left out as "already
//   imported" unless the person imports it as another record.

import { zonedLocalTimeToUtc, zonedToday } from '../../scheduleTime'
import { findCandidates, venueKey, type IdentityRecord } from '../identity'
import { VENUE_REASON, TIME_REASON } from '../timeline'
import type { Cell, Field, SheetFile } from './sheet'
import { serialToDate } from './sheet'

export type Order = 'DMY' | 'MDY' | 'YMD'
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')
export const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const real = (y: number, m: number, d: number) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d }
export function shortDate(d: string): string { const [y, m, dd] = d.split('-').map(Number); return `${MONTH_SHORT[m - 1]} ${dd}, ${y}` }
export function weekdayDate(d: string): string { const [y, m, dd] = d.split('-').map(Number); return `${new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}, ${MONTH_SHORT[m - 1]} ${dd}, ${y}` }
export function datesText(ds: string[]): string {
  if (ds.length <= 1) return ds[0] ? shortDate(ds[0]) : ''
  const [y, m] = ds[0].split('-').map(Number)
  return ds.every(d => d.slice(0, 7) === ds[0].slice(0, 7)) ? `${MONTH_SHORT[m - 1]} ${ds.map(d => +d.slice(8)).join(' & ')}, ${y}` : ds.map(shortDate).join(' & ')
}
export function timeLabel(t: string): string { const [h, m] = t.split(':').map(Number); return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}` }

const NUMERIC = /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})$/
export function detectOrder(file: SheetFile, map: Field[]): { order: Order | null; evidence: string | null } {
  const col = map.indexOf('date'); if (col < 0) return { order: null, evidence: null }
  let numeric = 0
  for (const [, v] of file.rows) {
    const m = (v[col]?.text || '').match(NUMERIC); if (!m || v[col].date) continue
    numeric++
    if (m[1].length === 4) return { order: 'YMD', evidence: v[col].text }
    if (+m[1] > 12) return { order: 'DMY', evidence: v[col].text }
    if (+m[2] > 12) return { order: 'MDY', evidence: v[col].text }
  }
  return { order: numeric ? null : 'DMY', evidence: null }   // no numeric dates: the order doesn't matter
}
export function needsOrder(file: SheetFile, map: Field[]): boolean {
  const col = map.indexOf('date')
  return col >= 0 && file.rows.some(([, v]) => !v[col]?.date && NUMERIC.test(v[col]?.text || '') && !/^\d{4}/.test(v[col].text))
}
export function readNumeric(raw: string, order: Order): string | null {
  const m = raw.match(NUMERIC); if (!m) return null
  let d: number, mo: number, y: number
  if (m[1].length === 4) { y = +m[1]; mo = +m[2]; d = +m[3] }
  else if (order === 'MDY') { mo = +m[1]; d = +m[2]; y = +m[3] } else { d = +m[1]; mo = +m[2]; y = +m[3] }
  if (y < 100) y += 2000
  return real(y, mo, d) ? iso(y, mo, d) : null
}

const TIME_TOKEN = /(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?|(\d{1,2})h/gi
function parseTimeToken(s: string): string | null {
  const t = s.toLowerCase().replace(/\s+/g, '').replace(/a\.m\.?/, 'am').replace(/p\.m\.?/, 'pm').replace('.', ':')
  let m = t.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)$/)
  if (m && +m[1] >= 1 && +m[1] <= 12) { let h = +m[1] % 12; if (m[3] === 'pm') h += 12; return `${pad(h)}:${m[2] || '00'}` }
  m = t.match(/^(\d{1,2})(?::|h)(\d{2})?$/) || t.match(/^(\d{1,2}):(\d{2})$/)
  if (m && +m[1] < 24 && (!m[2] || +m[2] < 60)) return `${pad(+m[1])}:${m[2] || '00'}`
  return null
}
// Every time a cell mentions ("Doors 7pm / show 8:30pm" has two).
export function readTimes(c: Cell | undefined): string[] {
  if (!c) return []
  if (c.time) return [c.time]
  const s = c.text.trim(); if (!s || /^(tba|tbc|tbd|-|—)$/i.test(s)) return []
  const whole = parseTimeToken(s); if (whole) return [whole]
  const out: string[] = []
  for (const m of Array.from(s.matchAll(TIME_TOKEN))) { const t = parseTimeToken(m[0]); if (t && /[:h]|am|pm/i.test(m[0]) && !out.includes(t)) out.push(t) }
  return out
}

// Countries with one time zone, by name or code. Anything else needs a zone.
const ONE_ZONE: Record<string, string> = {
  uk: 'Europe/London', gb: 'Europe/London', 'united kingdom': 'Europe/London', 'great britain': 'Europe/London', england: 'Europe/London', scotland: 'Europe/London', wales: 'Europe/London', 'northern ireland': 'Europe/London',
  ireland: 'Europe/Dublin', ie: 'Europe/Dublin', france: 'Europe/Paris', fr: 'Europe/Paris', germany: 'Europe/Berlin', de: 'Europe/Berlin', netherlands: 'Europe/Amsterdam', nl: 'Europe/Amsterdam',
  belgium: 'Europe/Brussels', be: 'Europe/Brussels', italy: 'Europe/Rome', it: 'Europe/Rome', switzerland: 'Europe/Zurich', ch: 'Europe/Zurich', austria: 'Europe/Vienna', at: 'Europe/Vienna',
  sweden: 'Europe/Stockholm', se: 'Europe/Stockholm', norway: 'Europe/Oslo', no: 'Europe/Oslo', denmark: 'Europe/Copenhagen', dk: 'Europe/Copenhagen', finland: 'Europe/Helsinki', fi: 'Europe/Helsinki',
  poland: 'Europe/Warsaw', pl: 'Europe/Warsaw', 'czech republic': 'Europe/Prague', czechia: 'Europe/Prague', cz: 'Europe/Prague', iceland: 'Atlantic/Reykjavik', is: 'Atlantic/Reykjavik',
  japan: 'Asia/Tokyo', jp: 'Asia/Tokyo', 'south korea': 'Asia/Seoul', kr: 'Asia/Seoul',
}
export function isNamedZone(z: string): boolean {
  if (!z.includes('/') || z.startsWith('Etc/')) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true } catch { return false }
}
const placeKey = (s: string) => venueKey(s)
function knownZone(known: Record<string, string>, venue: string, city: string): string | null {
  if (!venue || !city) return null
  for (const [k, z] of Object.entries(known)) { const [v, c] = k.split('|'); if (placeKey(v) === placeKey(venue) && placeKey(c) === placeKey(city)) return z }
  return null
}

export type Fix = {
  year?: number; days?: number[]; serialOk?: boolean; zone?: string; noZone?: boolean; time?: string
  venue?: string; decision?: 'skip' | 'keep'; exclude?: boolean; instant?: string
}
export type Issue =
  | { k: 'nodate'; raw: string } | { k: 'invalid'; raw: string } | { k: 'order' }
  | { k: 'serial'; raw: string; suggestion: string }
  | { k: 'year'; d: number; mo: number; raw: string } | { k: 'range'; days: number[]; y: number; mo: number; raw: string }
  | { k: 'venue'; raw: string } | { k: 'zone-up' } | { k: 'zone-time'; raw: string } | { k: 'zone-bad'; raw: string }
  | { k: 'times'; options: string[]; raw: string }
  | { k: 'dst-overlap'; options: string[] } | { k: 'dst-gap'; suggestion: string | null }
export type Pair = { key: string; reason: string; rowNo: number | null; alreadyImported: { file: string; at: string } | null }
// Reason codes match import_shows()'s skipped_rows list (supabase/proposals/0028).
export type Reason = 'no_date' | 'skipped_by_you' | 'possible_duplicate_skipped' | 'already_imported' | 'unresolved_date_order' | 'unresolved_year' | 'unresolved_dates'
  | 'unresolved_venue' | 'unresolved_time_zone' | 'unresolved_time' | 'unresolved_duplicate' | 'not_a_date' | 'unconfirmed_date_number'
export const REASON_TEXT: Record<Reason, string> = {
  no_date: 'no date in the sheet', skipped_by_you: 'left out by you', possible_duplicate_skipped: 'possible duplicate, skipped by you', already_imported: 'already imported earlier',
  unresolved_date_order: 'date order not chosen', unresolved_year: 'year not chosen', unresolved_dates: 'dates not chosen', unresolved_venue: 'no venue',
  unresolved_time_zone: 'time zone not chosen', unresolved_time: 'start time not settled', unresolved_duplicate: 'possible duplicate not decided', not_a_date: 'not a real date',
  unconfirmed_date_number: 'date number not confirmed',
}
export type Row = {
  n: number; cells: { label: string; value: string }[]
  dates: string[]; time: string | null; rawTime: string; zone: string | null; zoneFrom: 'sheet' | 'venue' | 'country' | 'you' | null
  scheduledAt: string | null; upcoming: boolean | null; timeAsWritten: boolean
  venue: string; city: string; region: string; country: string; name: string | null
  issues: Issue[]; notes: string[]; pair: Pair | null; repeatedBy: number | null
  status: 'decide' | 'ready' | 'out' | 'waiting'; outReason: Reason | null
}
export type Context = {
  records: IdentityRecord[]
  // Existing records as shown in a duplicate question.
  summaries: Record<string, { date: string; venue: string; city: string | null; line: string }>
  // "venue|city" (normalised) → zone, for venues in the artist's records with coordinates.
  knownVenues: Record<string, string>
  // Records that came from an earlier import: key → file, when, and the booked time.
  imported: Record<string, { file: string; at: string; time: string | null }>
}

function addMinutes(t: string, mins: number) { const [h, m] = t.split(':').map(Number); const x = (h * 60 + m + mins + 1440) % 1440; return `${pad(Math.floor(x / 60))}:${pad(x % 60)}` }

export function analyse(file: SheetFile, map: Field[], order: Order | null, fixes: Record<number, Fix>, ctx: Context, now = new Date()): Row[] {
  const col = (f: Field) => map.indexOf(f)
  const cell = (v: Cell[], f: Field): Cell | undefined => { const i = col(f); return i < 0 ? undefined : v[i] }
  const text = (v: Cell[], f: Field) => (cell(v, f)?.text || '').trim()
  const rows: Row[] = file.rows.map(([n, v]) => {
    const fix = fixes[n] || {}
    const issues: Issue[] = [], notes: string[] = []
    const dc = cell(v, 'date'), rawDate = (dc?.text || '').trim(), rawVenue = text(v, 'venue'), tc = cell(v, 'time'), rawTime = (tc?.text || '').trim()
    const venue = fix.venue || (/^(tba|tbc|tbd|-|—)$/i.test(rawVenue) ? '' : rawVenue)
    const city = text(v, 'city'), region = text(v, 'region'), country = text(v, 'country'), name = text(v, 'name') || null
    let dates: string[] = []
    let m: RegExpMatchArray | null
    const yearOf = (s: string) => { const y = +s; return s.length <= 2 ? 2000 + y : y }
    if (dc?.date) dates = [dc.date]
    else if (dc?.number !== undefined && serialToDate(dc.number)) {
      const s = serialToDate(dc.number)!
      if (fix.serialOk) dates = [s]; else issues.push({ k: 'serial', raw: rawDate, suggestion: s })
    }
    else if (!rawDate || /^(tba|tbc|tbd|\?|-|—)$/i.test(rawDate)) issues.push({ k: 'nodate', raw: rawDate })
    else if ((m = rawDate.match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/)) || (m = rawDate.match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{4})$/))) {
      const mo = /^\d+$/.test(m[3]) ? +m[3] : MON.indexOf(m[3].slice(0, 3).toLowerCase()) + 1, y = yearOf(m[4])
      const days: number[] = []; for (let d = +m[1]; d <= +m[2] && d <= 31; d++) if (real(y, mo, d)) days.push(d)
      if (!mo || !days.length) issues.push({ k: 'invalid', raw: rawDate })
      else if (fix.days?.length) dates = fix.days.slice().sort((a, b) => a - b).map(d => iso(y, mo, d))
      else issues.push({ k: 'range', days, y, mo, raw: rawDate })
    } else if (NUMERIC.test(rawDate)) {
      if (/^\d{4}/.test(rawDate)) { const d = readNumeric(rawDate, 'YMD'); if (d) dates = [d]; else issues.push({ k: 'invalid', raw: rawDate }) }
      else if (!order) issues.push({ k: 'order' })
      else { const d = readNumeric(rawDate, order); if (d) dates = [d]; else issues.push({ k: 'invalid', raw: rawDate }) }
      if (/[/.-]\d{2}$/.test(rawDate) && dates.length) notes.push(`Two-digit year read as ${dates[0].slice(0, 4)}`)
    } else {
      // Month names: "12 Apr 2025", "Sat 12 April", "April 12th, 2025".
      const t = rawDate.replace(/(\d)(st|nd|rd|th)\b/gi, '$1').replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i, '')
      const a = t.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s*(\d{4})?$/), b = t.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s*(\d{4})?$/)
      const parts = a ? { d: +a[1], mon: a[2], y: a[3] } : b ? { d: +b[2], mon: b[1], y: b[3] } : null
      const mo = parts ? MON.indexOf(parts.mon.slice(0, 3).toLowerCase()) + 1 : 0
      if (!parts || !mo) issues.push({ k: 'invalid', raw: rawDate })
      else if (parts.y) { if (real(+parts.y, mo, parts.d)) dates = [iso(+parts.y, mo, parts.d)]; else issues.push({ k: 'invalid', raw: rawDate }) }
      else if (fix.year && real(fix.year, mo, parts.d)) dates = [iso(fix.year, mo, parts.d)]
      else issues.push({ k: 'year', d: parts.d, mo, raw: rawDate })
    }
    if (!venue) issues.push({ k: 'venue', raw: rawVenue })

    let zone: string | null = null, zoneFrom: Row['zoneFrom'] = null
    const sheetZone = text(v, 'zone')
    const known = knownZone(ctx.knownVenues, venue, city)
    if (fix.zone) { zone = fix.zone; zoneFrom = 'you' }
    else if (sheetZone && isNamedZone(sheetZone)) { zone = sheetZone; zoneFrom = 'sheet' }
    else if (known) { zone = known; zoneFrom = 'venue' }
    else if (!sheetZone && ONE_ZONE[country.toLowerCase().trim()]) { zone = ONE_ZONE[country.toLowerCase().trim()]; zoneFrom = 'country' }

    const times = readTimes(tc)
    let time: string | null = fix.time || (times.length === 1 ? times[0] : null)
    if (!fix.time && times.length > 1) issues.push({ k: 'times', options: times, raw: rawTime })
    if (!fix.time && rawTime && !times.length && !/^(tba|tbc|tbd|-|—)$/i.test(rawTime)) notes.push(`“${rawTime}” isn’t a time Setlistr can read, so this row has no start time`)
    if (fix.time && times.length === 1 && fix.time !== times[0]) notes.push(`Start time changed from “${rawTime}” by you`)
    let upcoming: boolean | null = null, scheduledAt: string | null = null
    const date = dates[0] || null
    if (date) {
      if (zone) upcoming = date >= zonedToday(now, zone)
      else if (date < zonedToday(now, 'Etc/GMT+12')) upcoming = false   // ended everywhere
      if (sheetZone && !zone && !fix.zone) issues.push({ k: 'zone-bad', raw: sheetZone })
      else if (upcoming === null || (upcoming && !zone)) issues.push({ k: 'zone-up' })
      else if (!upcoming && time && !zone && !fix.noZone) issues.push({ k: 'zone-time', raw: rawTime })
      if (time && zone) {
        const c = zonedLocalTimeToUtc(`${date}T${time}`, zone)
        if (c.ok) scheduledAt = c.utc.toISOString()
        else if (c.reason === 'ambiguous') { if (fix.instant && [c.earlier!.toISOString(), c.later!.toISOString()].includes(fix.instant)) scheduledAt = fix.instant; else issues.push({ k: 'dst-overlap', options: [c.earlier!.toISOString(), c.later!.toISOString()] }) }
        else if (c.reason === 'nonexistent') {
          const after = [30, 60].map(x => addMinutes(time!, x)).find(t => zonedLocalTimeToUtc(`${date}T${t}`, zone!).ok) || null
          issues.push({ k: 'dst-gap', suggestion: after ? addMinutes(time, 60) : null })
        }
      }
    }
    const cells = file.headers.map((h, i) => ({ label: h, value: v[i]?.text || '' })).filter((c, i) => map[i] !== 'skip' && c.value)
    return { n, cells, dates, time, rawTime, zone, zoneFrom, scheduledAt, upcoming, timeAsWritten: !!time && !zone && !!fix.noZone, venue, city, region, country, name, issues, notes, pair: null, repeatedBy: null, status: 'ready', outReason: null }
  })

  // Possible duplicates: the released matcher, unchanged, once per date.
  const recs: IdentityRecord[] = [...ctx.records]
  for (const r of rows) if (r.dates.length && r.venue && !fixes[r.n]?.exclude) for (const d of r.dates) recs.push({ key: `r:${String(r.n).padStart(6, '0')}:${d}`, venueId: null, venueName: r.venue, city: r.city || null, country: r.country || null, localDate: d, instant: d === r.dates[0] && r.scheduledAt ? Date.parse(r.scheduledAt) : null, dateUncertain: !!r.time && !r.zone })
  const byN = new Map(rows.map(r => [r.n, r]))
  const rn = (k: string) => k.startsWith('r:') ? +k.split(':')[1] : null
  for (const c of findCandidates(recs)) {
    const a = rn(c.a), b = rn(c.b)
    if (a === null && b === null) continue          // two existing records: not this import's question
    const reason = `${VENUE_REASON[c.venue]}, ${TIME_REASON[c.time]}`
    if (a !== null && b !== null) {
      if (a === b) continue
      const later = byN.get(Math.max(a, b))!, earlier = byN.get(Math.min(a, b))!
      if (!later.pair) { later.pair = { key: `r:${earlier.n}`, reason, rowNo: earlier.n, alreadyImported: null }; earlier.repeatedBy = later.n }
    } else {
      const rowKey = a !== null ? c.a : c.b, row = byN.get((a ?? b)!)!, other = a !== null ? c.b : c.a
      const prev = ctx.imported[other]
      const date = rowKey.split(':')[2]
      // The same booking from an earlier import: same date, venue and city,
      // and the same start time (or neither has one).
      const same = !!prev && ctx.summaries[other]?.date === date && venueKey(ctx.summaries[other].venue) === venueKey(row.venue) && venueKey(ctx.summaries[other].city || '') === venueKey(row.city) && (prev.time || null) === (row.time || null)
      if (!row.pair || (same && !row.pair.alreadyImported)) row.pair = { key: other, reason, rowNo: null, alreadyImported: same ? { file: prev!.file, at: prev!.at } : null }
    }
  }

  for (const r of rows) {
    const fix = fixes[r.n] || {}
    const first = r.issues[0]
    if (first?.k === 'nodate') { r.status = 'out'; r.outReason = 'no_date' }
    else if (fix.exclude) { r.status = 'out'; r.outReason = 'skipped_by_you' }
    else if (r.pair?.alreadyImported && fix.decision !== 'keep') { r.status = 'out'; r.outReason = 'already_imported' }
    else if (r.pair && fix.decision === 'skip') { r.status = 'out'; r.outReason = 'possible_duplicate_skipped' }
    else if (first?.k === 'order') { r.status = 'waiting'; r.outReason = 'unresolved_date_order' }
    else if (first) {
      r.status = 'decide'
      r.outReason = ({ invalid: 'not_a_date', serial: 'unconfirmed_date_number', year: 'unresolved_year', range: 'unresolved_dates', venue: 'unresolved_venue', 'zone-up': 'unresolved_time_zone', 'zone-time': 'unresolved_time_zone', 'zone-bad': 'unresolved_time_zone', times: 'unresolved_time', 'dst-overlap': 'unresolved_time', 'dst-gap': 'unresolved_time' } as Record<string, Reason>)[first.k]
    } else if (r.pair && !fix.decision) { r.status = 'decide'; r.outReason = 'unresolved_duplicate' }
    else r.status = 'ready'
  }
  return rows
}

// The one question a row is waiting on.
export function question(r: Row): string {
  const i = r.issues[0]
  if (!i) return 'Possible duplicate'
  return {
    nodate: 'No date', invalid: 'Not a real date', order: 'Waiting for the date order', serial: 'Confirm the date', year: 'Which year?', range: 'Which dates?', venue: 'Venue needed',
    'zone-up': 'Time zone needed', 'zone-time': 'Time zone needed', 'zone-bad': 'Time zone needed', times: 'Which start time?', 'dst-overlap': `Which ${r.time ? timeLabel(r.time) : 'time'}?`, 'dst-gap': 'Time doesn’t exist',
  }[i.k]
}

// Rows that still need a time zone, with whether they share this row's
// place. Only rows in the same city and country are suggested; everything
// else stays unticked for the person to decide.
export function zoneCandidates(rows: Row[], r: Row): { row: Row; samePlace: boolean }[] {
  return rows.filter(o => o.n !== r.n && o.issues.some(i => i.k === 'zone-up' || i.k === 'zone-time' || i.k === 'zone-bad'))
    .map(o => ({ row: o, samePlace: !!o.city && !!r.city && placeKey(o.city) === placeKey(r.city) && placeKey(o.country) === placeKey(r.country) && placeKey(o.region) === placeKey(r.region) }))
}

// What importing the ready rows would create. One row can become several
// shows (a range with several dates chosen), so rows and shows are counted apart.
export function breakdown(rows: Row[]) {
  const ready = rows.filter(r => r.status === 'ready')
  const shows = ready.flatMap(r => r.dates.map(d => ({ r, d })))
  const future = shows.filter(s => s.r.upcoming), past = shows.filter(s => !s.r.upcoming)
  const out = rows.filter(r => r.status === 'out'), open = rows.filter(r => r.status === 'decide' || r.status === 'waiting')
  return {
    ready, shows, future: future.length, futureDateOnly: future.filter(s => !s.r.time).length, past: past.length,
    out, open, leftOut: [...out, ...open].sort((a, b) => a.n - b.n),
    multi: ready.filter(r => r.dates.length > 1),
    skippedRows: [...out, ...open].map(r => ({ row: r.n, reason: r.outReason! })).sort((a, b) => a.row - b.row),
  }
}
