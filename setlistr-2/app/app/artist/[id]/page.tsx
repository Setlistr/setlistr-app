'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MapPin, Music2, Calendar, TrendingUp, Award, Clock } from 'lucide-react'

const C = {
  bg: '#0a0908', card: '#141210', cardHover: '#181614',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
}

type Performance = {
  id: string
  artist_name: string
  venue_name: string
  city: string
  country: string
  started_at: string
  status: string
}

type Song = {
  id: string
  performance_id: string
  title: string
  artist: string
  position: number
}

type TopSong = {
  title: string
  artist: string
  count: number
}

type Stats = {
  totalShows: number
  totalSongs: number
  uniqueSongs: number
  topVenue: string
  topCity: string
  estimatedRoyalties: { low: number; high: number }
}

export default function ArtistProfilePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [artistName, setArtistName]       = useState<string>('')
  const [performances, setPerformances]   = useState<Performance[]>([])
  const [topSongs, setTopSongs]           = useState<TopSong[]>([])
  const [stats, setStats]                 = useState<Stats | null>(null)
  const [loading, setLoading]             = useState(true)
  const [activeTab, setActiveTab]         = useState<'overview' | 'shows' | 'songs'>('overview')

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      // Load performances for this user
      const { data: perfs } = await supabase
        .from('performances')
        .select('*')
        .eq('user_id', params.id)
        .in('status', ['completed', 'exported', 'complete', 'review'])
        .order('started_at', { ascending: false })

      if (!perfs || perfs.length === 0) { setLoading(false); return }

      setArtistName(perfs[0].artist_name || 'Artist')
      setPerformances(perfs)

      // Load all songs across all performances
      const perfIds = perfs.map(p => p.id)
      const { data: songs } = await supabase
        .from('performance_songs')
        .select('*')
        .in('performance_id', perfIds)

      const allSongs: Song[] = songs || []

      // Calculate top songs
      const songCounts: Record<string, { title: string; artist: string; count: number }> = {}
      allSongs.forEach(s => {
        const key = s.title.toLowerCase().trim()
        if (!songCounts[key]) songCounts[key] = { title: s.title, artist: s.artist || '', count: 0 }
        songCounts[key].count++
      })
      const sorted = Object.values(songCounts).sort((a, b) => b.count - a.count).slice(0, 10)
      setTopSongs(sorted)

      // Calculate stats
      const venueCounts: Record<string, number> = {}
      const cityCounts: Record<string, number>  = {}
      perfs.forEach(p => {
        if (p.venue_name) venueCounts[p.venue_name] = (venueCounts[p.venue_name] || 0) + 1
        if (p.city)       cityCounts[p.city]         = (cityCounts[p.city]         || 0) + 1
      })
      const topVenue = Object.entries(venueCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
      const topCity  = Object.entries(cityCounts).sort((a, b) => b[1] - a[1])[0]?.[0]  || ''

      const uniqueSongs = Object.keys(songCounts).length
      const totalSongs  = allSongs.length
      const low  = Math.round(totalSongs * 1.25 * 0.7)
      const high = Math.round(totalSongs * 1.25 * 1.3)

      setStats({
        totalShows: perfs.length,
        totalSongs,
        uniqueSongs,
        topVenue,
        topCity,
        estimatedRoyalties: { low, high },
      })

      setLoading(false)
    }

    load()
  }, [params.id, router])

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function statusColor(status: string) {
    if (status === 'completed' || status === 'complete' || status === 'exported') return '#4ade80'
    if (status === 'review') return C.gold
    return C.muted
  }

  function statusLabel(status: string) {
    if (status === 'completed' || status === 'complete') return 'Completed'
    if (status === 'exported') return 'Exported'
    if (status === 'review') return 'Needs Review'
    return status
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', border: `1.5px solid ${C.gold}`, animation: 'breathe 1.8s ease-in-out infinite' }} />
          <span style={{ color: C.muted, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Loading</span>
        </div>
        <style>{`@keyframes breathe { 0%,100%{transform:scale(1);opacity:.3} 50%{transform:scale(1.2);opacity:.8} }`}</style>
      </div>
    )
  }

  if (!stats) {
    return (
      <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
        <Music2 size={40} color={C.muted} />
        <p style={{ color: C.secondary, fontSize: 16, marginTop: 16 }}>No performances yet</p>
        <button onClick={() => router.push('/app/dashboard')} style={{ marginTop: 20, background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 20px', color: C.muted, fontSize: 13, cursor: 'pointer' }}>
          Back to Dashboard
        </button>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>

      {/* Ambient glow */}
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '45vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 65%)' }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 600, margin: '0 auto', padding: '0 16px', boxSizing: 'border-box' }}>

        {/* ── Header ── */}
        <div style={{ paddingTop: 32, paddingBottom: 24, animation: 'fadeUp 0.4s ease' }}>
          <button onClick={() => router.push('/app/dashboard')} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', letterSpacing: '0.06em', padding: '0 0 20px', display: 'flex', alignItems: 'center', gap: 6 }}>
            ← Dashboard
          </button>

          {/* Artist avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: `radial-gradient(circle at 35% 35%, ${C.gold}40, ${C.gold}15)`,
              border: `1px solid ${C.gold}40`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 24, fontWeight: 800, color: C.gold }}>
                {artistName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.03em' }}>
                {artistName}
              </h1>
              <p style={{ fontSize: 12, color: C.muted, margin: '4px 0 0', letterSpacing: '0.06em' }}>
                {stats.totalShows} {stats.totalShows === 1 ? 'show' : 'shows'} · {stats.uniqueSongs} unique songs
              </p>
            </div>
          </div>

          {/* Royalty estimate banner */}
          <div style={{
            background: C.goldDim, border: `1px solid ${C.borderGold}`,
            borderRadius: 14, padding: '14px 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold, margin: '0 0 4px' }}>
                Estimated Royalties
              </p>
              <p style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>
                ${stats.estimatedRoyalties.low.toLocaleString()}–${stats.estimatedRoyalties.high.toLocaleString()}
              </p>
            </div>
            <TrendingUp size={28} color={C.gold} opacity={0.6} />
          </div>
        </div>

        {/* ── Stats grid ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 24, animation: 'fadeUp 0.4s 0.05s ease both' }}>
          {[
            { label: 'Shows', value: stats.totalShows, icon: <Calendar size={13} color={C.gold} /> },
            { label: 'Songs Played', value: stats.totalSongs, icon: <Music2 size={13} color={C.gold} /> },
            { label: 'Unique Songs', value: stats.uniqueSongs, icon: <Award size={13} color={C.gold} /> },
          ].map(stat => (
            <div key={stat.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px', textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>{stat.icon}</div>
              <p style={{ fontSize: 22, fontWeight: 800, color: C.gold, margin: 0, fontFamily: '"DM Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>{stat.value}</p>
              <p style={{ fontSize: 9, color: C.muted, margin: '3px 0 0', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Top venue / city */}
        {(stats.topVenue || stats.topCity) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 24, animation: 'fadeUp 0.4s 0.08s ease both' }}>
            {stats.topVenue && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' }}>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 6px' }}>Top Venue</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stats.topVenue}</p>
              </div>
            )}
            {stats.topCity && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' }}>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 6px' }}>Top City</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <MapPin size={11} color={C.secondary} />
                  <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0 }}>{stats.topCity}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 4, animation: 'fadeUp 0.4s 0.1s ease both' }}>
          {(['overview', 'shows', 'songs'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1, padding: '9px', border: 'none', borderRadius: 9,
                background: activeTab === tab ? C.goldDim : 'transparent',
                color: activeTab === tab ? C.gold : C.muted,
                fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'capitalize', cursor: 'pointer',
                transition: 'all 0.15s ease', fontFamily: 'inherit',
                borderColor: activeTab === tab ? C.borderGold : 'transparent',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* ── Tab: Overview (top songs) ── */}
        {activeTab === 'overview' && (
          <div style={{ animation: 'fadeUp 0.3s ease' }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 10px' }}>
              Most Played Songs
            </p>
            {topSongs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted, fontSize: 13 }}>No songs recorded yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {topSongs.map((song, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: C.card, border: `1px solid ${i === 0 ? C.borderGold : C.border}`,
                    borderRadius: 11, padding: '11px 14px',
                    animation: `fadeUp 0.3s ${i * 0.04}s ease both`,
                  }}>
                    {/* Rank */}
                    <span style={{ fontSize: 11, fontWeight: 700, color: i === 0 ? C.gold : C.muted, minWidth: 20, textAlign: 'right', fontFamily: '"DM Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>
                      {i + 1}
                    </span>
                    {/* Title */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 600, color: i === 0 ? C.text : C.secondary, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {song.title}
                      </p>
                      {song.artist && (
                        <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 0' }}>{song.artist}</p>
                      )}
                    </div>
                    {/* Count badge */}
                    <div style={{
                      background: i === 0 ? C.goldDim : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${i === 0 ? C.borderGold : C.border}`,
                      borderRadius: 20, padding: '3px 10px', flexShrink: 0,
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: i === 0 ? C.gold : C.muted, fontFamily: '"DM Mono", monospace' }}>
                        ×{song.count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Shows ── */}
        {activeTab === 'shows' && (
          <div style={{ animation: 'fadeUp 0.3s ease' }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 10px' }}>
              All Shows
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {performances.map((perf, i) => (
                <div
                  key={perf.id}
                  onClick={() => router.push(`/app/review/${perf.id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: C.card, border: `1px solid ${C.border}`,
                    borderRadius: 11, padding: '12px 14px', cursor: 'pointer',
                    transition: 'border-color 0.15s, background 0.15s',
                    animation: `fadeUp 0.3s ${i * 0.03}s ease both`,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.borderGold; (e.currentTarget as HTMLElement).style.background = C.cardHover }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.background = C.card }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {perf.venue_name || 'Unknown Venue'}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                      {perf.city && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: C.muted }}>
                          <MapPin size={9} />{perf.city}
                        </span>
                      )}
                      {perf.started_at && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: C.muted }}>
                          <Clock size={9} />{formatDate(perf.started_at)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor(perf.status) }} />
                    <span style={{ fontSize: 10, color: statusColor(perf.status), fontWeight: 600, letterSpacing: '0.06em' }}>
                      {statusLabel(perf.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tab: Songs ── */}
        {activeTab === 'songs' && (
          <div style={{ animation: 'fadeUp 0.3s ease' }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 10px' }}>
              Full Song Catalog — {topSongs.length} unique songs
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {topSongs.map((song, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: '10px 14px',
                  animation: `fadeUp 0.3s ${i * 0.02}s ease both`,
                }}>
                  <span style={{ fontSize: 10, color: C.muted, minWidth: 20, textAlign: 'right', fontFamily: '"DM Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.title}</p>
                    {song.artist && <p style={{ fontSize: 11, color: C.muted, margin: '1px 0 0' }}>{song.artist}</p>}
                  </div>
                  <span style={{ fontSize: 10, color: C.muted, fontFamily: '"DM Mono", monospace', flexShrink: 0 }}>
                    {song.count}× played
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ height: 48 }} />
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  )
}
