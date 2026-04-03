'use client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const C = {
  bg: '#0a0908', card: '#141210', border: 'rgba(255,255,255,0.07)',
  borderGold: 'rgba(201,168,76,0.25)', text: '#f0ece3', secondary: '#b8a888',
  muted: '#8a7a68', gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.08)',
  green: '#4ade80', red: '#f87171',
}

const ARTICLES = [
  {
    tag:   'Start Here',
    tagColor: C.gold,
    href:  '/get-paid-for-live-shows',
    title: 'Most artists never get paid for live shows. Here\'s how to fix that.',
    desc:  'Where the money comes from, how much you\'re owed by venue size, and the exact steps to claim it from ASCAP, BMI, SOCAN, PRS and more.',
    stat:  '$512M distributed by SOCAN alone in 2024',
  },
  {
    tag:   'Eye-opener',
    tagColor: C.red,
    href:  '/unclaimed-music-royalties',
    title: 'Millions in unclaimed live royalties — your money is going to someone else.',
    desc:  'When you don\'t submit your setlist, the money doesn\'t disappear. It gets redistributed to artists who did. Here\'s the scale of what\'s being left behind.',
    stat:  '98% of new Mogul users weren\'t collecting all their royalties',
  },
  {
    tag:   'Step-by-Step',
    tagColor: C.green,
    href:  '/submit-setlists-pro',
    title: 'How to submit your setlists to ASCAP, BMI & SOCAN — every step.',
    desc:  'A complete walkthrough of every major PRO\'s live performance submission portal, with screenshots and exact navigation paths.',
    stat:  'Takes under 10 minutes per show',
  },
  {
    tag:   'Plain English',
    tagColor: C.secondary,
    href:  '/what-is-live-performance-royalty',
    title: 'What is a live performance royalty? A simple explanation.',
    desc:  'The clearest explanation of how live royalties work, who pays them, and why most performing songwriters are missing out entirely.',
    stat:  'Shareable — send to any artist friend',
  },
]

export default function GetPaidPage() {
  const router = useRouter()

  return (
    <div style={{
      minHeight: '100svh',
      background: C.bg,
      fontFamily: '"DM Sans", system-ui, sans-serif',
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* Background */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: `
          radial-gradient(ellipse at 50% -10%, rgba(201,168,76,0.12) 0%, transparent 60%),
          radial-gradient(ellipse at 80% 80%, rgba(201,168,76,0.04) 0%, transparent 50%)
        `,
      }} />
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.03,
        backgroundImage: 'linear-gradient(rgba(201,168,76,1) 1px, transparent 1px), linear-gradient(90deg, rgba(201,168,76,1) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 480, margin: '0 auto', padding: '0 20px 80px' }}>

        {/* ── Hero — exactly as before ── */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          textAlign: 'center', paddingTop: 80, paddingBottom: 56,
          animation: 'fadeUp 0.5s ease',
        }}>
          <h1 style={{
            fontSize: 'clamp(36px, 10vw, 52px)', fontWeight: 800,
            color: C.text, margin: '0 0 8px',
            letterSpacing: '-0.04em', lineHeight: 1.05,
          }}>
            You played that<br />song live.
          </h1>
          <h2 style={{
            fontSize: 'clamp(36px, 10vw, 52px)', fontWeight: 800,
            color: C.gold, margin: '0 0 20px',
            letterSpacing: '-0.04em', lineHeight: 1.05,
          }}>
            Did you get paid?
          </h2>

          <p style={{
            fontSize: 16, color: '#a09070', lineHeight: 1.6,
            margin: '0 0 36px', maxWidth: 320,
          }}>
            Most live performances never get reported to PROs.
            That means songwriters leave real money behind — every single show.
          </p>

          <button
            onClick={() => router.push('/start')}
            style={{
              width: '100%', padding: '18px 24px',
              background: C.gold, border: 'none', borderRadius: 14,
              color: '#0a0908', fontSize: 15, fontWeight: 800,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              cursor: 'pointer', fontFamily: 'inherit', marginBottom: 12,
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            See what you might be owed →
          </button>
          <p style={{ fontSize: 12, color: 'rgba(106,96,80,0.8)', margin: 0, letterSpacing: '0.04em' }}>
            No account needed · Takes 30 seconds
          </p>

          {/* PRO trust strip */}
          <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
              {['SOCAN', 'ASCAP', 'BMI', 'PRS', 'APRA'].map(pro => (
                <span key={pro} style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.15em',
                  color: 'rgba(160,144,112,0.4)', textTransform: 'uppercase',
                }}>{pro}</span>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'rgba(106,96,80,0.6)', letterSpacing: '0.06em', margin: 0 }}>
              Export-ready for all major PROs
            </p>
          </div>
        </div>

        {/* ── Divider ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
          <div style={{ flex: 1, height: 1, background: C.border }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            The full guide
          </span>
          <div style={{ flex: 1, height: 1, background: C.border }} />
        </div>

        {/* ── Article cluster ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {ARTICLES.map(({ tag, tagColor, href, title, desc, stat }) => (
            <Link key={href} href={href} style={{ textDecoration: 'none' }}>
              <div style={{
                background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 14, padding: '20px',
                transition: 'border-color 0.15s ease',
                cursor: 'pointer',
              }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = C.borderGold)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
              >
                {/* Tag */}
                <div style={{ marginBottom: 10 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                    textTransform: 'uppercase', color: tagColor,
                    background: tagColor + '15',
                    border: `1px solid ${tagColor}30`,
                    borderRadius: 20, padding: '3px 9px',
                  }}>{tag}</span>
                </div>

                {/* Title */}
                <p style={{
                  fontSize: 15, fontWeight: 700, color: C.text,
                  margin: '0 0 8px', lineHeight: 1.35, letterSpacing: '-0.01em',
                }}>
                  {title}
                </p>

                {/* Desc */}
                <p style={{
                  fontSize: 13, color: C.muted, margin: '0 0 14px', lineHeight: 1.55,
                }}>
                  {desc}
                </p>

                {/* Stat + arrow */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: tagColor,
                    background: tagColor + '10', border: `1px solid ${tagColor}20`,
                    borderRadius: 6, padding: '3px 8px',
                  }}>
                    {stat}
                  </span>
                  <span style={{ fontSize: 14, color: C.muted }}>→</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* ── Bottom CTA ── */}
        <div style={{
          marginTop: 40, padding: '28px 24px',
          background: C.goldDim, border: `1px solid ${C.borderGold}`,
          borderRadius: 16, textAlign: 'center',
        }}>
          <p style={{ fontSize: 17, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
            Ready to stop leaving money on stage?
          </p>
          <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 20px', lineHeight: 1.5 }}>
            Setlistr automatically captures your setlist during the show so you never have to reconstruct it.
          </p>
          <button
            onClick={() => router.push('/start')}
            style={{
              width: '100%', padding: '15px',
              background: C.gold, border: 'none', borderRadius: 12,
              color: '#0a0908', fontSize: 13, fontWeight: 800,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Start Free →
          </button>
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
