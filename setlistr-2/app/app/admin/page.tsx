import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminDashboard from './AdminView'

const ADMIN_EMAILS = [
  'jesse.slack.music@gmail.com',
  'darylscottsongs@gmail.com',
]

export default async function AdminPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    redirect('/app/dashboard')
  }

  const [
    { data: detectionEvents },
    { data: performances },
    { data: performanceSongs },
    { data: profiles },
    { data: userSongs },
    { data: betaInvites },
  ] = await Promise.all([
    supabase
      .from('detection_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500),

    supabase
      .from('performances')
      .select('id, venue_name, artist_name, city, country, status, submission_status, started_at, user_id, set_duration_minutes')
      .order('started_at', { ascending: false }),

    supabase
      .from('performance_songs')
      .select('performance_id, title, artist, isrc, composer'),

    supabase
      .from('profiles')
      .select('id, full_name, artist_name, pro_affiliation'),

    supabase
      .from('user_songs')
      .select('user_id, song_title, confirmed_count, last_confirmed_at')
      .order('confirmed_count', { ascending: false }),

    supabase
      .from('beta_invites')
      .select('id, email, name, added_by, created_at, accepted_at')
      .order('created_at', { ascending: false }),
  ])

  return (
    <AdminDashboard
      detectionEvents={detectionEvents ?? []}
      performances={performances ?? []}
      performanceSongs={performanceSongs ?? []}
      profiles={profiles ?? []}
      userSongs={userSongs ?? []}
      betaInvites={betaInvites ?? []}
    />
  )
}
