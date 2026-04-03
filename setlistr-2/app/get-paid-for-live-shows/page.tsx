import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'

export const metadata: Metadata = {
  title: 'How to Get Paid for Live Performances (ASCAP, BMI, SOCAN Guide) | Setlistr',
  description: "Most performing artists are leaving real money on the table after every show. Here's exactly how to collect live performance royalties from ASCAP, BMI, SOCAN, PRS and more.",
  keywords: ['live performance royalties', 'get paid for live shows', 'ASCAP live', 'BMI live', 'SOCAN concert royalties', 'setlist submission', 'music royalties'],
  openGraph: {
    title: 'Most artists never get paid for live shows. Here\'s how to fix that.',
    description: "Where the money comes from, how much you're owed, and the exact steps to claim it.",
    url: 'https://setlistr.ai/get-paid-for-live-shows',
    siteName: 'Setlistr', type: 'article',
  },
  alternates: { canonical: 'https://setlistr.ai/get-paid-for-live-shows' },
}

const C = {
  bg: '#0a0908', card: '#141210', border: 'rgba(255,255,255,0.07)',
  borderGold: 'rgba(201,168,76,0.25)', text: '#f0ece3', secondary: '#b8a888',
  muted: '#8a7a68', gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.08)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.06)',
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
          { href: '/unclaimed-music-royalties', label: 'Unclaimed Royalties' },
          { href: '/submit-setlists-pro', label: 'Submit Setlists' },
          { href: '/what-is-live-performance-royalty', label: 'What Are Live Royalties?' },
        ].map(({ href, label }) => (
          <Link key={href} href={href} style={{ textDecoration: 'none', fontSize: 12, color: C.muted, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 10px' }}>{label}</Link>
        ))}
      </div>
      <p style={{ fontSize: 11, color: C.muted, margin: 0, lineHeight: 1.6 }}>
        © {new Date().getFullYear()} Setlistr · Live performance tracking and royalty submission.<br />
        <span style={{ opacity: 0.6 }}>Works with SOCAN, ASCAP, BMI, PRS, APRA and all major PROs.</span>
      </p>
    </footer>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 16, color: C.secondary, lineHeight: 1.75, margin: '0 0 16px' }}>{children}</p>
}
function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: '48px 0 16px', letterSpacing: '-0.02em', lineHeight: 1.2 }}>{children}</h2>
}
function Callout({ children, color = C.gold }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{ background: color === C.gold ? C.goldDim : C.greenDim, border: `1px solid ${color === C.gold ? C.borderGold : 'rgba(74,222,128,0.2)'}`, borderRadius: 12, padding: '16px 20px', margin: '20px 0' }}>
      <p style={{ fontSize: 14, color: color === C.gold ? C.gold : C.green, margin: 0, lineHeight: 1.6 }}>{children}</p>
    </div>
  )
}

