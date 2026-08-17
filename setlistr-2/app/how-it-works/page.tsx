import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'How Setlistr Works — Live Setlist Capture & Royalty Submission',
  description: 'How Setlistr automatically captures your live setlist, verifies every song, and submits royalty claims to SOCAN, ASCAP, BMI, PRS, APRA, SESAC, and GMR.',
  alternates: { canonical: '/how-it-works' },
  openGraph: {
    title: 'How Setlistr Works',
    description: 'From planned setlist to verified performance to royalty submission — the full pipeline.',
    url: 'https://setlistr.ai/how-it-works',
    siteName: 'Setlistr',
    type: 'website',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'How Setlistr Works' }],
  },
}

const STEPS = [
  {
    n: '01',
    title: 'Set your set.',
    src: '/screenshots/setlist-ready.webp',
    alt: 'Setlistr planned setlist screen showing twelve songs ready before a show',
    copy: 'Before you play, load your planned setlist — your own catalog or anything you’re covering that night. Setlistr listens for these songs first, so recognition is fast and accurate from the first note.',
  },
  {
    n: '02',
    title: 'Capture the live show.',
    src: '/screenshots/capture-live.webp',
    alt: 'Setlistr live capture screen showing real-time song recognition during a performance',
    copy: 'One tap starts the record. On-device audio recognition confirms each song as it’s played and verifies it against your set — no phone-waving, no post-show reconstruction from memory.',
  },
  {
    n: '03',
    title: 'The show closes out clean.',
    src: '/screenshots/show-complete.webp',
    alt: 'Setlistr show complete screen showing a verified eight-song setlist captured live',
    copy: 'When you walk off stage, the performance is already a verified, timestamped record — every song, source-confirmed, ready to move into submission.',
  },
  {
    n: '04',
    title: 'Verified shows move to claim.',
    src: '/screenshots/claim-pipeline.webp',
    alt: 'Setlistr submissions screen showing verified shows marked ready to claim',
    copy: 'Confirmed performances flow into the submission pipeline for the PROs you’re registered with — SOCAN, ASCAP, BMI, PRS, APRA, SESAC, GMR — without manual paperwork on your end.',
  },
  {
    n: '05',
    title: 'Your touring record builds itself.',
    src: '/screenshots/career-map.webp',
    alt: 'Setlistr career map showing verified shows across multiple cities',
    copy: 'Every verified show adds to a career record — cities played, venues, hours on stage — the performance history that’s never existed at this level of detail before.',
  },
  {
    n: '06',
    title: 'Every milestone is yours to share.',
    src: '/screenshots/share-card.webp',
    alt: 'Setlistr verified show share card showing one hundred twenty four verified shows',
    copy: 'Verified show counts and milestones generate shareable cards — proof of work, built for an audience that already follows you.',
  },
]

const FAQS = [
  {
    q: 'How do I submit a setlist to SOCAN, ASCAP, or BMI?',
    a: 'Setlistr captures your setlist automatically during a live performance using audio recognition, then routes verified show data through the submission pipeline to your registered performing rights organization — including SOCAN, ASCAP, BMI, PRS, APRA, SESAC, and GMR — without manual paperwork.',
  },
  {
    q: 'What live performance royalties am I owed as a songwriter?',
    a: 'Performing rights organizations pay songwriters for live performances of their registered works, but most PROs rely on statistical sampling rather than tracking every show. Setlistr closes that gap by creating a verified record of every performance so no show goes unaccounted for.',
  },
  {
    q: 'How does Setlistr verify a live performance?',
    a: 'Setlistr listens during the show using audio recognition, matching songs against the artist’s planned setlist and a cover catalog in real time, then confirms each detection before it becomes part of the permanent performance record.',
  },
  {
    q: 'Is Setlistr available now?',
    a: 'Yes. Setlistr is available now and access is invite-only while we onboard artists. Request an invite and we’ll be in touch.',
  },
]

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQS.map(({ q, a }) => ({
    '@type': 'Question',
    name: q,
    acceptedAnswer: { '@type': 'Answer', text: a },
  })),
}

