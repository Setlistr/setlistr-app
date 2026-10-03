'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Users, BarChart3, Calendar, Settings } from 'lucide-react'
import type { Profile } from '@/types'
import { useActingAs } from '@/components/ActingAsProvider'

// Dedicated shell for /app/manager* — a desktop sidebar and its own mobile
// bottom nav, deliberately separate from AppShell's own artist-facing
// header/bottom-nav rather than a variant of it. Manager mode operates
// across MULTIPLE authorized artists at once (see lib/managerFetch.ts's own
// doc comment on why RLS makes that safe) and does not depend on — or set —
// any single acting-as artist selection; only drilling into one artist's
// existing flows (app/app/manager/artists/[artistId]/page.tsx) ever touches
// that. Rendered by AppShell itself via a manager-route branch checked
// BEFORE the acting-as isBlocked gate, so a stale/broken single-artist
// selection from a previous session can never block entry into Manager
// mode, which has nothing to do with it.

const C = {
  bg: '#0a0908', card: '#141210', border: 'rgba(255,255,255,0.08)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#5a5448',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.12)',
}

// Analytics only added once it's a real, working destination (this pass) —
// per instruction, an empty/placeholder nav entry must never ship ahead of
// the page it points to.
const NAV = [
  { href: '/app/manager', icon: LayoutDashboard, label: 'Overview' },
  { href: '/app/manager/artists', icon: Users, label: 'Artists' },
  { href: '/app/manager/schedule', icon: Calendar, label: 'Schedule' },
  { href: '/app/manager/analytics', icon: BarChart3, label: 'Analytics' },
]

export function ManagerShell({ children, profile }: { children: React.ReactNode; profile: Profile }) {
  const pathname = usePathname()
  const router = useRouter()
  const { returnToOwnWorkspace } = useActingAs()

  const initials = (profile.full_name || profile.email)
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  function isActive(href: string): boolean {
    return pathname === href || (href !== '/app/manager' && pathname.startsWith(href))
  }

  // The switcher's "leave Manager" side: clears any acting-as selection
  // through the existing, verified mechanism (never a bare navigation —
  // returnToOwnWorkspace() is the same primitive WorkspaceGate's own
  // recovery card and the dashboard's switcher already use) before landing
  // on the artist's own dashboard.
  function switchToArtist() {
    returnToOwnWorkspace()
    router.push('/app/dashboard')
  }

  return (
    <div style={{ minHeight: '100svh', display: 'flex', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>

      {/* ── Desktop sidebar ── */}
      <aside style={{
        display: 'none',
        width: 248, flexShrink: 0, minHeight: '100svh',
        borderRight: `1px solid ${C.border}`,
        padding: '28px 18px',
        flexDirection: 'column',
      }} className="mgr-sidebar">
        <Link href="/app/manager" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', padding: '0 8px 32px' }}>
          <Image src="/logo-white.png" alt="Setlistr" width={116} height={31} priority style={{ objectFit: 'contain' }} />
        </Link>

        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 12px', padding: '0 8px' }}>
          Manager
        </p>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map(item => {
            const active = isActive(item.href)
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 12px', borderRadius: 10,
                textDecoration: 'none',
                background: active ? C.goldDim : 'transparent',
                color: active ? C.gold : C.secondary,
                fontSize: 14, fontWeight: active ? 700 : 500,
                transition: 'background 0.15s ease, color 0.15s ease',
              }}>
                <Icon size={18} strokeWidth={active ? 2.3 : 1.8} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div style={{ flex: 1 }} />

        <ManagerAccountMenu profile={profile} initials={initials} onSwitchToArtist={switchToArtist} placement="sidebar" />
      </aside>

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Mobile-only top bar — desktop gets the sidebar's own logo instead */}
        <header className="mgr-mobile-header" style={{
          height: 56, padding: '0 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, zIndex: 40,
          background: 'rgba(10,9,8,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        }}>
          <Link href="/app/manager" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <Image src="/logo-white.png" alt="Setlistr" width={104} height={28} priority style={{ objectFit: 'contain' }} />
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.gold, background: C.goldDim, border: `1px solid rgba(201,168,76,0.25)`, borderRadius: 20, padding: '4px 10px' }}>
              Manager
            </span>
            <ManagerAccountMenu profile={profile} initials={initials} onSwitchToArtist={switchToArtist} placement="header" />
          </div>
        </header>

        <main style={{ flex: 1, paddingBottom: 'calc(88px + env(safe-area-inset-bottom))' }} className="mgr-main">
          {children}
        </main>
      </div>

      {/* ── Mobile bottom nav ── */}
      <nav className="mgr-mobile-nav" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
        minHeight: 64,
        background: 'rgba(10,9,8,0.96)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderTop: `1px solid ${C.border}`,
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)',
      }}>
        <div style={{ display: 'flex', maxWidth: 480, margin: '0 auto' }}>
          {NAV.map(item => {
            const active = isActive(item.href)
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 4px 10px', textDecoration: 'none', minHeight: 56, WebkitTapHighlightColor: 'transparent' }}>
                <Icon size={22} strokeWidth={active ? 2.5 : 1.8} color={active ? C.gold : C.muted} />
                <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? C.gold : C.muted, marginTop: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      <style>{`
        @media (min-width: 900px) {
          .mgr-sidebar { display: flex !important; }
          .mgr-mobile-header, .mgr-mobile-nav { display: none !important; }
          .mgr-main { padding-bottom: 0 !important; }
        }
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  )
}

// Consolidates what used to be a dedicated "Switch to Artist" nav slot
// (a 5th mobile bottom-tab, a 6th once the sidebar footer button is
// counted the same way) into one avatar menu, reused for both the
// sidebar footer and the mobile header — Settings and Team live here too,
// matching the artist-side AccountMenu's own structure, no new routes.
function ManagerAccountMenu({ profile, initials, onSwitchToArtist, placement }: {
  profile: Profile; initials: string; onSwitchToArtist: () => void; placement: 'sidebar' | 'header'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
  }, [open])

  const avatar = (
    <div style={{ width: placement === 'sidebar' ? 22 : 26, height: placement === 'sidebar' ? 22 : 26, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: `1.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
      {profile.avatar_url
        ? <img src={profile.avatar_url} alt={initials} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ fontSize: placement === 'sidebar' ? 8 : 9, fontWeight: 800, color: C.secondary }}>{initials}</span>}
    </div>
  )

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" style={
        placement === 'sidebar'
          ? { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '11px 12px', borderRadius: 10, background: 'transparent', border: `1px solid ${C.border}`, color: C.secondary, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const }
          : { display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }
      }>
        {avatar}
        {placement === 'sidebar' && 'Account'}
      </button>

      {open && (
        <div role="menu" style={{
          position: 'absolute', zIndex: 60, width: 220, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          ...(placement === 'sidebar' ? { bottom: 'calc(100% + 8px)', left: 0 } : { top: 'calc(100% + 8px)', right: 0 }),
        }}>
          <button role="menuitem" onClick={() => { onSwitchToArtist(); setOpen(false) }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'none', border: 'none', borderBottom: `1px solid ${C.border}`, color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' as const }}>
            <Users size={15} color={C.gold} /> Switch to Artist
          </button>
          <Link role="menuitem" href="/app/settings" onClick={() => setOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', color: C.text, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            <Settings size={15} color={C.secondary} /> Settings &amp; Profile
          </Link>
          <Link role="menuitem" href="/app/settings#team-access" onClick={() => setOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px 13px', color: C.text, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            <Users size={15} color={C.secondary} /> Team
          </Link>
        </div>
      )}
    </div>
  )
}
