'use client'

const C = { text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68', gold: '#c9a84c' }
const CARD = {
  background: 'linear-gradient(180deg, #171512 0%, #121009 100%)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
}

export interface SubmissionEntryRowProps {
  onNavigate: () => void
  disabled?: boolean
  emphasized?: boolean
  photoUrl?: string | null
  dateLabel: string
  venueName: string
  metaLine: string
  estimate?: number | null
  statusLabel: string
  statusColor: string
  statusDotFilled?: boolean
  // Filing-Queue-only extras — undefined on Your Record's rows.
  missing?: string[]
  deadlineLabel?: string
  deadlineColor?: string
  actionLabel?: string
}

// The shared visual structure for a single show across both Submissions
// screens (Filing Queue and Your Record): same date+venue line, same
// city/songs+status line, so the two pages read as one coherent design.
// What each optionally adds below is where their different purposes stay
// visible rather than hidden — Filing Queue can show what's missing and a
// filing deadline; Your Record can show a $ estimate. The whole card is
// one tap target (no nested button — callers needing a delete control or
// similar render it as a sibling, same pattern app/app/history already
// used before this component existed).
export function SubmissionEntryRow(props: SubmissionEntryRowProps) {
  const {
    onNavigate, disabled, emphasized, photoUrl, dateLabel, venueName, metaLine,
    estimate, statusLabel, statusColor, statusDotFilled, missing, deadlineLabel, deadlineColor, actionLabel,
  } = props

  return (
    <button
      onClick={onNavigate}
      disabled={disabled}
      style={{
        background: CARD.background,
        border: `1px solid ${emphasized ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.04)'}`,
        borderRadius: 16, padding: '14px 16px', cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1, textAlign: 'left' as const, display: 'flex', flexDirection: 'column' as const, gap: 6,
        fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const, boxShadow: CARD.boxShadow,
        WebkitTapHighlightColor: 'transparent',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {photoUrl && (
          <div style={{ width: 28, height: 28, borderRadius: 7, overflow: 'hidden', flexShrink: 0, background: '#171512' }}>
            <img src={photoUrl} alt="" aria-hidden="true" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
        )}
        <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: C.muted, fontFamily: '"DM Mono", monospace', letterSpacing: '0.02em' }}>
          {dateLabel}
        </span>
        <p style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 700, color: C.text, margin: 0, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {venueName}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: C.muted, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {metaLine}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {estimate != null && estimate > 0 && (
            <span style={{ fontSize: 12.5, fontWeight: 700, color: C.gold, fontFamily: '"DM Mono", monospace' }}>~${estimate}</span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, display: 'inline-block', background: statusDotFilled ? statusColor : 'transparent', border: statusDotFilled ? 'none' : `1.5px solid ${statusColor}` }} />
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: statusColor, whiteSpace: 'nowrap' as const }}>{statusLabel}</span>
          </span>
        </div>
      </div>

      {deadlineLabel && (
        <p style={{ fontSize: 11, color: deadlineColor || C.muted, margin: 0, fontWeight: 600 }}>{deadlineLabel}</p>
      )}

      {missing && missing.length > 0 && (
        <p style={{ fontSize: 12, color: C.secondary, margin: 0, lineHeight: 1.4 }}>Missing: {missing.join(', ')}</p>
      )}

      {actionLabel && (
        <span style={{ marginTop: 2, fontSize: 12, fontWeight: 700, color: C.gold }}>{actionLabel} →</span>
      )}
    </button>
  )
}
