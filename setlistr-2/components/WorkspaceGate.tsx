'use client'
import { useActingAs, type WorkspaceState } from '@/components/ActingAsProvider'

// Central blocking surface for resolving/verification_failed/unauthorized.
// Every workspace-scoped page renders this instead of its own content when
// useActingAs().isBlocked is true — no page independently decides how to
// react to a failed/pending workspace verification, and none of them ever
// reach their own data-fetching code in that window. Deliberately excludes
// app/app/live/[id]/page.tsx (protected capture code, untouched) — that
// page keeps reading actingAsArtistId directly exactly as it always has.
const C = {
  bg: '#0a0908', card: '#141210', border: 'rgba(255,255,255,0.07)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', red: '#f87171',
}

function copyFor(state: WorkspaceState): { title: string; body: string } {
  if (state.status === 'unauthorized') {
    return {
      title: 'Access ended',
      body: 'You no longer have access to this artist’s workspace. This may be because the delegation was removed.',
    }
  }
  if (state.status === 'verification_failed') {
    return {
      title: 'Couldn’t verify your access',
      body: 'We couldn’t confirm your workspace access right now. Nothing has been loaded.',
    }
  }
  return { title: 'Loading your workspace', body: '' }
}

export function WorkspaceGate() {
  const { state, retry, returnToOwnWorkspace } = useActingAs()

  if (state.status === 'resolving') {
    return (
      <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', border: `1.5px solid ${C.gold}`, animation: 'gateBreathe 1.8s ease-in-out infinite' }} />
          <span style={{ color: C.muted, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase' as const }}>Loading</span>
        </div>
        <style>{`@keyframes gateBreathe{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.2);opacity:.8}}`}</style>
      </div>
    )
  }

  const { title, body } = copyFor(state)
  return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 20px', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 380, background: '#141210', border: `1px solid ${C.border}`, borderRadius: 16, padding: '24px 22px', textAlign: 'center' }}>
        <p style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '0 0 8px' }}>{title}</p>
        <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 20px', lineHeight: 1.5 }}>{body}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {state.status === 'verification_failed' && (
            <button onClick={retry}
              style={{ width: '100%', padding: '13px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 14, fontWeight: 800, letterSpacing: '0.04em', cursor: 'pointer', fontFamily: 'inherit' }}>
              Retry
            </button>
          )}
          <button onClick={returnToOwnWorkspace}
            style={{ width: '100%', padding: '13px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 10, color: C.secondary, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Return to my workspace
          </button>
        </div>
      </div>
    </div>
  )
}
