'use client'
import { useState, Suspense } from 'react'
import { flushSync } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { submitWaitlistEntry } from '@/lib/waitlist'
import { sanitizeNextPath } from '@/lib/nextPathGuard'
import Link from 'next/link'
import { BrandLogo, BRAND_LOGO_APP_INSET } from '@/components/BrandLogo'

const WAITLIST_ROLE_OPTIONS = ['Artist', 'Songwriter', 'Manager', 'Publisher', 'Label', 'Booking agent', 'Other']
const WAITLIST_PRO_OPTIONS = ['SOCAN', 'ASCAP', 'BMI', 'PRS', 'APRA', 'SESAC', 'GMR', 'Other', 'Not sure', 'None']
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://setlistr.ai'

const C = {
  bg: '#0a0908', card: '#141210',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  red: '#f87171', redDim: 'rgba(248,113,113,0.08)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.08)',
  // Always-dark auth: field boundaries reach 3:1 at rest (line) and when
  // focused or filled (lineActive); faint is the quietest text that passes 4.5:1.
  line: '#6e6656', lineActive: '#a68a3e', faint: '#958976',
}

type Mode = 'signin' | 'signup'

function LoginPageInner() {
  const searchParams = useSearchParams()
  const fromStart    = searchParams.get('from') === 'start'
  const next         = sanitizeNextPath(searchParams.get('next'))
  // ?mode=signup (the marketing page's Create Account link) only picks the
  // initial tab. Switching tabs is local state, so the URL — and with it
  // any `next` invite destination — is left untouched either way.
  const initialMode: Mode = searchParams.get('mode') === 'signup' ? 'signup' : 'signin'

  const [mode, setMode]             = useState<Mode>(initialMode)
  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [confirm, setConfirm]       = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [showPassword, setShowPassword]   = useState(false)
  const [showConfirm, setShowConfirm]     = useState(false)

  const [showWaitlist, setShowWaitlist]       = useState(false)
  const [waitlistName, setWaitlistName]       = useState('')
  const [waitlistRoles, setWaitlistRoles]     = useState<string[]>([])
  const [waitlistPro, setWaitlistPro]         = useState('')
  const [waitlistNote, setWaitlistNote]       = useState('')
  const [waitlistLoading, setWaitlistLoading] = useState(false)
  const [waitlistDone, setWaitlistDone]       = useState(false)
  const [waitlistError, setWaitlistError]     = useState('')

  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotLoading, setForgotLoading]           = useState(false)
  const [forgotDone, setForgotDone]                 = useState(false)
  const [forgotError, setForgotError]               = useState('')

  function switchMode(m: Mode) {
    setMode(m)
    setError('')
    setSuccess('')
    setPassword('')
    setConfirm('')
    setTermsAccepted(false)
    setShowPassword(false)
    setShowConfirm(false)
  }

  async function handleSignIn(e?: React.FormEvent) {
    e?.preventDefault()
    if (loading) return
    if (!email.trim() || !password.trim()) { setError('Enter your email and password.'); return }
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    // Preserves a pending team-invite accept through a plain sign-in —
    // previously hardcoded to /app/dashboard regardless of how the user
    // arrived here, which silently dropped the invite every time an
    // existing account had to log in first to accept one.
    window.location.href = next || '/app/dashboard'
  }

  async function handleSignUp(e?: React.FormEvent) {
    e?.preventDefault()
    if (loading) return
    if (!email.trim() || !password.trim()) { setError('Enter your email and a password.'); return }
    if (!termsAccepted) { setError('You must agree to the Terms of Service and Privacy Policy to create an account.'); return }
    if (password !== confirm) { setError("Passwords don't match"); return }
    if (password.length < 6)  { setError('Password must be at least 6 characters'); return }
    setLoading(true)
    setError('')
    const supabase = createClient()
    const termsAcceptedAt = new Date().toISOString()
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // Points at the new public confirmation callback
        // (app/auth/confirm/page.tsx), never straight at the final
        // destination — email confirmation isn't just a page visit, it
        // has to actually EXCHANGE whatever Supabase appends
        // (token_hash+type, or a PKCE code) for a real session before
        // anything protected can be reached. /auth/confirm does that,
        // then redirects to `next` only on a confirmed success — the same
        // "verify first, select/redirect only after" shape already used
        // by app/app/accept-invite/page.tsx's own acceptance flow.
        // `next` is carried as this callback's OWN query param (not
        // relied upon from whatever Supabase's template does with
        // RedirectTo) and must be encoded — it's nested inside an outer
        // query string now, unlike the previous direct-destination
        // version of this URL.
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next || '/app/dashboard')}`,
        data: {
          terms_accepted: true,
          terms_accepted_at: termsAcceptedAt,
          terms_version: 'v1-2026-05-06',
          privacy_version: 'v1-2026-05-06',
        },
      },
    })
    if (error) {
      if (error.message.toLowerCase().includes('already')) {
        // switchMode clears error/success, so it runs first — the other order
        // wiped this message before it was ever shown.
        switchMode('signin')
        setError('An account with this email already exists. Sign in instead.')
      } else {
        setError(error.message)
      }
      setLoading(false)
      return
    }
    // Try to sign in immediately
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (signInErr) {
      switchMode('signin')
      setSuccess('Account created! Check your email to confirm, then sign in.')
    } else {
      // Project has email confirmation disabled, so signUp signed the user
      // in immediately — same invite-preservation as the confirmation-
      // required path above, for the project configuration where this
      // branch is actually reached instead.
      window.location.href = next || '/app/onboarding'
    }
    setLoading(false)
  }

  function toggleWaitlistRole(role: string) {
    const key = role.toLowerCase()
    setWaitlistRoles(prev => prev.includes(key) ? prev.filter(r => r !== key) : [...prev, key])
  }

  async function handleWaitlist(e?: React.FormEvent) {
    e?.preventDefault()
    if (!email.trim() || !waitlistName.trim() || waitlistRoles.length === 0) return
    setWaitlistLoading(true)
    setWaitlistError('')
    const { error } = await submitWaitlistEntry({
      email,
      name: waitlistName,
      note: waitlistNote.trim() || null,
      roles: waitlistRoles,
      pro: waitlistPro || null,
    })
    if (error) {
      setWaitlistError(error.code === '23505' ? 'You’ve already requested access — we’ll be in touch.' : error.message)
      setWaitlistLoading(false)
      return
    }
    setWaitlistDone(true)
    setWaitlistLoading(false)
  }

  async function handleForgotPassword(e?: React.FormEvent) {
    e?.preventDefault()
    if (!email.trim()) return
    setForgotLoading(true)
    setForgotError('')
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${BASE_URL}/auth/reset-password`,
    })
    setForgotLoading(false)
    if (error) {
      setForgotError(error.message)
      return
    }
    setForgotDone(true)
  }

  const inp = (val: string): React.CSSProperties => ({
    width: '100%', boxSizing: 'border-box' as const,
    background: C.input,
    border: `1px solid ${val.trim() ? C.lineActive : C.line}`,
    borderRadius: 10, padding: '13px 14px',
    color: C.text, fontSize: 16, fontFamily: 'inherit',
    transition: 'border-color 0.15s ease', outline: 'none',
  })

  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.13em',
    textTransform: 'uppercase', color: C.muted,
    display: 'block', marginBottom: 6,
  }

  // Show/Hide for a password input. Only the input's `type` changes, so the
  // controlled value (and the caret's field) is kept. type="button" so it
  // never submits; aria-pressed + a label naming the field for screen readers.
  // preventDefault on mousedown keeps focus (and the phone keyboard) in the
  // field when tapped; Tab still reaches the button for keyboard users.
  // Changing an input's type resets its caret to 0, so the next typed
  // character would land at the START of the password — the caret is saved,
  // the type change is committed synchronously, then the caret is restored.
  const visibilityToggle = (shown: boolean, toggle: () => void, field: string, controls: string) => (
    <button type="button" className="sl-pw-toggle" onMouseDown={e => e.preventDefault()}
      onClick={() => {
        const el = document.getElementById(controls) as HTMLInputElement | null
        const caret = el && document.activeElement === el ? [el.selectionStart, el.selectionEnd] as const : null
        flushSync(toggle)
        if (!el || !caret || caret[0] === null || caret[1] === null) return
        const [start, end] = caret
        // The browser rebuilds the field on layout after a type change and
        // resets the caret then — force that layout first, and re-apply once
        // more on the next frame in case an engine defers it further.
        const restore = () => { if (document.activeElement === el) { void el.offsetWidth; el.setSelectionRange(start, end) } }
        restore()
        requestAnimationFrame(restore)
      }}
      aria-label={`${shown ? 'Hide' : 'Show'} ${field}`} aria-pressed={shown} aria-controls={controls}
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, minWidth: 64, padding: '0 14px', background: 'none', border: 'none', borderRadius: '0 10px 10px 0', color: C.secondary, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' }}>
      {shown ? 'Hide' : 'Show'}
    </button>
  )

  const Spinner = () => (
    <div style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid #0a090840', borderTopColor: '#0a0908', animation: 'spin 0.7s linear infinite' }} />
  )


  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>

      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '55vh', pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.07) 0%, transparent 65%)' }} />

      {/* Header — same geometry and wordmark size as the app shell's header
          (components/layout/AppShell.tsx). env() terms are 0 unless the page
          opts into viewport-fit=cover, so they never double the browser's
          own safe-area insetting. */}
      <header style={{
        position: 'relative', zIndex: 1, flexShrink: 0,
        height: 'calc(56px + env(safe-area-inset-top, 0px))',
        padding: 'env(safe-area-inset-top, 0px) max(16px, env(safe-area-inset-right, 0px)) 0 max(16px, env(safe-area-inset-left, 0px))',
        display: 'flex', alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <Link href="/" aria-label="Setlistr home" style={{ display: 'flex', alignItems: 'center', minHeight: 44, marginLeft: BRAND_LOGO_APP_INSET, textDecoration: 'none' }}>
          <BrandLogo priority />
        </Link>
      </header>

      <main className="sl-auth-main" style={{
        flex: 1, position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '32px max(16px, env(safe-area-inset-right, 0px)) calc(32px + env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px))',
      }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        <p className="sl-auth-tagline" style={{ fontSize: 10, color: C.muted, letterSpacing: '0.25em', textTransform: 'uppercase', margin: '0 0 20px', textAlign: 'center', animation: 'fadeUp 0.3s ease' }}>Your verified live career starts here.</p>

        {!showWaitlist && !showForgotPassword ? (
          <div style={{ animation: 'fadeUp 0.35s ease' }}>
            <div className="sl-auth-card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '24px', marginBottom: 12 }}>

              {fromStart && (
                <div style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10, padding: '10px 14px', marginBottom: 20 }}>
                  <p style={{ fontSize: 12, color: C.gold, margin: 0, fontWeight: 600, lineHeight: 1.5 }}>Your setlist is ready — sign in or create an account to save it.</p>
                </div>
              )}

              {/* Sign in / Create account toggle */}
              <div role="group" aria-label="Choose sign in or create account" style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 10, padding: 4, marginBottom: 12 }}>
                {(['signin', 'signup'] as Mode[]).map(m => (
                  <button key={m} type="button" className="sl-auth-tab" onClick={() => switchMode(m)} aria-pressed={mode === m}
                    style={{ flex: 1, minHeight: 44, padding: '10px 8px', border: mode === m ? `1px solid ${C.borderGold}` : '1px solid transparent', borderRadius: 7, background: mode === m ? C.goldDim : 'transparent', color: mode === m ? C.gold : C.secondary, fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', cursor: 'pointer', transition: 'all 0.15s ease', fontFamily: 'inherit' }}>
                    {m === 'signin' ? 'Sign In' : 'Create Account'}
                  </button>
                ))}
              </div>

              {/* The selected tab already shows the mode visually; the heading
                  stays for screen readers and document structure only. */}
              <h1 className="sl-sr-only">
                {mode === 'signin' ? 'Sign in to Setlistr' : 'Create your Setlistr account'}
              </h1>
              <p style={{ fontSize: 13, color: C.muted, margin: '0 0 12px', lineHeight: 1.4 }}>
                {mode === 'signin' ? 'Welcome back.' : 'Set up with your email and a password.'}
              </p>

              {/* A real <form>: Enter / the phone keyboard's Go key submit
                  natively, and password managers recognise the sign-in and
                  new-account forms. noValidate keeps validation in the
                  handlers exactly as before. */}
              <form onSubmit={mode === 'signin' ? handleSignIn : handleSignUp} noValidate
                aria-label={mode === 'signin' ? 'Sign in' : 'Create account'}
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label htmlFor="auth-email" style={lbl}>Email</label>
                  <input id="auth-email" name="email" type="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com" autoComplete="username"
                    autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next"
                    style={inp(email)}
                    onFocus={e => (e.target.style.borderColor = C.lineActive)}
                    onBlur={e => (e.target.style.borderColor = email.trim() ? C.lineActive : C.line)} />
                </div>

                <div>
                  <label htmlFor="auth-password" style={lbl}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                      enterKeyHint={mode === 'signin' ? 'go' : 'next'}
                      placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      autoCapitalize="none" autoCorrect="off" spellCheck={false}
                      style={{ ...inp(password), paddingRight: 72 }}
                      onFocus={e => (e.target.style.borderColor = C.lineActive)}
                      onBlur={e => (e.target.style.borderColor = password.trim() ? C.lineActive : C.line)} />
                    {visibilityToggle(showPassword, () => setShowPassword(v => !v), 'password', 'auth-password')}
                  </div>
                  {mode === 'signin' && (
                    // Negative margins pull the row into the surrounding gaps:
                    // less vertical space, same 44px tap target.
                    <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '-4px 0 -10px' }}>
                      <button type="button" className="sl-auth-switch" onClick={() => { setForgotError(''); setForgotDone(false); setShowForgotPassword(true) }}
                        style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', background: 'none', border: 'none', color: C.secondary, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: '0 0 0 12px', letterSpacing: '0.02em' }}
                        onMouseEnter={e => (e.currentTarget.style.color = C.gold)}
                        onMouseLeave={e => (e.currentTarget.style.color = C.secondary)}>
                        Forgot password?
                      </button>
                    </div>
                  )}
                </div>

                {mode === 'signup' && (
                  <>
                    <div>
                      <label htmlFor="auth-confirm" style={lbl}>Confirm Password</label>
                      <div style={{ position: 'relative' }}>
                        <input id="auth-confirm" name="confirm-password" type={showConfirm ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)}
                          enterKeyHint="go"
                          placeholder="••••••••" autoComplete="new-password"
                          autoCapitalize="none" autoCorrect="off" spellCheck={false}
                          style={{ ...inp(confirm), paddingRight: 72, borderColor: confirm && confirm !== password ? C.red : confirm && confirm === password ? C.green : confirm.trim() ? C.lineActive : C.line }}
                          onFocus={e => (e.target.style.borderColor = C.lineActive)}
                          onBlur={e => (e.target.style.borderColor = confirm && confirm !== password ? C.red : confirm && confirm === password ? C.green : C.line)} />
                        {visibilityToggle(showConfirm, () => setShowConfirm(v => !v), 'confirm password', 'auth-confirm')}
                      </div>
                      {confirm && password && confirm === password && (
                        <p style={{ fontSize: 13, color: C.green, margin: '6px 0 0' }}>✓ Passwords match</p>
                      )}
                      {confirm && password && confirm !== password && (
                        <p style={{ fontSize: 13, color: C.red, margin: '6px 0 0' }}>Passwords don&apos;t match</p>
                      )}
                    </div>

                    {/* ── Terms & Privacy consent ── a <label> around a real
                        checkbox (visually replaced by the custom box), so the
                        whole row is the tap target and Space toggles it. */}
                    <label
                      className="sl-terms"
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        background: termsAccepted ? 'rgba(201,168,76,0.06)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${termsAccepted ? C.borderGold : C.border}`,
                        borderRadius: 10, padding: '12px 14px',
                        cursor: 'pointer', transition: 'all 0.15s ease',
                        marginTop: 2, position: 'relative',
                      }}
                    >
                      <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)}
                        style={{ position: 'absolute', opacity: 0, width: 1, height: 1, margin: 0, pointerEvents: 'none' }} />
                      <span aria-hidden="true" className="sl-terms-box" style={{
                        width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1,
                        background: termsAccepted ? C.gold : 'transparent',
                        border: `1.5px solid ${termsAccepted ? C.gold : C.muted}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s ease',
                      }}>
                        {termsAccepted && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path d="M1 3.5L4 6.5L9 1" stroke="#0a0908" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      <span style={{ fontSize: 13, color: C.secondary, margin: 0, lineHeight: 1.55 }}>
                        I agree to the{' '}
                        <Link
                          href="/terms"
                          target="_blank"
                          onClick={e => e.stopPropagation()}
                          style={{ color: C.gold, textDecoration: 'none', fontWeight: 600 }}
                        >
                          Terms of Service
                        </Link>
                        {' '}and{' '}
                        <Link
                          href="/privacy"
                          target="_blank"
                          onClick={e => e.stopPropagation()}
                          style={{ color: C.gold, textDecoration: 'none', fontWeight: 600 }}
                        >
                          Privacy Policy
                        </Link>
                      </span>
                    </label>
                  </>
                )}

                {error && (
                  <div role="alert" style={{ background: C.redDim, border: `1px solid rgba(248,113,113,0.2)`, borderRadius: 10, padding: '11px 14px' }}>
                    <p style={{ fontSize: 14, color: C.red, margin: 0, lineHeight: 1.45 }}>{error}</p>
                  </div>
                )}

                {success && (
                  <div role="status" style={{ background: C.greenDim, border: `1px solid rgba(74,222,128,0.2)`, borderRadius: 10, padding: '11px 14px' }}>
                    <p style={{ fontSize: 14, color: C.green, margin: 0, lineHeight: 1.45 }}>{success}</p>
                  </div>
                )}

                {/* Enabled until a request is in flight: submitting an
                    incomplete form runs the handler's validation, which says
                    what's missing (a disabled submit would silently block
                    Enter/Go inside a <form>). Disabled + spinner while loading. */}
                <button
                  type="submit"
                  disabled={loading}
                  aria-busy={loading}
                  style={{ width: '100%', minHeight: 50, padding: '13px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: loading ? 'progress' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'opacity 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', marginTop: 4 }}>
                  {loading ? <><Spinner />{mode === 'signin' ? 'Signing in...' : 'Creating account...'}</> : mode === 'signin' ? 'Sign In' : 'Create Account'}
                </button>

                <p style={{ fontSize: 13, color: C.muted, margin: 0, textAlign: 'center' }}>
                  {mode === 'signin' ? 'New to Setlistr?' : 'Already have an account?'}{' '}
                  <button type="button" className="sl-auth-switch" onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
                    style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', background: 'none', border: 'none', padding: '0 4px', color: C.gold, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {mode === 'signin' ? 'Create an account' : 'Sign in instead'}
                  </button>
                </p>
              </form>
            </div>

            {/* Waitlist CTA */}
            {!fromStart && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 24px', textAlign: 'center', marginBottom: 20 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.secondary, margin: '0 0 5px' }}>Not invited yet?</p>
                <p style={{ fontSize: 12, color: C.muted, margin: '0 0 16px', lineHeight: 1.5 }}>
                  Setlistr is invite-only. Request access and we&apos;ll reach out.
                </p>
                <button onClick={() => setShowWaitlist(true)}
                  style={{ width: '100%', minHeight: 44, padding: '11px', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10, color: C.gold, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s ease', fontFamily: 'inherit' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.15)')}
                  onMouseLeave={e => (e.currentTarget.style.background = C.goldDim)}>
                  Request Access
                </button>
              </div>
            )}

            <p style={{ textAlign: 'center', fontSize: 10, color: C.faint, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
              {fromStart ? 'Free forever · No credit card' : 'Invite Only'}
            </p>
          </div>

        ) : showForgotPassword ? (
          <div style={{ animation: 'fadeUp 0.35s ease' }}>
            <div className="sl-auth-card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '28px 24px', marginBottom: 12 }}>
              {forgotDone ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 18px', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Check your email</h2>
                  <p style={{ fontSize: 13, color: C.secondary, margin: 0, lineHeight: 1.6 }}>
                    We sent a password reset link to <span style={{ color: C.gold }}>{email.trim()}</span>. The link expires in one hour.
                  </p>
                </div>
              ) : (
                <>
                  <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Reset your password</h1>
                  <p style={{ fontSize: 13, color: C.muted, margin: '0 0 24px', lineHeight: 1.5 }}>Enter your account email and we&apos;ll send you a link to set a new password.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <label style={lbl}>Email</label>
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleForgotPassword()}
                        placeholder="you@example.com" autoComplete="email"
                        style={inp(email)}
                        onFocus={e => (e.target.style.borderColor = C.lineActive)}
                        onBlur={e => (e.target.style.borderColor = email.trim() ? C.lineActive : C.line)} />
                    </div>
                    {forgotError && (
                      <div style={{ background: C.redDim, border: `1px solid rgba(248,113,113,0.2)`, borderRadius: 10, padding: '11px 14px' }}>
                        <p style={{ fontSize: 13, color: C.red, margin: 0 }}>{forgotError}</p>
                      </div>
                    )}
                    <button onClick={handleForgotPassword} disabled={forgotLoading || !email.trim()}
                      style={{ width: '100%', padding: '13px', background: email.trim() ? C.gold : C.muted, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: forgotLoading || !email.trim() ? 'not-allowed' : 'pointer', opacity: forgotLoading ? 0.7 : 1, transition: 'all 0.2s ease', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      {forgotLoading ? <><Spinner />Sending...</> : 'Send Reset Link'}
                    </button>
                  </div>
                </>
              )}
            </div>
            <button onClick={() => { setShowForgotPassword(false); setForgotError(''); setForgotDone(false) }}
              style={{ width: '100%', minHeight: 44, background: 'none', border: 'none', color: C.secondary, fontSize: 13, cursor: 'pointer', letterSpacing: '0.04em', fontFamily: 'inherit', padding: '10px', textAlign: 'center' }}>
              ← Back to sign in
            </button>
          </div>

        ) : (
          <div style={{ animation: 'fadeUp 0.35s ease' }}>
            <div className="sl-auth-card" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '28px 24px', marginBottom: 12 }}>
              {waitlistDone ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 18px', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Request received</h2>
                  <p style={{ fontSize: 13, color: C.secondary, margin: 0, lineHeight: 1.6 }}>
                    We’ll be in touch shortly.
                  </p>
                </div>
              ) : (
                <>
                  <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Request Access</h1>
                  <p style={{ fontSize: 13, color: C.muted, margin: '0 0 24px', lineHeight: 1.5 }}>Drop your info and we’ll be in touch.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <label style={lbl}>Email <span style={{ color: C.gold }}>*</span></label>
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
                        style={inp(email)}
                        onFocus={e => (e.target.style.borderColor = C.lineActive)}
                        onBlur={e => (e.target.style.borderColor = email.trim() ? C.lineActive : C.line)} />
                    </div>
                    <div>
                      <label style={lbl}>Full name <span style={{ color: C.gold }}>*</span></label>
                      <input type="text" value={waitlistName} onChange={e => setWaitlistName(e.target.value)} placeholder="e.g. John Smith"
                        style={inp(waitlistName)}
                        onFocus={e => (e.target.style.borderColor = C.lineActive)}
                        onBlur={e => (e.target.style.borderColor = waitlistName.trim() ? C.lineActive : C.line)} />
                    </div>
                    <div>
                      <label style={lbl}>What best describes you? <span style={{ color: C.gold }}>*</span></label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {WAITLIST_ROLE_OPTIONS.map(role => {
                          const key = role.toLowerCase()
                          const selected = waitlistRoles.includes(key)
                          return (
                            <button key={role} type="button" onClick={() => toggleWaitlistRole(role)}
                              style={{ minHeight: 44, padding: '8px 14px', background: selected ? C.goldDim : 'transparent', border: `1px solid ${selected ? C.borderGold : C.border}`, borderRadius: 8, color: selected ? C.gold : C.secondary, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s ease' }}>
                              {role}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 6 }}>PRO <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
                      <select value={waitlistPro} onChange={e => setWaitlistPro(e.target.value)}
                        style={{ ...inp(waitlistPro), cursor: 'pointer' } as React.CSSProperties}>
                        <option value="">Select your PRO</option>
                        {WAITLIST_PRO_OPTIONS.map(opt => (
                          <option key={opt} value={opt.toLowerCase()}>{opt}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 6 }}>Anything else we should know? <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
                      <textarea value={waitlistNote} onChange={e => setWaitlistNote(e.target.value)}
                        placeholder="e.g. Cover band, 3 nights a week in Nashville..." rows={3}
                        style={{ ...inp(waitlistNote), resize: 'none', lineHeight: 1.5 } as React.CSSProperties}
                        onFocus={e => (e.target as HTMLTextAreaElement).style.borderColor = C.lineActive}
                        onBlur={e => (e.target as HTMLTextAreaElement).style.borderColor = waitlistNote.trim() ? C.lineActive : C.line} />
                    </div>
                    {waitlistError && (
                      <div style={{ background: C.redDim, border: `1px solid rgba(248,113,113,0.2)`, borderRadius: 10, padding: '11px 14px' }}>
                        <p style={{ fontSize: 13, color: C.red, margin: 0 }}>{waitlistError}</p>
                      </div>
                    )}
                    <button onClick={handleWaitlist} disabled={waitlistLoading || !email.trim() || !waitlistName.trim() || waitlistRoles.length === 0}
                      style={{ width: '100%', padding: '13px', background: (email.trim() && waitlistName.trim() && waitlistRoles.length) ? C.gold : C.muted, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: (waitlistLoading || !email.trim() || !waitlistName.trim() || waitlistRoles.length === 0) ? 'not-allowed' : 'pointer', opacity: waitlistLoading ? 0.7 : 1, transition: 'all 0.2s ease', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      {waitlistLoading ? <><Spinner />Submitting...</> : 'Request Access'}
                    </button>
                  </div>
                </>
              )}
            </div>
            {!waitlistDone && (
              <button onClick={() => setShowWaitlist(false)}
                style={{ width: '100%', minHeight: 44, background: 'none', border: 'none', color: C.secondary, fontSize: 13, cursor: 'pointer', letterSpacing: '0.04em', fontFamily: 'inherit', padding: '10px', textAlign: 'center' }}>
                ← Back to sign in
              </button>
            )}
            <p style={{ textAlign: 'center', fontSize: 10, color: C.faint, letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 16 }}>
              Invite Only
            </p>
          </div>
        )}
      </div>
      </main>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input::placeholder, textarea::placeholder { color: #958976; }
        .sl-terms input:focus-visible + .sl-terms-box { outline: 2px solid #c9a84c; outline-offset: 2px; }
        .sl-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
        /* Autofill (iOS Keychain/Contacts, Chrome): the UA paints a pale
           background with !important, which can't be overridden directly;
           an inset shadow paints over it and -webkit-text-fill-color wins over
           the forced text colour. Styling only — the autofill itself, the
           autocomplete hints and Safari's Strong Password UI are untouched. */
        .sl-auth-main input { color-scheme: dark; }
        .sl-auth-main input:-webkit-autofill,
        .sl-auth-main input:-webkit-autofill:hover,
        .sl-auth-main input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 1000px #0f0e0c inset;
          box-shadow: 0 0 0 1000px #0f0e0c inset;
          -webkit-text-fill-color: #f0ece3;
          caret-color: #f0ece3;
          transition: background-color 9999s ease-out 0s;
        }
        /* Phones: top-aligned (so the keyboard opening doesn't re-centre the
           form under the user's thumb), tighter card, no tagline. */
        @media (max-width: 600px) {
          .sl-auth-main { justify-content: flex-start !important; padding-top: 12px !important; }
          .sl-auth-card { padding: 16px 18px 18px !important; border-radius: 16px !important; }
          .sl-auth-tagline { display: none; }
        }
        .sl-pw-toggle:hover, .sl-auth-tab:hover { color: #c9a84c !important; }
        .sl-auth-tab:focus-visible, .sl-auth-switch:focus-visible { outline: 2px solid #c9a84c; outline-offset: 2px; }
        .sl-pw-toggle:focus-visible { outline: 2px solid #c9a84c; outline-offset: -3px; }
        .sl-auth-switch:hover { text-decoration: underline; }
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
