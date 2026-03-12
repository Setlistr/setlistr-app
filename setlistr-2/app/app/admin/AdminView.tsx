'use client'
import { useState } from 'react'
import { Activity, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react'

const C = {
  bg: '#0a0908',
  card: '#141210',
  border: 'rgba(255,255,255,0.07)',
  text: '#f0ece3',
  secondary: '#a09070',
  muted: '#6a6050',
  gold: '#c9a84c',
}

type Log = {
  id: string
  created_at: string
  detected: boolean
  title: string | null
  artist: string | null
  score: number | null
  source: string | null
  acr_status_code: number | null
  acr_message: string | null
  audio_bytes: number | null
  duration_seconds: number | null
  raw_response: any
  performances: {
    venue_name: string
    city: string
    artist_name: string
  } | null
}

type Stats = {
  total: number
  hits: number
  misses: number
  hitRate: number
  avgScore: number
}

export default function AdminView({ logs, stats }: { logs: Log[]; stats: Stats }) {
  const [filter, setFilter] = useState<'all' | 'hits' | 'misses'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered = logs.filter(l => {
    if (filter === 'hits') return l.detected
    if (filter === 'misses') return !l.detected
    return true
  })

  return (
    <div className="min-h-screen flex flex-col" style={{ background: C.bg }}>
      <div className="px-4 pt-8 pb-4 max-w-2xl mx-auto w-full">
        <p className="text-[11px] uppercase tracking-[0.3em] mb-1" style={{ color: C.gold + '99' }}>
          Admin
        </p>
        <h1 className="font-display text-3xl mb-6" style={{ color: C.text }}>
          Recognition Logs
        </h1>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4">
          {[
            { label: 'Total Attempts', value: stats.total },
            { label: 'Detected', value: stats.hits, color: '#4ade80' },
            { label: 'Missed', value: stats.misses, color: '#f87171' },
            { label: 'Hit Rate', value: `${stats.hitRate}%`, color: stats.hitRate >= 60 ? '#4ade80' : stats.hitRate >= 30 ? C.gold : '#f87171' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-2xl p-4"
              style={{ background: C.card, border: `1px solid ${C.border}` }}>
              <div className="text-2xl font-bold mb-1" style={{ color: color ?? C.text }}>{value}</div>
              <div className="text-[11px] uppercase tracking-wider" style={{ color: C.muted }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Avg score */}
        {stats.avgScore > 0 && (
          <div className="rounded-2xl px-4 py-3 mb-6 flex items-center gap-3"
            style={{ background: C.card, border: `1px solid ${C.border}` }}>
            <Activity size={16} style={{ color: C.gold }} />
            <span className="text-sm" style={{ color: C.secondary }}>
              Avg confidence score: <span style={{ color: C.text, fontWeight: 600 }}>{stats.avgScore}</span>
            </span>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-2 mb-4">
          {(['all', 'hits', 'misses'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-4 py-1.5 rounded-full text-xs font-medium uppercase tracking-wider transition-all"
              style={{
                background: filter === f ? C.gold : C.card,
                color: filter === f ? '#0a0908' : C.secondary,
                border: `1px solid ${filter === f ? C.gold : C.border}`,
              }}>
              {f === 'all' ? `All (${stats.total})` : f === 'hits' ? `Detected (${stats.hits})` : `Missed (${stats.misses})`}
            </button>
          ))}
        </div>

        {/* Log list */}
        <div className="flex flex-col gap-2 pb-12">
          {filtered.length === 0 && (
            <div className="text-center py-12" style={{ color: C.muted }}>
              No logs yet
            </div>
          )}
          {filtered.map(log => (
            <div key={log.id} className="rounded-xl overflow-hidden"
              style={{ background: C.card, border: `1px solid ${C.border}` }}>

              {/* Main row */}
              <div className="px-4 py-3 flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {log.detected
                    ? <CheckCircle size={16} style={{ color: '#4ade80' }} />
                    : <XCircle size={16} style={{ color: '#f87171' }} />}
                </div>

                <div className="flex-1 min-w-0">
                  {log.detected ? (
                    <div>
                      <p className="font-medium text-sm" style={{ color: C.text }}>{log.title}</p>
                      <p className="text-xs" style={{ color: C.secondary }}>{log.artist}</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm" style={{ color: '#f87171' }}>No match</p>
                      <p className="text-xs" style={{ color: C.muted }}>
                        {log.acr_message ?? 'Unknown error'}
                        {log.acr_status_code ? ` (${log.acr_status_code})` : ''}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3 mt-1.5 text-xs" style={{ color: C.muted }}>
                    {log.performances?.venue_name && (
                      <span>📍 {log.performances.venue_name}, {log.performances.city}</span>
                    )}
                    {log.score && <span>Score: {log.score}</span>}
                    {log.source && <span>via {log.source}</span>}
                    {log.audio_bytes && <span>{Math.round(log.audio_bytes / 1024)}kb</span>}
                    {log.duration_seconds && <span>{log.duration_seconds}s</span>}
                    <span>{new Date(log.created_at).toLocaleString()}</span>
                  </div>
                </div>

                <button
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  className="shrink-0 p-1 rounded transition-colors"
                  style={{ color: C.muted }}>
                  {expandedId === log.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>

              {/* Raw response */}
              {expandedId === log.id && (
                <div className="px-4 pb-4 border-t" style={{ borderColor: C.border }}>
                  <p className="text-[10px] uppercase tracking-wider mb-2 mt-3" style={{ color: C.muted }}>
                    Raw ACRCloud Response
                  </p>
                  <pre className="text-xs rounded-lg p-3 overflow-x-auto"
                    style={{ background: '#0a0908', color: '#a09070', maxHeight: '200px' }}>
                    {JSON.stringify(log.raw_response, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
