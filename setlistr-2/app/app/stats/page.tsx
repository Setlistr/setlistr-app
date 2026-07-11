'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Music2, MapPin, Calendar, TrendingUp, Mic2, Shield, ChevronDown } from 'lucide-react'
import MySongsTab from '@/components/MySongsTab'
import { estimateRoyalties, capacityToBand } from '@/lib/royalty-estimate'

const C = {
  bg: '#0a0908', card: '#141210',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.25)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)', green: '#4ade80',
}

const ACTING_AS_KEY = 'setlistr_acting_as'

type Song        = { title: string; artist: string; performance_id: string }
type Performance = {
  id: string; venue_name: string; venue_id: string | null; city: string; country: string;
  started_at: string; ended_at: string | null; set_duration_minutes: number;
  submission_status: string | null; show_type?: string; venue_capacity?: number | null
}
type UserSong    = { id: string; song_title: string; canonical_artist: string; confirmed_count: number; last_confirmed_at: string }
type SongDebut   = { title: string; artist: string | null; first_performed_at: string }

function formatDebutDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

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

function isCanadian(country?: string | null, city?: string | null) {
  if (['CA', 'Canada', 'ca'].includes(country || '')) return true
  const lowerCity = (city || '').toLowerCase()
  return ['toronto', 'vancouver', 'montreal', 'calgary', 'edmonton', 'ottawa', 'winnipeg'].some(c => lowerCity.includes(c))
}

