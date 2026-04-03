import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'What Is a Live Performance Royalty? A Simple Explanation | Setlistr',
  description: 'A plain-English explanation of what live performance royalties are, where the money comes from, who pays it, and how performing songwriters collect what they\'re owed.',
  keywords: ['what is live performance royalty', 'live performance royalty explained', 'PRO royalties explained', 'how do music royalties work', 'performing rights organization explained'],
  openGraph: {
    title: 'What Is a Live Performance Royalty? A Simple Explanation',
    description: 'A plain-English explanation of what live performance royalties are and how performing songwriters get paid.',
    url: 'https://setlistr.ai/what-is-live-performance-royalty',
    siteName: 'Setlistr',
    type: 'article',
  },
  alternates: { canonical: 'https://setlistr.ai/what-is-live-performance-royalty' },
}

const C = {
  bg: '#0a0908', card: '#141210', border: 'rgba(255,255,255,0.07)',
  borderGold: 'rgba(201,168,76,0.25)', text: '#f0ece3', secondary: '#b8a888',
  muted: '#8a7a68', gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.08)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.06)',
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 16, color: C.secondary, lineHeight: 1.75, margin: '0 0 16px' }}>{children}</p>
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '44px 0 14px', letterSpacing: '-0.02em', lineHeight: 1.2 }}>{children}</h2>
}

