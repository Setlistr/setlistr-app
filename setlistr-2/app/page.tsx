import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import WaitlistForm from '@/components/WaitlistForm'

export const metadata: Metadata = {
  title: 'Setlistr — The System of Record for Live Music',
  description: 'Every licensed venue pays a performance royalty. Most of it never reaches the artist who earned it. Setlistr is the data infrastructure that connects live performance to payment — automatically.',
  openGraph: {
    title: 'Setlistr — The System of Record for Live Music',
    description: 'The infrastructure layer that connects every live performance to every royalty it has earned.',
    url: 'https://setlistr.ai',
    siteName: 'Setlistr',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Setlistr — The System of Record for Live Music',
    description: 'The infrastructure layer that connects every live performance to every royalty it has earned.',
  },
  alternates: { canonical: 'https://setlistr.ai' },
  keywords: [
    'live performance royalties', 'setlist submission software', 'SOCAN setlist submission',
    'ASCAP live performance royalties', 'BMI setlist submission', 'PRS live royalties',
    'APRA performance royalties', 'SESAC live performance', 'GMR royalties',
    'how to submit setlist to PRO', 'unclaimed music royalties', 'live music royalty tracking',
    'performance rights organization submission', 'songwriter royalty software',
    'live performance data', 'music royalty infrastructure',
  ],
}

const C = {
  bg:          '#0a0908',
  bg2:         '#0d0c0a',
  card:        '#141210',
  card2:       '#0f0e0c',
  border:      'rgba(255,255,255,0.06)',
  borderGold:  'rgba(201,168,76,0.22)',
  text:        '#f0ece3',
  secondary:   '#a09880',
  muted:       '#5a5448',
  gold:        '#c9a84c',
  goldDim:     'rgba(201,168,76,0.45)',
  goldGlow:    'rgba(201,168,76,0.07)',
}

// The Setlistr logo mark as inline SVG — matches brand guide exactly
function LogoMark({ size = 32, color = C.gold }: { size?: number; color?: string }) {
  const w = size
  const barH = w * 0.09
  const gap = w * 0.07
  const r = barH / 2
  const bars = [
    { y: 0,              width: w * 0.78 },
    { y: barH + gap,     width: w * 0.52 },
    { y: (barH+gap)*2,   width: w * 0.65 },
  ]
  const dotRow = (barH + gap) * 3
  const dotSize = w * 0.13
  return (
    <svg width={w} height={dotRow + dotSize} viewBox={`0 0 ${w} ${dotRow + dotSize}`} fill="none">
      {bars.map((b, i) => (
        <rect key={i} x={0} y={b.y} width={b.width} height={barH} rx={r} fill={i === 0 ? C.text : C.muted} opacity={i === 0 ? 1 : 0.6} />
      ))}
      <rect x={0} y={dotRow} width={w * 0.48} height={barH} rx={r} fill={C.muted} opacity={0.4} />
      <circle cx={w * 0.48 + dotSize / 2 + w * 0.03} cy={dotRow + barH / 2} r={dotSize / 2} fill={color} />
    </svg>
  )
}

