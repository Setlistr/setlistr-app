'use client'
import { useRouter } from 'next/navigation'

const C = {
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68', gold: '#c9a84c',
  border: 'rgba(255,255,255,0.08)',
}

export type SubmissionsView = 'file' | 'history'

// The two-choice header shown at the top of both app/app/file (Filing
// Queue) and app/app/history (Your Record). Deliberately quiet — plain
// text tabs with a thin underline on the active one, not two bordered,
// tinted boxes competing for attention with everything else on the page.
// Still obvious: the active tab is gold and underlined, the count is
// always visible, and it's the same two words in the same place on both
// pages. counts are optional (undefined while still loading) so callers
// can render immediately and let the numbers fill in.
export function SubmissionsSwitcher({ active, filingQueueCount, fullHistoryCount }: {
  active: SubmissionsView
  filingQueueCount?: number
  fullHistoryCount?: number
}) {
  const router = useRouter()

  const options: { key: SubmissionsView; href: string; label: string; count?: number }[] = [
    { key: 'file', href: '/app/file', label: 'Filing Queue', count: filingQueueCount },
    { key: 'history', href: '/app/history', label: 'Full History', count: fullHistoryCount },
  ]

  return (
    <div style={{ display: 'flex', gap: 20, marginBottom: 20, borderBottom: `1px solid ${C.border}` }}>
      {options.map(opt => {
        const isActive = opt.key === active
        return (
          <button
            key={opt.key}
            onClick={() => { if (!isActive) router.push(opt.href) }}
            aria-current={isActive ? 'page' : undefined}
            style={{
              background: 'none', border: 'none', borderBottom: `2px solid ${isActive ? C.gold : 'transparent'}`,
              padding: '0 0 10px', marginBottom: -1, cursor: isActive ? 'default' : 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'baseline', gap: 6, WebkitTapHighlightColor: 'transparent',
            }}>
            <span style={{ fontSize: 14, fontWeight: isActive ? 700 : 500, color: isActive ? C.text : C.secondary }}>
              {opt.label}
            </span>
            <span style={{ fontSize: 12, color: isActive ? C.gold : C.muted, fontFamily: '"DM Mono", monospace' }}>
              {opt.count === undefined ? '' : opt.count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
