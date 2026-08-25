'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useActingAs } from '@/components/ActingAsProvider'
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
import { estimateRoyalties, capacityToBand } from '@/lib/royalty-estimate'
import CatalogSearch, { type CatalogSong } from '@/components/CatalogSearch'
import { normalizeSong } from '@/lib/song-utils'
import { PlannedVsPlayed } from '@/components/PlannedVsPlayed'
import TonightsRunCard from '@/components/share-cards/TonightsRunCard'
import SongDebutCard from '@/components/share-cards/SongDebutCard'
import RoyaltyMomentCard from '@/components/share-cards/RoyaltyMomentCard'
import MilestoneCard from '@/components/share-cards/MilestoneCard'
import html2canvas from 'html2canvas'

const C = {
  bg: '#0a0908', card: '#141210', cardGrad: 'linear-gradient(180deg, #171512 0%, #121009 100%)', cardHover: '#181614',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#a09070', muted: '#6a6050',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)', green: '#4ade80', red: '#ef4444',
}

function useCountUp(target: number, duration: number = 1200, delay: number = 0): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (target === 0) return
    let startTime: number | null = null
    let animFrame: number
    const delayTimer = setTimeout(() => {
      function step(timestamp: number) {
        if (!startTime) startTime = timestamp
        const progress = Math.min((timestamp - startTime) / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        setCount(Math.floor(eased * target))
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

async function writeUserSongFromReview(
  supabase: ReturnType<typeof import('@/lib/supabase/client').createClient>,
  title: string, artist: string, userId: string, performanceId: string
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
    if (guardError) { if (guardError.code === '23505') return; return }
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
        user_id: userId, song_title: title, canonical_artist: artist || null,
        confirmed_count: 1, last_confirmed_at: new Date().toISOString(),
      })
    }
  } catch (err) { console.error('[UserSongs] review write failed:', err) }
}

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
      style={{ width: '100%', padding: '14px', background: state === 'done' ? 'rgba(74,222,128,0.08)' : 'transparent', border: `1px solid ${state === 'done' ? 'rgba(74,222,128,0.3)' : 'rgba(201,168,76,0.3)'}`, borderRadius: 12, color: state === 'done' ? C.green : C.gold, fontSize: 13, fontWeight: 700, cursor: state === 'loading' ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', marginBottom: 10, letterSpacing: '0.04em', WebkitTapHighlightColor: 'transparent', opacity: state === 'loading' ? 0.7 : 1, transition: 'all 0.2s ease' }}>
      {state === 'loading' ? <><div style={{ width: 13, height: 13, borderRadius: '50%', border: `2px solid rgba(201,168,76,0.3)`, borderTopColor: C.gold, animation: 'spin 0.7s linear infinite' }} />Generating card...</> : state === 'done' ? <>✓ Card ready</> : <>✦ Share Setlist Card</>}
    </button>
  )
}

function SortableRow({ song, index, onDelete, onTap }: {
  song: Song; index: number; onDelete: (id: string) => void; onTap: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: song.id })
  const [swipeX, setSwipeX]   = useState(0)
  const [swiping, setSwiping] = useState(false)
  const [hovered, setHovered] = useState(false)
  const touchStart             = useRef<{ x: number; y: number } | null>(null)
  const ACTION_W = 140; const THRESHOLD = 60
  const isOpen = swipeX <= -THRESHOLD
  const isUnknown = song.source === 'unidentified'
  const needsReview = isUnknown || song.reviewState === 'needs_review'
  const isVerified = !!song.was_planned && song.source !== 'planned'

  function onTouchStart(e: React.TouchEvent) { touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; setSwiping(false) }
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
  function onTouchEnd() { if (!swiping) return; setSwiping(false); touchStart.current = null; setSwipeX(swipeX < -THRESHOLD ? -ACTION_W : 0) }
  function closeSwipe() { setSwipeX(0) }

  const leftBorder = isVerified ? 'rgba(74,222,128,0.5)' : needsReview ? 'rgba(201,168,76,0.6)' : 'rgba(74,222,128,0.25)'

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition: swiping ? 'none' : transition, position: 'relative', borderRadius: 12, overflow: 'hidden', opacity: isDragging ? 0.4 : 1 }}>
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: ACTION_W, display: 'flex', pointerEvents: swipeX < -20 ? 'auto' : 'none' }}>
        <button onClick={() => { closeSwipe(); onTap(song.id) }} style={{ flex: 1, background: C.gold, border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, color: '#0a0908' }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'inherit' }}>Edit</span>
        </button>
        <button onClick={() => { closeSwipe(); onDelete(song.id) }} style={{ flex: 1, background: C.red, border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, color: '#fff', borderRadius: '0 12px 12px 0' }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'inherit' }}>Delete</span>
        </button>
      </div>
      <div
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        onClick={() => { if (swipeX < -10) { closeSwipe(); return } onTap(song.id) }}
        style={{ transform: `translateX(${swipeX}px)`, transition: swiping ? 'none' : 'transform 0.22s cubic-bezier(0.25,1,0.5,1)', background: isDragging ? C.cardHover : C.card, border: '1px solid rgba(255,255,255,0.04)', borderLeft: `3px solid ${leftBorder}`, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px 14px 12px', minHeight: 64, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', userSelect: 'none' }}>
        <div {...attributes} {...listeners} onClick={e => e.stopPropagation()} style={{ color: C.muted, cursor: 'grab', flexShrink: 0, display: 'flex', alignItems: 'center', padding: '4px 2px', touchAction: 'none' }}>
          <GripVertical size={15} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, minWidth: 18, textAlign: 'right', flexShrink: 0, fontFamily: '"DM Mono", monospace', fontVariantNumeric: 'tabular-nums' }}>{index + 1}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {needsReview ? (
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: C.gold, margin: 0, fontStyle: 'italic' }}>{isUnknown ? 'Unknown — tap to fix' : song.title}</p>
              <p style={{ fontSize: 11, color: C.gold, opacity: 0.6, margin: '2px 0 0', fontWeight: 500 }}>Tap to fix</p>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.title}</p>
              {isVerified
                ? <p style={{ fontSize: 12, color: C.green, margin: '2px 0 0', fontWeight: 600, opacity: 0.85 }}>Verified ✓</p>
                : song.isrc
                ? <p style={{ fontSize: 10, color: C.muted, margin: '2px 0 0', fontFamily: '"DM Mono", monospace', letterSpacing: '0.04em' }}>{song.isrc}</p>
                : null
              }
            </div>
          )}
        </div>
        <div onClick={hovered ? (e) => { e.stopPropagation(); onDelete(song.id) } : undefined}
          style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, background: hovered ? 'rgba(239,68,68,0.12)' : 'transparent', border: hovered ? '1px solid rgba(239,68,68,0.25)' : '1px solid transparent', transition: 'all 0.15s ease', cursor: hovered ? 'pointer' : 'default' }}>
          {hovered ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          ) : isVerified ? (
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: C.gold, display: 'inline-block', flexShrink: 0 }} />
          ) : needsReview ? (
            <span style={{ fontSize: 10, color: C.gold, opacity: 0.7, fontWeight: 700 }}>!</span>
          ) : (
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'transparent', border: `1.5px solid ${C.gold}`, display: 'inline-block', opacity: 0.6, flexShrink: 0 }} />
          )}
        </div>
      </div>
    </div>
  )
}

