import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PlusCircle, Zap, Music2, MapPin, Clock, ChevronRight } from 'lucide-react'
import { RoyaltyWidget } from '@/components/RoyaltyWidget'

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Redirect to onboarding if profile not set up
  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user!.id).single()
  if (!profile?.full_name) redirect('/app/onboarding')

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
    supabase.from('performances').select('id, venue_name, city, country, set_duration_minutes, performance_songs(count)').eq('user_id', user!.id).in('status', ['completed', 'review']),
  ])

  const totalSongs = songStats?.length ?? 0
  const uniqueVenues = new Set(venueStats?.map((v: any) => v.city) ?? []).size
  const isLive = (liveCount ?? 0) > 0

  const royaltyPerformances = (performancesWithSongs ?? []).map((p: any) => ({
    ...p,
    song_count: p.performance_songs?.[0]?.count || 0,
  }))

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0a0908' }}>

      <div className="px-4 pt-8 pb-4 max-w-lg mx-auto w-full">
        <p className="text-[11px] uppercase tracking-[0.3em] mb-1" style={{ color: '#c9a84c99' }}>Performance Registry</p>
        <h1 className="font-display text-3xl" style={{ color: '#f0ece3' }}>Dashboard</h1>
      </div>

      {isLive && (
        <div className="px-4 max-w-lg mx-auto w-full mb-4">
          <div className="rounded-2xl px-4 py-3 flex items-center justify-between"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-400 font-semibold text-sm">You have a live performance</span>
            </div>
            <Zap size={16} className="text-red-400" />
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="px-4 max-w-lg mx-auto w-full mb-4">
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Music2, value: totalCount ?? 0, label: 'Total Shows' },
            { icon: Music2, value: totalSongs, label: 'Songs Logged' },
            { icon: MapPin, value: uniqueVenues, label: 'Unique Cities' },
            { icon: Zap, value: completedCount ?? 0, label: 'Completed' },
          ].map(({ icon: Icon, value, label }) => (
            <div key={label} className="rounded-2xl p-4" style={{ background: '#141210', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="mb-2" style={{ color: '#c9a84c' }}><Icon size={18} /></div>
              <div className="text-3xl font-bold" style={{ color: '#f0ece3' }}>{value}</div>
              <div className="text-[11px] uppercase tracking-wider mt-0.5" style={{ color: '#a09070' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Royalty widget */}
      <div className="px-4 max-w-lg mx-auto w-full mb-6">
        <RoyaltyWidget performances={royaltyPerformances} />
      </div>

      {/* CTA */}
      <div className="px-4 max-w-lg mx-auto w-full mb-8">
        <Link href="/app/performances/new"
          className="flex items-center justify-center gap-2 w-full rounded-2xl py-4 font-bold transition-colors text-sm tracking-wide"
          style={{ background: '#c9a84c', color: '#0a0908' }}>
          <PlusCircle size={18} />
          Start New Performance
        </Link>
      </div>

      {/* Recent performances */}
      <div className="px-4 max-w-lg mx-auto w-full pb-12">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold" style={{ color: '#f0ece3' }}>Recent Performances</h2>
          <Link href="/app/performances/history"
            className="text-xs transition-colors"
            style={{ color: '#c9a84c' }}>
            View all
          </Link>
        </div>

        {!performances?.length ? (
          <div className="text-center py-12">
            <Clock size={32} className="mx-auto mb-3 opacity-20" style={{ color: '#a09070' }} />
            <p className="text-sm" style={{ color: '#a09070' }}>No performances yet</p>
            <p className="text-xs mt-1" style={{ color: '#6a6050' }}>Your show history will appear here</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {performances.map((p: any) => (
              <Link
                key={p.id}
                href={p.status === 'live' ? `/app/live/${p.id}` : `/app/review/${p.id}`}
                className="rounded-xl px-4 py-3 flex items-center justify-between transition-all group"
                style={{ background: '#141210', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div>
                  <div className="font-medium text-sm" style={{ color: '#f0ece3' }}>
                    {p.venue_name}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: '#a09070' }}>
                    {p.city} · {p.started_at ? new Date(p.started_at).toLocaleDateString() : new Date(p.performance_date).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={p.status} />
                  <ChevronRight size={14} style={{ color: '#3a3530' }} />
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
  const map: Record<string, { label: string; bg: string; color: string; border: string }> = {
    draft:      { label: 'Draft',      color: '#a09880', bg: 'rgba(160,152,128,0.1)', border: 'rgba(160,152,128,0.15)' },
    live:       { label: '● Live',     color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)'  },
    processing: { label: 'Processing', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)'  },
    review:     { label: 'Review',     color: '#c9a84c', bg: 'rgba(201,168,76,0.1)',  border: 'rgba(201,168,76,0.2)'  },
    completed:  { label: 'Done',       color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)'  },
    complete:   { label: 'Done',       color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)'  },
  }
  const s = map[status] ?? { label: status, color: '#a09880', bg: 'rgba(160,152,128,0.1)', border: 'rgba(160,152,128,0.15)' }
  return (
    <span className="text-[10px] font-medium px-2 py-1 rounded-full uppercase tracking-wider"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}>
      {s.label}
    </span>
  )
}
