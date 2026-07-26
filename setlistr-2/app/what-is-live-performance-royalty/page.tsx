import type { Metadata } from 'next'
import { ArticleShell, Crumb, Tag, H1, Standfirst, H2, P, Callout, EndCTA, Related, COLORS } from '@/components/article/ArticleKit'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'What Is a Live Performance Royalty? A Simple Explanation | Setlistr',
  description: "A plain-English explanation of what live performance royalties are, where the money comes from, who pays it, and how performing songwriters collect what they're owed.",
  alternates: { canonical: 'https://setlistr.ai/what-is-live-performance-royalty' },
  openGraph: {
    title: 'What Is a Live Performance Royalty? A Simple Explanation',
    description: 'The clearest explanation of how live royalties work and why most artists are missing out.',
    url: 'https://setlistr.ai/what-is-live-performance-royalty',
    siteName: 'Setlistr', type: 'article',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'What Is a Live Performance Royalty?' }],
  },
}

const WORTH = [
  { venue: 'Bar / Club', range: '$2–6' },
  { venue: 'Mid-size Venue', range: '$5–18' },
  { venue: 'Theatre / Hall', range: '$28–100' },
  { venue: 'Festival / Arena', range: '$50–280' },
]

export default function Page() {
  return (
    <ArticleShell>
      <style>{`.art-navlink:hover{color:#C9A84C !important;} .art-related:hover{color:#C9A84C !important;} @media(max-width:600px){.art-navlink{display:none !important;}.art-worth{grid-template-columns:1fr 1fr !important;}}`}</style>
      <Crumb><Link href="/get-paid" style={{ color: 'rgba(201,168,76,0.7)', textDecoration: 'none' }}>For Artists</Link> / What Are Live Royalties?</Crumb>
      <Tag>Plain English</Tag>
      <H1>What is a live performance royalty? <span style={{ color: '#C9A84C' }}>A simple explanation.</span></H1>
      <Standfirst>Money paid to a songwriter every time one of their original compositions is performed publicly in a licensed venue.</Standfirst>

      <P>A live performance royalty is money paid to a songwriter every time one of their original compositions is performed publicly in a licensed venue.</P>
      <P>Not when a recording plays. Not when someone streams it. When a human being performs the song &mdash; on a stage &mdash; in a place that has paid for the right to have music performed there.</P>

      <H2>Where does the money come from?</H2>
      <P>The money starts with the venue. Bars, clubs, concert halls, festivals, restaurants &mdash; any establishment where live music is performed is legally required to hold a license from their country&rsquo;s Performing Rights Organization.</P>
      <P>In Canada that&rsquo;s SOCAN. In the US it&rsquo;s ASCAP, BMI, SESAC, or GMR. In the UK it&rsquo;s PRS. In Australia it&rsquo;s APRA AMCOS. Every country has one, and they all work together through reciprocal agreements.</P>

      <H2>How does it get to the songwriter?</H2>
      <P>The PRO takes that pool of money and distributes it to the songwriters whose music was actually performed. But here&rsquo;s the critical part: the PRO has no way of knowing what songs were played unless someone tells them.</P>
      <P>That&rsquo;s a setlist submission. After your show, you log into your PRO&rsquo;s portal and submit the songs you performed, the venue, and the date. The PRO matches it to the license fee paid and sends you your share.</P>
      <P>If you don&rsquo;t submit, the money sits. Eventually it gets redistributed to artists who did submit &mdash; or absorbed into operating costs. <Link href="/unclaimed-music-royalties" style={{ color: '#C9A84C' }}>See how much goes unclaimed every year &rarr;</Link></P>

      <H2>How much is it worth?</H2>
      <div className="art-worth" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, margin: '24px 0' }}>
        {WORTH.map(w => (
          <div key={w.venue} style={{ background: 'linear-gradient(160deg, rgba(20,18,16,.9), rgba(12,10,8,.9))', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
            <div style={{ fontFamily: '"DM Mono", monospace', fontSize: 20, fontWeight: 500, color: '#C9A84C', marginBottom: 6 }}>{w.range}</div>
            <div style={{ fontSize: 10, color: 'rgba(212,209,202,0.5)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{w.venue}</div>
          </div>
        ))}
      </div>
      <P>Per original song, writer&rsquo;s share only. Self-published artists may collect up to 2&times; these figures.</P>

      <H2>When do you get paid?</H2>
      <P>PROs distribute royalties quarterly, typically 6&ndash;10 months after the performance. SOCAN takes 8&ndash;10 months for most domestic performances. Think of it as money earned tonight that arrives next year &mdash; which makes consistent submission all the more important.</P>

      <Callout color={COLORS.GREEN}><strong style={{ color: '#fff' }}>The capture step, automated.</strong> The whole system depends on you knowing what you played. Setlistr listens during your set and builds the setlist for you &mdash; so the submission data exists before you even leave the venue.</Callout>

      <EndCTA heading="Start with your next show" sub="Setlistr captures your setlist automatically so you never lose a performance. Free to start." />

      <Related links={[
        { href: '/get-paid-for-live-shows', title: 'How to Get Paid for Live Performances (Full Guide)' },
        { href: '/unclaimed-music-royalties', title: 'Millions in Unclaimed Live Performance Royalties — Are You Missing Out?' },
        { href: '/submit-setlists-pro', title: 'How to Submit Setlists to ASCAP, BMI & SOCAN (Step-by-Step)' },
      ]} />
    </ArticleShell>
  )
}
