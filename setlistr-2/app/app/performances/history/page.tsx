'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MapPin, Clock, Music2, Download, ChevronRight, Plus } from 'lucide-react'

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

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  completed: { label: 'Completed', color: 'text-green-400 bg-green-400/10 border-green-400/20' },
  review: { label: 'Review', color: 'text-gold bg-gold/10 border-gold/20' },
  live: { label: 'Live', color: 'text-red-400 bg-red-400/10 border-red-400/20' },
  pending: { label: 'Pending', color: 'text-[#6a6660] bg-[#2a2620] border-[#3e3b36]' },
}

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

  if (loading) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <div className="text-gold animate-pulse">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-cream flex flex-col"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #1e1c18 0%, #0f0e0c 100%)' }}>

      <div className="px-4 pt-8 pb-6 max-w-lg mx-auto w-full">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-gold" />
            <span className="text-xs uppercase tracking-[0.3em] text-gold/60 font-medium">Performance History</span>
          </div>
          <button
            onClick={() => router.push('/app/performances/new')}
            className="flex items-center gap-1.5 bg-gold text-ink text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-yellow-400 transition-colors"
          >
            <Plus size={13} />
            New Show
          </button>
        </div>
        <h1 className="font-display text-3xl text-cream">Past Shows</h1>
        <p className="text-sm text-[#6a6660] mt-1">{performances.length} performance{performances.length !== 1 ? 's' : ''} recorded</p>
      </div>

      <div className="px-4 max-w-lg mx-auto w-full flex flex-col gap-3 pb-12">
        {performances.length === 0 ? (
          <div className="text-center py-20 text-[#4a4640]">
            <Music2 size={40} className="mx-auto mb-4 opacity-20" />
            <p className="text-sm">No performances yet</p>
            <p className="text-xs mt-1 mb-6">Start your first show to see it here</p>
            <button
              onClick={() => router.push('/app/performances/new')}
              className="bg-gold text-ink font-semibold px-6 py-2.5 rounded-xl text-sm hover:bg-yellow-400 transition-colors"
            >
              Start First Show
            </button>
          </div>
        ) : (
          performances.map(p => {
            const status = STATUS_STYLES[p.status] || STATUS_STYLES.pending
            return (
              <div
                key={p.id}
                className="bg-[#1a1814] border border-[#2e2b26] rounded-2xl p-4 hover:border-[#3e3b36] transition-all cursor-pointer group"
                onClick={() => router.push(`/app/review/${p.id}`)}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-cream font-semibold truncate group-hover:text-gold transition-colors">
                      {p.venue_name}
                    </h3>
                    <div className="flex items-center gap-1 text-[#6a6660] text-xs mt-0.5">
                      <MapPin size={11} />
                      <span>{p.city}, {p.country}</span>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${status.color}`}>
                    {status.label}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs text-[#6a6660]">
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
                      className="p-1.5 text-[#4a4640] hover:text-gold rounded-lg hover:bg-[#2a2620] transition-colors"
                      title="Export setlist"
                    >
                      <Download size={14} />
                    </button>
                    <ChevronRight size={16} className="text-[#3e3b36] group-hover:text-gold transition-colors" />
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
