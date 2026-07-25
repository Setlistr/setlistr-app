'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Send, TrendingUp } from 'lucide-react'
import Image from 'next/image'
import type { Profile } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { tapNav, tapRecord } from '@/lib/haptics'
import { useState, useEffect } from 'react'

const FULLSCREEN_ROUTES = ['/app/live/']

const GRAIN_URI = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E")`

export function AppShell({ children, profile }: { children: React.ReactNode; profile: Profile }) {
  const pathname = usePathname()
  const [needsReviewCount, setNeedsReviewCount] = useState(0)

  const isFullscreen = FULLSCREEN_ROUTES.some(r => pathname.startsWith(r))

  useEffect(() => {
    if (!profile?.id) return
    const supabase = createClient()
    async function fetchCount() {
      try {
        const { count } = await supabase
          .from('performances')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', profile.id)
          .eq('status', 'needs_review')
        setNeedsReviewCount(count ?? 0)
      } catch {
        setNeedsReviewCount(0)
      }
    }
    fetchCount()
  }, [pathname, profile?.id])

  if (isFullscreen) return <>{children}</>

  const initials = (profile.full_name || profile.email)
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  const LEFT_NAV = [
    { href: '/app/dashboard', icon: LayoutDashboard, label: 'Home',        badge: 0 },
    { href: '/app/history',   icon: Send,            label: 'Submissions', badge: needsReviewCount },
  ]
  const RIGHT_NAV = [
    { href: '/app/stats',    label: 'Career',  badge: 0 },
    { href: '/app/settings', label: 'Profile', badge: 0 },
  ]

  return (
    <div style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column', background: '#0a0908' }}>

      {/* ── Header — logo only ── */}
      <header style={{
        height: 56, padding: '0 16px',
        display: 'flex', alignItems: 'center',
        position: 'sticky', top: 0, zIndex: 40,
        background: 'rgba(10,9,8,0.88)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0,
      }}>
        <Link href="/app/dashboard" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Image src="/logo-white.png" alt="Setlistr" width={120} height={32} priority style={{ objectFit: 'contain' }} />
        </Link>
      </header>

      {/* Grain layer — fixed noise texture over all shell surfaces, excluded from fullscreen routes */}
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 100, pointerEvents: 'none', backgroundImage: GRAIN_URI, backgroundRepeat: 'repeat', opacity: 0.03 }} />

      {/* ── Main content ── */}
      <main style={{ flex: 1, paddingBottom: 96 }}>{children}</main>

      {/* ── Bottom nav ── */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
        minHeight: 64,
        background: 'rgba(10,9,8,0.96)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)',
      }}>
        <div style={{ position: 'relative', display: 'flex', maxWidth: 480, margin: '0 auto' }}>

          {/* Left two tabs */}
          {LEFT_NAV.map((tab) => {
            const isActive = pathname === tab.href || (tab.href !== '/app/dashboard' && pathname.startsWith(tab.href))
            const Icon = tab.icon
            return (
              <Link key={tab.href} href={tab.href} onClick={tapNav} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 4px 10px', textDecoration: 'none', position: 'relative', WebkitTapHighlightColor: 'transparent', minHeight: 56 }}>
                {tab.badge > 0 && (
                  <div style={{ position: 'absolute', top: 6, right: '50%', transform: 'translateX(14px)', width: 7, height: 7, borderRadius: '50%', background: '#c9a84c', border: '1.5px solid #0a0908' }} />
                )}
                <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} color={isActive ? '#c9a84c' : '#5a5040'} />
                <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, color: isActive ? '#c9a84c' : '#5a5040', marginTop: 4, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1 }}>
                  {tab.label}
                </span>
                {isActive && (
                  <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 24, height: 2, borderRadius: 1, background: '#c9a84c' }} />
                )}
              </Link>
            )
          })}

          {/* Center placeholder — reserves space for the raised button */}
          <div style={{ flex: 1 }} />

          {/* Right two tabs */}
          {RIGHT_NAV.map((tab) => {
            const isActive = pathname === tab.href || pathname.startsWith(tab.href)
            const isProfile = tab.href === '/app/settings'
            return (
              <Link key={tab.href} href={tab.href} onClick={tapNav} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 4px 10px', textDecoration: 'none', position: 'relative', WebkitTapHighlightColor: 'transparent', minHeight: 56 }}>
                {isProfile ? (
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: isActive ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.08)', border: `1.5px solid ${isActive ? 'rgba(201,168,76,0.5)' : 'rgba(255,255,255,0.12)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                    {profile.avatar_url
                      ? <img src={profile.avatar_url} alt={initials} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 8, fontWeight: 800, color: isActive ? '#c9a84c' : '#5a5040', letterSpacing: '0.02em' }}>{initials}</span>
                    }
                  </div>
                ) : (
                  <TrendingUp size={22} strokeWidth={isActive ? 2.5 : 1.8} color={isActive ? '#c9a84c' : '#5a5040'} />
                )}
                <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, color: isActive ? '#c9a84c' : '#5a5040', marginTop: 4, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1 }}>
                  {tab.label}
                </span>
                {isActive && (
                  <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 24, height: 2, borderRadius: 1, background: '#c9a84c' }} />
                )}
              </Link>
            )
          })}

          {/* Raised center capture button — absolutely positioned, floats above nav */}
          <Link
            href="/app/show/new"
            className="nav-ctr"
            onClick={tapRecord}
            style={{
              position: 'absolute',
              left: '50%',
              top: '-12px',
              transform: 'translateX(-50%)',
              width: 64, height: 64,
              borderRadius: '50%',
              background: 'linear-gradient(180deg, #d4b45c 0%, #b8963e 100%)',
              border: '3px solid #0a0908',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              textDecoration: 'none',
              zIndex: 2,
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {/* Record dot glyph */}
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#0a0908' }} />
          </Link>

        </div>
      </nav>

      <style>{`
        @keyframes fadeIn       { from{opacity:0} to{opacity:1} }
        @keyframes slideUp      { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes gold-breathe { 0%,100%{box-shadow:0 4px 20px rgba(201,168,76,0.25),0 2px 8px rgba(0,0,0,0.55)} 50%{box-shadow:0 4px 32px rgba(201,168,76,0.50),0 2px 8px rgba(0,0,0,0.55),0 0 44px rgba(201,168,76,0.18)} }
        .nav-ctr { animation: gold-breathe 3s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .nav-ctr { animation: none !important; box-shadow: 0 4px 20px rgba(201,168,76,0.40), 0 2px 8px rgba(0,0,0,0.55); } }
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  )
}
