'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

const C = {
  bg: '#0a0908', card: '#141210', card2: '#1a1814',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  green: '#4ade80', red: '#f87171',
}

const inp: React.CSSProperties = {
  background: C.input, border: `1px solid ${C.border}`, borderRadius: 8,
  padding: '10px 12px', color: C.text, fontSize: 14, outline: 'none',
  width: '100%', boxSizing: 'border-box' as const, fontFamily: 'inherit',
}
const lbl: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase' as const, color: C.muted, display: 'block', marginBottom: 5,
}

function Field({ label, note, mono, ...props }: {
  label: string; note?: string; mono?: boolean
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label style={lbl}>{label}</label>
      <input
        {...props}
        style={{ ...inp, ...(mono ? { fontFamily: '"DM Mono", monospace', fontSize: 13 } : {}) }}
        onFocus={e => (e.target.style.borderColor = C.borderGold)}
        onBlur={e => (e.target.style.borderColor = C.border)}
      />
      {note && <p style={{ fontSize: 11, color: C.muted, margin: '4px 0 0' }}>{note}</p>}
    </div>
  )
}

type Song = {
  id: string
  song_title: string
  canonical_artist: string | null
  confirmed_count: number
  last_confirmed_at: string | null
  created_at: string | null
  source: string | null
  isrc: string | null
  composer: string | null
  publisher: string | null
}

type EditState = {
  song_title: string
  canonical_artist: string
  isrc: string
  composer: string
  publisher: string
}

type SongIntel = {
  venues: Array<{ venue_name: string; city: string; started_at: string }>
  loading: boolean
}

const EMPTY_EDIT: EditState = { song_title: '', canonical_artist: '', isrc: '', composer: '', publisher: '' }
const BASE_ROYALTY_PER_PERFORMANCE = 1.20

