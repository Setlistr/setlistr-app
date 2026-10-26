// Venue-local date/time + IANA timezone -> stored UTC instant, for the
// shared artist/manager scheduling slice. The actual civil-time-to-UTC
// conversion is delegated to date-fns-tz (actively maintained, correctly
// handles IANA transition intervals) rather than hand-rolled — a
// single-pass "guess as UTC, measure the offset, correct once" approach
// does not converge correctly when the guess and the corrected result
// fall on opposite sides of a DST boundary (confirmed empirically: it
// misclassifies 2026-03-08T03:30 America/Chicago, a perfectly valid time
// 30 minutes after that date's spring-forward gap, as nonexistent).
//
// date-fns-tz's fromZonedTime resolves to a single valid UTC instant
// either way; it does not itself tell the caller whether the input civil
// time was ambiguous (DST "fall back" — occurs twice) or nonexistent
// (DST "spring forward" — occurs zero times). Detecting that is this
// module's own, separately-tested job, via round-tripping the resolved
// instant back through the same zone.

import { toZonedTime } from 'date-fns-tz'

export type ZonedConversionResult =
  | { ok: true; utc: Date }
  | { ok: false; reason: 'invalid_timezone' | 'invalid_format' | 'nonexistent' | 'ambiguous'; earlier?: Date; later?: Date }

function isValidIanaZone(zone: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true }
  catch { return false }
}

