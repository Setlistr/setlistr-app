'use client'
import { StatusLabel } from '@/components/ui/StatusLabel'
import { Skeleton } from '@/components/ui/Skeleton'

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

export function SubmissionEntryRow(props: SubmissionEntryRowProps) {
  const { onNavigate, disabled, day, month, venueName, statusLabel, statusTextColor, dotFilled } = props

  return (
    <button
      className={`subm-row subm-row--${props.variant}`}
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
      <span className="subm-date" style={{ width: 38, flexShrink: 0, alignSelf: 'flex-start', textAlign: 'center' as const, paddingTop: 1 }}>
        <span style={{ display: 'block', fontSize: 20, fontWeight: 700, lineHeight: 1, color: C.text, fontVariantNumeric: 'tabular-nums' as const }}>{day}</span>
        <span style={{ display: 'block', fontSize: 12, color: C.muted, marginTop: 4 }}>{month}</span>
      </span>

      {props.variant === 'queue' ? (
        <>
          <span className="subm-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' as const, gap: 3 }}>
            <span className="subm-l1" style={{ fontSize: 16.5, fontWeight: 700, lineHeight: 1.25, color: C.text }}>{props.task}</span>
            <span className="subm-l2" style={{ fontSize: 14.5, lineHeight: 1.35, color: C.secondary, overflowWrap: 'break-word' as const }}>
              {[venueName, props.city].filter(Boolean).join(' · ')}
            </span>
            <StatusLabel label={statusLabel} color={statusTextColor} filled={dotFilled}>
              {props.statusNote && <span className="subm-l3" style={{ fontSize: 13, color: C.muted, overflowWrap: 'break-word' as const }}>{props.statusNote}</span>}
            </StatusLabel>
            {props.deadlineLabel && (
              <span className="subm-s2" style={{ fontSize: 12.5, fontWeight: 600, color: props.deadlineColor || C.muted, marginTop: 2 }}>{props.deadlineLabel}</span>
            )}
          </span>
          <span className="subm-go" aria-hidden="true" style={{ flexShrink: 0, width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--sl-accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--sl-accent) 45%, transparent)', color: C.goldText }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </span>
        </>
      ) : (
        <>
          <span className="subm-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' as const, gap: 3 }}>
            <span className="subm-l1" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {props.photoUrl && (
                <span style={{ width: 24, height: 24, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'var(--sl-surface)' }}>
                  <img src={props.photoUrl} alt="" aria-hidden="true" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </span>
              )}
              <span style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.25, color: C.text, overflowWrap: 'break-word' as const, minWidth: 0 }}>{venueName}</span>
            </span>
            <span className="subm-l2" style={{ fontSize: 14.5, lineHeight: 1.35, color: C.secondary, overflowWrap: 'break-word' as const }}>{props.metaLine}</span>
            <StatusLabel label={statusLabel} color={statusTextColor} filled={dotFilled}>
              {props.estimate != null && props.estimate > 0 && (
                <span className="subm-s2" style={{ fontSize: 13, color: C.secondary }}>~${props.estimate} est.</span>
              )}
            </StatusLabel>
          </span>
          <svg className="subm-go" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: C.muted }}><path d="M9 6l6 6-6 6" /></svg>
        </>
      )}
    </button>
  )
}

// Placeholder rows shaped like the real ones: same padding, date block, line
// heights and (queue) arrow, so nothing shifts when the list arrives. Pulses
// gently; still under prefers-reduced-motion.
export function SubmissionRowsSkeleton({ variant, count = 5 }: { variant: 'queue' | 'history'; count?: number }) {
  const line = (cls: string, h: number, w: string, bar: number, extra?: React.CSSProperties) => (
    <span className={cls} style={{ height: h, display: 'flex', alignItems: 'center', ...extra }}>
      <Skeleton w={w} h={bar} r={5} />
    </span>
  )
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`subm-row subm-row--${variant}`} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 4px', minHeight: 72, borderBottom: `1px solid ${C.hair}`, boxSizing: 'border-box' as const }}>
          <span className="subm-date" style={{ width: 38, flexShrink: 0, alignSelf: 'flex-start', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 6, paddingTop: 2 }}>
            <Skeleton w={22} h={18} r={5} />
            <Skeleton w={26} h={10} r={4} />
          </span>
          <span className="subm-main" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' as const, gap: 3 }}>
            {line('subm-l1', 21, variant === 'queue' ? '56%' : ['62%', '48%', '70%'][i % 3], 14)}
            {line('subm-l2', 20, ['44%', '58%', '38%'][i % 3], 11)}
            {line('subm-l3', 16, '32%', 9, { marginTop: 5 })}
            {/* Trailing status/deadline placeholders: desktop layout only. */}
            {line('subm-s1 subm-skel-trail', 16, '70%', 9, { display: 'none' })}
            {line('subm-s2 subm-skel-trail', 16, '52%', 9, { display: 'none' })}
          </span>
          {variant === 'queue'
            ? <span className="subm-go" style={{ flexShrink: 0 }}><Skeleton w={40} h={40} r={20} /></span>
            : <span className="subm-go" style={{ width: 16, flexShrink: 0 }} />}
        </div>
      ))}
    </div>
  )
}

