'use client'
import { useState, useEffect, useCallback } from 'react'
import { Users } from 'lucide-react'
import { UpcomingShows } from '@/components/scheduling/UpcomingShows'
import { useActingAs } from '@/components/ActingAsProvider'
import { MANAGER_RETURN_KEY } from '@/components/layout/AppShell'

const C = {
  bg: '#0a0908', card: '#141210', border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.25)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68', gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
}

type ManagedArtist = { artist_id: string; artist_name: string; role: string; avatar_url?: string | null }

// Reuses the exact same UpcomingShows component the artist dashboard and
// artist-detail page already use — this page only adds the artist
// picker a manager needs (managing multiple artists at once), never a
// second scheduling form.
export default function ManagerSchedulePage() {
  const { selectManagedArtist } = useActingAs()
  const [loading, setLoading] = useState(true)
  const [managed, setManaged] = useState<ManagedArtist[]>([])
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/team/managed-artists')
      const data = await res.json()
      const list: ManagedArtist[] = data.managed || []
      setManaged(list)
      if (list.length > 0) setSelected(prev => prev && list.some(a => a.artist_id === prev) ? prev : list[0].artist_id)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div style={{ padding: '24px 20px', maxWidth: 640, margin: '0 auto' }} className="mgr-page"><div className="mgr-skeleton" style={{ width: 140, height: 28, borderRadius: 6 }} /><style>{`@keyframes mgrShimmer5 { 0% { background-position: -200px 0 } 100% { background-position: 200px 0 } } .mgr-skeleton { background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 37%, rgba(255,255,255,0.04) 63%); background-size: 400px 100%; animation: mgrShimmer5 1.4s ease infinite; }`}</style></div>
  }

  if (managed.length === 0) {
    return (
      <div style={{ padding: '60px 24px', textAlign: 'center' as const, maxWidth: 380, margin: '0 auto' }}>
        <Users size={32} color={C.muted} style={{ marginBottom: 16 }} />
        <p style={{ color: C.text, fontSize: 17, fontWeight: 800, margin: '0 0 8px' }}>No connected artists yet</p>
        <p style={{ color: C.secondary, fontSize: 14, lineHeight: 1.5, margin: 0 }}>Once you're connected to an artist, their schedule will appear here.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 20px 48px', maxWidth: 640, margin: '0 auto' }} className="mgr-page">
      <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: '0 0 16px', letterSpacing: '-0.025em' }}>Schedule</h1>

      {managed.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: 20 }}>
          {managed.map(a => (
            <button key={a.artist_id} onClick={() => setSelected(a.artist_id)} style={{
              padding: '7px 14px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
              background: selected === a.artist_id ? C.goldDim : 'transparent',
              border: `1px solid ${selected === a.artist_id ? C.borderGold : C.border}`,
              color: selected === a.artist_id ? C.gold : C.secondary,
            }}>
              {a.artist_name}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <UpcomingShows
          artistId={selected}
          canManage={true}
          onBeforeStart={() => {
            const artist = managed.find(a => a.artist_id === selected)
            try { sessionStorage.setItem(MANAGER_RETURN_KEY, selected) } catch {}
            selectManagedArtist({ artist_id: selected, artist_name: artist?.artist_name || 'Artist' })
          }}
        />
      )}

      <style>{`@media (min-width: 900px) { .mgr-page { padding: 40px 32px 60px; } }`}</style>
    </div>
  )
}
