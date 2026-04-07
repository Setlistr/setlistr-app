import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Image from 'next/image'

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
  const ogImage = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://setlistr.ai'}/api/og/setlist/${params.id}`
  return {
    title: `${perf.artist_name} at ${perf.venue_name} · Setlistr`,
    description: `${songs.length} songs performed at ${perf.venue_name}${perf.city ? `, ${perf.city}` : ''} on ${date}. Captured with Setlistr.`,
    openGraph: {
      title: `${perf.artist_name} at ${perf.venue_name}`,
      description: `${songs.length} songs · ${date}${perf.city ? ` · ${perf.city}` : ''}`,
      siteName: 'Setlistr',
      images: [{ url: ogImage, width: 1080, height: 1920 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${perf.artist_name} at ${perf.venue_name}`,
      description: `${songs.length} songs · ${date}`,
      images: [ogImage],
    },
  }
}

export default async function SharePage({ params }: Props) {
  const data = await getPerformanceData(params.id)
  if (!data) notFound()

  const { perf, songs } = data
  const date = new Date(perf.started_at)
  const dateStr = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const confirmedSongs = songs.filter(s => s.title?.trim())
  const cardUrl = `/api/og/setlist/${params.id}`

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { background: #0a0908; }
        body { background: #0a0908; font-family: "DM Sans", system-ui, sans-serif; min-height: 100vh; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        a { color: inherit; text-decoration: none; }
      `}</style>

      <div style={{ minHeight: '100vh', background: '#0a0908', position: 'relative', overflow: 'hidden' }}>

        {/* Background glows */}
        <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '60vh', background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.09) 0%, transparent 65%)', pointerEvents: 'none', zIndex: 0 }} />
        <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '80vw', height: '30vh', background: 'radial-gradient(ellipse at 50% 100%, rgba(201,168,76,0.04) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 520, margin: '0 auto', padding: '0 20px 60px' }}>

          {/* Nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 0 40px' }}>
            <a href="https://setlistr.ai">
              <Image src="/logo-white.png" alt="Setlistr" width={120} height={30} style={{ objectFit: 'contain', objectPosition: 'left' }} />
            </a>
            <a href="https://setlistr.ai" style={{ fontSize: '12px', color: '#8a7a68', fontWeight: 600, letterSpacing: '0.06em', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '6px 14px' }}>
              Track your shows →
            </a>
          </div>

          {/* Hero */}
          <div style={{ marginBottom: '36px', animation: 'fadeUp 0.4s ease' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(201,168,76,0.7)', margin: '0 0 10px' }}>
              Live Performance
            </p>
            <h1 style={{ fontSize: '36px', fontWeight: 800, color: '#f0ece3', margin: '0 0 6px', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              {perf.artist_name}
            </h1>
            <p style={{ fontSize: '18px', fontWeight: 600, color: '#b8a888', margin: '0 0 8px', letterSpacing: '-0.01em' }}>
              {perf.venue_name}{perf.city ? ` · ${perf.city}` : ''}
            </p>
            <p style={{ fontSize: '13px', color: '#8a7a68', margin: 0 }}>{dateStr}</p>
          </div>

          {/* Stats bar */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '28px', animation: 'fadeUp 0.45s ease' }}>
            <div style={{ flex: 1, background: '#141210', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
              <p style={{ fontSize: '28px', fontWeight: 800, color: '#c9a84c', margin: '0 0 2px', fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>{confirmedSongs.length}</p>
              <p style={{ fontSize: '10px', fontWeight: 700, color: '#8a7a68', margin: 0, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Songs</p>
            </div>
            {perf.city && (
              <div style={{ flex: 1, background: '#141210', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                <p style={{ fontSize: '20px', fontWeight: 800, color: '#f0ece3', margin: '0 0 2px', letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{perf.city}</p>
                <p style={{ fontSize: '10px', fontWeight: 700, color: '#8a7a68', margin: 0, letterSpacing: '0.1em', textTransform: 'uppercase' }}>City</p>
              </div>
            )}
            <div style={{ flex: 1, background: '#141210', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
              <p style={{ fontSize: '20px', fontWeight: 800, color: '#f0ece3', margin: '0 0 2px', letterSpacing: '-0.02em' }}>
                {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
              <p style={{ fontSize: '10px', fontWeight: 700, color: '#8a7a68', margin: 0, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Date</p>
            </div>
          </div>

          {/* Save Card CTA */}
          <div style={{ marginBottom: '28px', animation: 'fadeUp 0.47s ease' }}>
            <a
              href={cardUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: '100%', padding: '16px', background: '#c9a84c', borderRadius: '14px', color: '#0a0908', fontSize: '14px', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0a0908" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Save Setlist Card
            </a>
            <p style={{ fontSize: '11px', color: '#6a6050', textAlign: 'center', marginTop: '8px' }}>
              Opens image · long press to save · share to Instagram, Twitter, anywhere
            </p>
          </div>

          {/* Setlist */}
          <div style={{ animation: 'fadeUp 0.5s ease' }}>
            <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#8a7a68', margin: '0 0 12px' }}>
              Setlist
            </p>

            {confirmedSongs.length === 0 ? (
              <div style={{ background: '#141210', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '40px 20px', textAlign: 'center' }}>
                <p style={{ fontSize: '14px', color: '#8a7a68', margin: 0 }}>Setlist not yet available</p>
              </div>
            ) : (
              <div style={{ background: '#141210', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', overflow: 'hidden' }}>
                {confirmedSongs.map((song, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 20px', borderBottom: i < confirmedSongs.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#c9a84c', minWidth: '22px', textAlign: 'right', fontFamily: '"DM Mono", monospace', opacity: 0.7 }}>
                      {i + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '15px', fontWeight: 600, color: '#f0ece3', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {song.title}
                      </p>
                      {song.artist && song.artist !== perf.artist_name && (
                        <p style={{ fontSize: '11px', color: '#8a7a68', margin: '2px 0 0' }}>{song.artist}</p>
                      )}
                    </div>
                    <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(201,168,76,0.4)', flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* CTA Footer */}
          <div style={{ marginTop: '40px', animation: 'fadeUp 0.55s ease' }}>
            <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: '16px', padding: '24px 20px', textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                <Image src="/logo-white.png" alt="Setlistr" width={100} height={25} style={{ objectFit: 'contain' }} />
              </div>
              <p style={{ fontSize: '15px', fontWeight: 700, color: '#f0ece3', margin: '0 0 6px', letterSpacing: '-0.01em' }}>
                Capture your setlist. Claim your royalties.
              </p>
              <p style={{ fontSize: '13px', color: '#8a7a68', margin: '0 0 18px', lineHeight: 1.5 }}>
                Setlistr automatically tracks what you play live and helps you collect performance royalties from your PRO.
              </p>
              <a href="https://setlistr.ai" style={{ display: 'inline-block', background: '#c9a84c', borderRadius: '10px', padding: '12px 28px', color: '#0a0908', fontSize: '13px', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Start Tracking Free →
              </a>
            </div>
          </div>

          {/* Bottom */}
          <div style={{ marginTop: '28px', textAlign: 'center' }}>
            <p style={{ fontSize: '11px', color: '#6a6050', margin: 0 }}>
              Captured with{' '}
              <a href="https://setlistr.ai" style={{ color: '#c9a84c', fontWeight: 600 }}>Setlistr</a>
              {' '}· Live performance tracking for artists
            </p>
          </div>

        </div>
      </div>
    </>
  )
}
