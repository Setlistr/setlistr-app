'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, PlusCircle, Clock, LogOut } from 'lucide-react'
import Image from 'next/image'
import type { Profile } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils/cn'

const NAV = [
  { href: '/app/dashboard', icon: LayoutDashboard, label: 'Home' },
  { href: '/app/performances/new', icon: PlusCircle, label: 'New Show' },
  { href: '/app/performances/history', icon: Clock, label: 'History' },
]

export function AppShell({ children, profile }: { children: React.ReactNode; profile: Profile }) {
  const pathname = usePathname()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0a0908' }}>

      {/* Top bar */}
      <header className="px-4 py-3 flex items-center justify-between sticky top-0 z-40"
        style={{
          background: 'rgba(10, 9, 8, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
        <Image
          src="/logo-pill.png"
          alt="Setlistr"
          width={110}
          height={28}
          priority
        />
        <div className="flex items-center gap-3">
          <span className="text-xs hidden sm:block" style={{ color: '#5a5448' }}>
            {profile.email}
          </span>
          <button
            onClick={signOut}
            className="transition-colors p-1.5 rounded-lg"
            style={{ color: '#5a5448' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#c9a84c')}
            onMouseLeave={e => (e.currentTarget.style.color = '#5a5448')}
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 pb-28">{children}</main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 pb-safe"
        style={{
          background: 'rgba(10, 9, 8, 0.92)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
        <div className="flex max-w-lg mx-auto">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || (href !== '/app/dashboard' && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className="flex-1 flex flex-col items-center gap-1.5 py-4 transition-all"
                style={{ color: active ? '#c9a84c' : '#4a4440' }}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
                <span className="text-[10px] uppercase tracking-widest font-medium">{label}</span>
                {active && (
                  <div className="absolute bottom-0 w-8 h-[2px] rounded-full" style={{ background: '#c9a84c' }} />
                )}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-ink border-t border-[#2e2b26] pb-safe z-40">
        <div className="flex">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = pathname === href || (href !== '/app/dashboard' && pathname.startsWith(href))
            return (
              <Link key={href} href={href} className={cn(
                'flex-1 flex flex-col items-center gap-1 py-3 transition-colors',
                active ? 'text-gold' : 'text-ink-light hover:text-cream'
              )}>
                <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
                <span className="text-[10px] uppercase tracking-wider font-medium">{label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