// Keeps the header's count chip its usual size while the number is unknown.
export function CountChipPlaceholder() {
  return <Skeleton w={52} h={10} r={4} style={{ display: 'inline-block', verticalAlign: 'middle' }} />
}

// Desktop composition for both Submissions screens, rendered once per page.
// Phones (content under 600px) are untouched: every rule sits behind a
// container query on .subm-cq (the page's content width beside the desktop
// sidebar, like app/app/dashboard), and overrides the mobile inline styles
// only there. Tiers and outer margins match the dashboard: 640px column with
// 32px margins from 600px, the 1120px frame with 48px margins from 900px —
// where this single column is bounded to 880px on the dashboard's left edge.
// Rows become: date | show/task details | a fixed trailing column with the
// status and deadline (or estimate) | the action.
export function SubmissionsDesktopStyles() {
  return (
    <style>{`
      .subm-cq { container: subm / inline-size; position: relative; z-index: 1; }
      @container subm (min-width: 600px) {
        .subm-page { max-width: 640px !important; padding: 0 32px 56px !important; }
        .subm-row { display: grid !important; column-gap: 16px !important; row-gap: 3px !important; align-items: start !important; padding: 16px 4px !important; }
        .subm-row--queue { grid-template-columns: 38px minmax(0, 1fr) 168px 40px; grid-template-areas: "date l1 s1 go" "date l2 s2 go" "date l3 s2 go"; }
        .subm-row--history { grid-template-columns: 38px minmax(0, 1fr) 168px 16px; grid-template-areas: "date l1 s1 go" "date l2 s2 go"; }
        .subm-main, .subm-statusline { display: contents !important; }
        .subm-date { grid-area: date; }
        .subm-l1 { grid-area: l1; } .subm-l2 { grid-area: l2; } .subm-l3 { grid-area: l3; }
        /* Trailing area hugs the action: status and deadline/estimate share
           a right edge beside it. */
        .subm-s1 { grid-area: s1; align-self: center; justify-self: end; margin: 0 !important; }
        .subm-s2 { grid-area: s2; justify-self: end; text-align: right; margin: 0 !important; }
        .subm-go { grid-area: go; align-self: center !important; }
        .subm-row--history .subm-l3 { display: none !important; }
        .subm-skel-trail { display: flex !important; width: 112px; }
        .subm-row:focus-visible { outline: 2px solid var(--sl-accent); outline-offset: 2px; border-radius: 6px; }
        @media (hover: hover) {
          .subm-row--queue:hover .subm-go { background: color-mix(in srgb, var(--sl-accent) 22%, transparent) !important; }
          .subm-row--history:hover .subm-go { color: var(--sl-text-2) !important; }
          .subm-row:hover .subm-l1 { text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--sl-text) 30%, transparent); text-underline-offset: 3px; }
        }
        /* History toolbar: search with the date/Edit controls beside it,
           status filters beneath (wrapping, no sideways scroll). */
        .subm-tb { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "search tools" "tabs tabs" "dates dates"; column-gap: 16px; row-gap: 12px; align-items: center; margin-bottom: 12px !important; }
        .subm-tb-search { grid-area: search; margin: 0 !important; max-width: 420px; }
        .subm-tb-tabs { grid-area: tabs; margin: 0 !important; flex-wrap: wrap; overflow: visible !important; padding-right: 0 !important; }
        .subm-tb-tools { grid-area: tools; }
        .subm-tb-dates { grid-area: dates; margin: 0 !important; max-width: 420px; }
      }
      @container subm (min-width: 900px) {
        .subm-page { max-width: 1120px !important; padding: 0 48px 64px !important; }
        .subm-page > * { max-width: 880px; }
        .subm-row--queue { grid-template-columns: 38px minmax(0, 1fr) 196px 40px; column-gap: 20px !important; }
        .subm-row--history { grid-template-columns: 38px minmax(0, 1fr) 196px 16px; column-gap: 20px !important; }
      }
    `}</style>
  )
}
