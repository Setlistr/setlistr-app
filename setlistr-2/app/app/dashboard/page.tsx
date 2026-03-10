import { createServerSupabaseClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PlusCircle, Zap, Music2, MapPin, Clock, ChevronRight } from 'lucide-react'
import { RoyaltyWidget } from '@/components/RoyaltyWidget'

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [
    { data: performances },
    { count: totalCount },
    { count: liveCount },
    { count: completedCount },
    { data: songStats },
    { data: venueStats },
    { data: performancesWithSongs },
  ] = await Promise.all([
    supabase.from('performances').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(5),
    supabase.from('performances').select('*', { count: 'exact', head: true }).eq('user_id', user!.id),
    supabase.from('performances').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).eq('status', 'live'),
    supabase.from('performances').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).eq('status', 'completed'),
    supabase.from('performance_songs').select('performance_id, performances!inner(user_id)').eq('performances.user_id', user!.id),
    supabase.from('performances').select('city').eq('user_id', user!.id),
    supabase.from('performances').select('id, venue_name, city, country, set_duration_minutes, performance_songs(count)').eq('user_id', user!.id).eq('status', 'completed'),
  ])

  const totalSongs = songStats?.length ?? 0
  const uniqueVenues = new Set(venueStats?.map((v: any) => v.city) ?? []).size
  const isLive = (liveCount ?? 0) > 0

  const royaltyPerformances = (performancesWithSongs ?? []).map((p: any) => ({
    ...p,
    song_count: p.performance_songs?.[0]?.count || 0,
  }))

  return (
    <div className="min-h-screen text-cream flex flex-col"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #1e1c18 0%, #0f0e0c 100%)' }}>

      <div className="px-4 pt-8 pb-4 max-w-lg mx-auto w-full">
        <p className="text-xs text-gold/60 uppercase tracking-[0.3em] mb-1">Performance Registry</p>
        <h1 className="font-display text-3xl text-cream">Dashboard</h1>
      </div>

      {isLive && (
        <div className="px-4 max-w-lg mx-auto w-full mb-4">
          <div className="bg-red-600/20 border border-red-500/30 rounded-2xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-400 font-semibold text-sm">You have a live performance</span>
            </div>
            <Zap size={16} className="text-red-400" />
          </div>
        </div>
      )}

      <div className="px-4 max-w-lg mx-auto w-full mb-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#1a1814] border border-[#2e2b26] rounded-2xl p-4">
            <div className="text-gold mb-2"><Music2 size={18} /></div>
            <div className="text-3xl font-bold text-cream">{totalCount ?? 0}</div>
            <div className="text-xs text-[#6a6660] uppercase tracking-wider mt-0.5">Total Shows</div>
          </div>
          <div className="bg-[#1a1814] border border-[#2e2b26] rounded-2xl p-4">
            <div className="text-gold mb-2"><Music2 size={18} /></div>
            <div className="text-3xl font-bold text-cream">{totalSongs}</div>
            <div className="text-xs text-[#6a6660] uppercase tracking-wider mt-0.5">Songs Logged</div>
          </div>
          <div className="bg-[#1a1814] border border-[#2e2b26] rounded-2xl p-4">
            <div className="text-gold mb-2"><MapPin size={18} /></div>
            <div className="text-3xl font-bold text-cream">{uniqueVenues}</div>
            <div className="text-xs text-[#6a6660] uppercase tracking-wider mt-0.5">Unique Cities</div>
          </div>
          <div className="bg-[#1a1814] border border-[#2e2b26] rounded-2xl p-4">
            <div className="text-gold mb-2"><Zap size={18} /></div>
            <div className="text-3xl font-bold text-cream">{completedCount ?? 0}</div>
            <div className="text-xs text-[#6a6660] uppercase tracking-wider mt-0.5">Completed</div>
          </div>
        </div>
      </div>

      <div className="px-4 max-w-lg mx-auto w-full mb-6">
        <RoyaltyWidget performances={royaltyPerformances} />
      </div>

      <div className="px-4 max-w-lg mx-auto w-full mb-8">
        <Link href="/app/performances/new"
          className="flex items-center justify-center gap-2 w-full bg-gold hover:bg-yellow-400 text-ink rounded-2xl py-4 font-bold transition-colors">
          <PlusCircle size={18} />
          Start New Performance
        </Link>
      </div>

      <div className="px-4 max-w-lg mx-auto w-full pb-12">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-cream">Recent Performances</h2>
          <Link href="/app/performances/history" className="text-xs text-gold hover:text-yellow-300 transition-colors">
            View all
          </Link>
        </div>

        {!performances?.length ? (
          <div className="text-center py-12 text-[#4a4640]">
            <Clock size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No performances yet</p>
            <p className="text-xs mt-1 opacity-60">Your show history will appear here</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {performances.map((p: any) => (
              <Link key={p.id} href={p.status === 'live' ? `/app/live/${p.id}` : `/app/review/${p.id}`}
                className="bg-[#1a1814] border border-[#2e2b26] rounded-xl px-4 py-3 flex items-center justify-between hover:border-gold transition-colors group">
                <div>
                  <div className="font-medium text-cream text-sm group-hover:text-gold transition-colors">
                    {p.venue_name}
                  </div>
                  <div className="text-xs text-[#6a6660] mt-0.5">
                    {p.city} · {p.started_at ? new Date(p.started_at).toLocaleDateString() : new Date(p.performance_date).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={p.status} />
                  <ChevronRight size={14} className="text-[#3e3b36] group-hover:text-gold transition-colors" />
                </div>
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
    draft: { label: 'Draft', color: 'text-[#6a6660] bg-[#2a2620] border border-[#3e3b36]' },
    live: { label: '● Live', color: 'text-red-400 bg-red-400/10 border border-red-400/20 animate-pulse' },
    processing: { label: 'Processing', color: 'text-amber-400 bg-amber-400/10 border border-amber-400/20' },
    review: { label: 'Review', color: 'text-gold bg-gold/10 border border-gold/20' },
    completed: { label: 'Done', color: 'text-green-400 bg-green-400/10 border border-green-400/20' },
    complete: { label: 'Done', color: 'text-green-400 bg-green-400/10 border border-green-400/20' },
  }
  const s = map[status] ?? { label: status, color: 'text-[#6a6660] bg-[#2a2620] border border-[#3e3b36]' }
  return (
    <span className={`text-[10px] font-medium px-2 py-1 rounded-full uppercase tracking-wider ${s.color}`}>
      {s.label}
    </span>
  )
}