export default function StatsPage() {
  const router = useRouter()
  const [tab, setTab]                   = useState<'stats' | 'songs'>('stats')
  const [performances, setPerformances] = useState<Performance[]>([])
  const [allSongs, setAllSongs]         = useState<Song[]>([])
  const [userSongs, setUserSongs]       = useState<UserSong[]>([])
  const [userId, setUserId]             = useState<string | null>(null)
  const [songDebuts, setSongDebuts]     = useState<SongDebut[]>([])
  const [loading, setLoading]           = useState(true)
  const [showTopSongs, setShowTopSongs]   = useState(false)
  const [showTopVenues, setShowTopVenues] = useState(false)
  const [showDebuts, setShowDebuts]       = useState(false)

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      let actingAsArtistId: string | null = null
      try {
        const saved = localStorage.getItem(ACTING_AS_KEY)
        if (saved) {
          const parsed = JSON.parse(saved)
          if (parsed?.artist_id) actingAsArtistId = parsed.artist_id
        }
      } catch {}

      const targetUserId = actingAsArtistId || user.id
      setUserId(targetUserId)

      let perfList: Performance[] = []

      if (actingAsArtistId) {
        const [ctxRes, debutRes] = await Promise.all([
          fetch(`/api/team/context-data?artist_id=${actingAsArtistId}`),
          fetch(`/api/song-debuts?userId=${actingAsArtistId}`),
        ])
        const ctxData   = await ctxRes.json()
        const debutData = await debutRes.json()
        if (!ctxData.error) {
          perfList = (ctxData.performances || []).filter((p: any) =>
            ['completed', 'complete', 'exported', 'review'].includes(p.status)
          ).map((p: any) => ({
            id: p.id, venue_name: p.venue_name, venue_id: p.venue_id || null,
            city: p.city, country: p.country,
            started_at: p.started_at, ended_at: p.ended_at || null,
            set_duration_minutes: p.set_duration_minutes,
            submission_status: p.submission_status || null,
            show_type: p.show_type || 'single',
            venue_capacity: p.venue_capacity || null,
          }))
          setPerformances(perfList)
          setUserSongs([])
        }
        if (!debutData.error) setSongDebuts(debutData.debuts || [])
      } else {
        const [perfsResult, uSongsResult, debutRes] = await Promise.all([
          supabase.from('performances')
            .select('id, venue_name, venue_id, city, country, started_at, ended_at, set_duration_minutes, submission_status, shows(show_type), venues(capacity)')
            .eq('user_id', user.id)
            .in('status', ['completed', 'complete', 'exported', 'review'])
            .order('started_at', { ascending: false }),
          supabase.from('user_songs')
            .select('id, song_title, canonical_artist, confirmed_count, last_confirmed_at')
            .eq('user_id', user.id)
            .order('confirmed_count', { ascending: false }),
          fetch('/api/song-debuts'),
        ])
        const debutData = await debutRes.json()
        perfList = (perfsResult.data || []).map((p: any) => ({
          id: p.id, venue_name: p.venue_name, venue_id: p.venue_id || null,
          city: p.city, country: p.country,
          started_at: p.started_at, ended_at: p.ended_at || null,
          set_duration_minutes: p.set_duration_minutes,
          submission_status: p.submission_status || null,
          show_type: (p.shows as any)?.show_type || 'single',
          venue_capacity: (p.venues as any)?.capacity || null,
        }))
        setPerformances(perfList)
        setUserSongs(uSongsResult.data || [])
        if (!debutData.error) setSongDebuts(debutData.debuts || [])
      }

      if (perfList.length > 0) {
        const { data: songs } = await supabase.from('performance_songs')
          .select('title, artist, position, performance_id').in('performance_id', perfList.map(p => p.id))
        setAllSongs((songs || []) as Song[])
      }
      setLoading(false)
    }
    load()
  }, [])

  // ── Derived stats ─────────────────────────────────────────────────────────
  const totalShows  = performances.length
  const totalSongs  = allSongs.length
  const totalCities = new Set(performances.map(p => p.city).filter(Boolean)).size

  const lastShow = performances.length > 0 ? performances[0] : null
  const daysSinceLastShow = lastShow
    ? Math.floor((Date.now() - new Date(lastShow.started_at).getTime()) / 86400000)
    : null

  const dormantSongs = userSongs.filter(s => {
    if (!s.last_confirmed_at || s.confirmed_count === 0) return false
    const days = Math.floor((Date.now() - new Date(s.last_confirmed_at).getTime()) / 86400000)
    return days > 45
  }).length

  // A: Per-show royalty estimate matching dashboard formula
  const songCountMap: Record<string, number> = {}
  allSongs.forEach(s => {
    if (s.performance_id) songCountMap[s.performance_id] = (songCountMap[s.performance_id] || 0) + 1
  })
  let estimatedLifetimeRoyalty = 0
  performances.forEach(p => {
    const songCount = songCountMap[p.id] || 0
    if (songCount === 0) return
    const est = estimateRoyalties({
      songCount,
      venueCapacityBand: capacityToBand(p.venue_capacity ?? undefined),
      showType: (p.show_type as any) || 'single',
      territory: isCanadian(p.country, p.city) ? 'CA' : 'US',
    })
    estimatedLifetimeRoyalty += est.expected
  })
  estimatedLifetimeRoyalty = Math.round(estimatedLifetimeRoyalty)

  // B.2: Real hours from ended_at - started_at (0 < d < 8h)
  const showsWithRealDuration = performances.filter(p => {
    if (!p.ended_at) return false
    const diff = new Date(p.ended_at).getTime() - new Date(p.started_at).getTime()
    const mins = diff / 60000
    return mins > 0 && mins < 480
  })
  const realTotalMinutes = showsWithRealDuration.reduce((sum, p) => {
    return sum + (new Date(p.ended_at!).getTime() - new Date(p.started_at).getTime()) / 60000
  }, 0)
  const realTotalHours = Math.round(realTotalMinutes / 60 * 10) / 10
  const N = showsWithRealDuration.length
  const showHours = totalShows > 0 && N >= Math.ceil(totalShows * 0.3)

  const firstShow = performances.length > 0 ? performances[performances.length - 1] : null
  const firstShowLabel = firstShow
    ? new Date(firstShow.started_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null

  // Mapbox static image for Career Map card
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
  const topCountry = (() => {
    const cc: Record<string, number> = {}
    performances.forEach(p => { if (p.country) cc[p.country] = (cc[p.country] || 0) + 1 })
    return Object.entries(cc).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
  })()
  const [mapLon, mapLat, mapZoom] =
    topCountry === 'CA' || topCountry === 'Canada' ? [-96, 57, 3] :
    topCountry === 'GB' || topCountry === 'United Kingdom' ? [-2, 54, 5] :
    topCountry === 'AU' || topCountry === 'Australia' ? [134, -26, 3] :
    [-98, 38, 3]
  const mapboxStaticUrl = mapboxToken
    ? `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${mapLon},${mapLat},${mapZoom}/480x160@2x?access_token=${mapboxToken}`
    : ''

  // Song analysis
  const songCounts: Record<string, { title: string; artist: string; count: number; positions: number[] }> = {}
  allSongs.forEach((s: any) => {
    const key = s.title.toLowerCase()
    if (!songCounts[key]) songCounts[key] = { title: s.title, artist: s.artist, count: 0, positions: [] }
    songCounts[key].count++
    if (s.position && s.position > 0) songCounts[key].positions.push(s.position)
  })
  const topSongs = Object.values(songCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(s => ({
      ...s,
      avgPosition: s.positions.length >= 3
        ? Math.round(s.positions.reduce((a, b) => a + b, 0) / s.positions.length)
        : null,
    }))

  const venueCounts: Record<string, { name: string; city: string; count: number; id: string | null }> = {}
  performances.forEach(p => {
    const v = p.venue_name?.trim()
    if (!v || !v.includes(' ')) return
    const key = v.toLowerCase()
    if (!venueCounts[key]) venueCounts[key] = { name: v, city: p.city, count: 0, id: p.venue_id || null }
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

      <div style={{ padding: '32px 20px 0', maxWidth: 520, margin: '0 auto' }}>
        <p style={{ fontSize: 12, letterSpacing: '0.12em', color: C.gold + '90', margin: '0 0 4px', fontWeight: 600 }}>Your career</p>
        <h1 style={{ fontSize: 36, fontWeight: 800, color: C.text, margin: '0 0 20px', letterSpacing: '-0.02em' }}>Career</h1>

        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 12, padding: 4, marginBottom: 20 }}>
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
              {/* Primary stat grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { icon: Calendar, label: 'Shows Played',      value: totalShows },
                  { icon: Music2,   label: 'Song Performances', value: totalSongs },
                  { icon: MapPin,   label: 'Cities',            value: totalCities },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} style={{ background: C.card, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 16, padding: '14px' }}>
                    <Icon size={16} color={C.gold} style={{ marginBottom: 8 }} />
                    <p style={{ fontSize: 32, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>{value}</p>
                    <p style={{ fontSize: 11, letterSpacing: '0.04em', color: C.muted, margin: '3px 0 0' }}>{label}</p>
                  </div>
                ))}

                {/* 4th cell: hours on stage if N ≥ 30% of shows, else first show date */}
                <div style={{ background: C.card, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 16, padding: '14px' }}>
                  <TrendingUp size={16} color={C.gold} style={{ marginBottom: 8 }} />
                  {showHours ? (
                    <>
                      <p style={{ fontSize: 32, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>{realTotalHours}</p>
                      <p style={{ fontSize: 11, letterSpacing: '0.04em', color: C.muted, margin: '3px 0 0' }}>Hours on Stage</p>
                      <p style={{ fontSize: 10, color: C.muted, margin: '2px 0 0', opacity: 0.65 }}>from {N} timed shows</p>
                    </>
                  ) : firstShowLabel ? (
                    <>
                      <p style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{firstShowLabel}</p>
                      <p style={{ fontSize: 11, letterSpacing: '0.04em', color: C.muted, margin: '4px 0 0' }}>First Show</p>
                    </>
                  ) : (
                    <>
                      <p style={{ fontSize: 32, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>—</p>
                      <p style={{ fontSize: 11, letterSpacing: '0.04em', color: C.muted, margin: '3px 0 0' }}>Hours on Stage</p>
                    </>
                  )}
                </div>
              </div>

              {/* Career Map — large visual card with Mapbox static image */}
              <button onClick={() => router.push('/app/career-map')}
                style={{
                  width: '100%', height: 160, position: 'relative', overflow: 'hidden',
                  borderRadius: 16, cursor: 'pointer', border: 'none', padding: 0, display: 'block',
                  backgroundColor: C.card,
                  backgroundImage: mapboxStaticUrl ? `url(${mapboxStaticUrl})` : 'none',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}>
                {/* Bottom gradient overlay */}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(10,9,8,0) 35%, rgba(10,9,8,0.88) 100%)' }} />
                {/* Fallback icon when no token */}
                {!mapboxStaticUrl && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MapPin size={36} color={C.gold} style={{ opacity: 0.2 }} />
                  </div>
                )}
                {/* Content */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 18px 16px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.gold, margin: '0 0 3px' }}>Career Map</p>
                    <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>{totalCities} cities · {totalShows} verified shows</p>
                  </div>
                  <span style={{ fontSize: 18, color: C.muted, lineHeight: 1 }}>→</span>
                </div>
              </button>

              {/* Lifetime royalty estimate */}
              {estimatedLifetimeRoyalty > 0 && (
                <div style={{ background: 'rgba(201,168,76,0.07)', border: '1px solid rgba(201,168,76,0.12)', borderRadius: 16, padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.muted, margin: '0 0 4px' }}>Estimated Lifetime Royalties</p>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <p style={{ fontSize: 42, fontWeight: 800, color: C.gold, margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em', lineHeight: 1 }}>
                          ~${estimatedLifetimeRoyalty.toLocaleString()}
                        </p>
                        <span style={{ fontSize: 12, color: C.muted, fontWeight: 500 }}>documented</span>
                      </div>
                      <p style={{ fontSize: 14, color: C.muted, margin: '6px 0 0', lineHeight: 1.5 }}>
                        Based on {totalSongs} song appearances across {totalShows} shows
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Intelligence row — last show + dormant */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: C.card, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 16, padding: '14px' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: C.muted, margin: '0 0 6px' }}>Last Show</p>
                  {daysSinceLastShow !== null ? (
                    <>
                      <p style={{ fontSize: 28, fontWeight: 800, color: daysSinceLastShow > 14 ? C.gold : C.text, margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>
                        {daysSinceLastShow === 0 ? 'Today' : `${daysSinceLastShow}d`}
                      </p>
                      <p style={{ fontSize: 13, color: C.muted, margin: '3px 0 0' }}>
                        {daysSinceLastShow === 0 ? 'just performed' : daysSinceLastShow === 1 ? 'yesterday' : 'since last show'}
                      </p>
                    </>
                  ) : (
                    <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>—</p>
                  )}
                </div>

                <div style={{ background: C.card, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 16, padding: '14px' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: C.muted, margin: '0 0 6px' }}>Dormant Songs</p>
                  <p style={{ fontSize: 28, fontWeight: 800, color: dormantSongs > 0 ? C.gold : C.text, margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>
                    {dormantSongs}
                  </p>
                  <p style={{ fontSize: 13, color: C.muted, margin: '3px 0 0' }}>
                    {dormantSongs === 0 ? 'all active' : 'not played in 45d+'}
                  </p>
                </div>
              </div>

              {/* Dormant callout — soft one-line text link */}
              {dormantSongs > 0 && (
                <button onClick={() => setTab('songs')}
                  style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <p style={{ fontSize: 14, color: C.secondary, margin: 0, lineHeight: 1.5 }}>
                    {dormantSongs} song{dormantSongs !== 1 ? 's' : ''} in your catalog {dormantSongs !== 1 ? "haven't" : "hasn't"} been played live in 45+ days →
                  </p>
                </button>
              )}

              {/* Shows per month */}
              <div style={{ background: C.card, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 16, padding: '16px' }}>
                <p style={{ fontSize: 13, letterSpacing: '0.04em', color: C.secondary, margin: '0 0 16px', fontWeight: 600 }}>Shows per Month</p>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 80 }}>
                  {last6Months.map(month => {
                    const count  = monthCounts[month] ?? 0
                    const height = count === 0 ? 4 : Math.max(12, (count / maxMonthCount) * 80)
                    return (
                      <div key={month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, color: count > 0 ? C.text : C.muted }}>{count || ''}</span>
                        <div style={{ width: '100%', borderRadius: '3px 3px 0 0', height: `${height}px`, background: count > 0 ? C.gold : 'rgba(255,255,255,0.05)' }} />
                        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted }}>{month.split(' ')[0]}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {topSongs.length > 0 && (
                <div style={{
                  background: 'rgba(201,168,76,0.07)',
                  border: '1px solid rgba(201,168,76,0.25)',
                  borderRadius: 16, padding: '20px',
                  marginBottom: 12,
                }}>
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.gold, margin: '0 0 12px' }}>
                    Most Played Live
                  </p>
                  <p style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                    {topSongs[0].title}
                  </p>
                  <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 16px' }}>{topSongs[0].artist}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 36, fontWeight: 800, color: C.gold, letterSpacing: '-0.02em', fontFamily: '"DM Mono", monospace' }}>
                      {topSongs[0].count}×
                    </span>
                    <span style={{ fontSize: 13, color: C.muted, lineHeight: 1.4 }}>
                      times played live.<br />Your signature song.
                    </span>
                  </div>
                </div>
              )}

              {/* Top songs */}
              {topSongs.length > 0 && (
                <div style={{ background: C.card, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 16, padding: '16px' }}>
                  <button onClick={() => setShowTopSongs(v => !v)}
                    style={{ width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showTopSongs ? 16 : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Mic2 size={14} color={C.gold} />
                      <p style={{ fontSize: 13, letterSpacing: '0.04em', color: C.secondary, margin: 0, fontWeight: 600 }}>Most Played Songs</p>
                    </div>
                    <ChevronDown size={14} color={C.muted} style={{ transition: 'transform 0.2s ease', transform: showTopSongs ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                  </button>
                  {showTopSongs && <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {topSongs.map((song, i) => (
                      <div key={song.title} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.gold, minWidth: 16, textAlign: 'right', fontFamily: '"DM Mono", monospace' }}>{i + 1}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ minWidth: 0 }}>
                              <p style={{ fontSize: 15, color: C.text, margin: 0, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</p>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1, flexWrap: 'wrap' }}>
                                {song.artist && <p style={{ fontSize: 13, color: C.secondary, margin: 0 }}>{song.artist}</p>}
                                {(song as any).avgPosition && (
                                  <span style={{ fontSize: 11, color: C.muted, background: 'rgba(255,255,255,0.04)', borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap' }}>
                                    usually #{(song as any).avgPosition}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span style={{ fontSize: 12, color: C.gold, background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 20, padding: '2px 8px', flexShrink: 0, fontFamily: '"DM Mono", monospace' }}>{song.count}×</span>
                          </div>
                          <div style={{ marginTop: 6, height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.05)' }}>
                            <div style={{ height: '100%', borderRadius: 1, width: `${(song.count / topSongs[0].count) * 100}%`, background: i === 0 ? C.gold : 'rgba(201,168,76,0.4)' }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>}
                </div>
              )}

              {/* Top venues */}
              {topVenues.length > 0 && (
                <div style={{ background: C.card, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 16, padding: '16px' }}>
                  <button onClick={() => setShowTopVenues(v => !v)}
                    style={{ width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showTopVenues ? 16 : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <MapPin size={14} color={C.gold} />
                      <p style={{ fontSize: 13, letterSpacing: '0.04em', color: C.secondary, margin: 0, fontWeight: 600 }}>Top Venues</p>
                    </div>
                    <ChevronDown size={14} color={C.muted} style={{ transition: 'transform 0.2s ease', transform: showTopVenues ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                  </button>
                  {showTopVenues && <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {topVenues.map((venue, i) => (
                      <div key={venue.name} onClick={() => { if (venue.id) router.push(`/app/venue/${venue.id}`) }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: venue.id ? 'pointer' : 'default' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: C.gold, minWidth: 16, textAlign: 'right', fontFamily: '"DM Mono", monospace' }}>{i + 1}</span>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 15, color: C.text, margin: 0, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{venue.name}</p>
                            {venue.city && <p style={{ fontSize: 13, color: C.secondary, margin: '1px 0 0' }}>{venue.city}</p>}
                          </div>
                        </div>
                        <span style={{ fontSize: 12, color: C.gold, background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 20, padding: '2px 8px', flexShrink: 0 }}>
                          {venue.count} {venue.count === 1 ? 'show' : 'shows'}
                        </span>
                      </div>
                    ))}
                  </div>}
                </div>
              )}

              {/* Song Debuts */}
              {songDebuts.length > 0 && (
                <div style={{ background: C.card, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 16, padding: '16px' }}>
                  <button onClick={() => setShowDebuts(v => !v)}
                    style={{ width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showDebuts ? 16 : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Calendar size={14} color={C.gold} />
                      <p style={{ fontSize: 13, letterSpacing: '0.04em', color: C.secondary, margin: 0, fontWeight: 600 }}>Song Debuts</p>
                    </div>
                    <ChevronDown size={14} color={C.muted} style={{ transition: 'transform 0.2s ease', transform: showDebuts ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                  </button>
                  {showDebuts && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {songDebuts.map((debut, i) => (
                      <div key={`${debut.title}-${i}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 15, color: C.text, margin: 0, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{debut.title}</p>
                          {debut.artist && <p style={{ fontSize: 13, color: C.secondary, margin: '1px 0 0' }}>{debut.artist}</p>}
                        </div>
                        <span style={{ fontSize: 12, color: C.muted, whiteSpace: 'nowrap', flexShrink: 0, fontFamily: '"DM Mono", monospace' }}>
                          {formatDebutDate(debut.first_performed_at)}
                        </span>
                      </div>
                    ))}
                  </div>}
                </div>
              )}

              {/* Performance Proof File */}
              <button onClick={() => router.push('/app/proof')}
                style={{ width: '100%', padding: '16px 20px', background: C.card, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Shield size={18} color={C.gold} style={{ flexShrink: 0 }} />
                  <div style={{ textAlign: 'left' }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: C.secondary, margin: '0 0 2px' }}>Performance Proof File</p>
                    <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Your verified career record.</p>
                  </div>
                </div>
                <span style={{ fontSize: 18, color: C.muted }}>→</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* ── My Songs tab ── */}
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
