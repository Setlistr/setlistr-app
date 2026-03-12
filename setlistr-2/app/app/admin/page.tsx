import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminView from './AdminView'

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

  const { data: logs } = await supabase
    .from('recognition_logs')
    .select('*, performances(venue_name, city, artist_name)')
    .order('created_at', { ascending: false })
    .limit(200)

  const total = logs?.length ?? 0
  const hits = logs?.filter(l => l.detected).length ?? 0
  const misses = total - hits
  const hitRate = total > 0 ? Math.round((hits / total) * 100) : 0
  const avgScore = logs?.filter(l => l.score).reduce((sum, l) => sum + (l.score ?? 0), 0) ?? 0
  const scoredCount = logs?.filter(l => l.score).length ?? 0
  const avgScoreRounded = scoredCount > 0 ? Math.round(avgScore / scoredCount) : 0

  return (
    <AdminView
      logs={logs ?? []}
      stats={{ total, hits, misses, hitRate, avgScore: avgScoreRounded }}
    />
  )
}