function EditSheet({ song, onSave, onClose }: { song: Song; onSave: (id: string, title: string, artist: string) => void; onClose: () => void }) {
  const [title, setTitle]   = useState(song.title === 'Unknown song' ? '' : song.title)
  const [artist, setArtist] = useState(song.artist)
  const bottomOffset        = useKeyboardOffset()
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'fadeIn 0.15s ease' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, background: C.cardGrad, borderRadius: '20px 20px 0 0', border: '1px solid rgba(255,255,255,0.07)', borderBottom: 'none', padding: '20px 20px 40px', display: 'flex', flexDirection: 'column', gap: 12, animation: 'sheetUp 0.22s ease', fontFamily: '"DM Sans", system-ui, sans-serif', marginBottom: bottomOffset, transition: 'margin-bottom 0.15s ease', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: 0 }}>Edit song</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 4 }}><X size={16} /></button>
        </div>
        <input autoFocus value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && title.trim()) { onSave(song.id, title.trim(), artist.trim()); onClose() } }} placeholder="Song title" spellCheck={false} autoCorrect="off" autoCapitalize="words" style={{ background: C.input, border: `1px solid ${C.gold}40`, borderRadius: 10, padding: '13px 14px', color: C.text, fontSize: 15, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
        <input value={artist} onChange={e => setArtist(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && title.trim()) { onSave(song.id, title.trim(), artist.trim()); onClose() } }} placeholder="Artist" spellCheck={false} autoCorrect="off" autoCapitalize="words" style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 10, padding: '13px 14px', color: C.text, fontSize: 15, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
        <button onClick={() => { if (title.trim()) { onSave(song.id, title.trim(), artist.trim()); onClose() } }} disabled={!title.trim()} style={{ width: '100%', padding: '14px', background: title.trim() ? C.gold : C.muted, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: title.trim() ? 'pointer' : 'not-allowed', opacity: title.trim() ? 1 : 0.4, fontFamily: 'inherit', marginTop: 4 }}>
          Save
        </button>
      </div>
    </div>
  )
}

function AssignSheet({ assignSheet, onAssign, onClose, onCatalogSelect, userId, currentSongs }: {
  assignSheet: { songId: string; currentTitle: string }; onAssign: (s: RecentSong) => void
  onClose: () => void; onCatalogSelect: (song: CatalogSong, songId: string) => void
  userId: string | null; currentSongs: string[]
}) {
  const bottomOffset = useKeyboardOffset()
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'fadeIn 0.15s ease' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, background: C.cardGrad, borderRadius: '20px 20px 0 0', border: '1px solid rgba(255,255,255,0.07)', borderBottom: 'none', padding: '20px 20px 40px', display: 'flex', flexDirection: 'column', gap: 12, animation: 'sheetUp 0.22s ease', fontFamily: '"DM Sans", system-ui, sans-serif', marginBottom: bottomOffset, transition: 'margin-bottom 0.15s ease', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>What song was this?</p>
            {assignSheet.currentTitle && assignSheet.currentTitle !== 'Unknown song' ? <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 0' }}>replacing: {assignSheet.currentTitle}</p> : null}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 4 }}><X size={16} /></button>
        </div>
        <CatalogSearch userId={userId} placeholder="Search or type any song title..." autoFocus showEmpty currentSongs={currentSongs} onSelect={(song) => onCatalogSelect(song, assignSheet.songId)} />
        <p style={{ fontSize: 11, color: C.muted, margin: '4px 0 0', lineHeight: 1.5, textAlign: 'center' }}>Search your catalog or type any title to add it</p>
      </div>
    </div>
  )
}

