'use client'
import { useRouter } from 'next/navigation'

// Segmented control for SIBLING VIEWS of one area (docs/ui-standard.md →
// View switcher): Career's Overview / My Songs, Submissions' Filing Queue /
// Full History. Not for filtering a list — status filters use filter
// chips (History) and never this control.
//
// Two modes, one look:
//   - options with `href`: separate pages. Rendered as navigation with
//     aria-current on the active page.
//   - `onSelect`: views inside one page. Rendered as a tab list.
// Segments are 44px tall (touch target). Counts are optional; undefined or
// null renders nothing while they load, so the control never waits on data.
export type ViewOption = { key: string; label: string; count?: number | null; href?: string }

export function ViewSwitcher({ options, active, onSelect, label }: {
  options: ViewOption[]
  active: string
  onSelect?: (key: string) => void
  label: string
}) {
  const router = useRouter()
  const isTabs = !!onSelect
  const segments = options.map(opt => {
    const on = opt.key === active
    return (
      <button
        key={opt.key}
        className="sl-seg"
        role={isTabs ? 'tab' : undefined}
        aria-selected={isTabs ? on : undefined}
        aria-current={!isTabs && on ? 'page' : undefined}
        onClick={() => { if (on) return; if (onSelect) onSelect(opt.key); else if (opt.href) router.push(opt.href) }}
        style={{
          minHeight: 44, padding: '0 16px', borderRadius: 10, cursor: on ? 'default' : 'pointer',
          border: `1px solid ${on ? 'color-mix(in srgb, var(--sl-accent) 45%, transparent)' : 'transparent'}`,
          background: on ? 'var(--sl-elevated)' : 'transparent',
          color: on ? 'var(--sl-text)' : 'var(--sl-text-2)',
          fontFamily: 'inherit', fontSize: 14, fontWeight: on ? 700 : 600, whiteSpace: 'nowrap',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, flex: '1 1 auto',
          WebkitTapHighlightColor: 'transparent',
        }}>
        {opt.label}
        {opt.count != null && (
          <span style={{ fontSize: 12.5, fontWeight: 500, fontFamily: '"DM Mono", monospace', color: on ? 'var(--sl-gold-text)' : 'var(--sl-text-3)' }}>{opt.count}</span>
        )}
      </button>
    )
  })
  const shell: React.CSSProperties = { display: 'inline-flex', gap: 2, padding: 3, borderRadius: 13, background: 'color-mix(in srgb, var(--sl-text) 6%, transparent)', maxWidth: '100%' }
  return isTabs
    ? <div role="tablist" aria-label={label} style={shell}>{segments}</div>
    : <nav aria-label={label} style={shell}>{segments}</nav>
}
