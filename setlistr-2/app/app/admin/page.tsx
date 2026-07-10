import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import AdminDashboard from './AdminView'
import { TEST_USER_IDS } from '@/lib/admin-config'

const ADMIN_EMAILS = [
  'jesse.slack.music@gmail.com',
  'darylscottsongs@gmail.com',
  'srclarke7@gmail.com',
]

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
  ])

  // ── Exclude test accounts before passing to dashboard ─────────────────────
  const realProfiles     = (profiles        ?? []).filter(p => !TEST_USER_IDS.has(p.id))
  const realPerformances = (performances    ?? []).filter(p => !p.user_id || !TEST_USER_IDS.has(p.user_id))
  const realPerfIds      = new Set(realPerformances.map(p => p.id))
  const realPerfSongs    = (performanceSongs ?? []).filter(s => realPerfIds.has(s.performance_id))
  const realUserSongs    = (userSongs        ?? []).filter(s => !TEST_USER_IDS.has(s.user_id))
  const realDetEvents    = (detectionEvents  ?? []).filter(e => !e.performance_id || realPerfIds.has(e.performance_id))

  return (
    <AdminDashboard
      detectionEvents={realDetEvents}
      performances={realPerformances}
      performanceSongs={realPerfSongs}
      profiles={realProfiles}
      userSongs={realUserSongs}
      betaInvites={betaInvites ?? []}
    />
  )
}
