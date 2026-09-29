'use client'
import { useRouter } from 'next/navigation'
import { ClipboardList, Archive } from 'lucide-react'

const C = {
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
}

export type SubmissionsView = 'file' | 'history'

// The two-choice header shown at the top of both app/app/file (Filing
// Queue) and app/app/history (Your Record) — replaces the old one-line
// "Full History →" link on Filing Queue with a real, equally-weighted
// choice in both directions, so whichever page you're on shows the other
// as a clear, reachable option rather than a small afterthought link.
// counts are optional (undefined while still loading) so callers can
// render immediately and let the numbers fill in — never blocks the page.
export function SubmissionsSwitcher({ active, filingQueueCount, fullHistoryCount }: {
  active: SubmissionsView
  filingQueueCount?: number
  fullHistoryCount?: number
}) {
  const router = useRouter()

  const options: { key: SubmissionsView; href: string; label: string; count?: number; Icon: typeof ClipboardList }[] = [
    { key: 'file', href: '/app/file', label: 'Filing Queue', count: filingQueueCount, Icon: ClipboardList },
    { key: 'history', href: '/app/history', label: 'Full History', count: fullHistoryCount, Icon: Archive },
  ]

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
      {options.map(opt => {
        const isActive = opt.key === active
        return (
          <button
            key={opt.key}
            onClick={() => { if (!isActive) router.push(opt.href) }}
            aria-current={isActive ? 'page' : undefined}
            style={{
              flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
              padding: '12px 14px', borderRadius: 14, cursor: isActive ? 'default' : 'pointer', fontFamily: 'inherit', textAlign: 'left' as const,
              background: isActive ? C.goldDim : 'rgba(255,255,255,0.02)',
              border: `1px solid ${isActive ? C.borderGold : C.border}`,
              WebkitTapHighlightColor: 'transparent',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
              <opt.Icon size={13} color={isActive ? C.gold : C.muted} strokeWidth={2} />
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: isActive ? C.gold : C.secondary, flex: 1, minWidth: 0, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {opt.label}
              </span>
            </div>
            <span style={{ fontSize: 22, fontWeight: 800, color: isActive ? C.text : C.muted, fontFamily: '"DM Mono", monospace', lineHeight: 1 }}>
              {opt.count === undefined ? '—' : opt.count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
