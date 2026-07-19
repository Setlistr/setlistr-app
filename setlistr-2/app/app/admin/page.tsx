import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import AdminDashboard from './AdminView'
import { TEST_USER_IDS, ADMIN_EMAILS } from '@/lib/admin-config'
// Read-only reference for the Shows-tab golden-set guard — never write to
// lib/reconciliation/ from here, only read the benchmark ID list it exports.
import { GOLDEN_SET } from '@/lib/reconciliation/goldenSet'

// Service role client — bypasses RLS, sees ALL users' data
// This is correct for admin — we need cross-user visibility
function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export default async function AdminPage() {
  // Auth check uses session-scoped client (correct — only checks current user)
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    redirect('/app/dashboard')
  }

  // Data fetching uses service role — sees ALL users' data across the platform
  const adminSupabase = getServiceSupabase()

  const [
    { data: detectionEvents },
    { data: performances },
    { data: performanceSongs },
    { data: profiles },
    { data: userSongs },
    { data: betaInvites },
    { data: reconciliationRuns },
    { data: reconciliationConclusions },
  ] = await Promise.all([
    adminSupabase
      .from('detection_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500),

    adminSupabase
      .from('performances')
      .select('id, venue_name, artist_name, city, country, status, submission_status, started_at, user_id, set_duration_minutes')
      .order('started_at', { ascending: false }),

    adminSupabase
      .from('performance_songs')
      .select('performance_id, title, artist, isrc, composer'),

    adminSupabase
      .from('profiles')
      .select('id, full_name, artist_name, pro_affiliation'),

    adminSupabase
      .from('user_songs')
      .select('user_id, song_title, confirmed_count, last_confirmed_at')
      .order('confirmed_count', { ascending: false }),

    adminSupabase
      .from('beta_invites')
      .select('id, email, name, added_by, created_at, accepted_at')
      .order('created_at', { ascending: false }),

    // Reconciliation engine (Phase 1) — read-only admin visibility.
    // Not filtered by TEST_USER_IDS: this is diagnostic infrastructure, not
    // an aggregate stat, so a run on a "test account" performance (e.g. the
    // golden-set benchmark shows) should still be visible here.
    adminSupabase
      .from('reconciliation_runs')
      .select('id, performance_id, mode, engine_version, params, status, error_message, scoring, started_at, completed_at, created_at')
      .order('created_at', { ascending: false })
      .limit(200),

    adminSupabase
      .from('reconciliation_conclusions')
      .select('id, run_id, slot_index, slot_start, slot_end, concluded_title, concluded_artist, concluded_isrc, tier, score, evidence, created_at')
      .order('slot_index', { ascending: true })
      .limit(5000),
  ])

  // ── Exclude test accounts before passing to dashboard ─────────────────────
  const realProfiles     = (profiles        ?? []).filter(p => !TEST_USER_IDS.has(p.id))
  const realPerformances = (performances    ?? []).filter(p => !p.user_id || !TEST_USER_IDS.has(p.user_id))
  const realPerfIds      = new Set(realPerformances.map(p => p.id))
  const realPerfSongs    = (performanceSongs ?? []).filter(s => realPerfIds.has(s.performance_id))
  const realUserSongs    = (userSongs        ?? []).filter(s => !TEST_USER_IDS.has(s.user_id))
  const realDetEvents    = (detectionEvents  ?? []).filter(e => !e.performance_id || realPerfIds.has(e.performance_id))

  // True total for detection_events — the .limit(500) fetch above may be truncated
  const perfIdArray = Array.from(realPerfIds)
  const { count: detectionEventsTrueCount } = perfIdArray.length > 0
    ? await adminSupabase
        .from('detection_events')
        .select('*', { count: 'exact', head: true })
        .in('performance_id', perfIdArray)
    : { count: 0 }

  // True total for reconciliation_runs — the .limit(200) fetch above may be truncated
  const { count: reconciliationRunsTrueCount } = await adminSupabase
    .from('reconciliation_runs')
    .select('*', { count: 'exact', head: true })

  // Full (unfiltered) performance lookup for reconciliation run display —
  // deliberately not the TEST_USER_IDS-filtered realPerformances, since a
  // run on a filtered-out performance (e.g. a golden-set benchmark show)
  // should still resolve to a real venue/artist/date here.
  const allPerformancesById = new Map((performances ?? []).map(p => [p.id, p]))
  const reconciliationRunsWithPerf = (reconciliationRuns ?? []).map(run => ({
    ...run,
    performance: allPerformancesById.get(run.performance_id) ?? null,
  }))

  return (
    <AdminDashboard
      detectionEvents={realDetEvents}
      detectionEventsTrueCount={detectionEventsTrueCount ?? realDetEvents.length}
      performances={realPerformances}
      performanceSongs={realPerfSongs}
      profiles={realProfiles}
      userSongs={realUserSongs}
      betaInvites={betaInvites ?? []}
      reconciliationRuns={reconciliationRunsWithPerf}
      reconciliationRunsTrueCount={reconciliationRunsTrueCount ?? reconciliationRunsWithPerf.length}
      reconciliationConclusions={reconciliationConclusions ?? []}
      goldenSetPerformanceIds={GOLDEN_SET.map(g => g.id)}
    />
  )
}
