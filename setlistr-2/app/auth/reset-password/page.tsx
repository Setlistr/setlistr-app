'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'

const C = {
  bg: '#0a0908', card: '#141210',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  red: '#f87171', redDim: 'rgba(248,113,113,0.08)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.08)',
}

type Status = 'checking' | 'ready' | 'invalid' | 'success'

function ResetPasswordInner() {
  const searchParams = useSearchParams()

  const [status, setStatus]         = useState<Status>('checking')
  const [password, setPassword]     = useState('')
  const [confirm, setConfirm]       = useState('')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  const resolvedRef = useRef(false)

  useEffect(() => {
    const supabase = createClient()
    const tokenHash = searchParams.get('token_hash')
    const code      = searchParams.get('code')

    async function verifyTokenHash(hash: string) {
      // type is the literal 'recovery' — this page only ever handles
      // password recovery, and EmailOtpType is a strict union.
      const { error } = await supabase.auth.verifyOtp({ token_hash: hash, type: 'recovery' })
      if (resolvedRef.current) return
      resolvedRef.current = true
      setStatus(error ? 'invalid' : 'ready')
    }

    async function tryPkce(c: string) {
      const { error } = await supabase.auth.exchangeCodeForSession(c)
      if (resolvedRef.current) return
      resolvedRef.current = true
      setStatus(error ? 'invalid' : 'ready')
    }

    if (tokenHash) {
      verifyTokenHash(tokenHash)
      return
    }

    if (code) {
      // Temporary — covers reset links already in flight before the
      // Supabase email template switches to token_hash.
      tryPkce(code)
      return
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && !resolvedRef.current) {
        resolvedRef.current = true
        setStatus('ready')
      }
    })

    const fallback = setTimeout(() => {
      if (!resolvedRef.current) {
        resolvedRef.current = true
        setStatus('invalid')
      }
    }, 4000)

    return () => {
      clearTimeout(fallback)
      listener.subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSetPassword(e?: React.FormEvent) {
    e?.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError("Passwords don't match"); return }
    setSaving(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setStatus('success')
    setTimeout(() => { window.location.href = '/app/dashboard' }, 1800)
  }

  const inp = (val: string): React.CSSProperties => ({
    width: '100%', boxSizing: 'border-box' as const,
    background: C.input,
    border: `1px solid ${val.trim() ? C.borderGold : C.border}`,
    borderRadius: 10, padding: '12px 14px',
    color: C.text, fontSize: 14, fontFamily: 'inherit',
    transition: 'border-color 0.15s ease', outline: 'none',
  })

  const lbl: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.13em',
    textTransform: 'uppercase', color: C.muted,
    display: 'block', marginBottom: 6,
  }

  const Spinner = ({ dark }: { dark?: boolean }) => (
    <div style={{ width: 13, height: 13, borderRadius: '50%', border: dark ? '2px solid #0a090840' : `2px solid ${C.border}`, borderTopColor: dark ? '#0a0908' : C.gold, animation: 'spin 0.7s linear infinite' }} />
  )

  const disabled = saving || password.length < 8 || password !== confirm

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>

      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '55vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.07) 0%, transparent 65%)' }} />

      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32, animation: 'fadeUp 0.3s ease' }}>
          <Image src="/logo-white.png" alt="Setlistr" width={200} height={52} priority style={{ marginBottom: 10 }} />
          <p style={{ fontSize: 10, color: C.muted, letterSpacing: '0.25em', textTransform: 'uppercase', margin: 0 }}>Your verified live career starts here.</p>
        </div>

        <div style={{ animation: 'fadeUp 0.35s ease' }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '28px 24px', marginBottom: 12 }}>

            {status === 'checking' && (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                  <Spinner />
                </div>
                <p style={{ fontSize: 13, color: C.secondary, margin: 0 }}>Verifying your reset link...</p>
              </div>
            )}

            {status === 'invalid' && (
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Link expired or invalid</h2>
                <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 24px', lineHeight: 1.6 }}>
                  This password reset link is no longer valid. Request a new one to continue.
                </p>
                <a href="/auth/login" style={{ display: 'inline-block', width: '100%', boxSizing: 'border-box', padding: '13px', background: C.gold, borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', textDecoration: 'none' }}>
                  Back to Sign In
                </a>
              </div>
            )}

            {status === 'success' && (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 18px', background: C.greenDim, border: `1px solid rgba(74,222,128,0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
                <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Password updated</h2>
                <p style={{ fontSize: 13, color: C.secondary, margin: 0, lineHeight: 1.6 }}>Taking you to your dashboard...</p>
              </div>
            )}

            {status === 'ready' && (
              <>
                <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Set a new password</h1>
                <p style={{ fontSize: 13, color: C.muted, margin: '0 0 24px', lineHeight: 1.5 }}>Choose a new password for your account.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={lbl}>New Password</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSetPassword()}
                      placeholder="At least 8 characters" autoComplete="new-password"
                      style={inp(password)}
                      onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.4)')}
                      onBlur={e => (e.target.style.borderColor = password.trim() ? C.borderGold : C.border)} />
                  </div>

                  <div>
                    <label style={lbl}>Confirm Password</label>
                    <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSetPassword()}
                      placeholder="••••••••" autoComplete="new-password"
                      style={{ ...inp(confirm), borderColor: confirm && confirm !== password ? 'rgba(248,113,113,0.4)' : confirm && confirm === password ? 'rgba(74,222,128,0.4)' : confirm.trim() ? C.borderGold : C.border }}
                      onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.4)')}
                      onBlur={e => (e.target.style.borderColor = confirm && confirm !== password ? 'rgba(248,113,113,0.4)' : confirm && confirm === password ? 'rgba(74,222,128,0.4)' : C.border)} />
                    {confirm && password && confirm === password && (
                      <p style={{ fontSize: 11, color: C.green, margin: '4px 0 0' }}>✓ Passwords match</p>
                    )}
                    {confirm && password && confirm !== password && (
                      <p style={{ fontSize: 11, color: C.red, margin: '4px 0 0' }}>Passwords don&apos;t match</p>
                    )}
                  </div>

                  {error && (
                    <div style={{ background: C.redDim, border: `1px solid rgba(248,113,113,0.2)`, borderRadius: 10, padding: '11px 14px' }}>
                      <p style={{ fontSize: 13, color: C.red, margin: 0 }}>{error}</p>
                    </div>
                  )}

                  <button onClick={handleSetPassword} disabled={disabled}
                    style={{ width: '100%', padding: '13px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, transition: 'opacity 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', marginTop: 4 }}>
                    {saving ? <><Spinner dark />Updating...</> : 'Update Password'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input::placeholder { color: #6a6050; }
      `}</style>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  )
}
