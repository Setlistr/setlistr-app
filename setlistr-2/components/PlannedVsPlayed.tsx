'use client'

// ─────────────────────────────────────────────────────────────────────────────
// PlannedVsPlayed component
// Drop this at the TOP of the review page, before the song list
//
// Usage:
//   import { PlannedVsPlayed } from '@/components/PlannedVsPlayed'
//   <PlannedVsPlayed performanceId={performance.id} />
//
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check, Plus, Minus } from 'lucide-react'

const C = {
  card: '#141210', border: 'rgba(255,255,255,0.07)',
  borderGold: 'rgba(201,168,76,0.3)', text: '#f0ece3', secondary: '#b8a888',
  muted: '#8a7a68', gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.08)',
  red: '#f87171', redDim: 'rgba(248,113,113,0.06)',
  blue: '#60a5fa', blueDim: 'rgba(96,165,250,0.08)',
}

type SongResult = {
  title: string
  artist: string
  status: 'played_planned' | 'added_live' | 'skipped'
}

type DiffResult = {
  playedPlanned: SongResult[]
  addedLive:     SongResult[]
  skipped:       SongResult[]
}

export function PlannedVsPlayed({ performanceId }: { performanceId: string }) {
  const [diff, setDiff]       = useState<DiffResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasPlan, setHasPlan] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      // Check if there's a planned setlist for this performance
      const { data: planned } = await supabase
        .from('planned_setlists')
        .select('id')
        .eq('performance_id', performanceId)
        .single()

      if (!planned) {
        setHasPlan(false)
        setLoading(false)
        return
      }

      setHasPlan(true)

      // Get planned songs
      const { data: plannedSongs } = await supabase
        .from('planned_setlist_songs')
        .select('title, artist')
        .eq('planned_setlist_id', planned.id)
        .order('position')

      // Get actual performance songs
      const { data: actualSongs } = await supabase
        .from('performance_songs')
        .select('title, artist, was_planned')
        .eq('performance_id', performanceId)
        .order('position')

      if (!plannedSongs || !actualSongs) { setLoading(false); return }

      const plannedTitles = new Set(plannedSongs.map(s => s.title.toLowerCase()))
      const actualTitles  = new Set(actualSongs.map(s => s.title.toLowerCase()))

      const playedPlanned: SongResult[] = actualSongs
        .filter(s => plannedTitles.has(s.title.toLowerCase()))
        .map(s => ({ title: s.title, artist: s.artist || '', status: 'played_planned' as const }))

      const addedLive: SongResult[] = actualSongs
        .filter(s => !plannedTitles.has(s.title.toLowerCase()))
        .map(s => ({ title: s.title, artist: s.artist || '', status: 'added_live' as const }))

      const skipped: SongResult[] = plannedSongs
        .filter(s => !actualTitles.has(s.title.toLowerCase()))
        .map(s => ({ title: s.title, artist: s.artist || '', status: 'skipped' as const }))

      setDiff({ playedPlanned, addedLive, skipped })
      setLoading(false)
    }
    load()
  }, [performanceId])

  // Don't render if no planned setlist
  if (!loading && !hasPlan) return null
  if (loading) return null

  const { playedPlanned = [], addedLive = [], skipped = [] } = diff || {}
  const total = playedPlanned.length + addedLive.length

  // The headline — the dopamine moment
  const allPlanned  = skipped.length === 0 && addedLive.length === 0
  const mostPlanned = playedPlanned.length >= (playedPlanned.length + skipped.length) * 0.8

  function Headline() {
    if (allPlanned && total > 0) {
      return (
        <div style={{ textAlign: 'center', padding: '4px 0 16px' }}>
          <p style={{ fontSize: 22, fontWeight: 800, color: C.green, margin: '0 0 4px', letterSpacing: '-0.02em' }}>You nailed it. 🎯</p>
          <p style={{ fontSize: 13, color: C.secondary, margin: 0 }}>
            All {total} planned songs played
          </p>
        </div>
      )
    }
    if (mostPlanned && total > 0) {
      return (
        <div style={{ textAlign: 'center', padding: '4px 0 16px' }}>
          <p style={{ fontSize: 20, fontWeight: 800, color: C.gold, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
            {playedPlanned.length} of {playedPlanned.length + skipped.length} planned
            {addedLive.length > 0 ? ` · ${addedLive.length} surprise${addedLive.length > 1 ? 's' : ''}` : ''}
          </p>
          <p style={{ fontSize: 13, color: C.secondary, margin: 0 }}>Great show</p>
        </div>
      )
    }
    return (
      <div style={{ textAlign: 'center', padding: '4px 0 16px' }}>
        <p style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
          {playedPlanned.length} planned · {addedLive.length} added · {skipped.length} skipped
        </p>
      </div>
    )
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', marginBottom: 20, fontFamily: '"DM Sans", system-ui, sans-serif' }}>

      {/* Label */}
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: C.muted, margin: '0 0 12px' }}>
        Planned vs Played
      </p>

      <Headline />

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: playedPlanned.length + addedLive.length + skipped.length > 0 ? 16 : 0 }}>
        {[
          { label: 'Played', count: playedPlanned.length, color: C.green, bg: C.greenDim, border: 'rgba(74,222,128,0.2)' },
          { label: 'Added Live', count: addedLive.length, color: C.blue, bg: C.blueDim, border: 'rgba(96,165,250,0.2)' },
          { label: 'Skipped', count: skipped.length, color: skipped.length > 0 ? C.red : C.muted, bg: skipped.length > 0 ? C.redDim : 'transparent', border: skipped.length > 0 ? 'rgba(248,113,113,0.2)' : C.border },
        ].map(({ label, count, color, bg, border }) => (
          <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
            <p style={{ fontSize: 22, fontWeight: 800, color, margin: '0 0 2px', fontFamily: '"DM Mono", monospace', letterSpacing: '-0.02em' }}>{count}</p>
            <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, margin: 0, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Song breakdown — collapsible detail */}
      {(playedPlanned.length + addedLive.length + skipped.length) > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>

          {/* Played as planned */}
          {playedPlanned.map((song, i) => (
            <div key={`played-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: C.greenDim, border: '1px solid rgba(74,222,128,0.12)', borderRadius: 8 }}>
              <Check size={12} color={C.green} strokeWidth={2.5} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.title}</span>
              <span style={{ fontSize: 10, color: C.green, fontWeight: 700, flexShrink: 0 }}>Planned</span>
            </div>
          ))}

          {/* Added live */}
          {addedLive.map((song, i) => (
            <div key={`live-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: C.blueDim, border: '1px solid rgba(96,165,250,0.12)', borderRadius: 8 }}>
              <Plus size={12} color={C.blue} strokeWidth={2.5} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.title}</span>
              <span style={{ fontSize: 10, color: C.blue, fontWeight: 700, flexShrink: 0 }}>Added Live</span>
            </div>
          ))}

          {/* Skipped */}
          {skipped.map((song, i) => (
            <div key={`skip-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 8, opacity: 0.6 }}>
              <Minus size={12} color={C.muted} strokeWidth={2.5} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: C.muted, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'line-through' }}>{song.title}</span>
              <span style={{ fontSize: 10, color: C.muted, fontWeight: 700, flexShrink: 0 }}>Skipped</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
