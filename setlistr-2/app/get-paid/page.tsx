import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'

export const metadata: Metadata = {
  title: 'Get Paid for Live Shows — Live Performance Royalty Guides | Setlistr',
  description: 'Most performing songwriters leave real money behind after every show. Learn how to claim live performance royalties from SOCAN, ASCAP, BMI, PRS, APRA and more.',
  alternates: { canonical: 'https://setlistr.ai/get-paid' },
  openGraph: {
    title: 'Get Paid for Live Shows — Live Performance Royalty Guides',
    description: 'Everything you need to claim what you’re owed for playing live.',
    url: 'https://setlistr.ai/get-paid',
    siteName: 'Setlistr',
    type: 'website',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'Setlistr — Get Paid for Live Shows' }],
  },
}

const CARDS = [
  { href: '/get-paid-for-live-shows', tag: 'Start Here', tagColor: 'gold',
    title: 'Most artists never get paid for live shows. Here’s how to fix that.',
    copy: 'Where the money comes from, how much you’re owed by venue size, and the exact steps to claim it from ASCAP, BMI, SOCAN, PRS and more.',
    stat: '$512M distributed by SOCAN in 2024' },
  { href: '/unclaimed-music-royalties', tag: 'Eye-opener', tagColor: 'red',
    title: 'Millions in unclaimed live royalties — your money is going to someone else.',
    copy: 'When you don’t submit your setlist, the money doesn’t disappear. It gets redistributed to artists who did submit.',
    stat: 'Billions unclaimed globally every year' },
  { href: '/submit-setlists-pro', tag: 'Step-by-Step', tagColor: 'green',
    title: 'How to submit your setlists to ASCAP, BMI & SOCAN — every step.',
    copy: 'A complete walkthrough of every major PRO’s live performance submission portal with exact navigation paths.',
    stat: 'Under 10 minutes per show' },
  { href: '/what-is-live-performance-royalty', tag: 'Plain English', tagColor: 'neutral',
    title: 'What is a live performance royalty? A simple explanation.',
    copy: 'How live royalties work, who pays them, and why most performing songwriters are missing out entirely.',
    stat: 'Shareable — send to any artist friend' },
]

