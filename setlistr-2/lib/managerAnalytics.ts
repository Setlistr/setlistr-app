// Pure aggregation logic for /app/manager/analytics — no Supabase client,
// no React, matching lib/managerOverview.ts's own convention so this stays
// testable without a live session or network call. Reuses the canonical
// helpers this codebase already agrees on rather than reimplementing them:
// isCapturedShow (lib/performance-status.ts) for "what counts as a real
// recorded show", and normalizeSongKey (lib/reconciliation/normalize.ts,
// the same matching key already used by the live capture page's own
// isSameSong check) for "is this the same song."
//
// Every count here is a DISTINCT PERFORMANCE count — never a raw row
// count — and every aggregate is built from, and stays consistent with,
// the exact row list it also returns for drill-through, so a UI can never
// show a number that doesn't match what tapping into it reveals.

import { isCapturedShow, type PerformanceLifecycleFields } from './performance-status'
import { normalizeSongKey } from './reconciliation/normalize'
import { normalizeSongTitle, normalizeArtistName } from './song-utils'

export interface AnalyticsPerformanceRow extends PerformanceLifecycleFields {
  id: string
  user_id: string
  started_at?: string | null
  performance_date?: string | null
  city?: string | null
}

function dateKey(r: AnalyticsPerformanceRow): string {
  return (r.started_at || r.performance_date || '').slice(0, 10)
}

function dedupeCaptured(rows: AnalyticsPerformanceRow[]): AnalyticsPerformanceRow[] {
  const seen = new Set<string>()
  const out: AnalyticsPerformanceRow[] = []
  for (const r of rows) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    if (isCapturedShow(r)) out.push(r)
  }
  return out
}

// ── 1. Live activity — monthly buckets + equal-period comparison ─────────

