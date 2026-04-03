import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Millions in Unclaimed Live Performance Royalties — Are You Missing Out? | Setlistr',
  description: 'Billions in live performance royalties go unclaimed every year because artists don\'t submit their setlists. Find out how much you might be owed and how to claim it.',
  keywords: ['unclaimed music royalties', 'unclaimed live performance royalties', 'setlist submission', 'PRO royalties unclaimed', 'music royalties owed'],
  openGraph: {
    title: 'Millions in Unclaimed Live Performance Royalties — Are You Missing Out?',
    description: 'Billions in live performance royalties go unclaimed every year. Find out how much you might be owed.',
    url: 'https://setlistr.ai/unclaimed-music-royalties',
    siteName: 'Setlistr',
    type: 'article',
  },
  alternates: { canonical: 'https://setlistr.ai/unclaimed-music-royalties' },
}

const C = {
  bg: '#0a0908', card: '#141210', border: 'rgba(255,255,255,0.07)',
  borderGold: 'rgba(201,168,76,0.25)', text: '#f0ece3', secondary: '#b8a888',
  muted: '#8a7a68', gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.08)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.06)',
  red: '#f87171', redDim: 'rgba(248,113,113,0.06)',
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 16, color: C.secondary, lineHeight: 1.75, margin: '0 0 16px' }}>{children}</p>
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: '48px 0 16px', letterSpacing: '-0.02em', lineHeight: 1.2 }}>{children}</h2>
}

