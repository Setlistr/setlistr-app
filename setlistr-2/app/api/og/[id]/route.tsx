import { ImageResponse } from 'next/og'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: perf } = await supabase
      .from('performances')
      .select('artist_name, venue_name, city, country, started_at')
      .eq('id', params.id)
      .single()

    const { data: songs } = await supabase
      .from('performance_songs')
      .select('title, source')
      .eq('performance_id', params.id)
      .order('position', { ascending: true })
      .limit(12)

    const artistName  = perf?.artist_name || 'Artist'
    const venueName   = perf?.venue_name  || 'Live Show'
    const city        = perf?.city        || ''
    const songList    = songs || []
    const songCount   = songList.length
    const autoCount   = songList.filter(s =>
      s.source === 'recognized' || s.source === 'detected' ||
      s.source === 'fingerprint' || s.source === 'humming'
    ).length
    const showDate    = perf?.started_at
      ? new Date(perf.started_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : ''

    // Show up to 8 songs, truncate rest
    const displaySongs = songList.slice(0, 8)
    const hiddenCount  = Math.max(0, songCount - 8)

    return new ImageResponse(
      (
        <div
          style={{
            width: '1200px',
            height: '630px',
            background: '#0a0908',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            fontFamily: 'system-ui, sans-serif',
            overflow: 'hidden',
          }}
        >
          {/* Gold glow top */}
          <div style={{
            position: 'absolute', top: 0, left: '50%',
            transform: 'translateX(-50%)',
            width: '120%', height: '60%',
            background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.18) 0%, transparent 65%)',
            pointerEvents: 'none',
            display: 'flex',
          }} />

          {/* Left column — artist + venue + setlist */}
          <div style={{
            display: 'flex', flexDirection: 'column',
            flex: 1, padding: '52px 0 52px 64px',
            position: 'relative', zIndex: 1,
          }}>
            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '40px' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                background: 'rgba(201,168,76,0.15)',
                border: '1px solid rgba(201,168,76,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#c9a84c', display: 'flex' }} />
              </div>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#c9a84c', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                Setlistr
              </span>
            </div>

            {/* Artist + venue */}
            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '32px' }}>
              <span style={{
                fontSize: '13px', fontWeight: 700, color: '#c9a84c',
                letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '8px',
              }}>
                {showDate}{city ? ` · ${city}` : ''}
              </span>
              <span style={{
                fontSize: '46px', fontWeight: 800, color: '#f0ece3',
                letterSpacing: '-0.03em', lineHeight: 1.05, marginBottom: '6px',
              }}>
                {artistName}
              </span>
              <span style={{ fontSize: '22px', color: '#b8a888', fontWeight: 500 }}>
                {venueName}
              </span>
            </div>

            {/* Song list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
              {displaySongs.map((song, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{
                    fontSize: '12px', color: '#6a6050', minWidth: '20px',
                    textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                  }}>{i + 1}</span>
                  <div style={{
                    width: '5px', height: '5px', borderRadius: '50%',
                    background: '#c9a84c', opacity: 0.6, flexShrink: 0, display: 'flex',
                  }} />
                  <span style={{
                    fontSize: '16px', fontWeight: 600, color: '#f0ece3',
                    whiteSpace: 'nowrap', overflow: 'hidden',
                  }}>{song.title}</span>
                </div>
              ))}
              {hiddenCount > 0 && (
                <span style={{ fontSize: '13px', color: '#6a6050', marginTop: '4px', marginLeft: '32px' }}>
                  +{hiddenCount} more
                </span>
              )}
            </div>
          </div>

          {/* Right column — stats */}
          <div style={{
            width: '320px', flexShrink: 0,
            display: 'flex', flexDirection: 'column',
            padding: '52px 64px 52px 0',
            position: 'relative', zIndex: 1,
            justifyContent: 'flex-end',
          }}>
            {/* Stats card */}
            <div style={{
              background: 'rgba(201,168,76,0.08)',
              border: '1px solid rgba(201,168,76,0.25)',
              borderRadius: '16px',
              padding: '24px',
              display: 'flex', flexDirection: 'column', gap: '16px',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', color: '#8a7a68', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Songs played</span>
                <span style={{ fontSize: '42px', fontWeight: 800, color: '#c9a84c', letterSpacing: '-0.03em', lineHeight: 1 }}>{songCount}</span>
              </div>

              {autoCount > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '10px 12px',
                  background: 'rgba(74,222,128,0.08)',
                  border: '1px solid rgba(74,222,128,0.2)',
                  borderRadius: '10px',
                }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ade80', display: 'flex' }} />
                  <span style={{ fontSize: '12px', color: '#4ade80', fontWeight: 600 }}>
                    {autoCount} auto-detected
                  </span>
                </div>
              )}

              <div style={{
                borderTop: '1px solid rgba(255,255,255,0.07)',
                paddingTop: '14px',
                display: 'flex', flexDirection: 'column', gap: '4px',
              }}>
                <span style={{ fontSize: '10px', color: '#6a6050', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Tracked by</span>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#c9a84c', letterSpacing: '0.04em' }}>setlistr.ai</span>
              </div>
            </div>
          </div>

          {/* Bottom border accent */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: '3px',
            background: 'linear-gradient(90deg, transparent 0%, rgba(201,168,76,0.6) 30%, rgba(201,168,76,0.6) 70%, transparent 100%)',
            display: 'flex',
          }} />
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    )
  } catch (err) {
    // Fallback minimal card if data fetch fails
    return new ImageResponse(
      (
        <div style={{ width: '1200px', height: '630px', background: '#0a0908', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '32px', color: '#c9a84c', fontFamily: 'system-ui' }}>Setlistr</span>
        </div>
      ),
      { width: 1200, height: 630 }
    )
  }
}
