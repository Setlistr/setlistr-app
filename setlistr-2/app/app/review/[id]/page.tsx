'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useActingAs } from '@/components/ActingAsProvider'
import { logProductEvent, awaitWithTimeout, type ReviewActionType } from '@/lib/telemetry'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Download, Check, X, ChevronRight, AlertCircle, Info, ImagePlus } from 'lucide-react'
import { estimateRoyalties, capacityToBand } from '@/lib/royalty-estimate'
import CatalogSearch, { type CatalogSong } from '@/components/CatalogSearch'
import { normalizeSong } from '@/lib/song-utils'
import { PlannedVsPlayed } from '@/components/PlannedVsPlayed'
import SongDebutCard from '@/components/share-cards/SongDebutCard'
import RoyaltyMomentCard from '@/components/share-cards/RoyaltyMomentCard'
import { NightCard, MilestoneCard } from '@/components/share-cards/RecordCards'
import { exportShareCard, type ShareFormat } from '@/lib/share-card-export'
import { countAt, capturedLabel, type FlowSource } from '@/lib/ceremony-display'
import { ESTIMATE_DISCLAIMER, ESTIMATE_UNIT, formatEstimate } from '@/lib/estimate-copy'
import { PageFrame } from '@/components/ui/PageFrame'
import { LoadError } from '@/components/ui/LoadError'
import { Skeleton } from '@/components/ui/Skeleton'
import { useWorkspaceRole } from '@/components/layout/WorkspaceRole'
import { RecordFinish, ORB_GOLD, type RecordFinishData } from '@/components/record/RecordFinish'
import { isCapturedShow } from '@/lib/performance-status'
import { summarizeRecord, milestoneHeldBy, MILESTONE_STEP } from '@/lib/record-summary'
import { showDay } from '@/lib/show-date'

const C = {
  bg: 'var(--sl-bg)', card: 'var(--sl-surface)', cardGrad: 'var(--sl-card-bg)', cardHover: 'var(--sl-surface-2)',
  border: 'color-mix(in srgb, var(--sl-text) 7%, transparent)', borderGold: 'color-mix(in srgb, var(--sl-accent) 30%, transparent)',
  input: 'var(--sl-input-bg)', text: 'var(--sl-text)', secondary: 'var(--sl-text-2)', muted: 'var(--sl-text-3)',
  gold: 'var(--sl-accent)', goldDim: 'color-mix(in srgb, var(--sl-accent) 10%, transparent)', green: 'var(--sl-ok)', red: 'var(--sl-danger)',
}

// Real ordinals: 1st, 2nd, 3rd, 4th … 11th, 12th, 13th, 21st.
function ordinal(n: number): string {
  const v = n % 100
  return n + (v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] || 'th')
}

function useCountUp(target: number, duration: number = 1200, delay: number = 0): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (target === 0) return
    // Reduced motion: the real number, immediately.
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setCount(target); return }
    let startTime: number | null = null
    let animFrame: number
    const delayTimer = setTimeout(() => {
      function step(timestamp: number) {
        if (!startTime) startTime = timestamp
        const progress = Math.min((timestamp - startTime) / duration, 1)
        setCount(countAt(progress, target))
        if (progress < 1) animFrame = requestAnimationFrame(step)
        else setCount(target)
      }
      animFrame = requestAnimationFrame(step)
    }, delay)
    return () => { clearTimeout(delayTimer); cancelAnimationFrame(animFrame) }
  }, [target, duration, delay])
  return count
}

function getMatchConfidence(song: {
  source?: string; isrc?: string; composer?: string; reviewState?: string
}): 'matched' | 'partial' | 'unverified' | 'none' {
  const isAutoDetected = (
    song.source === 'recognized' || song.source === 'detected' ||
    song.source === 'fingerprint' || song.source === 'humming'
  )
  if (!isAutoDetected) return 'none'
  if (song.isrc && song.composer) return 'matched'
  if (song.isrc || song.composer) return 'partial'
  return 'unverified'
}

function getTerritory(country?: string | null, city?: string | null): string {
  const s = ((country || '') + ' ' + (city || '')).toLowerCase()
  if (s.includes('canada') || s.includes('ontario') || s.includes('british columbia')
    || s.includes('alberta') || s.includes('quebec') || s.includes('toronto')
    || s.includes('vancouver') || s.includes('montreal') || s.trim() === 'ca') return 'CA'
  return 'US'
}

type Song = {
  id: string; title: string; artist: string; position: number
  source?: string; recognition_decision_id?: string | null
  isrc?: string; composer?: string; publisher?: string
  reviewState?: 'clean' | 'needs_review'
  was_planned?: boolean
  // Confusion-matrix tracking (in-place, no delete/reinsert on save)
  origTitle?: string; origArtist?: string            // detected values, for the "was …" note
  isModified?: boolean; isRemoved?: boolean; isNew?: boolean
  inclusion_reason?: string | null; threshold?: number | null; score?: number | null
  confusion_matrix_result?: string
}

type Performance = {
  id: string; user_id: string; artist_name: string; venue_name: string; city: string
  country: string; started_at: string; ended_at: string
  set_duration_minutes: number; setlist_id?: string | null
  show_id?: string | null; show_type?: string | null; venue_capacity?: number | null
  status?: string | null
  data_source?: string | null
  performance_date?: string | null; created_at?: string | null
  // The linked show's IANA zone (shows.timezone); 'UTC' is its unset placeholder.
  show_timezone?: string | null
}

type PRO = 'SOCAN' | 'ASCAP' | 'BMI'
type RecentSong = { id: string; title: string; artist: string; play_count: number; last_played: string }
type ShowIntelligence = {
  totalShows: number
  capturedShows: number
  venueVisits: number
  songDebuts: string[]
  milestone: number | null
}

// performances.status allows only draft/live/processing/review/complete
// (supabase-schema.sql); any other value is rejected with 23514. shows.status
// is a separate vocabulary that does use 'completed'.
const PERFORMANCE_COMPLETE = 'complete'

function useKeyboardOffset(): number {
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    function update() { setOffset(Math.max(0, window.innerHeight - vv!.height - vv!.offsetTop)) }
    vv.addEventListener('resize', update); vv.addEventListener('scroll', update); update()
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update) }
  }, [])
  return offset
}

