import { createServerSupabaseClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Performance } from '@/types'

export default async function HistoryPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: performances } = await supabase
    .from('performances')
    .select('*, performance_songs(count)')
    .eq('user_id', user!.id)
    .order('performance_date', { ascending: false })

  // Group by year
  const byYear: Record<string, Performance[]> = {}
  for (const p of (performances ?? [])) {
    const year = new Date(p.performance_date).getFullYear().toString()
    if (!byYear[year]) byYear[year] = []
    byYear[year].push(p)
  }

  const statusColors: Record<string, string> = {
    draft: 'bg-zinc-100 text-zinc-500',
    live: 'bg-red-100 text-red-600',
    processing: 'bg-amber-100 text-amber-700',
    review: 'bg-blue-100 text-blue-700',
    complete: 'bg-green-100 text-green-700',
  }

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <div className="mb-8">
        <p className="text-xs text-ink-light uppercase tracking-[0.2em] mb-1">All Shows</p>
        <h1 className="font-display text-3xl text-ink">History</h1>
      </div>

      {Object.keys(byYear).length === 0 ? (
        <div className="text-center py-16 text-ink-light">
          <p className="text-sm">No performances yet</p>
          <Link href="/app/performances/new" className="text-gold text-sm mt-2 block">Start your first show →</Link>
        </div>
      ) : (
        Object.entries(byYear).map(([year, shows]) => (
          <div key={year} className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-display text-xl text-ink">{year}</h2>
              <div className="flex-1 h-px bg-cream-dark"/>
              <span className="text-xs text-ink-light">{shows.length} show{shows.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex flex-col gap-2">
              {shows.map(p => (
                <Link key={p.id} href={`/app/performances/${p.id}`}
                  className="bg-white border border-cream-dark rounded-xl px-4 py-3.5 flex items-center justify-between hover:border-gold transition-colors group">
                  <div>
                    <div className="font-medium text-ink">{p.venue_name}</div>
                    <div className="text-xs text-ink-light mt-0.5">
                      {p.city} · {new Date(p.performance_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                    <div className="text-xs text-ink-light/60 mt-0.5">{p.artist_name}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-medium px-2 py-1 rounded-full uppercase tracking-wider ${statusColors[p.status] ?? 'bg-zinc-100 text-zinc-500'}`}>
                      {p.status}
                    </span>
                    <ChevronRight size={14} className="text-ink-light/40 group-hover:text-gold transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
