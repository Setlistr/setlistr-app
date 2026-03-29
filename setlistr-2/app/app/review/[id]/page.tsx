'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
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
import { GripVertical, Download, Check, X, Music2, MapPin, Calendar } from 'lucide-react'
// CHANGE 1: import estimator
import { estimateRoyalties, capacityToBand } from '@/lib/royalty-estimate'
import CatalogSearch, { type CatalogSong } from '@/components/CatalogSearch'
import { normalizeSong } from '@/lib/song-utils'

const C = {
  bg: '#0a0908', card: '#141210', cardHover: '#181614',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#a09070', muted: '#6a6050',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)', green: '#4ade80', red: '#ef4444',
}

// ── Match confidence signal ──────────────────────────────────────────────────
// Only applies to auto-detected songs. Manual adds get no signal — silence
// is more honest than a false negative on an artist's own registered song.
//
// Tiers:
//   matched        = auto-detected + ISRC + composer (strong metadata)
//   partial        = auto-detected + ISRC OR composer (partial metadata)
//   unverified     = auto-detected + no metadata (detected but unenriched)
//   none           = manual / assigned / corrected — no signal shown
//
// This is match confidence, NOT registration status.
// PRO registration can only be confirmed via direct PRO API queries.
function getMatchConfidence(song: {
  source?: string
  isrc?: string
  composer?: string
  reviewState?: string
}): 'matched' | 'partial' | 'unverified' | 'none' {
  const isAutoDetected = (
    song.source === 'recognized' ||
    song.source === 'detected'   ||
    song.source === 'fingerprint'||
    song.source === 'humming'
  )
  if (!isAutoDetected) return 'none'  // manual, cloned, assigned — no signal
  if (song.isrc && song.composer) return 'matched'
  if (song.isrc || song.composer) return 'partial'
  return 'unverified'
}

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
  reviewState?: 'clean' | 'needs_review'
}

// CHANGE 2: added show_type and venue_capacity to Performance type
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
  show_type?: string | null
  venue_capacity?: number | null
}

type PRO = 'SOCAN' | 'ASCAP' | 'BMI' // kept for CSV export

// RecentSong replaced by CatalogSong from CatalogSearch component
type RecentSong = { id: string; title: string; artist: string; play_count: number; last_played: string }

async function writeUserSongFromReview(
  supabase: ReturnType<typeof import('@/lib/supabase/client').createClient>,
  title: string,
  artist: string,
  userId: string,
  performanceId: string
): Promise<void> {
  try {
    const normalizedTitle = title.toLowerCase().trim()
      .replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '')
      .replace(/[-–—]/g, ' ').replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ').trim()
    if (!normalizedTitle) return
    const { error: guardError } = await supabase
      .from('user_song_performances')
      .insert({ user_id: userId, performance_id: performanceId, normalized_title: normalizedTitle })
    if (guardError) {
      if (guardError.code === '23505') return
      return
    }
    const { data: existing } = await supabase
      .from('user_songs').select('id, confirmed_count')
      .eq('user_id', userId).eq('song_title', title).single()
    if (existing) {
      await supabase.from('user_songs').update({
        confirmed_count: existing.confirmed_count + 1,
        canonical_artist: artist || null,
        last_confirmed_at: new Date().toISOString(),
      }).eq('id', existing.id)
    } else {
      await supabase.from('user_songs').insert({
        user_id: userId, song_title: title,
        canonical_artist: artist || null,
        confirmed_count: 1,
        last_confirmed_at: new Date().toISOString(),
      })
    }
  } catch (err) {
    console.error('[UserSongs] review write failed:', err)
  }
}

function useKeyboardOffset(): number {
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    function update() {
      setOffset(Math.max(0, window.innerHeight - vv!.height - vv!.offsetTop))
    }
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
  return offset
}

