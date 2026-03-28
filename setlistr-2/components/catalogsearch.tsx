'use client'
/**
 * CatalogSearch.tsx
 *
 * Smart song input component. Replaces bare text entry anywhere
 * a user needs to identify or add a song.
 *
 * Pulls from user_songs catalog with ISRC/composer/publisher auto-fill.
 * Falls back to free-text "Add [query]" if no match found.
 *
 * Usage:
 *   <CatalogSearch
 *     userId={userId}
 *     placeholder="Search your songs..."
 *     onSelect={(song) => handleSongSelected(song)}
 *     onAddNew={(title) => handleAddNew(title)}
 *     autoFocus
 *   />
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
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
  userId:       string | null
  placeholder?: string
  onSelect:     (song: CatalogSong) => void
  autoFocus?:   boolean
  currentSongs?: string[]   // titles already in the setlist — shown dimmed
  showEmpty?:   boolean     // show catalog immediately on focus (no typing needed)
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
  const inputRef                  = useRef<HTMLInputElement>(null)
  const debounceRef               = useRef<NodeJS.Timeout | null>(null)

  // Load catalog on mount if showEmpty — so suggestions appear immediately
  useEffect(() => {
    if (showEmpty && userId) loadCatalog('')
  }, [userId, showEmpty])

  const loadCatalog = useCallback(async (q: string) => {
    if (!userId) return
    setLoading(true)
    const supabase = createClient()

    let queryBuilder = supabase
      .from('user_songs')
      .select('id, song_title, canonical_artist, isrc, composer, publisher, confirmed_count')
      .eq('user_id', userId)
      .order('confirmed_count', { ascending: false })
      .limit(20)

    if (q.trim()) {
      queryBuilder = queryBuilder.ilike('song_title', `%${q.trim()}%`)
    }

    const { data } = await queryBuilder

    if (data) {
      setResults(data.map(s => ({
        id:        s.id,
        title:     normalizeSongTitle(s.song_title),
        artist:    normalizeArtistName(s.canonical_artist || ''),
        isrc:      s.isrc || null,
        composer:  s.composer || null,
        publisher: s.publisher || null,
        playCount: s.confirmed_count || 0,
        source:    'catalog' as const,
      })))
    }
    setLoading(false)
  }, [userId])

  function handleChange(val: string) {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => loadCatalog(val), 200)
  }

  function handleSelect(song: CatalogSong) {
    onSelect(song)
    setQuery('')
    setResults([])
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
  }

  const showResults = focused && (results.length > 0 || query.trim().length > 0)
  const showAddNew  = query.trim().length > 0 &&
    !results.some(r => r.title.toLowerCase() === normalizeSongTitle(query.trim()).toLowerCase())

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Input */}
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
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

      {/* Results dropdown */}
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
                onMouseDown={() => handleSelect(song)}
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
                {/* Play count indicator */}
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

                {/* Registration dot */}
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {song.isrc ? (
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, display: 'block' }} title="ISRC confirmed" />
                  ) : null}
                  <span style={{ fontSize: 11, color: C.muted }}>→</span>
                </div>
              </button>
            )
          })}

          {/* Add new option */}
          {showAddNew ? (
            <button
              onMouseDown={handleAddNew}
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
