// Shared controls (docs/ui-standard.md → Controls): the released Submit
// page's button, field and disclosure styles (app/app/submit/[id]/page.tsx,
// "Shared pieces"), values unchanged. The import screens use them; Submit
// still has its own copy until it adopts this module in a separate change.
import type React from 'react'

export const C = {
  bg: 'var(--sl-bg)', card: 'var(--sl-surface)',
  border: 'color-mix(in srgb, var(--sl-text) 7%, transparent)', borderGold: 'color-mix(in srgb, var(--sl-accent) 30%, transparent)',
  text: 'var(--sl-text)', secondary: 'var(--sl-text-2)', muted: 'var(--sl-text-3)',
  gold: 'var(--sl-accent)', goldDim: 'color-mix(in srgb, var(--sl-accent) 10%, transparent)',
  green: 'var(--sl-ok)', greenDim: 'color-mix(in srgb, var(--sl-ok) 8%, transparent)',
  red: 'var(--sl-danger)', redDim: 'color-mix(in srgb, var(--sl-danger) 8%, transparent)',
  amber: 'var(--sl-warn)', amberDim: 'color-mix(in srgb, var(--sl-warn) 8%, transparent)',
}
export const MONO = '"DM Mono", monospace'

export const primaryBtn: React.CSSProperties = { width: '100%', minHeight: 52, padding: '0 18px', background: C.gold, border: 'none', borderRadius: 14, color: 'var(--sl-on-accent)', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', textAlign: 'center' }
export const secondaryBtn: React.CSSProperties = { width: '100%', minHeight: 48, padding: '0 16px', background: 'transparent', border: '1px solid color-mix(in srgb, var(--sl-accent) 45%, transparent)', borderRadius: 14, color: 'var(--sl-gold-text)', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', textAlign: 'center' }
export const textAction: React.CSSProperties = { minHeight: 44, padding: '0 4px', background: 'none', border: 'none', color: 'var(--sl-gold-text)', fontSize: 14.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }
export const hintStyle: React.CSSProperties = { fontSize: 13.5, color: C.muted, margin: '5px 0 0', lineHeight: 1.45 }
export const inputStyle = (filled: boolean): React.CSSProperties => ({
  width: '100%', minHeight: 48, background: 'var(--sl-input-bg, var(--sl-bg))', border: `1px solid ${filled ? 'var(--sl-input-line-active)' : 'var(--sl-input-line)'}`,
  borderRadius: 12, padding: '0 14px', color: C.text, fontSize: 16, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
})
export const labelStyle: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: C.text, display: 'block', marginBottom: 6 }
// Submit's disclosure (<details className="sb-more">) and focus rules.
export const CONTROL_CSS = `
  .sb-btn:focus-visible, .sb-more > summary:focus-visible { outline: 2px solid var(--sl-accent); outline-offset: -2px; }
  .sb-more > summary { list-style: none; cursor: pointer; } .sb-more > summary::-webkit-details-marker { display: none; }
  .sb-more[open] > summary .sb-chev { transform: rotate(180deg); }
  .sb-field input:focus, .sb-field select:focus { border-color: var(--sl-input-line-active) !important; outline: none; }
`
