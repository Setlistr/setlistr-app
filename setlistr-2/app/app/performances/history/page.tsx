'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MapPin, Clock, Music2, ChevronRight, Plus } from 'lucide-react'

const C = {
  bg: '#0a0908',
  card: '#141210',
  border: 'rgba(255,255,255,0.07)',
  text: '#f0ece3',
  secondary: '#b8a888',
  muted: '#8a7a68',
  gold: '#c9a84c',
}

type Performance = {
  id: string
  artist_name: string
  venue_name: string
  city: string
  country: string
  started_at: string
  ended_at: string
  status: string
  set_duration_minutes: number
}

type PerformanceWithSongs = Performance & { song_count: number }

export default function HistoryPage() {
  const router = useRouter()
  const [performances, setPerformances] = useState<PerformanceWithSongs[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('performances')
      .select('*, performance_songs(count)')
      .order('started_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          const mapped = data.map((p: any) => ({
            ...p,
            song_count: p.performance_songs?.[0]?.count || 0,
          }))
          // Filter out 0-song shows — they're test data or abandoned sessions
          setPerformances(mapped.filter((p: PerformanceWithSongs) => p.song_count > 0))
        }
        setLoading(false)
      })
  }, [])

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    })
  }

  function formatDuration(p: Performance) {
    if (!p.started_at || !p.ended_at) return `${p.set_duration_minutes}min`
    const mins = Math.round((new Date(p.ended_at).getTime() - new Date(p.started_at).getTime()) / 60000)
    if (mins < 1) return '< 1min'
    return `${mins}min`
  }

  // Status badge — Review uses gold to match brand urgency
  const statusMap: Record<string, { label: string; color: string; bg: string; border: string }> = {
    completed: { label: 'Completed', color: '#4ade80',  bg: 'rgba(74,222,128,0.08)',   border: 'rgba(74,222,128,0.18)' },
    exported:  { label: 'Submitted', color: '#4ade80',  bg: 'rgba(74,222,128,0.08)',   border: 'rgba(74,222,128,0.18)' },
    review:    { label: 'Needs Review', color: C.gold,  bg: 'rgba(201,168,76,0.1)',    border: 'rgba(201,168,76,0.22)' },
    live:      { label: 'Live',      color: '#f87171',  bg: 'rgba(248,113,113,0.1)',   border: 'rgba(248,113,113,0.2)' },
    pending:   { label: 'Pending',   color: C.muted,    bg: 'rgba(160,144,112,0.08)', border: 'rgba(160,144,112,0.15)' },
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: `1.5px solid ${C.gold}40`, borderTopColor: C.gold, animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ padding: '32px 20px 20px', maxWidth: 520, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.gold }} />
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: C.gold + '90' }}>
              Performance History
            </span>
          </div>
          <button
            onClick={() => router.push('/app/performances/new')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 8, background: C.gold, color: '#0a0908', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            <Plus size={13} /> New Show
          </button>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>Past Shows</h1>
        <p style={{ fontSize: 13, color: C.secondary, margin: '4px 0 0' }}>
          {performances.length} {performances.length === 1 ? 'performance' : 'performances'} recorded
        </p>
      </div>

      {/* List */}
      <div style={{ padding: '0 20px 40px', maxWidth: 520, margin: '0 auto', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {performances.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <Music2 size={36} color={C.muted} style={{ opacity: 0.3, marginBottom: 16 }} />
            <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 4px' }}>No performances yet</p>
            <p style={{ fontSize: 12, color: C.muted, margin: '0 0 24px' }}>Start your first show to see it here</p>
            <button onClick={() => router.push('/app/performances/new')}
              style={{ fontWeight: 700, padding: '10px 24px', borderRadius: 10, fontSize: 13, background: C.gold, color: '#0a0908', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              Start First Show
            </button>
          </div>
        ) : (
          performances.map((p, i) => {
            const s       = statusMap[p.status] || statusMap.pending
            // Only show location if we have real data
            const hasCity    = p.city && p.city.trim().length > 0
            const hasCountry = p.country && p.country.trim().length > 0
            const location   = [hasCity ? p.city : null, hasCountry ? p.country : null].filter(Boolean).join(', ')
            const hasLocation = location.length > 0
            // Venue name fallback
            const venueName = p.venue_name?.trim() || 'Unknown Venue'

            return (
              <div
                key={p.id}
                onClick={() => router.push(`/app/review/${p.id}`)}
                style={{
                  background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 14, padding: '14px 16px', cursor: 'pointer',
                  transition: 'border-color 0.15s ease, background 0.15s ease',
                  animation: `fadeUp 0.3s ${i * 0.04}s ease both`,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(201,168,76,0.25)'; (e.currentTarget as HTMLElement).style.background = '#181614' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.background = C.card }}
              >
                {/* Top row: venue + badge */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.01em' }}>
                      {venueName}
                    </h3>
                    {/* Only render location row if we have real location data */}
                    {hasLocation && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                        <MapPin size={10} color={C.muted} />
                        <span style={{ fontSize: 11, color: C.muted }}>{location}</span>
                      </div>
                    )}
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 20, flexShrink: 0,
                    letterSpacing: '0.04em', textTransform: 'uppercase' as const,
                    color: s.color, background: s.bg, border: `1px solid ${s.border}`,
                  }}>
                    {s.label}
                  </span>
                </div>

                {/* Bottom row: date + duration + songs + arrow */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: C.muted }}>
                    {p.started_at && (
                      <span>{formatDate(p.started_at)}</span>
                    )}
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Clock size={10} />{formatDuration(p)}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Music2 size={10} />{p.song_count} {p.song_count === 1 ? 'song' : 'songs'}
                    </span>
                  </div>
                  <ChevronRight size={14} color={C.muted} style={{ opacity: 0.5 }} />
                </div>
              </div>
            )
          })
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
      `}</style>
    </div>
  )
}
