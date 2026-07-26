import type { Metadata } from 'next'
import { ArticleShell, Crumb, Tag, H1, Standfirst, H2, P, Callout, EndCTA, Related, InfoCard, COLORS } from '@/components/article/ArticleKit'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Millions in Unclaimed Live Performance Royalties — Are You Missing Out? | Setlistr',
  description: "Billions in live performance royalties go unclaimed every year because artists don't submit their setlists. Find out how much you might be owed.",
  alternates: { canonical: 'https://setlistr.ai/unclaimed-music-royalties' },
  openGraph: {
    title: 'Millions in Unclaimed Live Performance Royalties — Are You Missing Out?',
    description: "Your money is going to artists who did submit. Here's the scale of what's being left behind.",
    url: 'https://setlistr.ai/unclaimed-music-royalties',
    siteName: 'Setlistr', type: 'article',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'Unclaimed Live Performance Royalties' }],
  },
}

const REASONS = [
  { label: "You don’t remember the setlist", detail: 'A 12-song set played at 11pm after a long day is hard to reconstruct accurately the next morning.' },
  { label: 'The submission window feels distant', detail: 'SOCAN gives you a year. ASCAP wants same-quarter. The deadline feels far away — until it isn’t.' },
  { label: 'The portal UX is genuinely painful', detail: 'PRO portals were not designed for mobile-first touring musicians. Clunky, desktop-centric, and slow.' },
  { label: 'The amounts feel too small to bother', detail: 'A single bar show might yield $30–75 in royalties. Across 100 shows a year, that’s $3,000–7,500 unclaimed.' },
]

const SCENARIOS = [
  { scenario: 'Bar circuit', shows: 50, songs: 10, est: '$1k–$3k' },
  { scenario: 'Club / mid-size', shows: 60, songs: 12, est: '$3.6k–$13k' },
  { scenario: 'Theatre touring', shows: 40, songs: 15, est: '$17k–$60k' },
  { scenario: 'Festival season', shows: 20, songs: 10, est: '$10k–$56k' },
]

const STEPS = [
  'Join a PRO if you haven’t — SOCAN, ASCAP, BMI, PRS, or APRA',
  'Register your songs in their catalog',
  'Submit setlists for past shows — most PROs give you 6–12 months retroactively',
  'Check your PRO’s “Unidentified Concerts” list — your show may already be logged',
  'Build a habit of capturing setlists immediately after every show',
]

export default function Page() {
  return (
    <ArticleShell>
      <style>{`.art-navlink:hover{color:#C9A84C !important;} .art-related:hover{color:#C9A84C !important;} @media(max-width:600px){.art-navlink{display:none !important;}}`}</style>
      <Crumb><Link href="/get-paid" style={{ color: 'rgba(201,168,76,0.7)', textDecoration: 'none' }}>For Artists</Link> / Unclaimed Royalties</Crumb>
      <Tag color={COLORS.RED}>Are You Missing Out?</Tag>
      <H1>Millions in unclaimed royalties &mdash; <span style={{ color: '#f0a68a' }}>your money is going to someone else.</span></H1>
      <Standfirst>When you don&rsquo;t submit your setlist, the money doesn&rsquo;t disappear. It gets redistributed to artists who did.</Standfirst>

      <div style={{ background: 'linear-gradient(160deg, rgba(20,18,16,.9), rgba(12,10,8,.9))', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 16, padding: 32, margin: '40px 0', textAlign: 'center' }}>
        <p style={{ fontFamily: '"DM Mono", monospace', fontSize: 12, fontWeight: 500, color: '#C9A84C', letterSpacing: '.12em', textTransform: 'uppercase', margin: '0 0 10px' }}>SOCAN distributed in 2024</p>
        <p style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 72, color: '#C9A84C', margin: '0 0 8px', lineHeight: 1 }}>$512M</p>
        <p style={{ fontSize: 14, color: 'rgba(212,209,202,0.7)', margin: 0 }}>And that&rsquo;s just one PRO &mdash; in one country</p>
      </div>

      <P>SOCAN distributed a record $512.4 million in 2024. ASCAP and BMI each distribute over $1 billion annually in the US alone. A significant portion &mdash; the live performance slice &mdash; depends entirely on artists submitting setlists. When they don&rsquo;t, the money goes to artists who did.</P>

      <H2>Why does this happen?</H2>
      {REASONS.map(r => (
        <InfoCard key={r.label}>
          <div style={{ display: 'flex', gap: 14 }}>
            <span style={{ color: '#f0a68a', flexShrink: 0, fontSize: 16 }}>&times;</span>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#f0ece3', margin: '0 0 4px' }}>{r.label}</p>
              <p style={{ fontSize: 13, color: 'rgba(212,209,202,0.6)', margin: 0, lineHeight: 1.5 }}>{r.detail}</p>
            </div>
          </div>
        </InfoCard>
      ))}

      <H2>How much are you leaving behind?</H2>
      <div style={{ background: 'linear-gradient(160deg, rgba(20,18,16,.9), rgba(12,10,8,.9))', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden', margin: '24px 0' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.2fr', gap: 8 }}>
          {['Scenario', 'Shows/yr', 'Songs', 'Est. unclaimed'].map(h => (
            <span key={h} style={{ fontFamily: '"DM Mono", monospace', fontSize: 10, fontWeight: 500, color: 'rgba(212,209,202,0.5)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{h}</span>
          ))}
        </div>
        {SCENARIOS.map((s, i, arr) => (
          <div key={s.scenario} style={{ padding: '13px 18px', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.2fr', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#f0ece3' }}>{s.scenario}</span>
            <span style={{ fontSize: 13, color: 'rgba(212,209,202,0.7)', fontFamily: '"DM Mono", monospace' }}>{s.shows}</span>
            <span style={{ fontSize: 13, color: 'rgba(212,209,202,0.7)', fontFamily: '"DM Mono", monospace' }}>{s.songs}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#C9A84C', fontFamily: '"DM Mono", monospace' }}>{s.est}</span>
          </div>
        ))}
      </div>

      <H2>What you can do right now</H2>
      <P>The fix is straightforward: <Link href="/submit-setlists-pro" style={{ color: '#C9A84C' }}>submit your setlists</Link>. But the harder problem is having accurate setlist data in the first place.</P>
      <div style={{ margin: '16px 0 40px' }}>
        {STEPS.map((step, i) => (
          <div key={i} style={{ display: 'flex', gap: 14, padding: '12px 16px', background: 'rgba(20,18,16,0.8)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#C9A84C', fontFamily: '"DM Mono", monospace', flexShrink: 0, minWidth: 20 }}>{i + 1}.</span>
            <p style={{ fontSize: 14, color: 'rgba(212,209,202,0.75)', margin: 0, lineHeight: 1.5 }}>{step}</p>
          </div>
        ))}
      </div>

      <EndCTA heading="Never miss a setlist again" sub="Setlistr listens during your show and builds the setlist automatically. Free to start." cta="Capture Your Next Show →" />

      <Related links={[
        { href: '/get-paid-for-live-shows', title: 'How to Get Paid for Live Performances (ASCAP, BMI, SOCAN Guide)' },
        { href: '/submit-setlists-pro', title: 'How to Submit Setlists to ASCAP, BMI & SOCAN (Step-by-Step)' },
        { href: '/what-is-live-performance-royalty', title: 'What Is a Live Performance Royalty? A Simple Explanation' },
      ]} />
    </ArticleShell>
  )
}
