// The record's "Next milestone" row: one dot per show in the current block
// of 25 (lib/record-summary.ts milestoneFor), filled gold through the record
// count, the rest outlined, in groups of five. Shared by the dashboard ledger
// and the post-save celebration so the two can never drift apart.
//
// Sizes read --d-* so a wider layout can set the approved desktop
// measurements; phones get the fallbacks. --d-dot / --d-dot-gap size the
// dots. The fallbacks follow the row's own width (container units), not the
// screen's, so all 25 always fit inside the content column: on a narrow
// phone, beside the desktop sidebar, and at larger text sizes.
import { milestoneFor } from '@/lib/record-summary'

const rowLabel: React.CSSProperties = { flex: 1, minWidth: 0, fontSize: 'var(--d-label, 14px)', color: 'var(--sl-text-2)', lineHeight: 1.35 }
const rowValue: React.CSSProperties = { textAlign: 'right', fontSize: 'var(--d-value, 16px)', fontWeight: 600, color: 'var(--sl-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
const unit: React.CSSProperties = { fontWeight: 400, color: 'var(--sl-text-3)' }
const DOT = 'var(--d-dot, min(9px, 2.6cqw))'
const DOT_GAP = 'var(--d-dot-gap, min(4px, 1cqw))'

export function MilestoneDots({ first, next, count }: { first: number; next: number; count: number }) {
  const groups = []
  for (let g = first; g <= next; g += 5) {
    const dots = []
    for (let n = g; n < g + 5 && n <= next; n++) {
      const on = n <= count
      dots.push(
        <i key={n} data-show={n} style={{
          display: 'block', flex: 'none', width: DOT, height: DOT, borderRadius: '50%', boxSizing: 'border-box',
          background: on ? 'var(--sl-gold)' : 'transparent',
          border: `1.5px solid ${on ? 'var(--sl-gold)' : 'color-mix(in srgb, var(--sl-text) 40%, transparent)'}`,
          transition: 'background-color 0.18s ease, border-color 0.18s ease',
        }} />
      )
    }
    groups.push(<span key={g} style={{ display: 'flex', gap: DOT_GAP }}>{dots}</span>)
  }
  // The row is its own size container (see DOT above). The block's ends
  // aren't labelled: "Show N · M to go" beside the dots already says them.
  return (
    <div style={{ containerType: 'inline-size', marginTop: 12 } as React.CSSProperties}>
      <div role="img" aria-label={`Shows ${first} to ${next}, one dot per show; ${Math.max(0, Math.min(count, next) - first + 1)} of ${next - first + 1} played`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'min(8px, 2cqw)' }}>{groups}</div>
    </div>
  )
}

// `block` shows a specific block instead of the one milestoneFor(count)
// picks — only the celebration uses it, to hold a just-completed block for a
// moment before the dashboard's rule starts the next one. `hideValue` hides
// "Show N · M to go" during that hold ("0 to go" is never a record state).
export function NextMilestoneRow({ count, block, hideValue = false }: {
  count: number; block?: { first: number; next: number }; hideValue?: boolean
}) {
  const m = block || milestoneFor(count)
  return (
    <div style={{ minHeight: 'var(--d-row, 56px)', padding: '12px 0', borderBottom: '1px solid var(--sl-line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={rowLabel}>Next milestone</span>
        <span style={{ ...rowValue, opacity: hideValue ? 0 : 1, transition: 'opacity 0.2s ease' }}>Show {m.next} <span style={unit}>· {m.next - count} to go</span></span>
      </div>
      <MilestoneDots first={m.first} next={m.next} count={count} />
    </div>
  )
}
