'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MapPin, Clock, Music2, Download, ChevronRight, Plus } from 'lucide-react'

const C = {
  bg: '#0a0908',
  card: '#141210',
  border: 'rgba(255,255,255,0.07)',
  text: '#f0ece3',
  secondary: '#a09070',
  muted: '#6a6050',
  gold: '#c9a84c',
}

type Performance = {
  id: string
  artist_name: string
  venue_name: string
  city: string
  country: string
  started_at: string
  ended_at: string
  status: string
  set_duration_minutes: number
}

type PerformanceWithSongs = Performance & { song_count: number }

export default function HistoryPage() {
  const router = useRouter()
  const [performances, setPerformances] = useState<PerformanceWithSongs[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('performances')
      .select('*, performance_songs(count)')
      .order('started_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          setPerformances(data.map((p: any) => ({
            ...p,
            song_count: p.performance_songs?.[0]?.count || 0,
          })))
        }
        setLoading(false)
      })
  }, [])

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    })
  }

  function formatDuration(p: Performance) {
    if (!p.started_at || !p.ended_at) return `${p.set_duration_minutes}min`
    const mins = Math.round((new Date(p.ended_at).getTime() - new Date(p.started_at).getTime()) / 60000)
    return `${mins}min`
  }

  const statusMap: Record<string, { label: string; color: string; bg: string; border: string }> = {
    completed: { label: 'Completed', color: '#4ade80', bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.2)' },
    review:    { label: 'Review',    color: C.gold,    bg: 'rgba(201,168,76,0.1)', border: 'rgba(201,168,76,0.2)' },
    live:      { label: 'Live',      color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)' },
    pending:   { label: 'Pending',   color: C.secondary, bg: 'rgba(160,144,112,0.1)', border: 'rgba(160,144,112,0.15)' },
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }}>
        <div className="animate-pulse" style={{ color: C.gold }}>Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.bg }}>
      <div className="px-4 pt-8 pb-6 max-w-lg mx-auto w-full">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: C.gold }} />
            <span className="text-[11px] uppercase tracking-[0.3em] font-medium" style={{ color: C.gold + '99' }}>
              Performance History
            </span>
          </div>
          <button
            onClick={() => router.push('/app/performances/new')}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: C.gold, color: '#0a0908' }}
          >
            <Plus size={13} />
            New Show
          </button>
        </div>
        <h1 className="font-display text-3xl" style={{ color: C.text }}>Past Shows</h1>
        <p className="text-sm mt-1" style={{ color: C.secondary }}>
          {performances.length} performance{performances.length !== 1 ? 's' : ''} recorded
        </p>
      </div>

      <div className="px-4 max-w-lg mx-auto w-full flex flex-col gap-3 pb-12">
        {performances.length === 0 ? (
          <div className="text-center py-20">
            <Music2 size={40} className="mx-auto mb-4 opacity-20" style={{ color: C.secondary }} />
            <p className="text-sm" style={{ color: C.secondary }}>No performances yet</p>
            <p className="text-xs mt-1 mb-6" style={{ color: C.muted }}>Start your first show to see it here</p>
            <button
              onClick={() => router.push('/app/performances/new')}
              className="font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors"
              style={{ background: C.gold, color: '#0a0908' }}
            >
              Start First Show
            </button>
          </div>
        ) : (
          performances.map(p => {
            const s = statusMap[p.status] || statusMap.pending
            return (
              <div
                key={p.id}
                className="rounded-2xl p-4 cursor-pointer transition-all group"
                style={{ background: C.card, border: `1px solid ${C.border}` }}
                onClick={() => router.push(`/app/review/${p.id}`)}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate transition-colors" style={{ color: C.text }}>
                      {p.venue_name}
                    </h3>
                    <div className="flex items-center gap-1 text-xs mt-0.5" style={{ color: C.secondary }}>
                      <MapPin size={11} />
                      <span>{p.city}, {p.country}</span>
                    </div>
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full shrink-0 font-medium"
                    style={{ color: s.color, background: s.bg, border: `1px solid ${s.border}` }}
                  >
                    {s.label}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs" style={{ color: C.secondary }}>
                    <span>{p.started_at ? formatDate(p.started_at) : '—'}</span>
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {formatDuration(p)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Music2 size={11} />
                      {p.song_count} song{p.song_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={e => { e.stopPropagation(); router.push(`/app/review/${p.id}`) }}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: C.muted }}
                    >
                      <Download size={14} />
                    </button>
                    <ChevronRight size={16} style={{ color: C.muted }} />
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
