'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
  const [loading, setLoading]         = useState(true)
  const [artistName, setArtistName]   = useState('')
  const [proName, setProName]         = useState('')
  const [performances, setPerformances] = useState<Performance[]>([])
  const [userSongs, setUserSongs]     = useState<UserSong[]>([])
  const [perfSongs, setPerfSongs]     = useState<PerfSong[]>([])
  const [generatedAt]                 = useState(new Date())

  useEffect(() => {
    const supabase = createClient()
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }

      const [{ data: profile }, { data: perfs }, { data: uSongs }] = await Promise.all([
        supabase.from('profiles').select('artist_name, full_name, pro_affiliation').eq('id', user.id).single(),
        supabase.from('performances')
          .select('id, venue_name, city, country, started_at, set_duration_minutes, status, submission_status')
          .eq('user_id', user.id)
          .in('status', ['completed', 'complete', 'exported', 'review'])
          .order('started_at', { ascending: false }),
        supabase.from('user_songs')
          .select('song_title, confirmed_count, last_confirmed_at, isrc, composer, publisher')
          .eq('user_id', user.id)
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
          .from('performance_songs')
          .select('performance_id, title')
          .in('performance_id', perfList.map(p => p.id))
        setPerfSongs(pSongs || [])
      }

      setLoading(false)
    }
    load()
  }, [])

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

  // Recent shows (last 10)
  const recentShows = performances.slice(0, 10)

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
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>

      {/* Print styles */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes breathe { 0%,100%{transform:scale(1);opacity:.3} 50%{transform:scale(1.2);opacity:.8} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; color: #000 !important; }
          .print-page { background: #fff !important; color: #000 !important; padding: 0 !important; }
          .print-card { background: #f8f8f8 !important; border-color: #ddd !important; }
          .print-gold { color: #8B6914 !important; }
          .print-muted { color: #666 !important; }
          .print-text { color: #000 !important; }
          .print-green { color: #16a34a !important; }
        }
      `}</style>

      {/* ── Nav bar ── */}
      <div className="no-print" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'rgba(10,9,8,0.9)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${C.border}`, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
          ← Back
        </button>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.gold, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Performance Record</span>
        <button
          onClick={() => window.print()}
          style={{ padding: '8px 16px', background: C.gold, border: 'none', borderRadius: 8, color: '#0a0908', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Download PDF
        </button>
      </div>

      <div className="print-page" style={{ maxWidth: 680, margin: '0 auto', padding: '32px 20px 80px' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 32, animation: 'fadeUp 0.4s ease' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, marginBottom: 16 }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.gold, margin: '0 0 6px' }} className="print-gold">Verified by Setlistr</p>
              <h1 style={{ fontSize: 36, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.025em', lineHeight: 1 }} className="print-text">{artistName}</h1>
              <p style={{ fontSize: 14, color: C.muted, margin: 0 }} className="print-muted">
                Live Performance Record{proName ? ` · ${proName}` : ''}
              </p>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p style={{ fontSize: 10, color: C.muted, margin: '0 0 2px', fontFamily: '"DM Mono", monospace' }} className="print-muted">Generated</p>
              <p style={{ fontSize: 12, fontWeight: 600, color: C.secondary, margin: 0 }} className="print-text">{formatDateLong(generatedAt.toISOString())}</p>
            </div>
          </div>

          <div style={{ height: 1, background: `linear-gradient(to right, rgba(201,168,76,0.5), transparent)` }} />
        </div>

        {/* ── Career summary ── */}
        <div style={{ marginBottom: 24, animation: 'fadeUp 0.4s 0.05s ease both' }}>
          <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.muted, margin: '0 0 12px' }} className="print-muted">Career Summary</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[
              { label: 'Verified Shows',     value: totalShows,                  highlight: true  },
              { label: 'Songs Logged',       value: totalSongsLogged,            highlight: false },
              { label: 'Cities Performed',   value: totalCities,                 highlight: false },
              { label: 'Hours on Stage',     value: totalHours,                  highlight: false },
              { label: 'Shows Submitted',    value: submittedShows,              highlight: false },
              { label: 'Est. Career Value',  value: `~$${estimatedRoyalties.toLocaleString()}`, highlight: true  },
            ].map(({ label, value, highlight }) => (
              <div key={label} className="print-card" style={{ background: highlight ? 'rgba(201,168,76,0.07)' : C.card, border: `1px solid ${highlight ? 'rgba(201,168,76,0.25)' : C.border}`, borderRadius: 12, padding: '14px 16px' }}>
                <p style={{ fontSize: typeof value === 'string' ? 20 : 26, fontWeight: 800, color: highlight ? C.gold : C.text, margin: '0 0 3px', fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em', lineHeight: 1 }} className={highlight ? 'print-gold' : 'print-text'}>{value}</p>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, margin: 0 }} className="print-muted">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Top songs ── */}
        {topSongs.length > 0 && (
          <div style={{ marginBottom: 24, animation: 'fadeUp 0.4s 0.08s ease both' }}>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.muted, margin: '0 0 12px' }} className="print-muted">Most Performed Songs</p>
            <div className="print-card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
              {topSongs.map((song, i) => (
                <div key={song.song_title} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 18px', borderBottom: i < topSongs.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.gold, minWidth: 20, textAlign: 'right', fontFamily: '"DM Mono", monospace', flexShrink: 0 }} className="print-gold">{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} className="print-text">{song.song_title}</p>
                    <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                      {song.isrc && <span style={{ fontSize: 9, color: C.green, fontFamily: '"DM Mono", monospace' }} className="print-green">ISRC ✓</span>}
                      {song.composer && <span style={{ fontSize: 9, color: C.muted }} className="print-muted">{song.composer}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <div style={{ width: Math.max(20, (song.confirmed_count / topSongs[0].confirmed_count) * 80), height: 3, background: i === 0 ? C.gold : 'rgba(201,168,76,0.35)', borderRadius: 2 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.gold, fontFamily: '"DM Mono", monospace', minWidth: 28, textAlign: 'right' }} className="print-gold">{song.confirmed_count}×</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Top venues ── */}
        {topVenues.length > 0 && (
          <div style={{ marginBottom: 24, animation: 'fadeUp 0.4s 0.1s ease both' }}>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.muted, margin: '0 0 12px' }} className="print-muted">Top Venues</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {topVenues.map((venue, i) => (
                <div key={venue.name} className="print-card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.gold, minWidth: 16, fontFamily: '"DM Mono", monospace', flexShrink: 0 }} className="print-gold">{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} className="print-text">{venue.name}</p>
                    <p style={{ fontSize: 10, color: C.muted, margin: '1px 0 0' }} className="print-muted">{venue.city}</p>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.gold, flexShrink: 0, fontFamily: '"DM Mono", monospace' }} className="print-gold">{venue.count}×</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Recent show log ── */}
        {recentShows.length > 0 && (
          <div style={{ marginBottom: 24, animation: 'fadeUp 0.4s 0.12s ease both' }}>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.muted, margin: '0 0 12px' }} className="print-muted">Recent Show Log</p>
            <div className="print-card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 80px 70px', padding: '8px 18px', borderBottom: `1px solid ${C.border}` }}>
                {['Date', 'Venue', 'City', 'Songs'].map(h => (
                  <p key={h} style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, margin: 0 }} className="print-muted">{h}</p>
                ))}
              </div>
              {recentShows.map((p, i) => {
                const songCount = songCountMap[p.id] || 0
                const isSubmitted = p.submission_status === 'submitted'
                return (
                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 80px 70px', padding: '10px 18px', borderBottom: i < recentShows.length - 1 ? `1px solid ${C.border}` : 'none', alignItems: 'center' }}>
                    <p style={{ fontSize: 11, color: C.secondary, margin: 0, fontFamily: '"DM Mono", monospace' }} className="print-muted">{formatDate(p.started_at)}</p>
                    <p style={{ fontSize: 12, fontWeight: 600, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 8 }} className="print-text">{p.venue_name}</p>
                    <p style={{ fontSize: 11, color: C.secondary, margin: 0 }} className="print-muted">{p.city}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: C.text, fontFamily: '"DM Mono", monospace' }} className="print-text">{songCount}</span>
                      {isSubmitted && <span style={{ fontSize: 8, fontWeight: 700, color: C.green, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 4, padding: '1px 4px', letterSpacing: '0.06em' }} className="print-green">FILED</span>}
                    </div>
                  </div>
                )
              })}
            </div>
            {performances.length > 10 && (
              <p style={{ fontSize: 11, color: C.muted, margin: '8px 0 0', textAlign: 'center' }} className="print-muted">+{performances.length - 10} additional shows in record</p>
            )}
          </div>
        )}

        {/* ── Metadata completeness ── */}
        {userSongs.length > 0 && (
          <div style={{ marginBottom: 24, animation: 'fadeUp 0.4s 0.14s ease both' }}>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.muted, margin: '0 0 12px' }} className="print-muted">Royalty Metadata Health</p>
            <div className="print-card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <p style={{ fontSize: 13, color: C.secondary, margin: 0 }} className="print-muted">{userSongs.length} songs in catalog</p>
                <span style={{ fontSize: 16, fontWeight: 800, color: metaScore >= 80 ? C.green : metaScore >= 50 ? C.gold : C.muted, fontFamily: '"DM Mono", monospace' }} className={metaScore >= 80 ? 'print-green' : 'print-gold'}>{metaScore}% complete</span>
              </div>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginBottom: 16, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 2, width: `${metaScore}%`, background: metaScore >= 80 ? C.green : C.gold, transition: 'width 0.6s ease' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Have ISRC',      value: withISRC,      total: userSongs.length },
                  { label: 'Have Composer',   value: withComposer,  total: userSongs.length },
                  { label: 'Have Publisher',  value: withPublisher, total: userSongs.length },
                ].map(({ label, value, total }) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 20, fontWeight: 800, color: value === total ? C.green : C.gold, margin: 0, fontFamily: '"DM Mono", monospace' }} className={value === total ? 'print-green' : 'print-gold'}>{value}</p>
                    <p style={{ fontSize: 9, color: C.muted, margin: '2px 0 0', letterSpacing: '0.08em', textTransform: 'uppercase' }} className="print-muted">{label}</p>
                    <p style={{ fontSize: 9, color: C.muted, margin: '1px 0 0', opacity: 0.6 }} className="print-muted">of {total}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', animation: 'fadeUp 0.4s 0.16s ease both' }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: C.gold, margin: '0 0 2px' }} className="print-gold">Setlistr</p>
            <p style={{ fontSize: 10, color: C.muted, margin: 0 }} className="print-muted">Verified Live Performance Intelligence</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 10, color: C.muted, margin: '0 0 1px', fontFamily: '"DM Mono", monospace' }} className="print-muted">setlistr.ai</p>
            <p style={{ fontSize: 10, color: C.muted, margin: 0 }} className="print-muted">Generated {generatedAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          </div>
        </div>

      </div>
    </div>
  )
}
