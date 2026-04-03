'use client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

const C = {
  bg: '#0a0908', card: '#141210', border: 'rgba(255,255,255,0.07)',
  borderGold: 'rgba(201,168,76,0.25)', text: '#f0ece3', secondary: '#b8a888',
  muted: '#8a7a68', gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.08)',
  green: '#4ade80', red: '#f87171',
}

const ARTICLES = [
  {
    tag: 'Start Here', tagColor: C.gold,
    href: '/get-paid-for-live-shows',
    title: "Most artists never get paid for live shows. Here's how to fix that.",
    desc: "Where the money comes from, how much you're owed by venue size, and the exact steps to claim it from ASCAP, BMI, SOCAN, PRS and more.",
    stat: '$512M distributed by SOCAN alone in 2024',
  },
  {
    tag: 'Eye-opener', tagColor: C.red,
    href: '/unclaimed-music-royalties',
    title: "Millions in unclaimed live royalties — your money is going to someone else.",
    desc: "When you don't submit your setlist, the money doesn't disappear. It gets redistributed to artists who did submit.",
    stat: 'Billions go unclaimed globally every year',
  },
  {
    tag: 'Step-by-Step', tagColor: C.green,
    href: '/submit-setlists-pro',
    title: "How to submit your setlists to ASCAP, BMI & SOCAN — every step.",
    desc: "A complete walkthrough of every major PRO's live performance submission portal with exact navigation paths.",
    stat: 'Takes under 10 minutes per show',
  },
  {
    tag: 'Plain English', tagColor: C.secondary,
    href: '/what-is-live-performance-royalty',
    title: "What is a live performance royalty? A simple explanation.",
    desc: "How live royalties work, who pays them, and why most performing songwriters are missing out entirely.",
    stat: 'Shareable — send to any artist friend',
  },
]