export default function GetPaidForLiveShows() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '50vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.07) 0%, transparent 65%)' }} />

      <Nav />

      <main style={{ position: 'relative', zIndex: 1, maxWidth: 720, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* Hero with logo watermark */}
        <div style={{ position: 'relative', marginBottom: 56, overflow: 'hidden' }}>
          {/* Watermark */}
          <div style={{ position: 'absolute', right: -40, top: '50%', transform: 'translateY(-50%)', opacity: 0.035, pointerEvents: 'none' }}>
            <Image src="/logo-white.png" alt="" width={280} height={74} style={{ objectFit: 'contain' }} />
          </div>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 20, padding: '4px 12px', marginBottom: 20 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.gold, letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Live Royalties Guide</span>
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 42px)', fontWeight: 800, color: C.text, margin: '0 0 20px', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            Most artists never get paid<br />for live shows.<br /><span style={{ color: C.gold }}>Here's how to fix that.</span>
          </h1>
          <p style={{ fontSize: 17, color: C.secondary, lineHeight: 1.6, margin: 0, maxWidth: 560 }}>
            Every time you play a licensed venue, your PRO collects a fee on your behalf. Most artists never claim it.
          </p>
        </div>

        <Callout>
          <strong>The uncomfortable truth:</strong> Your venue paid your PRO a licensing fee the night you played. That money is sitting in a pool right now, waiting to be claimed. It stays unclaimed until you submit your setlist. Most artists never do — so the money gets redistributed to artists who did submit.
        </Callout>

        <H2>What Are Live Performance Royalties?</H2>
        <P>When you perform original songs at a licensed venue — a bar, club, concert hall, festival — that venue has paid a blanket license fee to your Performing Rights Organization (PRO). The PRO's job is to collect those fees and distribute them back to the songwriters whose music was performed.</P>
        <P>This is separate from streaming royalties, mechanical royalties, or sync fees. Live performance royalties exist specifically because of the act of performing your songs in front of an audience in a licensed space.</P>
        <P>The catch: your PRO has no way of knowing which songs you played unless you tell them. That's what a setlist submission is.</P>

        <H2>How Much Can You Earn?</H2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '20px 0' }}>
          {[
            { venue: 'Bar / Club', range: '$2–6', color: C.muted },
            { venue: 'Mid-size Venue', range: '$5–18', color: C.secondary },
            { venue: 'Theatre / Hall', range: '$28–100', color: C.gold },
            { venue: 'Festival / Arena', range: '$50–280', color: C.green },
          ].map(({ venue, range, color }) => (
            <div key={venue} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px' }}>
              <p style={{ fontSize: 11, color: C.muted, margin: '0 0 6px', textTransform: 'uppercase' as const, letterSpacing: '0.08em', fontWeight: 700 }}>{venue}</p>
              <p style={{ fontSize: 26, fontWeight: 800, color, margin: '0 0 2px', fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>{range}</p>
              <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>per original song</p>
            </div>
          ))}
        </div>
        <P>These are writer's share figures only. Self-published artists collect both writer and publisher share — effectively doubling these numbers.</P>

        <Callout color={C.green}>
          <strong>The annual math:</strong> A bar artist playing 50 shows a year with 12 original songs per set could be sitting on $2,400–$3,600 in unclaimed live royalties every year. At festival pace, that number climbs into the tens of thousands.
        </Callout>

        <H2>How to Submit — By PRO</H2>
        <P>Every PRO has a slightly different process, but the core data they need is the same: your setlist, the venue, and the date. <Link href="/submit-setlists-pro" style={{ color: C.gold }}>See the full step-by-step guide for every PRO →</Link></P>

        {[
          { name: 'SOCAN', deadline: '1 year', tip: 'Log into memp.socan.com → Set Lists & Performances → Register New Set List. Add each song, attach to the performance, submit.' },
          { name: 'ASCAP', deadline: 'Same quarter', tip: 'Log in at ascap.com/members → Works → OnStage. Build your setlist, create a Performance, attach and submit.' },
          { name: 'BMI', deadline: '9 months', tip: 'Log in at bmi.com → Online Services → BMI Live → Add a Performance. Search songs by title, submit.' },
          { name: 'PRS', deadline: '1 year', tip: 'Log in at prsformusic.com/login → Live Music → Submit a setlist. PRS pays a minimum per-gig rate even for small venues.' },
        ].map(({ name, deadline, tip }) => (
          <div key={name} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: C.gold }}>{name}</span>
              <span style={{ fontSize: 11, color: C.muted, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 20, padding: '2px 10px' }}>{deadline}</span>
            </div>
            <p style={{ fontSize: 13, color: C.secondary, margin: 0, lineHeight: 1.5 }}>💡 {tip}</p>
          </div>
        ))}

        <H2>What You Need to Submit</H2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '16px 0' }}>
          {[
            'Venue name and address',
            'Date of performance',
            'Your setlist — every original song you performed',
            'Your IPI/CAE number (find it in your PRO profile)',
            'Co-writer splits for co-written songs',
          ].map(item => (
            <div key={item} style={{ display: 'flex', gap: 12, padding: '11px 16px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <span style={{ color: C.gold, flexShrink: 0 }}>✓</span>
              <span style={{ fontSize: 14, color: C.secondary }}>{item}</span>
            </div>
          ))}
        </div>

        <H2>The Problem Most Artists Face</H2>
        <P>The submission process is straightforward once you know it. The real problem is remembering what you played. A 12-song set at 11pm after soundcheck and load-in is hard to reconstruct accurately the next morning.</P>
        <P>That's why most live royalties go unclaimed. Not ignorance of the system — friction at the data capture step.</P>

        <Callout color={C.green}>
          <strong>Setlistr automates the capture step.</strong> It listens during your set, detects songs via audio fingerprinting, and builds your setlist automatically. After the show, you confirm in under 90 seconds — then the submission data is ready and formatted for your PRO.
        </Callout>

        <div style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 16, padding: '32px', textAlign: 'center', marginTop: 48 }}>
          <Image src="/logo-white.png" alt="Setlistr" width={120} height={32} style={{ objectFit: 'contain', marginBottom: 16, opacity: 0.8 }} />
          <h2 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: '0 0 10px', letterSpacing: '-0.02em' }}>Stop leaving royalties on stage</h2>
          <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 24px', lineHeight: 1.6 }}>Setlistr automatically captures your setlist during the show. Free to start.</p>
          <Link href="/app/show/new" style={{ textDecoration: 'none', display: 'inline-block', background: C.gold, color: '#0a0908', fontWeight: 800, fontSize: 14, letterSpacing: '0.06em', textTransform: 'uppercase' as const, borderRadius: 10, padding: '14px 28px' }}>
            Start Your First Show →
          </Link>
        </div>

        {/* Related */}
        <div style={{ marginTop: 48, paddingTop: 32, borderTop: `1px solid ${C.border}` }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase' as const, margin: '0 0 16px' }}>Keep Reading</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { href: '/unclaimed-music-royalties', title: 'Millions in Unclaimed Live Performance Royalties — Are You Missing Out?' },
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
