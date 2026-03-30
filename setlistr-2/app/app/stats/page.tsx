'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Music2, MapPin, Calendar, TrendingUp, Mic2 } from 'lucide-react'
import MySongsTab from '@/components/MySongsTab'

const C = {
  bg: '#0a0908', card: '#141210',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.25)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
}

type Song        = { title: string; artist: string }
type Performance = { id: string; venue_name: string; city: string; country: string; started_at: string; set_duration_minutes: number }
type UserSong    = { id: string; song_title: string; canonical_artist: string; confirmed_count: number; last_confirmed_at: string }

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7)  return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

export default function StatsPage() {
  const [tab, setTab]                   = useState<'stats' | 'songs'>('stats')
  const [performances, setPerformances] = useState<Performance[]>([])
  const [allSongs, setAllSongs]         = useState<Song[]>([])
  const [userSongs, setUserSongs]       = useState<UserSong[]>([])
  const [userId, setUserId]             = useState<string | null>(null)
  const [loading, setLoading]           = useState(true)

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const [{ data: perfs }, { data: uSongs }] = await Promise.all([
        supabase.from('performances')
          .select('id, venue_name, city, country, started_at, set_duration_minutes')
          .eq('user_id', user.id)
          .in('status', ['completed', 'complete', 'exported', 'review'])
          .order('started_at', { ascending: false }),
        supabase.from('user_songs')
          .select('id, song_title, canonical_artist, confirmed_count, last_confirmed_at')
          .eq('user_id', user.id)
          .order('confirmed_count', { ascending: false }),
      ])

      const perfList = perfs || []
      setPerformances(perfList)
      setUserSongs(uSongs || [])

      if (perfList.length > 0) {
        const { data: songs } = await supabase.from('performance_songs')
          .select('title, artist').in('performance_id', perfList.map(p => p.id))
        setAllSongs(songs || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalShows   = performances.length
  const totalSongs   = allSongs.length
  const totalCities  = new Set(performances.map(p => p.city).filter(Boolean)).size
  const totalMinutes = performances.reduce((s, p) => s + (p.set_duration_minutes ?? 0), 0)
  const totalHours   = Math.round(totalMinutes / 60 * 10) / 10

  const songCounts: Record<string, { title: string; artist: string; count: number }> = {}
  allSongs.forEach(s => {
    const key = s.title.toLowerCase()
    if (!songCounts[key]) songCounts[key] = { title: s.title, artist: s.artist, count: 0 }
    songCounts[key].count++
  })
  const topSongs = Object.values(songCounts).sort((a, b) => b.count - a.count).slice(0, 10)

  const venueCounts: Record<string, { name: string; city: string; count: number }> = {}
  performances.forEach(p => {
    const v = p.venue_name?.trim()
    if (!v || !v.includes(' ')) return
    const key = v.toLowerCase()
    if (!venueCounts[key]) venueCounts[key] = { name: v, city: p.city, count: 0 }
    venueCounts[key].count++
  })
  const topVenues = Object.values(venueCounts).sort((a, b) => b.count - a.count).slice(0, 5)

  const monthCounts: Record<string, number> = {}
  performances.forEach(p => {
    if (!p.started_at) return
    const key = new Date(p.started_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    monthCounts[key] = (monthCounts[key] ?? 0) + 1
  })
  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (5 - i))
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  })
  const maxMonthCount = Math.max(...last6Months.map(m => monthCounts[m] ?? 0), 1)

  const totalUniqueSongs = userSongs.length

  if (loading) {
    return (
      <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: `1.5px solid ${C.gold}40`, borderTopColor: C.gold, animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ padding: '32px 20px 0', maxWidth: 520, margin: '0 auto' }}>
        <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.28em', color: C.gold + '90', margin: '0 0 4px', fontWeight: 600 }}>Your Career</p>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: '0 0 20px', letterSpacing: '-0.02em' }}>Stats</h1>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 4, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 4, marginBottom: 20 }}>
          {([['stats', 'Overview'], ['songs', 'My Songs']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              style={{ flex: 1, padding: '9px', border: 'none', borderRadius: 9, background: tab === key ? C.goldDim : 'transparent', color: tab === key ? C.gold : C.muted, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', cursor: 'pointer', transition: 'all 0.15s ease', fontFamily: 'inherit' }}>
              {label}
              {key === 'songs' && totalUniqueSongs > 0 && (
                <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.7 }}>{totalUniqueSongs}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Overview tab ── */}
      {tab === 'stats' && (
        <div style={{ padding: '0 20px 40px', maxWidth: 520, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {totalShows === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <Music2 size={36} color={C.muted} style={{ opacity: 0.2, marginBottom: 16 }} />
              <p style={{ fontSize: 14, color: C.secondary, margin: 0 }}>No completed shows yet</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { icon: Calendar,   label: 'Shows Played',   value: totalShows },
                  { icon: Music2,     label: 'Songs Logged',   value: totalSongs },
                  { icon: MapPin,     label: 'Cities',         value: totalCities },
                  { icon: TrendingUp, label: 'Hours on Stage', value: totalHours },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px' }}>
                    <Icon size={16} color={C.gold} style={{ marginBottom: 8 }} />
                    <p style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>{value}</p>
                    <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.muted, margin: '3px 0 0' }}>{label}</p>
                  </div>
                ))}
              </div>

              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px' }}>
                <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.secondary, margin: '0 0 16px', fontWeight: 600 }}>Shows per Month</p>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 80 }}>
                  {last6Months.map(month => {
                    const count  = monthCounts[month] ?? 0
                    const height = count === 0 ? 4 : Math.max(12, (count / maxMonthCount) * 80)
                    return (
                      <div key={month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10, color: count > 0 ? C.text : C.muted }}>{count || ''}</span>
                        <div style={{ width: '100%', borderRadius: '3px 3px 0 0', height: `${height}px`, background: count > 0 ? C.gold : 'rgba(255,255,255,0.05)' }} />
                        <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted }}>{month.split(' ')[0]}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {topSongs.length > 0 && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <Mic2 size={14} color={C.gold} />
                    <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.secondary, margin: 0, fontWeight: 600 }}>Most Played Songs</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {topSongs.map((song, i) => (
                      <div key={song.title} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.gold, minWidth: 16, textAlign: 'right', fontFamily: '"DM Mono", monospace' }}>{i + 1}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ minWidth: 0 }}>
                              <p style={{ fontSize: 13, color: C.text, margin: 0, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</p>
                              {song.artist && <p style={{ fontSize: 11, color: C.secondary, margin: '1px 0 0' }}>{song.artist}</p>}
                            </div>
                            <span style={{ fontSize: 11, color: C.gold, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 20, padding: '2px 8px', flexShrink: 0, fontFamily: '"DM Mono", monospace' }}>{song.count}×</span>
                          </div>
                          <div style={{ marginTop: 6, height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.05)' }}>
                            <div style={{ height: '100%', borderRadius: 1, width: `${(song.count / topSongs[0].count) * 100}%`, background: i === 0 ? C.gold : 'rgba(201,168,76,0.4)' }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {topVenues.length > 0 && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <MapPin size={14} color={C.gold} />
                    <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.secondary, margin: 0, fontWeight: 600 }}>Top Venues</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {topVenues.map((venue, i) => (
                      <div key={venue.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: C.gold, minWidth: 16, textAlign: 'right', fontFamily: '"DM Mono", monospace' }}>{i + 1}</span>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 13, color: C.text, margin: 0, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{venue.name}</p>
                            {venue.city && <p style={{ fontSize: 11, color: C.secondary, margin: '1px 0 0' }}>{venue.city}</p>}
                          </div>
                        </div>
                        <span style={{ fontSize: 11, color: C.gold, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 20, padding: '2px 8px', flexShrink: 0 }}>
                          {venue.count} {venue.count === 1 ? 'show' : 'shows'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── My Songs tab — full catalog management ── */}
      {tab === 'songs' && userId && (
        <div style={{ padding: '0 20px 40px', maxWidth: 520, margin: '0 auto' }}>
          <MySongsTab userId={userId} />
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        input::placeholder { color: #5a5040; }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
      `}</style>
    </div>
  )
}
