// The Schedule timeline's history (docs/schedule-timeline-plan.md). Pure;
// app/api/shows/timeline reads the rows and this turns them into entries.
//
// - Grouping: only a stored performances.show_id joins records. A show with
//   several linked captures keeps every one of them.
// - Dates are the record's own: a scheduled show's local date in its zone; a
//   capture's stored date as stored when date-only; otherwise its instant in
//   the show's zone, or the zone of the venue's stored coordinates. With no
//   zone at all the stored value is kept and marked "time zone not recorded".
//   The viewer's zone is never used, so order and matching are the same for
//   everyone.
// - Labels: one state, one source line. A capture method comes only from
//   Proof's evidence rules; "Imported" is where a record came from, not a
//   state.

import tzLookup from 'tz-lookup'
import { utcToZonedParts, isUpcomingInZone } from '../scheduleTime'
import { isRealTimeZone } from '../show-date'
import { findCandidates, type Candidate, type IdentityRecord } from './identity'
import type { Method } from '../proof/summary'

export type ShowRow = {
  id: string; status: string; scheduled_at: string | null; timezone: string | null; venue_id: string | null
  name: string | null; show_type: string | null; created_by: string; scheduled_by: string | null; scheduled_by_name: string | null
  started_at: string | null; updated_at: string; created_at?: string | null
  venues: { name: string | null; city: string | null; country: string | null; latitude: number | null; longitude: number | null } | null
}
export type PerfRow = {
  id: string; show_id: string | null; status: string | null; submission_status: string | null; data_source: string | null
  venue_id: string | null; venue_name: string | null; city: string | null; country: string | null
  performance_date: string | null; started_at: string | null; created_at: string | null
  venue_latitude: number | null; venue_longitude: number | null
}