function Analogy({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.borderGold}`, borderLeft: `3px solid ${C.gold}`, borderRadius: '0 10px 10px 0', padding: '16px 20px', margin: '20px 0' }}>
      <p style={{ fontSize: 14, color: C.secondary, margin: 0, lineHeight: 1.6, fontStyle: 'italic' }}>{children}</p>
    </div>
  )
}

export default function WhatIsLivePerformanceRoyalty() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>

      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '50vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 65%)' }} />

      <nav style={{ position: 'relative', zIndex: 10, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 800, margin: '0 auto' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: C.gold, letterSpacing: '-0.02em' }}>Setlistr</span>
        </Link>
        <Link href="/app/dashboard" style={{ textDecoration: 'none', fontSize: 13, fontWeight: 700, color: '#0a0908', background: C.gold, borderRadius: 8, padding: '8px 16px' }}>
          Start Free →
        </Link>
      </nav>

      <main style={{ position: 'relative', zIndex: 1, maxWidth: 680, margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Hero */}
        <div style={{ marginBottom: 52 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 20, padding: '4px 12px', marginBottom: 20 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.gold, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Plain-English Explainer</span>
          </div>
          <h1 style={{ fontSize: 38, fontWeight: 800, color: C.text, margin: '0 0 20px', letterSpacing: '-0.03em', lineHeight: 1.15 }}>
            What Is a<br /><span style={{ color: C.gold }}>Live Performance Royalty?</span>
          </h1>
          <p style={{ fontSize: 18, color: C.secondary, lineHeight: 1.6, margin: 0, maxWidth: 540 }}>
            A plain-English explanation of one of the most misunderstood income streams in music — and why most performing songwriters are missing out on it entirely.
          </p>
        </div>

        {/* The core concept */}
        <P>
          A live performance royalty is money paid to a songwriter every time one of their original compositions is performed publicly in a licensed venue.
        </P>
        <P>
          Not when a recording of the song is played. Not when someone streams it. When a human being performs the song — on a stage, at a show — in a place that has paid for the right to have that music performed there.
        </P>

        <Analogy>
          Think of it like a vending machine. A bar installs a vending machine in their venue and pays a rental fee to the vending machine company. Every time a customer uses the machine, the company gets a cut. Live performance royalties work similarly — the venue pays a license fee to a Performing Rights Organization (PRO), and every time a song is performed there, the songwriter gets a portion of that fee.
        </Analogy>

        <H2>Where Does the Money Come From?</H2>
        <P>
          The money starts with the venue. Bars, clubs, concert halls, festivals, theatres, restaurants — any establishment where live music is performed publicly is legally required to hold a license from their country's Performing Rights Organization.
        </P>
        <P>
          In Canada, that's SOCAN. In the United States, it's ASCAP, BMI, SESAC, or GMR. In the UK, it's PRS for Music. In Australia, it's APRA AMCOS. Pretty much every country in the world has one.
        </P>
        <P>
          These license fees are calculated based on the size and type of the venue — a festival pays far more than a neighborhood bar. All of those fees flow into the PRO's royalty pool.
        </P>

        <H2>How Does It Get to the Songwriter?</H2>
        <P>
          The PRO's job is to take that pool of money and distribute it to the songwriters whose music was actually performed. Here's where it gets interesting: the PRO has no way of knowing what songs were played at a venue unless someone tells them.
        </P>
        <P>
          That's what a setlist submission is. After your show, you log into your PRO's portal and submit a list of every original song you performed, along with the venue and date. The PRO matches your submission to the license fee paid by that venue and sends you your share of the royalties.
        </P>
        <P>
          If you don't submit, the money sits in the pool. Eventually, if it goes unclaimed, it gets redistributed to artists who did submit — or absorbed into the PRO's operating costs.
        </P>

        <H2>Who Qualifies?</H2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '16px 0' }}>
          {[
            { q: 'Do I have to be famous?', a: 'No. Any songwriter registered with a PRO who performs original compositions at licensed venues qualifies.' },
            { q: 'Does the venue have to be big?', a: 'No. Bars, small clubs, and restaurants all qualify as long as they\'re licensed — and most are. SOCAN requires a minimum $10 cover charge for bar shows. ASCAP and BMI have no cover charge requirement.' },
            { q: 'Do I need a label or publisher?', a: 'No. If you\'re self-published — which most independent artists are — you collect both the writer\'s share and the publisher\'s share. That can double your royalty amount.' },
            { q: 'What if I play cover songs?', a: 'Covers don\'t generate royalties for you — they generate royalties for the original songwriter. Only your original compositions qualify.' },
            { q: 'What if I co-wrote the song?', a: 'Royalties are split according to the writer shares you registered with your PRO. A 50/50 co-write means each writer gets half of the songwriter\'s portion.' },
          ].map(({ q, a }) => (
            <div key={q} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px' }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: '0 0 6px' }}>{q}</p>
              <p style={{ fontSize: 13, color: C.secondary, margin: 0, lineHeight: 1.5 }}>{a}</p>
            </div>
          ))}
        </div>

        <H2>How Much Is a Live Performance Royalty Worth?</H2>
        <P>
          It varies significantly by territory, PRO, and venue size. Based on published tariff data:
        </P>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', margin: '16px 0' }}>
          {[
            { venue: 'Small bar or café', canada: '$2–6', us: '$1–5' },
            { venue: 'Club or mid-size venue', canada: '$5–18', us: '$3–12' },
            { venue: 'Theatre or concert hall', canada: '$28–100', us: '$10–40' },
            { venue: 'Festival or arena', canada: '$50–280', us: '$30–150' },
          ].map(({ venue, canada, us }, i) => (
            <div key={venue} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', padding: '12px 18px', borderBottom: i < 3 ? `1px solid ${C.border}` : 'none', alignItems: 'center' }}>
              {i === 0 && null}
              <span style={{ fontSize: 13, color: C.secondary }}>{venue}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.gold, fontFamily: '"DM Mono", monospace' }}>{canada} <span style={{ fontSize: 10, color: C.muted, fontFamily: '"DM Sans", sans-serif', fontWeight: 400 }}>SOCAN</span></span>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.secondary, fontFamily: '"DM Mono", monospace' }}>{us} <span style={{ fontSize: 10, color: C.muted, fontFamily: '"DM Sans", sans-serif', fontWeight: 400 }}>ASCAP/BMI</span></span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Per original song, writer's share only. Self-published artists may collect up to 2× these figures.</p>

        <H2>When Do You Get Paid?</H2>
        <P>
          PROs distribute royalties on a quarterly basis, typically 6–10 months after the performance. SOCAN takes 8–10 months for most domestic performances. ASCAP distributes 12 times per year. BMI pays quarterly.
        </P>
        <P>
          This delay is normal and expected. Think of it as money you earned tonight that arrives next year — which makes consistent setlist submission all the more important, since the habit compounds over time.
        </P>

        <H2>How Do You Start Collecting?</H2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '16px 0 32px' }}>
          {[
            { n: 1, step: 'Join a PRO', detail: 'SOCAN (Canada), ASCAP or BMI (US), PRS (UK), APRA AMCOS (Australia). Membership is free or low-cost for songwriters.' },
            { n: 2, step: 'Register your songs', detail: 'Your PRO can only pay you for songs that are registered in their system. Add your catalog including co-writer splits.' },
            { n: 3, step: 'Submit your setlists', detail: 'After every show, log into your PRO portal and submit the songs you performed, the venue, and the date.' },
            { n: 4, step: 'Keep records', detail: 'Some PROs require proof of performance. Keep ticket stubs, posters, or contracts for at least a year after each show.' },
          ].map(({ n, step, detail }) => (
            <div key={n} style={{ display: 'flex', gap: 16, padding: '14px 18px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: C.gold }}>{n}</span>
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>{step}</p>
                <p style={{ fontSize: 13, color: C.muted, margin: 0, lineHeight: 1.5 }}>{detail}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 16, padding: '28px', textAlign: 'center', marginBottom: 48 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 10px', letterSpacing: '-0.02em' }}>
            The capture step, automated
          </h2>
          <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 20px', lineHeight: 1.6 }}>
            Setlistr listens during your show and automatically builds your setlist for PRO submission. Free to start.
          </p>
          <Link href="/app/show/new" style={{ textDecoration: 'none', display: 'inline-block', background: C.gold, color: '#0a0908', fontWeight: 800, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', borderRadius: 10, padding: '12px 24px' }}>
            Start Your First Show →
          </Link>
        </div>

        <div style={{ paddingTop: 32, borderTop: `1px solid ${C.border}` }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 16px' }}>Keep Reading</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { href: '/get-paid-for-live-shows', title: 'How to Get Paid for Live Performances (ASCAP, BMI, SOCAN Guide)' },
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

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; } body { margin: 0; }
      `}</style>
    </div>
  )
}