export default function HowItWorksPage() {
  return (
    <div style={{
      minHeight: '100svh',
      background: '#080706',
      fontFamily: '"DM Sans", system-ui, sans-serif',
      color: '#FFFFFF',
    }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <style>{`
        .hiw-frame {
          position: relative;
          border-radius: 28px;
          overflow: hidden;
          border: 1px solid rgba(201,168,76,0.18);
          box-shadow: 0 40px 80px -30px rgba(0,0,0,0.6);
          background: #0a0908;
        }
        .hiw-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 64px;
          align-items: center;
          padding: 80px 0;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .hiw-row:last-of-type { border-bottom: none; }
        .hiw-row.reverse .hiw-copy { order: 2; }
        .hiw-row.reverse .hiw-frame { order: 1; }
        @media (max-width: 720px) {
          .hiw-row, .hiw-row.reverse .hiw-copy, .hiw-row.reverse .hiw-frame {
            grid-template-columns: 1fr; order: initial; text-align: center;
          }
          .hiw-row { display: flex; flex-direction: column; padding: 56px 0; }
        }
      `}</style>

      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 48px',
        background: 'rgba(8,7,6,0.85)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <Image src="/logo-white-tight.png" alt="Setlistr" width={190} height={36} priority style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
        </Link>
        <Link href="/#access" style={{
          fontFamily: '"DM Mono", monospace',
          fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase',
          background: '#C9A84C', color: '#080706',
          padding: '9px 20px', textDecoration: 'none', borderRadius: 6,
        }}>Request Access</Link>
      </header>

      <section style={{ padding: '100px 24px 64px', maxWidth: 780, margin: '0 auto', textAlign: 'center' }}>
        <div style={{
          fontFamily: '"DM Mono", monospace',
          fontSize: 11, letterSpacing: '.16em', color: '#C9A84C',
          textTransform: 'uppercase', marginBottom: 20,
        }}>
          How It Works
        </div>
        <h1 style={{
          fontFamily: '"Bebas Neue", sans-serif',
          fontSize: 'clamp(44px, 7vw, 88px)',
          lineHeight: 1.0, letterSpacing: '0.025em',
          color: '#FFFFFF', margin: '0 0 20px',
        }}>
          Performance to payment.<br /><span style={{ color: '#C9A84C' }}>Six steps.</span>
        </h1>
        <p style={{ fontSize: 17, fontWeight: 300, color: 'rgba(212,209,202,0.8)', lineHeight: 1.8, maxWidth: 560, margin: '0 auto' }}>
          Every screen below is the live product — not a mockup. This is what happens
          between walking on stage and a royalty claim landing at your PRO.
        </p>
      </section>

      <section style={{ maxWidth: 1000, margin: '0 auto', padding: '0 24px' }}>
        {STEPS.map((step, i) => (
          <div key={step.n} className={`hiw-row ${i % 2 === 1 ? 'reverse' : ''}`}>
            <div className="hiw-copy">
              <div style={{
                fontFamily: '"Bebas Neue", sans-serif',
                fontSize: 20, color: 'rgba(201,168,76,0.7)', marginBottom: 12,
              }}>{step.n}</div>
              <h2 style={{
                fontFamily: '"Bebas Neue", sans-serif',
                fontSize: 'clamp(28px, 3.5vw, 40px)',
                lineHeight: 1.1, letterSpacing: '0.02em',
                color: '#FFFFFF', margin: '0 0 16px',
              }}>{step.title}</h2>
              <p style={{
                fontSize: 15.5, fontWeight: 300, lineHeight: 1.8,
                color: 'rgba(212,209,202,0.8)', margin: 0, maxWidth: 420,
              }}>{step.copy}</p>
            </div>
            <div className="hiw-frame">
              <Image
                src={step.src}
                alt={step.alt}
                width={760}
                height={1647}
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            </div>
          </div>
        ))}
      </section>

      <section style={{ padding: '100px 24px 60px', maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{
          fontFamily: '"Bebas Neue", sans-serif',
          fontSize: 'clamp(32px, 4vw, 48px)',
          color: '#FFFFFF', margin: '0 0 48px',
        }}>Common questions</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32, textAlign: 'left' }}>
          {FAQS.map(({ q, a }) => (
            <div key={q} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 32 }}>
              <h3 style={{
                fontFamily: '"DM Sans", sans-serif', fontWeight: 600,
                fontSize: 18, color: '#FFFFFF', margin: '0 0 10px',
              }}>{q}</h3>
              <p style={{ fontSize: 15, fontWeight: 300, lineHeight: 1.75, color: 'rgba(212,209,202,0.8)', margin: 0 }}>{a}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: '60px 24px 140px', textAlign: 'center' }}>
        <Link href="/#access" style={{
          display: 'inline-block',
          fontFamily: '"Bebas Neue", sans-serif',
          fontSize: 18, letterSpacing: '0.1em',
          background: '#C9A84C', color: '#080706',
          padding: '16px 44px', textDecoration: 'none', borderRadius: 8,
        }}>
          Request Access
        </Link>
      </section>

      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.05)',
        padding: '32px 48px', textAlign: 'center',
      }}>
        <p style={{
          fontFamily: '"DM Mono", monospace', fontSize: 10,
          letterSpacing: '0.1em', color: '#2a2520', margin: 0,
        }}>
          © {new Date().getFullYear()} Setlistr Inc.
        </p>
      </footer>
    </div>
  )
}
