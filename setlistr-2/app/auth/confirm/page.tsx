'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { sanitizeNextPath } from '@/lib/nextPathGuard'

// Public email-confirmation callback — NOT gated by middleware.ts (its
// matcher is exactly ['/', '/app/:path*', '/auth/login', '/beta']; any
// other /auth/* path, this one included, already runs with no session
// required, same as app/auth/reset-password already does). This exists
// because a confirmation link isn't just a page visit: Supabase must hand
// back either a token_hash+type pair or a PKCE code, and one of those has
// to be explicitly exchanged for a real session — landing directly on a
// protected page and hoping a session already exists (what the previous
// version of this fix did) does not work.
//
// Deliberately handles BOTH mechanisms, not an assumption that this
// project's "Confirm signup" template matches what
// app/auth/reset-password/page.tsx already does for password recovery —
// that page's own comment documents a template migration specific to
// recovery emails; the signup template's actual configuration is a
// Supabase-dashboard setting this repository cannot see. Handling both is
// the correct response to that genuine uncertainty, not an assumption
// either way. A third, narrower case — neither param present — falls back
// to a plain getUser() check, covering the implicit/fragment flow where
// the Supabase client's own detectSessionInUrl already established a
// session from the URL fragment before this effect even runs.
//
// Supabase's own token_hash/code are never conflated with Setlistr's own
// invite token: this page never reads or touches `?token=` (that belongs
// solely to app/app/accept-invite/page.tsx, reached only via `next` below,
// as an opaque pass-through this page never interprets). This page also
// never calls /api/team/accept itself — establishing a session is not the
// same as accepting an invitation, and only accept-invite's own explicit
// button click does that, after its own fresh server-side revalidation of
// the intended recipient and revocation.

const C = {
  bg: '#0a0908', card: '#141210',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', red: '#f87171', redDim: 'rgba(248,113,113,0.08)',
}

type Status = 'checking' | 'invalid'

const VALID_OTP_TYPES = new Set(['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'])

function ConfirmInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<Status>('checking')
  const resolvedRef = useRef(false)

  useEffect(() => {
    const supabase = createClient()
    const tokenHash = searchParams.get('token_hash')
    const code = searchParams.get('code')
    const rawType = searchParams.get('type')
    const type = rawType && VALID_OTP_TYPES.has(rawType) ? (rawType as 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email') : 'signup'
    // Re-validated here, not just trusted from how login.tsx constructed
    // it — this page is reachable by any URL a browser is pointed at, not
    // only the one login.tsx builds.
    const next = sanitizeNextPath(searchParams.get('next')) || '/app/dashboard'

    function resolve(success: boolean) {
      if (resolvedRef.current) return
      resolvedRef.current = true
      if (success) {
        router.replace(next)
      } else {
        setStatus('invalid')
      }
    }

    async function verifyTokenHash(hash: string) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: hash, type })
      resolve(!error)
    }

    async function verifyCode(c: string) {
      const { error } = await supabase.auth.exchangeCodeForSession(c)
      resolve(!error)
    }

    async function checkExistingSession() {
      // Covers the implicit/fragment flow: the Supabase browser client
      // auto-detects an access/refresh token in the URL fragment
      // (detectSessionInUrl, on by default) before this effect runs, so a
      // session may already exist with neither token_hash nor code present
      // in the query string at all.
      const { data: { user } } = await supabase.auth.getUser()
      resolve(!!user)
    }

    if (tokenHash) { verifyTokenHash(tokenHash); return }
    if (code) { verifyCode(code); return }
    checkExistingSession()
  }, [router, searchParams])

  if (status === 'checking') return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', border: `1.5px solid ${C.gold}`, animation: 'breathe 1.8s ease-in-out infinite' }} />
      <style>{`@keyframes breathe{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.2);opacity:.8}}`}</style>
    </div>
  )

  // ── Clear, actionable recovery — never a silent redirect into a page
  // that will just look broken because no session actually exists. ───────
  return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' as const }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: '0 0 8px' }}>Confirmation link didn't work</h2>
        <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 20px', lineHeight: 1.5 }}>
          This link may have expired or already been used. If you were accepting a team invite, the original email still has a working link — or sign in directly below.
        </p>
        <div style={{ padding: '11px 14px', background: C.redDim, border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, marginBottom: 20 }}>
          <p style={{ fontSize: 13, color: C.red, margin: 0 }}>Confirmation failed</p>
        </div>
        <button onClick={() => router.push('/auth/login')}
          style={{ width: '100%', padding: '13px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
          Go to Sign In
        </button>
      </div>
    </div>
  )
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmInner />
    </Suspense>
  )
}
