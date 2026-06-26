'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Music2, MapPin, Calendar, TrendingUp, Mic2, AlertCircle, Shield } from 'lucide-react'
import MySongsTab from '@/components/MySongsTab'

const C = {
  bg: '#0a0908', card: '#141210',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.25)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)', green: '#4ade80',
}

const ACTING_AS_KEY = 'setlistr_acting_as'

const BASE_ROYALTY = 1.20

type Song        = { title: string; artist: string }
type Performance = { id: string; venue_name: string; venue_id: string | null; city: string; country: string; started_at: string; set_duration_minutes: number }
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

export default function StatsPage() {
  const router = useRouter()
  const [tab, setTab]                   = useState<'stats' | 'songs'>('stats')
  const [performances, setPerformances] = useState<Performance[]>([])
  const [allSongs, setAllSongs]         = useState<Song[]>([])
  const [userSongs, setUserSongs]       = useState<UserSong[]>([])
  const [userId, setUserId]             = useState<string | null>(null)
  const [songDebuts, setSongDebuts]     = useState<SongDebut[]>([])
  const [loading, setLoading]           = useState(true)

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
          )
          setPerformances(perfList)
          setUserSongs([])
        }
        if (!debutData.error) setSongDebuts(debutData.debuts || [])
      } else {
        const [perfsResult, uSongsResult, debutRes] = await Promise.all([
          supabase.from('performances')
            .select('id, venue_name, venue_id, city, country, started_at, set_duration_minutes')
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
        perfList = perfsResult.data || []
        setPerformances(perfList)
        setUserSongs(uSongsResult.data || [])
        if (!debutData.error) setSongDebuts(debutData.debuts || [])
      }

      if (perfList.length > 0) {
        const { data: songs } = await supabase.from('performance_songs')
          .select('title, artist, position').in('performance_id', perfList.map(p => p.id))
        setAllSongs(songs || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  // ── Derived stats ─────────────────────────────────────────────────────────
  const totalShows   = performances.length
  const totalSongs   = allSongs.length
  const totalCities  = new Set(performances.map(p => p.city).filter(Boolean)).size
  const totalMinutes = performances.reduce((s, p) => s + (p.set_duration_minutes ?? 0), 0)
  const totalHours   = Math.round(totalMinutes / 60 * 10) / 10

  const lastShow     = performances.length > 0 ? performances[0] : null
  const daysSinceLastShow = lastShow
    ? Math.floor((Date.now() - new Date(lastShow.started_at).getTime()) / 86400000)
    : null

  const dormantSongs = userSongs.filter(s => {
    if (!s.last_confirmed_at || s.confirmed_count === 0) return false
    const days = Math.floor((Date.now() - new Date(s.last_confirmed_at).getTime()) / 86400000)
    return days > 45
  }).length

  const totalConfirmedPerformances = userSongs.reduce((sum, s) => sum + (s.confirmed_count || 0), 0)
  const estimatedLifetimeRoyalty   = Math.round(totalConfirmedPerformances * BASE_ROYALTY)

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
        <h1 style={{ fontSize: 36, fontWeight: 800, color: C.text, margin: '0 0 20px', letterSpacing: '-0.02em' }}>Stats</h1>

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
                  { icon: Calendar,   label: 'Shows Played',   value: totalShows },
                  { icon: Music2,     label: 'Songs Logged',   value: totalSongs },
                  { icon: MapPin,     label: 'Cities',         value: totalCities },
                  { icon: TrendingUp, label: 'Hours on Stage', value: totalHours },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} style={{ background: C.card, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 14, padding: '14px' }}>
                    <Icon size={16} color={C.gold} style={{ marginBottom: 8 }} />
                    <p style={{ fontSize: 32, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>{value}</p>
                    <p style={{ fontSize: 11, letterSpacing: '0.04em', color: C.muted, margin: '3px 0 0' }}>{label}</p>
                  </div>
                ))}
              </div>

              {/* Lifetime royalty estimate */}
              {estimatedLifetimeRoyalty > 0 && (
                <div style={{ background: 'rgba(201,168,76,0.07)', border: '1px solid rgba(201,168,76,0.12)', borderRadius: 14, padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.muted, margin: '0 0 4px' }}>Estimated Lifetime Royalties</p>
                      <p style={{ fontSize: 42, fontWeight: 800, color: C.gold, margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em', lineHeight: 1 }}>
                        ~${estimatedLifetimeRoyalty.toLocaleString()}
                      </p>
                      <p style={{ fontSize: 14, color: C.muted, margin: '6px 0 0', lineHeight: 1.5 }}>
                        Based on {totalConfirmedPerformances} verified song performances across {totalShows} shows
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Intelligence row — last show + dormant */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: C.card, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 14, padding: '14px' }}>
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

                <div style={{ background: C.card, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 14, padding: '14px' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: C.muted, margin: '0 0 6px' }}>Dormant Songs</p>
                  <p style={{ fontSize: 28, fontWeight: 800, color: dormantSongs > 0 ? C.gold : C.text, margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>
                    {dormantSongs}
                  </p>
                  <p style={{ fontSize: 13, color: C.muted, margin: '3px 0 0' }}>
                    {dormantSongs === 0 ? 'all active' : `not played in 45d+`}
                  </p>
                </div>
              </div>

              {/* Dormant song callout */}
              {dormantSongs > 0 && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.12)', borderRadius: 12 }}>
                  <AlertCircle size={14} color={C.gold} style={{ marginTop: 1, flexShrink: 0 }} />
                  <p style={{ fontSize: 14, color: C.secondary, margin: 0, lineHeight: 1.6 }}>
                    You have {dormantSongs} song{dormantSongs !== 1 ? 's' : ''} that {dormantSongs !== 1 ? 'haven\'t' : 'hasn\'t'} been played in over 45 days. Check My Songs to see which ones.
                  </p>
                </div>
              )}

              {/* Shows per month */}
              <div style={{ background: C.card, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 14, padding: '16px' }}>
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
                <div style={{ background: C.card, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 14, padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <Mic2 size={14} color={C.gold} />
                    <p style={{ fontSize: 13, letterSpacing: '0.04em', color: C.secondary, margin: 0, fontWeight: 600 }}>Most Played Songs</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                  </div>
                </div>
              )}

              {/* Top venues */}
              {topVenues.length > 0 && (
                <div style={{ background: C.card, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 14, padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <MapPin size={14} color={C.gold} />
                    <p style={{ fontSize: 13, letterSpacing: '0.04em', color: C.secondary, margin: 0, fontWeight: 600 }}>Top Venues</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                  </div>
                </div>
              )}

              {/* Song Debuts */}
              {songDebuts.length > 0 && (
                <div style={{ background: C.card, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 14, padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <Calendar size={14} color={C.gold} />
                    <p style={{ fontSize: 13, letterSpacing: '0.04em', color: C.secondary, margin: 0, fontWeight: 600 }}>Song Debuts</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                  </div>
                </div>
              )}

              {/* Performance Proof File */}
              <button onClick={() => router.push('/app/proof')}
                style={{ width: '100%', padding: '16px 20px', background: C.card, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
