'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, PlusCircle, Clock, LogOut, BarChart2 } from 'lucide-react'
import Image from 'next/image'
import type { Profile } from '@/types'
import { createClient } from '@/lib/supabase/client'

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

export function AppShell({ children, profile }: { children: React.ReactNode; profile: Profile }) {
  const pathname = usePathname()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  const isAdmin = ADMIN_EMAILS.includes(profile.email)

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0a0908' }}>
      <header
        className="px-4 py-3 flex items-center justify-between sticky top-0 z-40"
        style={{
          background: 'rgba(10, 9, 8, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <Image src="/logo-white.png" alt="Setlistr" width={140} height={36} priority />
        <div className="flex items-center gap-3">
          <span className="text-xs hidden sm:block" style={{ color: '#5a5448' }}>
            {profile.email}
          </span>
          {isAdmin && (
            <Link
              href="/app/admin"
              className="text-[11px] px-2.5 py-1 rounded-lg font-medium transition-colors"
              style={{
                color: pathname === '/app/admin' ? '#c9a84c' : '#6a6050',
                border: '1px solid rgba(255,255,255,0.07)',
                background: pathname === '/app/admin' ? 'rgba(201,168,76,0.1)' : 'transparent',
              }}
            >
              Admin
            </Link>
          )}
          <button
            onClick={signOut}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: '#5a5448' }}
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      <main className="flex-1 pb-28">{children}</main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 pb-safe"
        style={{
          background: 'rgba(10, 9, 8, 0.92)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="flex max-w-lg mx-auto">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || (href !== '/app/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className="flex-1 flex flex-col items-center gap-1.5 py-4 transition-all relative"
                style={{ color: active ? '#c9a84c' : '#4a4440' }}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
                <span className="text-[10px] uppercase tracking-widest font-medium">{label}</span>
                {active && (
                  <div
                    className="absolute bottom-0 w-8 h-[2px] rounded-full"
                    style={{ background: '#c9a84c' }}
                  />
                )}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