function timeAgo(d: string | null) {
  if (!d) return 'never'
  const diff = Date.now() - new Date(d).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`
}

function daysSince(d: string | null): number | null {
  if (!d) return null
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
}

function formatShortDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// ── Metadata completeness score 0–3 ──────────────────────────────────────────
function metaScore(song: Song): number {
  let score = 0
  if (song.isrc) score++
  if (song.composer) score++
  if (song.publisher) score++
  return score
}

// ── Song Intelligence Sheet ───────────────────────────────────────────────────
function SongIntelligenceSheet({
  song, userId, onEdit, onDelete, onClose,
}: {
  song: Song
  userId: string
  onEdit: () => void
  onDelete: (song: Song) => void
  onClose: () => void
}) {
  const [intel, setIntel] = useState<SongIntel>({ venues: [], loading: true })

  useEffect(() => {
    async function fetchIntel() {
      try {
        const supabase = createClient()
        // Step 1: get performance_ids for this song title
        const { data: pSongs } = await supabase
          .from('performance_songs_visible')
          .select('performance_id')
          .eq('title', song.song_title)
          .limit(100)

        if (!pSongs || pSongs.length === 0) {
          setIntel({ venues: [], loading: false })
          return
        }

        const perfIds = pSongs.map(p => p.performance_id).filter(Boolean)

        // Step 2: get performance details for those IDs scoped to this user
        const { data: perfs } = await supabase
          .from('performances_visible')
          .select('venue_name, city, started_at')
          .in('id', perfIds)
          .eq('user_id', userId)
          .eq('status', 'completed')
          .order('started_at', { ascending: false })
          .limit(50)

        setIntel({ venues: perfs || [], loading: false })
      } catch {
        setIntel({ venues: [], loading: false })
      }
    }
    fetchIntel()
  }, [song.song_title, userId])

  const cities = Array.from(new Set(intel.venues.map(v => v.city).filter(Boolean)))
  const uniqueVenues = Array.from(new Set(intel.venues.map(v => v.venue_name).filter(Boolean)))
  const lastPlayed = daysSince(song.last_confirmed_at)
  const estimatedRoyalty = Math.round(song.confirmed_count * BASE_ROYALTY_PER_PERFORMANCE)
  const score = metaScore(song)
  const debutDate = formatShortDate(song.created_at)
  const mostRecentVenue = intel.venues[0]

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 520, background: '#141210', borderRadius: '20px 20px 0 0', border: '1px solid rgba(255,255,255,0.07)', borderBottom: 'none', padding: '20px 20px 44px', display: 'flex', flexDirection: 'column', gap: 0, fontFamily: '"DM Sans", system-ui, sans-serif', maxHeight: '92vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
            <p style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '0 0 2px', letterSpacing: '-0.02em', lineHeight: 1.2 }}>{song.song_title}</p>
            {song.canonical_artist && (
              <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>{song.canonical_artist}</p>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 4, fontSize: 18, flexShrink: 0 }}>✕</button>
        </div>

        {/* Play count badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, marginTop: 8 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 20, padding: '5px 12px' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.gold, fontFamily: '"DM Mono", monospace' }}>{song.confirmed_count}×</span>
            <span style={{ fontSize: 11, color: C.gold, opacity: 0.7 }}>verified performances</span>
          </div>
          {song.confirmed_count === 0 && (
            <span style={{ fontSize: 11, color: C.muted }}>not yet performed</span>
          )}
        </div>

        {/* Intelligence grid */}
        {song.confirmed_count > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            {/* Debut */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 4px' }}>Live Debut</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: 0 }}>{debutDate}</p>
            </div>

            {/* Last performed */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 4px' }}>Last Performed</p>
              <p style={{ fontSize: 13, fontWeight: 700, color: lastPlayed !== null && lastPlayed > 30 ? C.gold : C.text, margin: 0 }}>
                {lastPlayed === 0 ? 'Tonight' : lastPlayed === 1 ? 'Yesterday' : lastPlayed !== null ? `${lastPlayed}d ago` : '—'}
              </p>
            </div>

            {/* Cities */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 4px' }}>Cities Played</p>
              {intel.loading ? (
                <div style={{ width: 10, height: 10, borderRadius: '50%', border: `1.5px solid rgba(201,168,76,0.3)`, borderTopColor: C.gold, animation: 'spin 0.7s linear infinite', marginTop: 4 }} />
              ) : (
                <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: 0 }}>
                  {cities.length > 0 ? cities.length : '—'}
                </p>
              )}
            </div>

            {/* Estimated royalty */}
            <div style={{ background: 'rgba(201,168,76,0.06)', border: `1px solid rgba(201,168,76,0.18)`, borderRadius: 12, padding: '12px 14px' }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 4px' }}>Est. Lifetime Value</p>
              <p style={{ fontSize: 13, fontWeight: 800, color: C.gold, margin: 0, fontFamily: '"DM Mono", monospace' }}>~${estimatedRoyalty}</p>
            </div>
          </div>
        )}

        {/* Venue history */}
        {!intel.loading && uniqueVenues.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 8px' }}>Where You've Played It</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {intel.venues.slice(0, 5).map((v, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.venue_name}</p>
                    {v.city && <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{v.city}</p>}
                  </div>
                  <span style={{ fontSize: 10, color: C.muted, flexShrink: 0, marginLeft: 8, fontFamily: '"DM Mono", monospace' }}>
                    {new Date(v.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              ))}
              {uniqueVenues.length > 5 && (
                <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 0', textAlign: 'center' }}>+{uniqueVenues.length - 5} more venues</p>
              )}
            </div>
          </div>
        )}

        {/* City list */}
        {!intel.loading && cities.length > 1 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {cities.map(city => (
              <span key={city} style={{ fontSize: 11, color: C.secondary, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 20, padding: '4px 10px' }}>{city}</span>
            ))}
          </div>
        )}

        {/* Metadata completeness */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${score === 3 ? 'rgba(74,222,128,0.2)' : C.border}`, borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, margin: 0 }}>Royalty Metadata</p>
            <span style={{ fontSize: 11, fontWeight: 700, color: score === 3 ? C.green : score >= 1 ? C.gold : C.red }}>
              {score === 3 ? 'Complete ✓' : score >= 1 ? `${score}/3 fields` : 'Incomplete'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { label: 'ISRC', filled: !!song.isrc },
              { label: 'Composer', filled: !!song.composer },
              { label: 'Publisher', filled: !!song.publisher },
            ].map(({ label, filled }) => (
              <div key={label} style={{ flex: 1, padding: '6px 8px', background: filled ? 'rgba(74,222,128,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${filled ? 'rgba(74,222,128,0.2)' : C.border}`, borderRadius: 8, textAlign: 'center' }}>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: filled ? C.green : C.muted, margin: 0 }}>{label}</p>
                <p style={{ fontSize: 10, color: filled ? C.green : C.muted, margin: '2px 0 0', opacity: filled ? 1 : 0.5 }}>{filled ? '✓' : '—'}</p>
              </div>
            ))}
          </div>
          {score < 3 && (
            <p style={{ fontSize: 11, color: C.muted, margin: '8px 0 0', lineHeight: 1.5 }}>
              Missing metadata reduces your PRO submission accuracy. Tap Edit to complete it.
            </p>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={onEdit}
            style={{ width: '100%', padding: '13px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' }}>
            Edit Metadata
          </button>
          <button onClick={() => onDelete(song)}
            style={{ width: '100%', padding: '11px', background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)', borderRadius: 10, color: C.red, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Remove from Catalog
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Sheet ────────────────────────────────────────────────────────────────
function EditSheet({
  song, editState, setEditState, saving, saveError, onSave, onClose,
}: {
  song: Song
  editState: EditState
  setEditState: React.Dispatch<React.SetStateAction<EditState>>
  saving: boolean
  saveError: string
  onSave: () => void
  onClose: () => void
}) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 520, background: '#141210', borderRadius: '20px 20px 0 0', border: '1px solid rgba(255,255,255,0.07)', borderBottom: 'none', padding: '20px 20px 44px', display: 'flex', flexDirection: 'column', gap: 14, fontFamily: '"DM Sans", system-ui, sans-serif', maxHeight: '90vh', overflowY: 'auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Edit Metadata</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 4, fontSize: 18 }}>✕</button>
        </div>

        <Field label="Song Title *"
          value={editState.song_title}
          onChange={e => setEditState(s => ({ ...s, song_title: e.target.value }))} />
        <Field label="Artist"
          value={editState.canonical_artist}
          onChange={e => setEditState(s => ({ ...s, canonical_artist: e.target.value }))}
          placeholder="Your artist name" />
        <Field label="ISRC" mono
          note="Find in DistroKid, TuneCore, CD Baby, or your distribution platform"
          value={editState.isrc}
          onChange={e => setEditState(s => ({ ...s, isrc: e.target.value }))}
          placeholder="e.g. USRC12345678" />
        <Field label="Composer(s)"
          note="List all co-writers exactly as registered with your PRO"
          value={editState.composer}
          onChange={e => setEditState(s => ({ ...s, composer: e.target.value }))}
          placeholder="e.g. Jesse Slack, Jane Smith" />
        <Field label="Publisher"
          value={editState.publisher}
          onChange={e => setEditState(s => ({ ...s, publisher: e.target.value }))}
          placeholder="e.g. Sony Music Publishing" />

        {saveError && <p style={{ fontSize: 12, color: C.red, margin: 0 }}>{saveError}</p>}

        <button onClick={onSave} disabled={saving || !editState.song_title.trim()}
          style={{ width: '100%', padding: '13px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>

        <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 10, padding: '12px 14px' }}>
          <p style={{ fontSize: 12, color: C.secondary, margin: 0, lineHeight: 1.6 }}>
            <strong style={{ color: C.gold }}>Why this matters:</strong> ISRC and composer credits are what your PRO uses to verify royalty eligibility. Missing data means potentially missing payments.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MySongsTab({ userId }: { userId: string }) {
  const [songs, setSongs]                   = useState<Song[]>([])
  const [loading, setLoading]               = useState(true)
  const [viewingSong, setViewingSong]       = useState<Song | null>(null)
  const [editingSong, setEditingSong]       = useState<Song | null>(null)
  const [editState, setEditState]           = useState<EditState>(EMPTY_EDIT)
  const [saving, setSaving]                 = useState(false)
  const [saveError, setSaveError]           = useState('')
  const [search, setSearch]                 = useState('')
  const [showAdd, setShowAdd]               = useState(false)
  const [addState, setAddState]             = useState<EditState>(EMPTY_EDIT)
  const [adding, setAdding]                 = useState(false)
  const [filter, setFilter]                 = useState<'all' | 'mine' | 'detected'>('all')

  const loadSongs = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('user_songs')
      .select('id, song_title, canonical_artist, confirmed_count, last_confirmed_at, created_at, source, isrc, composer, publisher')
      .eq('user_id', userId)
      .order('confirmed_count', { ascending: false })
    setSongs(data || [])
    setLoading(false)
  }, [userId])

  useEffect(() => { loadSongs() }, [loadSongs])

  function openView(song: Song) {
    setViewingSong(song)
    setSaveError('')
  }

  function openEdit(song: Song) {
    setEditingSong(song)
    setEditState({
      song_title: song.song_title,
      canonical_artist: song.canonical_artist || '',
      isrc: song.isrc || '',
      composer: song.composer || '',
      publisher: song.publisher || '',
    })
    setSaveError('')
  }

  function openEditFromView(song: Song) {
    setViewingSong(null)
    openEdit(song)
  }

  async function saveEdit() {
    if (!editingSong || !editState.song_title.trim()) return
    setSaving(true)
    setSaveError('')
    const supabase = createClient()
    const { error } = await supabase.from('user_songs').update({
      song_title: editState.song_title.trim(),
      canonical_artist: editState.canonical_artist.trim() || null,
      isrc: editState.isrc.trim() || null,
      composer: editState.composer.trim() || null,
      publisher: editState.publisher.trim() || null,
    }).eq('id', editingSong.id)
    if (error) {
      setSaveError(error.message)
    } else {
      setSongs(prev => prev.map(s => s.id === editingSong.id
        ? { ...s, song_title: editState.song_title.trim(), canonical_artist: editState.canonical_artist.trim() || null, isrc: editState.isrc.trim() || null, composer: editState.composer.trim() || null, publisher: editState.publisher.trim() || null }
        : s))
      setEditingSong(null)
    }
    setSaving(false)
  }

  async function deleteSong(song: Song) {
    if (!confirm(`Remove "${song.song_title}" from your catalog?`)) return
    const supabase = createClient()
    await supabase.from('user_songs').delete().eq('id', song.id)
    setSongs(prev => prev.filter(s => s.id !== song.id))
    setViewingSong(null)
    setEditingSong(null)
  }

  async function addSong() {
    if (!addState.song_title.trim()) return
    setAdding(true)
    const supabase = createClient()
    const { data, error } = await supabase.from('user_songs').insert({
      user_id: userId,
      song_title: addState.song_title.trim(),
      canonical_artist: addState.canonical_artist.trim() || null,
      isrc: addState.isrc.trim() || null,
      composer: addState.composer.trim() || null,
      publisher: addState.publisher.trim() || null,
      confirmed_count: 0,
      source: 'manual_catalog',
    }).select().single()
    if (!error && data) {
      setSongs(prev => [data, ...prev])
      setAddState(EMPTY_EDIT)
      setShowAdd(false)
    }
    setAdding(false)
  }

  const filtered = songs
    .filter(s => {
      if (filter === 'mine')     return s.source === 'manual_catalog' || s.confirmed_count === 0
      if (filter === 'detected') return s.confirmed_count > 0
      return true
    })
    .filter(s => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return s.song_title.toLowerCase().includes(q) ||
             (s.canonical_artist || '').toLowerCase().includes(q) ||
             (s.isrc || '').toLowerCase().includes(q)
    })

  // Catalog health summary
  const totalWithISRC      = songs.filter(s => s.isrc).length
  const totalWithComposer  = songs.filter(s => s.composer).length
  const totalPerformed     = songs.filter(s => s.confirmed_count > 0).length
  const dormant            = songs.filter(s => {
    if (!s.last_confirmed_at) return false
    const days = daysSince(s.last_confirmed_at)
    return days !== null && days > 45 && s.confirmed_count > 0
  }).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <p style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>My Songs</p>
          <p style={{ fontSize: 12, color: C.muted, margin: '2px 0 0' }}>{songs.length} songs · tap any to view intelligence</p>
        </div>
        <button onClick={() => setShowAdd(v => !v)}
          style={{ padding: '9px 16px', background: showAdd ? 'transparent' : C.goldDim, border: `1px solid ${showAdd ? C.border : C.borderGold}`, borderRadius: 10, color: showAdd ? C.muted : C.gold, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, minHeight: 40, WebkitTapHighlightColor: 'transparent' }}>
          <span style={{ fontSize: 16, lineHeight: 1, fontWeight: 400, display: 'inline-block', transform: showAdd ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s ease' }}>+</span>
          Add Song
        </button>
      </div>

      {/* Catalog health bar — only show if there's data */}
      {songs.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px' }}>
          <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, margin: '0 0 10px' }}>Catalog Intelligence</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
            {[
              { label: 'Performed', value: totalPerformed, total: songs.length, color: C.gold },
              { label: 'Have ISRC', value: totalWithISRC, total: songs.length, color: C.green },
              { label: 'Composer', value: totalWithComposer, total: songs.length, color: C.green },
              { label: 'Dormant', value: dormant, total: totalPerformed || 1, color: dormant > 0 ? C.gold : C.muted },
            ].map(({ label, value, total, color }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 16, fontWeight: 800, color, margin: 0, fontFamily: '"DM Mono", monospace', lineHeight: 1 }}>{value}</p>
                <p style={{ fontSize: 9, color: C.muted, margin: '3px 0 0', letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1.2 }}>{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div style={{ background: C.card, border: `1px solid ${C.borderGold}`, borderRadius: 12, padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.gold, margin: 0 }}>Add to your catalog</p>
          <Field label="Song Title *" autoFocus value={addState.song_title}
            onChange={e => setAddState(s => ({ ...s, song_title: e.target.value }))} placeholder="Song title" />
          <Field label="Artist" value={addState.canonical_artist}
            onChange={e => setAddState(s => ({ ...s, canonical_artist: e.target.value }))} placeholder="Your artist name" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="ISRC" mono value={addState.isrc}
              onChange={e => setAddState(s => ({ ...s, isrc: e.target.value }))} placeholder="USRC12345678" />
            <Field label="Composer(s)" value={addState.composer}
              onChange={e => setAddState(s => ({ ...s, composer: e.target.value }))} placeholder="All songwriters" />
          </div>
          <Field label="Publisher" value={addState.publisher}
            onChange={e => setAddState(s => ({ ...s, publisher: e.target.value }))} placeholder="Publishing company" />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={addSong} disabled={adding || !addState.song_title.trim()}
              style={{ flex: 1, padding: '11px', background: addState.song_title.trim() ? C.gold : C.muted, border: 'none', borderRadius: 8, color: '#0a0908', fontSize: 13, fontWeight: 800, cursor: adding || !addState.song_title.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: adding ? 0.7 : 1 }}>
              {adding ? 'Adding...' : 'Add to Catalog'}
            </button>
            <button onClick={() => setShowAdd(false)}
              style={{ padding: '11px 16px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Search + filter */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search songs, artists, ISRCs..."
        style={{ ...inp, padding: '11px 14px', fontSize: 14 }}
        onFocus={e => (e.target.style.borderColor = C.borderGold)}
        onBlur={e => (e.target.style.borderColor = C.border)}
      />

      <div style={{ display: 'flex', gap: 6 }}>
        {([
          { id: 'all' as const,      label: `All (${songs.length})` },
          { id: 'detected' as const, label: `Performed (${songs.filter(s => s.confirmed_count > 0).length})` },
          { id: 'mine' as const,     label: `Added (${songs.filter(s => s.source === 'manual_catalog').length})` },
        ]).map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            style={{ padding: '6px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${filter === f.id ? C.borderGold : C.border}`, background: filter === f.id ? C.goldDim : 'transparent', color: filter === f.id ? C.gold : C.muted }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Song list */}
      {loading ? (
        <p style={{ textAlign: 'center', color: C.muted, padding: '40px 0' }}>Loading...</p>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.5 }}>{search ? 'No songs match your search' : 'Songs you perform are confirmed here and become your searchable catalog.'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filtered.map(song => {
            const days = daysSince(song.last_confirmed_at)
            const isDormant = days !== null && days > 45 && song.confirmed_count > 0
            const score = metaScore(song)
            return (
              <div key={song.id} onClick={() => openView(song)}
                style={{ background: C.card, border: `1px solid ${isDormant ? 'rgba(201,168,76,0.15)' : C.border}`, borderLeft: `3px solid ${score === 3 ? 'rgba(74,222,128,0.4)' : song.confirmed_count > 0 ? 'rgba(201,168,76,0.4)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 12, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, WebkitTapHighlightColor: 'transparent', minHeight: 60 }}
                onTouchStart={e => (e.currentTarget.style.background = '#1a1814')}
                onTouchEnd={e => (e.currentTarget.style.background = C.card)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.song_title}</p>
                    {song.isrc && <span style={{ fontSize: 9, color: C.green, fontFamily: '"DM Mono", monospace', flexShrink: 0 }}>ISRC</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {song.canonical_artist && <span style={{ fontSize: 12, color: C.muted }}>{song.canonical_artist}</span>}
                    {song.confirmed_count > 0 && (
                      <span style={{ fontSize: 11, color: C.gold, fontFamily: '"DM Mono", monospace' }}>×{song.confirmed_count}</span>
                    )}
                    {isDormant && (
                      <span style={{ fontSize: 10, color: C.gold, opacity: 0.7 }}>{days}d since last play</span>
                    )}
                    {!isDormant && (
                      <span style={{ fontSize: 11, color: C.muted, opacity: 0.6 }}>
                        {song.source === 'manual_catalog' ? 'added' : song.source === 'spotify_import' ? 'Spotify' : timeAgo(song.last_confirmed_at)}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: song.isrc ? C.green : 'rgba(255,255,255,0.1)', display: 'inline-block' }} />
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: song.composer ? C.gold : 'rgba(255,255,255,0.1)', display: 'inline-block' }} />
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: song.publisher ? C.gold : 'rgba(255,255,255,0.1)', display: 'inline-block' }} />
                </div>
                <span style={{ fontSize: 12, color: C.muted, flexShrink: 0 }}>→</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Intelligence sheet */}
      {viewingSong && (
        <SongIntelligenceSheet
          song={viewingSong}
          userId={userId}
          onEdit={() => openEditFromView(viewingSong)}
          onDelete={deleteSong}
          onClose={() => setViewingSong(null)}
        />
      )}

      {/* Edit sheet */}
      {editingSong && (
        <EditSheet
          song={editingSong}
          editState={editState}
          setEditState={setEditState}
          saving={saving}
          saveError={saveError}
          onSave={saveEdit}
          onClose={() => setEditingSong(null)}
        />
      )}

      <style>{`
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes sheetUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        input::placeholder { color: #5a5040; }
        input:focus { outline: none; }
      `}</style>
    </div>
  )
}
