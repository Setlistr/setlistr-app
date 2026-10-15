// Load failure with a way forward (docs/ui-standard.md → Errors): what
// didn't load, one reassuring line, and Try again (44px). Replaces the
// content that failed, never an empty state and never an endless loader.
// `compact` is for one section of a page whose other sections loaded.
export function LoadError({ message, detail = 'Check your connection, then try again.', onRetry, compact = false }: {
  message: string
  detail?: string
  onRetry: () => void
  compact?: boolean
}) {
  return (
    <div role="alert" style={{ background: 'color-mix(in srgb, var(--sl-warn) 7%, transparent)', border: '1px solid color-mix(in srgb, var(--sl-warn) 28%, transparent)', borderRadius: 12, padding: compact ? '12px 14px' : '16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
      <span style={{ flex: '1 1 200px', minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: compact ? 14 : 15, fontWeight: 600, color: 'var(--sl-text)' }}>{message}</span>
        {detail && <span style={{ display: 'block', fontSize: 13, color: 'var(--sl-text-2)', marginTop: 2 }}>{detail}</span>}
      </span>
      <button onClick={onRetry}
        style={{ minHeight: 44, padding: '0 18px', borderRadius: 10, border: '1px solid color-mix(in srgb, var(--sl-accent) 45%, transparent)', background: 'color-mix(in srgb, var(--sl-accent) 12%, transparent)', color: 'var(--sl-gold-text)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
        Try again
      </button>
    </div>
  )
}