export interface MonthBucket {
  key: string        // 'YYYY-MM'
  label: string       // 'Jan 2026'
  isPartial: boolean  // true only for the bucket containing `now`, when
                       // `now` isn't that month's last day — never any
                       // other bucket, and never guessed from row data.
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// UTC throughout, deliberately — fromISO/toISO/now are all UTC instants
// (dates are stored and compared as UTC elsewhere in this codebase's own
// date columns), and using local getFullYear()/getMonth() on a UTC instant
// would shift bucket boundaries by a day depending on the server/browser's
// timezone, producing a different (wrong) number of buckets near a month
// boundary depending on where this runs.
export function monthBucketsInRange(fromISO: string, toISO: string, now: Date = new Date()): MonthBucket[] {
  const from = new Date(fromISO)
  const to = new Date(toISO)
  const buckets: MonthBucket[] = []
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1))
  const nowMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const isLastDayOfMonth = now.getUTCDate() === new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate()
  while (cursor <= to) {
    const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`
    const isCurrentMonth = cursor.getUTCFullYear() === nowMonthStart.getUTCFullYear() && cursor.getUTCMonth() === nowMonthStart.getUTCMonth()
    buckets.push({
      key,
      label: `${MONTH_NAMES[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`,
      isPartial: isCurrentMonth && !isLastDayOfMonth,
    })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return buckets
}

// Counts are keyed by the same 'YYYY-MM' bucket keys — a caller pairs this
// 1:1 with monthBucketsInRange's own output, so a bucket with no shows is
// still present (as 0), never silently missing from the chart.
export function groupCapturedShowsByMonth(rows: AnalyticsPerformanceRow[], buckets: MonthBucket[]): Map<string, number> {
  const captured = dedupeCaptured(rows)
  const counts = new Map<string, number>(buckets.map(b => [b.key, 0]))
  for (const r of captured) {
    const d = dateKey(r)
    if (!d) continue
    const key = d.slice(0, 7)
    if (counts.has(key)) counts.set(key, (counts.get(key) || 0) + 1)
  }
  return counts
}

export interface EqualPeriod { fromISO: string; toISO: string }
export interface EqualPeriodPair { current: EqualPeriod; previous: EqualPeriod; label: string }

// Current period = fromISO..now (the same range Overview already uses).
// Previous = the immediately preceding period of the SAME length — for
// '30d'/'90d' this is exact-day-count equal by construction. For 'ytd' the
// "same length" comparison is Jan 1 of last year through the same
// month/day last year — equal in elapsed days (within a day, ignoring a
// leap-year edge case), never a full prior year compared against a
// partial current one, which would not be an equal-period comparison.
export function equalPeriodComparison(fromISO: string, now: Date = new Date()): EqualPeriodPair {
  const from = new Date(fromISO)
  const spanMs = now.getTime() - from.getTime()
  const prevTo = new Date(from.getTime())
  const prevFrom = new Date(from.getTime() - spanMs)
  return {
    current: { fromISO: from.toISOString(), toISO: now.toISOString() },
    previous: { fromISO: prevFrom.toISOString(), toISO: prevTo.toISOString() },
    label: 'vs. the same-length period before it',
  }
}

export interface PeriodComparisonResult {
  current: number
  previous: number
  // null (not 0, not a string) means "no meaningful percent exists" —
  // exactly the zero-previous case this was built to avoid misrepresenting
  // as a percentage. A caller must render `current`/`previous` as plain
  // counts when this is null, never compute its own fallback percentage.
  percentChange: number | null
}

export function comparePeriods(current: number, previous: number): PeriodComparisonResult {
  if (previous === 0) return { current, previous, percentChange: null }
  return { current, previous, percentChange: Math.round(((current - previous) / previous) * 100) }
}

// ── 2. Song rotation — distinct-show frequency, title+artist keyed ───────

export interface SongRow { performance_id: string; title: string; artist: string | null }

export interface SongRotationEntry {
  key: string           // normalized title + artist — the matching key
  title: string          // cleaned, display-ready (normalizeSongTitle)
  artist: string | null  // cleaned, display-ready (normalizeArtistName)
  distinctShowCount: number
  performanceIds: string[]  // exactly the shows the count above is built
                             // from — the drill-through list, never a
                             // separately-derived number.
}

// Keyed on normalized TITLE + normalized ARTIST together — never title
// alone. Two different songs that happen to share a title (a common cover,
// or two different original songs with the same name) must not merge just
// because their titles match; they only merge if the artist matches too.
// A blank/missing artist normalizes to '' and is its own distinct bucket —
// never silently matched against a specific artist's same-titled song.
export function aggregateSongRotation(rows: SongRow[], limit: number = 20): SongRotationEntry[] {
  const byKey = new Map<string, { title: string; artist: string | null; showIds: Set<string> }>()
  for (const r of rows) {
    if (!r.title) continue
    const key = `${normalizeSongKey(r.title)}::${normalizeSongKey(r.artist || '')}`
    let entry = byKey.get(key)
    if (!entry) {
      entry = { title: normalizeSongTitle(r.title), artist: r.artist ? normalizeArtistName(r.artist) : null, showIds: new Set() }
      byKey.set(key, entry)
    }
    entry.showIds.add(r.performance_id)
  }
  return Array.from(byKey.entries())
    .map(([key, e]) => ({ key, title: e.title, artist: e.artist, distinctShowCount: e.showIds.size, performanceIds: Array.from(e.showIds) }))
    .sort((a, b) => b.distinctShowCount - a.distinctShowCount)
    .slice(0, limit)
}

// ── 3. City / venue history — with an explicit "unknown" bucket ──────────

export interface LocationEntry {
  label: string       // the real city/venue name, or 'Unknown city'/'Unknown venue'
  isUnknown: boolean
  showCount: number
  rows: AnalyticsPerformanceRow[]  // the exact supporting shows — drill-
                                    // through and count are the same data.
}

function isBlank(v: string | null | undefined): boolean {
  return v == null || v.trim().length === 0
}

export function aggregateByCity(rows: AnalyticsPerformanceRow[]): LocationEntry[] {
  const captured = dedupeCaptured(rows)
  const byCity = new Map<string, AnalyticsPerformanceRow[]>()
  for (const r of captured) {
    const city = isBlank(r.city) ? '__unknown__' : r.city!.trim()
    if (!byCity.has(city)) byCity.set(city, [])
    byCity.get(city)!.push(r)
  }
  return Array.from(byCity.entries())
    .map(([city, list]) => ({ label: city === '__unknown__' ? 'Unknown city' : city, isUnknown: city === '__unknown__', showCount: list.length, rows: list }))
    .sort((a, b) => b.showCount - a.showCount)
}

export function aggregateByVenue(rows: AnalyticsPerformanceRow[]): LocationEntry[] {
  const captured = dedupeCaptured(rows)
  const byVenue = new Map<string, AnalyticsPerformanceRow[]>()
  for (const r of captured) {
    const venue = isBlank(r.venue_name) ? '__unknown__' : r.venue_name!.trim()
    if (!byVenue.has(venue)) byVenue.set(venue, [])
    byVenue.get(venue)!.push(r)
  }
  return Array.from(byVenue.entries())
    .map(([venue, list]) => ({ label: venue === '__unknown__' ? 'Unknown venue' : venue, isUnknown: venue === '__unknown__', showCount: list.length, rows: list }))
    .sort((a, b) => b.showCount - a.showCount)
}
