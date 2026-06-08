import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import WaitlistForm from '@/components/WaitlistForm'
import CursorEffect from '@/components/CursorEffect'

export const metadata: Metadata = {
  title: 'Setlistr — The System of Record for Live Music',
  description: 'Live performance is the largest blind spot in music. Every show. Every song. Every royalty. Finally accounted for.',
  openGraph: {
    title: 'Setlistr — The System of Record for Live Music',
    description: 'Live performance is the largest blind spot in music.',
    url: 'https://setlistr.ai',
    siteName: 'Setlistr',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Setlistr — The System of Record for Live Music',
    description: 'Live performance is the largest blind spot in music.',
  },
  alternates: { canonical: 'https://setlistr.ai' },
  keywords: [
    'live performance royalties', 'setlist submission', 'SOCAN submission',
    'ASCAP live performance', 'BMI setlist', 'PRS royalties', 'APRA performance',
    'SESAC live', 'GMR royalties', 'unclaimed music royalties',
    'how to submit setlist to PRO', 'live music royalty tracking',
    'performance rights submission', 'songwriter live royalties',
    'setlister', 'setlist app for musicians', 'setlist submission app',
    'live performance tracking app', 'music performance royalties',
    'performing rights organization submission',
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
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: .3; transform: scale(.6); }
        }

        /* Nav */
        .sl-nav-link {
          font-family: "DM Mono", monospace;
          font-size: 11px; letter-spacing: .14em; text-transform: uppercase;
          color: rgba(212,209,202,0.5); text-decoration: none; transition: color .2s;
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

        /* Stats row */
        .sl-stats {
          display: flex;
          gap: 0;
          border-top: 1px solid rgba(255,255,255,0.06);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .sl-stat-cell {
          flex: 1;
          padding: 36px 0;
          text-align: center;
          border-right: 1px solid rgba(255,255,255,0.06);
        }
        .sl-stat-cell:last-child { border-right: none; }

        /* Footer */
        .sl-footer-link {
          font-family: "DM Mono", monospace;
          font-size: 10px; letter-spacing: .12em;
          color: #3a3028; text-decoration: none;
          text-transform: uppercase; transition: color .2s;
        }
        .sl-footer-link:hover { color: #605e58; }

        /* Fade-up animation */
        .sl-fade { opacity: 0; animation: fadeUp .9s cubic-bezier(.16,1,.3,1) forwards; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 600px) {
          .sl-stats { flex-direction: column; }
          .sl-stat-cell { border-right: none; border-bottom: 1px solid rgba(255,255,255,0.06); }
          .sl-stat-cell:last-child { border-bottom: none; }
          .sl-hide-mobile { display: none !important; }
          #sl-cursor, #sl-cursor-ring { display: none !important; }
        }

        input::placeholder { color: #3a3028 !important; }
      `}</style>

      <div id="sl-cursor" />
      <div id="sl-cursor-ring" />
      <CursorEffect />

      <div className="sl-bg-lines" />
      <div className="sl-orb" style={{ width: 600, height: 600, background: 'radial-gradient(circle, rgba(201,168,76,1), transparent)', opacity: 0.11, top: -250, right: -200 }} />
      <div className="sl-orb" style={{ width: 400, height: 400, background: 'radial-gradient(circle, rgba(201,168,76,1), transparent)', opacity: 0.07, bottom: -150, left: -150 }} />

      {/* ── NAV ── */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 48px',
        background: 'rgba(8,7,6,0.85)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <Image src="/logo-white.png" alt="Setlistr" width={120} height={32} priority style={{ objectFit: 'contain', opacity: 0.9 }} />
        </Link>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
          <Link href="/get-paid" className="sl-nav-link sl-hide-mobile">For Artists</Link>
          <a href="mailto:info@setlistr.ai" className="sl-nav-link sl-hide-mobile">For Publishers</a>
          <a href="#access" className="sl-nav-apply">Apply</a>
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
        }}>

          {/* Eyebrow */}
          <div className="sl-fade" style={{ animationDelay: '0.1s',
            display: 'inline-flex', alignItems: 'center', gap: 10,
            border: '1px solid rgba(201,168,76,.35)', borderRadius: 20,
            padding: '6px 18px', marginBottom: 40,
            fontFamily: '"DM Mono", monospace',
            fontSize: 11, color: '#C9A84C', letterSpacing: '.16em',
            textTransform: 'uppercase',
          }}>
            <div className="sl-pulse" />
            Verified Performance Intelligence
          </div>

          {/* Headline */}
          <h1 className="sl-fade" style={{ animationDelay: '0.3s',
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: 'clamp(64px, 11vw, 152px)',
            lineHeight: 0.88, letterSpacing: '0.025em',
            color: '#FFFFFF', margin: 0, maxWidth: 1000,
          }}>
            The Live<br />
            Performance Record<br />
            Has Never{' '}
            <span style={{ color: '#C9A84C' }}>Existed.</span>
          </h1>

          {/* Ghost line */}
          <div className="sl-fade" style={{ animationDelay: '0.75s',
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: 'clamp(40px, 7vw, 96px)',
            lineHeight: 1.0, letterSpacing: '0.025em',
            color: 'rgba(255,255,255,0.15)',
            marginTop: 0, marginBottom: 52,
          }}>
            Until Now.
          </div>

          {/* CTAs */}
          <div className="sl-fade" style={{ animationDelay: '1s',
            display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center',
            marginBottom: 64,
          }}>
            <Link href="/start" style={{
              fontFamily: '"Bebas Neue", sans-serif',
              fontSize: 18, letterSpacing: '0.1em',
              background: '#C9A84C', color: '#080706',
              padding: '14px 36px', textDecoration: 'none', borderRadius: 8,
            }}>
              See What You&apos;re Owed
            </Link>
            <a href="#access" style={{
              fontFamily: '"Bebas Neue", sans-serif',
              fontSize: 18, letterSpacing: '0.1em',
              background: 'transparent',
              border: '1px solid rgba(201,168,76,0.3)',
              color: 'rgba(212,209,202,0.8)',
              padding: '14px 36px', textDecoration: 'none', borderRadius: 8,
            }}>
              Request Access
            </a>
          </div>

          {/* PRO names */}
          <div className="sl-fade" style={{ animationDelay: '1.2s',
            display: 'flex', gap: 28, flexWrap: 'wrap', justifyContent: 'center',
          }}>
            {['SOCAN', 'ASCAP', 'BMI', 'PRS', 'APRA', 'SESAC', 'GMR'].map(pro => (
              <span key={pro} style={{
                fontFamily: '"DM Mono", monospace',
                fontSize: 11, letterSpacing: '0.18em',
                color: 'rgba(212,209,202,0.3)', textTransform: 'uppercase',
              }}>{pro}</span>
            ))}
          </div>
        </section>

        {/* ══════════════════════════════════════════
            STATS — compressed, no explanation
        ══════════════════════════════════════════ */}
        <div className="sl-stats" style={{ maxWidth: 900, margin: '0 auto 0' }}>
          {[
            { n: '$2B+', l: 'Live royalties annually' },
            { n: '<30%', l: 'Ever reported'           },
            { n: '0',    l: 'Real-time datasets exist' },
          ].map(({ n, l }) => (
            <div key={n} className="sl-stat-cell">
              <div style={{
                fontFamily: '"Bebas Neue", sans-serif',
                fontSize: 'clamp(44px, 5.5vw, 72px)',
                color: '#C9A84C', lineHeight: 1,
                letterSpacing: '0.02em', marginBottom: 8,
              }}>{n}</div>
              <div style={{
                fontFamily: '"DM Mono", monospace',
                fontSize: 11, letterSpacing: '0.12em',
                color: 'rgba(212,209,202,0.45)',
                textTransform: 'uppercase',
              }}>{l}</div>
            </div>
          ))}
        </div>

        {/* ══════════════════════════════════════════
            PROBLEM — emotional, short
        ══════════════════════════════════════════ */}
        <section style={{
          padding: '120px 24px',
          maxWidth: 760, margin: '0 auto',
          textAlign: 'center',
        }}>
          <h2 style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: 'clamp(36px, 5vw, 72px)',
            lineHeight: 1.05, letterSpacing: '0.025em',
            color: '#FFFFFF', margin: '0 0 24px',
          }}>
            An artist just walked<br />off stage.
          </h2>
          <h2 style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: 'clamp(36px, 5vw, 72px)',
            lineHeight: 1.05, letterSpacing: '0.025em',
            color: '#C9A84C', margin: '0 0 56px',
          }}>
            They left money behind.
          </h2>
          <p style={{
            fontSize: 'clamp(16px, 2vw, 20px)', fontWeight: 300,
            color: 'rgba(212,209,202,0.6)', lineHeight: 1.8, margin: 0,
          }}>
            Not because they didn&apos;t earn it.<br />
            Because the system couldn&apos;t see it.
          </p>
        </section>

        {/* ══════════════════════════════════════════
            SYSTEM — one line
        ══════════════════════════════════════════ */}
        <section style={{
          padding: '0 24px 120px',
          maxWidth: 900, margin: '0 auto',
          textAlign: 'center',
        }}>
          {/* Flow line */}
          <div style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 0,
            marginBottom: 48,
          }}>
            {['Performance', 'Data', 'Payment'].map((word, i) => (
              <div key={word} style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{
                  fontFamily: '"Bebas Neue", sans-serif',
                  fontSize: 'clamp(28px, 4vw, 52px)',
                  letterSpacing: '0.04em',
                  color: i === 1 ? '#C9A84C' : '#FFFFFF',
                  padding: '0 20px',
                }}>{word}</span>
                {i < 2 && (
                  <span style={{
                    fontFamily: '"DM Mono", monospace',
                    fontSize: 20, color: 'rgba(201,168,76,0.4)',
                  }}>→</span>
                )}
              </div>
            ))}
          </div>

          <p style={{
            fontSize: 'clamp(15px, 1.8vw, 18px)', fontWeight: 300,
            color: 'rgba(212,209,202,0.5)', lineHeight: 1.8,
            maxWidth: 520, margin: '0 auto',
          }}>
            Every show. Every song. Every royalty.<br />
            Captured automatically. Routed correctly.<br />
            For the first time.
          </p>
        </section>

        {/* ══════════════════════════════════════════
            SEO — minimal, indexed, not displayed prominently
        ══════════════════════════════════════════ */}
        <section style={{ padding: '0 24px 80px', maxWidth: 680, margin: '0 auto' }}>
          <p style={{ fontSize: 13, fontWeight: 300, color: 'rgba(212,209,202,0.2)', lineHeight: 1.9, margin: 0, textAlign: 'center' }}>
            Working songwriters registered with SOCAN, ASCAP, BMI, PRS for Music,
            APRA AMCOS, SESAC, and GMR earn live performance royalties for every show.
            Setlistr is the infrastructure that connects live music performance to royalty payment —
            automatically capturing setlist data and routing it through the submission pipeline
            so no performance goes unaccounted for.
          </p>
        </section>

        {/* ══════════════════════════════════════════
            ACCESS
        ══════════════════════════════════════════ */}
        <section id="access" style={{
          padding: '100px 24px 140px',
          textAlign: 'center', position: 'relative',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: '50%',
            transform: 'translateX(-50%)',
            width: 1, height: 100,
            background: 'linear-gradient(to bottom, transparent, rgba(201,168,76,0.5))',
          }} />

          <h2 style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: 'clamp(52px, 8vw, 104px)',
            lineHeight: 0.9, letterSpacing: '0.025em',
            color: '#FFFFFF', margin: '0 0 8px',
          }}>
            Early Access.
          </h2>
          <h2 style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: 'clamp(52px, 8vw, 104px)',
            lineHeight: 0.9, letterSpacing: '0.025em',
            color: '#C9A84C', margin: '0 0 28px',
          }}>
            By Application Only.
          </h2>

          <p style={{
            fontSize: 16, fontWeight: 300,
            color: 'rgba(212,209,202,0.45)',
            maxWidth: 340, margin: '0 auto 52px', lineHeight: 1.7,
          }}>
            We review applications personally.
          </p>

          <WaitlistForm />

          <p style={{
            fontFamily: '"DM Mono", monospace',
            fontSize: 10, letterSpacing: '0.12em',
            color: '#3a3028', marginTop: 36,
          }}>
            Investor inquiries —{' '}
            <a href="mailto:info@setlistr.ai" style={{ color: 'rgba(201,168,76,0.4)', textDecoration: 'none' }}>
              info@setlistr.ai
            </a>
          </p>
        </section>

        {/* ── FOOTER ── */}
        <footer style={{
          borderTop: '1px solid rgba(255,255,255,0.05)',
          padding: '32px 48px',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', flexWrap: 'wrap', gap: 20,
        }}>
          <Image src="/logo-white.png" alt="Setlistr" width={80} height={22}
            style={{ objectFit: 'contain', opacity: 0.3 }} />
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
