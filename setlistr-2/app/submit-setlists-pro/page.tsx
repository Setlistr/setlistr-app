import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'How to Submit Setlists to ASCAP, BMI & SOCAN (Step-by-Step) | Setlistr',
  description: 'A complete step-by-step guide to submitting your setlists to ASCAP OnStage, BMI Live, and SOCAN\'s portal to collect live performance royalties after every show.',
  keywords: ['submit setlist ASCAP', 'submit setlist BMI', 'submit setlist SOCAN', 'ASCAP OnStage', 'BMI Live', 'live performance royalty submission', 'how to submit setlist PRO'],
  openGraph: {
    title: 'How to Submit Setlists to ASCAP, BMI & SOCAN (Step-by-Step)',
    description: 'A complete guide to submitting your setlists to every major PRO and collecting your live performance royalties.',
    url: 'https://setlistr.ai/submit-setlists-pro',
    siteName: 'Setlistr',
    type: 'article',
  },
  alternates: { canonical: 'https://setlistr.ai/submit-setlists-pro' },
}

const C = {
  bg: '#0a0908', card: '#141210', border: 'rgba(255,255,255,0.07)',
  borderGold: 'rgba(201,168,76,0.25)', text: '#f0ece3', secondary: '#b8a888',
  muted: '#8a7a68', gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.08)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.06)',
  blue: '#60a5fa', blueDim: 'rgba(96,165,250,0.06)',
}

function Step({ n, title, detail }: { n: number; title: string; detail: string }) {
  return (
    <div style={{ display: 'flex', gap: 16, padding: '16px 18px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 8 }}>
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

function ProSection({ name, color, portal, program, deadline, steps, tip }: {
  name: string; color: string; portal: string; program: string;
  deadline: string; steps: { title: string; detail: string }[]; tip: string
}) {
  return (
    <div style={{ marginBottom: 48 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ width: 4, height: 32, background: color, borderRadius: 2 }} />
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>{name}</h2>
          <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>{program}</p>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color, background: color + '15', border: `1px solid ${color}30`, borderRadius: 20, padding: '3px 10px' }}>
          {deadline}
        </span>
      </div>

      <div style={{ marginBottom: 12 }}>
        <a href={portal} target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.blue, background: C.blueDim, border: '1px solid rgba(96,165,250,0.2)', borderRadius: 8, padding: '7px 14px', textDecoration: 'none', fontWeight: 600 }}>
          Open Portal ↗
        </a>
      </div>

      {steps.map((s, i) => <Step key={i} n={i + 1} title={s.title} detail={s.detail} />)}

      <div style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10, padding: '12px 16px', marginTop: 12 }}>
        <p style={{ fontSize: 13, color: C.gold, margin: 0, lineHeight: 1.5 }}>💡 Pro tip: {tip}</p>
      </div>
    </div>
  )
}