export type EntryKind = 'show' | 'capture' | 'import' | 'no-capture' | 'cancelled'
export type Entry = {
  key: string
  kind: EntryKind
  show: ShowRow | null
  perfs: PerfRow[]
  localDate: string | null
  instant: number | null
  zone: string | null
  zoneFrom: 'show' | 'venue' | null
  dateUncertain: boolean
  venueId: string | null
  venue: string
  city: string | null
  country: string | null
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const MIDNIGHT_UTC = /^\d{4}-\d{2}-\d{2}[T ]00:00:00(\.0+)?(Z|\+00(:?00)?)?$/

export const LIVE_WINDOW_MIN = 360  // the Dashboard's rejoin window

// The zone a record's times are read in: the show's own, else the zone at the
// venue's stored coordinates. Never the viewer's.
export function recordZone(show: ShowRow | null, perf: PerfRow | null): { zone: string | null; from: 'show' | 'venue' | null } {
  if (show && isRealTimeZone(show.timezone)) return { zone: show.timezone!, from: 'show' }
  const lat = perf?.venue_latitude ?? show?.venues?.latitude ?? null, lng = perf?.venue_longitude ?? show?.venues?.longitude ?? null
  if (typeof lat === 'number' && typeof lng === 'number' && !(lat === 0 && lng === 0)) {
    try { return { zone: tzLookup(lat, lng), from: 'venue' } } catch { /* out of range */ }
  }
  return { zone: null, from: null }
}

// A real start time: started_at, unless it is only a date stored at midnight UTC.
export function captureInstant(p: PerfRow): number | null {
  if (p.data_source === 'setlistfm_imported' || !p.started_at || MIDNIGHT_UTC.test(p.started_at)) return null
  const t = Date.parse(p.started_at)
  return Number.isFinite(t) ? t : null
}

// A stored value with a real time but no zone to read it in.
export function dateIsUncertain(p: PerfRow | undefined, zone: string | null): boolean {
  if (!p || zone) return false
  const raw = p.performance_date || p.started_at || p.created_at
  return !!raw && !DATE_ONLY.test(raw) && !MIDNIGHT_UTC.test(raw)
}

export function captureDate(p: PerfRow, zone: string | null): string | null {
  const raw = p.performance_date || p.started_at || p.created_at
  if (!raw) return null
  if (DATE_ONLY.test(raw) || MIDNIGHT_UTC.test(raw)) return raw.slice(0, 10)
  const t = new Date(raw)
  if (isNaN(t.getTime())) return null
  return zone ? utcToZonedParts(t, zone).dateStr : t.toISOString().slice(0, 10)
}

export function buildEntries(shows: ShowRow[], perfsIn: PerfRow[], now = new Date()): Entry[] {
  // Abandoned upload drafts aren't records (as on the Dashboard).
  const perfs = perfsIn.filter(p => p.status !== 'draft')
  const byShow = new Map<string, PerfRow[]>()
  const showIds = new Set(shows.map(s => s.id))
  for (const p of perfs) if (p.show_id && showIds.has(p.show_id)) byShow.set(p.show_id, [...(byShow.get(p.show_id) || []), p])
  const out: Entry[] = []
  for (const s of shows) {
    const linked = (byShow.get(s.id) || []).slice().sort((a, b) => (captureInstant(a) ?? 0) - (captureInstant(b) ?? 0) || a.id.localeCompare(b.id))
    const { zone, from } = recordZone(s, linked[0] || null)
    // Still ahead: a scheduled show is in Upcoming; a cancelled one is left
    // out, as Schedule has always done. Both appear here once their date passes.
    if (!linked.length && (s.status === 'scheduled' || s.status === 'cancelled') && s.scheduled_at && isRealTimeZone(s.timezone) && isUpcomingInZone(s.scheduled_at, s.timezone!, now)) continue
    const scheduledInstant = s.scheduled_at ? Date.parse(s.scheduled_at) : null
    const scheduledDate = s.scheduled_at && zone ? utcToZonedParts(new Date(s.scheduled_at), zone).dateStr : s.scheduled_at ? s.scheduled_at.slice(0, 10) : null
    const first = linked[0]
    const instant = first ? (linked.map(captureInstant).find(x => x !== null) ?? null) : scheduledInstant
    const localDate = first ? (captureDate(first, zone) ?? scheduledDate) : scheduledDate
    const v = s.venues
    out.push({
      key: `s:${s.id}`, kind: linked.length ? 'show' : s.status === 'cancelled' ? 'cancelled' : 'no-capture', show: s, perfs: linked,
      localDate, instant, zone, zoneFrom: from, dateUncertain: first ? dateIsUncertain(first, zone) : !zone && !!s.scheduled_at,
      venueId: s.venue_id ?? first?.venue_id ?? null, venue: (v?.name || first?.venue_name || '').trim() || 'Venue not recorded',
      city: v?.city ?? first?.city ?? null, country: v?.country ?? first?.country ?? null,
    })
  }
  for (const p of perfs) {
    if (p.show_id && showIds.has(p.show_id)) continue
    const { zone, from } = recordZone(null, p)
    out.push({
      key: `p:${p.id}`, kind: p.data_source === 'setlistfm_imported' ? 'import' : 'capture', show: null, perfs: [p],
      localDate: captureDate(p, zone), instant: captureInstant(p), zone, zoneFrom: from, dateUncertain: dateIsUncertain(p, zone),
      venueId: p.venue_id, venue: (p.venue_name || '').trim() || 'Venue not recorded', city: p.city, country: p.country,
    })
  }
  return out
}

// Newest first: local date, then start time (records without one after
// timed records that day), then the entry key as the unique tie-breaker.
export type Cursor = [string, number, string]
export function sortKey(e: Entry): Cursor { return [e.localDate || '0000-00-00', e.instant ?? -1, e.key] }
export function compareEntries(a: Entry, b: Entry): number {
  const [ad, ai, ak] = sortKey(a), [bd, bi, bk] = sortKey(b)
  return ad !== bd ? (ad < bd ? 1 : -1) : ai !== bi ? bi - ai : ak < bk ? -1 : ak > bk ? 1 : 0
}
function afterCursor(e: Entry, c: Cursor): boolean {
  const [d, i, k] = sortKey(e)
  return d !== c[0] ? d < c[0] : i !== c[1] ? i < c[1] : k > c[2]
}
export function encodeCursor(e: Entry): string { return Buffer.from(JSON.stringify(sortKey(e))).toString('base64url') }
export function decodeCursor(s: string | null): Cursor | null {
  if (!s) return null
  try {
    const v = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'))
    return Array.isArray(v) && typeof v[0] === 'string' && typeof v[1] === 'number' && typeof v[2] === 'string' ? [v[0], v[1], v[2]] : null
  } catch { return null }
}

export function pageOf(entries: Entry[], cursor: Cursor | null, limit: number): { page: Entry[]; next: string | null } {
  const sorted = entries.slice().sort(compareEntries)
  const rest = cursor ? sorted.filter(e => afterCursor(e, cursor)) : sorted
  const page = rest.slice(0, limit)
  return { page, next: rest.length > limit ? encodeCursor(page[page.length - 1]) : null }
}

export function identityRecords(entries: Entry[]): IdentityRecord[] {
  return entries.map(e => ({ key: e.key, venueId: e.venueId, venueName: e.venue, city: e.city, country: e.country, localDate: e.localDate, instant: e.instant, dateUncertain: e.dateUncertain }))
}
export function candidatesFor(entries: Entry[]): Candidate[] { return findCandidates(identityRecords(entries)) }

// ── Wording ─────────────────────────────────────────────────────────────────
export type Tone = 'ok' | 'review' | 'live' | 'quiet'
// The Dashboard's established labels (app/app/dashboard getDisplayStatus).
export function captureState(p: PerfRow): { label: string; tone: Tone } | null {
  if (p.data_source === 'setlistfm_imported') return null
  if (p.submission_status === 'submitted') return { label: 'Marked submitted', tone: 'ok' }
  if (p.status === 'live' || p.status === 'pending') return { label: 'Live', tone: 'live' }
  if (p.status === 'complete' || p.status === 'completed') return { label: 'Completed', tone: 'quiet' }
  if (p.status === 'exported') return { label: 'Exported', tone: 'quiet' }
  return { label: 'Needs review', tone: 'review' }
}

export function entryState(e: Entry): { label: string; tone: Tone } | null {
  if (e.kind === 'no-capture') return { label: 'No capture linked', tone: 'quiet' }
  if (e.kind === 'cancelled') return { label: 'Cancelled', tone: 'quiet' }
  const states = e.perfs.map(captureState).filter((x): x is { label: string; tone: Tone } => !!x)
  if (!states.length) return null
  if (states.every(s => s.label === states[0].label)) return states[0]
  return { label: `${states.length} captures`, tone: states.some(s => s.tone === 'live') ? 'live' : states.some(s => s.tone === 'review') ? 'review' : 'quiet' }
}

const METHOD_TEXT: Record<Method, string> = {
  live: 'recognised live', recording: 'from a recording', hand: 'entered by hand', unknown: 'method not recorded', none: 'no songs on file',
}
export function methodText(m: Method | undefined): string { return m ? METHOD_TEXT[m] : METHOD_TEXT.unknown }

// Was the show scheduled ahead in Setlistr? From the record itself, not from
// knowing who did it: it is (or was cancelled while) scheduled, the scheduling
// actor is stored, or it was created over a minute before it started (only
// Start from Schedule does that; New show creates and starts in one step).
export function scheduledAhead(s: ShowRow | null): boolean {
  if (!s) return false
  if (s.status === 'scheduled' || s.status === 'cancelled' || s.scheduled_by) return true
  const c = s.created_at ? Date.parse(s.created_at) : NaN, st = s.started_at ? Date.parse(s.started_at) : NaN
  return Number.isFinite(c) && Number.isFinite(st) && st - c > 60_000
}

// One quiet line: where the record came from and, for captures, how its
// setlist was recorded (Proof's evidence; never assumed).
export function sourceLine(e: Entry, methods: Record<string, Method>): string {
  if (e.kind === 'import') return 'Imported from setlist.fm'
  const scheduled = scheduledAhead(e.show)
  if (e.kind === 'no-capture' || e.kind === 'cancelled') return 'Scheduled in Setlistr'
  const done = e.perfs.filter(p => p.status !== 'live' && p.status !== 'pending')
  const ms = Array.from(new Set(done.map(p => methodText(methods[p.id]))))
  const how = e.perfs.length > 1 ? `${e.perfs.length} captures` : ms.length ? ms[0] : 'capture in progress'
  const text = scheduled ? `Scheduled · ${how}` : how
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// "Added by …" only when Setlistr stored who scheduled it and it was a
// teammate (the existing Schedule rule).
export function addedBy(e: Entry): string | null {
  const s = e.show
  return s && s.scheduled_by && s.scheduled_by !== s.created_by && s.scheduled_by_name ? s.scheduled_by_name : null
}

export function timeText(instant: number | null, zone: string | null): string | null {
  if (instant === null || !zone) return null
  const d = new Date(instant)
  const { timeStr } = utcToZonedParts(d, zone)
  const [h, m] = timeStr.split(':').map(Number)
  let abbr = ''
  try { abbr = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' }).formatToParts(d).find(p => p.type === 'timeZoneName')?.value || '' } catch { /* none */ }
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}${abbr ? ' ' + abbr : ''}`
}

export function captureLink(p: PerfRow): string | null {
  if (p.data_source === 'setlistfm_imported') return null
  if (p.status === 'live' || p.status === 'pending') return `/app/live/${p.id}`
  if (p.submission_status === 'submitted') return `/app/submit/${p.id}`
  return `/app/review/${p.id}`
}

export const VENUE_REASON: Record<Candidate['venue'], string> = {
  'same-venue': 'the same venue',
  'same-name-place': 'a venue with the same name in the same city',
  'same-name-no-place': 'a venue with the same name; one record has no city, so the place can’t be compared',
}
export const TIME_REASON: Record<Candidate['time'], string> = {
  'times-close': 'start times within two hours',
  'time-unknown': 'the same date, and at least one has no start time',
  'across-midnight': 'start times within two hours across midnight, each in a known time zone',
}