function SortableRow({ song, index, onDelete, onTap }: {
  song: Song
  index: number
  onDelete: (id: string) => void
  onTap: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: song.id })
  const [swipeX, setSwipeX]   = useState(0)
  const [swiping, setSwiping] = useState(false)
  const [hovered, setHovered] = useState(false)
  const touchStart             = useRef<{ x: number; y: number } | null>(null)
  const ACTION_W = 140
  const THRESHOLD = 60
  const isOpen = swipeX <= -THRESHOLD
  const isUnknown = song.source === 'unidentified'
  const needsReview = isUnknown || song.reviewState === 'needs_review'

  function onTouchStart(e: React.TouchEvent) {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    setSwiping(false)
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!touchStart.current) return
    const dx = e.touches[0].clientX - touchStart.current.x
    const dy = e.touches[0].clientY - touchStart.current.y
    if (!swiping && Math.abs(dx) < 6 && Math.abs(dy) < 6) return
    if (!swiping && Math.abs(dy) > Math.abs(dx)) return
    setSwiping(true)
    const next = isOpen ? Math.min(0, -ACTION_W + dx) : Math.min(0, dx)
    setSwipeX(Math.max(-ACTION_W, next))
  }
  function onTouchEnd() {
    if (!swiping) return
    setSwiping(false)
    touchStart.current = null
    setSwipeX(swipeX < -THRESHOLD ? -ACTION_W : 0)
  }
  function closeSwipe() { setSwipeX(0) }

  const leftBorder = needsReview ? 'rgba(201,168,76,0.6)' : 'rgba(74,222,128,0.25)'

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: swiping ? 'none' : transition,
        position: 'relative', borderRadius: 12, overflow: 'hidden',
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: ACTION_W, display: 'flex', pointerEvents: swipeX < -20 ? 'auto' : 'none' }}>
        <button
          onClick={() => { closeSwipe(); onTap(song.id) }}
          style={{ flex: 1, background: C.gold, border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, color: '#0a0908' }}
        >
          <span style={{ fontSize: 16 }}>✏️</span>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'inherit' }}>Edit</span>
        </button>
        <button
          onClick={() => { closeSwipe(); onDelete(song.id) }}
          style={{ flex: 1, background: C.red, border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, color: '#fff', borderRadius: '0 12px 12px 0' }}
        >
          <span style={{ fontSize: 16 }}>🗑️</span>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'inherit' }}>Delete</span>
        </button>
      </div>
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => { if (swipeX < -10) { closeSwipe(); return } onTap(song.id) }}
        style={{
          transform: `translateX(${swipeX}px)`,
          transition: swiping ? 'none' : 'transform 0.22s cubic-bezier(0.25,1,0.5,1)',
          background: isDragging ? C.cardHover : C.card,
          border: `1px solid ${isDragging ? C.gold + '50' : C.border}`,
          borderLeft: `3px solid ${leftBorder}`,
          borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 14px 14px 12px',
          minHeight: 64, cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
          userSelect: 'none',
        }}
      >
        <div
          {...attributes} {...listeners}
          onClick={e => e.stopPropagation()}
          style={{ color: C.muted, cursor: 'grab', flexShrink: 0, display: 'flex', alignItems: 'center', padding: '4px 2px', touchAction: 'none' }}
        >
          <GripVertical size={15} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, minWidth: 18, textAlign: 'right', flexShrink: 0, fontFamily: '"DM Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>
          {index + 1}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {needsReview ? (
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: C.gold, margin: 0, fontStyle: 'italic' }}>
                {isUnknown ? 'Unknown — tap to fix' : song.title}
              </p>
              <p style={{ fontSize: 11, color: C.gold, opacity: 0.6, margin: '2px 0 0', fontWeight: 500 }}>Tap to fix</p>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {song.title}
              </p>
              {song.isrc ? (
                <p style={{ fontSize: 10, color: C.muted, margin: '2px 0 0', fontFamily: '"DM Mono", monospace', letterSpacing: '0.04em' }}>
                  {song.isrc}
                </p>
              ) : null}
            </div>
          )}
        </div>
        <div
          onClick={hovered ? (e) => { e.stopPropagation(); onDelete(song.id) } : undefined}
          style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 6,
            background: hovered ? 'rgba(239,68,68,0.12)' : 'transparent',
            border: hovered ? '1px solid rgba(239,68,68,0.25)' : '1px solid transparent',
            transition: 'all 0.15s ease',
            cursor: hovered ? 'pointer' : 'default',
          }}
        >
          {hovered ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
          ) : needsReview ? (
            <span style={{ fontSize: 10, color: C.gold, opacity: 0.7, fontWeight: 700 }}>!</span>
          ) : (() => {
            const conf = getMatchConfidence(song)
            if (conf === 'matched')    return <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, display: 'inline-block', opacity: 0.8 }} />
            if (conf === 'partial')    return <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.gold, display: 'inline-block', opacity: 0.6 }} />
            if (conf === 'unverified') return <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.muted, display: 'inline-block', opacity: 0.5 }} />
            return <Check size={13} color={C.green} strokeWidth={2.5} style={{ opacity: 0.3 }} />
          })()}
        </div>
      </div>
    </div>
  )
}

