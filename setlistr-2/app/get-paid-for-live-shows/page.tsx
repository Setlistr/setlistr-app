import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'How to Get Paid for Live Performances (ASCAP, BMI, SOCAN Guide) | Setlistr',
  description: 'Most performing artists are leaving real money on the table after every show. Here\'s exactly how to collect live performance royalties from ASCAP, BMI, SOCAN, PRS and more.',
  keywords: ['live performance royalties', 'get paid for live shows', 'ASCAP live', 'BMI live', 'SOCAN concert royalties', 'setlist submission', 'music royalties'],
  openGraph: {
    title: 'How to Get Paid for Live Performances',
    description: 'Most performing artists are leaving real money on the table after every show. Here\'s how to claim it.',
    url: 'https://setlistr.ai/get-paid-for-live-shows',
    siteName: 'Setlistr',
    type: 'article',
  },
  alternates: { canonical: 'https://setlistr.ai/get-paid-for-live-shows' },
}

const C = {
  bg: '#0a0908', card: '#141210', border: 'rgba(255,255,255,0.07)',
  borderGold: 'rgba(201,168,76,0.25)', text: '#f0ece3', secondary: '#b8a888',
  muted: '#8a7a68', gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.08)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.06)',
}

function Section({ children }: { children: React.ReactNode }) {
  return <section style={{ marginBottom: 48 }}>{children}</section>
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: '0 0 16px', letterSpacing: '-0.02em', lineHeight: 1.2 }}>{children}</h2>
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: '24px 0 10px', letterSpacing: '-0.01em' }}>{children}</h3>
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 16, color: C.secondary, lineHeight: 1.75, margin: '0 0 16px' }}>{children}</p>
}

function Callout({ children, color = C.gold }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{ background: color === C.gold ? C.goldDim : C.greenDim, border: `1px solid ${color === C.gold ? C.borderGold : 'rgba(74,222,128,0.2)'}`, borderRadius: 12, padding: '16px 20px', margin: '20px 0' }}>
      <p style={{ fontSize: 14, color: color === C.gold ? C.gold : C.green, margin: 0, lineHeight: 1.6 }}>{children}</p>
    </div>
  )
}

function ProCard({ name, program, deadline, tip }: { name: string; program: string; deadline: string; tip: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: C.gold }}>{name}</span>
        <span style={{ fontSize: 11, color: C.muted, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 20, padding: '2px 10px' }}>{deadline}</span>
      </div>
      <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 6px' }}>Program: <strong style={{ color: C.text }}>{program}</strong></p>
      <p style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.5 }}>💡 {tip}</p>
    </div>
  )
}

