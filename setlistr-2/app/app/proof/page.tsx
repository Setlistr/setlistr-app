'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useActingAs } from '@/components/ActingAsProvider'

const C = {
  bg: '#0a0908', card: '#141210',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)', green: '#4ade80',
}

const BASE_ROYALTY = 1.20

type Performance = {
  id: string; venue_name: string; city: string; country: string
  started_at: string; set_duration_minutes: number; status: string
  submission_status: string | null
}
type UserSong = {
  song_title: string; confirmed_count: number; last_confirmed_at: string | null
  isrc: string | null; composer: string | null; publisher: string | null
}
type PerfSong = { performance_id: string; title: string }

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateLong(d: string) {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export default function ProofPage() {
  const router = useRouter()
  const { actingAsArtistId, resolved } = useActingAs()
  const [loading, setLoading]         = useState(true)
  const [artistName, setArtistName]   = useState('')
  const [proName, setProName]         = useState('')
  const [performances, setPerformances] = useState<Performance[]>([])
  const [userSongs, setUserSongs]     = useState<UserSong[]>([])
  const [perfSongs, setPerfSongs]     = useState<PerfSong[]>([])
  const [generatedAt]                 = useState(new Date())

  useEffect(() => {
    if (!resolved) return
    const supabase = createClient()
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const targetUserId = actingAsArtistId || user.id

      const [{ data: profile }, { data: perfs }, { data: uSongs }] = await Promise.all([
        supabase.from('profiles').select('artist_name, full_name, pro_affiliation').eq('id', targetUserId).single(),
        supabase.from('performances_visible')
          .select('id, venue_name, city, country, started_at, set_duration_minutes, status, submission_status')
          .eq('user_id', targetUserId)
          .in('status', ['completed', 'complete', 'exported', 'review'])
          .order('started_at', { ascending: false }),
        supabase.from('user_songs')
          .select('song_title, confirmed_count, last_confirmed_at, isrc, composer, publisher')
          .eq('user_id', targetUserId)
          .gt('confirmed_count', 0)
          .order('confirmed_count', { ascending: false }),
      ])

      setArtistName(profile?.artist_name || profile?.full_name || 'Artist')
      setProName(profile?.pro_affiliation || '')

      const perfList = perfs || []
      setPerformances(perfList)
      setUserSongs(uSongs || [])

      if (perfList.length > 0) {
        const { data: pSongs } = await supabase
          .from('performance_songs_visible')
          .select('performance_id, title')
          .in('performance_id', perfList.map(p => p.id))
        setPerfSongs(pSongs || [])
      }

      setLoading(false)
    }
    load()
  }, [resolved, actingAsArtistId])

  // ── Derived stats ─────────────────────────────────────────────────────────
  const totalShows     = performances.length
  const submittedShows = performances.filter(p => p.submission_status === 'submitted').length
  const totalCities    = new Set(performances.map(p => p.city).filter(Boolean)).size
  const totalMinutes   = performances.reduce((s, p) => s + (p.set_duration_minutes || 0), 0)
  const totalHours     = Math.round(totalMinutes / 60 * 10) / 10

  const songCountMap: Record<string, number> = {}
  perfSongs.forEach(s => { songCountMap[s.performance_id] = (songCountMap[s.performance_id] || 0) + 1 })
  const totalSongsLogged = perfSongs.length

  const totalConfirmedPerfs = userSongs.reduce((s, u) => s + u.confirmed_count, 0)
  const estimatedRoyalties  = Math.round(totalConfirmedPerfs * BASE_ROYALTY)

  // Top songs from user_songs (most reliable count)
  const topSongs = userSongs.slice(0, 10)

  // Top venues
  const venueCounts: Record<string, { name: string; city: string; count: number }> = {}
  performances.forEach(p => {
    if (!p.venue_name) return
    const key = p.venue_name.toLowerCase()
    if (!venueCounts[key]) venueCounts[key] = { name: p.venue_name, city: p.city, count: 0 }
    venueCounts[key].count++
  })
  const topVenues = Object.values(venueCounts).sort((a, b) => b.count - a.count).slice(0, 8)

  // Metadata completeness
  const withISRC      = userSongs.filter(s => s.isrc).length
  const withComposer  = userSongs.filter(s => s.composer).length
  const withPublisher = userSongs.filter(s => s.publisher).length
  const metaScore     = userSongs.length > 0
    ? Math.round(((withISRC + withComposer + withPublisher) / (userSongs.length * 3)) * 100)
    : 0

  // Recent shows (last 20)
  const recentShows = performances.slice(0, 20)

  if (loading) return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', border: `1.5px solid ${C.gold}`, animation: 'breathe 1.8s ease-in-out infinite' }} />
        <span style={{ color: C.muted, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Building your record...</span>
      </div>
      <style>{`@keyframes breathe{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.2);opacity:.8}}`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: '100svh', background: '#0a0908', fontFamily: '"DM Sans", system-ui, sans-serif', paddingBottom: 80 }}>

      {/* NAV */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(10,9,8,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.04)', padding: 'calc(env(safe-area-inset-top) + 12px) 24px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#8a7a68', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', padding: '4px 0' }}>← Back</button>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#c9a84c', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Performance Record</span>
        <button onClick={() => window.print()} style={{ background: '#c9a84c', border: 'none', borderRadius: 8, color: '#0a0908', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: '6px 14px', letterSpacing: '0.04em' }}>Export PDF</button>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 24px' }}>

        {/* HERO — artist identity */}
        <div style={{ paddingTop: 56, paddingBottom: 48, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', color: '#c9a84c', margin: '0 0 16px', textTransform: 'uppercase' }}>Verified by Setlistr</p>
          <h1 style={{ fontSize: 48, fontWeight: 800, color: '#f0ece3', margin: '0 0 8px', letterSpacing: '-0.03em', lineHeight: 1 }}>{artistName}</h1>
          {proName && <p style={{ fontSize: 15, color: '#8a7a68', margin: '0 0 24px' }}>{proName}</p>}
          <div style={{ display: 'flex', gap: 32, marginTop: 24 }}>
            <div>
              <p style={{ fontSize: 42, fontWeight: 800, color: '#f0ece3', margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.03em', lineHeight: 1 }}>{totalShows}</p>
              <p style={{ fontSize: 13, color: '#8a7a68', margin: '6px 0 0' }}>verified shows</p>
            </div>
            <div>
              <p style={{ fontSize: 42, fontWeight: 800, color: '#f0ece3', margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.03em', lineHeight: 1 }}>{totalSongsLogged}</p>
              <p style={{ fontSize: 13, color: '#8a7a68', margin: '6px 0 0' }}>songs performed</p>
            </div>
            <div>
              <p style={{ fontSize: 42, fontWeight: 800, color: '#f0ece3', margin: 0, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.03em', lineHeight: 1 }}>{totalCities}</p>
              <p style={{ fontSize: 13, color: '#8a7a68', margin: '6px 0 0' }}>cities</p>
            </div>
          </div>
        </div>

        {/* CAREER VALUE */}
        {estimatedRoyalties > 0 && (
          <div style={{ paddingTop: 40, paddingBottom: 40, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: '#8a7a68', margin: '0 0 12px', textTransform: 'uppercase' }}>Estimated career value</p>
            <p style={{ fontSize: 36, fontWeight: 800, color: '#c9a84c', margin: '0 0 6px', fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>~${estimatedRoyalties.toLocaleString()}</p>
            <p style={{ fontSize: 14, color: '#8a7a68', margin: 0 }}>across {totalShows} verified live performances</p>
            <p style={{ fontSize: 11, color: '#5a5040', margin: '6px 0 0' }}>Estimate only, not guaranteed — actual payouts vary by PRO.</p>
            {submittedShows > 0 && (
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1 }}>
                  <div style={{ height: '100%', borderRadius: 1, background: '#4ade80', width: `${Math.min(100, Math.round((submittedShows / totalShows) * 100))}%` }} />
                </div>
                <p style={{ fontSize: 13, color: '#4ade80', margin: 0, flexShrink: 0 }}>{submittedShows} filed</p>
              </div>
            )}
          </div>
        )}

        {/* TOP SONGS */}
        {topSongs.length > 0 && (
          <div style={{ paddingTop: 40, paddingBottom: 40, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: '#8a7a68', margin: '0 0 24px', textTransform: 'uppercase' }}>Most performed</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {topSongs.map((song, i) => (
                <div key={song.song_title} style={{ display: 'flex', alignItems: 'baseline', gap: 16, padding: '12px 0', borderBottom: i < topSongs.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <span style={{ fontSize: 12, color: '#c9a84c', fontFamily: '"DM Mono", monospace', minWidth: 20, flexShrink: 0 }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 16, fontWeight: 600, color: '#f0ece3', margin: '0 0 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.song_title}</p>
                    {song.isrc && <p style={{ fontSize: 12, color: '#8a7a68', margin: 0, fontFamily: '"DM Mono", monospace' }}>{song.isrc}</p>}
                  </div>
                  <span style={{ fontSize: 13, color: '#8a7a68', fontFamily: '"DM Mono", monospace', flexShrink: 0 }}>{song.confirmed_count}×</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TOP VENUES */}
        {topVenues.length > 0 && (
          <div style={{ paddingTop: 40, paddingBottom: 40, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: '#8a7a68', margin: '0 0 24px', textTransform: 'uppercase' }}>Venues</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {topVenues.map((venue, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: i < topVenues.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 600, color: '#f0ece3', margin: '0 0 3px' }}>{venue.name}</p>
                    <p style={{ fontSize: 13, color: '#8a7a68', margin: 0 }}>{venue.city}</p>
                  </div>
                  <span style={{ fontSize: 13, color: '#8a7a68', fontFamily: '"DM Mono", monospace' }}>{venue.count} show{venue.count !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SHOW LOG */}
        <div style={{ paddingTop: 40, paddingBottom: 40, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: '#8a7a68', margin: '0 0 24px', textTransform: 'uppercase' }}>Show history</p>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {recentShows.map((show, i) => {
              const d = new Date(show.started_at)
              const songCount = songCountMap[show.id] || 0
              return (
                <div key={show.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '11px 0', borderBottom: i < recentShows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <div style={{ minWidth: 48, flexShrink: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: '#f0ece3', margin: 0, fontFamily: '"DM Mono", monospace' }}>{d.getDate()}</p>
                    <p style={{ fontSize: 10, color: '#8a7a68', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}</p>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#f0ece3', margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{show.venue_name}</p>
                    <p style={{ fontSize: 12, color: '#8a7a68', margin: 0 }}>{show.city}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                    <span style={{ fontSize: 13, color: '#8a7a68', fontFamily: '"DM Mono", monospace' }}>{songCount} songs</span>
                    {show.submission_status === 'submitted' && <span style={{ fontSize: 10, color: '#4ade80', fontWeight: 600, letterSpacing: '0.06em' }}>FILED</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* METADATA HEALTH */}
        {userSongs.length > 0 && (
          <div style={{ paddingTop: 40, paddingBottom: 40, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', color: '#8a7a68', margin: '0 0 6px', textTransform: 'uppercase' }}>Catalog health</p>
            <p style={{ fontSize: 13, color: '#8a7a68', margin: '0 0 20px' }}>{userSongs.length} songs in catalog</p>
            <div style={{ display: 'flex', gap: 0 }}>
              {[
                { label: 'Have ISRC', value: withISRC },
                { label: 'Composer',  value: withComposer },
                { label: 'Publisher', value: withPublisher },
              ].map((item, i) => (
                <div key={i} style={{ flex: 1, paddingRight: i < 2 ? 24 : 0, borderRight: i < 2 ? '1px solid rgba(255,255,255,0.05)' : 'none', paddingLeft: i > 0 ? 24 : 0 }}>
                  <p style={{ fontSize: 28, fontWeight: 800, color: '#f0ece3', margin: '0 0 4px', fontFamily: '"DM Mono", monospace' }}>{item.value}</p>
                  <p style={{ fontSize: 12, color: '#8a7a68', margin: 0 }}>{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FOOTER */}
        <div style={{ paddingTop: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#c9a84c', margin: '0 0 4px', letterSpacing: '0.1em' }}>SETLISTR</p>
            <p style={{ fontSize: 12, color: '#8a7a68', margin: 0 }}>Verified live performance record</p>
          </div>
          <p style={{ fontSize: 12, color: '#8a7a68', fontFamily: '"DM Mono", monospace' }}>{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
        </div>

      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
      `}</style>
    </div>
  )
}
