'use client'
import { useState } from 'react'

const STAGES = [
  {
    n: '01', name: 'Tool', defaultActive: true,
    sub: 'Building now',
    desc: 'Capture every show. Submit to every PRO. Royalties enter the pipeline. Under 90 seconds after the last song.',
  },
  {
    n: '02', name: 'Habit', defaultActive: false,
    sub: 'Q3 2026',
    desc: 'The pre-show ritual. The post-show record. A career archive that compounds with every performance.',
  },
  {
    n: '03', name: 'Network', defaultActive: false,
    sub: 'Q4 2026',
    desc: 'Publishers, co-writers, and fans connected to the verified live record in real time.',
  },
  {
    n: '04', name: 'Intelligence', defaultActive: false,
    sub: '2027',
    desc: 'The system surfaces shows that were never submitted. Royalties the artist never knew existed.',
  },
  {
    n: '05', name: 'Infrastructure', defaultActive: false,
    sub: '2028+',
    desc: 'The canonical live performance layer. Licensed globally to labels, DSPs, PROs, and analytics platforms.',
  },
]

export default function StageCards() {
  const [active, setActive] = useState('01')

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1fr)',
      gap: 10,
    }} className="sl-stage-wrap">
      {STAGES.map(({ n, name, sub, desc }) => {
        const isActive = active === n
        const isNow    = n === '01'

        return (
          <div
            key={n}
            onClick={() => setActive(n)}
            style={{
              position: 'relative', overflow: 'hidden',
              borderRadius: 14, padding: '28px 24px',
              display: 'flex', flexDirection: 'column',
              minHeight: 240, cursor: 'pointer',
              transition: 'border-color .2s, background .2s, transform .15s',
              background: isActive
                ? 'linear-gradient(145deg, rgba(201,168,76,.16), rgba(201,168,76,.04))'
                : 'rgba(255,255,255,0.025)',
              border: isActive
                ? '1px solid rgba(201,168,76,.55)'
                : '1px solid rgba(255,255,255,0.06)',
              transform: isActive ? 'translateY(-2px)' : 'translateY(0)',
              boxShadow: isActive
                ? '0 8px 32px rgba(201,168,76,0.12)'
                : 'none',
            }}
          >
            {/* Top row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{
                fontFamily: '"DM Mono", monospace',
                fontSize: 10, letterSpacing: '0.2em',
                color: isActive ? '#C9A84C' : 'rgba(255,255,255,0.2)',
              }}>{n}</span>

              {isNow ? (
                <span style={{
                  fontFamily: '"DM Mono", monospace',
                  fontSize: 8, letterSpacing: '.12em',
                  color: '#C9A84C',
                  border: '1px solid rgba(201,168,76,.4)',
                  padding: '2px 7px', borderRadius: 3,
                }}>NOW</span>
              ) : (
                <span style={{
                  fontFamily: '"DM Mono", monospace',
                  fontSize: 9, letterSpacing: '.12em',
                  color: isActive ? 'rgba(201,168,76,0.6)' : 'rgba(255,255,255,0.18)',
                }}>{sub}</span>
              )}
            </div>

            {/* Name */}
            <div style={{
              fontFamily: '"Bebas Neue", sans-serif',
              fontSize: 28, letterSpacing: '0.04em',
              color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.35)',
              margin: '0 0 10px',
              position: 'relative', zIndex: 1,
            }}>{name}</div>

            {/* Divider */}
            <div style={{
              height: 1,
              background: isActive
                ? 'linear-gradient(to right, rgba(201,168,76,0.7), transparent)'
                : 'rgba(255,255,255,0.06)',
              marginBottom: 14,
            }} />

            {/* Description */}
            <div style={{
              fontSize: 13, fontWeight: 300,
              lineHeight: 1.65, flex: 1,
              position: 'relative', zIndex: 1,
              color: isActive ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.22)',
            }}>{desc}</div>

            {/* Watermark number */}
            <div style={{
              position: 'absolute',
              bottom: -12, right: 12,
              fontFamily: '"Bebas Neue", sans-serif',
              fontSize: 96, lineHeight: 1,
              letterSpacing: '0.04em',
              pointerEvents: 'none', userSelect: 'none',
              color: isActive ? 'rgba(201,168,76,0.2)' : 'rgba(255,255,255,0.04)',
            }}>{n}</div>
          </div>
        )
      })}
    </div>
  )
}