function ShareCardButton({ performanceId, artistName, venueName }: {
  performanceId: string; artistName?: string; venueName?: string
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  async function handleShare() {
    setState('loading')
    try {
      const imageUrl = `/api/og/${performanceId}`
      if (navigator.share) {
        try {
          const res = await fetch(imageUrl)
          const blob = await res.blob()
          const file = new File([blob], 'setlist.png', { type: 'image/png' })
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: `${artistName} at ${venueName}`, text: "Check out my setlist from tonight's show — tracked with Setlistr" })
            setState('done'); setTimeout(() => setState('idle'), 3000); return
          }
        } catch {}
        await navigator.share({ title: `${artistName} at ${venueName}`, text: "Check out my setlist from tonight's show", url: `https://setlistr.ai/s/${performanceId}` })
        setState('done'); setTimeout(() => setState('idle'), 3000); return
      }
      window.open(imageUrl, '_blank')
      setState('done'); setTimeout(() => setState('idle'), 3000)
    } catch { setState('idle') }
  }
  return (
    <button onClick={handleShare} disabled={state === 'loading'}
      style={{ width: '100%', padding: '14px', background: state === 'done' ? 'color-mix(in srgb, var(--sl-ok) 8%, transparent)' : 'transparent', border: `1px solid ${state === 'done' ? 'color-mix(in srgb, var(--sl-ok) 30%, transparent)' : 'color-mix(in srgb, var(--sl-accent) 30%, transparent)'}`, borderRadius: 12, color: state === 'done' ? C.green : C.gold, fontSize: 13, fontWeight: 700, cursor: state === 'loading' ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', marginBottom: 10, letterSpacing: '0.04em', WebkitTapHighlightColor: 'transparent', opacity: state === 'loading' ? 0.7 : 1, transition: 'all 0.2s ease' }}>
      {state === 'loading' ? <><div style={{ width: 13, height: 13, borderRadius: '50%', border: `2px solid color-mix(in srgb, var(--sl-accent) 30%, transparent)`, borderTopColor: C.gold, animation: 'spin 0.7s linear infinite' }} />Generating card...</> : state === 'done' ? <>✓ Card ready</> : <>✦ Share Setlist Card</>}
    </button>
  )
}

const AUTO_SOURCES = ['recognized', 'detected', 'fingerprint', 'humming']
// A kept song with was_planned set is on the planned setlist. Its stored source
// says what confirmed it: a recognition source means recognition matched the
// plan (live capture); 'manual' means the artist marked it played (live capture
// or Review). Anything else is ambiguous and gets the common label.
function verificationLabel(song: { source?: string }): string {
  if (AUTO_SOURCES.includes(song.source || '')) return 'Matched setlist ✓'
  if (song.source === 'manual') return 'Played from setlist ✓'
  return 'On your setlist ✓'
}
function sourceLine(song: Song): string {
  const origin = song.was_planned && song.source !== 'planned' ? verificationLabel(song).replace(' ✓', '')
    : song.source === 'unidentified' ? 'Not identified'
    : AUTO_SOURCES.includes(song.source || '') ? 'Detected' : 'Added by you'
  return [origin, song.isrc ? `ISRC ${song.isrc}` : null].filter(Boolean).join(' · ')
}

// One row of the setlist (Review revision 3). Named songs are quiet: the title
// and a chevron. An unidentified song is the one thing in amber. The drag
// handle and the remove control appear only in EDIT; outside it, swiping left
// still reveals Edit and Delete as a shortcut (with UNDO after a delete).
function SortableRow({ song, index, onDelete, onTap, editMode, locked, first }: {
  song: Song; index: number; onDelete: (id: string) => void; onTap: (id: string) => void; editMode: boolean; locked: boolean; first: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: song.id, disabled: !editMode || locked })
  const [swipeX, setSwipeX]   = useState(0)
  const [swiping, setSwiping] = useState(false)
  const touchStart             = useRef<{ x: number; y: number } | null>(null)
  const ACTION_W = 140; const THRESHOLD = 60
  const isOpen = swipeX <= -THRESHOLD
  const isUnknown = song.source === 'unidentified'
  const needsReview = isUnknown || song.reviewState === 'needs_review'
  const canSwipe = !editMode && !locked

  function onTouchStart(e: React.TouchEvent) { if (!canSwipe) return; touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; setSwiping(false) }
  function onTouchMove(e: React.TouchEvent) {
    if (!touchStart.current || !canSwipe) return
    const dx = e.touches[0].clientX - touchStart.current.x
    const dy = e.touches[0].clientY - touchStart.current.y
    if (!swiping && Math.abs(dx) < 6 && Math.abs(dy) < 6) return
    if (!swiping && Math.abs(dy) > Math.abs(dx)) return
    setSwiping(true)
    const next = isOpen ? Math.min(0, -ACTION_W + dx) : Math.min(0, dx)
    setSwipeX(Math.max(-ACTION_W, next))
  }
  function onTouchEnd() { if (!swiping) return; setSwiping(false); touchStart.current = null; setSwipeX(swipeX < -THRESHOLD ? -ACTION_W : 0) }
  function closeSwipe() { setSwipeX(0) }

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition: swiping ? 'none' : transition, position: 'relative', overflow: 'hidden', opacity: isDragging ? 0.4 : 1, borderTop: first ? 'none' : '1px solid var(--sl-line)' }}>
      {canSwipe && (
        // The swipe actions exist for touch only until a swipe reveals them:
        // hidden from assistive technology and the tab order until then.
        <div aria-hidden={swipeX < -20 ? undefined : true} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: ACTION_W, display: 'flex', pointerEvents: swipeX < -20 ? 'auto' : 'none' }}>
          <button tabIndex={swipeX < -20 ? 0 : -1} onClick={() => { closeSwipe(); onTap(song.id) }} style={{ flex: 1, background: C.gold, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sl-on-accent)', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'inherit' }}>Edit</button>
          <button tabIndex={swipeX < -20 ? 0 : -1} onClick={() => { closeSwipe(); onDelete(song.id) }} style={{ flex: 1, background: C.red, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sl-on-accent)', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'inherit' }}>Delete</button>
        </div>
      )}
      <div
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onClick={() => { if (locked) return; if (swipeX < -10) { closeSwipe(); return } if (!editMode) onTap(song.id) }}
        // The row is the keyboard and screen-reader way in (Enter or Space opens
        // the song sheet), so the swipe actions never need to be reachable.
        onKeyDown={e => { if (editMode || locked) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(song.id) } }}
        tabIndex={editMode || locked ? -1 : 0} className="rv-row"
        role={editMode ? undefined : 'button'} aria-label={editMode ? undefined : (isUnknown ? `Song ${index + 1}, not identified. Name it` : `${song.title}. Open`)}
        style={{ transform: `translateX(${swipeX}px)`, transition: swiping ? 'none' : 'transform 0.22s cubic-bezier(0.25,1,0.5,1)', background: needsReview ? 'color-mix(in srgb, var(--sl-warn) 9%, var(--sl-group))' : isDragging ? C.cardHover : 'var(--sl-group)', display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px 8px 14px', minHeight: 54, cursor: locked || editMode ? 'default' : 'pointer', WebkitTapHighlightColor: 'transparent', userSelect: 'none' }}>
        {editMode && (
          <div {...attributes} {...listeners} onClick={e => e.stopPropagation()} aria-label={`Reorder ${isUnknown ? 'song ' + (index + 1) : song.title}`}
            style={{ color: C.muted, cursor: 'grab', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 44, margin: '-6px -6px -6px -8px', touchAction: 'none' }}>
            <GripVertical size={16} />
          </div>
        )}
        <span style={{ fontSize: 12.5, color: C.muted, minWidth: 20, textAlign: 'right', flexShrink: 0, fontFamily: '"DM Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>{index + 1}</span>
        {needsReview ? (
          <p style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 16.5, fontWeight: 600, color: 'var(--sl-warn)', margin: 0 }}>
            <AlertCircle size={16} aria-hidden="true" style={{ flexShrink: 0 }} />{isUnknown ? 'Name this song' : song.title}
          </p>
        ) : (
          <p style={{ flex: 1, minWidth: 0, fontSize: 16.5, fontWeight: 500, color: C.text, margin: 0, lineHeight: 1.28, letterSpacing: '-0.01em', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' } as React.CSSProperties}>{song.title}</p>
        )}
        {editMode ? (
          <button onClick={e => { e.stopPropagation(); if (!locked) onDelete(song.id) }} disabled={locked} aria-label={`Remove ${isUnknown ? 'song ' + (index + 1) : song.title}`}
            style={{ flexShrink: 0, width: 44, height: 44, margin: '-6px -6px -6px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, background: 'color-mix(in srgb, var(--sl-danger) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--sl-danger) 30%, transparent)', color: C.red, cursor: 'pointer' }}>
            <X size={17} strokeWidth={2.5} />
          </button>
        ) : (
          <ChevronRight size={18} aria-hidden="true" style={{ flexShrink: 0, color: needsReview ? 'var(--sl-warn)' : 'var(--sl-text-4)' }} />
        )}
      </div>
    </div>
  )
}

// Where a song came from, said once, in the song sheet (provenance stays out
// of the list). DETECTED/ADDED before the save; VERIFIED is only ever said
// after a confirmed save, on the recap.
function songFacts(song: Song): { chip: 'Detected' | 'Added'; source: string } {
  const auto = AUTO_SOURCES.includes(song.source || '')
  const plannedPlayed = song.source === 'manual' && song.was_planned && song.inclusion_reason === 'planned setlist - not detected'
  const source = auto ? 'Recognised during the show'
    : plannedPlayed ? 'Marked played from your planned setlist'
    : song.isNew ? 'Added by you in Review'
    : song.isModified && song.origTitle === 'Unknown Song' ? 'Named by you in Review'
    : 'Added during the show'
  return { chip: auto ? 'Detected' : 'Added', source: song.isModified && !song.isNew && auto ? `${source} · edited` : source }
}

// One sheet per song: its facts, its title and artist, DONE, and REMOVE SONG.
function SongSheet({ song, position, total, onSave, onRemove, onClose }: {
  song: Song; position: number; total: number
  onSave: (id: string, title: string, artist: string) => void; onRemove: (id: string) => void; onClose: () => void
}) {
  const facts = songFacts(song)
  const [title, setTitle]   = useState(song.title.toLowerCase() === 'unknown song' ? '' : song.title)
  const [artist, setArtist] = useState(song.artist)
  const bottomOffset        = useKeyboardOffset()
  const done = () => {
    if (!title.trim()) return
    if (title.trim() !== song.title || artist.trim() !== song.artist) onSave(song.id, title.trim(), artist.trim())
    onClose()
  }
  const fact = (k: string, v: React.ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 42, borderBottom: '1px solid var(--sl-line)', fontSize: 14.5 }}>
      <span style={{ color: C.muted }}>{k}</span><span style={{ color: C.text, textAlign: 'right' }}>{v}</span>
    </div>
  )
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'fadeIn 0.15s ease' }} onClick={onClose}>
      <div role="dialog" aria-label={`Song ${position} of ${total}`} onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, background: 'var(--sl-sheet)', borderRadius: '22px 22px 0 0', borderTop: '1px solid color-mix(in srgb, var(--sl-text) 12%, transparent)', boxShadow: '0 -24px 48px rgba(0,0,0,0.5)', padding: '10px 20px calc(24px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 8, animation: 'sheetUp 0.22s ease', fontFamily: '"DM Sans", system-ui, sans-serif', marginBottom: bottomOffset, transition: 'margin-bottom 0.15s ease' }}>
        <div aria-hidden="true" style={{ width: 38, height: 5, borderRadius: 3, background: 'color-mix(in srgb, var(--sl-text) 22%, transparent)', margin: '0 auto 6px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.secondary, background: 'color-mix(in srgb, var(--sl-text) 7%, transparent)', borderRadius: 7, padding: '5px 9px' }}>{facts.chip}</span>
          <button onClick={onClose} aria-label="Close" style={{ width: 44, height: 44, marginRight: -10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: C.secondary, cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <label style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>Title · song {position} of {total}
          <input value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') done() }} placeholder="Song title" spellCheck={false} autoCorrect="off" autoCapitalize="words" style={{ display: 'block', marginTop: 5, background: C.input, border: '1px solid var(--sl-input-line-active)', borderRadius: 12, padding: '13px 14px', color: C.text, fontSize: 16, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>Artist
          <input value={artist} onChange={e => setArtist(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') done() }} placeholder="Artist" spellCheck={false} autoCorrect="off" autoCapitalize="words" style={{ display: 'block', marginTop: 5, background: C.input, border: '1px solid var(--sl-input-line)', borderRadius: 12, padding: '13px 14px', color: C.text, fontSize: 16, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
        </label>
        <div style={{ borderTop: '1px solid var(--sl-line)', margin: '4px 0 8px' }}>
          {fact('Source', facts.source)}
          {fact('Planned setlist', song.was_planned ? 'On it' : 'Not on it')}
          {fact('Writer', song.composer || <span style={{ color: C.muted }}>Not on file</span>)}
          {song.isrc ? fact('ISRC', <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 13 }}>{song.isrc}</span>) : null}
        </div>
        <button onClick={done} disabled={!title.trim()} style={{ width: '100%', minHeight: 52, background: title.trim() ? C.gold : C.muted, border: 'none', borderRadius: 14, color: 'var(--sl-on-accent)', fontSize: 14.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: title.trim() ? 'pointer' : 'not-allowed', opacity: title.trim() ? 1 : 0.5, fontFamily: 'inherit' }}>
          Done
        </button>
        <button onClick={() => { onRemove(song.id); onClose() }} style={{ minHeight: 44, background: 'none', border: 'none', color: C.red, fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' }}>
          Remove song
        </button>
      </div>
    </div>
  )
}

function AssignSheet({ assignSheet, onAssign, onClose, onCatalogSelect, onRemove, userId, currentSongs }: {
  assignSheet: { songId: string; currentTitle: string }; onAssign: (s: RecentSong) => void
  onClose: () => void; onCatalogSelect: (song: CatalogSong, songId: string) => void
  onRemove: (id: string) => void
  userId: string | null; currentSongs: string[]
}) {
  const bottomOffset = useKeyboardOffset()
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'fadeIn 0.15s ease' }} onClick={onClose}>
      <div role="dialog" aria-label="What song was this?" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, background: 'var(--sl-sheet)', borderRadius: '22px 22px 0 0', borderTop: '1px solid color-mix(in srgb, var(--sl-text) 12%, transparent)', boxShadow: '0 -24px 48px rgba(0,0,0,0.5)', padding: '16px 20px calc(20px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 12, animation: 'sheetUp 0.22s ease', fontFamily: '"DM Sans", system-ui, sans-serif', marginBottom: bottomOffset, transition: 'margin-bottom 0.15s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div>
            <p style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--sl-warn)', background: 'color-mix(in srgb, var(--sl-warn) 10%, transparent)', borderRadius: 7, padding: '5px 9px', margin: '0 0 8px' }}><AlertCircle size={13} aria-hidden="true" />Not identified</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: 0 }}>What song was this?</p>
            {assignSheet.currentTitle && assignSheet.currentTitle.toLowerCase() !== 'unknown song' ? <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 0' }}>replacing: {assignSheet.currentTitle}</p> : null}
          </div>
          <button onClick={onClose} aria-label="Close" style={{ width: 44, height: 44, marginRight: -10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: C.secondary, cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <CatalogSearch userId={userId} placeholder="Search or type any song title..." autoFocus showEmpty currentSongs={currentSongs} onSelect={(song) => onCatalogSelect(song, assignSheet.songId)} />
        <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 0', lineHeight: 1.5, textAlign: 'center' }}>Search your catalog or type any title to add it</p>
        <button onClick={() => { onRemove(assignSheet.songId); onClose() }} style={{ minHeight: 44, background: 'none', border: 'none', color: C.red, fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' }}>
          Remove song
        </button>
      </div>
    </div>
  )
}

function PlannedSongRow({ song, onPlayed, onRemove, locked, first }: {
  song: Song
  onPlayed: (id: string) => void
  onRemove: (id: string) => void
  locked: boolean; first: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, padding: '6px 8px 6px 14px', borderTop: first ? 'none' : '1px solid var(--sl-line)' }}>
      <p style={{ fontSize: 16, fontWeight: 400, color: C.secondary, margin: 0, flex: 1, minWidth: 0, lineHeight: 1.28, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' } as React.CSSProperties}>
        {song.title}
      </p>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button onClick={() => onPlayed(song.id)} disabled={locked}
          style={{ minHeight: 44, minWidth: 64, padding: '0 12px', background: 'transparent', border: '1px solid color-mix(in srgb, var(--sl-text) 22%, transparent)', borderRadius: 11, color: C.text, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: locked ? 'default' : 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>
          Played
        </button>
        <button onClick={() => onRemove(song.id)} disabled={locked} aria-label={`Skip ${song.title}: not played`}
          style={{ minHeight: 44, minWidth: 64, padding: '0 12px', background: 'transparent', border: '1px solid var(--sl-line)', borderRadius: 11, color: C.secondary, fontSize: 12.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: locked ? 'default' : 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>
          Skip
        </button>
      </div>
    </div>
  )
}

export default function ReviewPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { actingAsArtistId } = useActingAs()
  const [performance, setPerformance]   = useState<Performance | null>(null)
  const [setlistId, setSetlistId]       = useState<string | null>(null)
  const [songs, setSongs]               = useState<Song[]>([])
  const [loading, setLoading]           = useState(true)
  // A failed load is never shown as an empty show, and nothing can be saved
  // until the show and its songs have loaded (docs/ui-standard.md → Errors).
  const [loadError, setLoadError]       = useState<'show' | 'missing' | null>(null)
  const [songsError, setSongsError]     = useState(false)
  const [reloadKey, setReloadKey]       = useState(0)
  const [photoError, setPhotoError]     = useState(false)
  // Edit mode: a tap alternative to swipe-to-remove.
  const [editMode, setEditMode]         = useState(false)
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(false)
  const [showComplete, setShowComplete] = useState(false)
  const [justCompleted, setJustCompleted] = useState(false)
  const [computedShowNumber, setComputedShowNumber] = useState<number | null>(null)
  // The record counter shown after the save, counted as the dashboard counts.
  const [recordFinish, setRecordFinish] = useState<RecordFinishData>({ status: 'loading' })
  const [orbLanded, setOrbLanded] = useState(false)
  // The milestone this show holds on the artist's record (25, 50, 75…), if
  // any: earned by the show's place in show-date order, not by this save.
  const [heldMilestone, setHeldMilestone] = useState<number | null>(null)
  const [shareFormat, setShareFormat] = useState<ShareFormat>('story')
  const [shareState, setShareState] = useState<'idle' | 'working' | 'failed'>('idle')
  const venueHeadingRef = useRef<HTMLHeadingElement>(null)
  const pipRef = useRef<HTMLSpanElement>(null)
  const [activeCardIndex, setActiveCardIndex] = useState(0)
  const [newTitle, setNewTitle]         = useState('')
  const [newArtist, setNewArtist]       = useState('')
  const [showAdd, setShowAdd]           = useState(false)
  const [showExport, setShowExport]     = useState(false)
  const [selectedPRO, setSelectedPRO]   = useState<PRO>('SOCAN')
  const [editSheet, setEditSheet]       = useState<Song | null>(null)
  // UNDO for the last removed or skipped song (5 seconds), and the explicit
  // confirmation before saving a show with no songs.
  const [undo, setUndo]                 = useState<{ song: Song; index: number; label: string } | null>(null)
  const undoTimerRef                    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [emptyConfirm, setEmptyConfirm] = useState(false)
  const plannedRef                      = useRef<HTMLDivElement>(null)
  const keyboardOffset                  = useKeyboardOffset()
  const [aboutVerified, setAboutVerified] = useState(false)
  const [assignSheet, setAssignSheet]   = useState<{ songId: string; currentTitle: string } | null>(null)
  const [userId, setUserId]             = useState<string | null>(null)
  const [intelligence, setIntelligence] = useState<ShowIntelligence | null>(null)
  // 'loading' until the post-save query answers; 'failed' hides the optional
  // moments (never an endless "Reading the night…").
  const [intelligenceState, setIntelligenceState] = useState<'idle' | 'loading' | 'ok' | 'failed'>('idle')
  const [saveError, setSaveError] = useState<{ text: string; ref: string; retry: boolean } | null>(null)
  // Rows created for songs added during review, by the song's temporary id,
  // kept across save attempts so Try again never inserts them twice.
  const savedNewRowsRef = useRef<Record<string, string>>({})
  const { canWrite } = useWorkspaceRole()
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const shareCardRef = useRef<HTMLDivElement>(null)
  // Telemetry-only. flow_source comes from the ?source=live|upload query
  // param both entry points (Live's handleEnd, Upload's goToReview) already
  // append when routing here — no new query, no schema-ambiguous column
  // guessing. reviewOpenedAtRef/reviewOpenedLoggedRef guard review_opened
  // against firing more than once per visit (StrictMode double-invoke,
  // re-renders) and anchor review_duration_ms's start.
  const flowSourceRef = useRef<'live' | 'upload' | null>(null)
  const reviewOpenedLoggedRef = useRef(false)
  const reviewOpenedAtRef = useRef<string | null>(null)
  const [seqPhase, setSeqPhase] = useState(0)
  const [skipEnabled, setSkipEnabled] = useState(false)
  const [seqRoyaltyCount, setSeqRoyaltyCount] = useState(0)
  const [seqSongIdx, setSeqSongIdx] = useState(0)
  const [seqFading, setSeqFading] = useState(false)
  const seqRafRef = useRef<number | null>(null)

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
    setSongs(prev => prev.map(s => s.id === assignSheet.songId
      ? { ...s, title: recent.title, artist: recent.artist, source: 'manual', reviewState: 'clean', isModified: true } : s))
    closeAssignSheet()
    logReviewAction('edit_song')
  }

  function assignFromCatalog(catalogSong: CatalogSong, songId: string) {
    if (!catalogSong.title?.trim()) return
    const isNewSong = catalogSong.source === 'new' || catalogSong.id?.startsWith('new-')
    setSongs(prev => prev.map(s => s.id === songId
      ? { ...s, title: catalogSong.title.trim(), artist: catalogSong.artist || s.artist, isrc: catalogSong.isrc || '', composer: catalogSong.composer || '', publisher: catalogSong.publisher || '', source: 'manual', reviewState: 'clean', isModified: true }
      : s))
    closeAssignSheet()
    if (isNewSong && catalogSong.title.trim()) {
      fetch('/api/enrich-song', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: catalogSong.title.trim(), artist: catalogSong.artist || '' }) })
        .then(r => r.json())
        .then(data => {
          if (data.found) {
            setSongs(prev => prev.map(s => s.id === songId
              ? { ...s, isrc: data.isrc || s.isrc, composer: data.composer || s.composer, publisher: data.publisher || s.publisher, artist: s.artist || data.canonical_artist || '' }
              : s))
          }
        }).catch(() => {})
    }
    logReviewAction('edit_song')
  }

  function handleRowTap(songId: string) {
    const song = songs.find(s => s.id === songId)
    if (!song) return
    if (song.source === 'unidentified' || song.reviewState === 'needs_review') openAssignSheet(songId)
    else setEditSheet(song)
  }

  // Telemetry-only. song_count_current mirrors the confirmedSongs filter
  // used everywhere else in this file (source !== 'planned' && !isRemoved).
  // Reads performance/songs/userId/actingAsArtistId fresh each call — this
  // is a plain function re-created per render like the handlers around it,
  // not a memoized callback, so there's no staleness to guard against.
  function logReviewAction(actionType: ReviewActionType) {
    if (!performance) return
    logProductEvent(createClient(), {
      event_name: 'review_action', user_id: actingAsArtistId || performance.user_id, performance_id: performance.id,
      show_id: performance.show_id || null, flow_source: flowSourceRef.current,
      actor_type: actingAsArtistId && actingAsArtistId !== performance.user_id ? 'delegate' : 'owner',
      action_type: actionType,
      song_count_current: songs.filter(s => s.source !== 'planned' && !s.isRemoved).length,
    })
  }

  function markPlannedAsPlayed(songId: string) {
    setSongs(prev => prev.map(s => s.id === songId
      ? { ...s, source: 'manual', was_planned: true, reviewState: 'clean' }
      : s
    ))
    logReviewAction('confirm_song')
  }

  // Remembers a song as it was before a remove or skip, so UNDO can put it back.
  function offerUndo(songId: string, label: string) {
    const index = songs.findIndex(s => s.id === songId)
    if (index < 0) return
    setUndo({ song: songs[index], index, label })
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    undoTimerRef.current = setTimeout(() => setUndo(null), 5000)
  }
  function undoLast() {
    if (!undo) return
    const { song, index } = undo
    setSongs(prev => prev.some(s => s.id === song.id)
      ? prev.map(s => s.id === song.id ? song : s)
      : [...prev.slice(0, index), song, ...prev.slice(index)])
    setUndo(null)
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
  }
  useEffect(() => () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current) }, [])

  function removePlannedSong(songId: string) {
    offerUndo(songId, `${songs.find(s => s.id === songId)?.title || 'Song'} skipped.`)
    setSongs(prev => {
      const t = prev.find(s => s.id === songId)
      if (t?.isNew) return prev.filter(s => s.id !== songId)
      return prev.map(s => s.id === songId ? { ...s, isRemoved: true } : s)  // planned & not played → TN at save
    })
    logReviewAction('remove_song')
  }

  // ── Fetch post-show intelligence after save ───────────────────────────────
  async function fetchIntelligence(uid: string, venueName: string, songTitles: string[], catalogComplete = true) {
    setIntelligenceState('loading')
    try {
      const supabase = createClient()
      const MILESTONES = [5, 10, 25, 50, 100, 250, 500]

      const [totalResult, venueResult, debutResult, profileResult] = await Promise.all([
        // Total completed captured shows (excludes Setlist.fm imports)
        supabase
          .from('performances_visible')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', uid)
          .in('status', ['complete', 'completed', 'review'])
          .neq('data_source', 'setlistfm_imported'),

        // Visits to this specific venue
        supabase
          .from('performances_visible')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', uid)
          .eq('venue_name', venueName)
          .in('status', ['complete', 'completed']),

        // confirmed_count === 1 after this save: the song's first confirmed
        // appearance in the catalog (user_songs). It does not prove a first
        // live performance (imported or earlier history may predate it), so
        // the UI says "First appearance on your record".
        supabase
          .from('user_songs')
          .select('song_title')
          .eq('user_id', uid)
          .eq('confirmed_count', 1)
          .in('song_title', songTitles),

        // Career total from profile (includes Setlist.fm imported shows)
        supabase
          .from('profiles')
          .select('career_total_shows')
          .eq('id', uid)
          .single(),
      ])

      if (totalResult.error || venueResult.error || debutResult.error) throw totalResult.error || venueResult.error || debutResult.error
      const capturedShows = totalResult.count || 0
      const totalShows = capturedShows
      const venueVisits = venueResult.count || 0
      // A failed catalog write can leave a returning song at count 1, so
      // first appearances are only shown when every write landed.
      const songDebuts = catalogComplete ? debutResult.data?.map((r: { song_title: string }) => r.song_title) || [] : []
      const milestone = MILESTONES.find(m => m === totalShows) || null

      setIntelligence({ totalShows, venueVisits, songDebuts, milestone, capturedShows })
      setIntelligenceState('ok')
    } catch (err) {
      console.error('[Intelligence] fetch failed:', err)
      setIntelligenceState('failed')
    }
  }

  // ── Show number — computed at read time, not stored ──────────────────────
  // A performance's show number is its 1-based position in the owning artist's
  // set of non-imported, review-or-later performances, ordered by started_at
  // then created_at then id. The multi-key order is required for determinism:
  // several rows share a midnight started_at timestamp.
  async function computeShowNumber(artistUserId: string, performanceId: string): Promise<number | null> {
    try {
      const supabase = createClient()
      const { data: rows } = await supabase
        .from('performances_visible')
        .select('id, started_at, created_at')
        .eq('user_id', artistUserId)
        .in('status', ['complete', 'completed', 'review'])
        .neq('data_source', 'setlistfm_imported')

      if (!rows || rows.length === 0) return null

      const sorted = [...rows].sort((a, b) => {
        const byStarted = new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
        if (byStarted !== 0) return byStarted
        const byCreated = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        if (byCreated !== 0) return byCreated
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
      })

      const idx = sorted.findIndex(p => p.id === performanceId)
      return idx >= 0 ? idx + 1 : null
    } catch (err) {
      console.error('[ShowNumber] compute failed:', err)
      return null
    }
  }

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setUserId(actingAsArtistId || user.id) })
    setLoading(true); setLoadError(null); setSongsError(false)
    supabase.from('performances_visible').select('*, status, shows(show_type, timezone), venues(capacity)').eq('id', params.id).maybeSingle()
      .then(async ({ data: perf, error: perfError }) => {
        if (perfError) { setLoadError('show'); setLoading(false); return }
        if (!perf) { setLoadError('missing'); setLoading(false); return }
        setPerformance({ ...perf, show_type: perf.shows?.show_type || null, show_timezone: perf.shows?.timezone || null, venue_capacity: perf.venues?.capacity || null })
        if (perf.photo_url) setPhotoUrl(perf.photo_url)
        if (!reviewOpenedLoggedRef.current) {
          reviewOpenedLoggedRef.current = true
          const sp = new URLSearchParams(window.location.search)
          const src = sp.get('source')
          flowSourceRef.current = src === 'live' || src === 'upload' ? src : null
          const openedAt = new Date().toISOString()
          reviewOpenedAtRef.current = openedAt
          logProductEvent(supabase, {
            event_name: 'review_opened', user_id: actingAsArtistId || perf.user_id, performance_id: perf.id,
            show_id: perf.show_id || null, flow_source: flowSourceRef.current,
            actor_type: actingAsArtistId && actingAsArtistId !== perf.user_id ? 'delegate' : 'owner',
            occurred_at: openedAt,
          })
        }
        const resolvedSetlistId = perf.setlist_id || null
        setSetlistId(resolvedSetlistId)

        // Primary source: performance_songs — holds the row ids we update in place
        // plus the confusion-matrix columns. Rows the artist already removed stay in
        // the DB but are hidden here.
        const { data: songData, error: songsErr } = await supabase.from('performance_songs').select('*').eq('performance_id', params.id).order('position')
        if (songsErr) { setSongsError(true); setLoading(false); return }
        if (songData && songData.length > 0) {
          setSongs(songData.filter(s => !s.artist_removed).map(s => {
            const isUnidentified = s.source === 'unidentified' || !s.title
            const isPlanned = s.source === 'planned'
            const n = normalizeSong({ title: s.title || 'Unknown Song', artist: s.artist || '' })
            return {
              id: s.id || String(s.position),
              title: n.title, artist: n.artist, position: s.position,
              source: isUnidentified ? 'unidentified' : (s.source || 'recognized'),
              recognition_decision_id: null,
              isrc: s.isrc || '', composer: s.composer || '', publisher: s.publisher || '',
              reviewState: (isUnidentified ? 'needs_review' : 'clean') as 'clean' | 'needs_review',
              was_planned: s.was_planned || isPlanned || false,
              origTitle: n.title, origArtist: n.artist,
              inclusion_reason: s.inclusion_reason ?? null, threshold: s.threshold ?? null, score: s.score ?? null,
              confusion_matrix_result: s.confusion_matrix_result ?? 'TBD',
            }
          }))
          setLoading(false); return
        }

        // Fallback (legacy): setlist_items, only when there are no performance_songs rows.
        if (resolvedSetlistId) {
          const { data: items, error: itemsErr } = await supabase.from('setlist_items').select('*').eq('setlist_id', resolvedSetlistId).order('position')
          if (itemsErr) { setSongsError(true); setLoading(false); return }
          if (items && items.length > 0) {
            setSongs(items.map(s => {
              const n = normalizeSong({ title: s.title, artist: s.artist_name || '' })
              return { id: s.id, title: n.title, artist: n.artist, position: s.position, source: s.source, recognition_decision_id: s.recognition_decision_id, isrc: s.isrc || '', composer: s.composer || '', publisher: s.publisher || '', reviewState: (s.source === 'unidentified' ? 'needs_review' : 'clean') as 'clean' | 'needs_review', was_planned: s.was_planned || false }
            }))
            setLoading(false); return
          }
        }
        setLoading(false)
      }, () => { setLoadError('show'); setLoading(false) })
  }, [params.id, reloadKey])

  // Sequence: start only right after the artist completes this review in
  // this session — not on every load, or revisiting an already-completed
  // show replays the whole reveal (including a show number that could have
  // changed since).
  useEffect(() => {
    if (loading || !justCompleted) return
    // A successful save goes straight to the celebration, whose own entrance
    // is the brief sequence (about a second; nothing waits on it and every
    // control is live at once). The former full-screen reveal held the
    // screen ~15s for a 12-song show; its render branch below is no longer
    // reached (seqPhase only ever becomes 7 here).
    setSeqPhase(7); setShowComplete(true)
    // Save sits at the bottom of a long review; the celebration opens at its top.
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [loading, justCompleted]) // eslint-disable-line react-hooks/exhaustive-deps

  // Advance song index once per 1400ms while in phase 3
  useEffect(() => {
    if (seqPhase !== 3) return
    const cs = songs.filter(s => s.source !== 'planned' && !s.isRemoved)
    const moments = Math.min(cs.length, 5) + (cs.length > 5 ? 1 : 0)
    if (seqSongIdx >= moments) return
    const t = setTimeout(() => setSeqSongIdx(i => i + 1), 1400)
    return () => clearTimeout(t)
  }, [seqPhase, seqSongIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sequence royalty count-up — starts when phase reaches 5
  useEffect(() => {
    if (seqPhase !== 5 || !performance) return
    const territory = getTerritory(performance.country, performance.city)
    const confirmedForEst = songs.filter(s => s.source !== 'planned' && !s.isRemoved)
    const est = estimateRoyalties({
      songCount: confirmedForEst.length,
      venueCapacityBand: capacityToBand(performance.venue_capacity),
      showType: (performance.show_type as any) || 'single',
      territory,
    })
    const target = est.expected
    if (target === 0) return
    const duration = 1200
    const startMs = Date.now()
    function tick() {
      const progress = Math.min((Date.now() - startMs) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setSeqRoyaltyCount(Math.round(eased * target))
      if (progress < 1) seqRafRef.current = requestAnimationFrame(tick)
      else setSeqRoyaltyCount(target)
    }
    seqRafRef.current = requestAnimationFrame(tick)
    return () => { if (seqRafRef.current) cancelAnimationFrame(seqRafRef.current) }
  }, [seqPhase]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setSongs(items => {
        const oldIndex = items.findIndex(i => i.id === active.id)
        const newIndex = items.findIndex(i => i.id === over.id)
        return arrayMove(items, oldIndex, newIndex).map((s, i) => ({ ...s, position: i + 1 }))
      })
      logReviewAction('reorder_song')
    }
  }
  function handleDelete(id: string) {
    offerUndo(id, 'Song removed.')
    setSongs(prev => {
      const t = prev.find(s => s.id === id)
      if (t?.isNew) return prev.filter(s => s.id !== id)                 // never persisted → just drop
      return prev.map(s => s.id === id ? { ...s, isRemoved: true } : s)  // keep the record, flag removed (→ FP/TN on save)
    })
    logReviewAction('remove_song')
  }
  function handleEdit(id: string, title: string, artist: string) {
    setSongs(prev => prev.map(s => s.id === id ? { ...s, title, artist, reviewState: 'clean', isModified: true } : s))
    logReviewAction('edit_song')
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !performance) return
    setPhotoUploading(true); setPhotoError(false)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop()
      const path = `${performance.id}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('performance-photos')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage
        .from('performance-photos')
        .getPublicUrl(path)
      const { error: photoErr } = await supabase.from('performances').update({ photo_url: publicUrl }).eq('id', performance.id)
      if (photoErr) throw photoErr
      setPhotoUrl(publicUrl)
    } catch (err) {
      console.error('Photo upload failed:', err)
      setPhotoError(true)
    } finally {
      setPhotoUploading(false)
    }
  }

  // Shares the card exactly as previewed (lib/share-card-export.ts). A failed
  // export says so; there is no fallback renderer.
  async function shareCard(format: ShareFormat) {
    const cardDiv = shareCardRef.current?.firstElementChild as HTMLElement | null
    if (!cardDiv || shareState === 'working') return
    setShareState('working')
    let blob: Blob
    try { blob = await exportShareCard(cardDiv, format) } catch (err) {
      console.error('Share card export failed:', err)
      setShareState('failed'); return
    }
    setShareState('idle')
    const file = new File([blob], `setlistr-${format}.png`, { type: 'image/png' })
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${performance?.artist_name} at ${performance?.venue_name}` })
        return
      }
    } catch (err) {
      if ((err as any)?.name === 'AbortError') return   // the artist closed the share sheet
      console.error('Share failed:', err)
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSave = useCallback(async () => {
    if (!performance) return
    setSaving(true)
    setSaveError(null)
    const supabase = createClient()
    // Kept songs (visible, non-removed, non-planned) in display order, plus the
    // existing rows the artist removed. No delete/reinsert — we update in place.
    const kept    = songs.filter(s => !s.isRemoved && s.source !== 'planned')
    const removed = songs.filter(s => s.isRemoved && !s.isNew)
    const wasComplete = performance.status === 'completed' || performance.status === 'complete'

    // A kept song that was on the plan but never detected: kept means played.
    const playedPlanned = (s: Song) => s.inclusion_reason === 'planned setlist - not detected'

    // REQUIRED save: the show's songs, the linked show's finished status and
    // the performance's complete status (last, so it marks the whole save).
    // The database records the song catalogue inside that final write
    // (performances_record_catalog trigger), so a confirmed save has its catalogue.
    // Only these decide whether the setlist saved. Everything after (legacy
    // setlist mirror, song catalog, intelligence, show number, telemetry)
    // never reports the setlist as unsaved.
    let lastOp = ''
    let wroteSomething = false
    // `changes` is false for writes that only restate what's already stored
    // (an unchanged song's position), so "partly saved" is only said when
    // something the artist would see has actually changed.
    const step = async <T extends { error: any }>(op: string, run: PromiseLike<T>, changes = true): Promise<T> => {
      lastOp = op
      const r = await run
      if (r.error) throw Object.assign(new Error(r.error.message || op), { op, code: r.error.code || '', hint: r.error.hint || '' })
      if (changes) wroteSomething = true
      return r
    }
    let confirmed = false
    let failure: { op: string; code: string; message: string; hint: string } | null = null
    try {
      // Songs added during review that an earlier attempt already saved —
      // including one whose response was lost after the server accepted it —
      // are updated, never inserted a second time.
      const newOnes = kept.filter(s => s.isNew && !savedNewRowsRef.current[s.id])
      if (newOnes.length > 0) {
        lastOp = 'check songs already saved'
        const { data: existingRows, error } = await supabase.from('performance_songs')
          .select('id, title').eq('performance_id', performance.id).eq('inclusion_reason', 'manually added post-show')
        if (error) throw Object.assign(new Error(error.message), { op: lastOp, code: error.code || '' })
        const claimed = new Set<string>([...songs.map(s => s.id), ...Object.values(savedNewRowsRef.current)])
        for (const s of newOnes) {
          const n = normalizeSong({ title: s.title, artist: s.artist })
          const row = (existingRows || []).find(r => !claimed.has(r.id) && r.title === n.title)
          if (row) { savedNewRowsRef.current[s.id] = row.id; claimed.add(row.id) }
        }
      }

      // ── performance_songs: in-place updates, no delete/reinsert ───────────────
      for (let i = 0; i < kept.length; i++) {
        const s = kept[i]
        const n = normalizeSong({ title: s.title, artist: s.artist })
        const position = i + 1
        const savedRow = s.isNew ? savedNewRowsRef.current[s.id] : undefined
        if (s.isNew && !savedRow) {
          // Artist added a song the system missed → false negative
          const r = await step('add a song', supabase.from('performance_songs').insert({
            performance_id: performance.id, title: n.title, artist: n.artist, position,
            isrc: s.isrc || null, composer: s.composer || null, publisher: s.publisher || null,
            was_planned: s.was_planned || false,
            inclusion_reason: 'manually added post-show', confusion_matrix_result: 'FN', artist_modified: true,
          }).select('id').single())
          if ((r as any).data?.id) savedNewRowsRef.current[s.id] = (r as any).data.id
        } else if (savedRow) {
          await step('update a song', supabase.from('performance_songs').update({ title: n.title, artist: n.artist, position }).eq('id', savedRow))
        } else if (s.isModified) {
          // Artist corrected a detection → keep the record, log what it was
          await step('update a song', supabase.from('performance_songs').update({
            title: n.title, artist: n.artist, position,
            isrc: s.isrc || null, composer: s.composer || null, publisher: s.publisher || null,
            artist_modified: true, notes: `was ${s.origArtist || ''}-${s.origTitle || ''}`,
            ...(playedPlanned(s) ? { source: 'manual', was_planned: true } : {}),
          }).eq('id', s.id))
        } else if (playedPlanned(s)) {
          // A planned song the artist marked played: store it as played, so the
          // catalogue (recorded by the database with the final write) counts it.
          await step('mark a planned song played', supabase.from('performance_songs').update({ position, source: 'manual', was_planned: true }).eq('id', s.id))
        } else {
          // Unchanged detection → just keep ordering current
          await step('update song order', supabase.from('performance_songs').update({ position }).eq('id', s.id), s.position !== position)
        }
      }

      // Removed rows stay in the DB: a removed never-detected song is a true negative,
      // a removed detected song is a false positive.
      for (const s of removed) {
        const undetected = s.inclusion_reason === 'planned setlist - not detected' || s.inclusion_reason === 'added mid-show - not detected'
        await step('remove a song', supabase.from('performance_songs').update({
          artist_removed: true, confusion_matrix_result: undetected ? 'TN' : 'FP',
        }).eq('id', s.id))
      }

      // Resolve the kept rows still pending (TBD): never-detected songs the artist kept
      // are false negatives (system missed a played song); everything else is a true positive.
      await step('resolve detections', supabase.from('performance_songs')
        .update({ confusion_matrix_result: 'FN' })
        .eq('performance_id', performance.id).eq('confusion_matrix_result', 'TBD')
        .in('inclusion_reason', ['planned setlist - not detected', 'added mid-show - not detected']))
      await step('resolve detections', supabase.from('performance_songs')
        .update({ confusion_matrix_result: 'TP' })
        .eq('performance_id', performance.id).eq('confusion_matrix_result', 'TBD'))

      // Mark every row for this performance artist-reviewed
      await step('mark songs reviewed', supabase.from('performance_songs').update({ artist_save_complete: true }).eq('performance_id', performance.id))
      // Schedule and show start read shows.status; live → completed is the
      // supported transition (also written when capture ends). Idempotent.
      if (performance.show_id) await step('mark the linked show finished', supabase.from('shows').update({ status: 'completed' }).eq('id', performance.show_id))
      const done = await step('mark the show complete', supabase.from('performances').update({ status: PERFORMANCE_COMPLETE }).eq('id', performance.id).select('id'))
      confirmed = !!done.data && done.data.length === 1
    } catch (err: any) {
      failure = { op: err?.op || lastOp, code: err?.code || '', message: err?.message || '', hint: err?.hint || '' }
      console.error('[ReviewSave] save failed:', failure)
    }

    // No confirmed row (a lost response, or an update that returned no row):
    // read the show back. Completed now, when it wasn't before, means the
    // final required write landed. Anything else is not confirmed.
    if (!confirmed) {
      try {
        const { data: check, error } = await supabase.from('performances_visible').select('status').eq('id', performance.id).single()
        if (!error && !wasComplete && check?.status === PERFORMANCE_COMPLETE) confirmed = true
      } catch { /* stays unconfirmed */ }
    }
    if (!confirmed) {
      const f = failure
      // The database records the song catalogue inside the final write and
      // tags any failure there (hint 'setlistr:song-catalogue', original code
      // kept), so it can be told apart from the write itself.
      const catalogue = f?.hint === 'setlistr:song-catalogue'
      const op = catalogue ? 'record the song catalogue' : (f?.op || 'mark the show complete')
      const code = f?.code || ''
      // Every write returned without error, yet the show isn't complete
      // (no row updated), or the database refused on permission grounds.
      const refused = !f || (code === '42501' && !catalogue)
      const lostConnection = !!f && !code
      // Failures that pass: a serialization failure or deadlock, a lock or
      // statement timeout, a busy or restarting server. Retrying is the fix.
      const temporary = /^(40001|40P01|55P03|57014|53|08|57P0)/.test(code)
      // A rejection the database will repeat (data, integrity constraint,
      // permission/syntax, raised exception, request shape) — unlike a dropped
      // connection or busy server, retrying the same save can't succeed, so
      // it isn't offered as the fix.
      const repeats = !temporary && /^(22|23|42|P0|PGRST)/.test(code)
      const constraint = (f?.message.match(/constraint "([^"]+)"/) || [])[1]
      // Only the final write can fail this way, so every earlier edit is saved.
      const finalWrite = catalogue || op === 'mark the show complete'
      setSaving(false)
      setSaveError({
        text: catalogue
          ? repeats
            ? 'Your songs and edits are saved, but the show couldn’t be completed because its songs couldn’t be added to your song catalogue. Trying again won’t fix this, so please send us the reference below.'
            : 'Your songs and edits are saved, but the show couldn’t be completed just now while its songs were being added to your song catalogue. Try again; nothing will be added twice.'
          : finalWrite && temporary
            ? 'Your songs and edits are saved, but the show couldn’t be completed just now. Try again; nothing will be added twice.'
          : refused
          ? 'This account can’t save changes to this setlist. Your edits are still here.'
          : lostConnection
            ? 'The connection dropped before the save could be confirmed. Your edits are still here, and trying again won’t add any song twice.'
            : repeats
              ? op === 'mark the show complete'
                ? 'Your songs and edits are saved, but the show couldn’t be marked complete because the database refused the change. Trying again won’t fix this, so please send us the reference below.'
                : wroteSomething
                  ? 'Part of the setlist was saved, but the database refused one change, so the save can’t finish. Your edits are still here. Trying again won’t fix this, so please send us the reference below.'
                  : 'The database refused this save. Your edits are still here. Trying again won’t fix this, so please send us the reference below.'
              : wroteSomething
                ? 'Only part of the setlist was saved. Your edits are still here, and trying again finishes the save without adding any song twice.'
                : 'The setlist couldn’t be saved. Your edits are still here, so you can try again.',
        ref: `Reference: ${op}${code ? ` · ${code}` : ''}${constraint ? ` · ${constraint}` : ''}`,
        retry: !refused && !repeats,
      })
      return
    }

    // The setlist is saved: celebrate now. Everything below is optional and
    // finishes behind the celebration, which fills in the show number and
    // moments as they arrive. Awaiting it first held "Saving…" for every
    // catalog round trip (about 9s for 18 songs at 150ms), long enough for the
    // artist to leave a show that was already complete without ever seeing it.
    setSaving(false); setSaved(true); setJustCompleted(true)

    // The record counter, read first so the celebration's finish can land on
    // it. Counted exactly as the dashboard counts (summarizeRecord →
    // isCapturedShow). It steps up only when THIS save put the show on the
    // record: a show that reached review was already counted, so a review
    // save — and every re-save — keeps its existing dot and implies no
    // milestone. Read-only; a failed or slow read just leaves the counter out.
    const wasCounted = isCapturedShow({ status: performance.status ?? null, data_source: performance.data_source, venue_name: performance.venue_name })
    Promise.race([
      Promise.resolve(supabase.from('performances_visible')
        .select('id, venue_name, status, submission_status, data_source, performance_date, started_at, created_at')
        .eq('user_id', performance.user_id)),
      new Promise<{ data: null; error: string }>(res => setTimeout(() => res({ data: null, error: 'timeout' }), 10000)),
    ]).then(({ data, error }: { data: any[] | null; error: any }) => {
      if (error || !data) { setRecordFinish({ status: 'unavailable' }); return }
      const record = summarizeRecord(data)
      const me = data.find(r => r.id === performance.id)
      const counted = !!me && isCapturedShow(me)
      setRecordFinish({ status: 'ready', count: record.count, isLatest: counted && record.lastShow?.id === performance.id, added: counted && !wasCounted })
      setHeldMilestone(milestoneHeldBy(data, performance.id))
    }, () => setRecordFinish({ status: 'unavailable' }))

    // ── Optional after a confirmed save: never decides whether it saved ──
    // Legacy setlist mirror, non-destructive: new rows first, old rows removed
    // only once those exist. (recognition_decision_id is not sent: no
    // migration defines that column and nothing reads it.)
    if (setlistId) {
      try {
        const { data: oldItems, error: readErr } = await supabase.from('setlist_items').select('id').eq('setlist_id', setlistId)
        if (readErr) throw readErr
        const { error: insErr } = await supabase.from('setlist_items').insert(kept.map((s, i) => {
          const n = normalizeSong({ title: s.title, artist: s.artist })
          return { setlist_id: setlistId, title: n.title, artist_name: n.artist, position: i + 1, source: s.source || 'manual' }
        }))
        if (insErr) throw insErr
        if (oldItems && oldItems.length > 0) {
          const { error: delErr } = await supabase.from('setlist_items').delete().in('id', oldItems.map(o => o.id))
          if (delErr) throw delErr
        }
        const { error: confErr } = await supabase.from('setlists').update({ status: 'confirmed', confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', setlistId)
        if (confErr) throw confErr
      } catch (err) { console.error('[ReviewSave] legacy setlist mirror (optional) failed:', err) }
    }

    // show_locked is not a separate emitted event today — review_completed
    // IS that boundary in the current architecture (no separate finalize
    // step exists). Reporting derives show_locked_at as
    // review_completed.occurred_at. If a genuinely distinct immutable/
    // submission lock boundary is added later (e.g. PRO submission), give
    // IT its own show_locked event at that point rather than resurrecting
    // this one speculatively.
    //
    // Started here (not awaited yet) so its network time overlaps with the
    // fetchIntelligence work below — awaited (bounded) right before this function's effective
    // exit, since the artist may background/close the app the moment the
    // "Saved" success screen appears (it now appears before this work).
    const actorType: 'owner' | 'delegate' = actingAsArtistId && actingAsArtistId !== performance.user_id ? 'delegate' : 'owner'
    const reviewCompletedLogged = logProductEvent(supabase, {
      event_name: 'review_completed',
      user_id: actingAsArtistId || performance.user_id, performance_id: performance.id, show_id: performance.show_id || null,
      flow_source: flowSourceRef.current, actor_type: actorType,
      song_count_current: kept.length, occurred_at: new Date().toISOString(),
    })

    // NOTE: a city-centroid geocode used to overwrite latitude/longitude here.
    // Those columns now hold the device's coordinates at capture start, which
    // is evidence of attendance — a city centre would destroy it on every
    // completed show. Nothing reads a city-level coordinate; the maps in
    // stats and career-map each geocode independently.
    // The celebration is already up, so moments that never start must not
    // leave it on "Reading the night…".
    let momentsStarted = false
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // The catalogue was recorded with the confirmed final write.
        const catalogComplete = true
        momentsStarted = true
        fetchIntelligence(actingAsArtistId || user.id, performance.venue_name, kept.map(s => s.title).filter(Boolean), catalogComplete)
        // No chronological show number: the share cards use the milestone this
        // show holds on the record (heldMilestone, from the record read above).
      }
    } catch (err) { console.error('[ReviewSave]', err) }
    if (!momentsStarted) setIntelligenceState('failed')
    await awaitWithTimeout(reviewCompletedLogged)
  }, [performance, songs, setlistId, actingAsArtistId])

  async function generateExportCSV(pro: PRO) {
    if (!performance) return
    const day = showDay(performance, performance.show_timezone) || parseLocalDate(performance.started_at)
    const date = day.toLocaleDateString()
    const confirmedSongs = songs.filter(s => s.source !== 'planned' && !s.isRemoved)
    const headers: Record<PRO, string[]> = {
      SOCAN: ['Title', 'Artist', 'Composer', 'Publisher', 'ISRC', 'Duration', 'Date', 'Venue', 'City'],
      ASCAP: ['Title', 'Performer', 'Composer/Author', 'Publisher', 'ISRC', 'Venue', 'Date', 'City', 'State'],
      BMI:   ['Song Title', 'Artist', 'BMI Work #', 'Composer', 'Publisher', 'Venue Name', 'Date', 'City'],
    }
    const rows = confirmedSongs.map(s => {
      const c = s.composer || '', p = s.publisher || '', i = s.isrc || ''
      if (pro === 'SOCAN') return [s.title, s.artist, c, p, i, '', date, performance.venue_name, performance.city]
      if (pro === 'ASCAP') return [s.title, performance.artist_name, c, p, i, performance.venue_name, date, performance.city, performance.country || '']
      return [s.title, performance.artist_name, '', c, p, performance.venue_name, date, performance.city]
    })
    const csv = [headers[pro], ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `${pro}-setlist-${performance.venue_name}-${date.replace(/\//g, '-')}.csv`
    a.click(); URL.revokeObjectURL(url)
    // Download already triggered synchronously above — this only bounds
    // how long we wait for the telemetry insert before the artist might
    // navigate away, it never delays the export itself.
    await awaitWithTimeout(logProductEvent(createClient(), {
      event_name: 'export_generated', user_id: actingAsArtistId || performance.user_id, performance_id: performance.id,
      show_id: performance.show_id || null, flow_source: flowSourceRef.current,
      actor_type: actingAsArtistId && actingAsArtistId !== performance.user_id ? 'delegate' : 'owner',
      song_count_current: confirmedSongs.length,
    }))
  }

  function parseLocalDate(d: string): Date {
    const datePart = d.split('T')[0].split(' ')[0]
    const [y, m, day] = datePart.split('-').map(Number)
    if (y && m && day) return new Date(y, m - 1, day)
    return new Date(d)
  }
  function formatDate(d: string) { return parseLocalDate(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) }
  function formatDuration() {
    if (!performance?.started_at || !performance?.ended_at) return ''
    const mins = Math.round((new Date(performance.ended_at).getTime() - new Date(performance.started_at).getTime()) / 60000)
    return mins > 0 ? `${mins} min` : ''
  }

  // Opening a show: placeholders in the page's own shape (docs/ui-standard.md → Loading).
  if (loading) return (
    <div aria-busy="true" aria-label="Loading the show" style={{ minHeight: 'var(--sl-page-min-height, 100svh)', background: C.bg }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px' }}>
        <Skeleton w="34%" h={12} r={4} />
        <Skeleton w="72%" h={32} mt={14} r={8} />
        <Skeleton w="46%" h={14} mt={12} r={5} />
        <Skeleton h={64} mt={22} r={18} />
        <Skeleton w="28%" h={14} mt={28} r={5} />
        <div style={{ marginTop: 12, borderRadius: 16, overflow: 'hidden' }}>{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} h={54} r={0} mt={i ? 1 : 0} />)}</div>
      </div>
    </div>
  )

  // The show's own day (lib/show-date.ts), not the UTC date part of started_at.
  const theShowDate       = performance ? showDay(performance, performance.show_timezone) : null
  const confirmedSongs    = songs.filter(s => s.source !== 'planned' && !s.isRemoved)
  const plannedPending    = songs.filter(s => s.source === 'planned' && !s.isRemoved)
  const autoCount         = confirmedSongs.filter(s => s.source === 'recognized' || s.source === 'detected' || s.source === 'fingerprint' || s.source === 'humming').length
  const verifiedCount     = confirmedSongs.filter(s => s.was_planned).length
  const needsReviewCount  = confirmedSongs.filter(s => s.source === 'unidentified' || s.reviewState === 'needs_review').length
  const allClean          = needsReviewCount === 0
  const dur               = formatDuration()

  // ── BEAT 3: cinematic sequence overlay ───────────────────────────────────
  if (!showComplete && seqPhase > 0 && seqPhase < 7) {
    const seqCs = confirmedSongs  // already filtered above
    const overflowCount = seqCs.length > 5 ? seqCs.length - 5 : 0
    const isOverflowMoment = seqPhase === 3 && seqSongIdx === 5 && overflowCount > 0
    const currentSong = seqPhase === 3 && seqSongIdx < 5 ? seqCs[seqSongIdx] : null
    // The show's own day (lib/show-date), as in the header and celebration —
    // not the UTC date part of started_at.
    const venueDate = theShowDate
      ? theShowDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null

    return (
      <div
        onClick={() => { if (skipEnabled) { setSeqPhase(7); setShowComplete(true) } }}
        style={{
          position: 'fixed', inset: 0, background: C.bg, zIndex: 50,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          fontFamily: '"DM Sans", system-ui, sans-serif',
          cursor: skipEnabled ? 'pointer' : 'default',
          opacity: seqFading ? 0 : 1, transition: seqFading ? 'opacity 0.4s ease' : 'none',
        }}
      >
        {/* Phase 1: "REVIEWING YOUR SHOW" small-caps + pulsing dot */}
        {seqPhase === 1 && (
          <div style={{ textAlign: 'center', opacity: 0, animation: 'fadeIn 0.6s ease forwards' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.gold, animation: 'breathe 1.4s ease-in-out infinite', margin: '0 auto 20px' }} />
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.muted, margin: 0 }}>
              Reviewing your show
            </p>
          </div>
        )}

        {/* Phase 2: venue name huge + city · date */}
        {seqPhase === 2 && (
          <div key="phase2" style={{ textAlign: 'center', opacity: 0, animation: 'fadeUp 0.5s ease forwards', padding: '0 28px' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: C.gold, animation: 'breathe 1.4s ease-in-out infinite', margin: '0 auto 28px' }} />
            <p style={{ fontSize: 48, fontWeight: 800, color: C.text, margin: '0 0 10px', letterSpacing: '-0.03em', lineHeight: 1.05 }}>
              {performance?.venue_name || 'Your Show'}
            </p>
            {(performance?.city || venueDate) && (
              <p style={{ fontSize: 14, color: C.muted, margin: 0, letterSpacing: '0.02em' }}>
                {[performance?.city, venueDate].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        )}

        {/* Phase 3: song-by-song moments — one at a time, centered */}
        {seqPhase === 3 && (
          <div key={`song-${seqSongIdx}`} style={{ textAlign: 'center', padding: '0 36px', maxWidth: 520, opacity: 0, animation: 'songMoment 1.4s ease forwards' }}>
            {isOverflowMoment ? (
              <p style={{ fontSize: 28, fontWeight: 700, color: C.muted, margin: 0 }}>
                +{overflowCount} more
              </p>
            ) : currentSong ? (
              <>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted, margin: '0 0 18px' }}>
                  {seqSongIdx + 1} / {seqCs.length}
                </p>
                <p style={{ fontSize: 32, fontWeight: 800, color: C.text, margin: 0, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
                  {currentSong.title}
                </p>
                {currentSong.artist && (
                  <p style={{ fontSize: 15, color: C.muted, margin: '10px 0 0', fontWeight: 400 }}>
                    {currentSong.artist}
                  </p>
                )}
              </>
            ) : null}
          </div>
        )}

        {/* Phase 4: planned-but-undetected gaps */}
        {seqPhase === 4 && (
          <div key="phase4" style={{ textAlign: 'center', opacity: 0, animation: 'fadeUp 0.5s ease forwards', width: '100%', maxWidth: 400, padding: '0 24px' }}>
            <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.gold, margin: '0 0 20px' }}>
              {plannedPending.length === 1 ? 'One gap in the record' : `${plannedPending.length} gaps in the record`}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {plannedPending.map(song => (
                <div key={song.id} onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'color-mix(in srgb, var(--sl-text) 3%, transparent)', border: '1px dashed color-mix(in srgb, var(--sl-text) 10%, transparent)', borderRadius: 12 }}>
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <p style={{ fontSize: 15, color: C.secondary, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>{song.title}</p>
                    <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 0' }}>Did you play it?</p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); markPlannedAsPlayed(song.id) }}
                    style={{ flexShrink: 0, padding: '6px 14px', background: 'color-mix(in srgb, var(--sl-ok) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--sl-ok) 25%, transparent)', borderRadius: 8, color: C.green, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.04em', WebkitTapHighlightColor: 'transparent' }}>
                    Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Phase 5: royalty count-up, large, centered */}
        {seqPhase === 5 && (
          <div key="phase5" style={{ textAlign: 'center', opacity: 0, animation: 'fadeUp 0.5s ease forwards' }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 14px' }}>What tonight generated</p>
            <span style={{ fontSize: 56, fontWeight: 800, color: C.gold, fontFamily: '"DM Mono", monospace', letterSpacing: '-0.03em', lineHeight: 1 }}>~${seqRoyaltyCount.toLocaleString()}</span>
          </div>
        )}

        {/* Phase 6: SHOW #N stamp — only if the computed show number is available */}
        {seqPhase === 6 && computedShowNumber != null && (
          <div key="phase6" style={{ textAlign: 'center', opacity: 0, animation: 'fadeUp 0.4s ease forwards' }}>
            <span style={{ fontSize: 64, fontWeight: 800, color: C.gold, letterSpacing: '0.08em', display: 'inline-block', animation: 'showStamp 0.4s ease-out both', fontFamily: '"DM Mono", monospace' }}>
              SHOW #{computedShowNumber}
            </span>
          </div>
        )}

        {/* Tap-to-skip hint */}
        {skipEnabled && seqPhase < 6 && (
          <p style={{ position: 'fixed', bottom: 32, left: 0, right: 0, textAlign: 'center', fontSize: 11, color: C.muted, margin: 0, opacity: 0, animation: 'fadeIn 0.4s ease forwards', pointerEvents: 'none' }}>Tap to skip</p>
        )}

        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
          @keyframes fadeIn{from{opacity:0}to{opacity:1}}
          @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
          @keyframes breathe{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.2);opacity:.8}}
          @keyframes showStamp{from{transform:scale(1.06)}to{transform:scale(1)}}
          @keyframes songMoment{0%{opacity:0;transform:translateY(8px)}43%{opacity:1;transform:translateY(0)}71%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-8px)}}
          *{-webkit-tap-highlight-color:transparent;box-sizing:border-box}
        `}</style>
      </div>
    )
  }

  if (showComplete) {
    const territory = getTerritory(performance?.country, performance?.city)
    const songCount = confirmedSongs.length
    const estimate  = estimateRoyalties({ songCount, venueCapacityBand: capacityToBand(performance?.venue_capacity), showType: (performance?.show_type as any) || 'single', territory })
    const showDate  = theShowDate ? theShowDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : ''
    const durMins   = performance?.started_at && performance?.ended_at ? Math.round((new Date(performance.ended_at).getTime() - new Date(performance.started_at).getTime()) / 60000) : null
    // VERIFIED: the songs this save just confirmed. The artist (or a teammate
    // with edit access) saved them, and the save was confirmed above
    // (artist_save_complete written, the show read back as complete). Titled
    // songs only: an unidentified entry is saved but never verified, and is
    // counted separately. Nothing here is inferred for older shows.
    const unidentifiedCount = confirmedSongs.filter(s => s.source === 'unidentified').length
    const verifiedSongs = songCount - unidentifiedCount

    // One moment, the first that applies of the ones the app already finds:
    // a milestone, a new room, a first appearance on the record, back again.
    // None (or not loaded): no moment line.
    let moment: { label: string; detail: string } | null = null
    if (intelligence) {
      const v = intelligence.venueVisits
      if (heldMilestone) moment = { label: 'Milestone', detail: `Show ${heldMilestone} on your record` }
      else if (v === 1) moment = { label: 'New room', detail: 'Your first show here.' }
      else if (intelligence.songDebuts.length > 0) moment = { label: 'First appearance on your record', detail: intelligence.songDebuts.join(', ') }
      else if (v > 1) moment = { label: 'Back again', detail: `${ordinal(v)} show at ${performance?.venue_name}` }
    }
    const meta = [performance?.city, showDate, durMins ? `${durMins} min` : null].filter(Boolean).join(' · ')

    return (
      <div className="cer" style={{ minHeight: 'var(--sl-page-min-height, 100svh)', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif', position: 'relative', overflow: 'hidden', animation: 'cerIn 0.2s ease-out both' }}>
        {/* The artist's own show photo when there is one; otherwise the gold glow. */}
        {photoUrl ? (
          <div aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 300, zIndex: 0 }}>
            <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, color-mix(in srgb, var(--sl-bg) 0%, transparent) 20%, color-mix(in srgb, var(--sl-bg) 78%, transparent) 68%, var(--sl-bg) 100%)' }} />
          </div>
        ) : (
          <div aria-hidden="true" style={{ position: 'absolute', top: -60, left: '-20%', right: '-20%', height: 380, pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse 60% 55% at 32% 45%, color-mix(in srgb, var(--sl-accent) 22%, transparent), color-mix(in srgb, var(--sl-accent) 6%, transparent) 55%, transparent 75%)' }} />
        )}
        <PageFrame style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ maxWidth: 560, margin: '0 auto' }}>
            {/* ── The show ── */}
            <div className="cer-head" style={{ paddingTop: photoUrl ? 190 : 56, paddingBottom: 18 }}>
              <p style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--sl-gold-text)', margin: '0 0 10px' }}>
                <span ref={pipRef} aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: ORB_GOLD, opacity: orbLanded ? 1 : 0, transition: 'opacity 0.2s ease' }} />
                Show complete
              </p>
              <h1 ref={venueHeadingRef} style={{ fontSize: 38, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.035em', lineHeight: 1.04, textWrap: 'balance' as any, overflowWrap: 'anywhere' }}>
                {performance?.venue_name}
              </h1>
              {meta && <p style={{ fontSize: 15, color: C.secondary, margin: 0 }}>{meta}</p>}
            </div>

            {/* ── Saved: one green confirmation; unidentified entries counted apart ── */}
            <div role="status" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'color-mix(in srgb, var(--sl-ok) 10%, transparent)', borderRadius: 14, padding: '14px 4px 14px 16px', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--sl-ok) 30%, transparent)' }}>
              <svg className="cer-tick" width="20" height="20" viewBox="0 0 16 16" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, color: 'var(--sl-ok)' }}>
                <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="M4.9 8.3l2.1 2.1 4.2-4.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 17.5, fontWeight: 700, color: C.text, margin: 0, lineHeight: 1.3 }}>
                  {verifiedSongs > 0 ? `Saved. ${verifiedSongs} ${verifiedSongs === 1 ? 'song' : 'songs'} verified.` : 'Saved.'}
                </p>
                {unidentifiedCount > 0 && (
                  <p style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 14.5, color: C.secondary, margin: '6px 0 0', lineHeight: 1.4 }}>
                    <AlertCircle size={15} aria-hidden="true" style={{ color: 'var(--sl-warn)', flexShrink: 0, marginTop: 2 }} />
                    {unidentifiedCount} unidentified {unidentifiedCount === 1 ? 'entry' : 'entries'} saved separately, not verified.
                  </p>
                )}
                {aboutVerified && (
                  <p id="about-verified" style={{ fontSize: 14, color: C.secondary, margin: '8px 0 0', lineHeight: 1.45 }}>
                    Verified means you or an authorised teammate confirmed the song in Review and the show saved. A recognised or typed title on its own isn’t enough.
                  </p>
                )}
              </div>
              <button onClick={() => setAboutVerified(v => !v)} aria-label="What verified means" aria-expanded={aboutVerified} aria-controls="about-verified"
                style={{ width: 44, height: 44, margin: '-12px 0 -12px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: C.muted, cursor: 'pointer', flexShrink: 0 }}>
                <Info size={17} />
              </button>
            </div>

            {/* ── One moment, and the record ── */}
            <div style={{ marginTop: 24 }}>
              {(intelligenceState === 'loading' || intelligenceState === 'idle') && (
                <div aria-busy="true" style={{ marginBottom: 16 }}>
                  <Skeleton h={13} w="28%" r={4} />
                  <Skeleton h={18} w="62%" r={5} mt={8} />
                </div>
              )}
              {intelligenceState === 'ok' && moment && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--sl-gold-text)', margin: 0 }}>{moment.label}</p>
                  <p style={{ fontSize: 18, fontWeight: 500, color: C.text, margin: '3px 0 0', letterSpacing: '-0.01em', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{moment.detail}</p>
                </div>
              )}
              <RecordFinish
                data={recordFinish}
                label={actingAsArtistId && performance?.artist_name ? `${/s$/i.test(performance.artist_name) ? `${performance.artist_name}’` : `${performance.artist_name}’s`} record` : 'Your record'}
                startRef={venueHeadingRef}
                pipRef={pipRef}
                onLanded={() => setOrbLanded(true)}
              />
            </div>

            {/* ── The full saved setlist ── */}
            <div style={{ marginTop: 6 }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: C.secondary, margin: '0 0 6px' }}>Tonight’s setlist</p>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {confirmedSongs.map((s, i) => (
                  <li key={s.id} style={{ display: 'flex', alignItems: 'baseline', gap: 14, padding: '10px 0', borderTop: i ? '1px solid var(--sl-line)' : 'none' }}>
                    <span style={{ fontSize: 12.5, color: C.muted, minWidth: 20, textAlign: 'right', fontFamily: '"DM Mono", monospace', flexShrink: 0 }}>{i + 1}</span>
                    {s.source === 'unidentified'
                      ? <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 16.5, fontWeight: 600, color: 'var(--sl-warn)' }}><AlertCircle size={15} aria-hidden="true" />Not identified</span>
                      : <span style={{ fontSize: 16.5, fontWeight: 450, color: C.text, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{s.title}</span>}
                  </li>
                ))}
              </ol>
            </div>

            {/* ── Sharing, then the claim sheet ── */}
            <div className="cer-share" style={{ marginTop: 32 }}>
              {(() => {
                  const royaltyAmount = estimate.expected
                  const artist = performance?.artist_name || ''
                  const venue = performance?.venue_name || ''

                  // First Appearance and Royalty Moment are held back from
                  // selection and sharing until they're refined; their code stays.
                  const HELD_CARDS = new Set(['song_debut', 'royalty_moment'])
                  const cards: Array<{ id: string; label: string; formats: boolean; component: React.ReactNode }> = ([
                    {
                      id: 'night',
                      label: 'The night',
                      formats: true,
                      component: (
                        <NightCard
                          format={shareFormat}
                          photoUrl={photoUrl}
                          artistName={artist}
                          venueName={venue}
                          city={performance?.city || ''}
                          date={showDate}
                          songCount={confirmedSongs.length}
                        />
                      )
                    },
                    ...(intelligence && intelligence.songDebuts.length > 0 ? [{
                      id: 'song_debut',
                      label: `First appearance`,
                      formats: false,
                      component: (
                        <SongDebutCard
                          songTitle={intelligence!.songDebuts[0]}
                          artistName={performance?.artist_name || ''}
                          venueName={performance?.venue_name || ''}
                          date={showDate}
                          totalDebuts={intelligence!.songDebuts.length}
                        />
                      )
                    }] : []),
                    ...(heldMilestone ? [{
                      id: 'milestone',
                      label: `Milestone ${heldMilestone}`,
                      formats: true,
                      component: (
                        <MilestoneCard
                          format={shareFormat}
                          milestone={heldMilestone}
                          artistName={artist}
                          venueName={venue}
                          date={showDate}
                        />
                      )
                    }] : []),
                    {
                      id: 'royalty_moment',
                      label: 'Royalty Moment',
                      formats: false,
                      component: (
                        <RoyaltyMomentCard
                          artistName={performance?.artist_name || ''}
                          venueName={performance?.venue_name || ''}
                          date={showDate}
                          amount={royaltyAmount}
                        />
                      )
                    },
                  ] as Array<{ id: string; label: string; formats: boolean; component: React.ReactNode }>).filter(c => !HELD_CARDS.has(c.id))

                  const active = cards[Math.min(activeCardIndex, cards.length - 1)]
                  const format: ShareFormat = active.formats ? shareFormat : 'story'
                  return (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '0 0 12px' }}>
                        <p style={{ fontSize: 15, fontWeight: 600, color: C.secondary, margin: 0 }}>
                          Your card
                        </p>
                        {/* Story (9:16) or Feed (4:5): each composed for its frame; the preview is what's shared. */}
                        {active.formats && (
                          <div role="group" aria-label="Card format" style={{ display: 'inline-flex', border: '1px solid color-mix(in srgb, var(--sl-text) 14%, transparent)', borderRadius: 999, padding: 2 }}>
                            {(['story', 'feed'] as ShareFormat[]).map(f => (
                              <button key={f} onClick={() => { setShareFormat(f); setShareState('idle') }} aria-pressed={shareFormat === f}
                                style={{ minHeight: 32, padding: '0 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, background: shareFormat === f ? 'color-mix(in srgb, var(--sl-accent) 16%, transparent)' : 'transparent', color: shareFormat === f ? 'var(--sl-gold-text)' : C.secondary }}>
                                {f === 'story' ? 'Story' : 'Feed'}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Card display with swipe support */}
                      <div
                        ref={shareCardRef}
                        style={{ marginBottom: 12, touchAction: 'pan-y', width: format === 'story' ? '64%' : '80%', marginLeft: 'auto', marginRight: 'auto' }}
                        onTouchStart={(e) => {
                          const touch = e.touches[0]
                          ;(e.currentTarget as any)._touchStartX = touch.clientX
                        }}
                        onTouchEnd={(e) => {
                          const startX = (e.currentTarget as any)._touchStartX
                          if (startX === undefined) return
                          const endX = e.changedTouches[0].clientX
                          const diff = startX - endX
                          if (Math.abs(diff) < 50) return
                          if (diff > 0 && activeCardIndex < cards.length - 1) {
                            setActiveCardIndex(activeCardIndex + 1)
                          } else if (diff < 0 && activeCardIndex > 0) {
                            setActiveCardIndex(activeCardIndex - 1)
                          }
                        }}
                      >
                        {active.component}
                      </div>

                      {/* Card selector dots */}
                      {cards.length > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
                          {cards.map((card, i) => (
                            <button
                              key={card.id}
                              onClick={() => setActiveCardIndex(i)}
                              style={{
                                width: activeCardIndex === i ? 24 : 8,
                                height: 8,
                                borderRadius: 4,
                                background: activeCardIndex === i ? C.gold : 'color-mix(in srgb, var(--sl-text) 20%, transparent)',
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                padding: 0,
                              }}
                            />
                          ))}
                        </div>
                      )}

                      {/* Share button */}
                      {shareState === 'failed' && (
                        <p role="alert" style={{ fontSize: 13.5, color: 'var(--sl-text)', margin: '0 0 10px', lineHeight: 1.45 }}>The image couldn’t be created. Try again.</p>
                      )}
                      <button
                        onClick={() => shareCard(format)}
                        disabled={shareState === 'working'}
                        style={{
                          width: '100%', minHeight: 48, padding: '0 14px',
                          background: 'transparent',
                          border: '1px solid color-mix(in srgb, var(--sl-accent) 45%, transparent)',
                          borderRadius: 14, color: 'var(--sl-gold-text)',
                          fontSize: 13.5, fontWeight: 800,
                          cursor: 'pointer', fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'center', gap: 8,
                          letterSpacing: '0.08em', textTransform: 'uppercase',
                        }}>
                        {shareState === 'working' ? 'Preparing the image…' : '✦ Share this card'}
                      </button>
                    </div>
                  )
                })()}
            </div>

            {/* The claim sheet: one quiet row with tonight's estimate and its disclaimer. */}
            {(() => {
              const body = (
                <>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 16, fontWeight: 600, color: C.text }}>Claim sheet</span>
                    <span style={{ display: 'block', fontSize: 13.5, color: C.secondary, marginTop: 3, lineHeight: 1.4 }}>Tonight’s estimate {formatEstimate(estimate.expected)} {ESTIMATE_UNIT} {ESTIMATE_DISCLAIMER}</span>
                  </span>
                  {canWrite && <ChevronRight size={20} aria-hidden="true" style={{ color: 'var(--sl-text-4)', flexShrink: 0 }} />}
                </>
              )
              const rowStyle: React.CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', background: 'var(--sl-group)', border: 'none', borderRadius: 14, padding: '14px 12px 14px 16px', marginTop: 14, fontFamily: 'inherit', color: C.text }
              return canWrite
                ? <button onClick={() => router.push(`/app/submit/${params.id}`)} aria-label="Open the claim sheet" style={{ ...rowStyle, cursor: 'pointer' }}>{body}</button>
                : <div style={rowStyle}>{body}</div>
            })()}

            <div className="cer-actions" style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 16, paddingBottom: 24 }}>
              <button onClick={() => router.push('/app/dashboard')}
                style={{ width: '100%', minHeight: 48, background: 'transparent', border: '1px solid color-mix(in srgb, var(--sl-text) 14%, transparent)', borderRadius: 14, color: C.secondary, fontSize: 13.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' }}>
                Back to your record
              </button>
              <button onClick={() => setShowComplete(false)}
                style={{ width: '100%', minHeight: 44, background: 'transparent', border: 'none', borderRadius: 10, color: C.secondary, fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' }}>
                Review the night
              </button>
            </div>
          </div>
        </PageFrame>

        <style>{`
          @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
          @keyframes spin { to{transform:rotate(360deg)} }
          /* The entrance: one short cross-fade, the tick draws once; the
             record's orb lands on its dot (RecordFinish). */
          @keyframes cerIn { from { opacity: 0 } to { opacity: 1 } }
          @keyframes cerTick { to { stroke-dashoffset: 0 } }
          .cer-tick path { stroke-dasharray: 12; stroke-dashoffset: 12; animation: cerTick 0.24s 0.14s ease-out forwards; }
          * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
          /* Reduced motion: everything is there at once. */
          @media (prefers-reduced-motion: reduce) {
            .cer, .cer *, .cer *::before, .cer *::after { animation-duration: 0.01ms !important; animation-delay: 0s !important; }
            .cer-tick path { stroke-dashoffset: 0; }
          }
        `}</style>
      </div>
    )
  }

  // The show itself didn't load: say so, offer Try again, and offer no Save.
  if (loadError) return (
    <div style={{ minHeight: 'var(--sl-page-min-height, 100svh)', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '28px 20px' }}>
        <LoadError message={loadError === 'missing' ? 'This show isn’t available.' : 'This show couldn’t be loaded.'}
          detail={loadError === 'missing' ? 'It may have been removed, or this account can’t open it.' : undefined}
          onRetry={() => setReloadKey(k => k + 1)} />
        <button onClick={() => router.push('/app/dashboard')} style={{ marginTop: 12, minHeight: 44, background: 'none', border: 'none', color: C.secondary, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Back to Dashboard</button>
      </div>
    </div>
  )

  // ── Review (revision 3) ──────────────────────────────────────────────────
  // What's left to decide: unidentified songs to name, and planned songs not
  // heard (the same filters the save uses: removed and planned rows aside).
  const toName    = confirmedSongs.filter(s => s.source === 'unidentified' || s.reviewState === 'needs_review')
  const toCheck   = plannedPending.length
  const leftText  = [toName.length ? `${toName.length} song${toName.length > 1 ? 's' : ''} to name` : '', toCheck ? `${toCheck} planned song${toCheck > 1 ? 's' : ''} to check` : ''].filter(Boolean).join(' · ')
  const locked    = saving
  const emptyShow = confirmedSongs.length === 0
  const sheetOpen = !!editSheet || !!assignSheet || emptyConfirm || showAdd
  // The pinned bar steps aside for EDIT, an open sheet and the keyboard.
  const showBar   = !songsError && !editMode && !sheetOpen && keyboardOffset === 0
  const unnamedCount = toName.filter(s => s.source === 'unidentified').length
  const fine = unnamedCount
    ? `Saving confirms the named songs. ${unnamedCount === 1 ? 'The unnamed entry is' : `The ${unnamedCount} unnamed entries are`} saved as unidentified.`
    : toCheck ? 'Saving confirms these songs. Undecided planned songs aren’t added.'
    : 'Saving confirms you performed these songs at this show.'
  function jumpToNext() {
    if (locked) return
    if (toName[0]) { openAssignSheet(toName[0].id); return }
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    plannedRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })
  }
  const capsButton: React.CSSProperties = { fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'inherit' }
  const sectionLabel: React.CSSProperties = { fontSize: 15, fontWeight: 600, color: C.secondary, margin: 0 }
  const moreRow: React.CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', gap: 12, minHeight: 54, padding: '8px 12px 8px 14px', background: 'none', border: 'none', textAlign: 'left', cursor: locked ? 'default' : 'pointer', fontFamily: 'inherit', color: C.secondary, fontSize: 15.5, fontWeight: 500 }

  return (
    <div style={{ minHeight: 'var(--sl-page-min-height, 100svh)', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100vw', height: '40vh', pointerEvents: 'none', zIndex: 0, background: 'var(--sl-page-glow)' }} />
      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 720, width: '100%', margin: '0 auto', padding: '0 20px', boxSizing: 'border-box' }}>

        <div style={{ paddingTop: 26, paddingBottom: 4 }}>
          <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--sl-gold-text)', margin: '0 0 8px' }}>Review your set</p>
          <h1 style={{ fontSize: 'clamp(30px, 5vw, 40px)', fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.03em', lineHeight: 1.08, textWrap: 'balance' as any, overflowWrap: 'anywhere' }}>{performance?.venue_name}</h1>
          <p style={{ fontSize: 15, color: C.secondary, margin: 0 }}>
            {[performance?.city, theShowDate ? theShowDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : null, dur || null].filter(Boolean).join(' · ')}
          </p>
        </div>

        {/* ── What's left: one specific summary; tap to go to the next one ── */}
        {!songsError && !emptyShow && (
          leftText ? (
            <button onClick={jumpToNext} disabled={locked} aria-label={`${leftText}. Go to the next one.`}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', margin: '20px 0 22px', padding: 16, minHeight: 60, background: 'var(--sl-raised)', border: 'none', borderRadius: 18, cursor: locked ? 'default' : 'pointer', fontFamily: 'inherit', color: C.text }}>
              <AlertCircle size={20} aria-hidden="true" style={{ color: 'var(--sl-warn)', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 17.5, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.3 }}>{leftText}</span>
              <ChevronRight size={20} aria-hidden="true" style={{ color: C.muted, flexShrink: 0 }} />
            </button>
          ) : (
            <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 22px', padding: 16, minHeight: 60, borderRadius: 18, background: 'linear-gradient(180deg, color-mix(in srgb, var(--sl-ok) 7%, var(--sl-raised)), var(--sl-raised) 70%)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--sl-ok) 32%, transparent)' }}>
              <Check size={20} strokeWidth={2.5} aria-hidden="true" style={{ color: 'var(--sl-ok)', flexShrink: 0 }} />
              <span style={{ fontSize: 17.5, fontWeight: 800, color: C.text }}>Ready to save</span>
            </div>
          )
        )}

        {/* ── Setlist ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, marginTop: emptyShow ? 22 : 0 }}>
          <p style={sectionLabel}>Setlist · {confirmedSongs.length}</p>
          {confirmedSongs.length > 0 && !songsError && (
            <button onClick={() => setEditMode(m => !m)} aria-pressed={editMode} disabled={locked}
              style={{ ...capsButton, minHeight: 44, padding: '0 2px 0 12px', background: 'none', border: 'none', color: 'var(--sl-gold-text)', cursor: locked ? 'default' : 'pointer', opacity: locked ? 0.4 : 1 }}>
              {editMode ? 'Done' : 'Edit'}
            </button>
          )}
        </div>
        {editMode && <p style={{ fontSize: 14, color: C.muted, margin: '0 0 10px' }}>Drag to reorder. Tap ✕ to remove a song.</p>}

        {songsError ? (
          <LoadError compact message="The songs for this show couldn’t be loaded." detail="Saving is unavailable until they load." onRetry={() => setReloadKey(k => k + 1)} />
        ) : (
          <div aria-busy={locked || undefined} style={{ background: 'var(--sl-group)', borderRadius: 16, overflow: 'hidden', opacity: locked ? 0.55 : 1, pointerEvents: locked ? 'none' : 'auto', transition: 'opacity 0.2s ease' }}>
            {confirmedSongs.length > 0 && (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={confirmedSongs.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  {confirmedSongs.map((song, index) => <SortableRow key={song.id} song={song} index={index} onDelete={handleDelete} onTap={handleRowTap} editMode={editMode} locked={locked} first={index === 0} />)}
                </SortableContext>
              </DndContext>
            )}
            {emptyShow && (
              <div style={{ padding: '18px 16px 6px' }}>
                <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: '0 0 2px' }}>No songs on this setlist yet</p>
                <p style={{ fontSize: 14, color: C.muted, margin: 0 }}>Add the songs you played.</p>
              </div>
            )}
            {showAdd ? (
              <div style={{ padding: 12, borderTop: confirmedSongs.length > 0 ? '1px solid var(--sl-line)' : 'none' }}>
                <CatalogSearch userId={userId} placeholder="Search or add a song..." autoFocus showEmpty currentSongs={confirmedSongs.map(s => s.title)}
                  onSelect={(catalogSong) => {
                    const normalized = normalizeSong({ title: catalogSong.title, artist: catalogSong.artist || performance?.artist_name || '' })
                    setSongs(prev => [...prev, { id: `manual-${Date.now()}`, title: normalized.title, artist: normalized.artist, position: songs.length + 1, source: 'manual', recognition_decision_id: null, isrc: catalogSong.isrc || '', composer: catalogSong.composer || '', publisher: catalogSong.publisher || '', reviewState: 'clean', isNew: true }])
                    setShowAdd(false)
                    logReviewAction('add_song')
                  }} />
                <button onClick={() => setShowAdd(false)} style={{ ...capsButton, width: '100%', minHeight: 44, marginTop: 6, background: 'transparent', border: 'none', color: C.secondary, cursor: 'pointer' }}>Cancel</button>
              </div>
            ) : !editMode && (
              <button onClick={() => setShowAdd(true)} disabled={locked}
                style={{ ...capsButton, width: '100%', display: 'flex', alignItems: 'center', gap: 12, minHeight: 54, padding: '0 14px', background: 'none', border: 'none', borderTop: confirmedSongs.length > 0 ? '1px solid var(--sl-line)' : 'none', color: 'var(--sl-gold-text)', cursor: 'pointer', textAlign: 'left' }}>
                <span aria-hidden="true" style={{ minWidth: 20, textAlign: 'right', fontSize: 18, fontWeight: 600 }}>+</span>Add song
              </button>
            )}
          </div>
        )}

        {/* ── Planned, not heard ── */}
        {plannedPending.length > 0 && !songsError && (
          <div ref={plannedRef} style={{ marginTop: 22 }}>
            <p style={{ ...sectionLabel, display: 'flex', alignItems: 'center', gap: 7, minHeight: 44 }}>
              <span aria-hidden="true" style={{ width: 15, height: 15, borderRadius: '50%', border: '1.5px dashed var(--sl-warn)', flexShrink: 0 }} />
              Planned, not heard · {plannedPending.length}
            </p>
            <div style={{ background: 'var(--sl-group)', borderRadius: 16, overflow: 'hidden', opacity: locked ? 0.55 : 1, pointerEvents: locked ? 'none' : 'auto' }}>
              {plannedPending.map((song, i) => (
                <PlannedSongRow key={song.id} song={song} onPlayed={markPlannedAsPlayed} onRemove={removePlannedSong} locked={locked} first={i === 0} />
              ))}
            </div>
          </div>
        )}

        {/* ── More for this show: the photo and the CSV export (unchanged) ── */}
        {!songsError && (
          <div style={{ marginTop: 26 }}>
            <p style={{ ...sectionLabel, minHeight: 32 }}>More for this show</p>
            <div style={{ background: 'var(--sl-group)', borderRadius: 16, overflow: 'hidden', opacity: locked ? 0.55 : 1, pointerEvents: locked ? 'none' : 'auto' }}>
              {photoUrl && <img src={photoUrl} alt="Show photo" style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' }} />}
              <label style={{ ...moreRow, borderTop: photoUrl ? '1px solid var(--sl-line)' : 'none' }}>
                <ImagePlus size={18} aria-hidden="true" style={{ color: C.muted, flexShrink: 0, width: 20 }} />
                <span role={photoUploading ? 'status' : undefined} style={{ flex: 1 }}>{photoUploading ? 'Adding photo…' : photoUrl ? 'Change photo' : 'Add a photo from tonight'}</span>
                <ChevronRight size={18} aria-hidden="true" style={{ color: 'var(--sl-text-4)' }} />
                <input type="file" accept="image/*" onChange={handlePhotoUpload} disabled={photoUploading || locked} style={{ display: 'none' }} />
              </label>
              <button onClick={() => setShowExport(!showExport)} aria-expanded={showExport} style={{ ...moreRow, borderTop: '1px solid var(--sl-line)' }}>
                <Download size={18} aria-hidden="true" style={{ color: C.muted, flexShrink: 0, width: 20 }} />
                <span style={{ flex: 1 }}>Export CSV for SOCAN, ASCAP or BMI</span>
                <ChevronRight size={18} aria-hidden="true" style={{ color: 'var(--sl-text-4)', transform: showExport ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s ease' }} />
              </button>
              {showExport ? (
                <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(['SOCAN', 'ASCAP', 'BMI'] as PRO[]).map(pro => (
                    <button key={pro} onClick={() => generateExportCSV(pro)} onMouseEnter={() => setSelectedPRO(pro)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, padding: '0 14px', background: selectedPRO === pro ? C.goldDim : 'transparent', border: `1px solid ${selectedPRO === pro ? C.borderGold : C.border}`, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: selectedPRO === pro ? C.gold : C.text }}>{pro}</span>
                      <span style={{ fontSize: 13, color: C.muted }}>{pro === 'SOCAN' ? 'Canada' : 'USA'} · CSV ↓</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {photoError && <p role="alert" style={{ fontSize: 13.5, color: C.text, margin: '8px 0 0' }}>The photo couldn’t be added. Try again.</p>}
          </div>
        )}

        {/* Clearance so the last row scrolls clear of the pinned bar. */}
        <div aria-hidden="true" style={{ height: showBar ? (saveError ? 260 : 170) : 40 }} />
      </div>

      {/* ── Pinned SAVE SHOW, above the tab bar ── */}
      {showBar && (
        <div className="rv-savebar">
          <div style={{ maxWidth: 680, margin: '0 auto' }}>
            {saveError && (
              <div role="alert" style={{ background: 'color-mix(in srgb, var(--sl-warn) 9%, var(--sl-bg))', border: '1px solid color-mix(in srgb, var(--sl-warn) 28%, transparent)', borderRadius: 12, padding: '12px 14px', fontSize: 14, color: 'var(--sl-text)', lineHeight: 1.45, marginBottom: 10 }}>
                {saveError.text}
                <span style={{ display: 'block', fontSize: 12.5, color: 'var(--sl-text-3)', marginTop: 4, fontFamily: '"DM Mono", monospace' }}>{saveError.ref}</span>
              </div>
            )}
            {emptyShow ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={() => setShowAdd(true)} disabled={locked} style={{ ...capsButton, fontSize: 14.5, width: '100%', minHeight: 52, background: C.gold, border: 'none', borderRadius: 14, color: 'var(--sl-on-accent)', cursor: 'pointer' }}>Add song</button>
                <button onClick={() => setEmptyConfirm(true)} disabled={locked || saved} style={{ ...capsButton, width: '100%', minHeight: 48, background: 'transparent', border: '1px solid color-mix(in srgb, var(--sl-text) 14%, transparent)', borderRadius: 14, color: C.secondary, cursor: locked ? 'default' : 'pointer' }}>{saving ? 'Saving…' : 'Save without songs'}</button>
              </div>
            ) : (
              <>
                <button onClick={handleSave} disabled={saving || saved}
                  style={{ ...capsButton, fontSize: 14.5, width: '100%', minHeight: 52, background: saved ? 'var(--sl-ok-strong)' : C.gold, border: 'none', borderRadius: 14, color: saved ? '#fff' : 'var(--sl-on-accent)', cursor: saving || saved ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {saved ? <><Check size={16} strokeWidth={2.5} /> Saved</> : saving ? 'Saving…' : saveError?.retry ? 'Try again' : 'Save show'}
                </button>
                <p style={{ fontSize: 13, color: C.muted, textAlign: 'center', margin: '7px 0 0', lineHeight: 1.4 }}>{fine}</p>
              </>
            )}
          </div>
        </div>
      )}

      {undo && !saving && (
        <div role="status" className="rv-toast" style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, padding: '0 6px 0 16px', background: 'var(--sl-sheet)', borderRadius: 12, boxShadow: '0 12px 30px rgba(0,0,0,0.5)', fontSize: 15, color: C.text }}>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{undo.label}</span>
          <button onClick={undoLast} style={{ ...capsButton, minHeight: 44, padding: '0 12px', background: 'none', border: 'none', color: 'var(--sl-gold-text)', cursor: 'pointer' }}>Undo</button>
        </div>
      )}

      {editSheet ? (() => {
        const pos = confirmedSongs.findIndex(s => s.id === editSheet.id) + 1
        return <SongSheet song={editSheet} position={pos} total={confirmedSongs.length} onSave={handleEdit} onRemove={handleDelete} onClose={() => setEditSheet(null)} />
      })() : null}
      {assignSheet ? <AssignSheet assignSheet={assignSheet} onAssign={assignSong} onClose={closeAssignSheet} onCatalogSelect={assignFromCatalog} onRemove={handleDelete} userId={userId} currentSongs={confirmedSongs.filter(s => s.id !== assignSheet.songId).map(s => s.title)} /> : null}

      {/* SAVE WITHOUT SONGS asks first; only its own button runs the existing save. */}
      {emptyConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'fadeIn 0.15s ease' }} onClick={() => setEmptyConfirm(false)}>
          <div role="alertdialog" aria-label="Save without songs?" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, background: 'var(--sl-sheet)', borderRadius: '22px 22px 0 0', padding: '22px 20px calc(24px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 10, animation: 'sheetUp 0.22s ease', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
            <p style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: 0 }}>Save without songs?</p>
            <p style={{ fontSize: 15, color: C.secondary, margin: '0 0 8px', lineHeight: 1.45 }}>{performance?.venue_name} will be saved as complete with an empty setlist.</p>
            <button onClick={() => { setEmptyConfirm(false); handleSave() }} style={{ ...capsButton, fontSize: 14.5, minHeight: 52, background: C.gold, border: 'none', borderRadius: 14, color: 'var(--sl-on-accent)', cursor: 'pointer' }}>Save without songs</button>
            <button onClick={() => setEmptyConfirm(false)} style={{ ...capsButton, minHeight: 48, background: 'transparent', border: 'none', color: C.secondary, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes slideUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes sheetUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        *{-webkit-tap-highlight-color:transparent}
        input::placeholder{color:var(--sl-text-3)}
        input:focus{border-color:var(--sl-input-line-active)!important}
        /* SAVE SHOW sits above the phone tab bar (65px + the raised capture
           disc) and the home-indicator inset; beside the sidebar on desktop. */
        .rv-savebar { position: fixed; left: 0; right: 0; bottom: calc(79px + env(safe-area-inset-bottom, 0px)); z-index: 39; padding: 14px max(20px, env(safe-area-inset-right, 0px)) 10px max(20px, env(safe-area-inset-left, 0px)); background: linear-gradient(180deg, color-mix(in srgb, var(--sl-bg) 0%, transparent) 0, color-mix(in srgb, var(--sl-bg) 94%, transparent) 18px, var(--sl-bg) 100%); }
        .rv-row:focus-visible { outline: 2px solid var(--sl-gold); outline-offset: -2px; }
        .rv-toast { position: fixed; left: 16px; right: 16px; bottom: calc(190px + env(safe-area-inset-bottom, 0px)); z-index: 41; max-width: 488px; margin: 0 auto; }
        @media (min-width: 900px) { .rv-savebar { left: 248px; bottom: 0; padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px)); } .rv-toast { left: 264px; bottom: 140px; } }
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:color-mix(in srgb, var(--sl-text) 8%, transparent);border-radius:2px}
      `}</style>
    </div>
  )
}
