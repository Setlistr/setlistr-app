'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function StartPage() {
  const router = useRouter()
  const [shows, setShows] = useState(20)

  const unclaimed = shows * 8 * 8

  function adjust(delta: number) {
    setShows(n => Math.max(1, n + delta))
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const n = parseInt(e.target.value.replace(/\D/g, ''), 10)
    if (!isNaN(n) && n > 0) setShows(n)
  }

  return (
    <div style={{
      minHeight: '100svh',
      background: '#0a0908',
      fontFamily: '"DM Sans", system-ui, sans-serif',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '0 20px 60px',
      boxSizing: 'border-box',
    }}>

      <div style={{
        width: '100%', maxWidth: 420,
        display: 'flex', flexDirection: 'column',
      }}>

        {/* Hero */}
        <div style={{ paddingTop: 64, paddingBottom: 40 }}>
          <h1 style={{
            fontSize: 'clamp(28px, 8vw, 40px)',
            fontWeight: 800, color: '#f0ece3',
            margin: '0 0 14px', letterSpacing: '-0.03em', lineHeight: 1.1,
          }}>
            The money is already there.
          </h1>
          <p style={{
            fontSize: 16, color: '#6a6050',
            margin: 0, lineHeight: 1.6,
          }}>
            Every show you played created royalties. Most artists never collect them.
          </p>
        </div>

        {/* Input */}
        <div style={{
          background: '#141210',
          border: '1px solid rgba(201,168,76,0.2)',
          borderRadius: 16, padding: '20px 20px 16px',
          marginBottom: 20,
        }}>
          <p style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: '#6a6050',
            margin: '0 0 16px',
          }}>
            How many shows did you play last year?
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => adjust(-1)}
              style={{
                width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#c9a84c', fontSize: 24, fontWeight: 300,
                cursor: 'pointer', lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >−</button>

            <input
              type="text"
              inputMode="numeric"
              value={shows}
              onChange={handleInput}
              style={{
                flex: 1, textAlign: 'center',
                background: 'transparent', border: 'none', outline: 'none',
                fontSize: 'clamp(44px, 12vw, 60px)',
                fontWeight: 800, color: '#c9a84c',
                fontFamily: '"DM Mono", monospace',
                letterSpacing: '-0.04em', lineHeight: 1,
                width: '100%',
              }}
            />

            <button
              onClick={() => adjust(1)}
              style={{
                width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#c9a84c', fontSize: 24, fontWeight: 300,
                cursor: 'pointer', lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >+</button>
          </div>
        </div>

        {/* Estimate */}
        <div style={{
          background: 'rgba(201,168,76,0.05)',
          border: '1px solid rgba(201,168,76,0.2)',
          borderRadius: 16, padding: '28px 24px',
          marginBottom: 12,
          textAlign: 'center',
        }}>
          <p style={{
            fontSize: 'clamp(48px, 14vw, 68px)',
            fontWeight: 800, color: '#c9a84c',
            margin: '0 0 4px', letterSpacing: '-0.04em', lineHeight: 1,
            fontFamily: '"DM Mono", monospace',
          }}>
            ~${unclaimed.toLocaleString()}
          </p>

          <p style={{
            fontSize: 14, fontWeight: 700, color: 'rgba(201,168,76,0.6)',
            letterSpacing: '0.08em', textTransform: 'uppercase',
            margin: '0 0 20px',
          }}>
            unclaimed
          </p>

          <p style={{
            fontSize: 13, color: '#6a6050',
            margin: '0 0 20px', lineHeight: 1.6,
          }}>
            Every venue pays a licensing fee on your behalf. Your PRO can't distribute it without a setlist submission.
          </p>

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, padding: '12px 16px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 10,
          }}>
            <span style={{ fontSize: 12, color: '#3a3028', letterSpacing: '0.04em' }}>
              You've likely claimed:
            </span>
            <span style={{
              fontSize: 18, fontWeight: 700, color: '#3a3028',
              fontFamily: '"DM Mono", monospace',
            }}>
              $0
            </span>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={() => router.push('/auth/login?from=start')}
          style={{
            width: '100%', padding: '17px',
            background: '#c9a84c', border: 'none', borderRadius: 12,
            color: '#0a0908', fontSize: 15, fontWeight: 800,
            letterSpacing: '0.05em', textTransform: 'uppercase',
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'opacity 0.15s ease',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.85'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
        >
          Start claiming →
        </button>

      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&family=DM+Mono:wght@400;700;800&display=swap');
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
      `}</style>
    </div>
  )
}
