// Shared building blocks for the redesigned get-paid content cluster.
// One source of truth for the article skin so all five pages stay consistent
// and a future font/color change touches only this file.
import Link from 'next/link'
import Image from 'next/image'

const GOLD = '#C9A84C'
const GREEN = '#4ade80'
const RED = '#f0a68a'

export function ArticleShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100svh', background: '#080706', color: '#fff', fontFamily: '"DM Sans", system-ui, sans-serif', overflowX: 'hidden' }}>
      <div style={{ position: 'fixed', width: 560, height: 560, borderRadius: '50%', filter: 'blur(120px)', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(circle, rgba(201,168,76,1), transparent)', opacity: 0.09, top: -240, right: -160 }} />
      <ArticleNav />
      <article style={{ position: 'relative', zIndex: 1, maxWidth: 720, margin: '0 auto', padding: '120px 24px 80px' }}>
        {children}
      </article>
    </div>
  )
}

function ArticleNav() {
  return (
    <header style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 40px', background: 'rgba(8,7,6,0.82)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <Link href="/" style={{ textDecoration: 'none', display: 'flex' }}>
        <Image src="/logo-white-tight.png" alt="Setlistr" width={190} height={36} priority style={{ height: 36, width: 'auto', objectFit: 'contain' }} />
      </Link>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Link href="/get-paid" style={navLink} className="art-navlink">For Artists</Link>
        <Link href="/how-it-works" style={navLink} className="art-navlink">How It Works</Link>
        <Link href="/app/show/new" style={{ fontFamily: '"DM Mono", monospace', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', background: GOLD, color: '#080706', textDecoration: 'none', padding: '10px 20px', borderRadius: 6 }}>Start Free</Link>
      </nav>
    </header>
  )
}
const navLink: React.CSSProperties = { fontFamily: '"DM Mono", monospace', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(232,228,219,0.78)', textDecoration: 'none' }

export function Crumb({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: '"DM Mono", monospace', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(201,168,76,0.7)', marginBottom: 24 }}>{children}</div>
}

export function Tag({ children, color = GOLD }: { children: React.ReactNode; color?: string }) {
  const bg = color === GREEN ? 'rgba(74,222,128,0.1)' : color === RED ? 'rgba(248,113,113,0.08)' : 'rgba(201,168,76,0.1)'
  const bd = color === GREEN ? 'rgba(74,222,128,0.25)' : color === RED ? 'rgba(248,113,113,0.22)' : 'rgba(201,168,76,0.25)'
  return <span style={{ display: 'inline-block', fontFamily: '"DM Mono", monospace', fontSize: 10, fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', padding: '5px 13px', borderRadius: 20, marginBottom: 22, color, background: bg, border: `1px solid ${bd}` }}>{children}</span>
}

export function H1({ children }: { children: React.ReactNode }) {
  return <h1 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 'clamp(40px, 7vw, 76px)', lineHeight: 0.94, letterSpacing: '.02em', margin: '0 0 22px' }}>{children}</h1>
}

export function Standfirst({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 18, fontWeight: 300, color: 'rgba(212,209,202,0.78)', lineHeight: 1.7, maxWidth: 600, margin: 0 }}>{children}</p>
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 'clamp(28px, 4vw, 40px)', letterSpacing: '.02em', margin: '52px 0 18px' }}>{children}</h2>
}

export function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 16, fontWeight: 300, lineHeight: 1.8, color: 'rgba(212,209,202,0.75)', margin: '0 0 16px' }}>{children}</p>
}

export function Callout({ children, color = GOLD }: { children: React.ReactNode; color?: string }) {
  const grad = color === GREEN ? 'linear-gradient(100deg, rgba(74,222,128,.08), transparent)' : 'linear-gradient(100deg, rgba(201,168,76,.08), transparent)'
  return <div style={{ borderLeft: `2px solid ${color}`, background: grad, borderRadius: '0 12px 12px 0', padding: '22px 26px', margin: '40px 0', fontSize: 15.5, lineHeight: 1.7, color: 'rgba(212,209,202,0.85)' }}>{children}</div>
}

export function EndCTA({ heading, sub, href = '/app/show/new', cta = 'Start Free →' }: { heading: string; sub: string; href?: string; cta?: string }) {
  return (
    <div style={{ background: 'linear-gradient(160deg, rgba(201,168,76,.12), rgba(201,168,76,.03))', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 20, padding: '40px 32px', textAlign: 'center', marginTop: 56 }}>
      <h3 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 'clamp(26px, 4vw, 38px)', letterSpacing: '.02em', margin: '0 0 12px' }}>{heading}</h3>
      <p style={{ fontSize: 15, fontWeight: 300, color: 'rgba(212,209,202,0.72)', lineHeight: 1.6, maxWidth: 420, margin: '0 auto 24px' }}>{sub}</p>
      <Link href={href} style={{ display: 'inline-block', fontFamily: '"Bebas Neue", sans-serif', fontSize: 18, letterSpacing: '.08em', background: GOLD, color: '#080706', padding: '15px 40px', textDecoration: 'none', borderRadius: 8 }}>{cta}</Link>
    </div>
  )
}

export function Related({ links }: { links: { href: string; title: string }[] }) {
  return (
    <div style={{ marginTop: 56, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 32 }}>
      <div style={{ fontFamily: '"DM Mono", monospace', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(201,168,76,0.7)', marginBottom: 18 }}>Keep Reading</div>
      {links.map(({ href, title }) => (
        <Link key={href} href={href} style={{ display: 'block', fontSize: 15, color: 'rgba(212,209,202,0.75)', textDecoration: 'none', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }} className="art-related">{title} →</Link>
      ))}
    </div>
  )
}

// Small styled primitives reused across articles
export function InfoCard({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'linear-gradient(160deg, rgba(20,18,16,.9), rgba(12,10,8,.9))', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 20px', marginBottom: 10 }}>{children}</div>
}

export function CheckRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 16px', background: 'rgba(20,18,16,0.8)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, marginBottom: 8, alignItems: 'center' }}>
      <span style={{ color: GOLD, flexShrink: 0 }}>✓</span>
      <span style={{ fontSize: 14, color: 'rgba(212,209,202,0.78)' }}>{children}</span>
    </div>
  )
}

export const COLORS = { GOLD, GREEN, RED }
