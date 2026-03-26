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

const C = {
  bg: '#0a0908', card: '#141210', cardHover: '#181614',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#a09070', muted: '#6a6050',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)', green: '#4ade80', red: '#ef4444',
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
  // 'clean' = user has confirmed/edited this row; 'needs_review' = unidentified
  reviewState?: 'clean' | 'needs_review'
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

type RecentSong = {
  id: string
  title: string
  artist: string
  play_count: number
  last_played: string
}

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

// ─── Swipeable + Sortable Row ─────────────────────────────────────────────────
// Swipe gesture is purely horizontal touch — does not conflict with dnd-kit's
// vertical drag because: (1) drag is initiated only via the GripVertical handle,
// (2) we check deltaX > deltaY before committing to a swipe.

function SortableRow({ song, onDelete, onEdit, onTap, index }: {
  song: Song
  index: number
  onDelete: (id: string) => void
  onEdit: (id: string, title: string, artist: string) => void
  onTap: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: song.id })

  const [swipeX, setSwipeX]     = useState(0)
  const [swiping, setSwiping]   = useState(false)
  const [hovered, setHovered]   = useState(false)
  const touchStart               = useRef<{ x: number; y: number } | null>(null)
  const ACTION_W                 = 140 // total width of action buttons revealed
  const COMMIT_THRESHOLD         = 60  // px to commit open

  const isOpen    = swipeX <= -COMMIT_THRESHOLD
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

    // Only commit to swipe if horizontal motion dominates
    if (!swiping && Math.abs(dx) < 6 && Math.abs(dy) < 6) return
    if (!swiping && Math.abs(dy) > Math.abs(dx)) return // vertical — let dnd handle it

    setSwiping(true)
    const next = isOpen ? Math.min(0, -ACTION_W + dx) : Math.min(0, dx)
    setSwipeX(Math.max(-ACTION_W, next))
  }

  function onTouchEnd() {
    if (!swiping) return
    setSwiping(false)
    touchStart.current = null
    // Snap: if dragged more than threshold, open fully; else close
    setSwipeX(swipeX < -COMMIT_THRESHOLD ? -ACTION_W : 0)
  }

  function closeSwipe() { setSwipeX(0) }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: swiping ? 'none' : transition,
  }

  const leftBorderColor = needsReview
    ? 'rgba(201,168,76,0.6)'   // gold — needs attention
    : 'rgba(74,222,128,0.25)'  // subtle green — clean

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, position: 'relative', borderRadius: 12, overflow: 'hidden', opacity: isDragging ? 0.4 : 1 }}
    >
      {/* ── Action buttons (revealed by swipe) ── */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0,
        width: ACTION_W, display: 'flex',
        pointerEvents: swipeX < -20 ? 'auto' : 'none',
      }}>
        <button
          onClick={() => { closeSwipe(); onTap(song.id) }}
          style={{
            flex: 1, background: C.gold, border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 3, color: '#0a0908',
          }}
        >
          <span style={{ fontSize: 16 }}>✏️</span>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'inherit' }}>Edit</span>
        </button>
        <button
          onClick={() => { closeSwipe(); onDelete(song.id) }}
          style={{
            flex: 1, background: C.red, border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 3, color: '#fff', borderRadius: '0 12px 12px 0',
          }}
        >
          <span style={{ fontSize: 16 }}>🗑️</span>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'inherit' }}>Delete</span>
        </button>
      </div>

      {/* ── Row content (slides left on swipe) ── */}
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
          borderLeft: `3px solid ${leftBorderColor}`,
          borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 14px 14px 12px',
          minHeight: 64,
          cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
          userSelect: 'none',
        }}
      >
        {/* Drag handle — isolated from row tap */}
        <div
          {...attributes}
          {...listeners}
          onClick={e => e.stopPropagation()}
          style={{
            color: C.muted, cursor: 'grab', flexShrink: 0,
            display: 'flex', alignItems: 'center',
            padding: '4px 2px', touchAction: 'none',
          }}
        >
          <GripVertical size={15} />
        </div>

        {/* Position number */}
        <span style={{
          fontSize: 11, fontWeight: 700, color: C.muted,
          minWidth: 18, textAlign: 'right', flexShrink: 0,
          fontFamily: '"DM Mono", monospace', fontVariantNumeric: 'tabular-nums',
        }}>
          {index + 1}
        </span>

        {/* Song info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {needsReview ? (
            <>
              <p style={{ fontSize: 14, fontWeight: 600, color: C.gold, margin: 0, fontStyle: 'italic' }}>
                {isUnknown ? 'Unknown — tap to fix' : song.title}
              </p>
              <p style={{ fontSize: 11, color: C.gold, opacity: 0.6, margin: '2px 0 0', fontWeight: 500 }}>
                Tap to fix
              </p>
            </>
          ) : (
            <>
              <p style={{
                fontSize: 14, fontWeight: 600, color: C.text,
                margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {song.title}
              </p>
              {song.isrc && (
                <p style={{
                  fontSize: 10, color: C.muted, margin: '2px 0 0',
                  fontFamily: '"DM Mono", monospace', letterSpacing: '0.04em',
                }}>
                  {song.isrc}
                </p>
              )}
            </>
          )}
        </div>

        {/* State indicator — becomes delete button on desktop hover */}
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
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          ) : needsReview ? (
            <span style={{ fontSize: 10, color: C.gold, opacity: 0.7, fontWeight: 700 }}>!</span>
          ) : (
            <Check size={13} color={C.green} strokeWidth={2.5} style={{ opacity: 0.5 }} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Hook: tracks keyboard height via visualViewport ─────────────────────────
// Returns the pixel offset to add as marginBottom to bottom sheets so they
// always sit above the software keyboard on mobile.
function useKeyboardOffset() {
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
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update) }
  }, [])
  return offset
}

