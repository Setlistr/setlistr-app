import { createServerSupabaseClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PlusCircle, Zap, Clock, CheckCircle } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: performances } = await supabase
    .from('performances')
    .select('*')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(5)

  const { count: totalCount } = await supabase
    .from('performances')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user!.id)

  const { count: liveCount } = await supabase
    .from('performances')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user!.id)
    .eq('status', 'live')

  const stats = [
    { label: 'Total Shows', value: totalCount ?? 0, icon: CheckCircle },
    { label: 'Live Now', value: liveCount ?? 0, icon: Zap, highlight: (liveCount ?? 0) > 0 },
  ]

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs text-ink-light uppercase tracking-[0.2em] mb-1">Performance Registry</p>
        <h1 className="font-display text-3xl text-ink">Dashboard</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        {stats.map(({ label, value, icon: Icon, highlight }) => (
          <div key={label} className={`rounded-2xl p-4 border ${highlight ? 'bg-gold border-gold-dark' : 'bg-white border-cream-dark'}`}>
            <Icon size={18} className={highlight ? 'text-ink mb-2' : 'text-gold mb-2'} />
            <div className={`text-2xl font-bold ${highlight ? 'text-ink' : 'text-ink'}`}>{value}</div>
            <div className={`text-xs ${highlight ? 'text-ink/70' : 'text-ink-light'} uppercase tracking-wider mt-0.5`}>{label}</div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <Link href="/app/performances/new"
        className="flex items-center justify-center gap-2 w-full bg-ink hover:bg-ink-mid text-cream rounded-2xl py-4 font-semibold transition-colors mb-8">
        <PlusCircle size={18} />
        Start New Performance
      </Link>

      {/* Recent */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-ink">Recent Performances</h2>
          <Link href="/app/performances/history" className="text-xs text-gold">View all</Link>
        </div>

        {!performances?.length ? (
          <div className="text-center py-12 text-ink-light">
            <Clock size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No performances yet</p>
            <p className="text-xs mt-1 opacity-60">Your show history will appear here</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {performances.map(p => (
              <Link key={p.id} href={`/app/performances/${p.id}`}
                className="bg-white border border-cream-dark rounded-xl px-4 py-3 flex items-center justify-between hover:border-gold transition-colors">
                <div>
                  <div className="font-medium text-ink text-sm">{p.venue_name}</div>
                  <div className="text-xs text-ink-light">{p.city} · {new Date(p.performance_date).toLocaleDateString()}</div>
                </div>
                <StatusBadge status={p.status} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    draft: { label: 'Draft', color: 'bg-zinc-100 text-zinc-500' },
    live: { label: '● Live', color: 'bg-red-100 text-red-600 animate-pulse' },
    processing: { label: 'Processing', color: 'bg-amber-100 text-amber-700' },
    review: { label: 'Review', color: 'bg-blue-100 text-blue-700' },
    complete: { label: 'Complete', color: 'bg-green-100 text-green-700' },
  }
  const s = map[status] ?? { label: status, color: 'bg-zinc-100 text-zinc-500' }
  return <span className={`text-[10px] font-medium px-2 py-1 rounded-full uppercase tracking-wider ${s.color}`}>{s.label}</span>
}
