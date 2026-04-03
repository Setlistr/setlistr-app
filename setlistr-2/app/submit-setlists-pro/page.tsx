import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'

export const metadata: Metadata = {
  title: 'How to Submit Setlists to ASCAP, BMI & SOCAN (Step-by-Step) | Setlistr',
  description: "A complete step-by-step guide to submitting your setlists to every major PRO's live performance portal so you can stop leaving money on stage.",
  keywords: ['submit setlist ASCAP', 'submit setlist BMI', 'submit setlist SOCAN', 'ASCAP OnStage', 'BMI Live', 'live performance royalty submission'],
  openGraph: {
    title: 'How to Submit Setlists to ASCAP, BMI & SOCAN (Step-by-Step)',
    description: 'Stop leaving money on stage. A complete walkthrough of every major PRO\'s submission portal.',
    url: 'https://setlistr.ai/submit-setlists-pro',
    siteName: 'Setlistr', type: 'article',
  },
  alternates: { canonical: 'https://setlistr.ai/submit-setlists-pro' },
}

const C = {
  bg: '#0a0908', card: '#141210', border: 'rgba(255,255,255,0.07)',
  borderGold: 'rgba(201,168,76,0.25)', text: '#f0ece3', secondary: '#b8a888',
  muted: '#8a7a68', gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.08)',
  green: '#4ade80', blue: '#60a5fa', blueDim: 'rgba(96,165,250,0.06)',
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
          { href: '/what-is-live-performance-royalty', label: 'What Are Live Royalties?' },
        ].map(({ href, label }) => (
          <Link key={href} href={href} style={{ textDecoration: 'none', fontSize: 12, color: C.muted, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 10px' }}>{label}</Link>
        ))}
      </div>
      <p style={{ fontSize: 11, color: C.muted, margin: 0, lineHeight: 1.6 }}>© {new Date().getFullYear()} Setlistr · Works with SOCAN, ASCAP, BMI, PRS, APRA and all major PROs.</p>
    </footer>
  )
}

