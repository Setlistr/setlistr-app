// Pure, framework-free aggregation logic for the Manager workspace's
// Overview and Artists roster — no Supabase client, no React, no '@/' path
// aliases, matching the established convention (lib/workspaceStateLogic.ts,
// lib/pro-rules.ts) so this can be exercised from a plain ts-node script
// without a live session or network call. The pages that use this perform
// every fetch (paginated, RLS-scoped) and hand the resulting rows here to
// decide what the numbers actually are.
//
// Every counting function below reuses isCapturedShow() from
// lib/performance-status.ts — the same predicate the dashboard, Your
// Record, and the Filing Queue already agree on — rather than
// reimplementing "what counts as a real recorded show."

import { isCapturedShow, type PerformanceLifecycleFields } from './performance-status'

export type ManagerDateRangeKey = '30d' | '90d' | 'ytd'

export interface ManagerDateRange {
  key: ManagerDateRangeKey
  label: string
  // Inclusive lower bound, ISO 8601 — callers filter performance_date/
  // started_at >= this value. No upper bound: "now" is always the top.
  fromISO: string
}

// "now" is injected (never read internally) so this stays pure and
// testable — same convention as lib/pro-rules.ts's daysUntil(date, now).
export function dateRangeFor(key: ManagerDateRangeKey, now: Date = new Date()): ManagerDateRange {
  if (key === '30d') {
    const from = new Date(now); from.setDate(from.getDate() - 30)
    return { key, label: 'Last 30 days', fromISO: from.toISOString() }
  }
  if (key === '90d') {
    const from = new Date(now); from.setDate(from.getDate() - 90)
    return { key, label: 'Last 90 days', fromISO: from.toISOString() }
  }
  const jan1 = new Date(now.getFullYear(), 0, 1)
  return { key, label: `${now.getFullYear()} so far`, fromISO: jan1.toISOString() }
}

export interface ManagerPerformanceRow extends PerformanceLifecycleFields {
  id: string
  user_id: string
  started_at?: string | null
  performance_date?: string | null
  submission_status?: string | null
}

function sortKey(r: ManagerPerformanceRow): string {
  return r.started_at || r.performance_date || ''
}

// Distinct-show counting: dedupes by id defensively (never trusts the
// caller not to have handed back a join-inflated row set — e.g. one row
// per song rather than one per performance) before applying the canonical
// isCapturedShow() predicate. A row that's already been deduped is
// unaffected either way.
export function countCapturedShows(rows: ManagerPerformanceRow[]): number {
  const seen = new Set<string>()
  let count = 0
  for (const r of rows) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    if (isCapturedShow(r)) count++
  }
  return count
}

// Per-artist captured-show counts from one combined row set — used by the
// roster so every artist's own total is correct even when another artist
// in the same set has many more rows.
export function countCapturedShowsByArtist(rows: ManagerPerformanceRow[]): Map<string, number> {
  const seen = new Set<string>()
  const counts = new Map<string, number>()
  for (const r of rows) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    if (!isCapturedShow(r)) continue
    counts.set(r.user_id, (counts.get(r.user_id) || 0) + 1)
  }
  return counts
}

// Each artist's most recent captured show from a flat, possibly
// multi-artist row set. Deliberately NOT derived from a single
// globally-limited query — a busy artist's many recent rows must never
// crowd a quieter artist's own most recent row out of the input set in the
// first place. Callers are responsible for fetching a row set where every
// artist's true latest row is actually present (see fetchLatestPerArtist
// in the manager pages, which queries per artist_id); this function only
// picks the winner per artist_id from whatever it's given.
export function latestShowPerArtist(rows: ManagerPerformanceRow[]): Map<string, ManagerPerformanceRow> {
  const latest = new Map<string, ManagerPerformanceRow>()
  for (const r of rows) {
    if (!isCapturedShow(r)) continue
    const existing = latest.get(r.user_id)
    if (!existing || sortKey(r) > sortKey(existing)) latest.set(r.user_id, r)
  }
  return latest
}

// Bounded, cross-artist recent-activity feed — explicitly a "recent N"
// list, never presented as a total (see countCapturedShows for that). It's
// expected and correct for a busier artist to appear more often here; this
// is NOT the function that guarantees every artist's own latest show is
// visible (see latestShowPerArtist for that).
export function recentActivityFeed(rows: ManagerPerformanceRow[], limit: number): ManagerPerformanceRow[] {
  const seen = new Set<string>()
  const deduped: ManagerPerformanceRow[] = []
  for (const r of rows) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    if (isCapturedShow(r)) deduped.push(r)
  }
  return deduped.sort((a, b) => sortKey(b).localeCompare(sortKey(a))).slice(0, limit)
}

// The one filing-adjacent signal this slice surfaces: a plain, always-
// accurate "not yet submitted" count. Deliberately NOT a Ready/Needs-review
// breakdown via computeFilingStatus() — that function's ticket price/
// promoter/attendance checks fall back to claim inputs held only in the
// browser localStorage of whoever filled out that specific show's Submit
// page, which the Manager's own browser/device has no access to. Computing
// that split here would silently misreport shows as "needs review" for
// fields the artist may have already filled in elsewhere. submission_status
// is a real, always-current database column with no such gap.
export function countNotYetSubmitted(rows: ManagerPerformanceRow[]): number {
  const seen = new Set<string>()
  let count = 0
  for (const r of rows) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    if (isCapturedShow(r) && r.submission_status !== 'submitted') count++
  }
  return count
}
