import type { Metadata } from 'next'
import { ArticleShell, Crumb, Tag, H1, Standfirst, H2, P, Callout, EndCTA, Related, CheckRow, COLORS } from '@/components/article/ArticleKit'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'How to Submit Setlists to ASCAP, BMI & SOCAN (Step-by-Step) | Setlistr',
  description: "A complete step-by-step guide to submitting your setlists to every major PRO's live performance portal so you can stop leaving money on stage.",
  alternates: { canonical: '/submit-setlists-pro' },
  openGraph: {
    title: 'How to Submit Setlists to ASCAP, BMI & SOCAN (Step-by-Step)',
    description: "Stop leaving money on stage. A complete walkthrough of every major PRO's submission portal.",
    url: 'https://setlistr.ai/submit-setlists-pro',
    siteName: 'Setlistr', type: 'article',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'How to Submit Setlists to Your PRO' }],
  },
}

const PROS = [
  {
    name: 'SOCAN', deadline: '1 year', portal: 'https://memp.socan.com', portalLabel: 'memp.socan.com',
    steps: [
      { title: 'Log in to the new SOCAN portal', detail: 'Go to memp.socan.com. If you’ve only used the old portal, create a new login — they are separate systems.' },
      { title: 'Set Lists & Performances → Register New Set List', detail: 'Click “Register New Set List” from the main menu.' },
      { title: 'Name your setlist', detail: 'Use the format “Your Name - Venue Name”. Easy to find later.' },
      { title: 'Add each song via “Add Work”', detail: 'Search by title, contributor, or SOCAN Work Number. For covers, use “Add Cover Version” — not “Add Work”.' },
      { title: 'Confirm & Submit', detail: 'Click Next → review the summary → Confirm & Submit Setlist.' },
    ],
    tip: 'Check your SOCAN account’s “Unidentified Concert Performances” section. Your show may already be logged from the venue — it just needs a setlist attached.',
  },
  {
    name: 'ASCAP', deadline: 'Same quarter', portal: 'https://www.ascap.com/members', portalLabel: 'ascap.com/members',
    steps: [
      { title: 'Log in to ASCAP Member Access', detail: 'Go to ascap.com/members.' },
      { title: 'Works → OnStage → Setlists → Add+', detail: 'Name your setlist, check each song you performed, click “Add to Setlist”.' },
      { title: 'Performances → Add+ → search your venue', detail: 'Search by venue name and state.' },
      { title: 'Select your setlist and submit', detail: 'Choose your setlist from the dropdown and click Submit.' },
    ],
    tip: 'ASCAP distributes quarterly. Submit before quarter-end for the fastest payment cycle.',
  },
  {
    name: 'BMI', deadline: '9 months', portal: 'https://www.bmi.com', portalLabel: 'bmi.com',
    steps: [
      { title: 'Log in → your name dropdown → Online Services', detail: 'Click your name in the top right at bmi.com.' },
      { title: 'Click BMI Live in the applications panel', detail: 'Top left of the Online Services screen.' },
      { title: 'Add a Performance (top right)', detail: 'Enter venue name, address, phone, date and time.' },
      { title: 'Search and add each song, then submit', detail: 'Search by song title in the BMI database.' },
    ],
    tip: 'Enroll in direct deposit first. Otherwise royalties sit uncollected even after a successful submission.',
  },
  {
    name: 'PRS for Music', deadline: '1 year', portal: 'https://www.prsformusic.com/login', portalLabel: 'prsformusic.com/login',
    steps: [
      { title: 'Log in → Live Music → Submit a setlist', detail: 'Find the Live Music section in your dashboard.' },
      { title: 'Enter venue name, postcode, date and ticket price', detail: 'All required fields.' },
      { title: 'Add songs and writer splits, then submit', detail: 'Add each song with your percentage share.' },
    ],
    tip: 'PRS pays a minimum per-gig rate for smaller venues regardless of audience size — making even small pub gigs worth submitting.',
  },
]