function Step({ n, title, detail }: { n: number; title: string; detail: string }) {
  return (
    <div style={{ display: 'flex', gap: 16, padding: '14px 18px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 8 }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.gold, fontFamily: '"DM Mono", monospace' }}>{n}</span>
      </div>
      <div>
        <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>{title}</p>
        <p style={{ fontSize: 13, color: C.muted, margin: 0, lineHeight: 1.5 }}>{detail}</p>
      </div>
    </div>
  )
}

const PROS = [
  {
    name: 'SOCAN', color: C.gold, deadline: '1 year',
    portal: 'https://memp.socan.com', portalLabel: 'memp.socan.com',
    steps: [
      { title: 'Log in to the new SOCAN portal', detail: 'Go to memp.socan.com. If you\'ve only used the old portal, create a new login — they are separate systems.' },
      { title: 'Go to Set Lists & Performances → Register New Set List', detail: 'Click "Register New Set List" from the main menu.' },
      { title: 'Name your setlist', detail: 'Use the format "Your Name - Venue Name" (e.g. "Jesse Slack - The Rivoli"). Easy to find later.' },
      { title: 'Add each song via "Add Work"', detail: 'Search by title, contributor, or SOCAN Work Number. For covers, use "Add Cover Version" — not "Add Work".' },
      { title: 'Confirm & Submit', detail: 'Click Next → review the summary → Confirm & Submit Setlist. Status shows as "Draft Submitted".' },
    ],
    tip: 'Check your SOCAN account\'s "Unidentified Concert Performances" section. Your show may already be logged from the venue — it just needs a setlist attached.',
  },
  {
    name: 'ASCAP', color: C.blue, deadline: 'Same quarter',
    portal: 'https://www.ascap.com/members', portalLabel: 'ascap.com/members',
    steps: [
      { title: 'Log in to ASCAP Member Access', detail: 'Go to ascap.com/members.' },
      { title: 'Works → OnStage → Setlists → Add+', detail: 'Name your setlist, check each song you performed, click "Add to Setlist".' },
      { title: 'Performances → Add+ → search your venue', detail: 'Search by venue name and state.' },
      { title: 'Select your setlist and submit', detail: 'Choose your setlist from the dropdown and click Submit.' },
    ],
    tip: 'ASCAP distributes quarterly. Submit before quarter-end for the fastest payment cycle.',
  },
  {
    name: 'BMI', color: C.green, deadline: '9 months',
    portal: 'https://www.bmi.com', portalLabel: 'bmi.com',
    steps: [
      { title: 'Log in → your name dropdown → Online Services', detail: 'Click your name in the top right at bmi.com.' },
      { title: 'Click BMI Live in the applications panel', detail: 'Top left of the Online Services screen.' },
      { title: 'Add a Performance (top right)', detail: 'Enter venue name, address, phone, date and time.' },
      { title: 'Search and add each song, then submit', detail: 'Search by song title in the BMI database.' },
    ],
    tip: 'Enroll in direct deposit first. Otherwise royalties sit uncollected even after a successful submission.',
  },
  {
    name: 'PRS for Music', color: '#a78bfa', deadline: '1 year',
    portal: 'https://www.prsformusic.com/login', portalLabel: 'prsformusic.com/login',
    steps: [
      { title: 'Log in → Live Music → Submit a setlist', detail: 'Find the Live Music section in your dashboard.' },
      { title: 'Enter venue name, postcode, date and ticket price', detail: 'All required fields.' },
      { title: 'Add songs and writer splits, then submit', detail: 'Add each song with your percentage share.' },
    ],
    tip: 'PRS pays a minimum per-gig rate for smaller venues regardless of audience size — making even small pub gigs worth submitting.',
  },
]

export default function SubmitSetlistsPRO() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '50vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(96,165,250,0.05) 0%, transparent 65%)' }} />

      <Nav />

      <main style={{ position: 'relative', zIndex: 1, maxWidth: 720, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* Hero */}
        <div style={{ position: 'relative', marginBottom: 48, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -20, top: '50%', transform: 'translateY(-50%)', opacity: 0.03, pointerEvents: 'none' }}>
            <Image src="/logo-white.png" alt="" width={260} height={68} style={{ objectFit: 'contain' }} />
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.blueDim, border: '1px solid rgba(96,165,250,0.2)', borderRadius: 20, padding: '4px 12px', marginBottom: 20 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.blue, letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Step-by-Step Guide</span>
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 40px)', fontWeight: 800, color: C.text, margin: '0 0 20px', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            How to submit setlists to<br /><span style={{ color: C.blue }}>ASCAP, BMI & SOCAN.</span><br />Every step.
          </h1>
          <p style={{ fontSize: 17, color: C.secondary, lineHeight: 1.6, margin: 0, maxWidth: 560 }}>
            Stop leaving money on stage. A complete walkthrough of every major PRO's portal with exact navigation paths.
          </p>
        </div>

        {/* Before you start */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 24px', marginBottom: 48 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase' as const, margin: '0 0 14px' }}>Before You Start — Have These Ready</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              'Your setlist (every original song performed)',
              'Venue name and address',
              'Date of performance',
              'Your IPI/CAE number',
              'Co-writer names and splits',
              'Proof of performance (ticket, poster, or contract)',
            ].map(item => (
              <div key={item} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: C.gold, flexShrink: 0, fontSize: 12, marginTop: 2 }}>✓</span>
                <span style={{ fontSize: 13, color: C.secondary, lineHeight: 1.4 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* PRO sections */}
        {PROS.map(({ name, color, deadline, portal, portalLabel, steps, tip }) => (
          <div key={name} style={{ marginBottom: 52 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 4, height: 36, background: color, borderRadius: 2 }} />
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>{name}</h2>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color, background: color + '15', border: `1px solid ${color}30`, borderRadius: 20, padding: '3px 10px' }}>{deadline}</span>
            </div>
            <a href={portal} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.blue, background: C.blueDim, border: '1px solid rgba(96,165,250,0.2)', borderRadius: 8, padding: '7px 14px', textDecoration: 'none', fontWeight: 600, marginBottom: 14 }}>
              {portalLabel} ↗
            </a>
            {steps.map((s, i) => <Step key={i} n={i + 1} title={s.title} detail={s.detail} />)}
            <div style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10, padding: '12px 16px', marginTop: 10 }}>
              <p style={{ fontSize: 13, color: C.gold, margin: 0, lineHeight: 1.5 }}>💡 {tip}</p>
            </div>
          </div>
        ))}

        {/* Setlistr pitch */}
        <div style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 16, padding: '28px', marginBottom: 48, textAlign: 'center' }}>
          <Image src="/logo-white.png" alt="Setlistr" width={120} height={32} style={{ objectFit: 'contain', marginBottom: 16, opacity: 0.8 }} />
          <h3 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '0 0 10px', letterSpacing: '-0.01em' }}>The step nobody talks about</h3>
          <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 8px', lineHeight: 1.6 }}>
            Every guide starts at "log in to the portal." The hardest step is before that: <strong style={{ color: C.text }}>remembering what you actually played.</strong>
          </p>
          <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 20px', lineHeight: 1.6 }}>
            Setlistr listens during your show and builds the setlist automatically. After the show, confirm in under 90 seconds — data already formatted for your PRO.
          </p>
          <Link href="/app/show/new" style={{ textDecoration: 'none', display: 'inline-block', background: C.gold, color: '#0a0908', fontWeight: 800, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase' as const, borderRadius: 10, padding: '12px 24px' }}>
            Try Setlistr Free →
          </Link>
        </div>

        <div style={{ paddingTop: 32, borderTop: `1px solid ${C.border}` }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase' as const, margin: '0 0 16px' }}>Keep Reading</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { href: '/get-paid-for-live-shows', title: 'How to Get Paid for Live Performances (Full Guide)' },
              { href: '/unclaimed-music-royalties', title: 'Millions in Unclaimed Live Royalties — Are You Missing Out?' },
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
