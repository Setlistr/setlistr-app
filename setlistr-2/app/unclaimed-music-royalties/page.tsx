import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'

export const metadata: Metadata = {
  title: 'Millions in Unclaimed Live Performance Royalties — Are You Missing Out? | Setlistr',
  description: "Billions in live performance royalties go unclaimed every year because artists don't submit their setlists. Find out how much you might be owed.",
  keywords: ['unclaimed music royalties', 'unclaimed live performance royalties', 'setlist submission', 'PRO royalties unclaimed'],
  openGraph: {
    title: 'Millions in Unclaimed Live Performance Royalties — Are You Missing Out?',
    description: 'Your money is going to artists who did submit. Here\'s the scale of what\'s being left behind.',
    url: 'https://setlistr.ai/unclaimed-music-royalties',
    siteName: 'Setlistr', type: 'article',
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

function Nav() {
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(10,9,8,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <Image src="/logo-white.png" alt="Setlistr" width={130} height={34} priority style={{ objectFit: 'contain' }} />
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link href="/get-paid" style={{ textDecoration: 'none', fontSize: 13, fontWeight: 600, color: C.muted, padding: '6px 10px' }}>Get Paid</Link>
          <Link href="/app/show/new" style={{ textDecoration: 'none', fontSize: 13, fontWeight: 700, color: '#0a0908', background: C.gold, borderRadius: 8, padding: '8px 16px' }}>Start Free →</Link>
        </div>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer style={{ borderTop: `1px solid ${C.border}`, padding: '40px 24px', maxWidth: 760, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <Image src="/logo-white.png" alt="Setlistr" width={110} height={29} style={{ objectFit: 'contain', opacity: 0.6 }} />
        </Link>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 20 }}>
        {[
          { href: '/get-paid', label: 'Get Paid Hub' },
          { href: '/get-paid-for-live-shows', label: 'How to Get Paid' },
          { href: '/submit-setlists-pro', label: 'Submit Setlists' },
          { href: '/what-is-live-performance-royalty', label: 'What Are Live Royalties?' },
        ].map(({ href, label }) => (
          <Link key={href} href={href} style={{ textDecoration: 'none', fontSize: 12, color: C.muted, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 10px' }}>{label}</Link>
        ))}
      </div>
      <p style={{ fontSize: 11, color: C.muted, margin: 0, lineHeight: 1.6 }}>© {new Date().getFullYear()} Setlistr · Works with SOCAN, ASCAP, BMI, PRS, APRA and all major PROs.</p>
    </footer>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 16, color: C.secondary, lineHeight: 1.75, margin: '0 0 16px' }}>{children}</p>
}
function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '44px 0 14px', letterSpacing: '-0.02em' }}>{children}</h2>
}

