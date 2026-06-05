'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const C = {
  bg: '#0a0908', card: '#141210',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.08)',
}

type Show = {
  id: string
  started_at: string
  status: string
  submitted_at: string | null
  songs: { title: string; artist: string }[]
}

export default function VenueDetailPage() {
  const router = useRouter()
  const params = useParams()
  const venueId = params.id as string

  const [venueName, setVenueName] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [shows, setShows] = useState<Show[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedShow, setExpandedShow] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/auth/login'); return }

      // Load venue info
      const { data: venue } = await supabase
        .from('venues')
        .select('name, city, country')
        .eq('id', venueId)
        .single()

      if (venue) {
        setVenueName(venue.name)
        setCity(venue.city || '')
        setCountry(venue.country || '')
      }

      // Load all performances at this venue
      const { data: perfs } = await supabase
        .from('performances')
        .select('id, started_at, status, submitted_at')
        .eq('user_id', user.id)
        .eq('venue_id', venueId)
        .in('status', ['complete', 'completed', 'review', 'exported'])
        .neq('data_source', 'setlistfm_imported')
        .order('started_at', { ascending: false })

      if (!perfs) { setLoading(false); return }

      // Load songs for each performance
      const { data: allSongs } = await supabase
        .from('performance_songs')
        .select('performance_id, title, artist')
        .in('performance_id', perfs.map(p => p.id))
        .order('position', { ascending: true })

      const songMap: Record<string, { title: string; artist: string }[]> = {}
      allSongs?.forEach(s => {
        if (!songMap[s.performance_id]) songMap[s.performance_id] = []
        songMap[s.performance_id].push({ title: s.title, artist: s.artist || '' })
      })

      setShows(perfs.map(p => ({
        id: p.id,
        started_at: p.started_at,
        status: p.status,
        submitted_at: p.submitted_at,
        songs: songMap[p.id] || [],
      })))
      setLoading(false)
    }
    load()
  }, [venueId])

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  }

  const firstShow = shows.length > 0 ? shows[shows.length - 1] : null
  const totalSongs = shows.reduce((sum, s) => sum + s.songs.length, 0)
  const avgSongs = shows.length > 0 ? Math.round(totalSongs / shows.length) : 0

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <button onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 20, padding: '2px 0', lineHeight: 1, flexShrink: 0 }}>
          ←
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: '0 0 2px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            {loading ? '...' : venueName}
          </h1>
          {(city || country) && (
            <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>
              {[city, country].filter(Boolean).join(', ')}
            </p>
          )}
        </div>
      </div>

      {!loading && shows.length > 0 && (
        <>
          {/* Stats */}
          <div style={{ display: 'flex', gap: 8, padding: '16px 24px 0' }}>
            {[
              { value: shows.length, label: shows.length === 1 ? 'show' : 'shows' },
              { value: avgSongs, label: 'avg songs' },
              { value: firstShow ? new Date(firstShow.started_at).getFullYear() : '—', label: 'first show' },
            ].map((stat, i) => (
              <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', flex: 1, textAlign: 'center' }}>
                <p style={{ fontSize: 20, fontWeight: 800, color: C.gold, margin: 0, letterSpacing: '-0.02em' }}>{stat.value}</p>
                <p style={{ fontSize: 11, color: C.muted, margin: 0, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Show history */}
          <div style={{ padding: '16px 24px 80px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 12px' }}>
              Show History
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {shows.map((show, i) => (
                <div key={show.id} style={{ background: C.card, border: `1px solid ${expandedShow === show.id ? C.borderGold : C.border}`, borderRadius: 12, overflow: 'hidden', transition: 'border-color 0.2s ease' }}>

                  {/* Show row */}
                  <button
                    onClick={() => setExpandedShow(expandedShow === show.id ? null : show.id)}
                    style={{ width: '100%', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: '0 0 2px' }}>
                        {formatDate(show.started_at)}
                      </p>
                      <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
                        {show.songs.length} {show.songs.length === 1 ? 'song' : 'songs'}
                        {show.submitted_at ? ' · Submitted' : ''}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {i === 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: C.gold, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 4, padding: '2px 6px', letterSpacing: '0.08em' }}>
                          LAST
                        </span>
                      )}
                      <span style={{ fontSize: 16, color: C.muted, transition: 'transform 0.2s ease', display: 'inline-block', transform: expandedShow === show.id ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                        ↓
                      </span>
                    </div>
                  </button>

                  {/* Expanded setlist */}
                  {expandedShow === show.id && show.songs.length > 0 && (
                    <div style={{ borderTop: `1px solid ${C.border}`, padding: '12px 16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {show.songs.map((song, j) => (
                          <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 11, color: C.muted, minWidth: 18, fontFamily: '"DM Mono", monospace', fontWeight: 700 }}>{j + 1}</span>
                            <div>
                              <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0 }}>{song.title}</p>
                              {song.artist && <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{song.artist}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => router.push(`/app/review/${show.id}`)}
                        style={{ marginTop: 12, fontSize: 12, color: C.gold, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, fontWeight: 600 }}>
                        View full show →
                      </button>
                    </div>
                  )}

                  {expandedShow === show.id && show.songs.length === 0 && (
                    <div style={{ borderTop: `1px solid ${C.border}`, padding: '12px 16px' }}>
                      <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>No songs recorded for this show.</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {!loading && shows.length === 0 && (
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: C.muted }}>No captured shows at this venue yet.</p>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&family=DM+Mono:wght@400;700&display=swap');
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
      `}</style>
    </div>
  )
}
