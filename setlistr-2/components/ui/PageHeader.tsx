'use client'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

// Page header (docs/ui-standard.md → Page header): one 28px title, an
// optional Back (sub-pages only, never on a tab root), and an optional
// meta slot on the right (a count chip). Wraps instead of overflowing at
// larger text sizes. Sibling-view switchers sit directly below it.
export function PageHeader({ title, backHref, meta }: { title: string; backHref?: string; meta?: React.ReactNode }) {
  const router = useRouter()
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, rowGap: 8, padding: '20px 0 16px' }}>
      {backHref && (
        <button onClick={() => router.push(backHref)}
          style={{ minHeight: 44, background: 'var(--sl-surface)', border: '1px solid color-mix(in srgb, var(--sl-text) 7%, transparent)', borderRadius: 8, padding: '0 10px', color: 'var(--sl-text-2)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 }}>
          <ChevronLeft size={14} /> Back
        </button>
      )}
      <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--sl-text)', margin: 0, letterSpacing: '-0.02em', flex: '1 1 auto', minWidth: 0 }}>{title}</h1>
      {meta}
    </div>
  )
}