export default function SubmitSetlistsPRO() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>

      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '50vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(96,165,250,0.05) 0%, transparent 65%)' }} />

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
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.blueDim, border: '1px solid rgba(96,165,250,0.2)', borderRadius: 20, padding: '4px 12px', marginBottom: 20 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.blue, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Step-by-Step Guide</span>
          </div>
          <h1 style={{ fontSize: 40, fontWeight: 800, color: C.text, margin: '0 0 20px', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            How to Submit Setlists to<br /><span style={{ color: C.blue }}>ASCAP, BMI & SOCAN</span>
          </h1>
          <p style={{ fontSize: 18, color: C.secondary, lineHeight: 1.6, margin: 0, maxWidth: 580 }}>
            A complete walkthrough of every major PRO's live performance submission process — so you can stop leaving money on stage.
          </p>
        </div>

        {/* Before you start */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 24px', marginBottom: 48 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 14px' }}>Before You Start — Have These Ready</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              'Your setlist (every original song you performed)',
              'Venue name and address',
              'Date of performance',
              'Your IPI/CAE number (in your PRO profile)',
              'Co-writer names and splits (if applicable)',
              'Proof of performance (ticket, poster, or contract)',
            ].map(item => (
              <div key={item} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: C.gold, flexShrink: 0, fontSize: 12, marginTop: 2 }}>✓</span>
                <span style={{ fontSize: 13, color: C.secondary, lineHeight: 1.4 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* SOCAN */}
        <ProSection
          name="SOCAN"
          color={C.gold}
          portal="https://memp.socan.com"
          program="Set Lists & Performances · memp.socan.com"
          deadline="1 year from show date"
          steps={[
            { title: 'Log in to the new SOCAN portal', detail: 'Go to memp.socan.com. If you\'ve only ever used the old portal, you\'ll need to create a new login — they are separate systems.' },
            { title: 'Navigate to Set Lists & Performances', detail: 'From the main menu, select "Set Lists & Performances" then click "Register New Set List".' },
            { title: 'Enter your Set List Title', detail: 'Use the format "Your Name - Venue Name" (e.g. "Jesse Slack - The Rivoli"). This makes it easy to identify later.' },
            { title: 'Add each song using "Add Work"', detail: 'Click "Add Work" and search by song title, contributor name, or SOCAN Work Number. Songs you\'ve registered will appear with a "Registered" status. For covers, use "Add Cover Version" instead.' },
            { title: 'Click Next and complete the submission', detail: 'You\'ll see a summary with your Set List ID. Click "Confirm & Submit Setlist" to finalize. The status will show as "Draft Submitted".' },
          ]}
          tip="Check SOCAN's 'Unidentified Concert Performances' section in your account. Your show may already be logged from the venue's license paperwork — it just needs a setlist attached."
        />

        {/* ASCAP */}
        <ProSection
          name="ASCAP"
          color="#60a5fa"
          portal="https://www.ascap.com/members"
          program="ASCAP OnStage · ascap.com/members"
          deadline="Same quarter as performance"
          steps={[
            { title: 'Log in to ASCAP Member Access', detail: 'Go to ascap.com/members and log in with your ASCAP credentials.' },
            { title: 'Navigate to Works → OnStage', detail: 'In the left sidebar, click "Works" then select "OnStage" from the dropdown.' },
            { title: 'Create your setlist', detail: 'Under "Setlists", click "Add +" and give your setlist a name. Check the box next to each song you performed and click "Add to Setlist".' },
            { title: 'Add the performance', detail: 'Under "Performances", click "Add +" and search for your venue by name and state. Select it from the results.' },
            { title: 'Attach your setlist and submit', detail: 'Select your setlist from the dropdown and click Submit. ASCAP distributes quarterly so timing your submission before quarter-end gets you paid faster.' },
          ]}
          tip="ASCAP pays on a 'follow the dollar' basis — performances at venues that pay higher license fees earn more royalties. Large theatres and festivals generate bigger payouts per song than small bars."
        />

        {/* BMI */}
        <ProSection
          name="BMI"
          color={C.green}
          portal="https://www.bmi.com"
          program="BMI Live · bmi.com"
          deadline="9 months from show date"
          steps={[
            { title: 'Log in to BMI', detail: 'Go to bmi.com and click your name in the top right corner to access the dropdown menu.' },
            { title: 'Open Online Services → BMI Live', detail: 'Select "Online Services" from the dropdown, then click "BMI Live" in the applications panel.' },
            { title: 'Click Add a Performance', detail: 'The button is in the top right corner of the BMI Live interface.' },
            { title: 'Enter venue details', detail: 'Fill in the venue name, address, phone number, date and time of your performance.' },
            { title: 'Search and add each song', detail: 'Search for each song title in the BMI database and add it to your performance. Submit when complete.' },
          ]}
          tip="BMI requires you to be enrolled in direct deposit to receive payment. If you haven't set this up, do it now — otherwise your royalties will sit uncollected even after a successful submission."
        />

        {/* PRS */}
        <ProSection
          name="PRS for Music"
          color="#a78bfa"
          portal="https://www.prsformusic.com/login"
          program="Live Music Reporting · prsformusic.com"
          deadline="1 year from show date"
          steps={[
            { title: 'Log in to PRS Member Portal', detail: 'Go to prsformusic.com/login and sign in.' },
            { title: 'Navigate to Live Music', detail: 'Find the Live Music section in your dashboard and click "Submit a setlist".' },
            { title: 'Enter performance details', detail: 'Provide the venue name, postcode, date, and ticket price for your show.' },
            { title: 'Add your songs and submit', detail: 'Add each song title, your writer share percentage, and any co-writer details. Submit to complete.' },
          ]}
          tip="PRS pays a minimum per-gig rate for smaller venues regardless of audience size, so even small pub gigs are worth submitting. The minimum rate makes every show worth the 5 minutes to submit."
        />

        {/* The Setlistr pitch */}
        <div style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 16, padding: '28px', marginBottom: 48 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '0 0 10px', letterSpacing: '-0.01em' }}>
            The step nobody talks about
          </h3>
          <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 16px', lineHeight: 1.6 }}>
            Every PRO submission guide starts at "log in to the portal." But the hardest step is the one before that: <strong style={{ color: C.text }}>remembering what you actually played.</strong>
          </p>
          <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 20px', lineHeight: 1.6 }}>
            Setlistr solves this by listening during your show and building the setlist automatically via audio detection. After the show, you confirm or adjust in under 90 seconds. The data is already formatted for your PRO by the time you open their portal.
          </p>
          <Link href="/app/show/new" style={{ textDecoration: 'none', display: 'inline-block', background: C.gold, color: '#0a0908', fontWeight: 800, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', borderRadius: 10, padding: '12px 24px' }}>
            Try Setlistr Free →
          </Link>
        </div>

        <div style={{ marginTop: 32, paddingTop: 32, borderTop: `1px solid ${C.border}` }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 16px' }}>Keep Reading</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { href: '/get-paid-for-live-shows', title: 'How to Get Paid for Live Performances (ASCAP, BMI, SOCAN Guide)' },
              { href: '/unclaimed-music-royalties', title: 'Millions in Unclaimed Live Performance Royalties — Are You Missing Out?' },
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
