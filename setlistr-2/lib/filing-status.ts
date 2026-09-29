// Whether a show is actually ready to file — not merely "it exists." Drives
// app/app/file/page.tsx's filing queue. Reuses the same PRO field rules
// (lib/pro-rules.ts) and the same identity-completeness check
// (lib/submission-identity.ts) that app/app/submit/[id]/page.tsx's own
// "Ready to Claim" screen is built from, so the queue's state can never
// disagree with what a user actually finds when they open a show's Submit
// page. Dependency-free otherwise, matching this codebase's convention for
// narrow, testable helpers (see lib/writeCapableRoles.ts).

import { getProRule } from './pro-rules'
import { missingIdentityFields, type IdentityProfileFields } from './submission-identity'
import { isCompleteStage } from './performance-status'

export type FilingState = 'needs_review' | 'ready' | 'submitted'

// Only the show-detail inputs a PRO can require beyond what's already on
// the performance/profile record — the same fields app/app/submit/[id]/
// page.tsx collects into ClaimInputs and persists to localStorage under
// `setlistr:claim:${performanceId}`. The queue reads that same key (see
// readClaimInputs in the page) rather than inventing new storage.
export interface FilingClaimInputs {
  ticketPrice?: string | null
  promoter?: string | null
  attendance?: string | null
  startTime?: string | null
  city?: string | null
}

export interface FilingPerformanceFields {
  status?: string | null
  submission_status?: string | null
  started_at?: string | null
  city?: string | null
  venue_city?: string | null
  venue_capacity?: number | null
}

export type FilingProfileFields = IdentityProfileFields & { pro_affiliation?: string | null }

export interface FilingStatusResult {
  state: FilingState
  proName: string | null
  missing: string[]
}

function isBlank(value: string | null | undefined): boolean {
  return value == null || value.trim().length === 0
}

function fieldRequired(rule: ReturnType<typeof getProRule>, key: string): boolean {
  return !!rule?.fields.some(f => f.key === key && f.required)
}

export function computeFilingStatus(
  performance: FilingPerformanceFields,
  songCount: number,
  profile: FilingProfileFields | null,
  isDelegate: boolean,
  claimInputs: FilingClaimInputs = {},
): FilingStatusResult {
  const rule = getProRule(profile?.pro_affiliation)
  const proName = rule?.name || profile?.pro_affiliation || null

  if (performance.submission_status === 'submitted') {
    return { state: 'submitted', proName, missing: [] }
  }

  const missing: string[] = []

  // A show still in 'review' (or any other pre-complete status, e.g.
  // 'processing') has not had its setlist confirmed/finalized yet — it
  // must never read as ready just because a PRO/identity/field check
  // happens to already pass. This is checked independently of songCount
  // below: a show can be missing either, both, or neither.
  if (!isCompleteStage({ status: performance.status ?? null })) missing.push('setlist not yet reviewed')

  if (!rule) missing.push('No PRO selected')
  if (songCount === 0) missing.push('no songs added')

  if (rule) {
    // Identity is only ever checked against the OWNER's real profile. A
    // delegate's profile object never carries legal_name/ipi_number at all
    // (see app/app/submit/[id]/page.tsx's load()) — checking it here for a
    // delegate would always read as "missing" regardless of whether the
    // real artist account actually has them, misrepresenting the show as
    // less ready than it is. This mirrors that page's existing privacy
    // boundary exactly rather than reinventing it.
    if (!isDelegate) missing.push(...missingIdentityFields(profile))

    const hasCity = !!(performance.city || performance.venue_city || !isBlank(claimInputs.city))
    if (!hasCity && fieldRequired(rule, 'venue_city')) missing.push('city')

    if (!performance.venue_capacity && fieldRequired(rule, 'capacity')) missing.push('venue capacity')

    // start_time is auto-derived from started_at on the Submit page
    // (defaultStartTime) whenever the performance has one — only a show
    // with neither a recorded start nor a manually saved one is actually
    // missing this.
    const hasStartTime = !!(performance.started_at || !isBlank(claimInputs.startTime))
    if (!hasStartTime && fieldRequired(rule, 'start_time')) missing.push('start time')

    if (isBlank(claimInputs.ticketPrice) && fieldRequired(rule, 'ticket_price')) missing.push('ticket price')
    if (isBlank(claimInputs.promoter) && fieldRequired(rule, 'promoter')) missing.push('promoter')
    if (isBlank(claimInputs.attendance) && fieldRequired(rule, 'attendance')) missing.push('attendance')
  }

  return { state: missing.length > 0 ? 'needs_review' : 'ready', proName, missing }
}

export interface FilingAction {
  href: string
  label: string
}

// Where "work on this show" should actually send someone. A show with no
// songs yet, or one that hasn't finished the review step, has nothing for
// the Submit page to show — sending someone there is a dead end. Shared so
// the Filing Queue and any other caller route identically rather than
// re-deriving this decision inline.
export function filingActionPath(performanceId: string, status: string | null | undefined, songCount: number): FilingAction {
  if (songCount === 0 || !isCompleteStage({ status: status ?? null })) {
    return { href: `/app/review/${performanceId}`, label: 'Review Setlist' }
  }
  return { href: `/app/submit/${performanceId}`, label: 'Open Submit' }
}
