import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'

export const metadata: Metadata = {
  title: 'What Is a Live Performance Royalty? A Simple Explanation | Setlistr',
  description: "A plain-English explanation of what live performance royalties are, where the money comes from, who pays it, and how performing songwriters collect what they're owed.",
  keywords: ['what is live performance royalty', 'live performance royalty explained', 'PRO royalties explained', 'how do music royalties work'],
  openGraph: {
    title: 'What Is a Live Performance Royalty? A Simple Explanation',
    description: 'The clearest explanation of how live royalties work and why most artists are missing out.',
    url: 'https://setlistr.ai/what-is-live-performance-royalty',
    siteName: 'Setlistr', type: 'article',
  },
  alternates: { canonical: 'https://setlistr.ai/what-is-live-performance-royalty' },
}

const C = {
  bg: '#0a0908', card: '#141210', border: 'rgba(255,255,255,0.07)',
  borderGold: 'rgba(201,168,76,0.25)', text: '#f0ece3', secondary: '#b8a888',
  muted: '#8a7a68', gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.08)',
  green: '#4ade80',
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
          { href: '/unclaimed-music-royalties', label: 'Unclaimed Royalties' },
          { href: '/submit-setlists-pro', label: 'Submit Setlists' },
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

export default function WhatIsLivePerformanceRoyalty() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '50vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 65%)' }} />

      <Nav />

      <main style={{ position: 'relative', zIndex: 1, maxWidth: 680, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* Hero */}
        <div style={{ position: 'relative', marginBottom: 48, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -20, top: '50%', transform: 'translateY(-50%)', opacity: 0.03, pointerEvents: 'none' }}>
            <Image src="/logo-white.png" alt="" width={260} height={68} style={{ objectFit: 'contain' }} />
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 20, padding: '4px 12px', marginBottom: 20 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.gold, letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Plain-English Explainer</span>
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 40px)', fontWeight: 800, color: C.text, margin: '0 0 20px', letterSpacing: '-0.03em', lineHeight: 1.15 }}>
            What is a live performance royalty?<br /><span style={{ color: C.gold }}>A simple explanation.</span>
          </h1>
          <p style={{ fontSize: 17, color: C.secondary, lineHeight: 1.6, margin: 0, maxWidth: 520 }}>
            One of the most misunderstood income streams in music — and why most performing songwriters are missing out on it entirely.
          </p>
        </div>

        <P>A live performance royalty is money paid to a songwriter every time one of their original compositions is performed publicly in a licensed venue.</P>
        <P>Not when a recording plays. Not when someone streams it. When a human being performs the song — on a stage — in a place that has paid for the right to have music performed there.</P>

        {/* Analogy */}
        <div style={{ background: C.card, border: `1px solid ${C.borderGold}`, borderLeft: `3px solid ${C.gold}`, borderRadius: '0 10px 10px 0', padding: '16px 20px', margin: '24px 0' }}>
          <p style={{ fontSize: 14, color: C.secondary, margin: 0, lineHeight: 1.6, fontStyle: 'italic' }}>
            Think of it like a vending machine rental. A bar pays a rental fee to the vending machine company, and every customer use generates a cut. Live performance royalties work similarly — the venue pays a license fee to a PRO, and every time a song is performed there, the songwriter gets a portion.
          </p>
        </div>

        <H2>Where Does the Money Come From?</H2>
        <P>The money starts with the venue. Bars, clubs, concert halls, festivals, restaurants — any establishment where live music is performed is legally required to hold a license from their country's Performing Rights Organization.</P>
        <P>In Canada that's SOCAN. In the US it's ASCAP, BMI, SESAC, or GMR. In the UK it's PRS. In Australia it's APRA AMCOS. Every country has one, and they all work together through reciprocal agreements.</P>

        <H2>How Does It Get to the Songwriter?</H2>
        <P>The PRO takes that pool of money and distributes it to the songwriters whose music was actually performed. But here's the critical part: the PRO has no way of knowing what songs were played unless someone tells them.</P>
        <P>That's a setlist submission. After your show, you log into your PRO's portal and submit the songs you performed, the venue, and the date. The PRO matches it to the license fee paid and sends you your share.</P>
        <P>If you don't submit, the money sits. Eventually it gets redistributed to artists who did submit — or absorbed into operating costs. <Link href="/unclaimed-music-royalties" style={{ color: C.gold }}>See how much goes unclaimed every year →</Link></P>

        <H2>Who Qualifies?</H2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '16px 0' }}>
          {[
            { q: 'Do I have to be famous?', a: 'No. Any songwriter registered with a PRO who performs originals at licensed venues qualifies.' },
            { q: 'Does the venue have to be big?', a: 'No. Bars and small clubs qualify as long as they\'re licensed — and most are. SOCAN requires a minimum $10 cover. ASCAP/BMI have no cover requirement.' },
            { q: 'Do I need a label or publisher?', a: 'No. Self-published artists collect both the writer\'s share and the publisher\'s share — potentially doubling the royalty.' },
            { q: 'What about cover songs?', a: 'Covers generate royalties for the original songwriter, not you. Only your original compositions qualify.' },
            { q: 'What if I co-wrote the song?', a: 'Royalties split according to the writer shares registered with your PRO. 50/50 co-write = each writer gets half.' },
          ].map(({ q, a }) => (
            <div key={q} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 18px' }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: '0 0 6px' }}>{q}</p>
              <p style={{ fontSize: 13, color: C.secondary, margin: 0, lineHeight: 1.5 }}>{a}</p>
            </div>
          ))}
        </div>

        <H2>How Much Is It Worth?</H2>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', margin: '16px 0' }}>
          <div style={{ padding: '10px 18px', borderBottom: `1px solid ${C.border}`, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
            {['Venue', 'SOCAN (CA)', 'ASCAP/BMI (US)'].map(h => (
              <span key={h} style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>{h}</span>
            ))}
          </div>
          {[
            { venue: 'Small bar or café', ca: '$2–6', us: '$1–5' },
            { venue: 'Club / mid-size', ca: '$5–18', us: '$3–12' },
            { venue: 'Theatre / hall', ca: '$28–100', us: '$10–40' },
            { venue: 'Festival / arena', ca: '$50–280', us: '$30–150' },
          ].map(({ venue, ca, us }, i, arr) => (
            <div key={venue} style={{ padding: '12px 18px', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: C.secondary }}>{venue}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.gold, fontFamily: '"DM Mono", monospace' }}>{ca}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.secondary, fontFamily: '"DM Mono", monospace' }}>{us}</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: C.muted, margin: '8px 0 0' }}>Per original song, writer's share only. Self-published artists may collect up to 2× these figures.</p>

        <H2>When Do You Get Paid?</H2>
        <P>PROs distribute royalties quarterly, typically 6–10 months after the performance. SOCAN takes 8–10 months for most domestic performances. Think of it as money earned tonight that arrives next year — which makes consistent submission all the more important.</P>

        <H2>How Do You Start?</H2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '16px 0 40px' }}>
          {[
            { step: 'Join a PRO', detail: 'SOCAN (Canada), ASCAP or BMI (US), PRS (UK), APRA AMCOS (Australia). Free or low-cost for songwriters.' },
            { step: 'Register your songs', detail: 'Your PRO can only pay you for registered works. Add your catalog with co-writer splits.' },
            { step: 'Submit your setlists', detail: 'After every show, log into your PRO portal and submit the songs, venue, and date.' },
            { step: 'Keep records', detail: 'Some PROs require proof of performance. Keep ticket stubs, posters, or contracts for at least a year.' },
          ].map(({ step, detail }, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, padding: '14px 18px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: C.gold }}>{i + 1}</span>
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>{step}</p>
                <p style={{ fontSize: 13, color: C.muted, margin: 0, lineHeight: 1.5 }}>{detail}</p>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 16, padding: '28px', textAlign: 'center', marginBottom: 48 }}>
          <Image src="/logo-white.png" alt="Setlistr" width={120} height={32} style={{ objectFit: 'contain', marginBottom: 16, opacity: 0.8 }} />
          <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 10px', letterSpacing: '-0.02em' }}>The capture step, automated</h2>
          <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 20px', lineHeight: 1.6 }}>Setlistr listens during your show and automatically builds your setlist for PRO submission. Free to start.</p>
          <Link href="/app/show/new" style={{ textDecoration: 'none', display: 'inline-block', background: C.gold, color: '#0a0908', fontWeight: 800, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase' as const, borderRadius: 10, padding: '12px 24px' }}>
            Start Your First Show →
          </Link>
        </div>

        <div style={{ paddingTop: 32, borderTop: `1px solid ${C.border}` }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase' as const, margin: '0 0 16px' }}>Keep Reading</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { href: '/get-paid-for-live-shows', title: 'How to Get Paid for Live Performances (Full Guide)' },
              { href: '/unclaimed-music-royalties', title: 'Millions in Unclaimed Live Performance Royalties — Are You Missing Out?' },
              { href: '/submit-setlists-pro', title: 'How to Submit Setlists to ASCAP, BMI & SOCAN (Step-by-Step)' },
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