export default function UnclaimedRoyalties() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '50vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(248,113,113,0.05) 0%, transparent 65%)' }} />

      <Nav />

      <main style={{ position: 'relative', zIndex: 1, maxWidth: 720, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* Hero */}
        <div style={{ position: 'relative', marginBottom: 48, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -20, top: '50%', transform: 'translateY(-50%)', opacity: 0.03, pointerEvents: 'none' }}>
            <Image src="/logo-white.png" alt="" width={260} height={68} style={{ objectFit: 'contain' }} />
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.redDim, border: '1px solid rgba(248,113,113,0.2)', borderRadius: 20, padding: '4px 12px', marginBottom: 20 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.red, letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Are You Missing Out?</span>
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 40px)', fontWeight: 800, color: C.text, margin: '0 0 20px', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            Millions in unclaimed royalties —<br /><span style={{ color: C.red }}>your money is going to someone else.</span>
          </h1>
          <p style={{ fontSize: 17, color: C.secondary, lineHeight: 1.6, margin: 0, maxWidth: 560 }}>
            When you don't submit your setlist, the money doesn't disappear. It gets redistributed to artists who did.
          </p>
        </div>

        {/* Big number */}
        <div style={{ background: C.card, border: `1px solid ${C.borderGold}`, borderRadius: 16, padding: '32px', marginBottom: 40, textAlign: 'center' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.gold, letterSpacing: '0.12em', textTransform: 'uppercase' as const, margin: '0 0 10px' }}>SOCAN distributed in 2024</p>
          <p style={{ fontSize: 56, fontWeight: 800, color: C.gold, margin: '0 0 8px', fontFamily: '"DM Mono", monospace', letterSpacing: '-0.03em' }}>$512M</p>
          <p style={{ fontSize: 14, color: C.secondary, margin: 0 }}>And that's just one PRO — in one country</p>
        </div>

        <P>SOCAN distributed a record $512.4 million in 2024. ASCAP and BMI each distribute over $1 billion annually in the US alone. A significant portion — the live performance slice — depends entirely on artists submitting setlists. When they don't, the money goes to artists who did.</P>

        <H2>Why Does This Happen?</H2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '16px 0' }}>
          {[
            { label: "You don't remember the setlist", detail: 'A 12-song set played at 11pm after a long day is hard to reconstruct accurately the next morning.' },
            { label: 'The submission window feels distant', detail: 'SOCAN gives you a year. ASCAP wants same-quarter. The deadline feels far away — until it isn\'t.' },
            { label: 'The portal UX is genuinely painful', detail: 'PRO portals were not designed for mobile-first touring musicians. Clunky, desktop-centric, and slow.' },
            { label: 'The amounts feel too small to bother', detail: 'A single bar show might yield $30–75 in royalties. Across 100 shows a year, that\'s $3,000–7,500 unclaimed.' },
          ].map(({ label, detail }) => (
            <div key={label} style={{ display: 'flex', gap: 14, padding: '14px 18px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
              <span style={{ color: C.red, flexShrink: 0, fontSize: 16 }}>✕</span>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>{label}</p>
                <p style={{ fontSize: 13, color: C.muted, margin: 0, lineHeight: 1.5 }}>{detail}</p>
              </div>
            </div>
          ))}
        </div>

        <H2>How Much Are You Leaving Behind?</H2>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', margin: '16px 0' }}>
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8 }}>
            {['Scenario', 'Shows/yr', 'Songs', 'Est. unclaimed'].map(h => (
              <span key={h} style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>{h}</span>
            ))}
          </div>
          {[
            { scenario: 'Bar circuit',      shows: 50,  songs: 10, low: '$1k',  high: '$3k' },
            { scenario: 'Club / mid-size',  shows: 60,  songs: 12, low: '$3.6k', high: '$13k' },
            { scenario: 'Theatre touring',  shows: 40,  songs: 15, low: '$17k', high: '$60k' },
            { scenario: 'Festival season',  shows: 20,  songs: 10, low: '$10k', high: '$56k' },
          ].map(({ scenario, shows, songs, low, high }, i, arr) => (
            <div key={scenario} style={{ padding: '13px 18px', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{scenario}</span>
              <span style={{ fontSize: 13, color: C.secondary, fontFamily: '"DM Mono", monospace' }}>{shows}</span>
              <span style={{ fontSize: 13, color: C.secondary, fontFamily: '"DM Mono", monospace' }}>{songs}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.gold, fontFamily: '"DM Mono", monospace' }}>{low}–{high}</span>
            </div>
          ))}
        </div>

        <H2>What You Can Do Right Now</H2>
        <P>The fix is straightforward: <Link href="/submit-setlists-pro" style={{ color: C.gold }}>submit your setlists</Link>. But the harder problem is having accurate setlist data in the first place.</P>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '16px 0 40px' }}>
          {[
            'Join a PRO if you haven\'t — SOCAN, ASCAP, BMI, PRS, or APRA',
            'Register your songs in their catalog',
            'Submit setlists for past shows — most PROs give you 6–12 months retroactively',
            'Check your PRO\'s "Unidentified Concerts" list — your show may already be logged',
            'Build a habit of capturing setlists immediately after every show',
          ].map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 14, padding: '12px 16px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: C.gold, fontFamily: '"DM Mono", monospace', flexShrink: 0, minWidth: 20 }}>{i + 1}.</span>
              <p style={{ fontSize: 14, color: C.secondary, margin: 0, lineHeight: 1.5 }}>{step}</p>
            </div>
          ))}
        </div>

        <div style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 16, padding: '32px', textAlign: 'center' }}>
          <Image src="/logo-white.png" alt="Setlistr" width={120} height={32} style={{ objectFit: 'contain', marginBottom: 16, opacity: 0.8 }} />
          <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 10px', letterSpacing: '-0.02em' }}>Never miss a setlist again</h2>
          <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 24px', lineHeight: 1.6 }}>Setlistr listens during your show and builds the setlist automatically. Free to start.</p>
          <Link href="/app/show/new" style={{ textDecoration: 'none', display: 'inline-block', background: C.gold, color: '#0a0908', fontWeight: 800, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase' as const, borderRadius: 10, padding: '13px 28px' }}>
            Capture Your Next Show →
          </Link>
        </div>

        <div style={{ marginTop: 48, paddingTop: 32, borderTop: `1px solid ${C.border}` }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase' as const, margin: '0 0 16px' }}>Keep Reading</p>
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

      <Footer />
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap'); *{box-sizing:border-box;} body{margin:0;}`}</style>
    </div>
  )
}