export default function GetPaidPage() {
  const router = useRouter()

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>

      {/* Background */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% -10%, rgba(201,168,76,0.12) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(201,168,76,0.04) 0%, transparent 50%)' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.03, backgroundImage: 'linear-gradient(rgba(201,168,76,1) 1px, transparent 1px), linear-gradient(90deg, rgba(201,168,76,1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

      {/* ── Nav ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(10,9,8,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <Image src="/logo-white.png" alt="Setlistr" width={130} height={34} priority style={{ objectFit: 'contain' }} />
          </Link>
          <Link href="/app/show/new" style={{ textDecoration: 'none', fontSize: 13, fontWeight: 700, color: '#0a0908', background: C.gold, borderRadius: 8, padding: '8px 16px' }}>
            Start Free →
          </Link>
        </div>
      </header>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 480, margin: '0 auto', padding: '0 20px 80px' }}>

        {/* ── Hero ── */}
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 72, paddingBottom: 56, overflow: 'hidden' }}>
          {/* Watermark */}
          <div style={{ position: 'absolute', top: 40, left: '50%', transform: 'translateX(-50%)', opacity: 0.035, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
            <Image src="/logo-white.png" alt="" width={400} height={105} style={{ objectFit: 'contain' }} />
          </div>

          {/* ── FIX: headline space bug — using a space between words ── */}
          <h1 style={{ fontSize: 'clamp(36px, 10vw, 52px)', fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.04em', lineHeight: 1.05, position: 'relative' }}>
            You played that song live.
          </h1>
          <h2 style={{ fontSize: 'clamp(36px, 10vw, 52px)', fontWeight: 800, color: C.gold, margin: '0 0 20px', letterSpacing: '-0.04em', lineHeight: 1.05, position: 'relative' }}>
            Did you get paid?
          </h2>

          <p style={{ fontSize: 16, color: '#a09070', lineHeight: 1.6, margin: '0 0 36px', maxWidth: 300 }}>
            Most live performances never get reported to PROs. Songwriters leave real money behind — every single show.
          </p>

          <button onClick={() => router.push('/app/show/new')}
            style={{ width: '100%', padding: '18px 24px', background: C.gold, border: 'none', borderRadius: 14, color: '#0a0908', fontSize: 15, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 12 }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>
            See what you might be owed →
          </button>
          <p style={{ fontSize: 12, color: 'rgba(106,96,80,0.8)', margin: '0 0 40px', letterSpacing: '0.04em' }}>
            No account needed · Takes 30 seconds
          </p>

          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' as const, justifyContent: 'center' }}>
            {['SOCAN', 'ASCAP', 'BMI', 'PRS', 'APRA'].map(pro => (
              <span key={pro} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: 'rgba(160,144,112,0.4)', textTransform: 'uppercase' as const }}>{pro}</span>
            ))}
          </div>
        </div>

        {/* ── Divider ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
          <div style={{ flex: 1, height: 1, background: C.border }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.14em', textTransform: 'uppercase' as const, whiteSpace: 'nowrap' }}>The full guide</span>
          <div style={{ flex: 1, height: 1, background: C.border }} />
        </div>

        {/* ── Article cluster ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ARTICLES.map(({ tag, tagColor, href, title, desc, stat }) => (
            <Link key={href} href={href} style={{ textDecoration: 'none' }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px', cursor: 'pointer', transition: 'border-color 0.15s ease' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = C.borderGold)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: tagColor, background: tagColor + '15', border: `1px solid ${tagColor}30`, borderRadius: 20, padding: '3px 9px' }}>{tag}</span>
                </div>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 7px', lineHeight: 1.35, letterSpacing: '-0.01em' }}>{title}</p>
                <p style={{ fontSize: 13, color: C.muted, margin: '0 0 12px', lineHeight: 1.55 }}>{desc}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: tagColor, background: tagColor + '10', border: `1px solid ${tagColor}20`, borderRadius: 6, padding: '3px 8px' }}>{stat}</span>
                  <span style={{ fontSize: 14, color: C.muted }}>→</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* ── Bottom CTA ── */}
        <div style={{ marginTop: 36, padding: '28px 24px', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 16, textAlign: 'center' }}>
          <Image src="/logo-white.png" alt="Setlistr" width={110} height={29} style={{ objectFit: 'contain', marginBottom: 14, opacity: 0.8 }} />
          <p style={{ fontSize: 17, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Ready to stop leaving money on stage?</p>
          <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 20px', lineHeight: 1.5 }}>Setlistr automatically captures your setlist during the show. Free to start.</p>
          <button onClick={() => router.push('/app/show/new')}
            style={{ width: '100%', padding: '15px', background: C.gold, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
            Start Free →
          </button>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer style={{ borderTop: `1px solid ${C.border}`, padding: '36px 20px', maxWidth: 480, margin: '0 auto' }}>

        <div style={{ marginBottom: 20 }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <Image src="/logo-white.png" alt="Setlistr" width={100} height={26} style={{ objectFit: 'contain', opacity: 0.6 }} />
          </Link>
        </div>

        {/* Internal links */}
        <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginBottom: 24 }}>
          {[
            { href: '/get-paid-for-live-shows', label: 'How to Get Paid' },
            { href: '/unclaimed-music-royalties', label: 'Unclaimed Royalties' },
            { href: '/submit-setlists-pro', label: 'Submit Setlists' },
            { href: '/what-is-live-performance-royalty', label: 'What Are Live Royalties?' },
          ].map(({ href, label }) => (
            <Link key={href} href={href} style={{ textDecoration: 'none', fontSize: 12, color: C.muted, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 10px' }}>{label}</Link>
          ))}
        </div>

        {/* Contact */}
        <p style={{ fontSize: 12, color: C.muted, margin: '0 0 20px' }}>
          Questions? <a href="mailto:hello@setlistr.ai" style={{ color: C.gold, textDecoration: 'none' }}>hello@setlistr.ai</a>
        </p>

        {/* Legal disclaimer */}
        <div style={{ paddingTop: 20, borderTop: `1px solid rgba(255,255,255,0.04)`, marginBottom: 16 }}>
          <p style={{ fontSize: 11, color: 'rgba(138,122,104,0.6)', margin: '0 0 8px', lineHeight: 1.6 }}>
            <strong style={{ color: 'rgba(138,122,104,0.8)' }}>Disclaimer:</strong>{' '}
            Royalty estimates are for informational purposes only and are based on publicly available PRO tariff data.
            Actual payments vary based on venue license status, PRO distribution rules, song registration, writer splits,
            and other factors outside Setlistr's control. Setlistr is not a licensed financial or legal advisor.
            Always verify rates directly with your PRO.
          </p>
          <p style={{ fontSize: 11, color: 'rgba(138,122,104,0.5)', margin: '0 0 8px', lineHeight: 1.6 }}>
            Setlistr is not affiliated with, endorsed by, or connected to SOCAN, ASCAP, BMI, SESAC, GMR,
            PRS for Music, APRA AMCOS, or any Performing Rights Organization. All PRO names are trademarks
            of their respective owners.
          </p>
          <p style={{ fontSize: 11, color: 'rgba(138,122,104,0.5)', margin: 0, lineHeight: 1.6 }}>
            This site uses essential cookies for authentication only. No advertising or tracking cookies.{' '}
            By using this site you agree to our{' '}
            <Link href="/terms" style={{ color: 'rgba(201,168,76,0.5)', textDecoration: 'none' }}>Terms of Service</Link>
            {' '}and{' '}
            <Link href="/privacy" style={{ color: 'rgba(201,168,76,0.5)', textDecoration: 'none' }}>Privacy Policy</Link>.
          </p>
        </div>

        {/* Copyright */}
        <p style={{ fontSize: 11, color: 'rgba(138,122,104,0.4)', margin: 0, lineHeight: 1.6 }}>
          © {new Date().getFullYear()} Setlistr · Live performance tracking and royalty submission for songwriters.<br />
          <span style={{ opacity: 0.7 }}>Works with SOCAN, ASCAP, BMI, PRS, APRA and all major PROs.</span>
        </p>
      </footer>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
      `}</style>
    </div>
  )
}
