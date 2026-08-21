'use client'
import { useState } from 'react'

export type SetlistrLoaderVariant = 'assemble' | 'pulse'

type SetlistrLoaderProps = {
  // Omit to let the loader decide via the session-aware rule in
  // useLoaderVariant() below (assemble once per app open, pulse after).
  // Pass explicitly to override that for a specific instance.
  variant?: SetlistrLoaderVariant
  fullScreen?: boolean
  label?: string
  size?: number
}

// Base (size=1) proportions, px.
const BAR_WIDTHS = [94, 66, 96, 65]
const DOT_SIZE   = 15
const BAR_HEIGHT = 13
const BAR_RADIUS = 7
const BAR_GAP    = 9
const DOT_GAP    = 14

const BAR_COLOR   = '#faf7f2'
const DOT_COLOR   = '#c9a84c'
const BG_COLOR    = '#0a0908'
const LABEL_COLOR = '#6a6050'

// One entrance delay per bar, ms — 85ms apart, 300ms each (see keyframes below).
const BAR_DELAYS_MS = [0, 85, 170, 255]

// Module-level, not React state and not persisted anywhere — resets on a
// full reload, which is exactly "once per app open." The first caller
// (whichever mounts first: an unset-variant SetlistrLoader or a
// useLoaderVariant() call) claims 'assemble'; everything after gets 'pulse'.
let hasAssembledThisSession = false

function nextSessionVariant(): SetlistrLoaderVariant {
  if (!hasAssembledThisSession) {
    hasAssembledThisSession = true
    return 'assemble'
  }
  return 'pulse'
}

// Returns 'assemble' on the first call of the session, 'pulse' on every
// call after — across every component that calls it, not per-instance.
export function useLoaderVariant(): SetlistrLoaderVariant {
  const [variant] = useState(() => nextSessionVariant())
  return variant
}

export function SetlistrLoader({ variant, fullScreen = true, label, size = 1 }: SetlistrLoaderProps) {
  // Only consult (and consume) the session flag when the caller didn't pass
  // an explicit variant — an explicit prop must never advance the session
  // state, or it could steal the "first assembly" slot from a later,
  // unset-variant loader. The lazy useState initializer runs exactly once
  // per instance, so this can't double-flip the flag on re-render.
  const [autoVariant] = useState<SetlistrLoaderVariant | null>(() => (
    variant === undefined ? nextSessionVariant() : null
  ))
  const effectiveVariant = variant ?? autoVariant ?? 'pulse'

  const barWidths = BAR_WIDTHS.map(w => w * size)
  const dotSize   = DOT_SIZE * size
  const barHeight = BAR_HEIGHT * size
  const barRadius = BAR_RADIUS * size
  const barGap    = BAR_GAP * size
  const dotGap    = DOT_GAP * size

  const barClass = (i: number) =>
    effectiveVariant === 'assemble' ? `setlistr-loader-bar setlistr-loader-bar-${i + 1}` : undefined
  const dotClass =
    effectiveVariant === 'assemble' ? 'setlistr-loader-dot-assemble' : 'setlistr-loader-dot-pulse'

  const mark = (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: barGap }}>
      {barWidths.slice(0, 3).map((w, i) => (
        <div
          key={i}
          className={barClass(i)}
          style={{ width: w, height: barHeight, borderRadius: barRadius, background: BAR_COLOR }}
        />
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: dotGap }}>
        <div
          className={barClass(3)}
          style={{ width: barWidths[3], height: barHeight, borderRadius: barRadius, background: BAR_COLOR }}
        />
        <div
          className={dotClass}
          style={{
            width: dotSize, height: dotSize, borderRadius: '50%', background: DOT_COLOR,
            boxShadow: '0 0 16px rgba(201,168,76,.45)',
          }}
        />
      </div>
    </div>
  )

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      {mark}
      {label && (
        <span style={{
          color: LABEL_COLOR, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
          fontFamily: '"DM Mono", monospace',
        }}>
          {label}
        </span>
      )}
    </div>
  )

  return (
    <div style={
      fullScreen
        ? { minHeight: '100svh', background: BG_COLOR, display: 'flex', alignItems: 'center', justifyContent: 'center' }
        : { display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
    }>
      {content}
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .setlistr-loader-bar { opacity: 0; transform-origin: left center; }
          ${BAR_DELAYS_MS.map((d, i) => (
            `.setlistr-loader-bar-${i + 1} { animation: setlistrBarAssemble 300ms cubic-bezier(.2,.8,.3,1) ${d}ms both; }`
          )).join('\n          ')}
          .setlistr-loader-dot-assemble {
            animation:
              setlistrDotAssemble 420ms cubic-bezier(.34,1.56,.64,1) 380ms both,
              setlistrDotBreathe 2.4s ease-in-out 800ms infinite;
          }
          .setlistr-loader-dot-pulse {
            animation: setlistrDotBreathe 2.4s ease-in-out infinite;
          }
        }
        @keyframes setlistrBarAssemble {
          from { transform: scaleX(0); opacity: 0; }
          to   { transform: scaleX(1); opacity: 1; }
        }
        @keyframes setlistrDotAssemble {
          from { transform: scale(0); box-shadow: 0 0 0 rgba(201,168,76,0); }
          to   { transform: scale(1); box-shadow: 0 0 16px rgba(201,168,76,.45); }
        }
        @keyframes setlistrDotBreathe {
          0%, 100% { box-shadow: 0 0 16px rgba(201,168,76,.30); opacity: .85; }
          50%      { box-shadow: 0 0 16px rgba(201,168,76,.55); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
