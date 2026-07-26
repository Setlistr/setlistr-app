import type { Metadata } from 'next'
import { ArticleShell, Crumb, Tag, H1, Standfirst, H2, P, Callout, EndCTA, Related, InfoCard, CheckRow, COLORS } from '@/components/article/ArticleKit'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'How to Get Paid for Live Performances (ASCAP, BMI, SOCAN Guide) | Setlistr',
  description: "Most performing artists are leaving real money on the table after every show. Here's exactly how to collect live performance royalties from ASCAP, BMI, SOCAN, PRS and more.",
  alternates: { canonical: 'https://setlistr.ai/get-paid-for-live-shows' },
  openGraph: {
    title: "Most artists never get paid for live shows. Here's how to fix that.",
    description: "Where the money comes from, how much you're owed, and the exact steps to claim it.",
    url: 'https://setlistr.ai/get-paid-for-live-shows',
    siteName: 'Setlistr', type: 'article',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'How to Get Paid for Live Performances' }],
  },
}

const PROS = [
  { name: 'SOCAN', dl: '1 year', tip: 'Log into memp.socan.com → Set Lists & Performances → Register New Set List. Add each song, attach to the performance, submit.' },
  { name: 'ASCAP', dl: 'Same quarter', tip: 'Log in at ascap.com/members → Works → OnStage. Build your setlist, create a Performance, attach and submit.' },
  { name: 'BMI', dl: '9 months', tip: 'Log in at bmi.com → Online Services → BMI Live → Add a Performance. Search songs by title, submit.' },
  { name: 'PRS', dl: '1 year', tip: 'Log in at prsformusic.com/login → Live Music → Submit a setlist. PRS pays a minimum per-gig rate even for small venues.' },
]

const PAYOUTS = [
  { venue: 'Bar / Club', range: '$2–6', color: 'rgba(212,209,202,.6)' },
  { venue: 'Mid-size Venue', range: '$5–18', color: 'rgba(212,209,202,.85)' },
  { venue: 'Theatre / Hall', range: '$28–100', color: COLORS.GOLD },
  { venue: 'Festival / Arena', range: '$50–280', color: COLORS.GREEN },
]

export default function Page() {
  return (
    <ArticleShell>
      <style>{`.art-navlink:hover{color:#C9A84C !important;} .art-related:hover{color:#C9A84C !important;} @media(max-width:600px){.art-navlink{display:none !important;}.art-payout{grid-template-columns:1fr !important;}}`}</style>
      <Crumb><Link href="/get-paid" style={{ color: 'rgba(201,168,76,0.7)', textDecoration: 'none' }}>For Artists</Link> / Live Royalties Guide</Crumb>
      <Tag>Live Royalties Guide</Tag>
      <H1>Most artists never get paid for live shows. <span style={{ color: '#C9A84C' }}>Here&rsquo;s how to fix that.</span></H1>
      <Standfirst>Every time you play a licensed venue, your PRO collects a fee on your behalf. Most artists never claim it.</Standfirst>

      <Callout><strong style={{ color: '#fff' }}>The uncomfortable truth:</strong> Your venue paid your PRO a licensing fee the night you played. That money is sitting in a pool right now, waiting to be claimed. It stays unclaimed until you submit your setlist &mdash; and most artists never do, so it gets redistributed to artists who did.</Callout>

      <H2>What are live performance royalties?</H2>
      <P>When you perform original songs at a licensed venue &mdash; a bar, club, concert hall, festival &mdash; that venue has paid a blanket license fee to your Performing Rights Organization. The PRO&rsquo;s job is to collect those fees and distribute them back to the songwriters whose music was performed.</P>
      <P>This is separate from streaming, mechanical, or sync royalties. Live performance royalties exist specifically because of the act of performing your songs in front of an audience in a licensed space.</P>
      <P>The catch: your PRO has no way of knowing which songs you played unless you tell them. That&rsquo;s what a setlist submission is.</P>

      <H2>How much can you earn?</H2>
      <div className="art-payout" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '24px 0' }}>
        {PAYOUTS.map(p => (
          <div key={p.venue} style={{ background: 'linear-gradient(160deg, rgba(20,18,16,.9), rgba(12,10,8,.9))', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 18 }}>
            <div style={{ fontSize: 11, color: 'rgba(212,209,202,0.5)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 600, marginBottom: 8 }}>{p.venue}</div>
            <div style={{ fontFamily: '"DM Mono", monospace', fontSize: 28, fontWeight: 500, letterSpacing: '-.02em', marginBottom: 2, color: p.color }}>{p.range}</div>
            <div style={{ fontSize: 11, color: 'rgba(212,209,202,0.45)' }}>per original song</div>
          </div>
        ))}
      </div>
      <P>These are writer&rsquo;s-share figures only. Self-published artists collect both writer and publisher share &mdash; effectively doubling these numbers.</P>

      <Callout color={COLORS.GREEN}><strong style={{ color: '#fff' }}>The annual math:</strong> A bar artist playing 50 shows a year with 12 original songs per set could be sitting on $2,400&ndash;$3,600 in unclaimed live royalties every year. At festival pace, that climbs into the tens of thousands.</Callout>

      <H2>How to submit &mdash; by PRO</H2>
      <P>Every PRO has a slightly different process, but the core data is the same: your setlist, the venue, and the date. <Link href="/submit-setlists-pro" style={{ color: '#C9A84C' }}>See the full step-by-step guide for every PRO &rarr;</Link></P>
      {PROS.map(pro => (
        <InfoCard key={pro.name}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 22, letterSpacing: '.03em', color: '#C9A84C' }}>{pro.name}</span>
            <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 11, color: 'rgba(212,209,202,0.55)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '3px 11px' }}>{pro.dl}</span>
          </div>
          <p style={{ fontSize: 13.5, color: 'rgba(212,209,202,0.7)', lineHeight: 1.55, margin: 0 }}>{pro.tip}</p>
        </InfoCard>
      ))}

      <H2>What you need to submit</H2>
      <div style={{ margin: '16px 0' }}>
        <CheckRow>Venue name and address</CheckRow>
        <CheckRow>Date of performance</CheckRow>
        <CheckRow>Your setlist &mdash; every original song you performed</CheckRow>
        <CheckRow>Your IPI/CAE number (find it in your PRO profile)</CheckRow>
        <CheckRow>Co-writer splits for co-written songs</CheckRow>
      </div>

      <H2>The problem most artists face</H2>
      <P>The submission process is straightforward once you know it. The real problem is remembering what you played. A 12-song set at 11pm after soundcheck and load-in is hard to reconstruct accurately the next morning.</P>
      <P>That&rsquo;s why most live royalties go unclaimed &mdash; not ignorance of the system, friction at the data-capture step.</P>

      <Callout color={COLORS.GREEN}><strong style={{ color: '#fff' }}>Setlistr automates the capture step.</strong> It listens during your set, detects songs via audio fingerprinting, and builds your setlist automatically. After the show, you confirm in under 90 seconds &mdash; then the submission data is ready and formatted for your PRO.</Callout>

      <EndCTA heading="Stop leaving royalties on stage" sub="Setlistr captures your setlist automatically during the show. Free to start." />

      <Related links={[
        { href: '/unclaimed-music-royalties', title: 'Millions in Unclaimed Live Performance Royalties — Are You Missing Out?' },
        { href: '/submit-setlists-pro', title: 'How to Submit Setlists to ASCAP, BMI & SOCAN (Step-by-Step)' },
        { href: '/what-is-live-performance-royalty', title: 'What Is a Live Performance Royalty? A Simple Explanation' },
      ]} />
    </ArticleShell>
  )
}
