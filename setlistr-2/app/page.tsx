import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import WaitlistForm from '@/components/WaitlistForm'
import CursorEffect from '@/components/CursorEffect'
import StageCards from '@/components/StageCards'

export const metadata: Metadata = {
  title: 'Setlistr — The System of Record for Live Music',
  description: 'The live performance record has never existed. Until now. Setlistr is the data infrastructure that connects every show, every song, and every royalty — automatically.',
  openGraph: {
    title: 'Setlistr — The System of Record for Live Music',
    description: 'The live performance record has never existed. Until now.',
    url: 'https://setlistr.ai',
    siteName: 'Setlistr',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Setlistr — The System of Record for Live Music',
    description: 'The live performance record has never existed. Until now.',
  },
  alternates: { canonical: 'https://setlistr.ai' },
  keywords: [
    'live performance royalties', 'setlist submission', 'SOCAN submission',
    'ASCAP live performance', 'BMI setlist', 'PRS royalties', 'APRA performance',
    'SESAC live', 'GMR royalties', 'unclaimed music royalties',
    'how to submit setlist to PRO', 'live music royalty tracking',
    'performance rights submission', 'songwriter live royalties',
  ],
}


export default function HomePage() {
  return (
    <div style={{
      minHeight: '100svh',
      background: '#080706',
      overflowX: 'hidden',
      fontFamily: '"DM Sans", system-ui, sans-serif',
      color: '#FFFFFF',
      cursor: 'none',
    }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap');

        #sl-cursor {
          position: fixed; width: 10px; height: 10px;
          background: #C9A84C; border-radius: 50%;
          pointer-events: none; z-index: 9999;
          transform: translate(-50%,-50%);
        }
        #sl-cursor-ring {
          position: fixed; width: 32px; height: 32px;
          border: 1px solid rgba(201,168,76,0.4); border-radius: 50%;
          pointer-events: none; z-index: 9998;
          transform: translate(-50%,-50%);
          transition: all .2s cubic-bezier(.16,1,.3,1);
        }

        .sl-bg-lines {
          position: fixed; inset: 0; pointer-events: none; z-index: 0; overflow: hidden;
        }
        .sl-bg-lines::before {
          content: "";
          position: absolute; top: -50%; left: -50%; width: 200%; height: 200%;
          background: repeating-linear-gradient(0deg, transparent, transparent 79px, rgba(201,168,76,0.025) 80px);
          animation: drift 40s linear infinite;
        }
        .sl-bg-lines::after {
          content: "";
          position: absolute; top: -50%; left: -50%; width: 200%; height: 200%;
          background: repeating-linear-gradient(90deg, transparent, transparent 79px, rgba(201,168,76,0.015) 80px);
          animation: drift 60s linear infinite reverse;
        }
        @keyframes drift {
          from { transform: translate(0,0); }
          to   { transform: translate(80px,80px); }
        }

        .sl-orb {
          position: fixed; pointer-events: none; z-index: 0;
          border-radius: 50%; filter: blur(120px);
        }

        .sl-pulse {
          width: 6px; height: 6px; background: #C9A84C;
          border-radius: 50%; flex-shrink: 0;
          animation: pulse 1.8s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: .4; transform: scale(.7); }
        }

        .sl-nav-link {
          font-family: "DM Mono", monospace;
          font-size: 11px; letter-spacing: .14em; text-transform: uppercase;
          color: #d4d1ca; text-decoration: none; transition: color .2s;
        }
        .sl-nav-link:hover { color: #C9A84C; }

        .sl-nav-apply {
          font-family: "DM Mono", monospace;
          font-size: 11px; letter-spacing: .14em; text-transform: uppercase;
          background: #C9A84C; color: #080706;
          padding: 9px 20px; text-decoration: none; border-radius: 6px;
          transition: opacity .2s;
        }
        .sl-nav-apply:hover { opacity: .84; }

        .sl-hero-tag {
          display: inline-flex; align-items: center; gap: 8px;
          border: 1px solid rgba(201,168,76,.4); border-radius: 20px;
          padding: 6px 18px;
          font-family: "DM Mono", monospace;
          font-size: 11px; color: #C9A84C; letter-spacing: .14em;
          text-transform: uppercase; margin-bottom: 32px;
        }

        /* Stats */
        .sl-stat {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 14px; padding: 32px 28px;
          text-align: center; position: relative; overflow: hidden;
          transition: border-color .25s;
        }
        .sl-stat::before {
          content: "";
          position: absolute; inset: 0;
          background: linear-gradient(135deg, rgba(201,168,76,.06), transparent);
          pointer-events: none;
        }
        .sl-stat:hover { border-color: rgba(201,168,76,.3); }

        /* Cards */
        .sl-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 14px; transition: border-color .25s;
        }
        .sl-card:hover { border-color: rgba(201,168,76,.3); }

        .sl-card-gold {
          background: linear-gradient(135deg, rgba(201,168,76,.1), rgba(201,168,76,.03));
          border: 1px solid rgba(201,168,76,.35); border-radius: 14px;
        }

        /* ── STAGES — visual rebuild ── */
        .sl-stage-wrap {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 10px;
        }

        .sl-stage {
          position: relative; overflow: hidden;
          border-radius: 14px;
          padding: 28px 24px 28px;
          display: flex; flex-direction: column;
          min-height: 240px;
          transition: border-color .25s, background .25s;
        }

        .sl-stage-inactive {
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.06);
        }
        .sl-stage-inactive:hover {
          border-color: rgba(201,168,76,.2);
          background: rgba(255,255,255,0.04);
        }

        .sl-stage-active {
          background: linear-gradient(145deg, rgba(201,168,76,.15), rgba(201,168,76,.04));
          border: 1px solid rgba(201,168,76,.5);
        }

        /* Watermark number */
        .sl-stage-watermark {
          position: absolute;
          bottom: -12px; right: 12px;
          font-family: "Bebas Neue", sans-serif;
          font-size: 96px; line-height: 1;
          letter-spacing: 0.04em;
          pointer-events: none; user-select: none;
        }
        .sl-stage-inactive .sl-stage-watermark { color: rgba(255,255,255,0.04); }
        .sl-stage-active   .sl-stage-watermark { color: rgba(201,168,76,0.18); }

        .sl-stage-top {
          display: flex; align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .sl-stage-num {
          font-family: "DM Mono", monospace;
          font-size: 10px; letter-spacing: 0.2em;
        }
        .sl-stage-inactive .sl-stage-num { color: rgba(255,255,255,0.2); }
        .sl-stage-active   .sl-stage-num { color: #C9A84C; }

        .sl-stage-badge {
          font-family: "DM Mono", monospace;
          font-size: 8px; letter-spacing: .12em;
          color: #C9A84C;
          border: 1px solid rgba(201,168,76,.4);
          padding: 2px 7px; border-radius: 3px;
        }

        .sl-stage-when {
          font-family: "DM Mono", monospace;
          font-size: 9px; letter-spacing: .12em;
          color: rgba(255,255,255,0.18);
        }

        .sl-stage-name {
          font-family: "Bebas Neue", sans-serif;
          font-size: 28px; letter-spacing: 0.04em;
          margin: 0 0 10px; position: relative; z-index: 1;
        }
        .sl-stage-inactive .sl-stage-name { color: rgba(255,255,255,0.4); }
        .sl-stage-active   .sl-stage-name { color: #FFFFFF; }

        .sl-stage-desc {
          font-size: 13px; font-weight: 300;
          line-height: 1.6;
          position: relative; z-index: 1;
          flex: 1;
        }
        .sl-stage-inactive .sl-stage-desc { color: rgba(255,255,255,0.25); }
        .sl-stage-active   .sl-stage-desc { color: rgba(255,255,255,0.7); }

        /* Traction pills */
        .sl-pill {
          display: inline-flex; align-items: center; gap: 8px;
          border: 1px solid rgba(39,174,96,.35);
          background: rgba(39,174,96,.08);
          color: #4ec97b;
          font-family: "DM Mono", monospace;
          font-size: 11px; padding: 7px 16px;
          border-radius: 20px; letter-spacing: .06em;
        }

        .sl-access-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 14px; padding: 26px;
          transition: border-color .25s;
          text-decoration: none; display: block;
        }
        .sl-access-card:hover { border-color: rgba(201,168,76,.4); }

        .sl-footer-link {
          font-family: "DM Mono", monospace;
          font-size: 10px; letter-spacing: .12em;
          color: #3a3028; text-decoration: none;
          text-transform: uppercase; transition: color .2s;
        }
        .sl-footer-link:hover { color: #605e58; }

        @media (max-width: 900px) {
          .sl-stats-grid  { grid-template-columns: 1fr !important; }
          .sl-stage-wrap  { grid-template-columns: 1fr 1fr !important; }
          .sl-split       { grid-template-columns: 1fr !important; gap: 40px !important; }
        }
        @media (max-width: 540px) {
          .sl-stage-wrap  { grid-template-columns: 1fr !important; }
          .sl-hide-mobile { display: none !important; }
          #sl-cursor, #sl-cursor-ring { display: none !important; }
        }

        input::placeholder { color: #3a3028 !important; }
      `}</style>

      {/* Cursor elements — animated by CursorEffect client component */}
      <div id="sl-cursor" />
      <div id="sl-cursor-ring" />
      <CursorEffect />

      {/* Background */}
      <div className="sl-bg-lines" />
      <div className="sl-orb" style={{ width: 500, height: 500, background: 'radial-gradient(circle, rgba(201,168,76,1), transparent)', opacity: 0.14, top: -200, right: -150 }} />
      <div className="sl-orb" style={{ width: 350, height: 350, background: 'radial-gradient(circle, rgba(201,168,76,0.6), transparent)', opacity: 0.12, bottom: -100, left: -100 }} />

      {/* ════ NAV ════ */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 48px',
        background: 'rgba(8,7,6,0.88)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <Image src="/logo-white.png" alt="Setlistr" width={120} height={32} priority style={{ objectFit: 'contain', opacity: 0.92 }} />
        </Link>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
          <Link href="/get-paid" className="sl-nav-link sl-hide-mobile">For Artists</Link>
          <a href="mailto:info@setlistr.ai" className="sl-nav-link sl-hide-mobile">For Publishers</a>
          <a href="#access" className="sl-nav-apply">Apply</a>
        </nav>
      </header>

      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ════ HERO ════ */}
        <section style={{
          minHeight: '100svh',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', padding: '100px 24px 80px',
        }}>
          <div className="sl-hero-tag">
            <div className="sl-pulse" />
            Live Performance Infrastructure
          </div>

          <h1 style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: 'clamp(60px, 10vw, 148px)',
            lineHeight: 0.9, letterSpacing: '0.03em',
            color: '#FFFFFF', margin: 0, maxWidth: 960,
          }}>
            The Live<br />
            Performance Record<br />
            Has Never <span style={{ color: '#C9A84C' }}>Existed.</span>
          </h1>

          <div style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: 'clamp(36px, 6vw, 88px)',
            lineHeight: 1.0, letterSpacing: '0.03em',
            color: 'rgba(255,255,255,0.2)',
            marginTop: 4, marginBottom: 40,
          }}>
            Until Now.
          </div>

          <p style={{
            fontSize: 'clamp(16px, 2vw, 20px)', fontWeight: 300,
            color: '#d4d1ca', maxWidth: 520, lineHeight: 1.7,
            margin: '0 0 48px',
          }}>
            Every show. Every song. Every royalty — captured, structured,
            and routed to every PRO. Automatically.
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 56 }}>
            <Link href="/start" style={{
              fontFamily: '"Bebas Neue", sans-serif',
              fontSize: 18, letterSpacing: '0.1em',
              background: '#C9A84C', color: '#080706',
              padding: '14px 32px', textDecoration: 'none', borderRadius: 8,
            }}>
              See What You&apos;re Owed
            </Link>
            <a href="#access" style={{
              fontFamily: '"Bebas Neue", sans-serif',
              fontSize: 18, letterSpacing: '0.1em',
              background: 'transparent',
              border: '1px solid rgba(201,168,76,0.35)',
              color: '#d4d1ca',
              padding: '14px 32px', textDecoration: 'none', borderRadius: 8,
            }}>
              Request Access
            </a>
          </div>

          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
            {['SOCAN', 'ASCAP', 'BMI', 'PRS', 'APRA', 'SESAC', 'GMR'].map(pro => (
              <span key={pro} style={{
                fontFamily: '"DM Mono", monospace',
                fontSize: 11, letterSpacing: '0.18em',
                color: 'rgba(212,209,202,0.4)',
                textTransform: 'uppercase',
              }}>{pro}</span>
            ))}
          </div>
        </section>

        {/* ════ STATS ════ */}
        <section style={{ padding: '0 48px 80px', maxWidth: 1200, margin: '0 auto' }}>
          <div className="sl-stats-grid" style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14,
          }}>
            {[
              { stat: '$2B+', label: 'Annual live royalty pool',
                sub: 'Global PRO collections tied to live performance. The money is collected. It just can\'t be distributed.' },
              { stat: '<30%', label: 'Shows ever submitted',
                sub: 'Most live performances generate no royalty claim — ever. The submission never happens.' },
              { stat: '0',    label: 'Verified real-time live performance databases',
                sub: 'No PRO has it. No label has it. No streaming platform has it. Until now.' },
            ].map(({ stat, label, sub }) => (
              <div key={stat} className="sl-stat">
                <div style={{
                  fontFamily: '"Bebas Neue", sans-serif',
                  fontSize: 'clamp(52px, 6vw, 88px)',
                  color: '#C9A84C', lineHeight: 1,
                  letterSpacing: '0.02em', marginBottom: 12,
                }}>{stat}</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#f5f3ef', marginBottom: 10 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 300, color: '#605e58', lineHeight: 1.65 }}>{sub}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ════ STATEMENT ════ */}
        <section style={{ padding: '0 48px 60px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{
            fontFamily: '"DM Mono", monospace',
            fontSize: 11, letterSpacing: '0.22em',
            color: '#C9A84C', textTransform: 'uppercase', marginBottom: 24,
          }}>The Problem</div>
          <h2 style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: 'clamp(40px, 6vw, 84px)',
            lineHeight: 0.95, letterSpacing: '0.02em',
            color: '#FFFFFF', margin: '0 0 12px',
          }}>An artist just walked off stage.</h2>
          <h2 style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: 'clamp(40px, 6vw, 84px)',
            lineHeight: 0.95, letterSpacing: '0.02em',
            color: '#C9A84C', margin: '0 0 32px',
          }}>They left $340 behind.</h2>
          <p style={{ fontSize: 18, fontWeight: 300, color: '#d4d1ca', lineHeight: 1.75, maxWidth: 720, margin: 0 }}>
            They&apos;ll do it again tomorrow. And every night after that. Not because they&apos;re lazy —
            because the system to capture it was never built. PROs hold billions in royalties they
            literally cannot distribute. The underlying performance data doesn&apos;t exist.
          </p>
        </section>

        {/* ════ HOW IT WORKS ════ */}
        <section style={{ padding: '0 48px 80px', maxWidth: 1200, margin: '0 auto' }}>
          <div className="sl-split" style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'start',
          }}>
            <div>
              <div style={{
                fontFamily: '"DM Mono", monospace',
                fontSize: 11, letterSpacing: '0.22em',
                color: '#C9A84C', textTransform: 'uppercase', marginBottom: 20,
              }}>The Solution</div>
              <h2 style={{
                fontFamily: '"Bebas Neue", sans-serif',
                fontSize: 'clamp(36px, 5vw, 68px)',
                lineHeight: 0.95, letterSpacing: '0.02em',
                color: '#FFFFFF', margin: '0 0 24px',
              }}>
                Not a tool.<br />
                <span style={{ color: '#C9A84C' }}>The layer<br />that was missing.</span>
              </h2>
              <p style={{ fontSize: 16, fontWeight: 300, color: '#d4d1ca', lineHeight: 1.8, margin: '0 0 20px' }}>
                Setlistr connects performance to payment in one continuous system.
                Real-time audio recognition captures songs as they are performed.
                Structured data is built automatically — artist, song, venue, co-writers, PRO affiliations.
              </p>
              <p style={{ fontSize: 16, fontWeight: 300, color: '#d4d1ca', lineHeight: 1.8, margin: 0 }}>
                Submission packages are prepared and filed in minutes, not hours.
                For every artist. Every venue. Every show.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { step: '01', title: 'Open before the show',  body: 'Load your planned set or let audio recognition do everything. The capture engine arms automatically.' },
                { step: '02', title: 'Play your show',         body: 'Real-time song identification as you perform. No interruptions. No manual input during the set.' },
                { step: '03', title: 'Review in 90 seconds',   body: 'Post-show recap shows songs captured, royalty estimate, and submission status. Confirm and done.' },
                { step: '04', title: 'Submit to your PRO',     body: 'PRO-specific formatted packages with direct deep links. 45 minutes of confusion becomes 5 minutes.' },
              ].map(({ step, title, body }) => (
                <div key={step} className="sl-card" style={{ padding: '18px 22px', display: 'flex', gap: 18, alignItems: 'flex-start' }}>
                  <span style={{
                    fontFamily: '"DM Mono", monospace',
                    fontSize: 11, letterSpacing: '0.12em',
                    color: '#C9A84C', flexShrink: 0, paddingTop: 2,
                  }}>{step}</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#f5f3ef', marginBottom: 4 }}>{title}</div>
                    <div style={{ fontSize: 13, fontWeight: 300, color: '#605e58', lineHeight: 1.6 }}>{body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ════ STAGES ════ */}
        <section style={{ padding: '0 48px 80px', maxWidth: 1200, margin: '0 auto' }}>
          <div style={{
            fontFamily: '"DM Mono", monospace',
            fontSize: 11, letterSpacing: '0.22em',
            color: '#C9A84C', textTransform: 'uppercase', marginBottom: 20,
          }}>The Roadmap</div>
          <StageCards />
        </section>

        {/* ════ WHY NOW ════ */}
        <section style={{ padding: '0 48px 80px', maxWidth: 800, margin: '0 auto' }}>
          <div style={{
            fontFamily: '"DM Mono", monospace',
            fontSize: 11, letterSpacing: '0.22em',
            color: '#C9A84C', textTransform: 'uppercase', marginBottom: 24,
          }}>Why Now</div>
          <h2 style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: 'clamp(36px, 5vw, 64px)',
            lineHeight: 0.95, letterSpacing: '0.02em',
            color: '#FFFFFF', margin: '0 0 32px',
          }}>
            The Window Is Open.<br />
            <span style={{ color: '#C9A84C' }}>It Will Not Stay Open.</span>
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{ fontSize: 16, fontWeight: 300, color: '#d4d1ca', lineHeight: 1.85, margin: 0 }}>
              The problem of <strong style={{ color: '#f5f3ef', fontWeight: 400 }}>unclaimed live performance royalties</strong> has
              existed for decades. What is different now is that audio recognition is accurate enough
              for real-time live song identification at scale. Mobile-first behavior makes passive
              background capture possible. PRO submission infrastructure exists and is ready for
              third-party integration.
            </p>
            <p style={{ fontSize: 16, fontWeight: 300, color: '#d4d1ca', lineHeight: 1.85, margin: 0 }}>
              Every working songwriter registered with <strong style={{ color: '#f5f3ef', fontWeight: 400 }}>SOCAN, ASCAP, BMI,
              PRS for Music, APRA AMCOS, SESAC, or GMR</strong> is owed performance royalties for every
              live performance of their registered songs. The <strong style={{ color: '#f5f3ef', fontWeight: 400 }}>setlist
              submission</strong> process is the only barrier between the artist and money they have
              already earned. Most never submit. Most publishers never follow up.
              Most PROs never know the show happened.
            </p>
            <p style={{ fontSize: 16, fontWeight: 300, color: '#d4d1ca', lineHeight: 1.85, margin: 0 }}>
              The first platform to capture live performance data at scale owns it permanently.
              Historical records cannot be recreated retroactively.{' '}
              <strong style={{ color: '#C9A84C', fontWeight: 400 }}>
                This is the race. Setlistr is already moving.
              </strong>
            </p>
          </div>
        </section>

        {/* ════ MOAT QUOTE ════ */}
        <section style={{ padding: '0 48px 80px', maxWidth: 1200, margin: '0 auto' }}>
          <div className="sl-card-gold" style={{ padding: '36px 44px' }}>
            <div style={{
              fontFamily: '"Bebas Neue", sans-serif',
              fontSize: 'clamp(22px, 3vw, 42px)',
              lineHeight: 1.1, letterSpacing: '0.02em',
              color: '#FFFFFF', margin: '0 0 16px',
            }}>
              &ldquo;Anyone can build a submission tool. No one can recreate a global dataset
              of verified live performance history once it has been captured.
              The first mover owns it permanently.&rdquo;
            </div>
            <div style={{
              fontFamily: '"DM Mono", monospace',
              fontSize: 10, letterSpacing: '0.18em',
              color: 'rgba(201,168,76,0.6)', textTransform: 'uppercase',
            }}>
              Setlistr Strategic Blueprint &middot; 2026
            </div>
          </div>
        </section>

        {/* ════ TRACTION ════ */}
        <section style={{ padding: '0 48px 80px', maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            {[
              'Product live · Beta users active',
              'SOCAN validation confirmed',
              'Universal Music Publishing conversations active',
              'Strategic advisor · Enterprise infrastructure background',
              '6 provisional patents drafted',
              'First investor committed',
            ].map(label => (
              <div key={label} className="sl-pill">
                <div className="sl-pulse" style={{ background: '#27ae60' }} />
                {label}
              </div>
            ))}
          </div>
        </section>

        {/* ════ ACCESS ════ */}
        <section id="access" style={{
          padding: '80px 24px 120px',
          textAlign: 'center', position: 'relative',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: '50%',
            transform: 'translateX(-50%)',
            width: 1, height: 80,
            background: 'linear-gradient(to bottom, transparent, rgba(201,168,76,0.5))',
          }} />

          <h2 style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: 'clamp(48px, 8vw, 96px)',
            lineHeight: 0.92, letterSpacing: '0.03em',
            color: '#FFFFFF', margin: '0 0 8px',
          }}>
            Early Access.
          </h2>
          <h2 style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: 'clamp(48px, 8vw, 96px)',
            lineHeight: 0.92, letterSpacing: '0.03em',
            color: '#C9A84C', margin: '0 0 24px',
          }}>
            By Application Only.
          </h2>

          <p style={{
            fontSize: 16, fontWeight: 300, color: '#605e58',
            maxWidth: 380, margin: '0 auto 48px', lineHeight: 1.7,
          }}>
            We are onboarding a limited number of artists and industry partners.
            Applications are reviewed personally.
          </p>

          <WaitlistForm />

          <p style={{
            fontFamily: '"DM Mono", monospace',
            fontSize: 10, letterSpacing: '0.12em',
            color: '#3a3028', marginTop: 32,
          }}>
            Investor inquiries —{' '}
            <a href="mailto:info@setlistr.ai" style={{ color: 'rgba(201,168,76,0.45)', textDecoration: 'none' }}>
              info@setlistr.ai
            </a>
          </p>
        </section>

        {/* ════ FOOTER ════ */}
        <footer style={{
          borderTop: '1px solid rgba(255,255,255,0.05)',
          padding: '32px 48px',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', flexWrap: 'wrap', gap: 20,
        }}>
          <Image src="/logo-white.png" alt="Setlistr" width={80} height={22}
            style={{ objectFit: 'contain', opacity: 0.35 }} />
          <nav style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[
              { label: 'For Artists',  href: '/get-paid' },
              { label: 'How It Works', href: '/start' },
              { label: 'Contact',      href: 'mailto:info@setlistr.ai' },
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
            fontFamily: '"DM Mono", monospace',
            fontSize: 10, letterSpacing: '0.1em',
            color: '#2a2520', margin: 0,
          }}>
            © {new Date().getFullYear()} Setlistr Inc.
          </p>
        </footer>
      </div>
    </div>
  )
}
