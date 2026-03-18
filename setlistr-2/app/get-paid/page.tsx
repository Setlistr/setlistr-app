'use client'
import { useRouter } from 'next/navigation'

export default function GetPaidPage() {
  const router = useRouter()

  return (
    <div style={{
      minHeight: '100svh',
      background: '#0a0908',
      fontFamily: '"DM Sans", system-ui, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 24px',
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* Background texture */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: `
          radial-gradient(ellipse at 50% -10%, rgba(201,168,76,0.12) 0%, transparent 60%),
          radial-gradient(ellipse at 80% 80%, rgba(201,168,76,0.04) 0%, transparent 50%)
        `,
      }} />

      {/* Subtle grid lines */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.03,
        backgroundImage: 'linear-gradient(rgba(201,168,76,1) 1px, transparent 1px), linear-gradient(90deg, rgba(201,168,76,1) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />

      <div style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: 420,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', textAlign: 'center',
      }}>

        {/* Main headline */}
        <div style={{ marginBottom: 24, animation: 'fadeUp 0.5s ease' }}>
          <h1 style={{
            fontSize: 'clamp(36px, 10vw, 52px)',
            fontWeight: 800,
            color: '#f0ece3',
            margin: '0 0 8px',
            letterSpacing: '-0.04em',
            lineHeight: 1.05,
          }}>
            You played that<br />
            song live.
          </h1>
          <h2 style={{
            fontSize: 'clamp(36px, 10vw, 52px)',
            fontWeight: 800,
            color: '#c9a84c',
            margin: 0,
            letterSpacing: '-0.04em',
            lineHeight: 1.05,
          }}>
            Did you get paid?
          </h2>
        </div>

        {/* Supporting copy */}
        <p style={{
          fontSize: 16,
          color: '#a09070',
          lineHeight: 1.6,
          margin: '0 0 48px',
          maxWidth: 320,
          animation: 'fadeUp 0.6s ease',
        }}>
          Most live performances never get reported to PROs.
          That means songwriters leave real money behind — every single show.
        </p>

        {/* CTA */}
        <div style={{ width: '100%', animation: 'fadeUp 0.7s ease' }}>
          <button
            onClick={() => router.push('/start')}
            style={{
              width: '100%',
              padding: '18px 24px',
              background: '#c9a84c',
              border: 'none',
              borderRadius: 14,
              color: '#0a0908',
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'opacity 0.15s ease',
              fontFamily: 'inherit',
              marginBottom: 14,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.88' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
          >
            See what you might be owed →
          </button>

          <p style={{
            fontSize: 12,
            color: 'rgba(106,96,80,0.8)',
            margin: 0,
            letterSpacing: '0.04em',
          }}>
            No account needed · Takes 30 seconds
          </p>
        </div>

        {/* PRO trust */}
        <div style={{
          marginTop: 64,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
          animation: 'fadeUp 0.8s ease',
        }}>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            {['SOCAN', 'ASCAP', 'BMI'].map(pro => (
              <span key={pro} style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.15em',
                color: 'rgba(160,144,112,0.4)', textTransform: 'uppercase',
              }}>{pro}</span>
            ))}
          </div>
          <p style={{
            fontSize: 11, color: 'rgba(106,96,80,0.6)',
            letterSpacing: '0.06em', margin: 0,
          }}>
            Export-ready for all major PROs
          </p>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
      `}</style>
    </div>
  )
}
