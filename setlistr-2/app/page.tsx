import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import WaitlistForm from '@/components/WaitlistForm'
import ProductTour from '@/components/ProductTour'

export const metadata: Metadata = {
  title: 'Setlistr — The System of Record for Live Music',
  description: 'Live performance is the largest blind spot in music. Every show. Every song. Every royalty. Finally accounted for.',
  openGraph: {
    title: 'Setlistr — The System of Record for Live Music',
    description: 'Live performance is the largest blind spot in music.',
    url: 'https://setlistr.ai',
    siteName: 'Setlistr',
    type: 'website',
    images: [{ url: '/og-image.jpg', width: 1200, height: 630, alt: 'Setlistr — The System of Record for Live Music' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Setlistr — The System of Record for Live Music',
    description: 'Live performance is the largest blind spot in music.',
  },
  alternates: { canonical: '/' },
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
    }}>
      <style>{`
        .sl-orb { position: fixed; pointer-events: none; z-index: 0; border-radius: 50%; filter: blur(120px); }

        .sl-nav-link {
          font-family: "DM Mono", monospace; font-size: 11px; letter-spacing: .14em;
          text-transform: uppercase; color: rgba(232,228,219,0.78);
          text-decoration: none; transition: color .2s;
        }
        .sl-nav-link:hover { color: #C9A84C; }
        .sl-btn-signin {
          font-family: "DM Mono", monospace; font-size: 11px; letter-spacing: .14em;
          text-transform: uppercase; color: #C9A84C; text-decoration: none;
          padding: 9px 18px; border-radius: 6px; border: 1px solid rgba(201,168,76,0.55);
          transition: all .2s; white-space: nowrap;
        }
        .sl-btn-signin:hover { background: rgba(201,168,76,0.12); border-color: #C9A84C; }
        .sl-btn-apply {
          font-family: "DM Mono", monospace; font-size: 11px; letter-spacing: .14em;
          text-transform: uppercase; background: #C9A84C; color: #080706;
          text-decoration: none; padding: 10px 20px; border-radius: 6px; transition: opacity .2s;
        }
        .sl-btn-apply:hover { opacity: .85; }

        .sl-hero-h1 { font-family: "Bebas Neue", sans-serif; font-size: clamp(56px,10vw,140px); line-height: .9; letter-spacing: .02em; margin: 0; }
        .sl-ghost   { font-family: "Bebas Neue", sans-serif; font-size: clamp(34px,6vw,80px); line-height: 1; color: #C9A84C; margin-top: 4px; }

        .sl-scroll-hint { margin-top: 36px; font-family: "DM Mono", monospace; font-size: 10px; letter-spacing: .2em; text-transform: uppercase; color: rgba(201,168,76,0.75); display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .sl-scroll-arrow { width: 1px; height: 34px; background: linear-gradient(to bottom, rgba(201,168,76,0.6), transparent); animation: sl-drop 2s infinite; }
        @keyframes sl-drop { 0%{opacity:0;transform:translateY(-6px)} 40%{opacity:1} 100%{opacity:0;transform:translateY(10px)} }

        .sl-stats { display: flex; max-width: 900px; margin: 40px auto 0; border-top: 1px solid rgba(255,255,255,0.06); border-bottom: 1px solid rgba(255,255,255,0.06); }
        .sl-stat { flex: 1; padding: 32px 0; text-align: center; border-right: 1px solid rgba(255,255,255,0.06); }
        .sl-stat:last-child { border-right: none; }

        @media (max-width: 820px) {
          .sl-nav-link { display: none !important; }
          .sl-mobile-links { display: flex !important; }
          .sl-stats { flex-direction: column; }
          .sl-stat { border-right: none; border-bottom: 1px solid rgba(255,255,255,0.06); }
          .sl-stat:last-child { border-bottom: none; }
          .sl-logo { height: 26px !important; }
          .sl-nav { height: 60px !important; padding: 0 18px !important; }
          .sl-btn-signin { padding: 8px 12px !important; font-size: 10px !important; }
          .sl-btn-apply { padding: 9px 14px !important; font-size: 10px !important; }
        }
        .sl-mobile-links { display: none; }

        input::placeholder { color: #3a3028 !important; }
      `}</style>

      <div className="sl-orb" style={{ width: 620, height: 620, background: 'radial-gradient(circle, rgba(201,168,76,1), transparent)', opacity: 0.10, top: -260, right: -180 }} />
      <div className="sl-orb" style={{ width: 460, height: 460, background: 'radial-gradient(circle, rgba(201,168,76,1), transparent)', opacity: 0.07, bottom: '10%', left: -160 }} />

      {/* ── NAV ── */}
      <header className="sl-nav" style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 40px',
        background: 'rgba(8,7,6,0.82)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'flex' }}>
          <Image className="sl-logo" src="/logo-white-tight.png" alt="Setlistr" width={190} height={36} priority style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
        </Link>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/get-paid" className="sl-nav-link" style={{ marginRight: 8 }}>For Artists</Link>
          <Link href="/how-it-works" className="sl-nav-link" style={{ marginRight: 8 }}>How It Works</Link>
          <Link href="/auth/login" className="sl-btn-signin">Sign In</Link>
          <a href="#access" className="sl-btn-apply">Request Access</a>
        </nav>
      </header>

      {/* ── MOBILE LINK BAR (below nav, keeps For Artists / How It Works reachable) ── */}
      <div className="sl-mobile-links" style={{
        position: 'fixed', top: 60, left: 0, right: 0, zIndex: 99,
        alignItems: 'center', justifyContent: 'center', gap: 28,
        height: 42, padding: '0 18px',
        background: 'rgba(8,7,6,0.82)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <Link href="/get-paid" style={{ fontFamily: '"DM Mono", monospace', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(232,228,219,0.8)', textDecoration: 'none' }}>For Artists</Link>
        <Link href="/how-it-works" style={{ fontFamily: '"DM Mono", monospace', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(232,228,219,0.8)', textDecoration: 'none' }}>How It Works · FAQ</Link>
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ══ HERO 1: statement ══ */}
        <section style={{
          minHeight: '78vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', padding: '128px 24px 0',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            border: '1px solid rgba(201,168,76,.3)', borderRadius: 20,
            padding: '6px 18px', marginBottom: 34,
            fontFamily: '"DM Mono", monospace', fontSize: 11, color: '#C9A84C',
            letterSpacing: '.16em', textTransform: 'uppercase',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#C9A84C' }} />
            Verified Performance Intelligence
          </div>
          <h1 className="sl-hero-h1">
            The Live<br />Performance Record<br />Has Never{' '}
            <span style={{ color: '#C9A84C' }}>Existed.</span>
          </h1>
          <div className="sl-ghost">Until Now.</div>
          <div className="sl-scroll-hint"><span className="sl-scroll-arrow" />See it live</div>
        </section>

        {/* ══ HERO 2 + PROBLEM + PRODUCT TOUR (client: animation + scroll reveal) ══ */}
        <ProductTour />

        {/* ══ SEO paragraph ══ */}
        <section style={{ padding: '0 24px 80px', maxWidth: 680, margin: '0 auto' }}>
          <p style={{ fontSize: 13, fontWeight: 300, color: 'rgba(212,209,202,0.45)', lineHeight: 1.9, margin: 0, textAlign: 'center' }}>
            Working songwriters registered with SOCAN, ASCAP, BMI, PRS for Music,
            APRA AMCOS, SESAC, and GMR earn live performance royalties for every show.
            Setlistr is the infrastructure that connects live music performance to royalty payment —
            automatically capturing setlist data and routing it through the submission pipeline
            so no performance goes unaccounted for.
          </p>
        </section>

        {/* ══ ACCESS ══ */}
        <section id="access" style={{ padding: '90px 24px 140px', textAlign: 'center', position: 'relative' }}>
          <div style={{
            position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
            width: 1, height: 100, background: 'linear-gradient(to bottom, transparent, rgba(201,168,76,0.5))',
          }} />
          <h2 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 'clamp(48px,8vw,96px)', lineHeight: 0.9, letterSpacing: '0.02em', color: '#FFFFFF', margin: '0 0 8px' }}>
            Invite Only.
          </h2>
          <h2 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 'clamp(48px,8vw,96px)', lineHeight: 0.9, letterSpacing: '0.02em', color: '#C9A84C', margin: '0 0 28px' }}>
            Request Access.
          </h2>
          <p style={{ fontSize: 16, fontWeight: 300, color: 'rgba(212,209,202,0.45)', maxWidth: 340, margin: '0 auto 52px', lineHeight: 1.7 }}>
            We onboard artists directly.
          </p>
          <WaitlistForm />
          <p style={{ fontFamily: '"DM Mono", monospace', fontSize: 10, letterSpacing: '0.12em', color: 'rgba(212,209,202,0.4)', marginTop: 36 }}>
            Investor inquiries —{' '}
            <a href="mailto:info@setlistr.ai" style={{ color: 'rgba(201,168,76,0.75)', textDecoration: 'none' }}>info@setlistr.ai</a>
          </p>
        </section>

        {/* ── FOOTER ── */}
        <footer style={{
          borderTop: '1px solid rgba(255,255,255,0.05)', padding: '32px 40px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20,
        }}>
          <Image src="/logo-white-tight.png" alt="Setlistr" width={106} height={20} style={{ height: 20, width: 'auto', objectFit: 'contain', opacity: 0.55 }} />
          <nav style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[
              { label: 'For Artists',  href: '/get-paid' },
              { label: 'How It Works', href: '/how-it-works' },
              { label: 'Contact',      href: 'mailto:info@setlistr.ai' },
              { label: 'Privacy',      href: '/privacy' },
              { label: 'Terms',        href: '/terms' },
            ].map(({ label, href }) =>
              href.startsWith('mailto') ? (
                <a key={label} href={href} className="sl-nav-link">{label}</a>
              ) : (
                <Link key={label} href={href} className="sl-nav-link">{label}</Link>
              )
            )}
          </nav>
          <p style={{ fontFamily: '"DM Mono", monospace', fontSize: 10, letterSpacing: '0.1em', color: 'rgba(212,209,202,0.4)', margin: 0 }}>
            © {new Date().getFullYear()} Setlistr Inc.
          </p>
        </footer>
      </div>
    </div>
  )
}
