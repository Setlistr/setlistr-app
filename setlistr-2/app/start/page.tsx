'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const ROYALTY_PER_SONG_LOW  = 1.25 * 0.7
const ROYALTY_PER_SONG_HIGH = 1.25 * 1.3

type Song = { title: string; id: number }

export default function StartPage() {
  const router  = useRouter()
  const [songs, setSongs]         = useState<Song[]>([])
  const [input, setInput]         = useState('')
  const [showValue, setShowValue] = useState(false)
  const [animateValue, setAnimateValue] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const nextId   = useRef(1)

  // Restore from sessionStorage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('setlistr_quick_songs')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.length > 0) {
          setSongs(parsed)
          nextId.current = Math.max(...parsed.map((s: Song) => s.id)) + 1
          if (parsed.length >= 2) setShowValue(true)
        }
      }
    } catch {}
  }, [])

  // Persist to sessionStorage on change
  useEffect(() => {
    try { sessionStorage.setItem('setlistr_quick_songs', JSON.stringify(songs)) } catch {}
  }, [songs])

  function addSong() {
    const trimmed = input.trim()
    if (!trimmed) return
    const newSongs = [...songs, { title: trimmed, id: nextId.current++ }]
    setSongs(newSongs)
    setInput('')
    inputRef.current?.focus()

    // Trigger value moment after 2nd song
    if (newSongs.length === 2) {
      setTimeout(() => {
        setShowValue(true)
        setTimeout(() => setAnimateValue(true), 50)
      }, 300)
    }
  }

  function removesSong(id: number) {
    const newSongs = songs.filter(s => s.id !== id)
    setSongs(newSongs)
    if (newSongs.length < 2) { setShowValue(false); setAnimateValue(false) }
  }

  function handleClaim() {
    // Store setlist in sessionStorage for post-signup retrieval
    try {
      sessionStorage.setItem('setlistr_pending_setlist', JSON.stringify(songs.map(s => s.title)))
    } catch {}
    router.push('/login?from=start')
  }

  const low  = Math.round(songs.length * ROYALTY_PER_SONG_LOW)
  const high = Math.round(songs.length * ROYALTY_PER_SONG_HIGH)

  return (
    <div style={{
      minHeight: '100svh',
      background: '#0a0908',
      fontFamily: '"DM Sans", system-ui, sans-serif',
      display: 'flex', flexDirection: 'column',
      padding: '0 0 40px',
      position: 'relative', overflow: 'hidden',
    }}>

      {/* Ambient glow */}
      <div style={{
        position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: '140vw', height: '50vh', pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.08) 0%, transparent 65%)',
        transition: 'opacity 0.8s ease',
        opacity: showValue ? 1 : 0.5,
      }} />

      <div style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: 440,
        margin: '0 auto', padding: '0 20px',
        boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column',
        flex: 1,
      }}>

        {/* Header */}
        <div style={{ paddingTop: 48, paddingBottom: 32, animation: 'fadeUp 0.4s ease' }}>
          <p style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.2em',
            textTransform: 'uppercase', color: 'rgba(201,168,76,0.5)',
            margin: '0 0 20px',
          }}>
            Setlistr
          </p>
          <h1 style={{
            fontSize: 'clamp(28px, 8vw, 38px)',
            fontWeight: 800, color: '#f0ece3',
            margin: '0 0 10px', letterSpacing: '-0.03em', lineHeight: 1.1,
          }}>
            You played that song live…
          </h1>
          <p style={{
            fontSize: 16, color: '#c9a84c',
            fontWeight: 600, margin: 0, letterSpacing: '-0.01em',
          }}>
            did you get paid?
          </p>
          <p style={{
            fontSize: 13, color: '#6a6050',
            margin: '10px 0 0', lineHeight: 1.5,
          }}>
            Most artists don't. Add the songs you played and see what you may be owed.
          </p>
        </div>

        {/* Input */}
        <div style={{ marginBottom: 20, animation: 'fadeUp 0.5s ease' }}>
          <div style={{ position: 'relative' }}>
            <input
              ref={inputRef}
              autoFocus
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSong()}
              placeholder="Add a song you played…"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#141210',
                border: `1px solid ${input.trim() ? 'rgba(201,168,76,0.4)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 12, padding: '14px 56px 14px 16px',
                color: '#f0ece3', fontSize: 15, fontFamily: 'inherit',
                outline: 'none', transition: 'border-color 0.15s ease',
              }}
            />
            <button
              onClick={addSong}
              disabled={!input.trim()}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                width: 36, height: 36, borderRadius: 8,
                background: input.trim() ? '#c9a84c' : 'rgba(255,255,255,0.06)',
                border: 'none', cursor: input.trim() ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s ease',
                fontSize: 18, color: input.trim() ? '#0a0908' : '#6a6050',
                fontWeight: 700,
              }}
            >
              +
            </button>
          </div>
        </div>

        {/* Song list */}
        {songs.length > 0 && (
          <div style={{ marginBottom: 24, animation: 'fadeUp 0.3s ease' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {songs.map((song, i) => (
                <div
                  key={song.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: '#141210',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 10, padding: '11px 14px',
                    animation: 'slideUp 0.2s ease',
                  }}
                >
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: '#6a6050',
                    minWidth: 18, textAlign: 'right',
                    fontFamily: '"DM Mono", monospace',
                  }}>
                    {i + 1}
                  </span>
                  <p style={{
                    fontSize: 14, fontWeight: 600, color: '#f0ece3',
                    margin: 0, flex: 1,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {song.title}
                  </p>
                  <button
                    onClick={() => removesSong(song.id)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#6a6050', padding: '2px 4px', fontSize: 16,
                      lineHeight: 1, flexShrink: 0,
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#f87171'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#6a6050'}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* Prompt before value moment */}
            {songs.length === 1 && (
              <p style={{
                fontSize: 12, color: '#6a6050', textAlign: 'center',
                margin: '12px 0 0', letterSpacing: '0.04em',
                animation: 'fadeIn 0.3s ease',
              }}>
                Add one more song to see what you may be owed
              </p>
            )}
          </div>
        )}

        {/* ── VALUE MOMENT ── */}
        {showValue && songs.length >= 2 && (
          <div style={{
            background: 'rgba(201,168,76,0.06)',
            border: '1px solid rgba(201,168,76,0.25)',
            borderRadius: 18, padding: '24px 20px',
            marginBottom: 20,
            opacity: animateValue ? 1 : 0,
            transform: animateValue ? 'translateY(0)' : 'translateY(12px)',
            transition: 'opacity 0.5s ease, transform 0.5s ease',
          }}>
            <p style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: 'rgba(201,168,76,0.6)',
              margin: '0 0 12px',
            }}>
              This is your setlist.
            </p>

            <p style={{
              fontSize: 14, color: '#a09070',
              margin: '0 0 8px', lineHeight: 1.5,
            }}>
              You likely missed out on
            </p>

            <p style={{
              fontSize: 48, fontWeight: 800, color: '#c9a84c',
              margin: '0 0 4px', letterSpacing: '-0.03em', lineHeight: 1,
              fontFamily: '"DM Mono", monospace',
            }}>
              ${low}–${high}
            </p>

            <p style={{
              fontSize: 13, color: '#6a6050',
              margin: '0 0 20px',
            }}>
              from this set alone
            </p>

            <div style={{
              borderTop: '1px solid rgba(201,168,76,0.15)',
              paddingTop: 16, marginBottom: 20,
            }}>
              <p style={{
                fontSize: 13, color: '#a09070',
                margin: 0, lineHeight: 1.6,
              }}>
                Every show you play without reporting is money left behind.
                Most artists never know they're owed it.
              </p>
            </div>

            <button
              onClick={handleClaim}
              style={{
                width: '100%', padding: '16px',
                background: '#c9a84c', border: 'none', borderRadius: 12,
                color: '#0a0908', fontSize: 14, fontWeight: 800,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                cursor: 'pointer', fontFamily: 'inherit',
                marginBottom: 10,
                transition: 'opacity 0.15s ease',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.88'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
            >
              Claim your setlist earnings →
            </button>

            <p style={{
              fontSize: 11, color: 'rgba(106,96,80,0.7)',
              textAlign: 'center', margin: 0, letterSpacing: '0.04em',
            }}>
              Free account · Takes less than a minute
            </p>
          </div>
        )}

        {/* Empty state prompt */}
        {songs.length === 0 && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '40px 0', animation: 'fadeUp 0.6s ease',
          }}>
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 8,
              alignItems: 'center', opacity: 0.4,
            }}>
              {['Song 1', 'Song 2', 'Song 3'].map((s, i) => (
                <div key={i} style={{
                  width: 200, height: 14, borderRadius: 7,
                  background: 'rgba(201,168,76,0.2)',
                  opacity: 1 - i * 0.25,
                }} />
              ))}
            </div>
            <p style={{
              fontSize: 12, color: '#6a6050',
              margin: '20px 0 0', textAlign: 'center', lineHeight: 1.5,
            }}>
              Type a song you played tonight<br />and hit enter
            </p>
          </div>
        )}

        {/* "This setlist isn't saved yet" urgency line */}
        {songs.length > 0 && !showValue && (
          <p style={{
            fontSize: 11, color: 'rgba(201,168,76,0.4)',
            textAlign: 'center', letterSpacing: '0.06em',
            margin: 0, animation: 'fadeIn 0.4s ease',
          }}>
            ⚠ This setlist isn't saved yet
          </p>
        )}

        {songs.length >= 2 && showValue && (
          <p style={{
            fontSize: 11, color: 'rgba(201,168,76,0.35)',
            textAlign: 'center', letterSpacing: '0.06em',
            margin: '8px 0 0',
          }}>
            ⚠ This setlist isn't saved yet
          </p>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp  { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input::placeholder { color: #6a6050; }
        input:focus { border-color: rgba(201,168,76,0.4) !important; }
      `}</style>
    </div>
  )
}
