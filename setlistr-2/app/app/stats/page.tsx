import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Music2, MapPin, Calendar, TrendingUp, Mic2 } from 'lucide-react'

const C = {
  bg: '#0a0908',
  card: '#141210',
  border: 'rgba(255,255,255,0.07)',
  text: '#f0ece3',
  secondary: '#a09070',
  muted: '#6a6050',
  gold: '#c9a84c',
}

export default async function StatsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [
    { data: performances },
    { data: allSongs },
  ] = await Promise.all([
    supabase.from('performances')
      .select('id, venue_name, city, country, started_at, status, set_duration_minutes')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('started_at', { ascending: false }),
    supabase.from('performance_songs')
      .select('title, artist, performances!inner(user_id)')
      .eq('performances.user_id', user.id),
  ])

  const totalShows = performances?.length ?? 0
  const totalSongs = allSongs?.length ?? 0

  // Most played songs
  const songCounts: Record<string, { title: string; artist: string; count: number }> = {}
  allSongs?.forEach(s => {
    const key = s.title.toLowerCase()
    if (!songCounts[key]) songCounts[key] = { title: s.title, artist: s.artist, count: 0 }
    songCounts[key].count++
  })
  const topSongs = Object.values(songCounts).sort((a, b) => b.count - a.count).slice(0, 10)

  // Top venues
  const venueCounts: Record<string, { name: string; city: string; count: number }> = {}
  performances?.forEach(p => {
    const key = p.venue_name.toLowerCase()
    if (!venueCounts[key]) venueCounts[key] = { name: p.venue_name, city: p.city, count: 0 }
    venueCounts[key].count++
  })
  const topVenues = Object.values(venueCounts).sort((a, b) => b.count - a.count).slice(0, 5)

  // Cities played
  const cities = new Set(performances?.map(p => p.city) ?? [])
  const totalCities = cities.size

  // Total hours on stage
  const totalMinutes = performances?.reduce((sum, p) => sum + (p.set_duration_minutes ?? 0), 0) ?? 0
  const totalHours = Math.round(totalMinutes / 60 * 10) / 10

  // Shows by month (last 6 months)
  const monthCounts: Record<string, number> = {}
  performances?.forEach(p => {
    if (!p.started_at) return
    const key = new Date(p.started_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    monthCounts[key] = (monthCounts[key] ?? 0) + 1
  })
  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - (5 - i))
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  })
  const maxMonthCount = Math.max(...last6Months.map(m => monthCounts[m] ?? 0), 1)

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.bg }}>
      <div className="px-4 pt-8 pb-4 max-w-lg mx-auto w-full">
        <p className="text-[11px] uppercase tracking-[0.3em] mb-1" style={{ color: C.gold + '99' }}>Your Career</p>
        <h1 className="font-display text-3xl" style={{ color: C.text }}>Stats</h1>
      </div>

      {totalShows === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 pb-20">
          <Music2 size={40} className="mb-4 opacity-20" style={{ color: C.secondary }} />
          <p className="text-sm" style={{ color: C.secondary }}>No completed shows yet</p>
          <p className="text-xs mt-1" style={{ color: C.muted }}>Complete a show to see your stats</p>
        </div>
      ) : (
        <div className="px-4 max-w-lg mx-auto w-full flex flex-col gap-5 pb-12">

          {/* Top stats grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Calendar, label: 'Shows Played', value: totalShows },
              { icon: Music2, label: 'Songs Logged', value: totalSongs },
              { icon: MapPin, label: 'Cities', value: totalCities },
              { icon: TrendingUp, label: 'Hours on Stage', value: totalHours },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-2xl p-4"
                style={{ background: C.card, border: `1px solid ${C.border}` }}>
                <div className="mb-2" style={{ color: C.gold }}><Icon size={18} /></div>
                <div className="text-3xl font-bold" style={{ color: C.text }}>{value}</div>
                <div className="text-[11px] uppercase tracking-wider mt-0.5" style={{ color: C.muted }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Shows per month */}
          <div className="rounded-2xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}>
            <p className="text-xs uppercase tracking-wider mb-4" style={{ color: C.secondary }}>Shows per Month</p>
            <div className="flex items-end gap-2 h-20">
              {last6Months.map(month => {
                const count = monthCounts[month] ?? 0
                const height = count === 0 ? 4 : Math.max(12, (count / maxMonthCount) * 80)
                return (
                  <div key={month} className="flex-1 flex flex-col items-center gap-1.5">
                    <span className="text-[10px]" style={{ color: count > 0 ? C.text : C.muted }}>{count || ''}</span>
                    <div className="w-full rounded-t-md transition-all"
                      style={{
                        height: `${height}px`,
                        background: count > 0 ? C.gold : 'rgba(255,255,255,0.05)',
                      }} />
                    <span className="text-[9px] uppercase tracking-wide" style={{ color: C.muted }}>
                      {month.split(' ')[0]}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Top songs */}
          {topSongs.length > 0 && (
            <div className="rounded-2xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}>
              <div className="flex items-center gap-2 mb-4">
                <Mic2 size={15} style={{ color: C.gold }} />
                <p className="text-xs uppercase tracking-wider" style={{ color: C.secondary }}>Most Played Songs</p>
              </div>
              <div className="flex flex-col gap-3">
                {topSongs.map((song, i) => (
                  <div key={song.title} className="flex items-center gap-3">
                    <span className="font-mono text-xs w-4 shrink-0 text-right" style={{ color: C.gold }}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm truncate" style={{ color: C.text }}>{song.title}</p>
                          {song.artist && (
                            <p className="text-xs truncate" style={{ color: C.secondary }}>{song.artist}</p>
                          )}
                        </div>
                        <span className="text-xs shrink-0 px-2 py-0.5 rounded-full"
                          style={{ color: C.gold, background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.2)' }}>
                          {song.count}x
                        </span>
                      </div>
                      {/* Play frequency bar */}
                      <div className="mt-1.5 h-0.5 rounded-full w-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <div className="h-full rounded-full" style={{
                          width: `${(song.count / topSongs[0].count) * 100}%`,
                          background: i === 0 ? C.gold : 'rgba(201,168,76,0.4)',
                        }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top venues */}
          {topVenues.length > 0 && (
            <div className="rounded-2xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}>
              <div className="fle
