import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Props = { params: { id: string } }

async function getPerformanceData(id: string) {
  const { data: perf } = await supabaseAdmin
    .from('performances')
    .select('id, artist_name, venue_name, city, country, started_at, status')
    .eq('id', id)
    .in('status', ['review', 'complete', 'completed', 'exported'])
    .single()

  if (!perf) return null

  const { data: songs } = await supabaseAdmin
    .from('performance_songs')
    .select('title, artist, position')
    .eq('performance_id', id)
    .not('title', 'is', null)
    .order('position')

  return { perf, songs: songs || [] }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getPerformanceData(params.id)
  if (!data) return { title: 'Setlistr' }
  const { perf, songs } = data
  const date = new Date(perf.started_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  return {
    title: `${perf.artist_name} at ${perf.venue_name} · Setlistr`,
    description: `${songs.length} songs performed at ${perf.venue_name}${perf.city ? `, ${perf.city}` : ''} on ${date}. Captured with Setlistr.`,
    openGraph: {
      title: `${perf.artist_name} at ${perf.venue_name}`,
      description: `${songs.length} songs · ${date}${perf.city ? ` · ${perf.city}` : ''}`,
      siteName: 'Setlistr',
    },
    twitter: {
      card: 'summary',
      title: `${perf.artist_name} at ${perf.venue_name}`,
      description: `${songs.length} songs · ${date}`,
    },
  }
}

export default async function SharePage({ params }: Props) {
  const data = await getPerformanceData(params.id)
  if (!data) notFound()

  const { perf, songs } = data
  const date = new Date(perf.started_at)
  const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const confirmedSongs = songs.filter(s => s.title && s.title.trim())

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { background: #0a0908; }
        body { background: #0a0908; font-family: "DM Sans", system-ui, sans-serif; min-height: 100vh; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer { 0%{opacity:0.4} 50%{opacity:1} 100%{opacity:0.4} }
      `}</style>

      <div style={{ minHeight: '100vh', background: '#0a0908', position: 'relative', overflow: 'hidden' }}>

        {/* Background glow */}
        <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '60vh', background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.09) 0%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />
        <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '80vw', height: '30vh', background: 'radial-gradient(ellipse at 50% 100%, rgba(201,168,76,0.04) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 520, margin: '0 auto', padding: '0 20px 60px' }}>

          {/* ── Header / Nav ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 0 40px' }}>
            <a href="https://setlistr.ai" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M9 18V5l12-2v13" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="6" cy="18" r="3" stroke="#c9a84c" strokeWidth="2"/>
                  <circle cx="18" cy="16" r="3" stroke="#c9a84c" strokeWidth="2"/>
                </svg>
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#c9a84c', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Setlistr</span>
            </a>
            <a href="https://setlistr.ai" style={{ textDecoration: 'none', fontSize: 12, color: '#8a7a68', fontWeight: 600, letterSpacing: '0.06em', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '6px 14px', transition: 'all 0.15s ease' }}>
              Track your shows →
            </a>
          </div>

          {/* ── Hero ── */}
          <div style={{ marginBottom: 36, animation: 'fadeUp 0.4s ease' }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(201,168,76,0.7)', margin: '0 0 10px' }}>
              Live Performance
            </p>
            <h1 style={{ fontSize: 36, fontWeight: 800, color: '#f0ece3', margin: '0 0 6px', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              {perf.artist_name}
            </h1>
            <p style={{ fontSize: 18, fontWeight: 600, color: '#b8a888', margin: '0 0 8px', letterSpacing: '-0.01em' }}>
              {perf.venue_name}{perf.city ? ` · ${perf.city}` : ''}
            </p>
            <p style={{ fontSize: 13, color: '#8a7a68', margin: 0 }}>{dateStr}</p>
          </div>

          {/* ── Stats bar ── */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 28, animation: 'fadeUp 0.45s ease' }}>
            <div style={{ flex: 1, background: '#141210', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px', textAlign: 'center' }}>
              <p style={{ fontSize: 28, fontWeight: 800, color: '#c9a84c', margin: '0 0 2px', fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>{confirmedSongs.length}</p>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#8a7a68', margin: 0, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Songs</p>
            </div>
            {perf.city && (
              <div style={{ flex: 1, background: '#141210', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px', textAlign: 'center' }}>
                <p style={{ fontSize: 20, fontWeight: 800, color: '#f0ece3', margin: '0 0 2px', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{perf.city}</p>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#8a7a68', margin: 0, letterSpacing: '0.1em', textTransform: 'uppercase' }}>City</p>
              </div>
            )}
            <div style={{ flex: 1, background: '#141210', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px', textAlign: 'center' }}>
              <p style={{ fontSize: 20, fontWeight: 800, color: '#f0ece3', margin: '0 0 2px', letterSpacing: '-0.02em' }}>
                {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#8a7a68', margin: 0, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Date</p>
            </div>
          </div>

          {/* ── Setlist ── */}
          <div style={{ animation: 'fadeUp 0.5s ease' }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#8a7a68', margin: '0 0 12px' }}>
              Setlist
            </p>

            {confirmedSongs.length === 0 ? (
              <div style={{ background: '#141210', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '40px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: 14, color: '#8a7a68', margin: 0 }}>Setlist not yet available</p>
              </div>
            ) : (
              <div style={{ background: '#141210', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' }}>
                {confirmedSongs.map((song, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    padding: '14px 20px',
                    borderBottom: i < confirmedSongs.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#c9a84c', minWidth: 22, textAlign: 'right', fontFamily: '"DM Mono", monospace', opacity: 0.7 }}>
                      {i + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 15, fontWeight: 600, color: '#f0ece3', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {song.title}
                      </p>
                      {song.artist && song.artist !== perf.artist_name && (
                        <p style={{ fontSize: 11, color: '#8a7a68', margin: '2px 0 0' }}>{song.artist}</p>
                      )}
                    </div>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(201,168,76,0.4)', flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── CTA Footer ── */}
          <div style={{ marginTop: 40, animation: 'fadeUp 0.55s ease' }}>
            <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 16, padding: '24px 20px', textAlign: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                    <path d="M9 18V5l12-2v13" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="6" cy="18" r="3" stroke="#c9a84c" strokeWidth="2"/>
                    <circle cx="18" cy="16" r="3" stroke="#c9a84c" strokeWidth="2"/>
                  </svg>
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#c9a84c', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Setlistr</span>
              </div>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#f0ece3', margin: '0 0 6px', letterSpacing: '-0.01em' }}>
                Capture your setlist. Claim your royalties.
              </p>
              <p style={{ fontSize: 13, color: '#8a7a68', margin: '0 0 18px', lineHeight: 1.5 }}>
                Setlistr automatically tracks what you play live and helps you collect performance royalties from your PRO.
              </p>
              <a href="https://setlistr.ai" style={{ display: 'inline-block', textDecoration: 'none', background: '#c9a84c', borderRadius: 10, padding: '12px 28px', color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Start Tracking Free →
              </a>
            </div>
          </div>

          {/* ── Bottom nav ── */}
          <div style={{ marginTop: 28, textAlign: 'center' }}>
            <p style={{ fontSize: 11, color: '#6a6050', margin: 0 }}>
              Captured with{' '}
              <a href="https://setlistr.ai" style={{ color: '#c9a84c', textDecoration: 'none', fontWeight: 600 }}>Setlistr</a>
              {' '}· Live performance tracking for artists
            </p>
          </div>

        </div>
      </div>
    </>
  )
}
