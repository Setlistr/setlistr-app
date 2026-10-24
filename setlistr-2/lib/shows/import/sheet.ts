// Spreadsheet import (docs/spreadsheet-import-plan.md): a sheet's raw cells
// → the rows and columns the review works on. Pure; no I/O. Reading the file
// itself happens in the browser (lib/shows/import/read.ts).
//
// - The header row is the first of the top ten rows with two or more
//   recognised headings; rows above it (titles) are left out.
// - Columns are guessed from their headings, and a date column from its
//   values when no heading says so. The person can change any guess.
// - Cells keep what the sheet holds: text as written, Excel date cells as
//   their calendar date, time cells as their time, and bare numbers as
//   numbers (a number in the date column is only ever a suggested date).

export type Field = 'date' | 'venue' | 'city' | 'region' | 'country' | 'time' | 'zone' | 'name' | 'skip'
export const FIELD_LABEL: Record<Field, string> = { date: 'Date', venue: 'Venue', city: 'City', region: 'State or region', country: 'Country', time: 'Start time', zone: 'Time zone', name: 'Show name', skip: "Don't import" }

// One cell as read from the file.
export type RawCell = string | number | boolean | { date: string } | { time: string } | null
export type RawSheet = { name: string; rows: RawCell[][] }
// One cell after reading: its text as shown, and what it is when typed.
export type Cell = { text: string; date?: string; time?: string; number?: number }
export type SheetFile = {
  name: string; sha256: string; sheet: string; sheets: string[]
  headerRow: number | null; headers: string[]; guess: Field[]
  rows: [number, Cell[]][]           // [row number in the sheet (1-based), cells]
}

export const MAX_ROWS = 500

const SYNONYMS: [Field, RegExp][] = [
  ['zone', /^(time ?zone|tz|zone)$/],
  ['time', /^(time|set ?time|start|start ?time|show ?time|stage ?time|on ?stage|set)$/],
  ['date', /^(date|dates|show ?date|event ?date|gig ?date|when|day|datum|fecha)$/],
  ['venue', /^(venue|venue ?name|where|location|club|room|hall|place|salle|lieu)$/],
  ['city', /^(city|town|ville|ciudad|stadt|market)$/],
  ['region', /^(state|province|region|prov|st|state\/province)$/],
  ['country', /^(country|nation|pays|land|pais)$/],
  ['name', /^(event|event ?name|show|show ?name|festival|tour|title|name|bill)$/],
]
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9/ ]/g, ' ').replace(/\s+/g, ' ').trim()
export function headingField(h: string): Field | null {
  const k = norm(h)
  for (const [f, re] of SYNONYMS) if (re.test(k)) return f
  return null
}

export function toCell(c: RawCell): Cell {
  if (c === null || c === undefined || c === '') return { text: '' }
  if (typeof c === 'string') return { text: c.trim() }
  if (typeof c === 'number') return { text: String(c), number: c }
  if (typeof c === 'boolean') return { text: c ? 'TRUE' : 'FALSE' }
  if ('date' in c) return { text: c.date, date: c.date }
  return { text: c.time, time: c.time }
}

// A JS Date from an Excel cell → its calendar date or time of day, read from
// UTC parts (the file stores no zone; the device's zone must not shift it).
// Time-only cells sit on Excel's day zero, 1899-12-30.
export function fromExcelDate(d: Date): { date: string } | { time: string } {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  if (y === 1899 && m === 12 && (day === 30 || day === 31)) return { time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` }
  return { date: `${y}-${pad(m)}-${pad(day)}` }
}

// Excel's day number (1900 system) → calendar date. Shown only as a
// suggestion for a bare number in the date column.
export function serialToDate(n: number): string | null {
  if (!Number.isFinite(n) || n < 20000 || n > 80000 || Math.floor(n) !== n) return null
  return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10)
}

const looksLikeDate = (c: Cell) => !!c.date || /^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}$/.test(c.text) || /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(c.text) && /\d/.test(c.text)

export function buildSheet(name: string, sha256: string, raw: RawSheet, sheets: string[]): SheetFile {
  const all = raw.rows.map(r => r.map(toCell))
  let headerRow: number | null = null
  for (let i = 0; i < Math.min(10, all.length); i++) {
    if (all[i].filter(c => c.text && headingField(c.text)).length >= 2) { headerRow = i; break }
  }
  const width = Math.max(0, ...all.map(r => r.length))
  const headers = Array.from({ length: width }, (_, i) => headerRow !== null ? (all[headerRow][i]?.text || `Column ${i + 1}`) : `Column ${i + 1}`)
  const body = all.map((r, i) => [i + 1, Array.from({ length: width }, (_, j) => r[j] || { text: '' })] as [number, Cell[]])
    .slice(headerRow === null ? 0 : headerRow + 1)
    .filter(([, r]) => r.some(c => c.text))
  const guess: Field[] = headers.map(h => headingField(h) || 'skip')
  // Each field once: a later column with the same guess is left out.
  const seen = new Set<Field>()
  guess.forEach((f, i) => { if (f !== 'skip') { if (seen.has(f)) guess[i] = 'skip'; seen.add(f) } })
  if (!guess.includes('date')) {
    const col = headers.findIndex((_, i) => guess[i] === 'skip' && body.length > 0 && body.filter(([, r]) => looksLikeDate(r[i])).length / body.length >= 0.6)
    if (col >= 0) guess[col] = 'date'
  }
  return { name, sha256, sheet: raw.name, sheets, headerRow: headerRow === null ? null : headerRow + 1, headers, guess, rows: body }
}
