'use client'
/**
 * CatalogSearch.tsx
 *
 * Smart song input component. Replaces bare text entry anywhere
 * a user needs to identify or add a song.
 *
 * Uses /api/recent-songs (server-side auth) instead of direct Supabase
 * client queries — fixes mobile Safari auth session issues with RLS.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { normalizeSongTitle, normalizeArtistName } from '@/lib/song-utils'
import { Search, Music2 } from 'lucide-react'

const C = {
  bg: '#0a0908', card: '#141210', cardHover: '#181614',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#a09070', muted: '#6a6050',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)', green: '#4ade80',
}

export type CatalogSong = {
  id:           string
  title:        string
  artist:       string
  isrc?:        string | null
  composer?:    string | null
  publisher?:   string | null
  playCount?:   number
  source:       'catalog' | 'new'
}

type Props = {
  userId:        string | null
  placeholder?:  string
  onSelect:      (song: CatalogSong) => void
  autoFocus?:    boolean
  currentSongs?: string[]
  showEmpty?:    boolean
}

export default function CatalogSearch({
  userId,
  placeholder = 'Search your songs...',
  onSelect,
  autoFocus = false,
  currentSongs = [],
  showEmpty = true,
}: Props) {
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState<CatalogSong[]>([])
  const [loading, setLoading]     = useState(false)
  const [focused, setFocused]     = useState(false)
  const [selecting, setSelecting] = useState(false)
  const inputRef                  = useRef<HTMLInputElement>(null)
  const debounceRef               = useRef<NodeJS.Timeout | null>(null)

  // ── Core loader — hits /api/recent-songs which uses server-side auth ──
  // This bypasses the mobile Safari cookie/RLS issue entirely.
  const loadCatalog = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      const res  = await fetch(`/api/recent-songs?${params.toString()}`)
      const json = await res.json()
      if (json.songs) {
        setResults(json.songs.map((s: any) => ({
          id:        s.id,
          title:     normalizeSongTitle(s.title),
          artist:    normalizeArtistName(s.artist || ''),
          isrc:      s.isrc      || null,
          composer:  s.composer  || null,
          publisher: s.publisher || null,
          playCount: s.play_count || 0,
          source:    'catalog' as const,
        })))
      }
    } catch (err) {
      console.error('[CatalogSearch] fetch error:', err)
    }
    setLoading(false)
  }, [])

  // Load on mount — no userId dependency needed since auth is server-side
  useEffect(() => {
    if (showEmpty) loadCatalog('')
  }, [showEmpty, loadCatalog])

  function handleChange(val: string) {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => loadCatalog(val), 200)
  }

  function handleSelect(song: CatalogSong) {
    onSelect(song)
    setQuery('')
    setResults([])
    setFocused(false)
    setSelecting(false)
  }

  function handleAddNew() {
    if (!query.trim()) return
    onSelect({
      id:     `new-${Date.now()}`,
      title:  normalizeSongTitle(query.trim()),
      artist: '',
      source: 'new',
    })
    setQuery('')
    setResults([])
    setFocused(false)
    setSelecting(false)
  }

  function handleResultTouchStart() { setSelecting(true) }

  function handleBlur() {
    if (selecting) return
    setTimeout(() => { if (!selecting) setFocused(false) }, 200)
  }

  const showResults = (focused || selecting) && (results.length > 0 || query.trim().length > 0)
  const showAddNew  = query.trim().length > 0 &&
    !results.some(r => r.title.toLowerCase() === normalizeSongTitle(query.trim()).toLowerCase())

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              if (results.length > 0) handleSelect(results[0])
              else if (query.trim()) handleAddNew()
            }
          }}
          placeholder={placeholder}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: C.input,
            border: `1px solid ${focused ? C.borderGold : C.border}`,
            borderRadius: 10, padding: '12px 40px 12px 14px',
            color: C.text, fontSize: 14, outline: 'none',
            fontFamily: '"DM Sans", system-ui, sans-serif',
            transition: 'border-color 0.15s ease',
          }}
        />
        <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          {loading
            ? <div style={{ width: 13, height: 13, borderRadius: '50%', border: `2px solid ${C.muted}`, borderTopColor: C.gold, animation: 'spin 0.7s linear infinite' }} />
            : <Search size={13} color={C.muted} />
          }
        </div>
      </div>

      {showResults ? (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: '#1a1816',
          border: `1px solid ${C.borderGold}`,
          borderRadius: 12, marginTop: 4,
          zIndex: 100, overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          maxHeight: 280, overflowY: 'auto',
          animation: 'fadeIn 0.12s ease',
        }}>

          {results.length === 0 && !showAddNew ? (
            <div style={{ padding: '16px', textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>No songs in your catalog yet</p>
              <p style={{ fontSize: 11, color: C.muted, margin: '4px 0 0', opacity: 0.7 }}>Songs you confirm during shows appear here</p>
            </div>
          ) : null}

          {results.map((song, i) => {
            const alreadyInSet = currentSongs.some(
              t => t.toLowerCase() === song.title.toLowerCase()
            )
            return (
              <button
                key={song.id}
                onTouchStart={handleResultTouchStart}
                onMouseDown={() => setSelecting(true)}
                onClick={() => handleSelect(song)}
                style={{
                  width: '100%', padding: '11px 14px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: i < results.length - 1 ? `1px solid ${C.border}` : 'none',
                  cursor: 'pointer', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 10,
                  fontFamily: 'inherit', opacity: alreadyInSet ? 0.4 : 1,
                  transition: 'background 0.1s ease',
                  WebkitTapHighlightColor: 'transparent',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = C.cardHover}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: song.isrc ? 'rgba(74,222,128,0.1)' : C.goldDim,
                  border: `1px solid ${song.isrc ? 'rgba(74,222,128,0.2)' : C.borderGold}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {song.playCount && song.playCount > 1
                    ? <span style={{ fontSize: 9, fontWeight: 800, color: song.isrc ? C.green : C.gold, fontFamily: '"DM Mono", monospace' }}>×{song.playCount}</span>
                    : <Music2 size={11} color={song.isrc ? C.green : C.gold} />
                  }
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {song.title}
                    {alreadyInSet ? <span style={{ fontSize: 10, color: C.muted, marginLeft: 6 }}>in set</span> : null}
                  </p>
                  {song.artist ? (
                    <p style={{ fontSize: 11, color: C.secondary, margin: '1px 0 0' }}>{song.artist}</p>
                  ) : null}
                </div>

                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {song.isrc ? (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, display: 'block' }} title="ISRC confirmed" />
                  ) : null}
                  <span style={{ fontSize: 11, color: C.muted }}>→</span>
                </div>
              </button>
            )
          })}

          {showAddNew ? (
            <button
              onTouchStart={handleResultTouchStart}
              onMouseDown={() => setSelecting(true)}
              onClick={handleAddNew}
              style={{
                width: '100%', padding: '11px 14px',
                background: C.goldDim,
                border: 'none', borderTop: results.length > 0 ? `1px solid ${C.border}` : 'none',
                cursor: 'pointer', textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 8,
                fontFamily: 'inherit',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{ fontSize: 14, color: C.gold }}>+</span>
              <p style={{ fontSize: 13, fontWeight: 600, color: C.gold, margin: 0 }}>
                Add "{normalizeSongTitle(query.trim())}"
              </p>
            </button>
          ) : null}
        </div>
      ) : null}

      <style>{`
        @keyframes fadeIn { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin   { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  )
}
