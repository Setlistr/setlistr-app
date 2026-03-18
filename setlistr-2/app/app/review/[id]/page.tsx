'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2, Download, Check, Pencil, X, Music2, MapPin, Calendar, RefreshCw } from 'lucide-react'

const C = {
  bg: '#0a0908', card: '#141210', cardHover: '#181614',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#a09070', muted: '#6a6050',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)', green: '#4ade80', red: '#dc2626',
}

// ── Song type now includes enriched fields ────────────────────────────────────
type Song = {
  id: string
  title: string
  artist: string
  position: number
  source?: string
  recognition_decision_id?: string | null
  isrc?: string
  composer?: string
  publisher?: string
}

type Performance = {
  id: string
  artist_name: string
  venue_name: string
  city: string
  country: string
  started_at: string
  ended_at: string
  set_duration_minutes: number
  setlist_id?: string | null
  show_id?: string | null
}

type PRO = 'SOCAN' | 'ASCAP' | 'BMI'

// ─── Sortable Song Row ────────────────────────────────────────────────────────

function SortableRow({ song, index, onDelete, onEdit, artistName }: {
  song: Song
  index: number
  onDelete: (id: string) => void
  onEdit: (id: string, title: string, artist: string) => void
  artistName: string
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: song.id })
  const [mode, setMode] = useState<'view' | 'edit' | 'swap'>('view')
  const [editTitle, setEditTitle] = useState(song.title)
  const [editArtist, setEditArtist] = useState(song.artist)
  const [swapQuery, setSwapQuery] = useState('')
  const [swapArtist, setSwapArtist] = useState('')

  const style = { transform: CSS.Transform.toString(transform), transition }

  function saveEdit() {
    if (editTitle.trim()) { onEdit(song.id, editTitle.trim(), editArtist.trim()); setMode('view') }
  }
  function saveSwap() {
    if (swapQuery.trim()) {
      onEdit(song.id, swapQuery.trim(), swapArtist.trim())
      setMode('view'); setSwapQuery(''); setSwapArtist('')
    }
  }

  const isAuto = song.source === 'recognized' || song.source === 'detected'

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        opacity: isDragging ? 0.4 : 1,
        background: isDragging ? C.cardHover : C.card,
        border: `1px solid ${isDragging ? C.gold + '50' : mode !== 'view' ? C.borderGold : isAuto ? 'rgba(201,168,76,0.12)' : C.border}`,
        borderRadius: 12,
        padding: mode !== 'view' ? '12px 14px' : '0',
        transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
        boxShadow: isDragging ? `0 8px 32px rgba(0,0,0,0.5)` : 'none',
        animation: 'rowIn 0.2s ease',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: mode !== 'view' ? '0 0 10px' : '10px 12px',
        borderBottom: mode !== 'view' ? `1px solid ${C.border}` : 'none',
      }}>
        <button {...attributes} {...listeners} style={{ color: C.muted, cursor: 'grab', flexShrink: 0, display: 'flex', alignItems: 'center', padding: '2px', touchAction: 'none' }}>
          <GripVertical size={14} />
        </button>

        <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, minWidth: 16, textAlign: 'right', flexShrink: 0, fontFamily: '"DM Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>
          {index + 1}
        </span>

        {mode === 'edit' ? (
          <div style={{ flex: 1, display: 'flex', gap: 8 }}>
            <input autoFocus value={editTitle} onChange={e => setEditTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveEdit()} placeholder="Song title"
              style={{ flex: 1, background: C.input, border: `1px solid ${C.gold}`, borderRadius: 8, padding: '7px 10px', color: C.text, fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
            <input value={editArtist} onChange={e => setEditArtist(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveEdit()} placeholder="Artist"
              style={{ width: 110, background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 10px', color: C.text, fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
            <button onClick={saveEdit} style={{ color: C.gold, flexShrink: 0 }}><Check size={15} /></button>
            <button onClick={() => setMode('view')} style={{ color: C.muted, flexShrink: 0 }}><X size={15} /></button>
          </div>
        ) : (
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {song.title}
            </p>
            {song.artist && song.artist !== artistName && (
              <p style={{ fontSize: 11, color: C.secondary, margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {song.artist}
              </p>
            )}
            {/* Show ISRC if available */}
            {song.isrc && (
              <p style={{ fontSize: 10, color: C.muted, margin: '2px 0 0', fontFamily: '"DM Mono", monospace', letterSpacing: '0.04em' }}>
                {song.isrc}
              </p>
            )}
          </div>
        )}

        {mode === 'view' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            {isAuto && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: C.gold, opacity: 0.55, marginRight: 4, textTransform: 'uppercase' }}>⚡</span>}
            <button onClick={() => setMode('swap')} title="Wrong song?"
              style={{ color: C.muted, padding: '5px', borderRadius: 6, display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = C.secondary}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = C.muted}>
              <RefreshCw size={12} />
            </button>
            <button onClick={() => { setEditTitle(song.title); setEditArtist(song.artist); setMode('edit') }}
              style={{ color: C.muted, padding: '5px', borderRadius: 6, display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = C.secondary}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = C.muted}>
              <Pencil size={12} />
            </button>
            <button onClick={() => onDelete(song.id)}
              style={{ color: C.muted, padding: '5px', borderRadius: 6, display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = C.red}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = C.muted}>
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {mode === 'swap' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.gold, margin: 0 }}>
            Replace "{song.title}" with:
          </p>
          <input autoFocus value={swapQuery} onChange={e => setSwapQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveSwap()} placeholder="Correct song title"
            style={{ background: C.input, border: `1px solid ${C.gold}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
          <input value={swapArtist} onChange={e => setSwapArtist(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveSwap()} placeholder="Artist (optional)"
            style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={saveSwap} style={{ flex: 1, background: C.gold, border: 'none', borderRadius: 8, padding: '9px', color: '#0a0908', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}>
              Swap
            </button>
            <button onClick={() => setMode('view')} style={{ padding: '9px 16px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 8, color: C.secondary, fontSize: 12, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReviewPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [performance, setPerformance] = useState<Performance | null>(null)
  const [setlistId, setSetlistId]     = useState<string | null>(null)
  const [songs, setSongs]             = useState<Song[]>([])
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [showComplete, setShowComplete] = useState(false)
  const [newTitle, setNewTitle]       = useState('')
  const [newArtist, setNewArtist]     = useState('')
  const [showAdd, setShowAdd]         = useState(false)
  const [selectedPRO, setSelectedPRO] = useState<PRO>('SOCAN')
  const [showExport, setShowExport]   = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    const supabase = createClient()
    supabase.from('performances')
      .select('*')
      .eq('id', params.id)
      .single()
      .then(async ({ data: perf }) => {
        if (!perf) { setLoading(false); return }
        setPerformance(perf)
        const resolvedSetlistId = perf.setlist_id || null
        setSetlistId(resolvedSetlistId)

        if (resolvedSetlistId) {
          const { data: items } = await supabase
            .from('setlist_items').select('*')
            .eq('setlist_id', resolvedSetlistId).order('position')
          if (items && items.length > 0) {
            setSongs(items.map(s => ({
              id: s.id, title: s.title, artist: s.artist_name || '',
              position: s.position, source: s.source,
              recognition_decision_id: s.recognition_decision_id,
              isrc: s.isrc || '', composer: s.composer || '', publisher: s.publisher || '',
            })))
            setLoading(false); return
          }
        }

        // ── Fallback: performance_songs — now includes isrc, composer, publisher ──
        const { data: songData } = await supabase
          .from('performance_songs').select('*')
          .eq('performance_id', params.id).order('position')
        if (songData) {
          setSongs(songData.map(s => ({
            id: s.id || String(s.position),
            title: s.title,
            artist: s.artist || '',
            position: s.position,
            source: s.source || 'recognized',
            recognition_decision_id: null,
            isrc: s.isrc || '',
            composer: s.composer || '',
            publisher: s.publisher || '',
          })))
        }
        setLoading(false)
      })
  }, [params.id])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setSongs(items => {
        const oldIndex = items.findIndex(i => i.id === active.id)
        const newIndex = items.findIndex(i => i.id === over.id)
        return arrayMove(items, oldIndex, newIndex).map((s, i) => ({ ...s, position: i + 1 }))
      })
    }
  }

  function handleDelete(id: string) {
    setSongs(prev => prev.filter(s => s.id !== id).map((s, i) => ({ ...s, position: i + 1 })))
  }

  function handleEdit(id: string, title: string, artist: string) {
    setSongs(prev => prev.map(s => s.id === id ? { ...s, title, artist } : s))
  }

  function handleAdd() {
    if (!newTitle.trim()) return
    setSongs(prev => [...prev, {
      id: `manual-${Date.now()}`,
      title: newTitle.trim(),
      artist: newArtist.trim() || (performance?.artist_name || ''),
      position: songs.length + 1,
      source: 'manual',
      recognition_decision_id: null,
      isrc: '', composer: '', publisher: '',
    }])
    setNewTitle(''); setNewArtist(''); setShowAdd(false)
  }

  const handleSave = useCallback(async () => {
    if (!performance) return
    setSaving(true)
    const supabase = createClient()

    if (setlistId) {
      await supabase.from('setlist_items').delete().eq('setlist_id', setlistId)
      await supabase.from('setlist_items').insert(
        songs.map((s, i) => ({
          setlist_id: setlistId, title: s.title, artist_name: s.artist,
          position: i + 1, source: s.source || 'manual',
          recognition_decision_id: s.recognition_decision_id || null,
        }))
      )

      for (const song of songs) {
        if (song.recognition_decision_id) {
          const { data: orig } = await supabase.from('recognition_decisions')
            .select('final_title, final_artist, job_id').eq('id', song.recognition_decision_id).single()
          if (orig && (orig.final_title !== song.title || orig.final_artist !== song.artist)) {
            const { data: newD } = await supabase.from('recognition_decisions').insert({
              job_id: orig.job_id, decision_type: 'manual_override',
              final_title: song.title, final_artist: song.artist,
              notes: `Corrected from: ${orig.final_title} by ${orig.final_artist}`,
              decided_at: new Date().toISOString(),
            }).select().single()
            if (newD) {
              await supabase.from('setlist_items')
                .update({ recognition_decision_id: newD.id })
                .eq('setlist_id', setlistId).eq('title', song.title)
            }
          }
        }
      }

      await supabase.from('setlists').update({
        status: 'confirmed', confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', setlistId)
    }

    await supabase.from('performance_songs').delete().eq('performance_id', performance.id)
    await supabase.from('performance_songs').insert(
      songs.map((s, i) => ({
        performance_id: performance.id,
        title: s.title,
        artist: s.artist,
        position: i + 1,
        isrc: s.isrc || null,
        composer: s.composer || null,
        publisher: s.publisher || null,
      }))
    )
    await supabase.from('performances').update({ status: 'completed' }).eq('id', performance.id)
    if (performance.show_id) {
      await supabase.from('shows').update({ status: 'completed' }).eq('id', performance.show_id)
    }

    setSaving(false); setSaved(true); setShowComplete(true)
  }, [performance, songs, setlistId])

  // ── CSV export — now includes ISRC and composer ───────────────────────────
  function generateExportCSV(pro: PRO) {
    if (!performance) return
    const date = new Date(performance.started_at).toLocaleDateString()

    const headers: Record<PRO, string[]> = {
      SOCAN: ['Title', 'Artist', 'Composer', 'Publisher', 'ISRC', 'Duration', 'Date', 'Venue', 'City'],
      ASCAP: ['Title', 'Performer', 'Composer/Author', 'Publisher', 'ISRC', 'Venue', 'Date', 'City', 'State'],
      BMI:   ['Song Title', 'Artist', 'BMI Work #', 'Composer', 'Publisher', 'Venue Name', 'Date', 'City'],
    }

    const rows = songs.map(s => {
      const composer  = s.composer  || ''
      const publisher = s.publisher || ''
      const isrc      = s.isrc      || ''

      if (pro === 'SOCAN') return [
        s.title, s.artist, composer, publisher, isrc, '', date, performance.venue_name, performance.city,
      ]
      if (pro === 'ASCAP') return [
        s.title, performance.artist_name, composer, publisher, isrc, performance.venue_name, date, performance.city, performance.country || '',
      ]
      // BMI
      return [
        s.title, performance.artist_name, '', composer, publisher, performance.venue_name, date, performance.city,
      ]
    })

    const csv = [headers[pro], ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${pro}-setlist-${performance.venue_name}-${new Date(performance.started_at).toLocaleDateString().replace(/\//g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  }

  function formatDuration() {
    if (!performance?.started_at || !performance?.ended_at) return ''
    const mins = Math.round((new Date(performance.ended_at).getTime() - new Date(performance.started_at).getTime()) / 60000)
    return `${mins} min`
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', border: `1.5px solid ${C.gold}`, animation: 'breathe 1.8s ease-in-out infinite' }} />
          <span style={{ color: C.muted, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Loading</span>
        </div>
        <style>{`@keyframes breathe { 0%,100%{transform:scale(1);opacity:.3} 50%{transform:scale(1.2);opacity:.8} }`}</style>
      </div>
    )
  }

  const autoCount = songs.filter(s => s.source === 'recognized' || s.source === 'detected').length
  const dur = formatDuration()

  if (showComplete) {
    const royaltyLow  = Math.round(songs.length * 1.25 * 0.7)
    const royaltyHigh = Math.round(songs.length * 1.25 * 1.3)

    return (
      <div style={{
        minHeight: '100svh', background: C.bg, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '24px 20px',
        fontFamily: '"DM Sans", system-ui, sans-serif',
      }}>
        {/* Ambient glow — gold for value moment */}
        <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '60vh', pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.08) 0%, transparent 65%)' }} />

        <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', animation: 'fadeUp 0.5s ease' }}>

          {/* Headline */}
          <h1 style={{ fontSize: 30, fontWeight: 800, color: C.text, margin: '0 0 10px', letterSpacing: '-0.03em', lineHeight: 1.15 }}>
            You just tracked<br />a real setlist.
          </h1>
          <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 28px' }}>
            {performance?.venue_name}{performance?.city ? ` · ${performance.city}` : ''}
          </p>

          {/* Royalty value card — the money moment */}
          <div style={{
            width: '100%', background: C.goldDim,
            border: `1px solid ${C.borderGold}`,
            borderRadius: 18, padding: '24px 20px',
            marginBottom: 16, animation: 'fadeUp 0.5s 0.1s ease both',
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold, margin: '0 0 8px' }}>
              Estimated Royalties
            </p>
            <p style={{ fontSize: 42, fontWeight: 800, color: C.gold, margin: '0 0 4px', letterSpacing: '-0.03em', fontFamily: '"DM Mono", monospace' }}>
              ${royaltyLow}–${royaltyHigh}
            </p>
            <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 16px' }}>
              {songs.length} songs · {autoCount > 0 ? `${autoCount} auto-detected` : 'all manual'}
            </p>
            <div style={{ borderTop: `1px solid rgba(201,168,76,0.2)`, paddingTop: 14 }}>
              <p style={{ fontSize: 13, color: C.gold, margin: 0, fontWeight: 600, lineHeight: 1.5 }}>
                Most artists never report this.
              </p>
              <p style={{ fontSize: 12, color: C.secondary, margin: '4px 0 0', lineHeight: 1.5 }}>
                Export your setlist to claim what you've earned.
              </p>
            </div>
          </div>

          {/* Setlist preview */}
          <div style={{ width: '100%', background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px', marginBottom: 16, maxHeight: 200, overflowY: 'auto', animation: 'fadeUp 0.5s 0.15s ease both' }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 12px' }}>Tonight's Setlist</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {songs.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 10, color: C.muted, minWidth: 16, textAlign: 'right', fontFamily: '"DM Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
                  <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                    <p style={{ fontSize: 13, color: C.text, margin: 0, fontWeight: 600 }}>{s.title}</p>
                    {s.artist && s.artist !== performance?.artist_name && (
                      <p style={{ fontSize: 11, color: C.muted, margin: '1px 0 0' }}>{s.artist}</p>
                    )}
                  </div>
                  {(s.source === 'recognized' || s.source === 'detected') && (
                    <span style={{ fontSize: 9, color: C.gold, opacity: 0.5, flexShrink: 0 }}>⚡</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* PRO Export */}
          <div style={{ width: '100%', background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px', marginBottom: 20, animation: 'fadeUp 0.5s 0.2s ease both' }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Download size={10} />
              Export for PRO Submission
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(['SOCAN', 'ASCAP', 'BMI'] as PRO[]).map(pro => (
                <button key={pro} onClick={() => generateExportCSV(pro)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s ease', fontFamily: 'inherit' }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = C.gold + '60'; el.style.color = C.gold; el.style.background = C.goldDim }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = C.border; el.style.color = C.text; el.style.background = 'transparent' }}>
                  <span>{pro}</span>
                  <span style={{ fontSize: 11, color: C.muted }}>{pro === 'SOCAN' ? 'Canada' : 'USA'} · CSV ↓</span>
                </button>
              ))}
            </div>
          </div>

          <button onClick={() => router.push('/app/dashboard')} style={{ width: '100%', padding: '14px', background: C.gold, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', marginBottom: 12, animation: 'fadeUp 0.5s 0.25s ease both' }}>
            Back to Dashboard
          </button>
          <button onClick={() => setShowComplete(false)} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', letterSpacing: '0.04em' }}>
            Back to Review
          </button>
        </div>

        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
          @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        `}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>

      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100vw', height: '40vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.05) 0%, transparent 65%)' }} />

      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 480, width: '100%', margin: '0 auto', padding: '0 16px', boxSizing: 'border-box' }}>

        {/* ── Header ── */}
        <div style={{ paddingTop: 28, paddingBottom: 20, animation: 'fadeUp 0.4s ease' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 20, padding: '4px 10px', marginBottom: 14 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.gold }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold }}>Review Setlist</span>
          </div>

          <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.025em', lineHeight: 1.15 }}>
            {performance?.venue_name}
          </h1>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.secondary }}><MapPin size={11} />{performance?.city}, {performance?.country}</span>
            {performance?.started_at && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.secondary }}><Calendar size={11} />{formatDate(performance.started_at)}</span>}
            {dur && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.secondary }}><Music2 size={11} />{dur}</span>}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            {[
              { label: 'Songs', value: songs.length },
              { label: 'Auto-detected', value: autoCount },
              { label: 'Manual', value: songs.length - autoCount },
            ].map(stat => (
              <div key={stat.label} style={{ flex: 1, padding: '10px 12px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, textAlign: 'center' }}>
                <p style={{ fontSize: 20, fontWeight: 800, color: C.gold, margin: 0, fontFamily: '"DM Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>{stat.value}</p>
                <p style={{ fontSize: 9, color: C.muted, margin: '2px 0 0', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Song list header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, animation: 'fadeUp 0.4s 0.05s ease both' }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted }}>Setlist</span>
          <button onClick={() => setShowAdd(!showAdd)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: showAdd ? C.goldDim : 'transparent', border: `1px solid ${showAdd ? C.borderGold : C.border}`, borderRadius: 20, padding: '5px 10px', color: showAdd ? C.gold : C.muted, fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.06em', transition: 'all 0.15s ease', fontFamily: 'inherit' }}>
            <span style={{ display: 'inline-block', transform: showAdd ? 'rotate(45deg)' : 'rotate(0)', transition: 'transform 0.2s ease', fontSize: 14, lineHeight: 1 }}>+</span>
            Add Song
          </button>
        </div>

        {/* ── Add song panel ── */}
        {showAdd && (
          <div style={{ background: C.card, border: `1px solid ${C.borderGold}`, borderRadius: 12, padding: 14, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8, animation: 'slideUp 0.2s ease' }}>
            <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} placeholder="Song title"
              style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', color: C.text, fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
            <input value={newArtist} onChange={e => setNewArtist(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} placeholder={`Artist (default: ${performance?.artist_name})`}
              style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', color: C.text, fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleAdd} disabled={!newTitle.trim()} style={{ flex: 1, background: newTitle.trim() ? C.gold : C.muted, border: 'none', borderRadius: 8, padding: '10px', color: '#0a0908', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: newTitle.trim() ? 'pointer' : 'not-allowed', opacity: newTitle.trim() ? 1 : 0.4, fontFamily: 'inherit' }}>Add</button>
              <button onClick={() => setShowAdd(false)} style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 8, color: C.secondary, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {songs.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', animation: 'fadeUp 0.4s ease' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.card, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Music2 size={22} color={C.muted} />
            </div>
            <p style={{ fontSize: 14, color: C.secondary, margin: 0 }}>No songs detected</p>
            <p style={{ fontSize: 12, color: C.muted, margin: '4px 0 0' }}>Add songs manually above</p>
          </div>
        )}

        {/* ── DnD Song list ── */}
        {songs.length > 0 && (
          <div style={{ animation: 'fadeUp 0.4s 0.1s ease both' }}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={songs.map(s => s.id)} strategy={verticalListSortingStrategy}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {songs.map((song, index) => (
                    <SortableRow key={song.id} song={song} index={index} onDelete={handleDelete} onEdit={handleEdit} artistName={performance?.artist_name || ''} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}

        {/* ── Export accordion ── */}
        <div style={{ marginTop: 20, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', animation: 'fadeUp 0.4s 0.15s ease both' }}>
          <button onClick={() => setShowExport(!showExport)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: C.text }}>
              <Download size={14} color={C.gold} />
              Export for PRO Submission
            </span>
            <span style={{ fontSize: 10, color: C.muted, transform: showExport ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s ease', display: 'inline-block' }}>▼</span>
          </button>

          {showExport && (
            <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${C.border}`, animation: 'slideUp 0.15s ease' }}>
              <p style={{ fontSize: 11, color: C.muted, margin: '12px 0 10px' }}>Select your PRO to download a formatted CSV:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(['SOCAN', 'ASCAP', 'BMI'] as PRO[]).map(pro => (
                  <button key={pro} onClick={() => generateExportCSV(pro)} onMouseEnter={() => setSelectedPRO(pro)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', background: selectedPRO === pro ? C.goldDim : 'transparent', border: `1px solid ${selectedPRO === pro ? C.borderGold : C.border}`, borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s ease', fontFamily: 'inherit' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: selectedPRO === pro ? C.gold : C.text }}>{pro}</span>
                    <span style={{ fontSize: 11, color: C.muted }}>{pro === 'SOCAN' ? 'Canada' : 'USA'} · CSV ↓</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Save CTA ── */}
        <div style={{ paddingTop: 14, paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 10, animation: 'fadeUp 0.4s 0.2s ease both' }}>
          <button onClick={handleSave} disabled={saving || saved}
            style={{ width: '100%', padding: '15px', background: saved ? '#16a34a' : C.gold, border: 'none', borderRadius: 12, color: saved ? '#fff' : '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: saving || saved ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, transition: 'all 0.25s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
            {saved ? <><Check size={16} strokeWidth={2.5} /> Saved</> : saving ? (
              <><div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid #0a090840`, borderTopColor: '#0a0908', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />Saving...</>
            ) : 'Save & Complete'}
          </button>

          <button onClick={() => router.push('/app/dashboard')} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', letterSpacing: '0.04em', fontFamily: 'inherit', padding: '6px' }}>
            Back to Dashboard
          </button>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(6px)}  to{opacity:1;transform:translateY(0)} }
        @keyframes rowIn   { from{opacity:0;transform:translateY(4px)}  to{opacity:1;transform:translateY(0)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        * { -webkit-tap-highlight-color: transparent; }
        input::placeholder { color: #6a6050; }
        input:focus { border-color: rgba(201,168,76,0.4) !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
      `}</style>
    </div>
  )
}