function EditSheet({ song, onSave, onClose }: {
  song: Song
  onSave: (id: string, title: string, artist: string) => void
  onClose: () => void
}) {
  const [title, setTitle]   = useState(song.title === 'Unknown song' ? '' : song.title)
  const [artist, setArtist] = useState(song.artist)
  const bottomOffset        = useKeyboardOffset()
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'fadeIn 0.15s ease' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 520, background: '#141210', borderRadius: '20px 20px 0 0', border: '1px solid rgba(255,255,255,0.07)', borderBottom: 'none', padding: '20px 20px 40px', display: 'flex', flexDirection: 'column', gap: 12, animation: 'sheetUp 0.22s ease', fontFamily: '"DM Sans", system-ui, sans-serif', marginBottom: bottomOffset, transition: 'margin-bottom 0.15s ease' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: 0 }}>Edit song</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 4 }}><X size={16} /></button>
        </div>
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && title.trim()) { onSave(song.id, title.trim(), artist.trim()); onClose() } }}
          placeholder="Song title"
          style={{ background: C.input, border: `1px solid ${C.gold}40`, borderRadius: 10, padding: '13px 14px', color: C.text, fontSize: 15, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }}
        />
        <input
          value={artist}
          onChange={e => setArtist(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && title.trim()) { onSave(song.id, title.trim(), artist.trim()); onClose() } }}
          placeholder="Artist"
          style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 10, padding: '13px 14px', color: C.text, fontSize: 15, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }}
        />
        <button
          onClick={() => { if (title.trim()) { onSave(song.id, title.trim(), artist.trim()); onClose() } }}
          disabled={!title.trim()}
          style={{ width: '100%', padding: '14px', background: title.trim() ? C.gold : C.muted, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: title.trim() ? 'pointer' : 'not-allowed', opacity: title.trim() ? 1 : 0.4, fontFamily: 'inherit', marginTop: 4 }}
        >
          Save
        </button>
      </div>
    </div>
  )
}