export default function GetPaidForLiveShows() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>

      {/* Ambient glow */}
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '50vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.07) 0%, transparent 65%)' }} />

      {/* Nav */}
      <nav style={{ position: 'relative', zIndex: 10, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 800, margin: '0 auto' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: C.gold, letterSpacing: '-0.02em' }}>Setlistr</span>
        </Link>
        <Link href="/app/dashboard" style={{ textDecoration: 'none', fontSize: 13, fontWeight: 700, color: '#0a0908', background: C.gold, borderRadius: 8, padding: '8px 16px', letterSpacing: '0.04em' }}>
          Start Free →
        </Link>
      </nav>

      <main style={{ position: 'relative', zIndex: 1, maxWidth: 720, margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Hero */}
        <div style={{ marginBottom: 56 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 20, padding: '4px 12px', marginBottom: 20 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.gold, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Live Royalties Guide</span>
          </div>
          <h1 style={{ fontSize: 42, fontWeight: 800, color: C.text, margin: '0 0 20px', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            How to Get Paid for<br /><span style={{ color: C.gold }}>Live Performances</span>
          </h1>
          <p style={{ fontSize: 18, color: C.secondary, lineHeight: 1.6, margin: '0 0 24px', maxWidth: 580 }}>
            Every time you play a licensed venue, your PRO collects a fee on your behalf. Most artists never claim it. Here's exactly how to get your money.
          </p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {['ASCAP', 'BMI', 'SOCAN', 'PRS', 'APRA'].map(pro => (
              <span key={pro} style={{ fontSize: 12, fontWeight: 700, color: C.muted, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px' }}>{pro}</span>
            ))}
          </div>
        </div>

        {/* The Big Reveal */}
        <Section>
          <Callout>
            <strong>The uncomfortable truth:</strong> Your venue paid your PRO a licensing fee the night you played. That money is sitting in a pool right now, waiting to be claimed. It stays unclaimed until you submit your setlist. Most artists never do — so the money gets redistributed to artists who did submit.
          </Callout>

          <H2>What Are Live Performance Royalties?</H2>
          <P>
            When you perform original songs at a licensed venue — a bar, club, concert hall, festival — that venue has paid a blanket license fee to your Performing Rights Organization (PRO). The PRO's job is to collect those fees and distribute them back to the songwriters whose music was performed.
          </P>
          <P>
            This is separate from streaming royalties, mechanical royalties, or sync fees. Live performance royalties exist specifically because of the act of performing your songs in front of an audience in a licensed space.
          </P>
          <P>
            The catch: your PRO has no way of knowing which songs you played unless you tell them. That's what a setlist submission is.
          </P>
        </Section>

        {/* How Much */}
        <Section>
          <H2>How Much Can You Earn?</H2>
          <P>
            It depends heavily on the venue size, territory, and your PRO — but here are real-world ranges based on published tariff data:
          </P>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '20px 0' }}>
            {[
              { venue: 'Bar / Club', range: '$2–6', note: 'per original song', color: C.muted },
              { venue: 'Mid-size Venue', range: '$5–18', note: 'per original song', color: C.secondary },
              { venue: 'Theatre / Hall', range: '$28–100', note: 'per original song', color: C.gold },
              { venue: 'Festival / Arena', range: '$50–280', note: 'per original song', color: C.green },
            ].map(({ venue, range, note, color }) => (
              <div key={venue} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px' }}>
                <p style={{ fontSize: 11, color: C.muted, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>{venue}</p>
                <p style={{ fontSize: 26, fontWeight: 800, color, margin: '0 0 2px', fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>{range}</p>
                <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{note}</p>
              </div>
            ))}
          </div>

          <P>
            These are writer's share figures only. If you're self-published — meaning you haven't signed with a publisher — you're entitled to collect both the writer's share and the publisher's share, effectively doubling these numbers.
          </P>

          <Callout color={C.green}>
            <strong>The annual math:</strong> A bar artist playing 50 shows a year with 12 original songs per set could be sitting on $2,400–$3,600 in unclaimed live royalties every single year. At festival pace, that number climbs into the tens of thousands.
          </Callout>
        </Section>

        {/* PRO by PRO */}
        <Section>
          <H2>How to Submit — By PRO</H2>
          <P>Every PRO has a slightly different process, but the core data they need is the same: your setlist, the venue, and the date.</P>

          <ProCard
            name="SOCAN"
            program="Set Lists & Performances (memp.socan.com)"
            deadline="1 year from show date"
            tip="Log into the new SOCAN portal at memp.socan.com. Go to Set Lists & Performances → Register New Set List. Add each song, then create the Live Performance and attach the setlist. You have up to one year but submit as soon as possible — the sooner SOCAN receives the license fee from the venue, the sooner you get paid."
          />
          <ProCard
            name="ASCAP"
            program="ASCAP OnStage (ascap.com/members)"
            deadline="Same quarter as performance"
            tip="Log in at ascap.com/members → Works → OnStage. Build your setlist, then create a Performance and attach it. ASCAP distributes quarterly so timing matters — submit before the quarter ends for the fastest payment."
          />
          <ProCard
            name="BMI"
            program="BMI Live (bmi.com)"
            deadline="9 months from show date"
            tip="Log in at bmi.com → your name dropdown → Online Services → BMI Live. Click Add a Performance, enter venue details, and search your songs. BMI requires direct deposit enrollment to receive payment — set this up first."
          />
          <ProCard
            name="PRS for Music"
            program="Live Music Reporting (prsformusic.com)"
            deadline="1 year from show date"
            tip="PRS pays a minimum per-gig rate for smaller venues regardless of audience size, which makes it worth submitting even for small club shows. Log in and go to Live Music → Submit a setlist."
          />
          <ProCard
            name="APRA AMCOS"
            program="Live Performance Reporting"
            deadline="1 year from show date"
            tip="APRA operates similarly to SOCAN. Log in at apraamcos.com.au/members and navigate to the Live Performance section to submit your setlist."
          />
        </Section>

        {/* What you need */}
        <Section>
          <H2>What You Need to Submit</H2>
          <P>Regardless of which PRO you're registered with, you'll need the same core information for each show:</P>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '16px 0' }}>
            {[
              { item: 'Venue name and address', note: 'Search by name in the PRO portal — it auto-populates' },
              { item: 'Date of performance', note: 'Exact date, not approximate' },
              { item: 'Your setlist', note: 'Title of every original song you performed' },
              { item: 'Your IPI/CAE number', note: 'Your unique songwriter identifier — find it in your PRO profile' },
              { item: 'Co-writer information', note: 'For co-written songs, the split and co-writer\'s IPI if known' },
              { item: 'Proof of performance', note: 'Some PROs require a ticket stub, contract, or poster — keep these' },
            ].map(({ item, note }) => (
              <div key={item} style={{ display: 'flex', gap: 14, padding: '12px 16px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
                <span style={{ color: C.gold, flexShrink: 0, marginTop: 1 }}>✓</span>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: '0 0 2px' }}>{item}</p>
                  <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>{note}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* The problem Setlistr solves */}
        <Section>
          <H2>The Problem Most Artists Face</H2>
          <P>
            The submission process itself is straightforward once you know it exists. The real problem is remembering what you played. A typical 12-song set played at 11pm after soundcheck, load-in, and three support acts is hard to reconstruct accurately the next morning — let alone six months later.
          </P>
          <P>
            That's why most live performance royalties go unclaimed. It's not ignorance of the system. It's that the data capture step — writing down what you played, in order, every single night — is friction that most touring artists skip.
          </P>

          <Callout color={C.green}>
            <strong>Setlistr automates the capture step.</strong> It listens during your set, detects songs via audio fingerprinting, and builds your setlist automatically. After the show, you confirm or adjust in under 90 seconds — then the submission data is ready and formatted for your PRO.
          </Callout>
        </Section>

        {/* CTA */}
        <div style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 16, padding: '32px', textAlign: 'center' }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: '0 0 10px', letterSpacing: '-0.02em' }}>
            Stop leaving royalties on stage
          </h2>
          <p style={{ fontSize: 15, color: C.secondary, margin: '0 0 24px', lineHeight: 1.6 }}>
            Setlistr automatically captures your setlist during the show. Free to start.
          </p>
          <Link href="/app/show/new" style={{ textDecoration: 'none', display: 'inline-block', background: C.gold, color: '#0a0908', fontWeight: 800, fontSize: 14, letterSpacing: '0.06em', textTransform: 'uppercase', borderRadius: 10, padding: '14px 28px' }}>
            Start Your First Show →
          </Link>
        </div>

        {/* Related */}
        <div style={{ marginTop: 48, paddingTop: 32, borderTop: `1px solid ${C.border}` }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 16px' }}>Keep Reading</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { href: '/unclaimed-music-royalties', title: 'Millions in Unclaimed Live Performance Royalties — Are You Missing Out?' },
              { href: '/submit-setlists-pro', title: 'How to Submit Setlists to ASCAP, BMI & SOCAN (Step-by-Step)' },
              { href: '/what-is-live-performance-royalty', title: 'What Is a Live Performance Royalty? A Simple Explanation' },
            ].map(({ href, title }) => (
              <Link key={href} href={href} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, color: C.secondary, fontSize: 14, fontWeight: 500, transition: 'border-color 0.15s ease' }}>
                <span style={{ color: C.gold, flexShrink: 0 }}>→</span>
                {title}
              </Link>
            ))}
          </div>
        </div>

      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
      `}</style>
    </div>
  )
}
