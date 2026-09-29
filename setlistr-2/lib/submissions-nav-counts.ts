import type { createClient } from './supabase/client'
import { loadFilingProfile } from './load-filing-profile'
import { isRealVenue, isCapturedShow } from './performance-status'

export interface SubmissionsNavCounts {
  filingQueueCount: number
  fullHistoryCount: number
}

// Same status exclusion app/app/history/page.tsx's own query applies
// (.not('status','in','("live","pending")').neq('status','draft')) — kept
// as one set here so the "Full History" count shown in the switcher can
// never drift from what that page's own list actually contains.
const EXCLUDED_LIFECYCLE_STATUSES = new Set(['draft', 'live', 'pending'])

export type MinimalPerf = { venue_name: string; status: string; submission_status: string | null; data_source?: string | null }

// Pure — the actual filtering both counts are defined by, extracted so it's
// directly testable without mocking Supabase. Each count matches that
// page's own real definition exactly:
//   - fullHistoryCount: history's own population (excludes live/pending/
//     draft and placeholder-venue rows; deliberately does NOT exclude
//     imported shows — history never has, "Your Record" is the fuller
//     view on purpose).
//   - filingQueueCount: isCapturedShow (also excludes imported) minus
//     anything already submitted — exactly app/app/file's own row count.
export function countsFromRows(rows: MinimalPerf[]): SubmissionsNavCounts {
  const fullHistoryCount = rows.filter(p => !EXCLUDED_LIFECYCLE_STATUSES.has(p.status) && isRealVenue(p.venue_name)).length
  const filingQueueCount = rows.filter(p => isCapturedShow(p) && p.submission_status !== 'submitted').length
  return { filingQueueCount, fullHistoryCount }
}

// Powers the two-choice Submissions switcher (Filing Queue / Full History)
// shown at the top of both app/app/file and app/app/history.
export async function loadSubmissionsNavCounts(
  supabase: ReturnType<typeof createClient>,
  actingAs: { artist_id: string; artist_name: string } | null,
): Promise<SubmissionsNavCounts> {
  let rows: MinimalPerf[]

  if (actingAs) {
    const ctx = await loadFilingProfile(supabase, actingAs)
    rows = (ctx.delegatePerformances || []).map((p: any) => ({
      venue_name: p.venue_name, status: p.status, submission_status: p.submission_status || null, data_source: p.data_source,
    }))
  } else {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { filingQueueCount: 0, fullHistoryCount: 0 }
    const { data } = await supabase
      .from('performances_visible')
      .select('venue_name, status, submission_status, data_source')
      .eq('user_id', user.id)
    rows = data || []
  }

  return countsFromRows(rows)
}
