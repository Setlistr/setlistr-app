// Filing status label (docs/ui-standard.md → Status): an uppercase label
// with a gold dot, outline by default and filled only when `filled`.
// MARKED SUBMITTED = green text (--sl-ok) with the FILLED gold dot. The dot
// is always gold, whatever the label colour. Optional trailing detail.
export function StatusLabel({ label, color, filled, children }: { label: string; color: string; filled?: boolean; children?: React.ReactNode }) {
  return (
    <span className="subm-statusline" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const, columnGap: 10, rowGap: 2, marginTop: 5 }}>
      <span className="subm-s1" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box' as const, background: filled ? 'var(--sl-accent)' : 'transparent', border: '1.5px solid var(--sl-accent)' }} />
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' as const, color, whiteSpace: 'nowrap' as const }}>{label}</span>
      </span>
      {children}
    </span>
  )
}
