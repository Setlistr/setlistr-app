'use client'
import { useState, Suspense } from 'react'
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

type Mode = 'signin' | 'signup'

function LoginPageInner() {
  const searchParams = useSearchParams()
  const fromStart    = searchParams.get('from') === 'start'

  const [mode, setMode]         = useState<Mode>('signin')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  const [showWaitlist, setShowWaitlist]       = useState(false)
  const [waitlistName, setWaitlistName]       = useState('')
  const [waitlistNote, setWaitlistNote]       = useState('')
  const [waitlistLoading, setWaitlistLoading] = useState(false)
  const [waitlistDone, setWaitlistDone]       = useState(false)
  const [waitlistError, setWaitlistError]     = useState('')

  function switchMode(m: Mode) {
    setMode(m)
    setError('')
    setSuccess('')
    setPassword('')
    setConfirm('')
  }

  async function handleSignIn(e?: React.FormEvent) {
    e?.preventDefault()
    if (!email.trim() || !password.trim()) return
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    window.location.href = '/app/dashboard'
  }

  async function handleSignUp(e?: React.FormEvent) {
    e?.preventDefault()
    if (!email.trim() || !password.trim()) return
    if (password !== confirm) { setError("Passwords don't match"); return }
    if (password.length < 6)  { setError('Password must be at least 6 characters'); return }
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${window.location.origin}/app/dashboard` },
    })
    if (error) {
      if (error.message.toLowerCase().includes('already')) {
        setError('An account with this email already exists. Sign in instead.')
        switchMode('signin')
      } else {
        setError(error.message)
      }
      setLoading(false)
      return
    }
    // Try to sign in immediately
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (signInErr) {
      setSuccess('Account created! Check your email to confirm, then sign in.')
      switchMode('signin')
    } else {
      window.location.href = '/app/dashboard'
    }
    setLoading(false)
  }

  async function handleWaitlist(e?: React.FormEvent) {
    e?.preventDefault()
    if (!email.trim()) return
    setWaitlistLoading(true)
    setWaitlistError('')
    const supabase = createClient()
    const { error } = await supabase.from('waitlist').insert({
      email: email.trim(),
      name: waitlistName.trim() || null,
      note: waitlistNote.trim() || null,
    })
    if (error) {
      setWaitlistError(error.code === '23505' ? "You're already on the list!" : error.message)
      setWaitlistLoading(false)
      return
    }
    setWaitlistDone(true)
    setWaitlistLoading(false)
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

  const Spinner = () => (
    <div style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid #0a090840', borderTopColor: '#0a0908', animation: 'spin 0.7s linear infinite' }} />
  )

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>

      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '55vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.07) 0%, transparent 65%)' }} />

      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>

        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32, animation: 'fadeUp 0.3s ease' }}>
          <Image src="/logo-white.png" alt="Setlistr" width={200} height={52} priority style={{ marginBottom: 10 }} />
          <p style={{ fontSize: 10, color: C.muted, letterSpacing: '0.25em', textTransform: 'uppercase', margin: 0 }}>Live Performance Registry</p>
        </div>

        {!showWaitlist ? (
          <div style={{ animation: 'fadeUp 0.35s ease' }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '24px', marginBottom: 12 }}>

              {fromStart && (
                <div style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10, padding: '10px 14px', marginBottom: 20 }}>
                  <p style={{ fontSize: 12, color: C.gold, margin: 0, fontWeight: 600, lineHeight: 1.5 }}>💾 Your setlist is ready — sign in or create an account to save it.</p>
                </div>
              )}

              {/* Sign in / Create account toggle */}
              <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 10, padding: 4, marginBottom: 24 }}>
                {(['signin', 'signup'] as Mode[]).map(m => (
                  <button key={m} onClick={() => switchMode(m)}
                    style={{ flex: 1, padding: '8px', border: 'none', borderRadius: 7, background: mode === m ? C.goldDim : 'transparent', color: mode === m ? C.gold : C.muted, fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', cursor: 'pointer', transition: 'all 0.15s ease', fontFamily: 'inherit' }}>
                    {m === 'signin' ? 'Sign In' : 'Create Account'}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={lbl}>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (mode === 'signin' ? handleSignIn() : handleSignUp())}
                    placeholder="you@example.com" autoComplete="email"
                    style={inp(email)}
                    onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.4)')}
                    onBlur={e => (e.target.style.borderColor = email.trim() ? C.borderGold : C.border)} />
                </div>

                <div>
                  <label style={lbl}>Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && mode === 'signin' && handleSignIn()}
                    placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    style={inp(password)}
                    onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.4)')}
                    onBlur={e => (e.target.style.borderColor = password.trim() ? C.borderGold : C.border)} />
                </div>

                {mode === 'signup' && (
                  <div>
                    <label style={lbl}>Confirm Password</label>
                    <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSignUp()}
                      placeholder="••••••••" autoComplete="new-password"
                      style={{ ...inp(confirm), borderColor: confirm && confirm !== password ? 'rgba(248,113,113,0.4)' : confirm && confirm === password ? 'rgba(74,222,128,0.4)' : confirm.trim() ? C.borderGold : C.border }}
                      onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.4)')}
                      onBlur={e => (e.target.style.borderColor = confirm && confirm !== password ? 'rgba(248,113,113,0.4)' : confirm && confirm === password ? 'rgba(74,222,128,0.4)' : C.border)} />
                    {confirm && password && confirm === password && (
                      <p style={{ fontSize: 11, color: C.green, margin: '4px 0 0' }}>✓ Passwords match</p>
                    )}
                    {confirm && password && confirm !== password && (
                      <p style={{ fontSize: 11, color: C.red, margin: '4px 0 0' }}>Passwords don't match</p>
                    )}
                  </div>
                )}

                {error && (
                  <div style={{ background: C.redDim, border: `1px solid rgba(248,113,113,0.2)`, borderRadius: 10, padding: '11px 14px' }}>
                    <p style={{ fontSize: 13, color: C.red, margin: 0 }}>{error}</p>
                  </div>
                )}

                {success && (
                  <div style={{ background: C.greenDim, border: `1px solid rgba(74,222,128,0.2)`, borderRadius: 10, padding: '11px 14px' }}>
                    <p style={{ fontSize: 13, color: C.green, margin: 0 }}>{success}</p>
                  </div>
                )}

                <button
                  onClick={mode === 'signin' ? handleSignIn : handleSignUp}
                  disabled={loading || !email.trim() || !password.trim() || (mode === 'signup' && (!confirm.trim() || password !== confirm))}
                  style={{ width: '100%', padding: '13px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading || !email.trim() || !password.trim() ? 0.6 : 1, transition: 'opacity 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', marginTop: 4 }}>
                  {loading ? <><Spinner />{mode === 'signin' ? 'Signing in...' : 'Creating account...'}</> : mode === 'signin' ? 'Sign In' : 'Create Account'}
                </button>
              </div>
            </div>

            {/* Waitlist CTA */}
            {!fromStart && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 24px', textAlign: 'center', marginBottom: 20 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.secondary, margin: '0 0 5px' }}>Not invited yet?</p>
                <p style={{ fontSize: 12, color: C.muted, margin: '0 0 16px', lineHeight: 1.5 }}>
                  Setlistr is in private beta. Join the waitlist and we'll reach out when we open access.
                </p>
                <button onClick={() => setShowWaitlist(true)}
                  style={{ width: '100%', padding: '11px', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10, color: C.gold, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s ease', fontFamily: 'inherit' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.15)')}
                  onMouseLeave={e => (e.currentTarget.style.background = C.goldDim)}>
                  Join the Waitlist
                </button>
              </div>
            )}

            <p style={{ textAlign: 'center', fontSize: 10, color: C.muted, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.5 }}>
              {fromStart ? 'Free forever · No credit card' : 'Private Beta · Invite Only'}
            </p>
          </div>

        ) : (
          <div style={{ animation: 'fadeUp 0.35s ease' }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '28px 24px', marginBottom: 12 }}>
              {waitlistDone ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 18px', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🎸</div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.02em' }}>You're on the list!</h2>
                  <p style={{ fontSize: 13, color: C.secondary, margin: 0, lineHeight: 1.6 }}>
                    We'll reach out when we open access. Keep playing shows.
                  </p>
                </div>
              ) : (
                <>
                  <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Join the Waitlist</h1>
                  <p style={{ fontSize: 13, color: C.muted, margin: '0 0 24px', lineHeight: 1.5 }}>We're onboarding artists in waves. Drop your info and we'll be in touch.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 6 }}>Your Name</label>
                      <input type="text" value={waitlistName} onChange={e => setWaitlistName(e.target.value)} placeholder="e.g. John Smith"
                        style={inp(waitlistName)}
                        onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.4)')}
                        onBlur={e => (e.target.style.borderColor = waitlistName.trim() ? C.borderGold : C.border)} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 6 }}>Email <span style={{ color: C.gold }}>*</span></label>
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
                        style={inp(email)}
                        onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.4)')}
                        onBlur={e => (e.target.style.borderColor = email.trim() ? C.borderGold : C.border)} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 6 }}>Tell us about your gigs <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
                      <textarea value={waitlistNote} onChange={e => setWaitlistNote(e.target.value)}
                        placeholder="e.g. Cover band, 3 nights a week in Nashville..." rows={3}
                        style={{ ...inp(waitlistNote), resize: 'none', lineHeight: 1.5 } as React.CSSProperties}
                        onFocus={e => (e.target as HTMLTextAreaElement).style.borderColor = 'rgba(201,168,76,0.4)'}
                        onBlur={e => (e.target as HTMLTextAreaElement).style.borderColor = waitlistNote.trim() ? C.borderGold : C.border} />
                    </div>
                    {waitlistError && (
                      <div style={{ background: C.redDim, border: `1px solid rgba(248,113,113,0.2)`, borderRadius: 10, padding: '11px 14px' }}>
                        <p style={{ fontSize: 13, color: C.red, margin: 0 }}>{waitlistError}</p>
                      </div>
                    )}
                    <button onClick={handleWaitlist} disabled={waitlistLoading || !email.trim()}
                      style={{ width: '100%', padding: '13px', background: email.trim() ? C.gold : C.muted, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: waitlistLoading || !email.trim() ? 'not-allowed' : 'pointer', opacity: waitlistLoading ? 0.7 : 1, transition: 'all 0.2s ease', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      {waitlistLoading ? <><Spinner />Submitting...</> : 'Request Access'}
                    </button>
                  </div>
                </>
              )}
            </div>
            {!waitlistDone && (
              <button onClick={() => setShowWaitlist(false)}
                style={{ width: '100%', background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', letterSpacing: '0.04em', fontFamily: 'inherit', padding: '10px', textAlign: 'center' }}>
                ← Back to sign in
              </button>
            )}
            <p style={{ textAlign: 'center', fontSize: 10, color: C.muted, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.5, marginTop: 16 }}>
              Private Beta · Invite Only
            </p>
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input::placeholder, textarea::placeholder { color: #6a6050; }
      `}</style>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  )
}