function PlannedSongRow({ song, onPlayed, onRemove }: {
  song: Song
  onPlayed: (id: string) => void
  onRemove: (id: string) => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
      background: 'rgba(255,255,255,0.02)',
      border: '1px dashed rgba(255,255,255,0.1)',
      borderRadius: 12, opacity: 0.75,
    }}>
      <div style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.15)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
      </div>
      <p style={{ fontSize: 14, fontWeight: 500, color: C.secondary, margin: 0, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {song.title}
      </p>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          onClick={() => onPlayed(song.id)}
          style={{ padding: '6px 12px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 8, color: C.green, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.04em', WebkitTapHighlightColor: 'transparent', whiteSpace: 'nowrap' }}>
          ✓ Played
        </button>
        <button
          onClick={() => onRemove(song.id)}
          style={{ padding: '6px 10px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>
          ✕
        </button>
      </div>
    </div>
  )
}


function CeremonyCountCard({ songCount, showDate, verifiedCount, autoCount, manualCount, songs }: {
  songCount: number; showDate: string
  verifiedCount: number; autoCount: number; manualCount: number
  songs: Song[]
}) {
  const count = useCountUp(songCount, 1000, 500)
  return (
    <div style={{ background: C.cardGrad, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 24, overflow: 'hidden', marginBottom: 12, opacity: 0, animation: 'fadeUp 0.6s 0.5s ease forwards', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
      <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
          <span style={{ fontSize: 64, fontWeight: 800, color: '#f0ece3', fontFamily: '"DM Mono", monospace', letterSpacing: '-0.04em', lineHeight: 1, animation: count === songCount ? 'countPulse 0.4s ease' : 'none' }}>
            {count}
          </span>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#b8a888', letterSpacing: '-0.01em' }}>
            {songCount === 1 ? 'song' : 'songs'}
          </span>
        </div>
        <p style={{ fontSize: 13, color: '#8a7a68', margin: 0, letterSpacing: '0.04em' }}>
          Captured live · {showDate}
        </p>
      </div>
      <div style={{ padding: '16px 0 8px' }}>
        {songs.map((s, i) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'baseline', gap: 14, padding: '9px 24px', opacity: 0, animation: `fadeUp 0.4s ${0.55 + i * 0.04}s ease forwards` }}>
            <span style={{ fontSize: 11, color: '#8a7a68', minWidth: 18, textAlign: 'right', fontFamily: '"DM Mono", monospace', opacity: 0.4, flexShrink: 0 }}>{i + 1}</span>
            <p style={{ fontSize: 16, fontWeight: s.was_planned ? 600 : 500, color: '#f0ece3', margin: 0, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.005em' }}>{s.title}</p>
          </div>
        ))}
      </div>
      <div style={{ padding: '12px 24px 18px', borderTop: `1px solid rgba(255,255,255,0.04)`, display: 'flex', gap: 16, flexWrap: 'wrap' as const }}>
        {verifiedCount > 0 && <span style={{ fontSize: 13, color: '#8a7a68', opacity: 0.7 }}>✓ {verifiedCount} from setlist</span>}
        {autoCount > verifiedCount && <span style={{ fontSize: 13, color: '#8a7a68', opacity: 0.7 }}>◈ {autoCount - verifiedCount} detected</span>}
        {manualCount > 0 && <span style={{ fontSize: 13, color: '#8a7a68', opacity: 0.7 }}>+ {manualCount} added</span>}
      </div>
    </div>
  )
}

function CeremonyRoyaltyCard({ expected, low, high, performanceId, onClaim }: {
  expected: number; low: number; high: number
  performanceId: string; onClaim: () => void
}) {
  const count = useCountUp(expected, 1200, 800)
  return (
    <div style={{ background: 'rgba(201,168,76,0.05)', border: `1px solid rgba(201,168,76,0.14)`, borderRadius: 20, padding: '20px 22px', marginBottom: 12, opacity: 0, animation: 'fadeUp 0.6s 0.85s ease forwards' }}>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8a7a68', margin: '0 0 8px' }}>
        What tonight generated
      </p>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 52, fontWeight: 800, color: '#c9a84c', fontFamily: '"DM Mono", monospace', letterSpacing: '-0.03em', lineHeight: 1 }}>
          ~${count.toLocaleString()}
        </span>
      </div>
      <p style={{ fontSize: 13, color: '#8a7a68', margin: '0 0 6px', opacity: 0.7 }}>${low}–${high} estimated range · <span style={{ color: '#c9a84c' }}>for the songs you performed</span></p>
      <p style={{ fontSize: 11, color: '#8a7a68', margin: '0 0 16px', opacity: 0.55 }}>Estimate only, not guaranteed — actual payouts vary by PRO.</p>
      <button onClick={onClaim}
        style={{ width: '100%', padding: '13px', background: C.gold, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.06em', transition: 'transform 0.15s ease' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.01)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}>
        Submit the setlist →
      </button>
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
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(false)
  const [showComplete, setShowComplete] = useState(false)
  const [justCompleted, setJustCompleted] = useState(false)
  const [computedShowNumber, setComputedShowNumber] = useState<number | null>(null)
  const [activeCardIndex, setActiveCardIndex] = useState(0)
  const [newTitle, setNewTitle]         = useState('')
  const [newArtist, setNewArtist]       = useState('')
  const [showAdd, setShowAdd]           = useState(false)
  const [showExport, setShowExport]     = useState(false)
  const [selectedPRO, setSelectedPRO]   = useState<PRO>('SOCAN')
  const [editSheet, setEditSheet]       = useState<Song | null>(null)
  const [assignSheet, setAssignSheet]   = useState<{ songId: string; currentTitle: string } | null>(null)
  const [userId, setUserId]             = useState<string | null>(null)
  const [intelligence, setIntelligence] = useState<ShowIntelligence | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const shareCardRef = useRef<HTMLDivElement>(null)
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
  }

  function handleRowTap(songId: string) {
    const song = songs.find(s => s.id === songId)
    if (!song) return
    if (song.source === 'unidentified' || song.reviewState === 'needs_review') openAssignSheet(songId)
    else setEditSheet(song)
  }

  function markPlannedAsPlayed(songId: string) {
    setSongs(prev => prev.map(s => s.id === songId
      ? { ...s, source: 'manual', was_planned: true, reviewState: 'clean' }
      : s
    ))
  }

  function removePlannedSong(songId: string) {
    setSongs(prev => {
      const t = prev.find(s => s.id === songId)
      if (t?.isNew) return prev.filter(s => s.id !== songId)
      return prev.map(s => s.id === songId ? { ...s, isRemoved: true } : s)  // planned & not played → TN at save
    })
  }

  // ── Fetch post-show intelligence after save ───────────────────────────────
  async function fetchIntelligence(uid: string, venueName: string, songTitles: string[]) {
    try {
      const supabase = createClient()
      const MILESTONES = [5, 10, 25, 50, 100, 250, 500]

      const [totalResult, venueResult, debutResult, profileResult] = await Promise.all([
        // Total completed captured shows (excludes Setlist.fm imports)
        supabase
          .from('performances')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', uid)
          .in('status', ['complete', 'completed', 'review'])
          .neq('data_source', 'setlistfm_imported'),

        // Visits to this specific venue
        supabase
          .from('performances')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', uid)
          .eq('venue_name', venueName)
          .in('status', ['complete', 'completed']),

        // Song debuts — confirmed_count === 1 means performed for first time tonight
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

      const capturedShows = totalResult.count || 0
      const totalShows = capturedShows
      const venueVisits = venueResult.count || 0
      const songDebuts = debutResult.data?.map((r: { song_title: string }) => r.song_title) || []
      const milestone = MILESTONES.find(m => m === totalShows) || null

      setIntelligence({ totalShows, venueVisits, songDebuts, milestone, capturedShows })
    } catch (err) {
      console.error('[Intelligence] fetch failed:', err)
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
        .from('performances')
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
    supabase.from('performances').select('*, status, shows(show_type), venues(capacity)').eq('id', params.id).single()
      .then(async ({ data: perf }) => {
        if (!perf) { setLoading(false); return }
        setPerformance({ ...perf, show_type: perf.shows?.show_type || null, venue_capacity: perf.venues?.capacity || null })
        if (perf.photo_url) setPhotoUrl(perf.photo_url)
        const resolvedSetlistId = perf.setlist_id || null
        setSetlistId(resolvedSetlistId)

        // Primary source: performance_songs — holds the row ids we update in place
        // plus the confusion-matrix columns. Rows the artist already removed stay in
        // the DB but are hidden here.
        const { data: songData } = await supabase.from('performance_songs').select('*').eq('performance_id', params.id).order('position')
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
          const { data: items } = await supabase.from('setlist_items').select('*').eq('setlist_id', resolvedSetlistId).order('position')
          if (items && items.length > 0) {
            setSongs(items.map(s => {
              const n = normalizeSong({ title: s.title, artist: s.artist_name || '' })
              return { id: s.id, title: n.title, artist: n.artist, position: s.position, source: s.source, recognition_decision_id: s.recognition_decision_id, isrc: s.isrc || '', composer: s.composer || '', publisher: s.publisher || '', reviewState: (s.source === 'unidentified' ? 'needs_review' : 'clean') as 'clean' | 'needs_review', was_planned: s.was_planned || false }
            }))
            setLoading(false); return
          }
        }
        setLoading(false)
      })
  }, [params.id])

  // Sequence: start only right after the artist completes this review in
  // this session — not on every load, or revisiting an already-completed
  // show replays the whole reveal (including a show number that could have
  // changed since).
  useEffect(() => {
    if (loading || !justCompleted) return
    const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) { setSeqPhase(7); setShowComplete(true); return }

    const cs = songs.filter(s => s.source !== 'planned' && !s.isRemoved)
    const pp = songs.filter(s => s.source === 'planned' && !s.isRemoved)
    const hasSongs  = cs.length > 0
    const hasGaps   = pp.length > 0
    const hasShowNum = computedShowNumber != null

    // Each confirmed song gets 1400ms: 600ms fade-in, 400ms hold, 400ms fade-out.
    // Max 5 individual moments; if more, first 5 then "+N more" as one extra moment.
    const songMoments = hasSongs ? Math.min(cs.length, 5) + (cs.length > 5 ? 1 : 0) : 0
    const songMs = songMoments * 1400

    // Cumulative phase start times (ms)
    const venueAt   = 1200
    const songAt    = hasSongs ? 2200 : -1
    const afterSong = hasSongs ? 2200 + songMs : 2200
    const gapAt     = hasGaps ? afterSong : -1
    const royaltyAt = afterSong + (hasGaps ? 2000 : 0)
    const stampAt   = hasShowNum ? royaltyAt + 1800 : -1
    const fadeAt    = royaltyAt + 1800 + (hasShowNum ? 600 : 0)
    const doneAt    = fadeAt + 400

    setSeqPhase(1)
    const timers: ReturnType<typeof setTimeout>[] = []
    timers.push(setTimeout(() => setSkipEnabled(true), 2000))
    timers.push(setTimeout(() => setSeqPhase(2), venueAt))
    if (songAt > 0)  timers.push(setTimeout(() => setSeqPhase(3), songAt))
    if (gapAt  > 0)  timers.push(setTimeout(() => setSeqPhase(4), gapAt))
    timers.push(setTimeout(() => setSeqPhase(5), royaltyAt))
    if (stampAt > 0) timers.push(setTimeout(() => setSeqPhase(6), stampAt))
    timers.push(setTimeout(() => setSeqFading(true), fadeAt))
    timers.push(setTimeout(() => { setSeqPhase(7); setShowComplete(true) }, doneAt))

    return () => {
      timers.forEach(clearTimeout)
      if (seqRafRef.current) cancelAnimationFrame(seqRafRef.current)
    }
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
      songCount: confirmedForEst.length || 8,
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
    }
  }
  function handleDelete(id: string) {
    setSongs(prev => {
      const t = prev.find(s => s.id === id)
      if (t?.isNew) return prev.filter(s => s.id !== id)                 // never persisted → just drop
      return prev.map(s => s.id === id ? { ...s, isRemoved: true } : s)  // keep the record, flag removed (→ FP/TN on save)
    })
  }
  function handleEdit(id: string, title: string, artist: string) { setSongs(prev => prev.map(s => s.id === id ? { ...s, title, artist, reviewState: 'clean', isModified: true } : s)) }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !performance) return
    setPhotoUploading(true)
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
      await supabase.from('performances').update({ photo_url: publicUrl }).eq('id', performance.id)
      setPhotoUrl(publicUrl)
    } catch (err) {
      console.error('Photo upload failed:', err)
    } finally {
      setPhotoUploading(false)
    }
  }

  async function shareCard() {
    if (!shareCardRef.current) return
    try {
      const element = shareCardRef.current
      const cardDiv = element.firstElementChild as HTMLElement
      if (!cardDiv) return

      // Force explicit dimensions before capture
      const width = cardDiv.offsetWidth
      const height = Math.round(width * (16 / 9))

      // Temporarily set explicit height so html2canvas captures correctly
      const originalHeight = cardDiv.style.height
      const originalAspectRatio = cardDiv.style.aspectRatio
      cardDiv.style.height = `${height}px`
      cardDiv.style.aspectRatio = 'unset'

      await new Promise(r => setTimeout(r, 100)) // let browser reflow

      const canvas = await html2canvas(cardDiv, {
        scale: 3,
        backgroundColor: '#0a0908',
        useCORS: true,
        allowTaint: true,
        logging: false,
        width,
        height,
        scrollX: 0,
        scrollY: 0,
      })

      // Restore original styles
      cardDiv.style.height = originalHeight
      cardDiv.style.aspectRatio = originalAspectRatio

      canvas.toBlob(async (blob) => {
        if (!blob) return
        const file = new File([blob], 'setlistr-card.png', { type: 'image/png' })
        if (navigator.share && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `${performance?.artist_name} at ${performance?.venue_name}`,
          })
        } else {
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = 'setlistr-card.png'
          a.click()
          URL.revokeObjectURL(url)
        }
      }, 'image/png')
    } catch (err) {
      console.error('Share failed:', err)
    }
  }

  const handleSave = useCallback(async () => {
    if (!performance) return
    setSaving(true)
    const supabase = createClient()
    // Kept songs (visible, non-removed, non-planned) in display order, plus the
    // existing rows the artist removed. No delete/reinsert — we update in place.
    const kept    = songs.filter(s => !s.isRemoved && s.source !== 'planned')
    const removed = songs.filter(s => s.isRemoved && !s.isNew)

    // Legacy setlist_items mirror — rebuilt from the kept songs (unchanged behaviour)
    if (setlistId) {
      await supabase.from('setlist_items').delete().eq('setlist_id', setlistId)
      await supabase.from('setlist_items').insert(kept.map((s, i) => {
        const n = normalizeSong({ title: s.title, artist: s.artist })
        return { setlist_id: setlistId, title: n.title, artist_name: n.artist, position: i + 1, source: s.source || 'manual', recognition_decision_id: s.recognition_decision_id || null }
      }))
      await supabase.from('setlists').update({ status: 'confirmed', confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', setlistId)
    }

    // ── performance_songs: in-place updates, no delete/reinsert ───────────────
    for (let i = 0; i < kept.length; i++) {
      const s = kept[i]
      const n = normalizeSong({ title: s.title, artist: s.artist })
      const position = i + 1
      if (s.isNew) {
        // Artist added a song the system missed → false negative
        await supabase.from('performance_songs').insert({
          performance_id: performance.id, title: n.title, artist: n.artist, position,
          isrc: s.isrc || null, composer: s.composer || null, publisher: s.publisher || null,
          was_planned: s.was_planned || false,
          inclusion_reason: 'manually added post-show', confusion_matrix_result: 'FN', artist_modified: true,
        })
      } else if (s.isModified) {
        // Artist corrected a detection → keep the record, log what it was
        await supabase.from('performance_songs').update({
          title: n.title, artist: n.artist, position,
          isrc: s.isrc || null, composer: s.composer || null, publisher: s.publisher || null,
          artist_modified: true, notes: `was ${s.origArtist || ''}-${s.origTitle || ''}`,
        }).eq('id', s.id)
      } else {
        // Unchanged detection → just keep ordering current
        await supabase.from('performance_songs').update({ position }).eq('id', s.id)
      }
    }

    // Removed rows stay in the DB: a removed never-detected song is a true negative,
    // a removed detected song is a false positive.
    for (const s of removed) {
      const undetected = s.inclusion_reason === 'planned setlist - not detected' || s.inclusion_reason === 'added mid-show - not detected'
      await supabase.from('performance_songs').update({
        artist_removed: true, confusion_matrix_result: undetected ? 'TN' : 'FP',
      }).eq('id', s.id)
    }

    // Resolve the kept rows still pending (TBD): never-detected songs the artist kept
    // are false negatives (system missed a played song); everything else is a true positive.
    await supabase.from('performance_songs')
      .update({ confusion_matrix_result: 'FN' })
      .eq('performance_id', performance.id).eq('confusion_matrix_result', 'TBD')
      .in('inclusion_reason', ['planned setlist - not detected', 'added mid-show - not detected'])
    await supabase.from('performance_songs')
      .update({ confusion_matrix_result: 'TP' })
      .eq('performance_id', performance.id).eq('confusion_matrix_result', 'TBD')

    // Mark every row for this performance artist-reviewed
    await supabase.from('performance_songs').update({ artist_save_complete: true }).eq('performance_id', performance.id)
    await supabase.from('performances').update({ status: 'completed' }).eq('id', performance.id)
    if (performance.show_id) await supabase.from('shows').update({ status: 'completed' }).eq('id', performance.show_id)

    // Geocode city → lat/lng silently, non-blocking
    if (performance.city) {
      fetch(
        `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(performance.city)}&country=${encodeURIComponent(performance.country || '')}&format=json&limit=1`,
        { headers: { 'User-Agent': 'Setlistr/1.0 (info@setlistr.ai)' } }
      )
        .then(r => r.json())
        .then(geoData => {
          if (geoData?.[0]) {
            supabase.from('performances').update({
              latitude: parseFloat(geoData[0].lat),
              longitude: parseFloat(geoData[0].lon),
            }).eq('id', performance.id).then(() => {})
          }
        })
        .catch(() => {})
    }
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        for (const song of kept) {
          if (!song.title?.trim()) continue
          await writeUserSongFromReview(supabase, song.title, song.artist || '', actingAsArtistId || user.id, performance.id)
        }
        // computeShowNumber uses performance.user_id, not actingAsArtistId like
        // fetchIntelligence above — a show's number belongs to the artist whose
        // career it is, not whoever's looking. Same rule as submit's PRO identity.
        fetchIntelligence(actingAsArtistId || user.id, performance.venue_name, kept.map(s => s.title).filter(Boolean))
        const num = await computeShowNumber(performance.user_id, performance.id)
        setComputedShowNumber(num)
      }
    } catch (err) { console.error('[ReviewSave]', err) }
    setSaving(false); setSaved(true); setJustCompleted(true)
  }, [performance, songs, setlistId, actingAsArtistId])

  function generateExportCSV(pro: PRO) {
    if (!performance) return
    const date = parseLocalDate(performance.started_at).toLocaleDateString()
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
    a.download = `${pro}-setlist-${performance.venue_name}-${parseLocalDate(performance.started_at).toLocaleDateString().replace(/\//g, '-')}.csv`
    a.click(); URL.revokeObjectURL(url)
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

  if (loading) return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', border: `1.5px solid ${C.gold}`, animation: 'breathe 1.8s ease-in-out infinite' }} />
        <span style={{ color: C.muted, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Loading</span>
      </div>
      <style>{`@keyframes breathe{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.2);opacity:.8}}`}</style>
    </div>
  )

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
    const venueDate = performance?.started_at
      ? parseLocalDate(performance.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted, margin: '0 0 18px', opacity: 0.55 }}>
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
                <div key={song.id} onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 12 }}>
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <p style={{ fontSize: 15, color: C.secondary, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>{song.title}</p>
                    <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 0' }}>Did you play it?</p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); markPlannedAsPlayed(song.id) }}
                    style={{ flexShrink: 0, padding: '6px 14px', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 8, color: C.green, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.04em', WebkitTapHighlightColor: 'transparent' }}>
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
    const songCount = confirmedSongs.length > 0 ? confirmedSongs.length : 8
    const estimate  = estimateRoyalties({ songCount, venueCapacityBand: capacityToBand(performance?.venue_capacity), showType: (performance?.show_type as any) || 'single', territory })
    const showDate  = performance?.started_at ? parseLocalDate(performance.started_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : ''
    const durMins   = performance?.started_at && performance?.ended_at ? Math.round((new Date(performance.ended_at).getTime() - new Date(performance.started_at).getTime()) / 60000) : null
    const manualCount = confirmedSongs.filter(s => s.source === 'manual' && !s.was_planned).length

    const insights: Array<{ label: string; highlight: boolean }> = []
    if (intelligence) {
      if (intelligence.milestone) {
        const milestoneWords: Record<number, string> = { 5: 'Five', 10: 'Ten', 25: 'Twenty-five', 50: 'Fifty', 100: 'One hundred', 250: 'Two fifty', 500: 'Five hundred' }
        const word = milestoneWords[intelligence.milestone] || `${intelligence.milestone}`
        insights.push({ label: `Show ${word.toLowerCase()}. That's not nothing.`, highlight: true })
      }
      if (intelligence.venueVisits === 1) insights.push({ label: `First time on record here.`, highlight: false })
      else if (intelligence.venueVisits === 2) insights.push({ label: `Second time at ${performance?.venue_name}. A pattern forming.`, highlight: false })
      else if (intelligence.venueVisits > 2) insights.push({ label: `${performance?.venue_name} knows your name now. ${intelligence.venueVisits}th time.`, highlight: false })
      if (intelligence.totalShows > 0 && !intelligence.milestone) {
        insights.push({ label: `${intelligence.totalShows} shows on record. The road remembers.`, highlight: false })
      }
    }

    return (
      <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif', overflowY: 'auto' }}>
        {/* Gold flare on entry */}
        <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '80vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.10) 0%, transparent 55%)', animation: 'goldFlare 2s ease forwards' }} />

        <div style={{ maxWidth: 420, margin: '0 auto', padding: '0 24px 80px', position: 'relative', zIndex: 1 }}>

          {/* ── CEREMONY HEADER ── */}
          <div style={{ paddingTop: 72, paddingBottom: 56, textAlign: 'center' }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.gold, margin: '0 0 16px', opacity: 0, animation: 'fadeUp 0.5s 0.1s ease forwards' }}>
              Show complete
            </p>
            <h1 style={{ fontSize: 48, fontWeight: 800, color: C.text, margin: '0 0 12px', letterSpacing: '-0.035em', lineHeight: 1.05, opacity: 0, animation: 'fadeUp 0.6s 0.2s ease forwards' }}>
              {performance?.venue_name}
            </h1>
            <p style={{ fontSize: 15, color: C.secondary, margin: '0 0 28px', opacity: 0, animation: 'fadeUp 0.5s 0.3s ease forwards' }}>
              {performance?.city && <span>{performance.city}</span>}
              {showDate && <><span style={{ opacity: 0.35, margin: '0 8px' }}>·</span><span>{showDate}</span></>}
              {!!durMins && <><span style={{ opacity: 0.35, margin: '0 8px' }}>·</span><span>{durMins} min</span></>}
            </p>
            <p style={{ fontSize: 22, fontWeight: 700, color: C.gold, margin: 0, letterSpacing: '-0.01em', fontStyle: 'italic', opacity: 0, animation: 'fadeUp 0.6s 0.45s ease forwards' }}>
              Another one. In the books.
            </p>
          </div>

          {/* ── SONG COUNT — counted up ── */}
          <CeremonyCountCard
            songCount={confirmedSongs.length}
            showDate={showDate}
            verifiedCount={verifiedCount}
            autoCount={autoCount}
            manualCount={manualCount}
            songs={confirmedSongs}
          />

          {/* ── INTELLIGENCE ── */}
            {/* ── SONG DEBUTS ── */}
            {intelligence && intelligence.songDebuts.length > 0 && (
              <div style={{ marginBottom: 12, opacity: 0, animation: 'fadeUp 0.6s 0.65s ease forwards' }}>
                {intelligence.songDebuts.map((song, i) => (
                  <div key={i} style={{
                    padding: '16px 20px', marginBottom: 6,
                    background: 'rgba(201,168,76,0.08)',
                    border: '1px solid rgba(201,168,76,0.25)',
                    borderRadius: 16,
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: 'rgba(201,168,76,0.15)',
                      border: '1px solid rgba(201,168,76,0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16,
                    }}>★</div>
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#c9a84c', margin: '0 0 3px' }}>Live Debut</p>
                      <p style={{ fontSize: 17, fontWeight: 700, color: '#f0ece3', margin: 0, letterSpacing: '-0.01em' }}>{song}</p>
                      <p style={{ fontSize: 12, color: '#8a7a68', margin: '2px 0 0' }}>First time played live. It counts.</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

          {intelligence && insights.length > 0 && (
            <div style={{ marginBottom: 12, opacity: 0, animation: 'fadeUp 0.6s 0.7s ease forwards' }}>
              {insights.slice(0, 2).map((insight, i) => (
                <div key={i} style={{ padding: '14px 20px', background: insight.highlight ? 'rgba(201,168,76,0.07)' : 'transparent', border: `1px solid ${insight.highlight ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.04)'}`, borderRadius: 16, marginBottom: 6 }}>
                  <p style={{ fontSize: 16, fontWeight: insight.highlight ? 600 : 400, color: insight.highlight ? C.gold : C.secondary, margin: 0, lineHeight: 1.5, letterSpacing: '-0.005em' }}>{insight.label}</p>
                </div>
              ))}
            </div>
          )}

          {!intelligence && (
            <div style={{ marginBottom: 12, padding: '14px 20px', background: 'rgba(255,255,255,0.02)', border: `1px solid rgba(255,255,255,0.05)`, borderRadius: 12, opacity: 0, animation: 'fadeUp 0.6s 0.7s ease forwards' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', border: `1.5px solid rgba(201,168,76,0.3)`, borderTopColor: C.gold, animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: C.muted }}>Reading the night...</span>
              </div>
            </div>
          )}

          {/* ── ROYALTY — counted up ── */}
          <CeremonyRoyaltyCard
            expected={estimate.expected}
            low={estimate.low}
            high={estimate.high}
            performanceId={params.id}
            onClaim={() => router.push(`/app/submit/${params.id}`)}
          />

          {/* ── SHARE CARDS ── */}
          {(() => {
              const SPECIAL_MILESTONES = [1, 5, 10, 25, 50, 75, 100, 150, 200, 250]
              const showNumber = computedShowNumber || 0
              const isMilestone = showNumber > 0 && SPECIAL_MILESTONES.includes(showNumber)
              const royaltyAmount = estimate.expected

              const cards = [
                {
                  id: 'tonights_run',
                  label: "Tonight's Run",
                  component: (
                    <TonightsRunCard
                      artistName={performance?.artist_name || ''}
                      venueName={performance?.venue_name || ''}
                      city={performance?.city || ''}
                      date={showDate}
                      songCount={confirmedSongs.length}
                      minutes={durMins && durMins > 0 ? durMins : undefined}
                      showNumber={showNumber}
                      photoUrl={photoUrl}
                    />
                  )
                },
                ...(intelligence && intelligence.songDebuts.length > 0 ? [{
                  id: 'song_debut',
                  label: `Live Debut`,
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
                ...(showNumber > 0 ? [{
                  id: 'milestone',
                  label: `Show #${showNumber}`,
                  component: (
                    <MilestoneCard
                      showNumber={showNumber}
                      artistName={performance?.artist_name || ''}
                    />
                  )
                }] : []),
                {
                  id: 'royalty_moment',
                  label: 'Royalty Moment',
                  component: (
                    <RoyaltyMomentCard
                      artistName={performance?.artist_name || ''}
                      venueName={performance?.venue_name || ''}
                      date={showDate}
                      amount={royaltyAmount}
                    />
                  )
                },
              ]

              return (
                <div style={{ marginBottom: 16, opacity: 0, animation: 'fadeUp 0.6s 1.0s ease forwards' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 12px' }}>
                    Your cards
                  </p>

                  {/* Card display with swipe support */}
                  <div
                    ref={shareCardRef}
                    style={{ marginBottom: 12, touchAction: 'pan-y' }}
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
                    {cards[activeCardIndex].component}
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
                            background: activeCardIndex === i ? C.gold : 'rgba(255,255,255,0.2)',
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
                  <button
                    onClick={shareCard}
                    style={{
                      width: '100%', padding: '14px',
                      background: 'transparent',
                      border: `1px solid ${C.borderGold}`,
                      borderRadius: 12, color: C.gold,
                      fontSize: 14, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: 8,
                      letterSpacing: '0.04em',
                    }}>
                    ✦ Share this card
                  </button>
                </div>
              )
            })()}

          {/* ── ACTIONS ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: 0, animation: 'fadeUp 0.6s 1.1s ease forwards' }}>
            <button onClick={() => router.push('/app/submit/' + params.id)}
              style={{ width: '100%', padding: '17px', background: C.gold, border: 'none', borderRadius: 16, color: '#0a0908', fontSize: 15, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', transition: 'transform 0.15s ease' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = 'scale(1.01)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}>
              Submit the setlist →
            </button>
            <button onClick={() => router.push('/app/dashboard')}
              style={{ width: '100%', padding: '14px', background: 'transparent', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 16, color: C.gold, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity 0.15s ease' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.7'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}>
              Back to your record
            </button>
            <button onClick={() => setShowComplete(false)}
              style={{ width: '100%', padding: '14px', background: 'transparent', border: 'none', borderRadius: 10, color: C.muted, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
              Review the night
            </button>
          </div>

        </div>

        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
          @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
          @keyframes spin { to{transform:rotate(360deg)} }
          @keyframes goldFlare { 0%{opacity:0} 30%{opacity:1} 100%{opacity:0.6} }
          @keyframes countPulse { 0%{transform:scale(1)} 50%{transform:scale(1.04)} 100%{transform:scale(1)} }
          * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        `}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100vw', height: '40vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.05) 0%, transparent 65%)' }} />
      <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 480, width: '100%', margin: '0 auto', padding: '0 16px', boxSizing: 'border-box' }}>

        <div style={{ paddingTop: 28, paddingBottom: 20, animation: 'fadeUp 0.4s ease' }}>
          <h1 style={{ fontSize: 34, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.025em', lineHeight: 1.15 }}>{performance?.venue_name}</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.secondary }}><MapPin size={11} />{performance?.city}</span>
            {performance?.started_at ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.secondary }}><Calendar size={11} />{formatDate(performance.started_at)}</span> : null}
            {dur ? <span style={{ fontSize: 12, color: C.secondary }}>· {dur}</span> : null}
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 14, color: C.secondary }}>{confirmedSongs.length} songs</span>
            {autoCount > 0 && <><span style={{ color: C.muted, opacity: 0.4 }}>·</span><span style={{ fontSize: 14, color: C.muted }}>{autoCount} detected</span></>}
            {needsReviewCount > 0 && <><span style={{ color: C.muted, opacity: 0.4 }}>·</span><span style={{ fontSize: 14, color: '#f87171' }}>{needsReviewCount} need attention</span></>}
          </div>
        </div>

        {/* ── SHOW PHOTO ── */}
        <div style={{ marginBottom: 16 }}>
          {photoUrl ? (
            <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
              <img
                src={photoUrl}
                alt="Show photo"
                style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' }}
              />
              <label style={{
                position: 'absolute', bottom: 10, right: 10,
                background: 'rgba(10,9,8,0.8)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
                fontSize: 12, color: '#b8a888', fontFamily: 'inherit', fontWeight: 600,
              }}>
                Change photo
                <input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />
              </label>
            </div>
          ) : (
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 8, width: '100%', padding: '14px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px dashed rgba(255,255,255,0.12)',
              borderRadius: 12, cursor: 'pointer',
              fontSize: 13, color: '#8a7a68', fontFamily: 'inherit',
            }}>
              {photoUploading ? (
                <>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', border: '1.5px solid rgba(201,168,76,0.3)', borderTopColor: '#c9a84c', animation: 'spin 0.7s linear infinite' }} />
                  Uploading...
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8a7a68" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  Add a photo from tonight
                </>
              )}
              <input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />
            </label>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, animation: 'fadeUp 0.4s 0.05s ease both' }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: C.muted }}>Setlist</span>
          <button onClick={() => setShowAdd(!showAdd)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: showAdd ? 'transparent' : C.goldDim, border: `1px solid ${showAdd ? C.border : C.borderGold}`, borderRadius: 10, padding: '9px 16px', color: showAdd ? C.muted : C.gold, fontSize: 13, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', transition: 'all 0.15s ease', fontFamily: 'inherit', minHeight: 40, WebkitTapHighlightColor: 'transparent' }}>
            <span style={{ display: 'inline-block', transform: showAdd ? 'rotate(45deg)' : 'rotate(0)', transition: 'transform 0.2s ease', fontSize: 16, lineHeight: 1, fontWeight: 400 }}>+</span>
            Add Song
          </button>
        </div>

        {showAdd ? (
          <div style={{ background: C.cardGrad, border: `1px solid ${C.borderGold}`, borderRadius: 12, padding: 14, marginBottom: 10, animation: 'slideUp 0.2s ease', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
            <CatalogSearch userId={userId} placeholder="Search or add a song..." autoFocus showEmpty currentSongs={confirmedSongs.map(s => s.title)}
              onSelect={(catalogSong) => {
                const normalized = normalizeSong({ title: catalogSong.title, artist: catalogSong.artist || performance?.artist_name || '' })
                setSongs(prev => [...prev, { id: `manual-${Date.now()}`, title: normalized.title, artist: normalized.artist, position: songs.length + 1, source: 'manual', recognition_decision_id: null, isrc: catalogSong.isrc || '', composer: catalogSong.composer || '', publisher: catalogSong.publisher || '', reviewState: 'clean', isNew: true }])
                setShowAdd(false)
              }} />
            <button onClick={() => setShowAdd(false)} style={{ width: '100%', marginTop: 8, padding: '8px', background: 'transparent', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          </div>
        ) : null}

        {confirmedSongs.length === 0 && plannedPending.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', animation: 'fadeUp 0.4s ease' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.card, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Music2 size={22} color={C.muted} />
            </div>
            <p style={{ fontSize: 14, color: C.secondary, margin: 0 }}>No songs detected</p>
            <p style={{ fontSize: 12, color: C.muted, margin: '4px 0 0' }}>Add songs manually above</p>
          </div>
        ) : null}

        {confirmedSongs.length > 0 ? (
          <div style={{ animation: 'fadeUp 0.4s 0.1s ease both' }}>
            {confirmedSongs.length > 0 ? <p style={{ fontSize: 14, color: C.muted, margin: '0 0 10px' }}>Tap any song to edit · swipe to delete</p> : null}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={confirmedSongs.map(s => s.id)} strategy={verticalListSortingStrategy}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {confirmedSongs.map((song, index) => <SortableRow key={song.id} song={song} index={index} onDelete={handleDelete} onTap={handleRowTap} />)}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        ) : null}

        {plannedPending.length > 0 && (
          <div style={{ marginTop: confirmedSongs.length > 0 ? 20 : 0, animation: 'fadeUp 0.4s 0.12s ease both' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: 0 }}>
                On your setlist · did you play these?
              </p>
              <span style={{ fontSize: 10, color: C.muted, fontFamily: '"DM Mono", monospace' }}>{plannedPending.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {plannedPending.map(song => (
                <PlannedSongRow
                  key={song.id}
                  song={song}
                  onPlayed={markPlannedAsPlayed}
                  onRemove={removePlannedSong}
                />
              ))}
            </div>
            <p style={{ fontSize: 11, color: C.muted, margin: '8px 0 0', lineHeight: 1.5 }}>
              "Played" adds them to your setlist. "✕" removes them — they won't count toward royalties.
            </p>
          </div>
        )}

        <div style={{ marginTop: 12, background: 'transparent', border: 'none', borderRadius: 16, overflow: 'hidden', animation: 'fadeUp 0.4s 0.15s ease both' }}>
          <button onClick={() => setShowExport(!showExport)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: C.muted }}><Download size={14} color={C.gold} />Export for PRO Submission</span>
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
          <p style={{ fontSize: 11, color: C.muted, textAlign: 'center', margin: '0 0 2px' }}>By saving, you confirm these songs were performed at this show.</p>
          <button onClick={handleSave} disabled={saving || saved}
            style={{ width: '100%', padding: '15px', background: saved ? '#16a34a' : C.gold, border: 'none', borderRadius: 12, color: saved ? '#fff' : '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: saving || saved ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, transition: 'all 0.25s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}
            onMouseEnter={e => { if (!saving && !saved) (e.currentTarget as HTMLElement).style.opacity = '0.8' }}
            onMouseLeave={e => { if (!saving && !saved) (e.currentTarget as HTMLElement).style.opacity = '1' }}>
            {saved ? <><Check size={16} strokeWidth={2.5} /> Saved</> : saving ? <><div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid #0a090840`, borderTopColor: '#0a0908', animation: 'spin 0.7s linear infinite' }} />Saving...</> : 'Save & Complete'}
          </button>
          <button onClick={() => router.push('/app/dashboard')}
            style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', letterSpacing: '0.04em', fontFamily: 'inherit', padding: '6px', transition: 'opacity 0.15s ease' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.7'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}>
            Back to Dashboard
          </button>
        </div>
      </div>

      {editSheet ? <EditSheet song={editSheet} onSave={handleEdit} onClose={() => setEditSheet(null)} /> : null}
      {assignSheet ? <AssignSheet assignSheet={assignSheet} onAssign={assignSong} onClose={closeAssignSheet} onCatalogSelect={assignFromCatalog} userId={userId} currentSongs={confirmedSongs.filter(s => s.id !== assignSheet.songId).map(s => s.title)} /> : null}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes slideUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes sheetUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes breathe{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.2);opacity:.8}}
        @keyframes showStamp{from{transform:scale(1.06)}to{transform:scale(1)}}
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