function formatInZone(instant: Date, ianaZone: string): string {
  const z = toZonedTime(instant, ianaZone)
  return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, '0')}-${String(z.getDate()).padStart(2, '0')}T${String(z.getHours()).padStart(2, '0')}:${String(z.getMinutes()).padStart(2, '0')}`
}

// The zone's actual UTC offset (ms, positive = ahead of UTC) at a given
// instant, read directly from Intl's own resolved offset rather than
// assumed — correct for any delta, including Lord Howe Island's unusual
// 30-minute DST shift, not just the common 60-minute case.
function offsetMsAt(instant: Date, ianaZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: ianaZone, timeZoneName: 'shortOffset' }).formatToParts(instant)
  const label = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT+0'
  const m = label.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
  if (!m) return 0
  const sign = m[1] === '-' ? -1 : 1
  const hours = Number(m[2]); const mins = Number(m[3] || 0)
  return sign * (hours * 60 + mins) * 60_000
}

// localDateTime: "YYYY-MM-DDTHH:mm" (no offset) — the venue's own wall clock.
//
// Algorithm (delta-independent — derives real offsets from Intl rather
// than probing at a fixed, assumed DST distance, which is why the
// original single-probe version missed Lord Howe's 30-minute shift and
// picked the wrong side of Chicago's 60-minute one): read the zone's
// actual UTC offset a day before and a day after the requested civil
// time (both guaranteed clear of any transition). If they match, there's
// no nearby DST boundary at all. If they differ, build the two candidate
// instants implied by each offset and check which one(s) actually
// reformat back to the exact requested civil time — zero matches means
// the time never existed (spring-forward gap); two matches means it
// occurred twice (fall-back overlap); exactly one match is the correct,
// unambiguous answer.
export function zonedLocalTimeToUtc(localDateTime: string, ianaZone: string): ZonedConversionResult {
  if (!isValidIanaZone(ianaZone)) return { ok: false, reason: 'invalid_timezone' }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localDateTime)) return { ok: false, reason: 'invalid_format' }

  const [datePart, timePart] = localDateTime.split('T')
  const [y, mo, d] = datePart.split('-').map(Number)
  const [h, mi] = timePart.split(':').map(Number)
  const localAsUtcMs = Date.UTC(y, mo - 1, d, h, mi)

  const dayBefore = new Date(localAsUtcMs - 24 * 3600_000)
  const dayAfter = new Date(localAsUtcMs + 24 * 3600_000)
  const offsetBefore = offsetMsAt(dayBefore, ianaZone)
  const offsetAfter = offsetMsAt(dayAfter, ianaZone)

  const candidates = new Set([localAsUtcMs - offsetBefore, localAsUtcMs - offsetAfter])
  const matches = Array.from(candidates)
    .map(ms => new Date(ms))
    .filter(instant => formatInZone(instant, ianaZone) === localDateTime)
    .sort((a, b) => a.getTime() - b.getTime())

  if (matches.length === 0) return { ok: false, reason: 'nonexistent' }
  if (matches.length === 2) return { ok: false, reason: 'ambiguous', earlier: matches[0], later: matches[1] }
  return { ok: true, utc: matches[0] }
}

// Redisplay: a stored UTC instant -> that civil time's parts in the
// show's own timezone, DST-correct automatically since it's re-derived
// from live IANA rules at read time, never a cached fixed offset.
export function utcToZonedParts(utc: Date, ianaZone: string): { dateStr: string; timeStr: string; offsetLabel: string } {
  const zoned = toZonedTime(utc, ianaZone)
  const dateStr = `${zoned.getFullYear()}-${String(zoned.getMonth() + 1).padStart(2, '0')}-${String(zoned.getDate()).padStart(2, '0')}`
  const timeStr = `${String(zoned.getHours()).padStart(2, '0')}:${String(zoned.getMinutes()).padStart(2, '0')}`
  const offsetLabel = new Intl.DateTimeFormat('en-US', { timeZone: ianaZone, timeZoneName: 'shortOffset' })
    .formatToParts(utc).find(p => p.type === 'timeZoneName')?.value || ''
  return { dateStr, timeStr, offsetLabel }
}

// ── Which scheduled show is "next" ─────────────────────────────────────
// /api/shows/schedule returns every show still marked 'scheduled', oldest
// first — including ones whose date has passed but were never started or
// cancelled. "Next" must skip those. A show counts as upcoming through the
// whole of its own venue-local day (an 8 PM show is still "Today" at
// 9 PM), judged in the show's timezone, not the viewer's device.

function safeZone(zone: string): string {
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return zone } catch { return 'UTC' }
}

// Today's date (YYYY-MM-DD) as the clock reads in `zone`.
export function zonedToday(now: Date, zone: string): string {
  return utcToZonedParts(now, safeZone(zone)).dateStr
}

export function isUpcomingInZone(scheduledAtIso: string, zone: string, now: Date = new Date()): boolean {
  const z = safeZone(zone)
  return utcToZonedParts(new Date(scheduledAtIso), z).dateStr >= zonedToday(now, z)
}

// A scheduled show is either timed (scheduled_at, an instant) or a
// date-only booking from a spreadsheet import (local_date, no instant —
// midnight is never assumed). Its own calendar date either way.
export type SchedulableShow = { scheduled_at: string | null; timezone: string; local_date?: string | null }
export function showLocalDate(s: SchedulableShow): string | null {
  if (s.scheduled_at) return utcToZonedParts(new Date(s.scheduled_at), safeZone(s.timezone)).dateStr
  return s.local_date || null
}
export function isShowUpcoming(s: SchedulableShow, now: Date = new Date()): boolean {
  const d = showLocalDate(s)
  return !!d && d >= zonedToday(now, s.timezone)
}
// By date, then start time; a date-only booking after timed shows that day.
export function compareScheduled(a: SchedulableShow, b: SchedulableShow): number {
  const da = showLocalDate(a) || '', db = showLocalDate(b) || ''
  if (da !== db) return da < db ? -1 : 1
  return (a.scheduled_at ? Date.parse(a.scheduled_at) : Infinity) - (b.scheduled_at ? Date.parse(b.scheduled_at) : Infinity)
}

export function pickNextScheduled<T extends SchedulableShow>(shows: T[], now: Date = new Date()): { next: T | null; pastCount: number } {
  const upcoming = shows.filter(s => isShowUpcoming(s, now)).sort(compareScheduled)
  return { next: upcoming[0] || null, pastCount: shows.length - upcoming.length }
}

// "Today" / "Tomorrow" / "Yesterday" relative to `todayStr` (both venue-
// local YYYY-MM-DD), otherwise "Wed, Oct 8" — with the year whenever it
// isn't the current one, so an old date never reads as this year's.
export function relativeDayLabel(dateStr: string, todayStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [ty, tm, td] = todayStr.split('-').map(Number)
  const diff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(y !== ty ? { year: 'numeric' } : {}) })
}
