// Canonical performance-lifecycle predicates shared by every screen that
// counts or filters shows — app/app/dashboard, app/app/history ("Your
// Record"), and app/app/file (Filing Queue). Single source of truth so a
// show that counts on one screen counts the same way on every other.
//
// This exists because it didn't hold: the dashboard's headline show/filed
// counts used their own ad hoc status whitelist (missing an in-flight
// status history implicitly included, and carrying a dead 'submitted'
// entry — 'submitted' is a submission_status value, never a status value)
// and never excluded placeholder venue rows the way history already did —
// so a garbage/blank-venue row could inflate the dashboard's totals while
// history's list correctly hid it. Same shape of bug produced history's
// own internal mismatch: its "ready to submit" banner counted 'review'
// (not-yet-reviewed) shows alongside genuinely complete ones, while the
// "Ready to Claim" tab it sits next to counted only the latter.

export type PerformanceLifecycleFields = {
  status: string | null
  submission_status?: string | null
  data_source?: string | null
  venue_name?: string | null
}

// A blank, '.', or '..' venue_name is a placeholder/garbage row — most
// commonly an abandoned Upload Performance draft's transient state before
// real metadata exists, or bad legacy data. Never a real show to count,
// list, or file.
export function isRealVenue(name: string | null | undefined): boolean {
  if (!name) return false
  const t = name.trim()
  return t !== '' && t !== '.' && t !== '..'
}

// Reached only once the artist has actually confirmed/finalized their
// setlist for a show — the review step is DONE, not merely started.
// 'review' (and any other pre-complete status, e.g. 'processing') is
// deliberately excluded: a show still there has not been reviewed yet,
// regardless of what other fields happen to already be filled in.
const COMPLETE_STAGE_STATUSES = new Set(['complete', 'completed', 'exported'])
export function isCompleteStage(p: Pick<PerformanceLifecycleFields, 'status'>): boolean {
  return !!p.status && COMPLETE_STAGE_STATUSES.has(p.status)
}

export function isSubmitted(p: Pick<PerformanceLifecycleFields, 'submission_status'>): boolean {
  return p.submission_status === 'submitted'
}

// The canonical "this is a real captured show that belongs on your
// record" test — excludes imported history, live/in-progress/draft rows,
// and placeholder-venue rows. This is what the dashboard's headline show
// count, history's "Your Record" list, and the Filing Queue must all
// agree on when they're all describing the same underlying set of shows.
const EXCLUDED_LIFECYCLE_STATUSES = new Set(['draft', 'live', 'pending'])
export function isCapturedShow(p: PerformanceLifecycleFields): boolean {
  return p.data_source !== 'setlistfm_imported'
    && !!p.status && !EXCLUDED_LIFECYCLE_STATUSES.has(p.status)
    && isRealVenue(p.venue_name)
}
