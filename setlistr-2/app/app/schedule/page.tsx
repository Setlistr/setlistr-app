'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useActingAs } from '@/components/ActingAsProvider'
import { ScheduleTimeline } from '@/components/scheduling/ScheduleTimeline'
import { useWorkspaceRole } from '@/components/layout/WorkspaceRole'
import { PageFrame } from '@/components/ui/PageFrame'

// Schedule: what's next, how to start it, and what already happened
// (components/scheduling/ScheduleTimeline.tsx). Scheduling, Start and
// Edit/Cancel are the existing ones, shared with the Manager pages through
// components/scheduling/UpcomingShows.tsx.
export default function SchedulePage() {
  const router = useRouter()
  const { actingAs, resolved } = useActingAs()
  // Add/edit/cancel/start are write actions: offered in your own workspace
  // and to write-capable team roles, never to a Viewer (who previously saw
  // them here and was refused by the database on use).
  const { canWrite } = useWorkspaceRole()
  const [userId, setUserId] = useState<string | null>(null)
  const [artistName, setArtistName] = useState<string | null>(null)

  useEffect(() => {
    if (!resolved) return
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace('/auth/login'); return }
      setUserId(user.id)
      if (!actingAs) {
        const { data: profile } = await supabase.from('profiles').select('artist_name, full_name').eq('id', user.id).single()
        setArtistName(profile?.artist_name || profile?.full_name || null)
      }
    })
  }, [resolved, actingAs, router])

  if (!resolved || !userId) {
    return <div style={{ minHeight: 'var(--sl-page-min-height, 100svh)', background: 'var(--sl-bg)' }} />
  }

  const artistId = actingAs?.artist_id || userId
  const displayName = actingAs?.artist_name || artistName

  return (
    <PageFrame>
      <div style={{ paddingTop: 8 }}>
        <button onClick={() => router.push('/app/dashboard')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--sl-text-2)', fontSize: 13, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontFamily: '"DM Sans", system-ui, sans-serif', padding: 0, minHeight: 44, marginBottom: 6 }}>
          <ChevronLeft size={14} /> Dashboard
        </button>
        {/* Keyed by workspace: switching artists starts every load afresh. */}
        <ScheduleTimeline key={artistId} artistId={artistId} artistName={displayName} canManage={canWrite} />
      </div>
    </PageFrame>
  )
}