// ─── Assign sheet (bottom sheet) ─────────────────────────────────────────────
function AssignSheet({ assignSheet, recentSongs, recentLoading, assignSearch, setAssignSearch, onAssign, onClose, onTypeAdd }: {
  assignSheet: { songId: string; currentTitle: string }
  recentSongs: RecentSong[]
  recentLoading: boolean
  assignSearch: string
  setAssignSearch: (v: string) => void
  onAssign: (s: RecentSong) => void
  onClose: () => void
  onTypeAdd: (title: string) => void
}) {
  const bottomOffset = useKeyboardOffset()

  const filtered = assignSearch.trim()
    ? recentSongs.filter(s =>
        s.title.toLowerCase().includes(assignSearch.toLowerCase()) ||
        s.artist.toLowerCase().includes(assignSearch.toLowerCase())
      )
    : recentSongs

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'fadeIn 0.15s ease' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 520, background: '#141210', borderRadius: '20px 20px 0 0', border: '1px solid rgba(255,255,255,0.07)', borderBottom: 'none', padding: '0 0 32px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', animation: 'sheetUp 0.22s ease', fontFamily: '"DM Sans", system-ui, sans-serif', marginBottom: bottomOffset, transition: 'margin-bottom 0.15s ease' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#f0ece3', margin: 0 }}>What song was this?</p>
            {assignSheet.currentTitle && assignSheet.currentTitle !== 'Unknown song' && (
              <p style={{ fontSize: 11, color: '#6a6050', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>replacing: {assignSheet.currentTitle}</p>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#6a6050', cursor: 'pointer', padding: 4, flexShrink: 0, marginLeft: 8 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '0 16px 12px' }}>
          <input
            autoFocus
            value={assignSearch}
            onChange={e => setAssignSearch(e.target.value)}
            placeholder="Type to search or add..."
            style={{ width: '100%', background: '#0f0e0c', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '10px 14px', color: '#f0ece3', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '0 16px' }}>
          {recentLoading ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#6a6050', fontSize: 13 }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '16px 0' }}>
              {assignSearch ? (
                <button onClick={() => onTypeAdd(assignSearch.trim())}
                  style={{ width: '100%', padding: '12px 14px', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: 10, color: '#c9a84c', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                  Add "{assignSearch.trim()}"
                </button>
              ) : (
                <p style={{ textAlign: 'center', color: '#6a6050', fontSize: 13, margin: 0 }}>No recent songs yet</p>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filtered.map(song => (
                <button key={song.id} onClick={() => onAssign(song)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%', WebkitTapHighlightColor: 'transparent' }}
                  onTouchStart={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.08)')}
                  onTouchEnd={e => (e.currentTarget.style.background = 'transparent')}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#f0ece3', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</p>
                    {song.artist && <p style={{ fontSize: 11, color: '#8a7a68', margin: '2px 0 0' }}>{song.artist}</p>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {song.play_count > 1 && <span style={{ fontSize: 10, color: '#c9a84c', opacity: 0.6, fontFamily: '"DM Mono", monospace' }}>×{song.play_count}</span>}
                    <span style={{ fontSize: 12, color: '#6a6050' }}>→</span>
                  </div>
                </button>
              ))}
              {assignSearch.trim() && !filtered.some(s => s.title.toLowerCase() === assignSearch.toLowerCase()) && (
                <button onClick={() => onTypeAdd(assignSearch.trim())}
                  style={{ display: 'flex', alignItems: 'center', padding: '11px 14px', background: 'rgba(201,168,76,0.07)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', width: '100%', marginTop: 4 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#c9a84c', margin: 0 }}>Add "{assignSearch.trim()}"</p>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Inline edit sheet (bottom sheet) ────────────────────────────────────────
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
          onKeyDown={e => e.key === 'Enter' && title.trim() && (onSave(song.id, title.trim(), artist.trim()), onClose())}
          placeholder="Song title"
          style={{ background: C.input, border: `1px solid ${C.gold}40`, borderRadius: 10, padding: '13px 14px', color: C.text, fontSize: 15, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }}
        />
        <input
          value={artist}
          onChange={e => setArtist(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && title.trim() && (onSave(song.id, title.trim(), artist.trim()), onClose())}
          placeholder="Artist"
          style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 10, padding: '13px 14px', color: C.text, fontSize: 15, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }}
        />

        <button
          onClick={() => { if (title.trim()) { onSave(song.id, title.trim(), artist.trim()); onClose() } }}
          disabled={!title.trim()}
          style={{ width: '100%', padding: '14px', background: title.trim() ? C.gold : C.muted, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: title.trim() ? 'pointer' : 'not-allowed', opacity: title.trim() ? 1 : 0.4, fontFamily: 'inherit', marginTop: 4 }}>
          Save
        </button>
      </div>
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
  const [showExport, setShowExport]   = useState(false)
  const [selectedPRO, setSelectedPRO] = useState<PRO>('SOCAN')
  const [editSheet, setEditSheet]     = useState<Song | null>(null)
  const [assignSheet, setAssignSheet] = useState<{ songId: string; currentTitle: string } | null>(null)
  const [recentSongs, setRecentSongs] = useState<RecentSong[]>([])
  const [recentLoading, setRecentLoading] = useState(false)
  const [assignSearch, setAssignSearch] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Require 8px movement before drag starts — prevents accidental drags on tap
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const fetchRecentSongs = useCallback((currentSongs: Song[]) => {
    setRecentLoading(true)
    const exclude = currentSongs
      .filter(s => s.source !== 'unidentified' && s.title !== 'Unknown song')
      .map(s => encodeURIComponent(s.title))
      .join(',')
    const url = exclude ? `/api/recent-songs?exclude=${exclude}` : '/api/recent-songs'
    fetch(url)
      .then(r => r.json())
      .then(data => { if (data.songs) setRecentSongs(data.songs) })
      .catch(err => console.error('[RecentSongs] fetch failed:', err))
      .finally(() => setRecentLoading(false))
  }, [])

  useEffect(() => { fetchRecentSongs([]) }, [fetchRecentSongs])

  function openAssignSheet(songId: string) {
    const song = songs.find(s => s.id === songId)
    setAssignSheet({ songId, currentTitle: song?.title || '' })
    setAssignSearch('')
    fetchRecentSongs(songs.filter(s => s.id !== songId))
  }

  function closeAssignSheet() { setAssignSheet(null); setAssignSearch('') }

  function assignSong(recent: RecentSong) {
    if (!assignSheet) return
    setSongs(prev => prev.map(s =>
      s.id === assignSheet.songId
        ? { ...s, title: recent.title, artist: recent.artist, source: 'manual', reviewState: 'clean' }
        : s
    ))
    closeAssignSheet()
  }

  // Tap row: if unknown/needs review → open assign sheet; else open edit sheet
  function handleRowTap(songId: string) {
    const song = songs.find(s => s.id === songId)
    if (!song) return
    if (song.source === 'unidentified' || song.reviewState === 'needs_review') {
      openAssignSheet(songId)
    } else {
      setEditSheet(song)
    }
  }

  useEffect(() => {
    const supabase = createClient()
    supabase.from('performances').select('*').eq('id', params.id).single()
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
              reviewState: s.source === 'unidentified' ? 'needs_review' : 'clean',
            })))
            setLoading(false); return
          }
        }

        const { data: songData } = await supabase
          .from('performance_songs').select('*')
          .eq('performance_id', params.id).order('position')
        if (songData) {
          setSongs(songData.map(s => ({
            id: s.id || String(s.position),
            title: s.title, artist: s.artist || '',
            position: s.position, source: s.source || 'recognized',
            recognition_decision_id: null,
            isrc: s.isrc || '', composer: s.composer || '', publisher: s.publisher || '',
            reviewState: (s.source === 'unidentified') ? 'needs_review' : 'clean',
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
    setSongs(prev => prev.map(s =>
      s.id === id ? { ...s, title, artist, reviewState: 'clean' } : s
    ))
  }

  function handleAdd() {
    if (!newTitle.trim()) return
    setSongs(prev => [...prev, {
      id: `manual-${Date.now()}`,
      title: newTitle.trim(),
      artist: newArtist.trim() || (performance?.artist_name || ''),
      position: songs.length + 1,
      source: 'manual', recognition_decision_id: null,
      isrc: '', composer: '', publisher: '',
      reviewState: 'clean',
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
        performance_id: performance.id, title: s.title, artist: s.artist,
        position: i + 1, isrc: s.isrc || null,
        composer: s.composer || null, publisher: s.publisher || null,
      }))
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
      console.error('[ReviewSave] user_songs write failed:', err)
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
      const composer = s.composer || '', publisher = s.publisher || '', isrc = s.isrc || ''
      if (pro === 'SOCAN') return [s.title, s.artist, composer, publisher, isrc, '', date, performance.venue_name, performance.city]
      if (pro === 'ASCAP') return [s.title, performance.artist_name, composer, publisher, isrc, performance.venue_name, date, performance.city, performance.country || '']
      return [s.title, performance.artist_name, '', composer, publisher, performance.venue_name, date, performance.city]
    })
    const csv  = [headers[pro], ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${pro}-setlist-${performance.venue_name}-${new Date(performance.started_at).toLocaleDateString().replace(/\//g, '-')}.csv`
    a.click(); URL.revokeObjectURL(url)
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

  const autoCount     = songs.filter(s => s.source === 'recognized' || s.source === 'detected').length
  const needsReviewCount = songs.filter(s => s.source === 'unidentified' || s.reviewState === 'needs_review').length
  const allClean      = needsReviewCount === 0
  const dur           = formatDuration()

  // ── Completion screen ──────────────────────────────────────────────────────
  if (showComplete) {
    const royaltyLow  = Math.round(songs.length * 1.25 * 0.7)
    const royaltyHigh = Math.round(songs.length * 1.25 * 1.3)

    return (
      <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
        <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '60vh', pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.08) 0%, transparent 65%)' }} />
        <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', animation: 'fadeUp 0.5s ease' }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, color: C.text, margin: '0 0 10px', letterSpacing: '-0.03em', lineHeight: 1.15 }}>
            You just tracked<br />a real setlist.
          </h1>
          <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 28px' }}>
            {performance?.venue_name}{performance?.city ? ` · ${performance.city}` : ''}
          </p>

          <div style={{ width: '100%', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 18, padding: '24px 20px', marginBottom: 16, animation: 'fadeUp 0.5s 0.1s ease both' }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold, margin: '0 0 8px' }}>Estimated Royalties</p>
            <p style={{ fontSize: 42, fontWeight: 800, color: C.gold, margin: '0 0 4px', letterSpacing: '-0.03em', fontFamily: '"DM Mono", monospace' }}>${royaltyLow}–${royaltyHigh}</p>
            <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 16px' }}>{songs.length} songs · {autoCount > 0 ? `${autoCount} auto-detected` : 'all manual'}</p>
            <div style={{ borderTop: `1px solid rgba(201,168,76,0.2)`, paddingTop: 14 }}>
              <p style={{ fontSize: 13, color: C.gold, margin: 0, fontWeight: 600, lineHeight: 1.5 }}>Most artists never report this.</p>
              <p style={{ fontSize: 12, color: C.secondary, margin: '4px 0 0', lineHeight: 1.5 }}>Export your setlist to claim what you've earned.</p>
            </div>
          </div>

          <div style={{ width: '100%', background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px', marginBottom: 16, maxHeight: 200, overflowY: 'auto', animation: 'fadeUp 0.5s 0.15s ease both' }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 12px' }}>Tonight's Setlist</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {songs.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 10, color: C.muted, minWidth: 16, textAlign: 'right', fontFamily: '"DM Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
                  <p style={{ fontSize: 13, color: C.text, margin: 0, fontWeight: 600, flex: 1, textAlign: 'left' }}>{s.title}</p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ width: '100%', background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px', marginBottom: 20, animation: 'fadeUp 0.5s 0.2s ease both' }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Download size={10} />Export for PRO Submission
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(['SOCAN', 'ASCAP', 'BMI'] as PRO[]).map(pro => (
                <button key={pro} onClick={() => generateExportCSV(pro)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = C.gold + '60'; el.style.color = C.gold; el.style.background = C.goldDim }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = C.border; el.style.color = C.text; el.style.background = 'transparent' }}>
                  <span>{pro}</span>
                  <span style={{ fontSize: 11, color: C.muted }}>{pro === 'SOCAN' ? 'Canada' : 'USA'} · CSV ↓</span>
                </button>
              ))}
            </div>
          </div>

          <button onClick={() => router.push(`/app/submit/${params.id}`)}
            style={{ width: '100%', padding: '15px', background: C.gold, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', marginBottom: 10, animation: 'fadeUp 0.5s 0.25s ease both', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
            💰 Submit to Get Paid
          </button>
          <button onClick={() => router.push('/app/dashboard')}
            style={{ width: '100%', padding: '13px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 12, color: C.secondary, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 12, animation: 'fadeUp 0.5s 0.3s ease both', fontFamily: 'inherit' }}>
            Back to Dashboard
          </button>
          <button onClick={() => setShowComplete(false)} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', letterSpacing: '0.04em' }}>
            Back to Review
          </button>
        </div>
      </div>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
          @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        `}</style>
    </div>
    )
  }

  // ── Main review view ───────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>

      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100vw', height: '40vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.05) 0%, transparent 65%)' }} />

      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 480, width: '100%', margin: '0 auto', padding: '0 16px', boxSizing: 'border-box' }}>

        {/* Header */}
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
            {dur && <span style={{ fontSize: 12, color: C.secondary }}>· {dur}</span>}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            {[
              { label: 'Songs',    value: songs.length },
              { label: 'Detected', value: autoCount },
              { label: 'Manual',   value: songs.length - autoCount },
            ].map(stat => (
              <div key={stat.label} style={{ flex: 1, padding: '10px 12px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, textAlign: 'center' }}>
                <p style={{ fontSize: 20, fontWeight: 800, color: C.gold, margin: 0, fontFamily: '"DM Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>{stat.value}</p>
                <p style={{ fontSize: 9, color: C.muted, margin: '2px 0 0', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Setlist header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, animation: 'fadeUp 0.4s 0.05s ease both' }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted }}>Setlist</span>
          <button
            onClick={() => setShowAdd(!showAdd)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: showAdd ? C.goldDim : 'transparent', border: `1px solid ${showAdd ? C.borderGold : C.border}`, borderRadius: 20, padding: '5px 10px', color: showAdd ? C.gold : C.muted, fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.06em', transition: 'all 0.15s ease', fontFamily: 'inherit' }}>
            <span style={{ display: 'inline-block', transform: showAdd ? 'rotate(45deg)' : 'rotate(0)', transition: 'transform 0.2s ease', fontSize: 14, lineHeight: 1 }}>+</span>
            Add Song
          </button>
        </div>

        {/* Swipe hint — shown once */}
        {songs.length > 0 && (
          <p style={{ fontSize: 11, color: C.muted, margin: '0 0 10px', opacity: 0.7, letterSpacing: '0.02em' }}>
            Tap to edit · Swipe left to delete
          </p>
        )}

        {/* Add song panel */}
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

        {/* Empty state */}
        {songs.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', animation: 'fadeUp 0.4s ease' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.card, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Music2 size={22} color={C.muted} />
            </div>
            <p style={{ fontSize: 14, color: C.secondary, margin: 0 }}>No songs detected</p>
            <p style={{ fontSize: 12, color: C.muted, margin: '4px 0 0' }}>Add songs manually above</p>
          </div>
        )}

        {/* Song list */}
        {songs.length > 0 && (
          <div style={{ animation: 'fadeUp 0.4s 0.1s ease both' }}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={songs.map(s => s.id)} strategy={verticalListSortingStrategy}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {songs.map((song, index) => (
                    <SortableRow
                      key={song.id}
                      song={song}
                      index={index}
                      onDelete={handleDelete}
                      onEdit={handleEdit}
                      onTap={handleRowTap}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}

        {/* Export accordion */}
        <div style={{ marginTop: 20, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden', animation: 'fadeUp 0.4s 0.15s ease both' }}>
          <button onClick={() => setShowExport(!showExport)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: C.text }}>
              <Download size={14} color={C.gold} />Export for PRO Submission
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

        {/* Dynamic helper + CTA */}
        <div style={{ paddingTop: 14, paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 10, animation: 'fadeUp 0.4s 0.2s ease both' }}>

          {/* Dynamic status line */}
          {songs.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: allClean ? 'rgba(74,222,128,0.07)' : C.goldDim, border: `1px solid ${allClean ? 'rgba(74,222,128,0.2)' : C.borderGold}`, borderRadius: 10 }}>
              {allClean
                ? <Check size={13} color={C.green} strokeWidth={2.5} />
                : <span style={{ fontSize: 12 }}>!</span>
              }
              <span style={{ fontSize: 12, fontWeight: 600, color: allClean ? C.green : C.gold }}>
                {allClean
                  ? 'All songs confirmed'
                  : `${needsReviewCount} song${needsReviewCount === 1 ? '' : 's'} need${needsReviewCount === 1 ? 's' : ''} review`
                }
              </span>
            </div>
          )}

          <button onClick={handleSave} disabled={saving || saved}
            style={{ width: '100%', padding: '15px', background: saved ? '#16a34a' : C.gold, border: 'none', borderRadius: 12, color: saved ? '#fff' : '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: saving || saved ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, transition: 'all 0.25s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
            {saved
              ? <><Check size={16} strokeWidth={2.5} /> Saved</>
              : saving
                ? <><div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid #0a090840`, borderTopColor: '#0a0908', animation: 'spin 0.7s linear infinite' }} />Saving...</>
                : 'Save & Complete'
            }
          </button>

          <button onClick={() => router.push('/app/dashboard')} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', letterSpacing: '0.04em', fontFamily: 'inherit', padding: '6px' }}>
            Back to Dashboard
          </button>
        </div>
      </div>

      {/* Edit sheet */}
      {editSheet && (
        <EditSheet
          song={editSheet}
          onSave={handleEdit}
          onClose={() => setEditSheet(null)}
        />
      )}

      {/* Assign sheet */}
      {assignSheet && (
        <AssignSheet
          assignSheet={assignSheet}
          recentSongs={recentSongs}
          recentLoading={recentLoading}
          assignSearch={assignSearch}
          setAssignSearch={setAssignSearch}
          onAssign={assignSong}
          onClose={closeAssignSheet}
          onTypeAdd={(title) => {
            if (!assignSheet) return
            setSongs(prev => prev.map(s => s.id === assignSheet.songId ? { ...s, title, source: 'manual', reviewState: 'clean' } : s))
            closeAssignSheet()
          }}
        />
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(6px)}  to{opacity:1;transform:translateY(0)} }
        @keyframes sheetUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
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
