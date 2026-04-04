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

// ── Field MUST live outside the component so it never gets recreated on render ──
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

const EMPTY_EDIT: EditState = { song_title: '', canonical_artist: '', isrc: '', composer: '', publisher: '' }

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

export default function MySongsTab({ userId }: { userId: string }) {
  const [songs, setSongs]             = useState<Song[]>([])
  const [loading, setLoading]         = useState(true)
  const [editingSong, setEditingSong] = useState<Song | null>(null)
  const [editState, setEditState]     = useState<EditState>(EMPTY_EDIT)
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState('')
  const [search, setSearch]           = useState('')
  const [showAdd, setShowAdd]         = useState(false)
  const [addState, setAddState]       = useState<EditState>(EMPTY_EDIT)
  const [adding, setAdding]           = useState(false)
  const [filter, setFilter]           = useState<'all' | 'mine' | 'detected'>('all')

  const loadSongs = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('user_songs')
      .select('id, song_title, canonical_artist, confirmed_count, last_confirmed_at, source, isrc, composer, publisher')
      .eq('user_id', userId)
      .order('confirmed_count', { ascending: false })
    setSongs(data || [])
    setLoading(false)
  }, [userId])

  useEffect(() => { loadSongs() }, [loadSongs])

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
        ? {
            ...s,
            song_title: editState.song_title.trim(),
            canonical_artist: editState.canonical_artist.trim() || null,
            isrc: editState.isrc.trim() || null,
            composer: editState.composer.trim() || null,
            publisher: editState.publisher.trim() || null,
          }
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <p style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>My Songs</p>
          <p style={{ fontSize: 12, color: C.muted, margin: '2px 0 0' }}>{songs.length} songs · tap any to edit metadata</p>
        </div>
        <button onClick={() => setShowAdd(v => !v)}
          style={{ padding: '9px 16px', background: showAdd ? 'transparent' : C.goldDim, border: `1px solid ${showAdd ? C.border : C.borderGold}`, borderRadius: 10, color: showAdd ? C.muted : C.gold, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, minHeight: 40, WebkitTapHighlightColor: 'transparent' }}>
          <span style={{ fontSize: 16, lineHeight: 1, fontWeight: 400, display: 'inline-block', transform: showAdd ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s ease' }}>+</span>
          Add Song
        </button>
      </div>

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
          { id: 'detected' as const, label: `Detected (${songs.filter(s => s.confirmed_count > 0).length})` },
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
          <p style={{ color: C.muted, fontSize: 14 }}>{search ? 'No songs match your search' : 'No songs yet'}</p>
          {!search && <p style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>Songs you play will appear here automatically</p>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filtered.map(song => (
            <div key={song.id} onClick={() => openEdit(song)}
              style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, WebkitTapHighlightColor: 'transparent', minHeight: 60 }}
              onTouchStart={e => (e.currentTarget.style.background = '#1a1814')}
              onTouchEnd={e => (e.currentTarget.style.background = C.card)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{song.song_title}</p>
                  {song.isrc && <span style={{ fontSize: 9, color: C.green, fontFamily: '"DM Mono", monospace', flexShrink: 0 }}>ISRC</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {song.canonical_artist && <span style={{ fontSize: 12, color: C.muted }}>{song.canonical_artist}</span>}
                  {song.confirmed_count > 0 && <span style={{ fontSize: 11, color: C.gold, fontFamily: '"DM Mono", monospace' }}>×{song.confirmed_count}</span>}
                  <span style={{ fontSize: 11, color: C.muted, opacity: 0.6 }}>
                    {song.source === 'manual_catalog' ? 'added' : song.source === 'spotify_import' ? 'Spotify' : timeAgo(song.last_confirmed_at)}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: song.isrc ? C.green : 'rgba(255,255,255,0.1)', display: 'inline-block' }} />
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: song.composer ? C.gold : 'rgba(255,255,255,0.1)', display: 'inline-block' }} />
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: song.publisher ? C.gold : 'rgba(255,255,255,0.1)', display: 'inline-block' }} />
              </div>
              <span style={{ fontSize: 12, color: C.muted, flexShrink: 0 }}>→</span>
            </div>
          ))}
        </div>
      )}

      {/* Edit sheet */}
      {editingSong && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setEditingSong(null)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 520, background: '#141210', borderRadius: '20px 20px 0 0', border: '1px solid rgba(255,255,255,0.07)', borderBottom: 'none', padding: '20px 20px 40px', display: 'flex', flexDirection: 'column', gap: 14, fontFamily: '"DM Sans", system-ui, sans-serif', maxHeight: '90vh', overflowY: 'auto' }}>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Edit Song</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => deleteSong(editingSong)}
                  style={{ padding: '6px 12px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, color: C.red, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Delete
                </button>
                <button onClick={() => setEditingSong(null)}
                  style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 4, fontSize: 18 }}>✕</button>
              </div>
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

            <button onClick={saveEdit} disabled={saving || !editState.song_title.trim()}
              style={{ width: '100%', padding: '13px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>

            <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 10, padding: '12px 14px' }}>
              <p style={{ fontSize: 12, color: C.secondary, margin: 0, lineHeight: 1.6 }}>
                <strong style={{ color: C.gold }}>Why this matters:</strong> Complete metadata — ISRC and composer credits — is what your PRO uses to verify royalty eligibility. Missing data means potentially missing payments.
              </p>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes sheetUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
        input::placeholder { color: #5a5040; }
        input:focus { outline: none; }
      `}</style>
    </div>
  )
}
