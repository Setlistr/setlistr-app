'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, PlusCircle, Clock, BarChart2, X, Settings, LogOut, Shield } from 'lucide-react'
import Image from 'next/image'
import type { Profile } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { useState, useRef, useEffect } from 'react'

const ADMIN_EMAILS = [
  'jesse.slack.music@gmail.com',
  'darylscottsongs@gmail.com',
]

const NAV = [
  { href: '/app/dashboard', icon: LayoutDashboard, label: 'Home' },
  { href: '/app/performances/new', icon: PlusCircle, label: 'New Show' },
  { href: '/app/performances/history', icon: Clock, label: 'History' },
  { href: '/app/stats', icon: BarChart2, label: 'Stats' },
]

// These routes hide the shell entirely — full-screen mode
const FULLSCREEN_ROUTES = ['/app/live/']

export function AppShell({ children, profile }: { children: React.ReactNode; profile: Profile }) {
  const pathname  = usePathname()
  const isAdmin   = ADMIN_EMAILS.includes(profile.email)
  const [profileOpen, setProfileOpen] = useState(false)
  const modalRef  = useRef<HTMLDivElement>(null)

  const isFullscreen = FULLSCREEN_ROUTES.some(r => pathname.startsWith(r))

  // Close modal on outside tap
  useEffect(() => {
    if (!profileOpen) return
    function onDown(e: MouseEvent | TouchEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [profileOpen])

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  // Full-screen pages (live capture) — render children only, no shell
  if (isFullscreen) {
    return <>{children}</>
  }

  const initials = (profile.full_name || profile.email)
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column', background: '#0a0908' }}>

      {/* ── Header — 36px, logo left, avatar right ── */}
      <header style={{
        height: 44,
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 40,
        background: 'rgba(10,9,8,0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        flexShrink: 0,
      }}>
        {/* Logo — tap goes to dashboard */}
        <Link href="/app/dashboard" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <Image src="/logo-white.png" alt="Setlistr" width={100} height={26} priority style={{ objectFit: 'contain' }} />
        </Link>

        {/* Profile avatar button */}
        <button
          onClick={() => setProfileOpen(true)}
          style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(201,168,76,0.15)',
            border: '1px solid rgba(201,168,76,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#c9a84c',
            fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
            fontFamily: '"DM Sans", system-ui, sans-serif',
            WebkitTapHighlightColor: 'transparent',
            transition: 'background 0.15s ease',
          }}
          onTouchStart={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.25)')}
          onTouchEnd={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.15)')}
        >
          {initials}
        </button>
      </header>

      {/* ── Main content ── */}
      <main style={{ flex: 1, paddingBottom: 80 }}>{children}</main>

      {/* ── Bottom nav ── */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
        background: 'rgba(10,9,8,0.94)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        <div style={{ display: 'flex', maxWidth: 480, margin: '0 auto' }}>
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || (href !== '/app/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 4, padding: '10px 0 8px',
                  color: active ? '#c9a84c' : '#3a3530',
                  textDecoration: 'none', position: 'relative',
                  transition: 'color 0.15s ease',
                  WebkitTapHighlightColor: 'transparent',
                }}>
                <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
                <span style={{
                  fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em',
                  fontWeight: 600, fontFamily: '"DM Sans", system-ui, sans-serif',
                }}>{label}</span>
                {active && (
                  <div style={{
                    position: 'absolute', bottom: 0, width: 24, height: 2,
                    borderRadius: 1, background: '#c9a84c',
                  }} />
                )}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* ── Profile modal ── */}
      {profileOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          animation: 'fadeIn 0.15s ease',
        }}>
          <div
            ref={modalRef}
            style={{
              width: '100%', maxWidth: 480,
              background: '#141210',
              borderRadius: '20px 20px 0 0',
              border: '1px solid rgba(255,255,255,0.07)',
              borderBottom: 'none',
              padding: '20px 20px 36px',
              animation: 'slideUp 0.2s ease',
              fontFamily: '"DM Sans", system-ui, sans-serif',
            }}>

            {/* Handle + close */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ width: 32, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.12)', margin: '0 auto 0 0' }} />
              <button
                onClick={() => setProfileOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#5a5448', cursor: 'pointer', padding: 4, WebkitTapHighlightColor: 'transparent' }}>
                <X size={16} />
              </button>
            </div>

            {/* Avatar + name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'rgba(201,168,76,0.15)',
                border: '1px solid rgba(201,168,76,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: 700, color: '#c9a84c',
              }}>{initials}</div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#f0ece3', margin: 0, letterSpacing: '-0.01em' }}>
                  {profile.full_name || 'Your Profile'}
                </p>
                <p style={{ fontSize: 12, color: '#5a5448', margin: '2px 0 0' }}>{profile.email}</p>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', marginBottom: 12 }} />

            {/* Menu items */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

              <Link
                href="/app/settings"
                onClick={() => setProfileOpen(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 10px', borderRadius: 10,
                  color: '#b8a888', textDecoration: 'none',
                  transition: 'background 0.12s ease',
                  WebkitTapHighlightColor: 'transparent',
                }}
                onTouchStart={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                onTouchEnd={e => (e.currentTarget.style.background = 'transparent')}
              >
                <Settings size={16} color="#5a5448" />
                <span style={{ fontSize: 14, fontWeight: 500 }}>Settings</span>
              </Link>

              {/* Admin — only visible to admin accounts */}
              {isAdmin && (
                <Link
                  href="/app/admin"
                  onClick={() => setProfileOpen(false)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 10px', borderRadius: 10,
                    color: '#c9a84c', textDecoration: 'none',
                    transition: 'background 0.12s ease',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                  onTouchStart={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.08)')}
                  onTouchEnd={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <Shield size={16} color="#c9a84c" />
                  <span style={{ fontSize: 14, fontWeight: 500 }}>Admin</span>
                  <span style={{
                    marginLeft: 'auto', fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: '#c9a84c', background: 'rgba(201,168,76,0.12)',
                    padding: '2px 7px', borderRadius: 4,
                  }}>Internal</span>
                </Link>
              )}

              {/* Divider before sign out */}
              <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '8px 0' }} />

              <button
                onClick={signOut}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 10px', borderRadius: 10,
                  color: '#f87171', background: 'transparent', border: 'none',
                  cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'left',
                  transition: 'background 0.12s ease',
                  WebkitTapHighlightColor: 'transparent',
                }}
                onTouchStart={e => (e.currentTarget.style.background = 'rgba(220,38,38,0.08)')}
                onTouchEnd={e => (e.currentTarget.style.background = 'transparent')}
              >
                <LogOut size={16} color="#f87171" />
                <span style={{ fontSize: 14, fontWeight: 500 }}>Sign out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  )
}
