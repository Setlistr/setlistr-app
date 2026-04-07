import { ImageResponse } from 'next/og'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { data: perf } = await supabaseAdmin
    .from('performances')
    .select('id, artist_name, venue_name, city, country, started_at')
    .eq('id', params.id)
    .single()

  if (!perf) {
    return new Response('Not found', { status: 404 })
  }

  const { data: songs } = await supabaseAdmin
    .from('performance_songs')
    .select('title, position')
    .eq('performance_id', params.id)
    .not('title', 'is', null)
    .order('position')
    .limit(20)

  const confirmedSongs = (songs || []).filter(s => s.title?.trim())
  const date = new Date(perf.started_at).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  })

  // Logo as base64 from public URL
  const logoUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://setlistr.ai'}/logo-white.png`

  return new ImageResponse(
    (
      <div
        style={{
          width: '1080px',
          height: '1920px',
          background: '#0a0908',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'flex-start',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background glow top */}
        <div style={{
          position: 'absolute', top: 0, left: '50%',
          width: '1200px', height: '800px',
          background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.18) 0%, transparent 65%)',
          transform: 'translateX(-50%)',
          display: 'flex',
        }} />

        {/* Background glow bottom */}
        <div style={{
          position: 'absolute', bottom: 0, left: '50%',
          width: '900px', height: '500px',
          background: 'radial-gradient(ellipse at 50% 100%, rgba(201,168,76,0.07) 0%, transparent 70%)',
          transform: 'translateX(-50%)',
          display: 'flex',
        }} />

        {/* Gold accent line at top */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: '4px',
          background: 'linear-gradient(90deg, transparent, #c9a84c, transparent)',
          display: 'flex',
        }} />

        {/* Content */}
        <div style={{
          display: 'flex', flexDirection: 'column',
          padding: '80px 80px',
          width: '100%', height: '100%',
          position: 'relative', zIndex: 1,
        }}>

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '80px' }}>
            <img
              src={logoUrl}
              width={280}
              height={70}
              style={{ objectFit: 'contain', objectPosition: 'left' }}
            />
          </div>

          {/* LIVE PERFORMANCE label */}
          <div style={{
            display: 'flex',
            background: 'rgba(201,168,76,0.12)',
            border: '1px solid rgba(201,168,76,0.3)',
            borderRadius: '40px',
            padding: '10px 24px',
            marginBottom: '40px',
            width: 'fit-content',
          }}>
            <span style={{ fontSize: '22px', fontWeight: 700, color: '#c9a84c', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
              Live Performance
            </span>
          </div>

          {/* Artist name */}
          <div style={{ fontSize: '96px', fontWeight: 800, color: '#f0ece3', lineHeight: 1.0, letterSpacing: '-0.03em', marginBottom: '20px', display: 'flex' }}>
            {perf.artist_name}
          </div>

          {/* Venue */}
          <div style={{ fontSize: '44px', fontWeight: 600, color: '#b8a888', marginBottom: '12px', display: 'flex' }}>
            {perf.venue_name}{perf.city ? ` · ${perf.city}` : ''}
          </div>

          {/* Date */}
          <div style={{ fontSize: '32px', color: '#8a7a68', marginBottom: '60px', display: 'flex' }}>
            {date}
          </div>

          {/* Divider */}
          <div style={{ width: '100%', height: '1px', background: 'rgba(255,255,255,0.08)', marginBottom: '48px', display: 'flex' }} />

          {/* Setlist label */}
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#8a7a68', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: '28px', display: 'flex' }}>
            Setlist · {confirmedSongs.length} songs
          </div>

          {/* Songs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0px', flex: 1 }}>
            {confirmedSongs.slice(0, 14).map((song, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '28px',
                padding: '18px 0',
                borderBottom: i < Math.min(confirmedSongs.length, 14) - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
              }}>
                <span style={{ fontSize: '24px', fontWeight: 700, color: 'rgba(201,168,76,0.6)', minWidth: '40px', fontFamily: 'monospace' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ fontSize: '36px', fontWeight: 600, color: '#f0ece3', flex: 1 }}>
                  {song.title}
                </span>
              </div>
            ))}
            {confirmedSongs.length > 14 && (
              <div style={{ display: 'flex', paddingTop: '20px' }}>
                <span style={{ fontSize: '28px', color: '#8a7a68', fontStyle: 'italic' }}>
                  +{confirmedSongs.length - 14} more songs
                </span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            paddingTop: '40px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            marginTop: 'auto',
          }}>
            <span style={{ fontSize: '26px', color: '#6a6050' }}>
              Captured with Setlistr
            </span>
            <span style={{ fontSize: '26px', fontWeight: 700, color: '#c9a84c' }}>
              setlistr.ai
            </span>
          </div>

        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1920,
    }
  )
}
