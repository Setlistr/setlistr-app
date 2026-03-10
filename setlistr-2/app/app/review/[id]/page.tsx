'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Trash2, Plus, Download, Check, Pencil, X, Music2, MapPin, Calendar } from 'lucide-react'

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

function SortableRow({
  song,
  index,
  onDelete,
  onEdit,
}: {
  song: Song
  index: number
  onDelete: (id: string) => void
  onEdit: (id: string, title: string, artist: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: song.id })

  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(song.title)
  const [editArtist, setEditArtist] = useState(song.artist)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  function saveEdit() {
    if (editTitle.trim()) {
      onEdit(song.id, editTitle.trim(), editArtist.trim())
      setEditing(false)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
        isDragging
          ? 'bg-[#2a2620] border-gold shadow-lg shadow-gold/10'
          : 'bg-[#1a1814] border-[#2e2b26] hover:border-[#3e3b36]'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-[#4a4640] hover:text-gold cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical size={16} />
      </button>

      <span className="text-gold font-mono text-xs w-5 text-right shrink-0">{index + 1}</span>

      {editing ? (
        <div className="flex-1 flex gap-2">
          <input
            autoFocus
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveEdit()}
            placeholder="Song title"
            className="flex-1 bg-[#0f0e0c] border border-gold rounded-lg px-2 py-1 text-cream text-sm focus:outline-none"
          />
          <input
            value={editArtist}
            onChange={e => setEditArtist(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveEdit()}
            placeholder="Artist"
            className="w-32 bg-[#0f0e0c] border border-[#2e2b26] rounded-lg px-2 py-1 text-cream text-sm focus:outline-none"
          />
          <button onClick={saveEdit} className="text-gold hover:text-yellow-300">
            <Check size={16} />
          </button>
          <button onClick={() => setEditing(false)} className="text-[#4a4640] hover:text-cream">
            <X size={16} />
          </button>
        </div>
      ) : (
        <div className="flex-1 min-w-0">
          <p className="text-cream text-sm truncate">{song.title}</p>
          {song.artist && (
            <p className="text-[#6a6660] text-xs truncate">{song.artist}</p>
          )}
        </div>
      )}

      {!editing && (
        <div className="flex items-center gap-1 shrink-0">
          {song.source === 'detected' && (
            <span className="text-xs text-gold/50 mr-1">⚡</span>
          )}
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 text-[#4a4640] hover:text-gold rounded-lg hover:bg-[#2a2620] transition-colors"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => onDelete(song.id)}
            className="p-1.5 text-[#4a4640] hover:text-red-400 rounded-lg hover:bg-[#2a2620] transition-colors"
          >
            <Trash2 size={13} />
          </button>
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
    const newSong: Song = {
      id: `manual-${Date.now()}`,
      title: newTitle.trim(),
      artist: newArtist.trim() || (performance?.artist_name || ''),
      position: songs.length + 1,
      source: 'manual',
    }
    setSongs(prev => [...prev, newSong])
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
    setTimeout(() => setSaved(false), 2000)
  }, [performance, songs])

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    })
  }

  function formatDuration() {
    if (!performance?.started_at || !performance?.ended_at) return ''
    const start = new Date(performance.started_at)
    const end = new Date(performance.ended_at)
    const mins = Math.round((end.getTime() - start.getTime()) / 60000)
    return `${mins} min`
  }

  function generateExportCSV(pro: PRO) {
    if (!performance) return

    const headers: Record<PRO, string[]> = {
      SOCAN: ['Title', 'Artist', 'Composer', 'Publisher', 'ISRC', 'Duration', 'Date', 'Venue', 'City'],
      ASCAP: ['Title', 'Performer', 'Composer/Author', 'Publisher', 'ISRC', 'Venue', 'Date', 'City', 'State'],
      BMI: ['Song Title', 'Artist', 'BMI Work #', 'Composer', 'Publisher', 'Venue Name', 'Date', 'City'],
    }

    const rows = songs.map(s => {
      const date = performance.started_at ? new Date(performance.started_at).toLocaleDateString() : ''
      if (pro === 'SOCAN') return [s.title, s.artist, '', '', '', '', date, performance.venue_name, performance.city]
      if (pro === 'ASCAP') return [s.title, performance.artist_name, '', '', '', performance.venue_name, date, performance.city, '']
      if (pro === 'BMI') return [s.title, performance.artist_name, '', '', '', performance.venue_name, date, performance.city]
      return []
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
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <div className="text-gold animate-pulse">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-cream flex flex-col"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #1e1c18 0%, #0f0e0c 100%)' }}>

      <div className="px-4 pt-8 pb-4 max-w-lg mx-auto w-full">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1.5 h-1.5 rounded-full bg-gold" />
          <span className="text-xs uppercase tracking-[0.3em] text-gold/60 font-medium">Review Setlist</span>
        </div>
        <h1 className="font-display text-3xl text-cream mb-1">{performance?.venue_name}</h1>
        <div className="flex flex-wrap gap-3 text-sm text-[#6a6660]">
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
          <span className="text-sm text-[#6a6660]">
            {songs.length} song{songs.length !== 1 ? 's' : ''} detected
          </span>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1.5 text-xs text-gold hover:text-yellow-300 transition-colors"
          >
            <Plus size={14} />
            Add song
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="px-4 max-w-lg mx-auto w-full mb-3">
          <div className="bg-[#1a1814] border border-gold/30 rounded-xl p-3 flex flex-col gap-2">
            <input
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Song title"
              className="bg-[#0f0e0c] border border-[#2e2b26] rounded-lg px-3 py-2 text-cream text-sm focus:outline-none focus:border-gold"
            />
            <input
              value={newArtist}
              onChange={e => setNewArtist(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder={`Artist (default: ${performance?.artist_name})`}
              className="bg-[#0f0e0c] border border-[#2e2b26] rounded-lg px-3 py-2 text-cream text-sm focus:outline-none focus:border-gold"
            />
            <div className="flex gap-2">
              <button onClick={handleAdd} className="flex-1 bg-gold text-ink font-semibold rounded-lg py-2 text-sm">
                Add
              </button>
              <button onClick={() => setShowAdd(false)} className="px-4 bg-[#2a2620] text-cream rounded-lg py-2 text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 max-w-lg mx-auto w-full flex-1">
        {songs.length === 0 ? (
          <div className="text-center py-16 text-[#4a4640]">
            <Music2 size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No songs detected</p>
            <p className="text-xs mt-1">Add songs manually above</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={songs.map(s => s.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {songs.map((song, index) => (
                  <SortableRow
                    key={song.id}
                    song={song}
                    index={index}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="px-4 pb-8 pt-4 max-w-lg mx-auto w-full flex flex-col gap-3 mt-4">
        <div className="bg-[#1a1814] border border-[#2e2b26] rounded-2xl p-4">
          <button
            onClick={() => setShowExport(!showExport)}
            className="w-full flex items-center justify-between"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-cream">
              <Download size={16} className="text-gold" />
              Export for PRO Submission
            </span>
            <span className="text-[#4a4640] text-xs">{showExport ? '▲' : '▼'}</span>
          </button>

          {showExport && (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-xs text-[#6a6660] mb-1">Select your PRO to download a formatted CSV:</p>
              {(['SOCAN', 'ASCAP', 'BMI'] as PRO[]).map(pro => (
                <button
                  key={pro}
                  onClick={() => generateExportCSV(pro)}
                  className={`flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    selectedPRO === pro
                      ? 'border-gold bg-gold/10 text-gold'
                      : 'border-[#2e2b26] text-cream hover:border-[#4a4640]'
                  }`}
                  onMouseEnter={() => setSelectedPRO(pro)}
                >
                  <span>{pro}</span>
                  <span className="text-xs text-[#6a6660]">
                    {pro === 'SOCAN' ? 'Canada' : 'USA'} · Download CSV
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleSave}
          disabled={saving || saved}
          className={`w-full flex items-center justify-center gap-2 font-bold rounded-2xl py-4 transition-all ${
            saved
              ? 'bg-green-600 text-white'
              : 'bg-gold hover:bg-yellow-400 text-ink disabled:opacity-60'
          }`}
        >
          {saved ? (
            <><Check size={18} />Saved!</>
          ) : saving ? 'Saving...' : 'Save & Complete'}
        </button>

        <button
          onClick={() => router.push('/app/dashboard')}
          className="text-center text-sm text-[#4a4640] hover:text-cream transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  )
}
