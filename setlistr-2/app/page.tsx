import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Setlistr — The System of Record for Live Music',
  description: 'Live performance is the largest unstructured dataset in music. Every licensed venue pays a royalty. Most of it never reaches the artist. Setlistr is the infrastructure that changes that.',
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
    'live performance royalties', 'setlist submission', 'SOCAN submission',
    'ASCAP setlist', 'BMI live performance royalties', 'PRS setlist submission',
    'APRA performance royalties', 'how to submit setlist', 'unclaimed music royalties',
    'performance rights royalties', 'live music royalty software',
  ],
}

const C = {
  bg:          '#0a0908',
  card:        '#141210',
  border:      'rgba(255,255,255,0.07)',
  borderGold:  'rgba(201,168,76,0.2)',
  text:        '#f0ece3',
  secondary:   '#a09880',
  muted:       '#5a5448',
  gold:        '#c9a84c',
  goldDim:     'rgba(201,168,76,0.5)',
  goldGlow:    'rgba(201,168,76,0.07)',
}

const STAGES = [
  { num: '01', name: 'Tool',           desc: 'Artists capture shows and submit to PROs in minutes. Royalties enter the pipeline. Immediately useful.' },
  { num: '02', name: 'Habit',          desc: 'Part of the ritual of performing. Before every show, after every show. A career archive that compounds.' },
  { num: '03', name: 'Network',        desc: 'Publishers, co-writers, and fans connected to the live performance record in real time.' },
  { num: '04', name: 'Intelligence',   desc: 'The system surfaces shows that were never submitted. Royalties the artist didn\'t know existed.' },
  { num: '05', name: 'Infrastructure', desc: 'The canonical live performance layer. Licensed to labels, DSPs, PROs, and analytics platforms globally.' },
]

const STATS = [
  { stat: '$2B+',  label: 'Annual live royalty pool',    desc: 'Global PRO collections tied to live performance across SOCAN, ASCAP, BMI, PRS, APRA, SESAC, and GMR.' },
  { stat: '<30%',  label: 'Shows ever submitted',        desc: 'Industry average setlist submission rate. Most live performance royalties are never claimed by anyone.' },
  { stat: '4M+',   label: 'PRO members globally',        desc: 'Working songwriters and performers registered across PROs worldwide — the vast majority submitting nothing.' },
]

