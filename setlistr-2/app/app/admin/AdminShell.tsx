'use client'
// Shared header + tab-bar shell for every admin route. Pure extraction from
// AdminView.tsx's previous inline header — same markup, same styles, just
// parameterized so app/app/admin/rd-log/RdLogView.tsx can render an
// identical header with "R&D Log" as its own active tab, and every other
// tab rendering as a real navigation link back to /app/admin.
//
// Deliberately does NOT own font-import/global-reset <style> tags beyond
// the one keyframe its own markup needs (the "Live" dot's pulse animation)
// — each consuming page keeps its own existing <style> block for its own
// content's needs (unchanged, not part of this extraction).
import type { CSSProperties, ReactNode } from 'react'

const C = {
  bg:        '#0a0908',
  border:    'rgba(255,255,255,0.07)',
  text:      '#f0ece3',
  secondary: '#a09070',
  muted:     '#6a6050',
  gold:      '#c9a84c',
  green:     '#4ade80',
}

export type AdminShellTab = {
  id: string
  label: string
  // Present => renders as a plain navigation link to another admin route
  // (e.g. R&D Log from the main panel). Absent => renders as a local tab
  // button that calls onTabChange.
  href?: string
}

export default function AdminShell({
  title, subtitle, tabs, activeTab, onTabChange, children,
}: {
  title: string
  subtitle?: string
  tabs: AdminShellTab[]
  activeTab: string
  onTabChange?: (id: string) => void
  children: ReactNode
}) {
  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif', color: C.text }}>

      {/* ── Header ── */}
      <div style={{ padding: '28px 20px 0', maxWidth: 800, margin: '0 auto' }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', color: C.gold + '99', margin: '0 0 4px' }}>
          Setlistr · Admin
        </p>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: subtitle ? 6 : 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.025em' }}>
            {title}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, animation: 'admin-shell-pulse-dot 2s ease-in-out infinite' }} />
            <span style={{ fontSize: 11, color: C.secondary }}>Live</span>
          </div>
        </div>
        {subtitle && (
          <p style={{ fontSize: 13, color: C.muted, margin: '0 0 24px' }}>{subtitle}</p>
        )}

        {/* ── Tab bar — mobile scrollable ── */}
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any, marginLeft: -20, marginRight: -20, paddingLeft: 20, paddingRight: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, minWidth: 'max-content' }}>
            {tabs.map(t => {
              const isActive = activeTab === t.id
              const tabStyle: CSSProperties = {
                padding: '10px 14px',
                background: 'none',
                border: 'none',
                borderBottom: isActive ? `2px solid ${C.gold}` : '2px solid transparent',
                color: isActive ? C.gold : C.muted,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                fontFamily: 'inherit',
                marginBottom: -1,
                whiteSpace: 'nowrap',
                transition: 'color 0.15s ease',
                WebkitTapHighlightColor: 'transparent',
              }
              return t.href ? (
                <a key={t.id} href={t.href} style={{ ...tabStyle, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                  {t.label}
                </a>
              ) : (
                <button key={t.id} onClick={() => onTabChange?.(t.id)} style={tabStyle}>
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ padding: '0 20px 60px', maxWidth: 800, margin: '0 auto' }}>
        {children}
      </div>

      <style>{`@keyframes admin-shell-pulse-dot { 0%,100%{opacity:1} 50%{opacity:.3} }`}</style>
    </div>
  )
}
