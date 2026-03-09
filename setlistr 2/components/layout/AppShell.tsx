'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, PlusCircle, Clock, LogOut } from 'lucide-react'
import type { Profile } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils/cn'

const NAV = [
  { href: '/app/dashboard', icon: LayoutDashboard, label: 'Home' },
  { href: '/app/performances/new', icon: PlusCircle, label: 'New' },
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
    <div className="min-h-screen bg-cream flex flex-col">
      {/* Top bar */}
      <header className="bg-ink border-b border-[#2e2b26] px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="flex flex-col gap-[2.5px] w-5">
            <div className="h-[2px] w-full bg-gold rounded-sm"/>
            <div className="h-[2px] w-[60%] bg-gold rounded-sm"/>
            <div className="h-[2px] w-[78%] bg-gold rounded-sm"/>
            <div className="flex items-center gap-[3px]">
              <div className="h-[2px] w-[44%] bg-gold rounded-sm"/>
              <div className="h-[5px] w-[5px] rounded-full bg-gold"/>
            </div>
          </div>
          <span className="font-display text-cream text-lg tracking-wide">Setlistr</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-light hidden sm:block">{profile.email}</span>
          <button onClick={signOut} className="text-ink-light hover:text-gold transition-colors p-1">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 pb-24">{children}</main>

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
