'use client'

const C = { text: 'var(--sl-text)', secondary: 'var(--sl-text-2)', muted: 'var(--sl-text-3)', gold: 'var(--sl-accent)', goldText: 'var(--sl-gold-text)', hair: 'color-mix(in srgb, var(--sl-text) 7%, transparent)' }

// The shared show row for both Submissions screens, with one hierarchy per
// screen:
//   - 'queue' (Filing Queue): the next task is the first line ("Review the
//     setlist" / "Open the claim sheet"), the show identifies it beneath,
//     then the status. A gold arrow marks the one action; it is a mark, not
//     a second control — the whole row is the single button.
//   - 'history' (Full History): the show is the first line (venue), then
//     city and song count, then the status with any estimate.
// Both: the dashboard's stacked date, a flat divided list (no cards), the
// venue allowed to wrap (never truncated), and the status language kept —
// an outline gold dot, filled only when `dotFilled`; MARKED SUBMITTED keeps
// its green text with the filled gold dot. The dot colour is always gold,
// independent of the status text colour.
// No interactive element is nested inside the row: History's delete
// control, when editing, is rendered by the page as a sibling.

interface CommonProps {
  onNavigate: () => void
  disabled?: boolean
  day: string
  month: string
  venueName: string
  statusLabel: string
  statusTextColor: string
  dotFilled?: boolean
}

export interface QueueRowProps extends CommonProps {
  variant: 'queue'
  task: string
  // "Venue · City" is built here from venueName + city.
  city?: string | null
  // The single most important missing detail, or a quiet detail line.
  statusNote?: string
  // Only passed when the deadline needs attention (soon/urgent/closed).
  deadlineLabel?: string
  deadlineColor?: string
}

export interface HistoryRowProps extends CommonProps {
  variant: 'history'
  photoUrl?: string | null
  // "City · N songs" (or the page's own notice, e.g. while a delete is armed).
  metaLine: string
  estimate?: number | null
}

export type SubmissionEntryRowProps = QueueRowProps | HistoryRowProps

function StatusLine({ label, color, filled, children }: { label: string; color: string; filled?: boolean; children?: React.ReactNode }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const, columnGap: 10, rowGap: 2, marginTop: 5 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box' as const, background: filled ? C.gold : 'transparent', border: `1.5px solid ${C.gold}` }} />
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color, whiteSpace: 'nowrap' as const }}>{label}</span>
      </span>
      {children}
    </span>
  )
}

export function SubmissionEntryRow(props: SubmissionEntryRowProps) {
  const { onNavigate, disabled, day, month, venueName, statusLabel, statusTextColor, dotFilled } = props

  return (
    <button
      onClick={onNavigate}
      disabled={disabled}
      style={{
        background: 'none', border: 'none', borderBottom: `1px solid ${C.hair}`,
        padding: '15px 4px', minHeight: 72, cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1, textAlign: 'left' as const,
        display: 'flex', alignItems: 'center', gap: 14,
        fontFamily: 'inherit', color: C.text, width: '100%', boxSizing: 'border-box' as const,
        WebkitTapHighlightColor: 'transparent',
      }}>
      {/* Stacked date, as on the dashboard's recent shows. */}
      <span style={{ width: 38, flexShrink: 0, alignSelf: 'flex-start', textAlign: 'center' as const, paddingTop: 1 }}>
        <span style={{ display: 'block', fontSize: 20, fontWeight: 700, lineHeight: 1, color: C.text, fontVariantNumeric: 'tabular-nums' as const }}>{day}</span>
        <span style={{ display: 'block', fontSize: 12, color: C.muted, marginTop: 4 }}>{month}</span>
      </span>

      {props.variant === 'queue' ? (
        <>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' as const, gap: 3 }}>
            <span style={{ fontSize: 16.5, fontWeight: 700, lineHeight: 1.25, color: C.text }}>{props.task}</span>
            <span style={{ fontSize: 14.5, lineHeight: 1.35, color: C.secondary, overflowWrap: 'break-word' as const }}>
              {[venueName, props.city].filter(Boolean).join(' · ')}
            </span>
            <StatusLine label={statusLabel} color={statusTextColor} filled={dotFilled}>
              {props.statusNote && <span style={{ fontSize: 13, color: C.muted, overflowWrap: 'break-word' as const }}>{props.statusNote}</span>}
            </StatusLine>
            {props.deadlineLabel && (
              <span style={{ fontSize: 12.5, fontWeight: 600, color: props.deadlineColor || C.muted, marginTop: 2 }}>{props.deadlineLabel}</span>
            )}
          </span>
          <span aria-hidden="true" style={{ flexShrink: 0, width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--sl-accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--sl-accent) 45%, transparent)', color: C.goldText }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </span>
        </>
      ) : (
        <>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' as const, gap: 3 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {props.photoUrl && (
                <span style={{ width: 24, height: 24, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'var(--sl-surface)' }}>
                  <img src={props.photoUrl} alt="" aria-hidden="true" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </span>
              )}
              <span style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.25, color: C.text, overflowWrap: 'break-word' as const, minWidth: 0 }}>{venueName}</span>
            </span>
            <span style={{ fontSize: 14.5, lineHeight: 1.35, color: C.secondary, overflowWrap: 'break-word' as const }}>{props.metaLine}</span>
            <StatusLine label={statusLabel} color={statusTextColor} filled={dotFilled}>
              {props.estimate != null && props.estimate > 0 && (
                <span style={{ fontSize: 13, color: C.secondary }}>~${props.estimate} est.</span>
              )}
            </StatusLine>
          </span>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: C.muted }}><path d="M9 6l6 6-6 6" /></svg>
        </>
      )}
    </button>
  )
}
