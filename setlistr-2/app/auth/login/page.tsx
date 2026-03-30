'use client'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'

const C = {
  bg: '#0a0908', card: '#141210', cardHover: '#181614',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  red: '#f87171', redDim: 'rgba(248,113,113,0.08)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.08)',
}

// Step flow:
//   'email'    — just the email field
//   'signin'   — email recognized, show password
//   'signup'   — email in beta_invites but no account, create password
//   'waitlist' — email not invited, show waitlist form

type Step = 'email' | 'signin' | 'signup' | 'waitlist'

function LoginPageInner() {
  const searchParams = useSearchParams()
  const fromStart    = searchParams.get('from') === 'start'

  const [step, setStep]         = useState<Step>('email')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  // Waitlist fields
  const [waitlistName, setWaitlistName]   = useState('')
  const [waitlistNote, setWaitlistNote]   = useState('')
  const [waitlistDone, setWaitlistDone]   = useState(false)

  const inputStyle = (val: string): React.CSSProperties => ({
    width: '100%', boxSizing: 'border-box' as const,
    background: C.input,
    border: `1px solid ${val.trim() ? C.borderGold : C.border}`,
    borderRadius: 10, padding: '13px 14px',
    color: C.text, fontSize: 15, fontFamily: 'inherit',
    transition: 'border-color 0.15s ease', outline: 'none',
  })

  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.13em',
    textTransform: 'uppercase', color: C.muted,
    display: 'block', marginBottom: 6,
  }

  // ── Step 1: Check email ────────────────────────────────────────────────────
  async function handleEmailContinue() {
    if (!email.trim()) return
    setLoading(true)
    setError('')

    const supabase = createClient()

    // Check if email is in beta_invites
    const { data: invite } = await supabase
      .from('beta_invites')
      .select('id, accepted_at')
      .eq('email', email.trim().toLowerCase())
      .single()

    if (!invite) {
      // Not invited — send to waitlist
      setStep('waitlist')
      setLoading(false)
      return
    }

    // Try to determine if they have an account by attempting a dummy sign in
    // If error is "Invalid login credentials" → has account but wrong password shown
    // We'll just always show the appropriate form based on accepted_at
    if (invite.accepted_at) {
      // Has previously signed in — returning user
      setStep('signin')
    } else {
      // Invited but never signed in — new user, create account
      setStep('signup')
    }

    setLoading(false)
  }

  // ── Step 2A: Sign in ───────────────────────────────────────────────────────
  async function handleSignIn() {
    if (!email.trim() || !password.trim()) return
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      // If credentials invalid, maybe they haven't set up yet — offer signup
      if (error.message.includes('Invalid')) {
        setError('Wrong password. If you haven\'t set up your account yet, go back and try again.')
      } else {
        setError(error.message)
      }
      setLoading(false)
      return
    }
    window.location.href = '/app/dashboard'
  }

  // ── Step 2B: Sign up ───────────────────────────────────────────────────────
  async function handleSignUp() {
    if (!email.trim() || !password.trim()) return
    if (password !== confirm) {
      setError('Passwords don\'t match')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/app/dashboard`,
      },
    })
    if (error) {
      // If user already exists, switch to sign in
      if (error.message.includes('already registered') || error.message.includes('already been registered')) {
        setStep('signin')
        setError('Account already exists — sign in instead')
      } else {
        setError(error.message)
      }
      setLoading(false)
      return
    }
    // Success — sign them in directly
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (signInError) {
      // Supabase may require email confirmation depending on settings
      setSuccess('Account created! Check your email to confirm, then sign in.')
      setStep('signin')
    } else {
      window.location.href = '/app/dashboard'
    }
    setLoading(false)
  }

  // ── Waitlist ───────────────────────────────────────────────────────────────
  async function handleWaitlist() {
    if (!email.trim()) return
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.from('waitlist').insert({
      email: email.trim(),
      name: waitlistName.trim() || null,
      note: waitlistNote.trim() || null,
    })
    if (error && error.code !== '23505') {
      setError(error.message)
      setLoading(false)
      return
    }
    setWaitlistDone(true)
    setLoading(false)
  }

  const Spinner = () => (
    <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #0a090840', borderTopColor: '#0a0908', animation: 'spin 0.7s linear infinite' }} />
  )

  const BackButton = ({ label = '← Back' }: { label?: string }) => (
    <button
      onClick={() => { setStep('email'); setError(''); setPassword(''); setConfirm('') }}
      style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', letterSpacing: '0.04em', fontFamily: 'inherit', padding: '10px 0', width: '100%', textAlign: 'center' }}>
      {label}
    </button>
  )

  return (
    <div style={{
      minHeight: '100svh', background: C.bg,
      fontFamily: '"DM Sans", system-ui, sans-serif',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px 20px',
    }}>
      {/* Ambient glow */}
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '55vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.07) 0%, transparent 65%)' }} />

      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>

        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 36, animation: 'fadeUp 0.3s ease' }}>
          <Image src="/logo-white.png" alt="Setlistr" width={200} height={52} priority style={{ marginBottom: 10 }} />
          <p style={{ fontSize: 10, color: C.muted, letterSpacing: '0.25em', textTransform: 'uppercase', margin: 0 }}>
            Live Performance Registry
          </p>
        </div>

        {/* ── Step: Email ── */}
        {step === 'email' && (
          <div style={{ animation: 'fadeUp 0.3s ease' }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '28px 24px', marginBottom: 12 }}>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
                {fromStart ? 'Save your setlist' : 'Get started'}
              </h1>
              <p style={{ fontSize: 13, color: C.muted, margin: '0 0 24px' }}>
                {fromStart ? 'Enter your email to save and track your royalties' : 'Enter your email to continue'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input
                    type="email" value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleEmailContinue()}
                    placeholder="you@example.com"
                    autoFocus autoComplete="email"
                    style={inputStyle(email)}
                    onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.4)')}
                    onBlur={e => (e.target.style.borderColor = email.trim() ? C.borderGold : C.border)}
                  />
                </div>
                {error && (
                  <div style={{ background: C.redDim, border: `1px solid rgba(248,113,113,0.2)`, borderRadius: 10, padding: '11px 14px' }}>
                    <p style={{ fontSize: 13, color: C.red, margin: 0 }}>{error}</p>
                  </div>
                )}
                <button
                  onClick={handleEmailContinue}
                  disabled={loading || !email.trim()}
                  style={{ width: '100%', padding: '14px', background: email.trim() ? C.gold : C.muted, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 14, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: loading || !email.trim() ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
                  {loading ? <><Spinner />Checking...</> : 'Continue →'}
                </button>
              </div>
            </div>
            <p style={{ textAlign: 'center', fontSize: 10, color: C.muted, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.5 }}>
              Private Beta · Invite Only
            </p>
          </div>
        )}

        {/* ── Step: Sign In ── */}
        {step === 'signin' && (
          <div style={{ animation: 'fadeUp 0.3s ease' }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '28px 24px', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10, padding: '10px 14px' }}>
                <span style={{ fontSize: 13, color: C.gold }}>✓</span>
                <p style={{ fontSize: 13, color: C.gold, margin: 0, fontWeight: 600 }}>{email}</p>
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Welcome back</h1>
              <p style={{ fontSize: 13, color: C.muted, margin: '0 0 24px' }}>Enter your password to continue</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Password</label>
                  <input
                    type="password" value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSignIn()}
                    placeholder="••••••••"
                    autoFocus autoComplete="current-password"
                    style={inputStyle(password)}
                    onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.4)')}
                    onBlur={e => (e.target.style.borderColor = password.trim() ? C.borderGold : C.border)}
                  />
                </div>
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
                  onClick={handleSignIn}
                  disabled={loading || !password.trim()}
                  style={{ width: '100%', padding: '14px', background: password.trim() ? C.gold : C.muted, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 14, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: loading || !password.trim() ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
                  {loading ? <><Spinner />Signing in...</> : 'Sign In'}
                </button>
              </div>
            </div>
            <BackButton />
          </div>
        )}

        {/* ── Step: Sign Up ── */}
        {step === 'signup' && (
          <div style={{ animation: 'fadeUp 0.3s ease' }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '28px 24px', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, background: C.greenDim, border: `1px solid rgba(74,222,128,0.2)`, borderRadius: 10, padding: '10px 14px' }}>
                <span style={{ fontSize: 13, color: C.green }}>✓</span>
                <p style={{ fontSize: 13, color: C.green, margin: 0, fontWeight: 600 }}>You're on the list — {email}</p>
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Create your account</h1>
              <p style={{ fontSize: 13, color: C.muted, margin: '0 0 24px' }}>Choose a password to get started</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Password</label>
                  <input
                    type="password" value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSignUp()}
                    placeholder="At least 6 characters"
                    autoFocus autoComplete="new-password"
                    style={inputStyle(password)}
                    onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.4)')}
                    onBlur={e => (e.target.style.borderColor = password.trim() ? C.borderGold : C.border)}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Confirm Password</label>
                  <input
                    type="password" value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSignUp()}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    style={{ ...inputStyle(confirm), borderColor: confirm && confirm !== password ? 'rgba(248,113,113,0.4)' : confirm && confirm === password ? 'rgba(74,222,128,0.4)' : confirm.trim() ? C.borderGold : C.border }}
                    onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.4)')}
                    onBlur={e => (e.target.style.borderColor = confirm && confirm !== password ? 'rgba(248,113,113,0.4)' : confirm && confirm === password ? 'rgba(74,222,128,0.4)' : C.border)}
                  />
                  {confirm && password && confirm !== password && (
                    <p style={{ fontSize: 11, color: C.red, margin: '5px 0 0' }}>Passwords don't match</p>
                  )}
                  {confirm && password && confirm === password && (
                    <p style={{ fontSize: 11, color: C.green, margin: '5px 0 0' }}>✓ Passwords match</p>
                  )}
                </div>
                {error && (
                  <div style={{ background: C.redDim, border: `1px solid rgba(248,113,113,0.2)`, borderRadius: 10, padding: '11px 14px' }}>
                    <p style={{ fontSize: 13, color: C.red, margin: 0 }}>{error}</p>
                  </div>
                )}
                <button
                  onClick={handleSignUp}
                  disabled={loading || !password.trim() || !confirm.trim() || password !== confirm}
                  style={{ width: '100%', padding: '14px', background: password && confirm && password === confirm ? C.gold : C.muted, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 14, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: loading || !password.trim() || password !== confirm ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
                  {loading ? <><Spinner />Creating account...</> : 'Create Account'}
                </button>
              </div>
            </div>
            <BackButton />
          </div>
        )}

        {/* ── Step: Waitlist ── */}
        {step === 'waitlist' && (
          <div style={{ animation: 'fadeUp 0.3s ease' }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '28px 24px', marginBottom: 12 }}>
              {waitlistDone ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 18px', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🎸</div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.02em' }}>You're on the list!</h2>
                  <p style={{ fontSize: 13, color: C.secondary, margin: 0, lineHeight: 1.6 }}>
                    We'll reach out to <span style={{ color: C.gold }}>{email}</span> when we open access.
                  </p>
                </div>
              ) : (
                <>
                  <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Request access</h1>
                  <p style={{ fontSize: 13, color: C.muted, margin: '0 0 24px', lineHeight: 1.5 }}>
                    Setlistr is invite-only right now. Leave your info and we'll reach out when we open up.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10, padding: '10px 14px' }}>
                      <p style={{ fontSize: 13, color: C.gold, margin: 0, fontWeight: 600 }}>{email}</p>
                    </div>
                    <div>
                      <label style={labelStyle}>Your Name</label>
                      <input type="text" value={waitlistName} onChange={e => setWaitlistName(e.target.value)}
                        placeholder="e.g. Jane Smith" style={inputStyle(waitlistName)}
                        onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.4)')}
                        onBlur={e => (e.target.style.borderColor = waitlistName.trim() ? C.borderGold : C.border)} />
                    </div>
                    <div>
                      <label style={labelStyle}>Tell us about your gigs <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
                      <textarea value={waitlistNote} onChange={e => setWaitlistNote(e.target.value)}
                        placeholder="e.g. Singer-songwriter, playing 3 nights a week in Nashville..."
                        rows={3}
                        style={{ ...inputStyle(waitlistNote), resize: 'none', lineHeight: 1.5 } as React.CSSProperties}
                        onFocus={e => (e.target as HTMLTextAreaElement).style.borderColor = 'rgba(201,168,76,0.4)'}
                        onBlur={e => (e.target as HTMLTextAreaElement).style.borderColor = waitlistNote.trim() ? C.borderGold : C.border} />
                    </div>
                    {error && (
                      <div style={{ background: C.redDim, border: `1px solid rgba(248,113,113,0.2)`, borderRadius: 10, padding: '11px 14px' }}>
                        <p style={{ fontSize: 13, color: C.red, margin: 0 }}>{error}</p>
                      </div>
                    )}
                    <button onClick={handleWaitlist} disabled={loading}
                      style={{ width: '100%', padding: '14px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 14, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
                      {loading ? <><Spinner />Submitting...</> : 'Request Access'}
                    </button>
                  </div>
                </>
              )}
            </div>
            {!waitlistDone && <BackButton label="← Use a different email" />}
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