export default function UnclaimedRoyalties() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>

      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '50vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(248,113,113,0.05) 0%, transparent 65%)' }} />

      <nav style={{ position: 'relative', zIndex: 10, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 800, margin: '0 auto' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: C.gold, letterSpacing: '-0.02em' }}>Setlistr</span>
        </Link>
        <Link href="/app/dashboard" style={{ textDecoration: 'none', fontSize: 13, fontWeight: 700, color: '#0a0908', background: C.gold, borderRadius: 8, padding: '8px 16px' }}>
          Start Free →
        </Link>
      </nav>

      <main style={{ position: 'relative', zIndex: 1, maxWidth: 720, margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Hero */}
        <div style={{ marginBottom: 56 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.redDim, border: '1px solid rgba(248,113,113,0.2)', borderRadius: 20, padding: '4px 12px', marginBottom: 20 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.red, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Are You Missing Out?</span>
          </div>
          <h1 style={{ fontSize: 40, fontWeight: 800, color: C.text, margin: '0 0 20px', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            Millions in Unclaimed<br /><span style={{ color: C.red }}>Live Performance Royalties</span>
          </h1>
          <p style={{ fontSize: 18, color: C.secondary, lineHeight: 1.6, margin: 0, maxWidth: 580 }}>
            Every night thousands of artists perform original songs at licensed venues. Every night most of them walk away without claiming the royalties they're legally owed.
          </p>
        </div>

        {/* Big number */}
        <div style={{ background: C.card, border: `1px solid ${C.borderGold}`, borderRadius: 16, padding: '32px', marginBottom: 48, textAlign: 'center' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.gold, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 10px' }}>SOCAN distributed in 2024</p>
          <p style={{ fontSize: 56, fontWeight: 800, color: C.gold, margin: '0 0 8px', fontFamily: '"DM Mono", monospace', letterSpacing: '-0.03em' }}>$512M</p>
          <p style={{ fontSize: 14, color: C.secondary, margin: 0 }}>And that's just one PRO — in one country</p>
        </div>

        <P>
          SOCAN, Canada's performing rights organization, distributed a record $512.4 million in royalties in 2024. ASCAP and BMI each distribute over $1 billion annually in the United States alone. PRS for Music, APRA AMCOS, and dozens of other PROs around the world collect and distribute hundreds of millions more.
        </P>
        <P>
          A significant portion of that money — the portion tied to live performances — depends entirely on artists submitting their setlists. When artists don't submit, the money doesn't disappear. It gets redistributed to artists who did submit. Your unclaimed royalties are going to someone else.
        </P>

        <H2>Why Does This Happen?</H2>
        <P>
          It's not that artists don't know royalties exist. Most performing songwriters have at least a vague awareness that their PRO pays for live performances. The problem is friction at the data capture step.
        </P>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '24px 0' }}>
          {[
            { label: 'You don\'t remember the setlist', detail: 'A 12-song set played at 11pm after a long day of travel is hard to reconstruct accurately the next morning.' },
            { label: 'The submission window feels distant', detail: 'SOCAN gives you a year. ASCAP wants same-quarter. The deadline feels far away — until it isn\'t.' },
            { label: 'The portal UX is genuinely painful', detail: 'PRO portals were not designed for mobile-first touring musicians. They\'re clunky, desktop-centric, and slow.' },
            { label: 'The amounts feel too small to bother', detail: 'A single bar show might yield $30–75 in royalties. Across 100 shows a year, that\'s $3,000–7,500 unclaimed.' },
          ].map(({ label, detail }) => (
            <div key={label} style={{ display: 'flex', gap: 14, padding: '14px 18px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
              <span style={{ color: C.red, flexShrink: 0, fontSize: 16, marginTop: 1 }}>✕</span>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>{label}</p>
                <p style={{ fontSize: 13, color: C.muted, margin: 0, lineHeight: 1.5 }}>{detail}</p>
              </div>
            </div>
          ))}
        </div>

        <H2>How Much Are You Leaving Behind?</H2>
        <P>
          Let's run the numbers for a working songwriter who gigs regularly in Canada under SOCAN:
        </P>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', margin: '20px 0' }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
            {['Scenario', 'Shows/yr', 'Songs/show', 'Est. unclaimed'].map(h => (
              <span key={h} style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</span>
            ))}
          </div>
          {[
            { scenario: 'Bar circuit',     shows: 50,  songs: 10, low: 1000,  high: 3000 },
            { scenario: 'Club / mid-size', shows: 60,  songs: 12, low: 3600,  high: 12960 },
            { scenario: 'Theatre touring', shows: 40,  songs: 15, low: 16800, high: 60000 },
            { scenario: 'Festival season', shows: 20,  songs: 10, low: 10000, high: 56000 },
          ].map(({ scenario, shows, songs, low, high }) => (
            <div key={scenario} style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{scenario}</span>
              <span style={{ fontSize: 13, color: C.secondary, fontFamily: '"DM Mono", monospace' }}>{shows}</span>
              <span style={{ fontSize: 13, color: C.secondary, fontFamily: '"DM Mono", monospace' }}>{songs}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.gold, fontFamily: '"DM Mono", monospace' }}>
                ${low.toLocaleString()}–${high.toLocaleString()}
              </span>
            </div>
          ))}
        </div>

        <P>
          These figures are based on published SOCAN tariff rates. US artists under ASCAP or BMI will see somewhat lower figures for smaller venues due to the way those PROs sample performances, but the scale is similar at mid-size venues and above.
        </P>

        <H2>What You Can Do Right Now</H2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '20px 0' }}>
          {[
            'Register with your PRO if you haven\'t yet — SOCAN, ASCAP, BMI, PRS, or APRA depending on your territory',
            'Register your songs — your PRO can only pay you for registered works',
            'Submit setlists for past shows — most PROs give you 6 months to 1 year to submit retroactively',
            'Build a habit of capturing setlists immediately after every show going forward',
            'Check your PRO\'s "Unidentified Concerts" list — your shows may already be logged, just missing a setlist',
          ].map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 14, padding: '12px 16px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: C.gold, fontFamily: '"DM Mono", monospace', flexShrink: 0, minWidth: 20 }}>{i + 1}.</span>
              <p style={{ fontSize: 14, color: C.secondary, margin: 0, lineHeight: 1.5 }}>{step}</p>
            </div>
          ))}
        </div>

        <div style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 16, padding: '32px', textAlign: 'center', marginTop: 48 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: '0 0 10px', letterSpacing: '-0.02em' }}>
            Never miss a setlist again
          </h2>
          <p style={{ fontSize: 15, color: C.secondary, margin: '0 0 24px', lineHeight: 1.6 }}>
            Setlistr listens during your show and builds the setlist automatically. Free to start.
          </p>
          <Link href="/app/show/new" style={{ textDecoration: 'none', display: 'inline-block', background: C.gold, color: '#0a0908', fontWeight: 800, fontSize: 14, letterSpacing: '0.06em', textTransform: 'uppercase', borderRadius: 10, padding: '14px 28px' }}>
            Capture Your Next Show →
          </Link>
        </div>

        <div style={{ marginTop: 48, paddingTop: 32, borderTop: `1px solid ${C.border}` }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 16px' }}>Keep Reading</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { href: '/get-paid-for-live-shows', title: 'How to Get Paid for Live Performances (ASCAP, BMI, SOCAN Guide)' },
              { href: '/submit-setlists-pro', title: 'How to Submit Setlists to ASCAP, BMI & SOCAN (Step-by-Step)' },
              { href: '/what-is-live-performance-royalty', title: 'What Is a Live Performance Royalty? A Simple Explanation' },
            ].map(({ href, title }) => (
              <Link key={href} href={href} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, color: C.secondary, fontSize: 14 }}>
                <span style={{ color: C.gold, flexShrink: 0 }}>→</span>{title}
              </Link>
            ))}
          </div>
        </div>

      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; } body { margin: 0; }
      `}</style>
    </div>
  )
}
