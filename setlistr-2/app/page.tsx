import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import WaitlistForm from '@/components/WaitlistForm'

export const metadata: Metadata = {
  title: 'Setlistr — The Live Performance Record',
  description: 'The live performance record has never existed. Until now. Setlistr is the data infrastructure that connects every show, every song, and every royalty — automatically.',
  openGraph: {
    title: 'Setlistr — The Live Performance Record',
    description: 'The live performance record has never existed. Until now.',
    url: 'https://setlistr.ai',
    siteName: 'Setlistr',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Setlistr — The Live Performance Record',
    description: 'The live performance record has never existed. Until now.',
  },
  alternates: { canonical: 'https://setlistr.ai' },
  keywords: [
    'live performance royalties', 'setlist submission', 'SOCAN submission',
    'ASCAP live performance', 'BMI setlist', 'PRS royalties', 'APRA performance',
    'SESAC live', 'GMR royalties', 'unclaimed music royalties',
    'how to submit setlist to PRO', 'live music royalty tracking',
    'performance rights submission', 'songwriter live royalties',
    'live performance data infrastructure',
  ],
}

export default function HomePage() {
  return (
    <div style={{
      minHeight: '100svh',
      background: '#0a0908',
      overflowX: 'hidden',
      fontFamily: 'var(--font-sans)',
    }}>

      {/* ── Grain overlay ── */}
      <div aria-hidden className="sl-grain" />

      {/* ── Breathing glow ── */}
      <div aria-hidden className="sl-glow" />

      {/* ════════════════════════════════════════
          NAV
      ════════════════════════════════════════ */}
      <header className="sl-nav">
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Image
            src="/logo-white.png"
            alt="Setlistr"
            width={120}
            height={32}
            priority
            style={{ objectFit: 'contain', opacity: 0.92 }}
          />
        </Link>

        <nav className="sl-nav__links">
          <Link href="/get-paid" className="sl-nav__link">For Artists</Link>
          <a href="mailto:info@setlistr.ai" className="sl-nav__link">For Publishers</a>
          <a href="#access" className="sl-nav__apply">Apply</a>
        </nav>
      </header>

      {/* ════════════════════════════════════════
          HERO
      ════════════════════════════════════════ */}
      <section className="sl-hero">

        {/* Eyebrow */}
        <div className="sl-hero__eyebrow sl-blur-in" style={{ animationDelay: '0.1s' }}>
          <div className="sl-eyebrow__line" />
          <span className="sl-eyebrow__text">Live Performance Infrastructure</span>
          <div className="sl-eyebrow__line" />
        </div>

        {/* Headline */}
        <h1 className="sl-hero__headline sl-blur-in" style={{ animationDelay: '0.4s' }}>
          The live performance<br />
          record has never<br />
          <em>existed.</em>
        </h1>

        {/* Until now */}
        <p className="sl-hero__until sl-blur-in" style={{ animationDelay: '0.9s' }}>
          Until now.
        </p>

        {/* CTA */}
        <div className="sl-blur-in" style={{ animationDelay: '1.3s' }}>
          <a href="#access" className="sl-hero__cta">
            Apply for early access
          </a>
        </div>

        {/* PRO strip — legible */}
        <div className="sl-hero__pros sl-blur-in" style={{ animationDelay: '1.6s' }}>
          {['SOCAN', 'ASCAP', 'BMI', 'PRS', 'APRA', 'SESAC', 'GMR'].map(pro => (
            <span key={pro} className="sl-pro">{pro}</span>
          ))}
        </div>

        {/* Scroll indicator */}
        <div className="sl-hero__scroll sl-blur-in" style={{ animationDelay: '2s' }}>
          <div className="sl-scroll__line" />
        </div>
      </section>

      {/* ════════════════════════════════════════
          THE NUMBERS
      ════════════════════════════════════════ */}
      <section className="sl-numbers">
        {[
          {
            stat: '$2B+',
            label: 'In uncollected live royalties annually',
            body: 'Every licensed venue in the world pays into a pool. Most of it never reaches the artist. The data to distribute it has never existed.',
          },
          {
            stat: '<30%',
            label: 'Of live shows ever submitted to a PRO',
            body: 'SOCAN, ASCAP, BMI, PRS, APRA, SESAC, GMR — across every major performing rights organization, the vast majority of live performances generate no claim.',
          },
          {
            stat: '0',
            label: 'Verified real-time live performance databases',
            body: 'No PRO has it. No label has it. No streaming platform has it. The ground-truth record of what is performed live, by whom, where — has never been built.',
          },
        ].map(({ stat, label, body }) => (
          <div key={stat} className="sl-number__cell">
            <p className="sl-number__stat">{stat}</p>
            <p className="sl-number__label">{label}</p>
            <p className="sl-number__body">{body}</p>
          </div>
        ))}
      </section>

      {/* ════════════════════════════════════════
          THE STATEMENT
      ════════════════════════════════════════ */}
      <section className="sl-statement">
        <p className="sl-statement__mono">The Problem</p>
        <blockquote className="sl-statement__text">
          PROs are holding billions in royalties they cannot distribute.
          Publishers have thousands of writers on stage every night with
          zero visibility into what is being performed. The setlist has
          never been infrastructure.
        </blockquote>
        <p className="sl-statement__text sl-statement__text--gold">
          Setlistr is building the layer that makes all of it visible.
        </p>
      </section>

      {/* ════════════════════════════════════════
          THE EVOLUTION — 5 STAGES
      ════════════════════════════════════════ */}
      <section className="sl-stages">
        <p className="sl-stages__label">The Roadmap</p>
        <div className="sl-stages__grid">
          {[
            { n: '01', name: 'Tool',           now: true,  desc: 'Artists capture shows in real time. Submit to every PRO in minutes. Royalties enter the pipeline.' },
            { n: '02', name: 'Habit',          now: false, desc: 'The pre-show ritual. The post-show record. A career archive that compounds with every performance.' },
            { n: '03', name: 'Network',        now: false, desc: 'Publishers, co-writers, fans — all connected to the verified live record in real time.' },
            { n: '04', name: 'Intelligence',   now: false, desc: 'The system surfaces shows never submitted. Royalties the artist never knew existed.' },
            { n: '05', name: 'Infrastructure', now: false, desc: 'The canonical live performance layer. Licensed globally to labels, DSPs, PROs, and analytics platforms.' },
          ].map(({ n, name, now, desc }) => (
            <div key={n} className={now ? 'sl-stage sl-stage--now' : 'sl-stage'}>
              <div className="sl-stage__top">
                <span className="sl-stage__n">{n}</span>
                {now && <span className="sl-stage__badge">Now</span>}
              </div>
              <p className="sl-stage__name">{name}</p>
              <p className="sl-stage__desc">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════
          SEO BODY — Why Now
      ════════════════════════════════════════ */}
      <section className="sl-why">
        <p className="sl-why__mono">Why Now</p>
        <h2 className="sl-why__headline">
          The window is open.<br />
          <em>It will not stay open.</em>
        </h2>
        <div className="sl-why__body">
          <p>
            The problem of <strong>unclaimed live performance royalties</strong> has existed for
            decades. What is different now is that the technology to solve it has matured
            simultaneously with the industry&apos;s openness to third-party digital submission
            workflows. Real-time audio recognition is accurate enough to identify songs as they
            are performed. Mobile-first behavior makes passive background capture possible.
            PRO submission APIs exist — and in some cases are entirely unoccupied, including
            the SOCAN NLMP API abandoned since 2020.
          </p>
          <p>
            Every songwriter registered with <strong>SOCAN, ASCAP, BMI, PRS for Music,
            APRA AMCOS, SESAC, or GMR</strong> is owed performance royalties for every live
            performance of their registered songs. The <strong>setlist submission</strong> process
            required to collect those royalties is the only barrier between the artist and
            money they have already earned. Most never submit. Most publishers never follow
            up. Most PROs never know the show happened.
          </p>
          <p>
            The first platform to capture live performance data at scale owns it permanently.
            Historical performance records cannot be recreated retroactively.{' '}
            <strong>This is the race — and Setlistr is already moving.</strong>
          </p>
        </div>
      </section>

      {/* ════════════════════════════════════════
          THE MOAT QUOTE
      ════════════════════════════════════════ */}
      <section className="sl-moat">
        <div className="sl-moat__inner">
          <blockquote className="sl-moat__quote">
            &ldquo;Anyone can build a submission tool. No one can recreate a global dataset
            of verified live performance history once it has been captured.&rdquo;
          </blockquote>
          <p className="sl-moat__attribution">Setlistr Strategic Blueprint · 2026</p>
        </div>
      </section>

      {/* ════════════════════════════════════════
          WAITLIST / ACCESS
      ════════════════════════════════════════ */}
      <section id="access" className="sl-access">

        {/* Pin line from above */}
        <div className="sl-access__pin" />

        <div className="sl-access__inner">
          <Image
            src="/logo-white.png"
            alt="Setlistr"
            width={100}
            height={26}
            style={{ objectFit: 'contain', opacity: 0.5, marginBottom: 36 }}
          />

          <h2 className="sl-access__headline">
            Early access.<br />
            <em>By application only.</em>
          </h2>

          <p className="sl-access__sub">
            We are onboarding a limited number of artists and industry partners.
            Applications are reviewed personally.
          </p>

          <WaitlistForm />

          <p className="sl-access__investor">
            Investor inquiries —{' '}
            <a href="mailto:info@setlistr.ai" className="sl-access__investor-link">
              info@setlistr.ai
            </a>
          </p>
        </div>
      </section>

      {/* ════════════════════════════════════════
          FOOTER
      ════════════════════════════════════════ */}
      <footer className="sl-footer">
        <Image
          src="/logo-white.png"
          alt="Setlistr"
          width={80}
          height={22}
          style={{ objectFit: 'contain', opacity: 0.35 }}
        />

        <nav className="sl-footer__links">
          {[
            { label: 'For Artists',  href: '/get-paid' },
            { label: 'How It Works', href: '/start' },
            { label: 'Contact',      href: 'mailto:info@setlistr.ai' },
            { label: 'Privacy',      href: '/privacy' },
            { label: 'Terms',        href: '/terms' },
          ].map(({ label, href }) =>
            href.startsWith('mailto') ? (
              <a key={label} href={href} className="sl-footer__link">{label}</a>
            ) : (
              <Link key={label} href={href} className="sl-footer__link">{label}</Link>
            )
          )}
        </nav>

        <p className="sl-footer__copy">
          © {new Date().getFullYear()} Setlistr Inc.
        </p>
      </footer>

      {/* ════════════════════════════════════════
          STYLES
      ════════════════════════════════════════ */}
      <style>{`

        /* ── Grain ── */
        .sl-grain {
          position: fixed; inset: 0; z-index: 999;
          pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E");
          opacity: 0.35;
        }

        /* ── Breathing glow ── */
        .sl-glow {
          position: fixed;
          top: -20vh; left: 50%;
          transform: translateX(-50%);
          width: 120vw; height: 80vh;
          background: radial-gradient(ellipse at 50% 0%,
            rgba(201,168,76,0.09) 0%,
            rgba(201,168,76,0.03) 40%,
            transparent 70%
          );
          pointer-events: none; z-index: 0;
          animation: breathe 6s ease-in-out infinite;
        }

        @keyframes breathe {
          0%, 100% { opacity: 0.7; transform: translateX(-50%) scaleX(1); }
          50%       { opacity: 1;   transform: translateX(-50%) scaleX(1.08); }
        }

        /* ── Blur-in animation ── */
        .sl-blur-in {
          opacity: 0;
          animation: blurIn 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes blurIn {
          from { opacity: 0; filter: blur(12px); transform: translateY(10px); }
          to   { opacity: 1; filter: blur(0px);  transform: translateY(0); }
        }

        /* ── Nav ── */
        .sl-nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          height: 64px;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 40px;
          background: rgba(10,9,8,0.85);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .sl-nav__links {
          display: flex; align-items: center; gap: 36px;
        }
        .sl-nav__link {
          font-family: var(--font-mono);
          font-size: 10px; letter-spacing: 0.16em;
          color: rgba(160,152,128,0.55);
          text-decoration: none; text-transform: uppercase;
          transition: color 0.25s ease;
        }
        .sl-nav__link:hover { color: #f0ece3; }
        .sl-nav__apply {
          font-family: var(--font-mono);
          font-size: 10px; letter-spacing: 0.18em;
          color: #0a0908; background: #c9a84c;
          padding: 8px 18px; text-decoration: none;
          text-transform: uppercase;
          transition: opacity 0.2s ease;
        }
        .sl-nav__apply:hover { opacity: 0.82; }

        /* ── Hero ── */
        .sl-hero {
          position: relative; z-index: 1;
          min-height: 100svh;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          text-align: center;
          padding: 100px 24px 80px;
        }

        .sl-hero__eyebrow {
          display: flex; align-items: center; gap: 14px;
          margin-bottom: 52px;
        }
        .sl-eyebrow__line {
          width: 32px; height: 1px;
          background: rgba(201,168,76,0.35);
        }
        .sl-eyebrow__text {
          font-family: var(--font-mono);
          font-size: 10px; letter-spacing: 0.28em;
          color: rgba(201,168,76,0.6);
          text-transform: uppercase;
        }

        .sl-hero__headline {
          font-family: var(--font-display);
          font-weight: 400; font-style: normal;
          font-size: clamp(52px, 9.5vw, 120px);
          line-height: 0.96;
          letter-spacing: -0.028em;
          color: #f0ece3;
          margin: 0 0 0;
          max-width: 880px;
        }
        .sl-hero__headline em {
          font-style: italic;
          color: #c9a84c;
        }

        .sl-hero__until {
          font-family: var(--font-display);
          font-style: italic;
          font-size: clamp(52px, 9.5vw, 120px);
          line-height: 0.96;
          letter-spacing: -0.028em;
          color: rgba(240,236,227,0.22);
          margin: 0 0 60px;
        }

        .sl-hero__cta {
          display: inline-block;
          font-family: var(--font-mono);
          font-size: 11px; letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #0a0908; background: #c9a84c;
          padding: 16px 36px;
          text-decoration: none;
          transition: opacity 0.2s ease;
          margin-bottom: 60px;
        }
        .sl-hero__cta:hover { opacity: 0.84; }

        /* PROs — legible */
        .sl-hero__pros {
          display: flex; gap: 20px; align-items: center;
          flex-wrap: wrap; justify-content: center;
          margin-bottom: 56px;
        }
        .sl-pro {
          font-family: var(--font-mono);
          font-size: 10px; letter-spacing: 0.2em;
          color: rgba(160,152,128,0.5);
          text-transform: uppercase;
        }

        /* Scroll indicator */
        .sl-hero__scroll {
          position: absolute; bottom: 32px;
          left: 50%; transform: translateX(-50%);
        }
        .sl-scroll__line {
          width: 1px; height: 40px;
          background: linear-gradient(to bottom, transparent, rgba(201,168,76,0.4));
          animation: scrollPulse 2s ease-in-out infinite;
        }
        @keyframes scrollPulse {
          0%, 100% { opacity: 0.4; transform: scaleY(1); }
          50%       { opacity: 1;   transform: scaleY(1.15); }
        }

        /* ── Numbers ── */
        .sl-numbers {
          position: relative; z-index: 1;
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 1px;
          background: rgba(255,255,255,0.05);
          border-top: 1px solid rgba(255,255,255,0.05);
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .sl-number__cell {
          background: #0a0908;
          padding: 60px 44px;
          transition: background 0.3s ease;
        }
        .sl-number__cell:hover { background: #0d0c0a; }
        .sl-number__stat {
          font-family: var(--font-display);
          font-size: clamp(56px, 7vw, 88px);
          font-weight: 400; font-style: normal;
          color: #c9a84c;
          margin: 0 0 16px; line-height: 1;
          letter-spacing: -0.03em;
        }
        .sl-number__label {
          font-family: var(--font-sans);
          font-size: 14px; font-weight: 500;
          color: #f0ece3;
          margin: 0 0 14px; line-height: 1.3;
        }
        .sl-number__body {
          font-family: var(--font-sans);
          font-size: 13px; font-weight: 300;
          color: #5a5448; line-height: 1.7; margin: 0;
        }

        /* ── Statement ── */
        .sl-statement {
          position: relative; z-index: 1;
          padding: 120px 40px;
          max-width: 860px; margin: 0 auto;
        }
        .sl-statement__mono {
          font-family: var(--font-mono);
          font-size: 10px; letter-spacing: 0.28em;
          color: rgba(201,168,76,0.45);
          text-transform: uppercase;
          margin: 0 0 32px;
        }
        .sl-statement__text {
          font-family: var(--font-display);
          font-weight: 400;
          font-size: clamp(24px, 3.5vw, 42px);
          line-height: 1.3; color: rgba(160,152,128,0.7);
          margin: 0 0 20px;
        }
        .sl-statement__text--gold { color: #f0ece3; }

        /* ── Stages ── */
        .sl-stages {
          position: relative; z-index: 1;
          padding: 0 40px 100px;
          max-width: 1120px; margin: 0 auto;
        }
        .sl-stages__label {
          font-family: var(--font-mono);
          font-size: 10px; letter-spacing: 0.28em;
          color: rgba(201,168,76,0.45);
          text-transform: uppercase;
          margin: 0 0 28px;
        }
        .sl-stages__grid {
          display: grid; grid-template-columns: repeat(5, 1fr);
          gap: 1px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.05);
        }
        .sl-stage {
          background: #0a0908;
          padding: 32px 24px;
          border-top: 2px solid transparent;
        }
        .sl-stage--now {
          background: #0d0c0a;
          border-top-color: #c9a84c;
        }
        .sl-stage__top {
          display: flex; align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
        }
        .sl-stage__n {
          font-family: var(--font-mono);
          font-size: 10px; letter-spacing: 0.2em;
          color: #3a3028;
        }
        .sl-stage--now .sl-stage__n { color: #c9a84c; }
        .sl-stage__badge {
          font-family: var(--font-mono);
          font-size: 8px; letter-spacing: 0.14em;
          color: #c9a84c;
          border: 1px solid rgba(201,168,76,0.3);
          padding: 2px 6px; text-transform: uppercase;
        }
        .sl-stage__name {
          font-family: var(--font-display);
          font-size: 20px; font-weight: 400;
          color: #3a3028; margin: 0 0 10px;
        }
        .sl-stage--now .sl-stage__name { color: #f0ece3; }
        .sl-stage__desc {
          font-family: var(--font-sans);
          font-size: 12px; font-weight: 300;
          color: #3a3028; line-height: 1.65; margin: 0;
        }
        .sl-stage--now .sl-stage__desc { color: #6a5f50; }

        /* ── Why Now ── */
        .sl-why {
          position: relative; z-index: 1;
          padding: 100px 40px;
          max-width: 780px; margin: 0 auto;
        }
        .sl-why__mono {
          font-family: var(--font-mono);
          font-size: 10px; letter-spacing: 0.28em;
          color: rgba(201,168,76,0.45);
          text-transform: uppercase;
          margin: 0 0 32px;
        }
        .sl-why__headline {
          font-family: var(--font-display);
          font-weight: 400;
          font-size: clamp(28px, 4vw, 48px);
          color: #f0ece3; margin: 0 0 40px; line-height: 1.15;
        }
        .sl-why__headline em {
          font-style: italic; color: #c9a84c;
        }
        .sl-why__body {
          display: flex; flex-direction: column; gap: 20px;
        }
        .sl-why__body p {
          font-family: var(--font-sans);
          font-size: 15px; font-weight: 300;
          color: #6a5f50; line-height: 1.85; margin: 0;
        }
        .sl-why__body strong { color: #a09070; font-weight: 400; }

        /* ── Moat quote ── */
        .sl-moat {
          position: relative; z-index: 1;
          padding: 0 40px 100px;
          max-width: 1120px; margin: 0 auto;
        }
        .sl-moat__inner {
          border-left: 2px solid #c9a84c;
          padding: 36px 48px;
          background: rgba(201,168,76,0.03);
        }
        .sl-moat__quote {
          font-family: var(--font-display);
          font-style: italic; font-weight: 400;
          font-size: clamp(18px, 2.5vw, 26px);
          color: rgba(240,236,227,0.7);
          line-height: 1.5; margin: 0 0 20px;
        }
        .sl-moat__attribution {
          font-family: var(--font-mono);
          font-size: 10px; letter-spacing: 0.18em;
          color: rgba(201,168,76,0.4);
          text-transform: uppercase; margin: 0;
        }

        /* ── Access / Waitlist ── */
        .sl-access {
          position: relative; z-index: 1;
          padding: 120px 24px 140px;
          text-align: center;
        }
        .sl-access__pin {
          position: absolute; top: 0; left: 50%;
          transform: translateX(-50%);
          width: 1px; height: 80px;
          background: linear-gradient(to bottom,
            transparent,
            rgba(201,168,76,0.4)
          );
        }
        .sl-access__inner {
          display: flex; flex-direction: column;
          align-items: center; max-width: 420px; margin: 0 auto;
        }
        .sl-access__headline {
          font-family: var(--font-display);
          font-weight: 400;
          font-size: clamp(38px, 6vw, 72px);
          color: #f0ece3; line-height: 1.05;
          margin: 0 0 20px;
        }
        .sl-access__headline em {
          font-style: italic; color: #c9a84c;
        }
        .sl-access__sub {
          font-family: var(--font-sans);
          font-size: 14px; font-weight: 300;
          color: #5a5448; line-height: 1.7;
          margin: 0 0 48px; max-width: 340px;
        }
        .sl-access__investor {
          font-family: var(--font-mono);
          font-size: 10px; letter-spacing: 0.12em;
          color: #3a3028; margin: 32px 0 0;
        }
        .sl-access__investor-link {
          color: rgba(201,168,76,0.45);
          text-decoration: none;
        }
        .sl-access__investor-link:hover {
          color: rgba(201,168,76,0.7);
        }

        /* ── Footer ── */
        .sl-footer {
          position: relative; z-index: 1;
          border-top: 1px solid rgba(255,255,255,0.05);
          padding: 36px 40px;
          display: flex; align-items: center;
          justify-content: space-between;
          flex-wrap: wrap; gap: 20px;
        }
        .sl-footer__links {
          display: flex; gap: 28px;
          flex-wrap: wrap; align-items: center;
        }
        .sl-footer__link {
          font-family: var(--font-mono);
          font-size: 9px; letter-spacing: 0.14em;
          color: #3a3028; text-decoration: none;
          text-transform: uppercase;
          transition: color 0.2s ease;
        }
        .sl-footer__link:hover { color: #6a5f50; }
        .sl-footer__copy {
          font-family: var(--font-mono);
          font-size: 9px; letter-spacing: 0.1em;
          color: #2a2520; margin: 0;
        }

        /* ── Responsive ── */
        @media (max-width: 900px) {
          .sl-numbers { grid-template-columns: 1fr !important; }
          .sl-stages__grid { grid-template-columns: 1fr 1fr !important; }
          .sl-moat__inner { padding: 28px 32px; }
        }
        @media (max-width: 600px) {
          .sl-nav { padding: 0 20px; }
          .sl-nav__link { display: none; }
          .sl-stages__grid { grid-template-columns: 1fr !important; }
          .sl-statement,
          .sl-why,
          .sl-moat,
          .sl-stages { padding-left: 24px !important; padding-right: 24px !important; }
          .sl-footer { padding: 28px 24px; flex-direction: column; align-items: flex-start; }
        }

      `}</style>
    </div>
  )
}
