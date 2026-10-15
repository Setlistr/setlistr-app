// Placeholder block for loading states (docs/ui-standard.md → Loading).
// One surface (--sl-skeleton) and one shimmer rhythm everywhere; the
// shimmer is defined once in globals.css (.sl-skel) and stops under
// prefers-reduced-motion. Size each block like the content it stands in
// for, so nothing moves when the data arrives.
export function Skeleton({ w, h, mt = 0, r = 10, onDark = false, style }: {
  w?: string | number
  h: number | string
  mt?: number
  r?: number
  // For placeholders drawn on imagery that is dark in both appearances.
  onDark?: boolean
  style?: React.CSSProperties
}) {
  return (
    <div className={onDark ? 'sl-skel sl-skel-dark' : 'sl-skel'} aria-hidden="true"
      style={{ width: w ?? '100%', height: h, marginTop: mt, borderRadius: r, background: onDark ? 'rgba(255,255,255,0.06)' : 'var(--sl-skeleton)', position: 'relative', overflow: 'hidden', flexShrink: 0, ...style }} />
  )
}