export default function HomePage() {
  return (
    <div style={{ minHeight: '100svh', background: C.bg, overflowX: 'hidden', fontFamily: '"DM Sans", system-ui, sans-serif' }}>

      {/* Ambient glow */}
      <div aria-hidden style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: [
          'radial-gradient(ellipse 80% 55% at 50% -5%, rgba(201,168,76,0.08) 0%, transparent 65%)',
          'radial-gradient(ellipse 35% 35% at 90% 90%, rgba(201,168,76,0.03) 0%, transparent 55%)',
        ].join(','),
      }} />

      {/* ══════════════════════════════════════════
          NAV
      ══════════════════════════════════════════ */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 40px',
        background: 'rgba(10,9,8,0.9)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderBottom: `1px solid ${C.border}`,
      }}>
        {/* Logo */}
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
          <LogoMark size={28} />
          <span style={{
            fontFamily: '"DM Mono", monospace', fontSize: 13,
            fontWeight: 500, letterSpacing: '0.22em',
            color: C.text, textTransform: 'uppercase',
          }}>
            Setlistr
          </span>
        </Link>

        {/* Nav */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
          <Link href="/get-paid" className="sl-nav-link">For Artists</Link>
          <a href="mailto:info@setlistr.ai" className="sl-nav-link">For Publishers</a>
          <a href="#waitlist" className="sl-nav-cta">Request Access</a>
        </nav>
      </header>

      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ══════════════════════════════════════════
            HERO
        ══════════════════════════════════════════ */}
        <section style={{
          minHeight: '100svh',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', padding: '100px 24px 80px',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Big watermark logo */}
          <div aria-hidden style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            opacity: 0.018, pointerEvents: 'none',
            width: '70vw', maxWidth: 700,
          }}>
            <Image src="/logo-white.png" alt="" fill style={{ objectFit: 'contain', position: 'relative' }}
              sizes="70vw" />
          </div>

          {/* Eyebrow */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            marginBottom: 44,
            animation: 'fadeUp 0.7s ease 0.1s both',
          }}>
            <div style={{ width: 24, height: 1, background: C.goldDim }} />
            <span style={{
              fontFamily: '"DM Mono", monospace', fontSize: 10,
              letterSpacing: '0.3em', color: C.goldDim, textTransform: 'uppercase',
            }}>
              Live performance infrastructure
            </span>
            <div style={{ width: 24, height: 1, background: C.goldDim }} />
          </div>

          {/* Main headline */}
          <h1 style={{
            fontFamily: '"DM Serif Display", Georgia, serif',
            fontWeight: 400, fontStyle: 'normal',
            fontSize: 'clamp(52px, 9vw, 116px)',
            lineHeight: 0.97, letterSpacing: '-0.025em',
            color: C.text, margin: '0 0 0', maxWidth: 920,
            animation: 'fadeUp 1s ease 0.2s both',
          }}>
            Every performance.<br />
            Every song.<br />
            <em style={{ color: C.gold, fontStyle: 'italic' }}>
              Finally paid.
            </em>
          </h1>

          {/* Rule */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            width: '100%', maxWidth: 440, margin: '52px auto',
            animation: 'fadeUp 0.7s ease 0.5s both',
          }}>
            <div style={{ flex: 1, height: 1, background: C.border }} />
            <LogoMark size={18} color={C.goldDim} />
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>

          {/* Sub */}
          <p style={{
            fontSize: 'clamp(16px, 2vw, 20px)', fontWeight: 300,
            color: C.secondary, maxWidth: 500, lineHeight: 1.75,
            margin: '0 0 56px',
            animation: 'fadeUp 0.8s ease 0.6s both',
          }}>
            Live performance is the largest unstructured dataset in music.
            We are the infrastructure that changes that — for every artist,
            every show, every royalty.
          </p>

          {/* CTAs */}
          <div style={{
            display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center',
            animation: 'fadeUp 0.8s ease 0.75s both',
          }}>
            <Link href="/start" className="sl-btn-gold">
              See what you&apos;re owed →
            </Link>
            <a href="#waitlist" className="sl-btn-ghost">
              Request access
            </a>
          </div>

          {/* PRO strip */}
          <div style={{
            display: 'flex', gap: 24, alignItems: 'center',
            flexWrap: 'wrap', justifyContent: 'center',
            marginTop: 56,
            animation: 'fadeUp 0.6s ease 0.9s both',
          }}>
            {['SOCAN', 'ASCAP', 'BMI', 'PRS', 'APRA', 'SESAC', 'GMR'].map(pro => (
              <span key={pro} style={{
                fontFamily: '"DM Mono", monospace', fontSize: 9,
                letterSpacing: '0.22em', color: 'rgba(160,152,128,0.25)',
                textTransform: 'uppercase',
              }}>{pro}</span>
            ))}
          </div>

          {/* Scroll cue */}
          <div style={{
            position: 'absolute', bottom: 36, left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 6,
            animation: 'fadeUp 0.6s ease 1.2s both',
          }}>
            <div style={{ width: 1, height: 32, background: `linear-gradient(to bottom, transparent, ${C.goldDim})` }} />
          </div>
        </section>

        {/* ══════════════════════════════════════════
            THE BLIND SPOT
        ══════════════════════════════════════════ */}
        <section style={{ padding: '80px 24px 100px', maxWidth: 960, margin: '0 auto' }}>
          <SectionLabel num="001" text="The Problem" />

          <h2 style={{
            fontFamily: '"DM Serif Display", Georgia, serif', fontWeight: 400,
            fontSize: 'clamp(28px, 4vw, 52px)', lineHeight: 1.25,
            color: C.text, margin: '0 0 28px', maxWidth: 800,
          }}>
            Billions in performance royalties sit uncollected every year.
            Not because the system is corrupt —
          </h2>
          <h2 style={{
            fontFamily: '"DM Serif Display", Georgia, serif', fontWeight: 400,
            fontSize: 'clamp(28px, 4vw, 52px)', lineHeight: 1.25,
            color: C.secondary, margin: 0, maxWidth: 800,
          }}>
            because{' '}
            <span style={{ color: C.text }}>the underlying performance data doesn&apos;t exist.</span>
          </h2>
        </section>

        {/* ══════════════════════════════════════════
            STATS
        ══════════════════════════════════════════ */}
        <section style={{ padding: '0 24px 100px', maxWidth: 1100, margin: '0 auto' }}>
          <div className="sl-stats-grid">
            {[
              { stat: '$2B+', label: 'Annual live royalty pool', sub: 'Global PRO collections tied to live performance across SOCAN, ASCAP, BMI, PRS, APRA, SESAC, and GMR every year.' },
              { stat: '<30%', label: 'Shows ever submitted',     sub: 'Industry average setlist submission rate. The vast majority of live performances generate no royalty claim — ever.' },
              { stat: '4M+',  label: 'PRO members globally',    sub: 'Working songwriters registered worldwide. Most submitting nothing. Most unaware of what they are owed.' },
            ].map(({ stat, label, sub }) => (
              <div key={stat} className="sl-stat-cell">
                <p className="sl-stat-number">{stat}</p>
                <p className="sl-stat-label">{label}</p>
                <p className="sl-stat-sub">{sub}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════
            WHAT WE'RE BUILDING
        ══════════════════════════════════════════ */}
        <section style={{ padding: '80px 24px 100px', maxWidth: 1100, margin: '0 auto' }}>
          <SectionLabel num="002" text="The Infrastructure" />

          <div className="sl-split-grid">
            <div>
              <h2 style={{
                fontFamily: '"DM Serif Display", Georgia, serif', fontWeight: 400,
                fontSize: 'clamp(32px, 4.5vw, 58px)', lineHeight: 1.08,
                color: C.text, margin: 0,
              }}>
                Not a tool.<br />
                <em style={{ color: C.gold, fontStyle: 'italic' }}>The layer<br />that was missing.</em>
              </h2>
            </div>
            <div style={{ paddingTop: 4 }}>
              <p style={{ fontSize: 16, fontWeight: 300, color: C.secondary, lineHeight: 1.85, margin: '0 0 22px' }}>
                PROs have operated the same way for decades — sample models, major tour data,
                and setlists artists submit manually, if they remember, if they can find the portal,
                if the submission window hasn&apos;t already closed.
              </p>
              <p style={{ fontSize: 16, fontWeight: 300, color: C.secondary, lineHeight: 1.85, margin: '0 0 22px' }}>
                The result: a financial system that works for artists who are already commercially
                visible. Everyone else — the working songwriter, the regional touring act, the
                writers round performer — leaves money in a pool redistributed to the artists who
                need it least.
              </p>
              <p style={{ fontSize: 16, fontWeight: 300, color: C.secondary, lineHeight: 1.85, margin: 0 }}>
                <strong style={{ color: C.text, fontWeight: 500 }}>
                  Setlistr captures every performance in real time. Structures the data automatically.
                  Routes it through the royalty pipeline.
                </strong>{' '}
                For every artist. Every venue. Every show. No forms. No portals. No missed windows.
              </p>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            STAGE EVOLUTION
        ══════════════════════════════════════════ */}
        <section style={{ padding: '0 24px 100px', maxWidth: 1100, margin: '0 auto' }}>
          <div className="sl-stages">
            {[
              { n: '01', name: 'Tool',           active: true,  desc: 'Capture every show. Submit to every PRO. Under 90 seconds after the last song.' },
              { n: '02', name: 'Habit',          active: false, desc: 'The pre-show ritual. The post-show recap. The career archive that compounds with every performance.' },
              { n: '03', name: 'Network',        active: false, desc: 'Publishers, co-writers, and fans connected to the live performance record in real time.' },
              { n: '04', name: 'Intelligence',   active: false, desc: 'The system surfaces shows that were never submitted. Royalties the artist did not know existed.' },
              { n: '05', name: 'Infrastructure', active: false, desc: 'The canonical live performance layer. Licensed to labels, DSPs, PROs, and analytics platforms globally.' },
            ].map(({ n, name, active, desc }) => (
              <div key={n} className={active ? 'sl-stage sl-stage--active' : 'sl-stage'}>
                <span className="sl-stage__num">{n}</span>
                <p className="sl-stage__name">{name}</p>
                <p className="sl-stage__desc">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════
            HOW IT WORKS
        ══════════════════════════════════════════ */}
        <section style={{ padding: '80px 24px 100px', maxWidth: 800, margin: '0 auto' }}>
          <SectionLabel num="003" text="How It Works" />

          <h2 style={{
            fontFamily: '"DM Serif Display", Georgia, serif', fontWeight: 400,
            fontSize: 'clamp(28px, 3.5vw, 44px)', color: C.text,
            margin: '0 0 52px', lineHeight: 1.15,
          }}>
            Zero effort during the show.<br />Under 90 seconds after.
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[
              { step: '01', title: 'Open Setlistr before the show',   body: 'Load your planned set or start fresh. The capture engine arms automatically.' },
              { step: '02', title: 'Play your show',                   body: 'Real-time audio recognition identifies every song as you perform it. No manual input. No interruptions.' },
              { step: '03', title: 'Review the recap after',           body: 'Your setlist is confirmed, royalties are estimated, and the submission package is built — in seconds.' },
              { step: '04', title: 'Submit to your PRO',               body: 'PRO-specific formatted files and direct deep links. Submission goes from 45 minutes of confusion to 5 minutes of filing.' },
            ].map(({ step, title, body }) => (
              <div key={step} style={{
                display: 'grid', gridTemplateColumns: '56px 1fr',
                gap: 24, padding: '28px 0',
                borderBottom: `1px solid ${C.border}`,
              }}>
                <span style={{
                  fontFamily: '"DM Mono", monospace', fontSize: 11,
                  letterSpacing: '0.15em', color: C.gold, paddingTop: 3,
                }}>
                  {step}
                </span>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: '0 0 8px' }}>{title}</p>
                  <p style={{ fontSize: 14, fontWeight: 300, color: C.secondary, lineHeight: 1.7, margin: 0 }}>{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════
            SEO — WHY NOW
        ══════════════════════════════════════════ */}
        <section style={{ padding: '80px 24px 100px', maxWidth: 800, margin: '0 auto' }}>
          <SectionLabel num="004" text="Why Now" />

          <h2 style={{
            fontFamily: '"DM Serif Display", Georgia, serif', fontWeight: 400,
            fontSize: 'clamp(28px, 3.5vw, 44px)', color: C.text,
            margin: '0 0 32px', lineHeight: 1.15,
          }}>
            The window to build this is open.<br />It will not stay open.
          </h2>

          <p style={{ fontSize: 15, fontWeight: 300, color: C.secondary, lineHeight: 1.9, margin: '0 0 20px' }}>
            The problem of <strong style={{ color: C.text, fontWeight: 400 }}>unclaimed live performance royalties</strong> is
            not new. What is new is the technology to solve it. Audio recognition is now accurate enough for
            real-time live song identification at scale. Mobile-first behavior makes passive background capture
            possible. PRO APIs exist and are, in some cases, entirely unoccupied — including the SOCAN NLMP API,
            abandoned since 2020.
          </p>

          <p style={{ fontSize: 15, fontWeight: 300, color: C.secondary, lineHeight: 1.9, margin: '0 0 20px' }}>
            Every working songwriter registered with <strong style={{ color: C.text, fontWeight: 400 }}>SOCAN, ASCAP, BMI,
            PRS for Music, APRA AMCOS, SESAC, or GMR</strong> is owed performance royalties for every live
            performance of their registered songs. The <strong style={{ color: C.text, fontWeight: 400 }}>setlist
            submission</strong> process required to collect those royalties — submitting to ASCAP&apos;s live
            performance portal, filing with SOCAN&apos;s NLMP, reporting to BMI&apos;s online system — is the
            only barrier between the artist and money they have already earned.
          </p>

          <p style={{ fontSize: 15, fontWeight: 300, color: C.secondary, lineHeight: 1.9, margin: '0 0 20px' }}>
            Publishers with live performance rights have thousands of writers on stage every night with zero
            real-time visibility into what is being performed, what has been submitted, and how much royalty
            revenue is sitting unclaimed. The publisher blind spot is worth hundreds of millions annually —
            and nobody has built infrastructure to address it. Until now.
          </p>

          <p style={{ fontSize: 15, fontWeight: 300, color: C.secondary, lineHeight: 1.9, margin: 0 }}>
            The first platform to capture live performance data at scale owns it permanently. Historical
            performance records cannot be recreated retroactively.{' '}
            <strong style={{ color: C.text, fontWeight: 400 }}>
              This is the race. Setlistr is already moving.
            </strong>
          </p>
        </section>

        {/* ══════════════════════════════════════════
            DATA MOAT
        ══════════════════════════════════════════ */}
        <section style={{ padding: '0 24px 100px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderLeft: `3px solid ${C.gold}`,
            padding: '40px 48px',
          }}>
            <p style={{
              fontFamily: '"DM Serif Display", Georgia, serif',
              fontWeight: 400, fontStyle: 'italic',
              fontSize: 'clamp(20px, 2.5vw, 30px)',
              color: C.text, lineHeight: 1.45, margin: '0 0 20px',
            }}>
              &ldquo;SaaS is the interface layer. The underlying business is data infrastructure.
              The more shows captured, the more valuable the dataset becomes — and that value
              compounds permanently. Anyone can build a submission tool. No one can recreate a
              global dataset of verified live performance history once it has been captured.&rdquo;
            </p>
            <p style={{
              fontFamily: '"DM Mono", monospace', fontSize: 10,
              letterSpacing: '0.2em', color: C.goldDim, textTransform: 'uppercase', margin: 0,
            }}>
              — Setlistr · Strategic Blueprint 2026
            </p>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            WAITLIST
        ══════════════════════════════════════════ */}
        <section id="waitlist" style={{
          padding: '100px 24px 140px',
          position: 'relative', textAlign: 'center',
        }}>
          {/* Top pin */}
          <div style={{
            position: 'absolute', top: 0, left: '50%',
            transform: 'translateX(-50%)',
            width: 1, height: 80,
            background: `linear-gradient(to bottom, transparent, ${C.goldDim})`,
          }} />

          <div style={{ marginBottom: 20 }}>
            <LogoMark size={36} />
          </div>

          <p style={{
            fontFamily: '"DM Mono", monospace', fontSize: 10,
            letterSpacing: '0.28em', color: C.goldDim,
            textTransform: 'uppercase', marginBottom: 28, display: 'block',
          }}>
            Early Access
          </p>

          <h2 style={{
            fontFamily: '"DM Serif Display", Georgia, serif', fontWeight: 400,
            fontSize: 'clamp(36px, 5.5vw, 68px)',
            color: C.text, lineHeight: 1.05, margin: '0 0 16px',
          }}>
            Get in early.
          </h2>
          <h2 style={{
            fontFamily: '"DM Serif Display", Georgia, serif', fontWeight: 400,
            fontStyle: 'italic',
            fontSize: 'clamp(36px, 5.5vw, 68px)',
            color: C.gold, lineHeight: 1.05, margin: '0 0 28px',
          }}>
            The list is short.
          </h2>

          <p style={{
            fontSize: 16, fontWeight: 300, color: C.secondary,
            maxWidth: 400, margin: '0 auto 52px', lineHeight: 1.7,
          }}>
            We are onboarding a limited number of artists and publishers.
            Select your access path below.
          </p>

          <WaitlistForm />

          <p style={{
            fontFamily: '"DM Mono", monospace', fontSize: 10,
            letterSpacing: '0.15em', color: C.muted,
            margin: '40px 0 0',
          }}>
            Investor inquiries —{' '}
            <a href="mailto:invest@setlistr.ai" style={{ color: C.goldDim, textDecoration: 'none' }}>
              invest@setlistr.ai
            </a>
          </p>
        </section>

        {/* ══════════════════════════════════════════
            FOOTER
        ══════════════════════════════════════════ */}
        <footer style={{
          borderTop: `1px solid ${C.border}`,
          padding: '36px 40px',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', flexWrap: 'wrap', gap: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <LogoMark size={20} />
            <span style={{
              fontFamily: '"DM Mono", monospace', fontSize: 11,
              letterSpacing: '0.2em', color: C.muted, textTransform: 'uppercase',
            }}>
              Setlistr
            </span>
          </div>

          <nav style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { label: 'For Artists',  href: '/get-paid' },
              { label: 'How It Works', href: '/start' },
              { label: 'Contact',      href: 'mailto:info@setlistr.ai' },
              { label: 'Investors',    href: 'mailto:invest@setlistr.ai' },
              { label: 'Privacy',      href: '/privacy' },
              { label: 'Terms',        href: '/terms' },
            ].map(({ label, href }) =>
              href.startsWith('mailto') ? (
                <a key={label} href={href} className="sl-footer-link">{label}</a>
              ) : (
                <Link key={label} href={href} className="sl-footer-link">{label}</Link>
              )
            )}
          </nav>

          <p style={{
            fontFamily: '"DM Mono", monospace', fontSize: 10,
            letterSpacing: '0.1em', color: 'rgba(90,84,72,0.45)', margin: 0,
          }}>
            © {new Date().getFullYear()} Setlistr Inc.
          </p>
        </footer>
      </div>

      {/* ══ GLOBAL STYLES ══ */}
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(22px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Nav */
        .sl-nav-link {
          font-size: 13px; font-weight: 400; letter-spacing: 0.01em;
          color: #5a5448; text-decoration: none;
          transition: color 0.2s ease;
        }
        .sl-nav-link:hover { color: #f0ece3; }

        .sl-nav-cta {
          font-family: "DM Mono", monospace;
          font-size: 11px; font-weight: 500; letter-spacing: 0.12em;
          color: #0a0908; background: #c9a84c;
          padding: 9px 20px; text-decoration: none;
          text-transform: uppercase;
          transition: opacity 0.2s ease;
        }
        .sl-nav-cta:hover { opacity: 0.84; }

        /* Hero buttons */
        .sl-btn-gold {
          display: inline-block;
          background: #c9a84c; color: #0a0908;
          font-family: "DM Mono", monospace;
          font-size: 12px; font-weight: 600;
          letter-spacing: 0.1em; text-transform: uppercase;
          padding: 16px 32px; text-decoration: none;
          transition: opacity 0.2s ease;
        }
        .sl-btn-gold:hover { opacity: 0.86; }

        .sl-btn-ghost {
          display: inline-block;
          background: transparent;
          border: 1px solid rgba(201,168,76,0.2);
          color: #a09880;
          font-family: "DM Mono", monospace;
          font-size: 12px; font-weight: 400;
          letter-spacing: 0.08em; text-transform: uppercase;
          padding: 16px 32px; text-decoration: none;
          transition: border-color 0.2s ease, color 0.2s ease;
        }
        .sl-btn-ghost:hover {
          border-color: rgba(201,168,76,0.4);
          color: #f0ece3;
        }

        /* Stats */
        .sl-stats-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.06);
        }
        .sl-stat-cell {
          background: #141210;
          padding: 48px 40px;
          transition: background 0.2s ease;
        }
        .sl-stat-cell:hover { background: #0f0e0c; }
        .sl-stat-number {
          font-family: "DM Serif Display", Georgia, serif;
          font-size: clamp(52px, 6vw, 80px); font-weight: 400;
          color: #c9a84c; margin: 0 0 14px;
          line-height: 1; letter-spacing: -0.025em;
        }
        .sl-stat-label {
          font-size: 13px; font-weight: 600;
          color: #f0ece3; margin: 0 0 12px; letter-spacing: 0.01em;
        }
        .sl-stat-sub {
          font-size: 13px; font-weight: 300;
          color: #5a5448; line-height: 1.65; margin: 0;
        }

        /* Split grid */
        .sl-split-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 80px; align-items: start;
        }

        /* Stages */
        .sl-stages {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 1px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.06);
        }
        .sl-stage {
          background: #141210;
          padding: 32px 24px;
          border-top: 2px solid transparent;
        }
        .sl-stage--active {
          background: #0f0e0c;
          border-top-color: #c9a84c;
        }
        .sl-stage__num {
          font-family: "DM Mono", monospace;
          font-size: 9px; letter-spacing: 0.22em;
          color: #5a5448; display: block; margin-bottom: 18px;
        }
        .sl-stage--active .sl-stage__num { color: #c9a84c; }
        .sl-stage__name {
          font-family: "DM Serif Display", Georgia, serif;
          font-size: 20px; font-weight: 400;
          color: #a09880; margin: 0 0 10px;
        }
        .sl-stage--active .sl-stage__name { color: #f0ece3; }
        .sl-stage__desc {
          font-size: 12px; font-weight: 300;
          color: #5a5448; line-height: 1.65; margin: 0;
        }

        /* Footer */
        .sl-footer-link {
          font-family: "DM Mono", monospace;
          font-size: 10px; letter-spacing: 0.12em;
          color: #5a5448; text-decoration: none;
          text-transform: uppercase; transition: color 0.2s ease;
        }
        .sl-footer-link:hover { color: #a09880; }

        /* Input placeholders */
        input::placeholder { color: #5a5448 !important; }
        input:focus { border-color: rgba(201,168,76,0.3) !important; }

        /* Responsive */
        @media (max-width: 860px) {
          .sl-split-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
          .sl-stages { grid-template-columns: 1fr 1fr !important; }
          .sl-stats-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 540px) {
          .sl-stages { grid-template-columns: 1fr !important; }
          nav .sl-nav-link { display: none; }
        }
      `}</style>
    </div>
  )
}

/* ── Section label component ── */
function SectionLabel({ num, text }: { num: string; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 40 }}>
      <span style={{
        fontFamily: '"DM Mono", monospace', fontSize: 9,
        letterSpacing: '0.28em', color: 'rgba(201,168,76,0.45)',
        textTransform: 'uppercase',
      }}>
        {num}
      </span>
      <div style={{ flex: 0, width: 28, height: 1, background: 'rgba(201,168,76,0.2)' }} />
      <span style={{
        fontFamily: '"DM Mono", monospace', fontSize: 9,
        letterSpacing: '0.28em', color: 'rgba(201,168,76,0.45)',
        textTransform: 'uppercase',
      }}>
        {text}
      </span>
    </div>
  )
}
