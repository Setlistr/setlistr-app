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
import { GripVertical, Trash2, Plus, Download, Check, Pencil, X, Music2, MapPin, Calendar, RefreshCw } from 'lucide-react'

const C = {
  bg: '#0a0908',
  card: '#141210',
  border: 'rgba(255,255,255,0.07)',
  input: '#0f0e0c',
  text: '#f0ece3',
  secondary: '#a09070',
  muted: '#6a6050',
  gold: '#c9a84c',
}

type Song = {
  id: string
  title: string
  artist: string
  position: number
  source?: string
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
}

type PRO = 'SOCAN' | 'ASCAP' | 'BMI'

function SortableRow({ song, index, onDelete, onEdit }: {
  song: Song
  index: number
  onDelete: (id: string) => void
  onEdit: (id: string, title: string, artist: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: song.id })
  const [mode, setMode] = useState<'view' | 'edit' | 'swap'>('view')
  const [editTitle, setEditTitle] = useState(song.title)
  const [editArtist, setEditArtist] = useState(song.artist)
  const [swapQuery, setSwapQuery] = useState('')
  const [swapArtist, setSwapArtist] = useState('')

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  function saveEdit() {
    if (editTitle.trim()) {
      onEdit(song.id, editTitle.trim(), editArtist.trim())
      setMode('view')
    }
  }

  function saveSwap() {
    if (swapQuery.trim()) {
      onEdit(song.id, swapQuery.trim(), swapArtist.trim())
      setMode('view')
      setSwapQuery('')
      setSwapArtist('')
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: isDragging ? '#1e1c18' : C.card,
        border: `1px solid ${isDragging ? C.gold : mode !== 'view' ? C.gold + '60' : C.border}`,
      }}
      className="flex flex-col p-3 rounded-xl transition-all"
    >
      <div className="flex items-center gap-3">
        <button {...attributes} {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none shrink-0"
          style={{ color: C.muted }}>
          <GripVertical size={16} />
        </button>

        <span className="font-mono text-xs w-5 text-right shrink-0" style={{ color: C.gold }}>
          {index + 1}
        </span>

        {mode === 'edit' ? (
          <div className="flex-1 flex gap-2">
            <input autoFocus value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveEdit()}
              placeholder="Song title"
              className="flex-1 rounded-lg px-2 py-1 text-sm focus:outline-none"
              style={{ background: C.input, border: `1px solid ${C.gold}`, color: C.text }}
            />
            <input value={editArtist}
              onChange={e => setEditArtist(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveEdit()}
              placeholder="Artist"
              className="w-28 rounded-lg px-2 py-1 text-sm focus:outline-none"
              style={{ background: C.input, border: `1px solid ${C.border}`, color: C.text }}
            />
            <button onClick={saveEdit} style={{ color: C.gold }}><Check size={16} /></button>
            <button onClick={() => setMode('view')} style={{ color: C.muted }}><X size={16} /></button>
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate" style={{ color: C.text }}>{song.title}</p>
            {song.artist && (
              <p className="text-xs truncate" style={{ color: C.secondary }}>{song.artist}</p>
            )}
          </div>
        )}

        {mode === 'view' && (
          <div className="flex items-center gap-1 shrink-0">
            {song.source === 'detected' && (
              <span className="text-xs mr-1" style={{ color: C.gold + '80' }}>⚡</span>
            )}
            <button onClick={() => setMode('swap')}
              className="p-1.5 rounded-lg transition-colors"
              title="Wrong song? Swap it"
              style={{ color: C.muted }}>
              <RefreshCw size={13} />
            </button>
            <button onClick={() => { setEditTitle(song.title); setEditArtist(song.artist); setMode('edit') }}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: C.muted }}>
              <Pencil size={13} />
            </button>
            <button onClick={() => onDelete(song.id)}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: C.muted }}>
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Swap panel */}
      {mode === 'swap' && (
        <div className="mt-3 flex flex-col gap-2 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
          <p className="text-[11px] uppercase tracking-wider" style={{ color: C.gold }}>
            Replace "{song.title}" with:
          </p>
          <input
            autoFocus
            value={swapQuery}
            onChange={e => setSwapQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveSwap()}
            placeholder="Correct song title"
            className="rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ background: C.input, border: `1px solid ${C.gold}`, color: C.text }}
          />
          <input
            value={swapArtist}
            onChange={e => setSwapArtist(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveSwap()}
            placeholder="Artist (optional)"
            className="rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ background: C.input, border: `1px solid ${C.border}`, color: C.text }}
          />
          <div className="flex gap-2">
            <button onClick={saveSwap}
              className="flex-1 font-semibold rounded-lg py-2 text-sm"
              style={{ background: C.gold, color: '#0a0908' }}>
              Swap Song
            </button>
            <button onClick={() => setMode('view')}
              className="px-4 rounded-lg py-2 text-sm"
              style={{ background: '#1e1c18', color: C.text }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ReviewPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [performance, setPerformance] = useState<Performance | null>(null)
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newArtist, setNewArtist] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [selectedPRO, setSelectedPRO] = useState<PRO>('SOCAN')

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase.from('performances').select('*').eq('id', params.id).single(),
      supabase.from('performance_songs').select('*').eq('performance_id', params.id).order('position'),
    ]).then(([{ data: perf }, { data: songData }]) => {
      if (perf) setPerformance(perf)
      if (songData) setSongs(songData.map(s => ({ ...s, id: s.id || String(s.position) })))
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
    }])
    setNewTitle('')
    setNewArtist('')
    setShowAdd(false)
  }

  const handleSave = useCallback(async () => {
    if (!performance) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('performance_songs').delete().eq('performance_id', performance.id)
    await supabase.from('performance_songs').insert(
      songs.map((s, i) => ({
        performance_id: performance.id,
        title: s.title,
        artist: s.artist,
        position: i + 1,
      }))
    )
    await supabase.from('performances').update({ status: 'completed' }).eq('id', performance.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => {
      router.push('/app/dashboard')
    }, 1200)
  }, [performance, songs, router])

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    })
  }

  function formatDuration() {
    if (!performance?.started_at || !performance?.ended_at) return ''
    const mins = Math.round(
      (new Date(performance.ended_at).getTime() - new Date(performance.started_at).getTime()) / 60000
    )
    return `${mins} min`
  }

  function generateExportCSV(pro: PRO) {
    if (!performance) return
    const headers: Record<PRO, string[]> = {
      SOCAN: ['Title', 'Artist', 'Composer', 'Publisher', 'ISRC', 'Duration', 'Date', 'Venue', 'City'],
      ASCAP: ['Title', 'Performer', 'Composer/Author', 'Publisher', 'ISRC', 'Venue', 'Date', 'City', 'State'],
      BMI:   ['Song Title', 'Artist', 'BMI Work #', 'Composer', 'Publisher', 'Venue Name', 'Date', 'City'],
    }
    const rows = songs.map(s => {
      const date = performance.started_at ? new Date(performance.started_at).toLocaleDateString() : ''
      if (pro === 'SOCAN') return [s.title, s.artist, '', '', '', '', date, performance.venue_name, performance.city]
      if (pro === 'ASCAP') return [s.title, performance.artist_name, '', '', '', performance.venue_name, date, performance.city, '']
      return [s.title, performance.artist_name, '', '', '', performance.venue_name, date, performance.city]
    })
    const csv = [headers[pro], ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${pro}-setlist-${performance.venue_name}-${new Date(performance.started_at).toLocaleDateString().replace(/\//g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
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

      <div className="px-4 pt-8 pb-4 max-w-lg mx-auto w-full">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: C.gold }} />
          <span className="text-[11px] uppercase tracking-[0.3em] font-medium" style={{ color: C.gold + '99' }}>
            Review Setlist
          </span>
        </div>
        <h1 className="font-display text-3xl mb-2" style={{ color: C.text }}>
          {performance?.venue_name}
        </h1>
        <div className="flex flex-wrap gap-3 text-sm" style={{ color: C.secondary }}>
          <span className="flex items-center gap-1">
            <MapPin size={12} />
            {performance?.city}, {performance?.country}
          </span>
          <span className="flex items-center gap-1">
            <Calendar size={12} />
            {performance?.started_at ? formatDate(performance.started_at) : ''}
          </span>
          {formatDuration() && (
            <span className="flex items-center gap-1">
              <Music2 size={12} />
              {formatDuration()}
            </span>
          )}
        </div>
      </div>

      <div className="px-4 max-w-lg mx-auto w-full mb-3">
        <div className="flex items-center justify-between">
          <span className="text-sm" style={{ color: C.secondary }}>
            {songs.length} song{songs.length !== 1 ? 's' : ''} detected
          </span>
          <button onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1.5 text-xs transition-colors"
            style={{ color: C.gold }}>
            <Plus size={14} />
            Add song
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="px-4 max-w-lg mx-auto w-full mb-3">
          <div className="rounded-xl p-3 flex flex-col gap-2"
            style={{ background: C.card, border: `1px solid ${C.gold}40` }}>
            <input autoFocus value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Song title"
              className="rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{ background: C.input, border: `1px solid ${C.border}`, color: C.text }}
            />
            <input value={newArtist}
              onChange={e => setNewArtist(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder={`Artist (default: ${performance?.artist_name})`}
              className="rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{ background: C.input, border: `1px solid ${C.border}`, color: C.text }}
            />
            <div className="flex gap-2">
              <button onClick={handleAdd}
                className="flex-1 font-semibold rounded-lg py-2 text-sm"
                style={{ background: C.gold, color: '#0a0908' }}>
                Add
              </button>
              <button onClick={() => setShowAdd(false)}
                className="px-4 rounded-lg py-2 text-sm"
                style={{ background: '#1e1c18', color: C.text }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 max-w-lg mx-auto w-full flex-1">
        {songs.length === 0 ? (
          <div className="text-center py-16">
            <Music2 size={32} className="mx-auto mb-3 opacity-20" style={{ color: C.secondary }} />
            <p className="text-sm" style={{ color: C.secondary }}>No songs detected</p>
            <p className="text-xs mt-1" style={{ color: C.muted }}>Add songs manually above</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={songs.map(s => s.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {songs.map((song, index) => (
                  <SortableRow key={song.id} song={song} index={index}
                    onDelete={handleDelete} onEdit={handleEdit} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="px-4 pb-8 pt-4 max-w-lg mx-auto w-full flex flex-col gap-3 mt-4">
        <div className="rounded-2xl p-4" style={{ background: C.card, border: `1px solid ${C.border}` }}>
          <button onClick={() => setShowExport(!showExport)}
            className="w-full flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: C.text }}>
              <Download size={16} style={{ color: C.gold }} />
              Export for PRO Submission
            </span>
            <span className="text-xs" style={{ color: C.muted }}>{showExport ? '▲' : '▼'}</span>
          </button>

          {showExport && (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-xs mb-1" style={{ color: C.secondary }}>
                Select your PRO to download a formatted CSV:
              </p>
              {(['SOCAN', 'ASCAP', 'BMI'] as PRO[]).map(pro => (
                <button key={pro}
                  onClick={() => generateExportCSV(pro)}
                  onMouseEnter={() => setSelectedPRO(pro)}
                  className="flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                  style={{
                    border: `1px solid ${selectedPRO === pro ? C.gold : C.border}`,
                    background: selectedPRO === pro ? C.gold + '1a' : 'transparent',
                    color: selectedPRO === pro ? C.gold : C.text,
                  }}>
                  <span>{pro}</span>
                  <span className="text-xs" style={{ color: C.secondary }}>
                    {pro === 'SOCAN' ? 'Canada' : 'USA'} · Download CSV
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button onClick={handleSave} disabled={saving || saved}
          className="w-full flex items-center justify-center gap-2 font-bold rounded-2xl py-4 transition-all disabled:opacity-60"
          style={{
            background: saved ? '#16a34a' : C.gold,
            color: saved ? '#fff' : '#0a0908',
          }}>
          {saved ? <><Check size={18} />Saved!</> : saving ? 'Saving...' : 'Save & Complete'}
        </button>

        <button onClick={() => router.push('/app/dashboard')}
          className="text-center text-sm transition-colors"
          style={{ color: C.secondary }}>
          Back to Dashboard
        </button>
      </div>
    </div>
  )
}