function AssignSheet({ assignSheet, onAssign, onClose, onCatalogSelect, userId, currentSongs }: {
  assignSheet:     { songId: string; currentTitle: string }
  onAssign:        (s: RecentSong) => void
  onClose:         () => void
  onCatalogSelect: (song: CatalogSong, songId: string) => void
  userId:          string | null
  currentSongs:    string[]
}) {
  const bottomOffset = useKeyboardOffset()
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'fadeIn 0.15s ease' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 520, background: '#141210', borderRadius: '20px 20px 0 0', border: '1px solid rgba(255,255,255,0.07)', borderBottom: 'none', padding: '20px 20px 40px', display: 'flex', flexDirection: 'column', gap: 12, animation: 'sheetUp 0.22s ease', fontFamily: '"DM Sans", system-ui, sans-serif', marginBottom: bottomOffset, transition: 'margin-bottom 0.15s ease' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>What song was this?</p>
            {assignSheet.currentTitle && assignSheet.currentTitle !== 'Unknown song' ? (
              <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 0' }}>replacing: {assignSheet.currentTitle}</p>
            ) : null}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 4 }}><X size={16} /></button>
        </div>

        {/* CatalogSearch — 1-tap fix with ISRC auto-fill */}
        <CatalogSearch
          userId={userId}
          placeholder="Search your songs..."
          autoFocus
          showEmpty
          currentSongs={currentSongs}
          onSelect={(song) => onCatalogSelect(song, assignSheet.songId)}
        />

        <p style={{ fontSize: 11, color: C.muted, margin: '4px 0 0', lineHeight: 1.5, textAlign: 'center' }}>
          Select a song to auto-fill title, artist, and ISRC · or type to add new
        </p>
      </div>
    </div>
  )
}


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
  const [showExport, setShowExport]   = useState(false)
  const [selectedPRO, setSelectedPRO] = useState<PRO>('SOCAN')
  const [editSheet, setEditSheet]     = useState<Song | null>(null)
  const [assignSheet, setAssignSheet] = useState<{ songId: string; currentTitle: string } | null>(null)
  // recentSongs/assignSearch handled internally by CatalogSearch component
  const [userId, setUserId]             = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function openAssignSheet(songId: string) {
    const song = songs.find(s => s.id === songId)
    setAssignSheet({ songId, currentTitle: song?.title || '' })
  }
  function closeAssignSheet() { setAssignSheet(null) }

  function assignSong(recent: RecentSong) {
    if (!assignSheet) return
    setSongs(prev => prev.map(s =>
      s.id === assignSheet.songId
        ? { ...s, title: recent.title, artist: recent.artist, source: 'manual', reviewState: 'clean' }
        : s
    ))
    closeAssignSheet()
  }

  // Called when user selects from CatalogSearch — auto-fills ISRC and all metadata
  function assignFromCatalog(catalogSong: CatalogSong, songId: string) {
    setSongs(prev => prev.map(s =>
      s.id === songId
        ? {
            ...s,
            title:      catalogSong.title,
            artist:     catalogSong.artist || s.artist,
            isrc:       catalogSong.isrc   || '',
            composer:   catalogSong.composer  || '',
            publisher:  catalogSong.publisher || '',
            source:     'manual',
            reviewState: 'clean',
          }
        : s
    ))
    closeAssignSheet()
  }

  function handleRowTap(songId: string) {
    const song = songs.find(s => s.id === songId)
    if (!song) return
    if (song.source === 'unidentified' || song.reviewState === 'needs_review') {
      openAssignSheet(songId)
    } else {
      setEditSheet(song)
    }
  }

  // CHANGE 3: join shows(show_type) and venues(capacity)
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setUserId(user.id) })
    supabase.from('performances').select('*, shows(show_type), venues(capacity)').eq('id', params.id).single()
      .then(async ({ data: perf }) => {
        if (!perf) { setLoading(false); return }
        setPerformance({
          ...perf,
          show_type: perf.shows?.show_type || null,
          venue_capacity: perf.venues?.capacity || null,
        })
        const resolvedSetlistId = perf.setlist_id || null
        setSetlistId(resolvedSetlistId)
        if (resolvedSetlistId) {
          const { data: items } = await supabase
            .from('setlist_items').select('*')
            .eq('setlist_id', resolvedSetlistId).order('position')
          if (items && items.length > 0) {
            setSongs(items.map(s => {
              const n = normalizeSong({ title: s.title, artist: s.artist_name || '' })
              return {
                id: s.id, title: n.title, artist: n.artist,
                position: s.position, source: s.source,
                recognition_decision_id: s.recognition_decision_id,
                isrc: s.isrc || '', composer: s.composer || '', publisher: s.publisher || '',
                reviewState: (s.source === 'unidentified' ? 'needs_review' : 'clean') as 'clean' | 'needs_review',
              }
            }))
            setLoading(false)
            return
          }
        }
        const { data: songData } = await supabase
          .from('performance_songs').select('*')
          .eq('performance_id', params.id).order('position')
        if (songData) {
          setSongs(songData.map(s => {
            const n = normalizeSong({ title: s.title, artist: s.artist || '' })
            return {
              id: s.id || String(s.position),
              title: n.title, artist: n.artist,
              position: s.position, source: s.source || 'recognized',
              recognition_decision_id: null,
              isrc: s.isrc || '', composer: s.composer || '', publisher: s.publisher || '',
              reviewState: (s.source === 'unidentified' ? 'needs_review' : 'clean') as 'clean' | 'needs_review',
            }
          }))
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
    setSongs(prev => prev.map(s => s.id === id ? { ...s, title, artist, reviewState: 'clean' } : s))
  }
  function handleAdd() {
    if (!newTitle.trim()) return
    const normalized = normalizeSong({
      title:  newTitle.trim(),
      artist: newArtist.trim() || (performance?.artist_name || ''),
    })
    setSongs(prev => [...prev, {
      id: `manual-${Date.now()}`,
      title:  normalized.title,
      artist: normalized.artist,
      position: songs.length + 1,
      source: 'manual', recognition_decision_id: null,
      isrc: '', composer: '', publisher: '', reviewState: 'clean',
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
        songs.map((s, i) => {
          const n = normalizeSong({ title: s.title, artist: s.artist })
          return {
            setlist_id: setlistId, title: n.title, artist_name: n.artist,
            position: i + 1, source: s.source || 'manual',
            recognition_decision_id: s.recognition_decision_id || null,
          }
        })
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
        status: 'confirmed', confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', setlistId)
    }
    await supabase.from('performance_songs').delete().eq('performance_id', performance.id)
    await supabase.from('performance_songs').insert(
      songs.map((s, i) => {
        const n = normalizeSong({ title: s.title, artist: s.artist })
        return {
          performance_id: performance.id, title: n.title, artist: n.artist,
          position: i + 1, isrc: s.isrc || null, composer: s.composer || null, publisher: s.publisher || null,
        }
      })
    )
    await supabase.from('performances').update({ status: 'completed' }).eq('id', performance.id)
    if (performance.show_id) {
      await supabase.from('shows').update({ status: 'completed' }).eq('id', performance.show_id)
    }
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        for (const song of songs) {
          if (!song.title?.trim()) continue
          writeUserSongFromReview(supabase, song.title, song.artist || '', user.id, performance.id)
        }
      }
    } catch (err) {
      console.error('[ReviewSave]', err)
    }
    setSaving(false); setSaved(true); setShowComplete(true)
  }, [performance, songs, setlistId])

  function generateExportCSV(pro: PRO) {
    if (!performance) return
    const date = new Date(performance.started_at).toLocaleDateString()
    const headers: Record<PRO, string[]> = {
      SOCAN: ['Title', 'Artist', 'Composer', 'Publisher', 'ISRC', 'Duration', 'Date', 'Venue', 'City'],
      ASCAP: ['Title', 'Performer', 'Composer/Author', 'Publisher', 'ISRC', 'Venue', 'Date', 'City', 'State'],
      BMI:   ['Song Title', 'Artist', 'BMI Work #', 'Composer', 'Publisher', 'Venue Name', 'Date', 'City'],
    }
    const rows = songs.map(s => {
      const c = s.composer || '', p = s.publisher || '', i = s.isrc || ''
      if (pro === 'SOCAN') return [s.title, s.artist, c, p, i, '', date, performance.venue_name, performance.city]
      if (pro === 'ASCAP') return [s.title, performance.artist_name, c, p, i, performance.venue_name, date, performance.city, performance.country || '']
      return [s.title, performance.artist_name, '', c, p, performance.venue_name, date, performance.city]
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

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  }
  function formatDuration() {
    if (!performance?.started_at || !performance?.ended_at) return ''
    return `${Math.round((new Date(performance.ended_at).getTime() - new Date(performance.started_at).getTime()) / 60000)} min`
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', border: `1.5px solid ${C.gold}`, animation: 'breathe 1.8s ease-in-out infinite' }} />
          <span style={{ color: C.muted, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Loading</span>
        </div>
        <style>{`@keyframes breathe{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.2);opacity:.8}}`}</style>
      </div>
    )
  }

  const autoCount        = songs.filter(s => s.source === 'recognized' || s.source === 'detected').length
  const needsReviewCount = songs.filter(s => s.source === 'unidentified' || s.reviewState === 'needs_review').length
  const allClean         = needsReviewCount === 0
  const dur              = formatDuration()

  if (showComplete) {
    // CHANGE 4: weighted estimate replaces flat model
    const territory = performance?.country === 'CA' || performance?.country === 'Canada' ? 'CA' : 'US'
    const estimate  = estimateRoyalties({
      songCount:         songs.length,
      venueCapacityBand: capacityToBand(performance?.venue_capacity),
      showType:          (performance?.show_type as any) || 'single',
      territory,
    })

    // Derive registration readiness from song data
    // Match confidence — auto-detected songs only, no signal for manual adds
    const matchedSongs    = songs.filter(s => getMatchConfidence(s) === 'matched')
    const partialSongs    = songs.filter(s => getMatchConfidence(s) === 'partial')
    const unverifiedSongs = songs.filter(s => getMatchConfidence(s) === 'unverified')
    const noSignalSongs   = songs.filter(s => getMatchConfidence(s) === 'none')
    const assessedCount   = matchedSongs.length + partialSongs.length + unverifiedSongs.length
    const strongCount     = matchedSongs.length + partialSongs.length

    // Contextual insight — one line that makes the app feel smart
    const newSongs = songs.filter(s => s.reviewState === 'clean' && s.source === 'manual')

    return (
      <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
        <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '60vh', pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.08) 0%, transparent 65%)' }} />
        <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', animation: 'fadeUp 0.4s ease' }}>

          {/* ── Phase 1: Captured confirmation ── */}
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Check size={24} color={C.green} strokeWidth={2.5} />
          </div>

          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 6px' }}>
            Show captured
          </p>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.025em', lineHeight: 1.15 }}>
            {performance?.venue_name}
          </h1>
          <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 24px' }}>
            {songs.length} song{songs.length !== 1 ? 's' : ''} · {performance?.city || ''}
          </p>

          {/* ── Money card — simple, not pressured ── */}
          <div style={{ width: '100%', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 16, padding: '20px', marginBottom: 10, animation: 'fadeUp 0.4s 0.06s ease both' }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.gold, margin: '0 0 8px', opacity: 0.8 }}>
              Estimated royalties
            </p>
            <p style={{ fontSize: 40, fontWeight: 800, color: C.gold, margin: '0 0 6px', fontFamily: '"DM Mono", monospace', letterSpacing: '-0.03em', lineHeight: 1 }}>
              ~${estimate.expected}
            </p>
            <p style={{ fontSize: 12, color: C.secondary, margin: '0 0 14px' }}>
              ${estimate.low}–${estimate.high} range · {estimate.confidenceNote}
            </p>

            {/* Readiness bar */}
            <div style={{ borderTop: `1px solid rgba(201,168,76,0.2)`, paddingTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: C.secondary }}>Song readiness</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: strongCount === assessedCount && assessedCount > 0 ? C.green : C.gold }}>
                  {strongCount}/{assessedCount > 0 ? assessedCount : songs.length} matched
                </span>
              </div>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{ height: '100%', borderRadius: 2, background: strongCount === assessedCount && assessedCount > 0 ? C.green : C.gold, width: `${Math.round((strongCount / Math.max(assessedCount || songs.length, 1)) * 100)}%`, transition: 'width 0.6s ease' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {matchedSongs.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.secondary }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, display: 'inline-block', flexShrink: 0 }} />
                      Matched
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.green, fontFamily: '"DM Mono", monospace' }}>{matchedSongs.length}</span>
                  </div>
                ) : null}
                {partialSongs.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.secondary }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.gold, display: 'inline-block', flexShrink: 0 }} />
                      Partial match
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.gold, fontFamily: '"DM Mono", monospace' }}>{partialSongs.length}</span>
                  </div>
                ) : null}
                {unverifiedSongs.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.muted, display: 'inline-block', flexShrink: 0 }} />
                      Unverified
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, fontFamily: '"DM Mono", monospace' }}>{unverifiedSongs.length}</span>
                  </div>
                ) : null}
                {noSignalSongs.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.muted }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'inline-block', flexShrink: 0 }} />
                      Manually added
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, fontFamily: '"DM Mono", monospace' }}>{noSignalSongs.length}</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* ── Setlist preview — compact ── */}
          <div style={{ width: '100%', background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px', marginBottom: 20, maxHeight: 160, overflowY: 'auto', animation: 'fadeUp 0.4s 0.1s ease both' }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 10px', textAlign: 'left' }}>Setlist</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {songs.map((s, i) => {
                const hasISRC     = !!(s as any).isrc
                const hasComposer = !!(s as any).composer
                const dotColor    = hasISRC ? C.green : hasComposer ? C.gold : C.muted
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: C.muted, minWidth: 16, textAlign: 'right', fontFamily: '"DM Mono", monospace', flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                    <p style={{ fontSize: 13, color: C.text, margin: 0, fontWeight: 500, flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Primary CTA: Done for tonight — no pressure ── */}
          <button
            onClick={() => router.push('/app/dashboard')}
            style={{ width: '100%', padding: '16px', background: C.gold, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 14, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', marginBottom: 10, animation: 'fadeUp 0.4s 0.14s ease both', fontFamily: 'inherit' }}>
            Show Complete
          </button>

          {/* ── Secondary CTAs: low pressure ── */}
          <div style={{ width: '100%', display: 'flex', gap: 8, marginBottom: 16, animation: 'fadeUp 0.4s 0.18s ease both' }}>
            <button
              onClick={() => router.push(`/app/submit/${params.id}`)}
              style={{ flex: 1, padding: '12px', background: 'transparent', border: `1px solid ${C.borderGold}`, borderRadius: 10, color: C.gold, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.04em' }}>
              Claim Now
            </button>
            <button
              onClick={() => setShowComplete(false)}
              style={{ flex: 1, padding: '12px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 10, color: C.secondary, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Review Setlist
            </button>
          </div>

          {/* ── Reminder nudge — low pressure ── */}
          <p style={{ fontSize: 11, color: C.muted, margin: 0, lineHeight: 1.5, animation: 'fadeUp 0.4s 0.2s ease both' }}>
            ~${estimate.expected} estimated · {assessedCount > 0 ? `${strongCount} of ${assessedCount} detected songs matched` : 'submit to your PRO to claim'}.{' '}
            <span style={{ color: C.secondary }}>We'll remind you on the dashboard.</span>
          </p>
        </div>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
          @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        `}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100vw', height: '40vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.05) 0%, transparent 65%)' }} />
      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 480, width: '100%', margin: '0 auto', padding: '0 16px', boxSizing: 'border-box' }}>

        <div style={{ paddingTop: 28, paddingBottom: 20, animation: 'fadeUp 0.4s ease' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 20, padding: '4px 10px', marginBottom: 14 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.gold }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold }}>Tonight's Setlist</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.025em', lineHeight: 1.15 }}>{performance?.venue_name}</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.secondary }}><MapPin size={11} />{performance?.city}, {performance?.country}</span>
            {performance?.started_at ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.secondary }}><Calendar size={11} />{formatDate(performance.started_at)}</span> : null}
            {dur ? <span style={{ fontSize: 12, color: C.secondary }}>· {dur}</span> : null}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            {[{ label: 'This Show', value: songs.length }, { label: 'Auto', value: autoCount }, { label: 'Need Fix', value: needsReviewCount }].map(stat => (
              <div key={stat.label} style={{ flex: 1, padding: '10px 12px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, textAlign: 'center' }}>
                <p style={{ fontSize: 20, fontWeight: 800, color: C.gold, margin: 0, fontFamily: '"DM Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>{stat.value}</p>
                <p style={{ fontSize: 9, color: C.muted, margin: '2px 0 0', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, animation: 'fadeUp 0.4s 0.05s ease both' }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted }}>Setlist</span>
          <button onClick={() => setShowAdd(!showAdd)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: showAdd ? C.goldDim : 'transparent', border: `1px solid ${showAdd ? C.borderGold : C.border}`, borderRadius: 20, padding: '5px 10px', color: showAdd ? C.gold : C.muted, fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.06em', transition: 'all 0.15s ease', fontFamily: 'inherit' }}>
            <span style={{ display: 'inline-block', transform: showAdd ? 'rotate(45deg)' : 'rotate(0)', transition: 'transform 0.2s ease', fontSize: 14, lineHeight: 1 }}>+</span>
            Add Song
          </button>
        </div>

        {songs.length > 0 ? <p style={{ fontSize: 11, color: C.muted, margin: '0 0 10px', opacity: 0.7 }}>Tap to edit · Swipe left to delete</p> : null}

        {showAdd ? (
          <div style={{ background: C.card, border: `1px solid ${C.borderGold}`, borderRadius: 12, padding: 14, marginBottom: 10, animation: 'slideUp 0.2s ease' }}>
            <CatalogSearch
              userId={userId}
              placeholder="Search or add a song..."
              autoFocus
              showEmpty
              currentSongs={songs.map(s => s.title)}
              onSelect={(catalogSong) => {
                const normalized = normalizeSong({ title: catalogSong.title, artist: catalogSong.artist || performance?.artist_name || '' })
                setSongs(prev => [...prev, {
                  id:        `manual-${Date.now()}`,
                  title:     normalized.title,
                  artist:    normalized.artist,
                  position:  songs.length + 1,
                  source:    'manual',
                  recognition_decision_id: null,
                  isrc:      catalogSong.isrc      || '',
                  composer:  catalogSong.composer  || '',
                  publisher: catalogSong.publisher || '',
                  reviewState: 'clean',
                }])
                setShowAdd(false)
              }}
            />
            <button onClick={() => setShowAdd(false)} style={{ width: '100%', marginTop: 8, padding: '8px', background: 'transparent', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
          </div>
        ) : null}

        {songs.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', animation: 'fadeUp 0.4s ease' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.card, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Music2 size={22} color={C.muted} />
            </div>
            <p style={{ fontSize: 14, color: C.secondary, margin: 0 }}>No songs detected</p>
            <p style={{ fontSize: 12, color: C.muted, margin: '4px 0 0' }}>Add songs manually above</p>
          </div>
        ) : null}

        {songs.length > 0 ? (
          <div style={{ animation: 'fadeUp 0.4s 0.1s ease both' }}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={songs.map(s => s.id)} strategy={verticalListSortingStrategy}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {songs.map((song, index) => (
                    <SortableRow key={song.id} song={song} index={index} onDelete={handleDelete} onTap={handleRowTap} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        ) : null}

        <div style={{ marginTop: 20, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', animation: 'fadeUp 0.4s 0.15s ease both' }}>
          <button onClick={() => setShowExport(!showExport)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: C.text }}><Download size={14} color={C.gold} />Export for PRO Submission</span>
            <span style={{ fontSize: 10, color: C.muted, transform: showExport ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s ease', display: 'inline-block' }}>▼</span>
          </button>
          {showExport ? (
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
          ) : null}
        </div>

        <div style={{ paddingTop: 14, paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 10, animation: 'fadeUp 0.4s 0.2s ease both' }}>
          {songs.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: allClean ? 'rgba(74,222,128,0.07)' : C.goldDim, border: `1px solid ${allClean ? 'rgba(74,222,128,0.2)' : C.borderGold}`, borderRadius: 10 }}>
              {allClean ? <Check size={13} color={C.green} strokeWidth={2.5} /> : <span style={{ fontSize: 12 }}>!</span>}
              <span style={{ fontSize: 12, fontWeight: 600, color: allClean ? C.green : C.gold }}>
                {allClean ? 'All songs confirmed — this show is ready' : `${needsReviewCount} song${needsReviewCount === 1 ? '' : 's'} in this show need${needsReviewCount === 1 ? 's' : ''} attention`}
              </span>
            </div>
          ) : null}
          <button onClick={handleSave} disabled={saving || saved}
            style={{ width: '100%', padding: '15px', background: saved ? '#16a34a' : C.gold, border: 'none', borderRadius: 12, color: saved ? '#fff' : '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: saving || saved ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, transition: 'all 0.25s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
            {saved ? <><Check size={16} strokeWidth={2.5} /> Saved</> : saving ? <><div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid #0a090840`, borderTopColor: '#0a0908', animation: 'spin 0.7s linear infinite' }} />Saving...</> : 'Save & Complete'}
          </button>
          <button onClick={() => router.push('/app/dashboard')} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', letterSpacing: '0.04em', fontFamily: 'inherit', padding: '6px' }}>
            Back to Dashboard
          </button>
        </div>
      </div>

      {editSheet ? <EditSheet song={editSheet} onSave={handleEdit} onClose={() => setEditSheet(null)} /> : null}

      {assignSheet ? (
        <AssignSheet
          assignSheet={assignSheet}
          onAssign={assignSong}
          onClose={closeAssignSheet}
          onCatalogSelect={assignFromCatalog}
          userId={userId}
          currentSongs={songs.filter(s => s.id !== assignSheet.songId).map(s => s.title)}
        />
      ) : null}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes slideUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes sheetUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        *{-webkit-tap-highlight-color:transparent}
        input::placeholder{color:#6a6050}
        input:focus{border-color:rgba(201,168,76,0.4)!important}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:2px}
      `}</style>
    </div>
  )
}