function tagStyle(kind: string): React.CSSProperties {
  const map: Record<string, { c: string; bg: string; bd: string }> = {
    gold:    { c: '#C9A84C', bg: 'rgba(201,168,76,0.1)', bd: 'rgba(201,168,76,0.25)' },
    red:     { c: '#f0a68a', bg: 'rgba(248,113,113,0.08)', bd: 'rgba(248,113,113,0.22)' },
    green:   { c: '#86e0a8', bg: 'rgba(74,222,128,0.08)', bd: 'rgba(74,222,128,0.22)' },
    neutral: { c: 'rgba(212,209,202,0.85)', bg: 'rgba(255,255,255,0.05)', bd: 'rgba(255,255,255,0.15)' },
  }
  const m = map[kind] || map.gold
  return { display: 'inline-block', fontFamily: '"DM Mono", monospace', fontSize: 10, fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', padding: '4px 11px', borderRadius: 20, marginBottom: 16, color: m.c, background: m.bg, border: `1px solid ${m.bd}` }
}

export default function GetPaidPage() {
  return (
    <div style={{ minHeight: '100svh', background: '#080706', color: '#fff', fontFamily: '"DM Sans", system-ui, sans-serif', overflowX: 'hidden' }}>
      <style>{`
        .gp-card { transition: border-color .25s, transform .25s; }
        .gp-card:hover { border-color: rgba(201,168,76,0.4) !important; transform: translateY(-4px); }
        .gp-navlink:hover { color: #C9A84C !important; }
        @media (max-width: 760px) { .gp-navlink { display: none !important; } .gp-cards { grid-template-columns: 1fr !important; } }
      `}</style>

      <div style={{ position: 'fixed', width: 620, height: 620, borderRadius: '50%', filter: 'blur(120px)', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(circle, rgba(201,168,76,1), transparent)', opacity: 0.11, top: -260, right: -180 }} />
      <div style={{ position: 'fixed', width: 460, height: 460, borderRadius: '50%', filter: 'blur(120px)', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(circle, rgba(201,168,76,1), transparent)', opacity: 0.06, bottom: '12%', left: -160 }} />

      <header style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 40px', background: 'rgba(8,7,6,0.82)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'flex' }}>
          <Image src="/logo-white-tight.png" alt="Setlistr" width={190} height={36} priority style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
        </Link>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/how-it-works" className="gp-navlink" style={{ fontFamily: '"DM Mono", monospace', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(232,228,219,0.78)', textDecoration: 'none' }}>How It Works</Link>
          <Link href="/app/show/new" style={{ fontFamily: '"DM Mono", monospace', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', background: '#C9A84C', color: '#080706', textDecoration: 'none', padding: '10px 20px', borderRadius: 6 }}>Start Free</Link>
        </nav>
      </header>

      <div style={{ position: 'relative', zIndex: 1 }}>
        <section style={{ minHeight: '82vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '128px 24px 40px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, border: '1px solid rgba(201,168,76,.3)', borderRadius: 20, padding: '6px 18px', marginBottom: 32, fontFamily: '"DM Mono", monospace', fontSize: 11, color: '#C9A84C', letterSpacing: '.16em', textTransform: 'uppercase' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#C9A84C' }} /> For Working Songwriters
          </div>
          <h1 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 'clamp(52px, 9vw, 116px)', lineHeight: 0.9, letterSpacing: '.02em', margin: 0 }}>
            You played that song live.<br /><span style={{ color: '#C9A84C' }}>Did you get paid?</span>
          </h1>
          <p style={{ fontSize: 17, fontWeight: 300, color: 'rgba(212,209,202,0.72)', lineHeight: 1.7, maxWidth: 440, margin: '28px auto 40px' }}>
            Most live performances never get reported to the PROs. Songwriters leave real money behind &mdash; every single show.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 }}>
            <Link href="/start" style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 18, letterSpacing: '.08em', background: '#C9A84C', color: '#080706', padding: '15px 38px', textDecoration: 'none', borderRadius: 8 }}>See What You&rsquo;re Owed</Link>
            <Link href="/how-it-works" style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 18, letterSpacing: '.08em', background: 'transparent', border: '1px solid rgba(201,168,76,.35)', color: 'rgba(212,209,202,.85)', padding: '15px 38px', textDecoration: 'none', borderRadius: 8 }}>How It Works</Link>
          </div>
          <div style={{ fontFamily: '"DM Mono", monospace', fontSize: 11, letterSpacing: '.1em', color: 'rgba(201,168,76,.7)', marginBottom: 44 }}>No account needed &middot; Takes 30 seconds</div>
          <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', justifyContent: 'center' }}>
            {['SOCAN','ASCAP','BMI','PRS','APRA','SESAC','GMR'].map(p => (
              <span key={p} style={{ fontFamily: '"DM Mono", monospace', fontSize: 11, letterSpacing: '.18em', color: 'rgba(212,209,202,.4)', textTransform: 'uppercase' }}>{p}</span>
            ))}
          </div>
        </section>

        <section style={{ textAlign: 'center', padding: '80px 24px 20px' }}>
          <div style={{ fontFamily: '"DM Mono", monospace', fontSize: 11, letterSpacing: '.16em', color: 'rgba(201,168,76,.9)', textTransform: 'uppercase', marginBottom: 16 }}>The Full Guide</div>
          <h2 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 'clamp(34px, 5vw, 60px)', lineHeight: 1.05, letterSpacing: '.02em', margin: 0 }}>
            Everything you need<br /><span style={{ color: '#C9A84C' }}>to claim what&rsquo;s yours.</span>
          </h2>
        </section>

        <section className="gp-cards" style={{ maxWidth: 920, margin: '0 auto', padding: '40px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {CARDS.map(card => (
            <Link key={card.href} href={card.href} className="gp-card" style={{ background: 'linear-gradient(160deg, rgba(20,18,16,.9), rgba(12,10,8,.9))', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, padding: 28, textDecoration: 'none', display: 'block' }}>
              <span style={tagStyle(card.tagColor)}>{card.tag}</span>
              <h3 style={{ fontSize: 18, fontWeight: 600, color: '#f0ece3', lineHeight: 1.35, marginBottom: 10 }}>{card.title}</h3>
              <p style={{ fontSize: 14, fontWeight: 300, color: 'rgba(212,209,202,0.62)', lineHeight: 1.6, marginBottom: 18 }}>{card.copy}</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 11, color: '#C9A84C', background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 6, padding: '5px 10px' }}>{card.stat}</span>
                <span style={{ color: 'rgba(201,168,76,0.6)', fontSize: 16 }}>&rarr;</span>
              </div>
            </Link>
          ))}
        </section>

        <section style={{ maxWidth: 720, margin: '40px auto 0', padding: '0 24px' }}>
          <div style={{ background: 'linear-gradient(160deg, rgba(201,168,76,.1), rgba(201,168,76,.03))', border: '1px solid rgba(201,168,76,0.28)', borderRadius: 24, padding: '48px 32px', textAlign: 'center' }}>
            <h2 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 'clamp(28px, 4vw, 44px)', lineHeight: 1.05, letterSpacing: '.02em', marginBottom: 14 }}>Ready to stop leaving<br /><span style={{ color: '#C9A84C' }}>money on stage?</span></h2>
            <p style={{ fontSize: 15, fontWeight: 300, color: 'rgba(212,209,202,0.7)', lineHeight: 1.6, maxWidth: 400, margin: '0 auto 28px' }}>Setlistr automatically captures your setlist during the show. Free to start.</p>
            <Link href="/app/show/new" style={{ display: 'inline-block', fontFamily: '"Bebas Neue", sans-serif', fontSize: 18, letterSpacing: '.08em', background: '#C9A84C', color: '#080706', padding: '15px 40px', textDecoration: 'none', borderRadius: 8 }}>Start Free &rarr;</Link>
          </div>
        </section>

        <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 80, padding: '40px 24px', maxWidth: 920, marginLeft: 'auto', marginRight: 'auto' }}>
          <p style={{ fontSize: 11, color: 'rgba(212,209,202,0.4)', lineHeight: 1.7, marginBottom: 12 }}>
            <b style={{ color: 'rgba(212,209,202,0.6)' }}>Disclaimer:</b> Royalty estimates are for informational purposes only and based on publicly available PRO tariff data. Actual payments vary based on venue license status, PRO distribution rules, song registration, writer splits, and other factors outside Setlistr&rsquo;s control. Setlistr is not a licensed financial or legal advisor. Always verify rates directly with your PRO.
          </p>
          <p style={{ fontSize: 11, color: 'rgba(212,209,202,0.4)', lineHeight: 1.7, marginBottom: 12 }}>
            Setlistr is not affiliated with, endorsed by, or connected to SOCAN, ASCAP, BMI, SESAC, GMR, PRS for Music, APRA AMCOS, or any Performing Rights Organization. All PRO names are trademarks of their respective owners.
          </p>
          <p style={{ fontSize: 11, color: 'rgba(212,209,202,0.35)', lineHeight: 1.6 }}>
            &copy; {new Date().getFullYear()} Setlistr &middot; Live performance tracking and royalty submission for songwriters. Works with SOCAN, ASCAP, BMI, PRS, APRA and all major PROs. &middot; <Link href="/terms" style={{ color: 'rgba(201,168,76,0.5)', textDecoration: 'none' }}>Terms</Link> &middot; <Link href="/privacy" style={{ color: 'rgba(201,168,76,0.5)', textDecoration: 'none' }}>Privacy</Link>
          </p>
        </footer>
      </div>
    </div>
  )
}
