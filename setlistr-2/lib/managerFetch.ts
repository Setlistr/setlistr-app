// IO layer for the Manager workspace's Overview/roster data — thin
// wrappers around the authenticated Supabase client (RLS-enforced, no
// service-role client anywhere in this file) that hand rows to the pure
// functions in lib/managerOverview.ts. Kept separate from that file so the
// aggregation logic stays importable/testable without a Supabase client.
//
// Every query here goes through performances_visible — a security_invoker
// view with no user_id filter of its own (supabase/migrations/
// 0005_track_live_access_control.sql); access is enforced by the base
// performances table's RLS policy (can_act_for(user_id)), evaluated per
// row regardless of how many user_id values an .in() filter names. A
// caller who is only an accepted, non-revoked delegate for a subset of the
// ids passed in gets back rows for exactly that subset — never more.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ManagerPerformanceRow } from './managerOverview'

const MANAGER_ROW_COLUMNS = 'id, user_id, status, submission_status, data_source, venue_name, started_at, performance_date'
const PAGE_SIZE = 500

// Paginates via .range() until a page returns fewer than PAGE_SIZE rows —
// never trusts a single request not to have been capped by PostgREST's own
// default row limit. Used for anything presented as a COMPLETE total
// (Overview's labeled-range show count); never used for a bounded "recent
// N" feed, which is capped on purpose.
export async function fetchCapturedShowsInRange(
  supabase: SupabaseClient,
  artistIds: string[],
  fromISO: string,
): Promise<ManagerPerformanceRow[]> {
  if (artistIds.length === 0) return []
  const all: ManagerPerformanceRow[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await supabase
      .from('performances_visible')
      .select(MANAGER_ROW_COLUMNS)
      .in('user_id', artistIds)
      .gte('performance_date', fromISO)
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data || []) as ManagerPerformanceRow[]
    all.push(...page)
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return all
}

// One small query per artist (bounded by roster size, not by show volume)
// so a busy artist's row count can never crowd a quiet artist's own latest
// show out of the result — the exact failure mode a single globally-limited
// query would have. Unscoped by date range on purpose: the roster is a
// directory, not a dated report — an artist's most recent show should show
// up here even if it falls outside the Overview's labeled window.
export async function fetchLatestShowPerArtist(
  supabase: SupabaseClient,
  artistIds: string[],
): Promise<ManagerPerformanceRow[]> {
  if (artistIds.length === 0) return []
  const results = await Promise.all(artistIds.map(async (id) => {
    const { data, error } = await supabase
      .from('performances_visible')
      .select(MANAGER_ROW_COLUMNS)
      .eq('user_id', id)
      .order('started_at', { ascending: false, nullsFirst: false })
      .limit(20) // a handful, not just 1 — isCapturedShow() is applied after fetch, so the single most-recent ROW might not itself be a captured show (e.g. a stray draft)
    if (error) throw error
    return (data || []) as ManagerPerformanceRow[]
  }))
  return results.flat()
}
