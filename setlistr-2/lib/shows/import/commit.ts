// Spreadsheet import: the request the page sends, and the server's own
// checks before import_shows() (supabase/proposals/0028). Pure; no I/O.
import { zonedLocalTimeToUtc } from '../../scheduleTime'
import { findCandidates, venueKey, type IdentityRecord } from '../identity'
import { isNamedZone, type Context, type Reason } from './review'

export type ImportRow = {
  source_row: number; local_date: string; local_time: string | null; timezone: string | null
  // For a time that happens twice (clocks go back): the instant chosen.
  instant: string | null
  expect: 'scheduled' | 'listed'
  venue_id: string | null; venue_name: string; venue_city: string | null; venue_country: string | null; name: string | null
}
export type ImportRequest = {
  artist_id: string
  batch: { id: string; file_name: string; sheet_name: string | null; file_sha256: string; date_order: 'DMY' | 'MDY' | 'YMD' | 'ISO' | 'TEXT'; row_count: number; skipped_rows: { row: number; reason: Reason }[] }
  rows: ImportRow[]
  fingerprint: string
  // Duplicate questions the person answered, as "<row>:<date>|<other record key>".
  decided: string[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export type Prepared = { ok: true; rows: (ImportRow & { scheduled_at: string | null })[] } | { ok: false; status: number; error: string; row?: number }

// Shape checks, and each row's instant computed here rather than trusted:
// a skipped time is refused; a repeated time must be one of its two instants.
export function prepare(body: unknown): Prepared {
  const b = body as ImportRequest
  if (!b || typeof b !== 'object' || !UUID.test(b.artist_id || '') || !b.batch || !UUID.test(b.batch.id || '') || !Array.isArray(b.rows) || typeof b.fingerprint !== 'string' || !Array.isArray(b.decided)) return { ok: false, status: 400, error: 'Bad request' }
  if (!b.rows.length || b.rows.length > 1000) return { ok: false, status: 400, error: 'Nothing to import' }
  if (!/^[0-9a-f]{64}$/.test(b.batch.file_sha256 || '') || !b.batch.file_name || b.batch.file_name.length > 200) return { ok: false, status: 400, error: 'Bad file details' }
  const out: (ImportRow & { scheduled_at: string | null })[] = []
  for (const r of b.rows) {
    const n = Number(r?.source_row)
    if (!Number.isInteger(n) || n < 1 || !DATE.test(r.local_date || '') || (r.local_time !== null && !TIME.test(r.local_time || '')) || !(r.venue_name || '').trim() || (r.expect !== 'scheduled' && r.expect !== 'listed')) return { ok: false, status: 422, error: 'A row is incomplete', row: n || undefined }
    if (r.timezone !== null && !isNamedZone(r.timezone || '')) return { ok: false, status: 422, error: 'A time zone isn’t valid', row: n }
    if (r.venue_id !== null && !UUID.test(r.venue_id || '')) return { ok: false, status: 422, error: 'A venue isn’t valid', row: n }
    let scheduled_at: string | null = null
    if (r.local_time && r.timezone) {
      const c = zonedLocalTimeToUtc(`${r.local_date}T${r.local_time}`, r.timezone)
      if (c.ok) scheduled_at = c.utc.toISOString()
      else if (c.reason === 'ambiguous') {
        const opts = [c.earlier!.toISOString(), c.later!.toISOString()]
        if (!r.instant || !opts.includes(new Date(r.instant).toISOString())) return { ok: false, status: 422, error: 'This time happens twice that day; choose which one', row: n }
        scheduled_at = new Date(r.instant).toISOString()
      } else return { ok: false, status: 422, error: 'This time doesn’t exist that day', row: n }
    }
    out.push({ ...r, source_row: n, local_time: r.local_time || null, scheduled_at })
  }
  return { ok: true, rows: out }
}

// Duplicate candidates against the CURRENT records that the person hasn't
// answered: something changed since the review. Returns the rows to re-check.
export function unansweredPairs(rows: (ImportRow & { scheduled_at: string | null })[], ctx: Context, decided: string[]): number[] {
  const done = new Set(decided)
  const recs: IdentityRecord[] = [...ctx.records, ...rows.map(r => ({ key: `r:${r.source_row}:${r.local_date}`, venueId: null, venueName: r.venue_name, city: r.venue_city, country: r.venue_country, localDate: r.local_date, instant: r.scheduled_at ? Date.parse(r.scheduled_at) : null, dateUncertain: !!r.local_time && !r.timezone }))]
  const bad = new Set<number>()
  for (const c of findCandidates(recs)) {
    const ra = c.a.startsWith('r:'), rb = c.b.startsWith('r:')
    if (ra === rb) continue                                // within the sheet: answered in review
    const rowKey = ra ? c.a : c.b, other = ra ? c.b : c.a
    if (!done.has(`${rowKey.slice(2)}|${other}`)) bad.add(Number(rowKey.split(':')[1]))
  }
  return Array.from(bad).sort((a, b) => a - b)
}

export { venueKey }
