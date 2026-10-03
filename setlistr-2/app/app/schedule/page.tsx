'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useActingAs } from '@/components/ActingAsProvider'
import { UpcomingShows } from '@/components/scheduling/UpcomingShows'

const C = {
  bg: '#0a0908', text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
}

// The full scheduling experience — create/edit/cancel/start. The
// dashboard only ever shows a compact Next Show summary that links here;
// this page is the one place the complete agenda and form live, reused
// as-is by UpcomingShows (no second, competing form).
export default function SchedulePage() {
  const router = useRouter()
  const { actingAs, resolved } = useActingAs()
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
    return <div style={{ minHeight: '100svh', background: C.bg }} />
  }

  const artistId = actingAs?.artist_id || userId
  const displayName = actingAs?.artist_name || artistName

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px 20px 60px' }}>
        <button onClick={() => router.push('/app/dashboard')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.secondary, fontSize: 13, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, marginBottom: 18 }}>
          <ChevronLeft size={14} /> Dashboard
        </button>

        <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Schedule</h1>
        {displayName && <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 24px' }}>{displayName}</p>}

        <UpcomingShows artistId={artistId} artistName={displayName} canManage={true} />
      </div>
    </div>
  )
}
