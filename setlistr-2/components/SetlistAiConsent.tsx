'use client'
import { createRoot } from 'react-dom/client'
import { hasAiSetlistConsent, needsAiConsent, setAiSetlistConsent } from '@/lib/aiConsent'

// Asks before a setlist photo or PDF is sent to Anthropic (see lib/aiConsent.ts).
// Resolves true when the file may be sent: it needs no permission (plain text),
// permission was given earlier on this device, or the person allows it now.
// Resolves false when they decline; nothing is sent and the caller keeps
// manual entry available.
export async function ensureSetlistAiConsent(userId: string | null | undefined, file: { type: string; name?: string }): Promise<boolean> {
  if (!needsAiConsent(file)) return true
  if (!userId) return false
  if (hasAiSetlistConsent(userId)) return true
  const allowed = await askSetlistAiConsent()
  if (allowed) setAiSetlistConsent(userId, true)
  return allowed
}

function askSetlistAiConsent(): Promise<boolean> {
  return new Promise(resolve => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const finish = (allowed: boolean) => {
      root.unmount()
      host.remove()
      resolve(allowed)
    }
    root.render(<ConsentSheet onAllow={() => finish(true)} onDecline={() => finish(false)} />)
  })
}

function ConsentSheet({ onAllow, onDecline }: { onAllow: () => void; onDecline: () => void }) {
  const text = 'var(--sl-text, #f0ece3)'
  const secondary = 'var(--sl-text-2, #b8a888)'
  const muted = 'var(--sl-text-3, #8a7a68)'
  const gold = 'var(--sl-accent, #c9a84c)'
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="setlist-ai-consent-title"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 440, background: 'var(--sl-surface, #141210)', border: '1px solid color-mix(in srgb, var(--sl-text, #f0ece3) 8%, transparent)', borderBottom: 'none', borderRadius: '20px 20px 0 0', padding: '24px 20px calc(28px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p id="setlist-ai-consent-title" style={{ fontSize: 17, fontWeight: 800, color: text, margin: 0 }}>Send this setlist to AI to read it?</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 14, color: secondary, margin: 0, lineHeight: 1.55 }}>
            To read the song titles, Setlistr sends this photo or PDF to <strong style={{ color: text }}>Anthropic</strong>, which runs the Claude AI model.
          </p>
          <p style={{ fontSize: 14, color: secondary, margin: 0, lineHeight: 1.55 }}>
            Only the file is sent, not your name, email or account details. Anthropic uses it to return the song list, deletes it within 30 days under its standard terms, and doesn&apos;t use it to train its models.
          </p>
          <p style={{ fontSize: 14, color: secondary, margin: 0, lineHeight: 1.55 }}>
            Setlistr also keeps a copy of the file with your show.
          </p>
        </div>
        <button onClick={onAllow}
          style={{ width: '100%', minHeight: 48, padding: '14px', background: gold, border: 'none', borderRadius: 12, color: 'var(--sl-on-accent, #0a0908)', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
          Allow
        </button>
        <button onClick={onDecline}
          style={{ width: '100%', minHeight: 48, padding: '14px', background: 'transparent', border: '1px solid color-mix(in srgb, var(--sl-text, #f0ece3) 12%, transparent)', borderRadius: 12, color: secondary, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          Not now, I&apos;ll type the songs
        </button>
        <p style={{ fontSize: 12, color: muted, margin: 0, textAlign: 'center', lineHeight: 1.5 }}>
          You can withdraw this anytime in Settings.
        </p>
      </div>
    </div>
  )
}