export default function HomePage() {
  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif', overflowX: 'hidden' }}>

      {/* ── Ambient background ── */}
      <div aria-hidden style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: [
          'radial-gradient(ellipse 70% 50% at 50% -5%, rgba(201,168,76,0.09) 0%, transparent 70%)',
          'radial-gradient(ellipse 40% 40% at 85% 85%, rgba(201,168,76,0.03) 0%, transparent 60%)',
        ].join(','),
      }} />

      {/* ── Nav ── */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px',
        background: 'rgba(10,9,8,0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Image src="/logo-white.png" alt="Setlistr" width={110} height={29} priority style={{ objectFit: 'contain' }} />
        </Link>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <Link href="/get-paid" style={{
            fontSize: 13, fontWeight: 400, color: C.muted, textDecoration: 'none', letterSpacing: '0.01em',
          }}>
            For Artists
          </Link>
          <a href="mailto:info@setlistr.ai" style={{
            fontSize: 13, fontWeight: 400, color: C.muted, textDecoration: 'none', letterSpacing: '0.01em',
          }}>
            For Publishers
          </a>
          <a href="mailto:info@setlistr.ai" style={{
            fontSize: 12, fontWeight: 600, color: C.bg,
            background: C.gold,
            padding: '7px 16px',
            textDecoration: 'none',
            letterSpacing: '0.04em',
          }}>
            Request Access
          </a>
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
          textAlign: 'center',
          padding: '120px 24px 80px',
        }}>

          {/* Eyebrow */}
          <p style={{
            fontFamily: '"DM Mono", monospace',
            fontSize: 10, fontWeight: 400,
            letterSpacing: '0.28em',
            color: C.goldDim,
            textTransform: 'uppercase',
            margin: '0 0 40px',
            animation: 'fadeUp 0.8s ease 0.1s both',
          }}>
            The system of record for live music
          </p>

          {/* Headline */}
          <h1 style={{
            fontFamily: '"DM Serif Display", Georgia, serif',
            fontWeight: 400,
            fontSize: 'clamp(48px, 8.5vw, 108px)',
            lineHeight: 1.0,
            letterSpacing: '-0.02em',
            color: C.text,
            margin: '0 0 0',
            maxWidth: 860,
            animation: 'fadeUp 1s ease 0.25s both',
          }}>
            Every performance.<br />
            Every song.<br />
            <em style={{ fontStyle: 'italic', color: C.gold }}>Finally accounted for.</em>
          </h1>

          {/* Vertical rule */}
          <div style={{
            width: 1,
            height: 56,
            background: `linear-gradient(to bottom, transparent, ${C.goldDim}, transparent)`,
            margin: '48px auto',
            animation: 'fadeUp 0.8s ease 0.5s both',
          }} />

          {/* Sub */}
          <p style={{
            fontSize: 'clamp(15px, 2vw, 19px)',
            fontWeight: 300,
            color: C.secondary,
            maxWidth: 480,
            lineHeight: 1.7,
            margin: '0 0 52px',
            animation: 'fadeUp 0.8s ease 0.6s both',
          }}>
            Live performance is the largest unstructured dataset in music.
            We are the infrastructure that changes that.
          </p>

          {/* CTAs */}
          <div style={{
            display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center',
            animation: 'fadeUp 0.8s ease 0.75s both',
          }}>
            <Link href="/start" style={{
              display: 'inline-block',
              background: C.gold, color: C.bg,
              fontSize: 13, fontWeight: 700,
              letterSpacing: '0.07em', textTransform: 'uppercase',
              padding: '14px 28px',
              textDecoration: 'none',
            }}>
              See what you're owed →
            </Link>
            <a href="mailto:info@setlistr.ai" style={{
              display: 'inline-block',
              background: 'transparent',
              border: `1px solid ${C.borderGold}`,
              color: C.secondary,
              fontSize: 13, fontWeight: 400,
              letterSpacing: '0.05em',
              padding: '14px 28px',
              textDecoration: 'none',
            }}>
              For publishers & labels
            </a>
          </div>

          {/* PRO strip */}
          <div style={{
            display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap',
            justifyContent: 'center', marginTop: 48,
            animation: 'fadeUp 0.8s ease 0.9s both',
          }}>
            {['SOCAN', 'ASCAP', 'BMI', 'PRS', 'APRA', 'SESAC', 'GMR'].map(pro => (
              <span key={pro} style={{
                fontFamily: '"DM Mono", monospace',
                fontSize: 9, fontWeight: 500,
                letterSpacing: '0.2em',
                color: 'rgba(160,152,128,0.28)',
                textTransform: 'uppercase',
              }}>{pro}</span>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════
            PROBLEM STATEMENT
        ══════════════════════════════════════════ */}
        <section style={{ padding: '0 24px 120px', maxWidth: 900, margin: '0 auto' }}>
          <p style={{
            fontFamily: '"DM Mono", monospace',
            fontSize: 10, letterSpacing: '0.25em',
            color: C.goldDim, textTransform: 'uppercase',
            marginBottom: 40,
          }}>
            001 — The Problem
          </p>
          <p style={{
            fontFamily: '"DM Serif Display", Georgia, serif',
            fontWeight: 400,
            fontSize: 'clamp(24px, 3.5vw, 44px)',
            lineHeight: 1.3,
            color: C.text,
            margin: '0 0 24px',
          }}>
            Every licensed venue in the world pays a blanket license fee
            to a performing rights organization on the artist's behalf.
            That money pools. It waits.
          </p>
          <p style={{
            fontFamily: '"DM Serif Display", Georgia, serif',
            fontWeight: 400,
            fontSize: 'clamp(24px, 3.5vw, 44px)',
            lineHeight: 1.3,
            color: C.secondary,
            margin: 0,
          }}>
            And most of it never reaches the artist who earned it —
            not because the system is corrupt,
            but because{' '}
            <span style={{ color: C.text }}>the underlying data does not exist.</span>
          </p>
        </section>

        {/* ══════════════════════════════════════════
            STATS
        ══════════════════════════════════════════ */}
        <section style={{ padding: '0 24px 120px', maxWidth: 1080, margin: '0 auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 1,
            background: C.border,
            border: `1px solid ${C.border}`,
          }}>
            {STATS.map(({ stat, label, desc }) => (
              <div key={stat} style={{
                background: C.card,
                padding: '44px 36px',
              }}>
                <p style={{
                  fontFamily: '"DM Serif Display", Georgia, serif',
                  fontSize: 'clamp(44px, 5vw, 68px)',
                  fontWeight: 400,
                  color: C.gold,
                  margin: '0 0 12px',
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                }}>
                  {stat}
                </p>
                <p style={{
                  fontSize: 13, fontWeight: 600,
                  color: C.text,
                  margin: '0 0 10px',
                  letterSpacing: '0.01em',
                }}>
                  {label}
                </p>
                <p style={{
                  fontSize: 13, fontWeight: 300,
                  color: C.muted,
                  lineHeight: 1.65,
                  margin: 0,
                }}>
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════
            INFRASTRUCTURE
        ══════════════════════════════════════════ */}
        <section style={{ padding: '0 24px 80px', maxWidth: 1080, margin: '0 auto' }}>

          {/* Section label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 72 }}>
            <div style={{ flex: 1, height: 1, background: C.border }} />
            <span style={{
              fontFamily: '"DM Mono", monospace',
              fontSize: 10, letterSpacing: '0.25em',
              color: C.goldDim, textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}>
              002 — The Infrastructure
            </span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>

          {/* Two-column */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 80,
            marginBottom: 64,
            alignItems: 'start',
          }}>
            <div>
              <h2 style={{
                fontFamily: '"DM Serif Display", Georgia, serif',
                fontWeight: 400,
                fontSize: 'clamp(32px, 4vw, 52px)',
                lineHeight: 1.1,
                color: C.text,
                margin: 0,
              }}>
                This is not a tool.<br />
                This is{' '}
                <em style={{ fontStyle: 'italic', color: C.gold }}>the layer<br />that was missing.</em>
              </h2>
            </div>
            <div style={{ paddingTop: 6 }}>
              <p style={{ fontSize: 15, fontWeight: 300, color: C.secondary, lineHeight: 1.8, margin: '0 0 20px' }}>
                Performing rights organizations have operated the same way for decades —
                sample models, major tour data, and setlists that artists submit manually.
                If they remember. If they find the portal. If the window hasn't closed.
              </p>
              <p style={{ fontSize: 15, fontWeight: 300, color: C.secondary, lineHeight: 1.8, margin: '0 0 20px' }}>
                The result is a financial system that works for artists who are already
                commercially visible. Everyone else — the working songwriter, the regional
                touring act, the writers round performer — leaves money in a pool redistributed
                to the artists who need it least.
              </p>
              <p style={{ fontSize: 15, fontWeight: 300, color: C.secondary, lineHeight: 1.8, margin: 0 }}>
                <strong style={{ color: C.text, fontWeight: 500 }}>
                  Setlistr is the infrastructure that makes the system see every performance.
                </strong>{' '}
                Real-time capture. Structured data. A direct path from show to royalty pipeline —
                for every artist, every venue, every show.
              </p>
            </div>
          </div>

          {/* Stages */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 1,
            background: C.border,
            border: `1px solid ${C.border}`,
          }}>
            {STAGES.map((stage, i) => (
              <div key={stage.num} style={{
                background: i === 0 ? '#0f0e0c' : C.card,
                padding: '28px 22px',
                borderTop: i === 0 ? `2px solid ${C.gold}` : '2px solid transparent',
                position: 'relative',
              }}>
                <span style={{
                  fontFamily: '"DM Mono", monospace',
                  fontSize: 9, letterSpacing: '0.2em',
                  color: i === 0 ? C.gold : C.muted,
                  display: 'block', marginBottom: 16,
                }}>
                  {stage.num}
                </span>
                <p style={{
                  fontFamily: '"DM Serif Display", Georgia, serif',
                  fontSize: 19, fontWeight: 400,
                  color: i === 0 ? C.text : C.secondary,
                  margin: '0 0 10px',
                }}>
                  {stage.name}
                </p>
                <p style={{
                  fontSize: 12, fontWeight: 300,
                  color: C.muted, lineHeight: 1.65, margin: 0,
                }}>
                  {stage.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════
            SEO — Why Now
        ══════════════════════════════════════════ */}
        <section style={{ padding: '80px 24px 120px', maxWidth: 760, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 64 }}>
            <div style={{ flex: 1, height: 1, background: C.border }} />
            <span style={{
              fontFamily: '"DM Mono", monospace',
              fontSize: 10, letterSpacing: '0.25em',
              color: C.goldDim, textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}>
              003 — Why Now
            </span>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>

          <h2 style={{
            fontFamily: '"DM Serif Display", Georgia, serif',
            fontWeight: 400,
            fontSize: 'clamp(26px, 3vw, 38px)',
            color: C.text,
            margin: '0 0 28px',
            lineHeight: 1.2,
          }}>
            The window to build this is open.<br />It will not stay open.
          </h2>

          <p style={{ fontSize: 15, fontWeight: 300, color: C.secondary, lineHeight: 1.9, margin: '0 0 20px' }}>
            The problem of <strong style={{ color: C.text, fontWeight: 400 }}>unclaimed live performance royalties</strong> has
            existed for decades. What is different now is that the technology to solve it has matured
            simultaneously with the industry's openness to third-party digital workflows. Audio recognition
            is accurate enough for real-time live song identification at scale. Mobile-first behavior makes
            passive background capture possible. PRO APIs exist — and in some cases are entirely unoccupied.
          </p>

          <p style={{ fontSize: 15, fontWeight: 300, color: C.secondary, lineHeight: 1.9, margin: '0 0 20px' }}>
            Every working songwriter registered with <strong style={{ color: C.text, fontWeight: 400 }}>SOCAN, ASCAP, BMI,
            PRS, APRA, SESAC, or GMR</strong> is owed performance royalties for every live performance of their
            licensed songs. The <strong style={{ color: C.text, fontWeight: 400 }}>setlist submission</strong> process
            required to collect those royalties is the only barrier between the artist and the money they
            have already earned. Most never submit. Most publishers never follow up. Most PROs never know
            the show happened.
          </p>

          <p style={{ fontSize: 15, fontWeight: 300, color: C.secondary, lineHeight: 1.9, margin: 0 }}>
            The first platform to capture live performance data at scale owns it permanently.
            Historical performance records cannot be recreated retroactively.
            {' '}<strong style={{ color: C.text, fontWeight: 400 }}>
              This is the race — and it has already started.
            </strong>
          </p>
        </section>

        {/* ══════════════════════════════════════════
            ACCESS
        ══════════════════════════════════════════ */}
        <section style={{
          padding: '80px 24px 140px',
          maxWidth: 760, margin: '0 auto',
          textAlign: 'center',
          position: 'relative',
        }}>
          {/* Top rule */}
          <div style={{
            position: 'absolute', top: 0, left: '50%',
            transform: 'translateX(-50%)',
            width: 1, height: 80,
            background: `linear-gradient(to bottom, transparent, ${C.goldDim})`,
          }} />

          <span style={{
            fontFamily: '"DM Mono", monospace',
            fontSize: 10, letterSpacing: '0.28em',
            color: C.goldDim, textTransform: 'uppercase',
            display: 'block', marginBottom: 32,
          }}>
            Request Access
          </span>

          <h2 style={{
            fontFamily: '"DM Serif Display", Georgia, serif',
            fontWeight: 400,
            fontSize: 'clamp(36px, 5vw, 62px)',
            color: C.text, lineHeight: 1.1,
            margin: '0 0 20px',
          }}>
            Early access.<br />
            <em style={{ fontStyle: 'italic', color: C.gold }}>Limited availability.</em>
          </h2>

          <p style={{
            fontSize: 15, fontWeight: 300,
            color: C.secondary,
            margin: '0 auto 56px',
            lineHeight: 1.7, maxWidth: 420,
          }}>
            We are building the infrastructure layer for live music.
            We want the right people in early.
          </p>

          {/* Two paths */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            maxWidth: 580, margin: '0 auto 40px',
            textAlign: 'left',
          }}>
            {/* Artist */}
            <Link href="/start" style={{
              display: 'block',
              background: C.card,
              border: `1px solid ${C.border}`,
              padding: '32px 28px',
              textDecoration: 'none',
              transition: 'border-color 0.2s ease',
            }}
            onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
              e.currentTarget.style.borderColor = C.borderGold
            }}
            onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
              e.currentTarget.style.borderColor = C.border
            }}>
              <span style={{
                fontFamily: '"DM Mono", monospace',
                fontSize: 9, letterSpacing: '0.22em',
                color: C.goldDim, textTransform: 'uppercase',
                display: 'block', marginBottom: 12,
              }}>
                For Artists
              </span>
              <p style={{
                fontFamily: '"DM Serif Display", Georgia, serif',
                fontSize: 20, fontWeight: 400,
                color: C.text, margin: '0 0 10px',
              }}>
                Performing songwriters & touring acts
              </p>
              <p style={{
                fontSize: 12, fontWeight: 300,
                color: C.muted, lineHeight: 1.65,
                margin: '0 0 24px',
              }}>
                Capture every show. Submit to every PRO. Build the performance record
                that earns royalties for the rest of your career.
              </p>
              <span style={{
                fontFamily: '"DM Mono", monospace',
                fontSize: 10, letterSpacing: '0.15em',
                color: C.gold,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                See what you're owed →
              </span>
            </Link>

            {/* Publisher */}
            <a href="mailto:info@setlistr.ai" style={{
              display: 'block',
              background: C.card,
              border: `1px solid ${C.border}`,
              padding: '32px 28px',
              textDecoration: 'none',
              transition: 'border-color 0.2s ease',
            }}
            onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
              e.currentTarget.style.borderColor = C.borderGold
            }}
            onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
              e.currentTarget.style.borderColor = C.border
            }}>
              <span style={{
                fontFamily: '"DM Mono", monospace',
                fontSize: 9, letterSpacing: '0.22em',
                color: C.goldDim, textTransform: 'uppercase',
                display: 'block', marginBottom: 12,
              }}>
                For Publishers & Labels
              </span>
              <p style={{
                fontFamily: '"DM Serif Display", Georgia, serif',
                fontSize: 20, fontWeight: 400,
                color: C.text, margin: '0 0 10px',
              }}>
                Roster intelligence & royalty recovery
              </p>
              <p style={{
                fontSize: 12, fontWeight: 300,
                color: C.muted, lineHeight: 1.65,
                margin: '0 0 24px',
              }}>
                Real-time visibility into what your writers are performing live,
                what is unclaimed, and what can be recovered.
              </p>
              <span style={{
                fontFamily: '"DM Mono", monospace',
                fontSize: 10, letterSpacing: '0.15em',
                color: C.gold,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                Request a conversation →
              </span>
            </a>
          </div>

          {/* Investor line */}
          <p style={{
            fontFamily: '"DM Mono", monospace',
            fontSize: 10, letterSpacing: '0.15em',
            color: C.muted,
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
          padding: '32px 32px',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 20,
        }}>
          <Link href="/" style={{ textDecoration: 'none', opacity: 0.6, transition: 'opacity 0.2s' }}>
            <Image src="/logo-white.png" alt="Setlistr" width={90} height={24} style={{ objectFit: 'contain' }} />
          </Link>
          <nav style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
            {[
              { label: 'For Artists',   href: '/get-paid' },
              { label: 'How It Works',  href: '/start' },
              { label: 'Contact',       href: 'mailto:info@setlistr.ai' },
              { label: 'Investors',     href: 'mailto:invest@setlistr.ai' },
              { label: 'Privacy',       href: '/privacy' },
              { label: 'Terms',         href: '/terms' },
            ].map(({ label, href }) => (
              href.startsWith('mailto') ? (
                <a key={label} href={href} style={{
                  fontFamily: '"DM Mono", monospace',
                  fontSize: 10, letterSpacing: '0.12em',
                  color: C.muted, textDecoration: 'none',
                  textTransform: 'uppercase', transition: 'color 0.2s',
                }}>{label}</a>
              ) : (
                <Link key={label} href={href} style={{
                  fontFamily: '"DM Mono", monospace',
                  fontSize: 10, letterSpacing: '0.12em',
                  color: C.muted, textDecoration: 'none',
                  textTransform: 'uppercase', transition: 'color 0.2s',
                }}>{label}</Link>
              )
            ))}
          </nav>
          <p style={{
            fontFamily: '"DM Mono", monospace',
            fontSize: 10, letterSpacing: '0.1em',
            color: 'rgba(90,84,72,0.5)', margin: 0,
          }}>
            © {new Date().getFullYear()} Setlistr Inc.
          </p>
        </footer>
      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 720px) {
          .stats-grid { grid-template-columns: 1fr !important; }
          .stages-grid { grid-template-columns: 1fr !important; }
          .infra-grid  { grid-template-columns: 1fr !important; gap: 40px !important; }
          .access-grid { grid-template-columns: 1fr !important; }
          .footer-nav  { display: none !important; }
        }
      `}</style>
    </div>
  )
}
