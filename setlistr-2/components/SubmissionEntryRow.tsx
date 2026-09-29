'use client'

const C = { text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68', gold: '#c9a84c', green: '#4ade80' }

export interface SubmissionEntryRowProps {
  onNavigate: () => void
  disabled?: boolean
  photoUrl?: string | null
  dateLabel: string
  venueName: string
  metaLine: string
  estimate?: number | null
  statusLabel: string
  // Text color only — Your Record's own distinction (green for the one
  // truly self-reported-done state, "Marked Submitted"; gold for
  // everything still pending) stays visible here. The dot itself is
  // always gold, filled once "dotFilled" — that pairing (gold dot, text
  // color carries the real distinction) is Setlistr's own original status
  // language, restored deliberately rather than tying the dot to whatever
  // color the text happens to be.
  statusTextColor: string
  dotFilled?: boolean
  // Filing-Queue-only — undefined on Your Record's rows. `blocker` is the
  // single most important reason a show isn't ready yet (computeFilingStatus
  // already orders `missing` by importance — this is just its first
  // entry), not the full list; everything else lives on the show's own
  // page, one tap away. `deadlineLabel` is passed only when the caller has
  // already decided it needs attention (soon/urgent/expired) — a
  // comfortably-open deadline isn't shown here at all.
  blocker?: string
  deadlineLabel?: string
  deadlineColor?: string
  actionLabel?: string
}

// The shared, calm list-row structure for both Submissions screens (Filing
// Queue and Your Record) — a flat divided list, not a stack of bordered
// cards: one readable line for date + venue (venue wraps, never
// truncates), one line for essential context + status, and at most one
// more line for whichever single thing most needs saying (a blocker, a
// pressing deadline, or a $ estimate). Everything else — the full list of
// what's missing, the full deadline picture — lives on the show's own
// page, reached by tapping the row.
export function SubmissionEntryRow(props: SubmissionEntryRowProps) {
  const {
    onNavigate, disabled, photoUrl, dateLabel, venueName, metaLine,
    estimate, statusLabel, statusTextColor, dotFilled, blocker, deadlineLabel, deadlineColor, actionLabel,
  } = props

  return (
    <button
      onClick={onNavigate}
      disabled={disabled}
      style={{
        background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '16px 4px', cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1, textAlign: 'left' as const, display: 'flex', flexDirection: 'column' as const, gap: 5,
        fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const,
        WebkitTapHighlightColor: 'transparent',
      }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
        {photoUrl && (
          <div style={{ width: 26, height: 26, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: '#171512', alignSelf: 'center' }}>
            <img src={photoUrl} alt="" aria-hidden="true" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
        )}
        <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: '"DM Mono", monospace', letterSpacing: '0.02em' }}>
          {dateLabel}
        </span>
        <p style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 700, color: C.text, margin: 0, lineHeight: 1.3, overflowWrap: 'break-word' as const }}>
          {venueName}
        </p>
        <span style={{ flexShrink: 0, color: C.muted, fontSize: 15 }}>›</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.muted, overflowWrap: 'break-word' as const }}>
          {metaLine}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {estimate != null && estimate > 0 && (
            <span style={{ fontSize: 12.5, fontWeight: 700, color: C.gold, fontFamily: '"DM Mono", monospace' }}>~${estimate}</span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, display: 'inline-block', background: dotFilled ? C.gold : 'transparent', border: dotFilled ? 'none' : `1.5px solid ${C.gold}` }} />
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: statusTextColor, whiteSpace: 'nowrap' as const }}>{statusLabel}</span>
          </span>
        </div>
      </div>

      {deadlineLabel && (
        <p style={{ fontSize: 11.5, color: deadlineColor || C.muted, margin: 0, fontWeight: 600 }}>{deadlineLabel}</p>
      )}

      {blocker && (
        <p style={{ fontSize: 12, color: C.secondary, margin: 0 }}>{blocker}</p>
      )}

      {actionLabel && (
        <span style={{ marginTop: 1, fontSize: 11.5, color: C.muted }}>{actionLabel}</span>
      )}
    </button>
  )
}