export default function Page() {
  return (
    <ArticleShell
      headline="How to Submit Setlists to ASCAP, BMI & SOCAN (Step-by-Step)"
      description="A complete step-by-step guide to submitting your setlists to every major PRO's live performance portal so you can stop leaving money on stage."
      slug="/submit-setlists-pro"
      datePublished="2026-04-03"
      dateModified="2026-07-26"
      crumbLabel="Submit Setlists"
    >
      <style>{`.art-navlink:hover{color:#C9A84C !important;} .art-related:hover{color:#C9A84C !important;} @media(max-width:600px){.art-navlink{display:none !important;}}`}</style>
      <Crumb><Link href="/get-paid" style={{ color: 'rgba(201,168,76,0.7)', textDecoration: 'none' }}>For Artists</Link> / Submit Setlists</Crumb>
      <Tag color={COLORS.GREEN}>Step-by-Step</Tag>
      <H1>How to submit your setlists to ASCAP, BMI & SOCAN &mdash; <span style={{ color: '#C9A84C' }}>every step.</span></H1>
      <Standfirst>Stop leaving money on stage. A complete walkthrough of every major PRO&rsquo;s portal with exact navigation paths.</Standfirst>

      <H2>Before you start</H2>
      <P>Every PRO asks for the same core information. Have these ready before you open the portal:</P>
      <div style={{ margin: '16px 0' }}>
        <CheckRow>Your setlist (every original song performed)</CheckRow>
        <CheckRow>Venue name and address</CheckRow>
        <CheckRow>Date of performance</CheckRow>
        <CheckRow>Your IPI/CAE number</CheckRow>
        <CheckRow>Co-writer names and splits</CheckRow>
        <CheckRow>Proof of performance (ticket, poster, or contract)</CheckRow>
      </div>

      {PROS.map(pro => (
        <div key={pro.name} style={{ marginTop: 44 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <h2 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 'clamp(28px, 4vw, 40px)', letterSpacing: '.02em', margin: 0 }}>{pro.name}</h2>
            <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 11, color: 'rgba(212,209,202,0.55)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '3px 11px' }}>Deadline: {pro.deadline}</span>
          </div>
          <a href={pro.portal} target="_blank" rel="noopener noreferrer" style={{ fontFamily: '"DM Mono", monospace', fontSize: 12, color: '#C9A84C', textDecoration: 'none' }}>{pro.portalLabel} ↗</a>
          <div style={{ marginTop: 16 }}>
            {pro.steps.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 14, padding: '14px 18px', background: 'linear-gradient(160deg, rgba(20,18,16,.9), rgba(12,10,8,.9))', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, marginBottom: 8 }}>
                <span style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 20, color: 'rgba(201,168,76,0.6)', flexShrink: 0, minWidth: 22 }}>{i + 1}</span>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#f0ece3', margin: '0 0 4px', lineHeight: 1.4 }}>{s.title}</p>
                  <p style={{ fontSize: 13, color: 'rgba(212,209,202,0.62)', margin: 0, lineHeight: 1.5 }}>{s.detail}</p>
                </div>
              </div>
            ))}
          </div>
          <Callout><strong style={{ color: '#fff' }}>Tip:</strong> {pro.tip}</Callout>
        </div>
      ))}

      <Callout color={COLORS.GREEN}><strong style={{ color: '#fff' }}>The hard part isn’t the portal — it’s the data.</strong> Every step above assumes you have an accurate setlist. Setlistr captures it automatically during the show, so when you sit down to submit, the list is already there.</Callout>

      <EndCTA heading="Skip the guesswork" sub="Setlistr builds your setlist automatically during the show — ready to submit to any PRO. Free to start." />

      <Related links={[
        { href: '/get-paid-for-live-shows', title: 'How to Get Paid for Live Performances (ASCAP, BMI, SOCAN Guide)' },
        { href: '/unclaimed-music-royalties', title: 'Millions in Unclaimed Live Performance Royalties — Are You Missing Out?' },
        { href: '/what-is-live-performance-royalty', title: 'What Is a Live Performance Royalty? A Simple Explanation' },
      ]} />
    </ArticleShell>
  )
}
