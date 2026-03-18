'use client'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'

const C = {
  bg: '#0a0908', card: '#141210', cardHover: '#181614',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#a09070', muted: '#6a6050',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  red: '#f87171', redDim: 'rgba(248,113,113,0.08)',
}

function LoginPageInner() {
  const searchParams = useSearchParams()
  const fromStart    = searchParams.get('from') === 'start'

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const [showWaitlist, setShowWaitlist]       = useState(false)
  const [waitlistEmail, setWaitlistEmail]     = useState('')
  const [waitlistName, setWaitlistName]       = useState('')
  const [waitlistNote, setWaitlistNote]       = useState('')
  const [waitlistLoading, setWaitlistLoading] = useState(false)
  const [waitlistDone, setWaitlistDone]       = useState(false)
  const [waitlistError, setWaitlistError]     = useState('')

  async function handleSignIn(e?: React.FormEvent) {
    e?.preventDefault()
    if (!email.trim() || !password.trim()) return
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    window.location.href = '/app/dashboard'
  }

  async function handleWaitlist(e?: React.FormEvent) {
    e?.preventDefault()
    if (!waitlistEmail.trim()) return
    setWaitlistLoading(true)
    setWaitlistError('')
    const supabase = createClient()
    const { error } = await supabase.from('waitlist').insert({
      email: waitlistEmail.trim(),
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

  const inputStyle = (val: string): React.CSSProperties => ({
    width: '100%', boxSizing: 'border-box',
    background: C.input,
    border: `1px solid ${val.trim() ? C.borderGold : C.border}`,
    borderRadius: 10, padding: '12px 14px',
    color: C.text, fontSize: 14, fontFamily: 'inherit',
    transition: 'border-color 0.15s ease',
    outline: 'none',
  })

  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.13em',
    textTransform: 'uppercase', color: C.muted,
    display: 'block', marginBottom: 6,
  }

  return (
    <div style={{
      minHeight: '100svh', background: C.bg,
      fontFamily: '"DM Sans", system-ui, sans-serif',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px 20px',
    }}>

      <div style={{
        position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: '120vw', height: '55vh', pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.07) 0%, transparent 65%)',
      }} />

      <div style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>

        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 36, animation: 'fadeUp 0.3s ease' }}>
          <Image src="/logo-white.png" alt="Setlistr" width={200} height={52} priority style={{ marginBottom: 10 }} />
          <p style={{ fontSize: 10, color: C.muted, letterSpacing: '0.25em', textTransform: 'uppercase', margin: 0 }}>
            Live Performance Registry
          </p>
        </div>

        {!showWaitlist ? (
          <div style={{ animation: 'fadeUp 0.4s ease' }}>

            {/* Sign in card */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '28px 24px', marginBottom: 12 }}>

              {/* Context-aware headline */}
              {fromStart && (
                <div style={{
                  background: C.goldDim, border: `1px solid ${C.borderGold}`,
                  borderRadius: 10, padding: '10px 14px', marginBottom: 20,
                }}>
                  <p style={{ fontSize: 12, color: C.gold, margin: 0, fontWeight: 600, lineHeight: 1.5 }}>
                    💾 Your setlist is ready to save — create a free account to keep it.
                  </p>
                </div>
              )}

              <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>
                {fromStart ? 'Save your setlist' : 'Welcome back'}
              </h1>
              <p style={{ fontSize: 13, color: C.muted, margin: '0 0 24px' }}>
                {fromStart ? 'Create a free account to save your setlist and track your royalties' : 'Sign in to continue'}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSignIn()} placeholder="you@example.com"
                    autoComplete="email" style={inputStyle(email)}
                    onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'rgba(201,168,76,0.4)'}
                    onBlur={e => (e.target as HTMLInputElement).style.borderColor = email.trim() ? C.borderGold : C.border} />
                </div>
                <div>
                  <label style={labelStyle}>Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSignIn()} placeholder="••••••••"
                    autoComplete="current-password" style={inputStyle(password)}
                    onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'rgba(201,168,76,0.4)'}
                    onBlur={e => (e.target as HTMLInputElement).style.borderColor = password.trim() ? C.borderGold : C.border} />
                </div>

                {error && (
                  <div style={{ background: C.redDim, border: `1px solid rgba(248,113,113,0.2)`, borderRadius: 10, padding: '11px 14px', animation: 'fadeIn 0.2s ease' }}>
                    <p style={{ fontSize: 13, color: C.red, margin: 0 }}>{error}</p>
                  </div>
                )}

                <button onClick={() => handleSignIn()} disabled={loading || !email.trim() || !password.trim()}
                  style={{
                    width: '100%', padding: '13px',
                    background: email.trim() && password.trim() ? C.gold : C.muted,
                    border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    cursor: loading || !email.trim() || !password.trim() ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1, transition: 'all 0.2s ease',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    fontFamily: 'inherit', marginTop: 4,
                  }}>
                  {loading ? (
                    <><div style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid #0a090840', borderTopColor: '#0a0908', animation: 'spin 0.7s linear infinite' }} />Signing in...</>
                  ) : fromStart ? 'Create Account & Save' : 'Sign In'}
                </button>
              </div>
            </div>

            {/* Waitlist CTA — hide when coming from /start */}
            {!fromStart && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 24px', textAlign: 'center', marginBottom: 20 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.secondary, margin: '0 0 5px' }}>Not a member yet?</p>
                <p style={{ fontSize: 12, color: C.muted, margin: '0 0 16px', lineHeight: 1.5 }}>
                  Setlistr is in private beta. Join the waitlist and we'll reach out when we open access.
                </p>
                <button onClick={() => setShowWaitlist(true)}
                  style={{ width: '100%', padding: '11px', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10, color: C.gold, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.15s ease', fontFamily: 'inherit' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(201,168,76,0.15)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = C.goldDim}>
                  Join the Waitlist
                </button>
              </div>
            )}

            {fromStart && (
              <button onClick={() => window.history.back()}
                style={{ width: '100%', background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', letterSpacing: '0.04em', fontFamily: 'inherit', padding: '10px', textAlign: 'center' }}>
                ← Back to my setlist
              </button>
            )}

            <p style={{ textAlign: 'center', fontSize: 10, color: C.muted, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.5 }}>
              {fromStart ? 'Free forever · No credit card' : 'Private Beta · Invite Only'}
            </p>
          </div>

        ) : (
          <div style={{ animation: 'fadeUp 0.4s ease' }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: '28px 24px', marginBottom: 12 }}>
              {waitlistDone ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 18px', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🎸</div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.02em' }}>You're on the list!</h2>
                  <p style={{ fontSize: 13, color: C.secondary, margin: 0, lineHeight: 1.6 }}>
                    We'll reach out to <span style={{ color: C.gold }}>{waitlistEmail}</span> when we open access. Keep playing shows.
                  </p>
                </div>
              ) : (
                <>
                  <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Join the Waitlist</h1>
                  <p style={{ fontSize: 13, color: C.muted, margin: '0 0 24px', lineHeight: 1.5 }}>We're onboarding artists in waves. Drop your info and we'll be in touch.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <label style={labelStyle}>Your Name</label>
                      <input type="text" value={waitlistName} onChange={e => setWaitlistName(e.target.value)} placeholder="e.g. John Smith" style={inputStyle(waitlistName)}
                        onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'rgba(201,168,76,0.4)'}
                        onBlur={e => (e.target as HTMLInputElement).style.borderColor = waitlistName.trim() ? C.borderGold : C.border} />
                    </div>
                    <div>
                      <label style={labelStyle}>Email <span style={{ color: C.gold }}>*</span></label>
                      <input type="email" value={waitlistEmail} onChange={e => setWaitlistEmail(e.target.value)} placeholder="you@example.com" style={inputStyle(waitlistEmail)}
                        onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'rgba(201,168,76,0.4)'}
                        onBlur={e => (e.target as HTMLInputElement).style.borderColor = waitlistEmail.trim() ? C.borderGold : C.border} />
                    </div>
                    <div>
                      <label style={labelStyle}>Tell us about your gigs (optional)</label>
                      <textarea value={waitlistNote} onChange={e => setWaitlistNote(e.target.value)} placeholder="e.g. Cover band, 3 nights a week in Nashville..." rows={3}
                        style={{ ...inputStyle(waitlistNote), resize: 'none', lineHeight: 1.5 }}
                        onFocus={e => (e.target as HTMLTextAreaElement).style.borderColor = 'rgba(201,168,76,0.4)'}
                        onBlur={e => (e.target as HTMLTextAreaElement).style.borderColor = waitlistNote.trim() ? C.borderGold : C.border} />
                    </div>
                    {waitlistError && (
                      <div style={{ background: C.redDim, border: `1px solid rgba(248,113,113,0.2)`, borderRadius: 10, padding: '11px 14px' }}>
                        <p style={{ fontSize: 13, color: C.red, margin: 0 }}>{waitlistError}</p>
                      </div>
                    )}
                    <button onClick={() => handleWaitlist()} disabled={waitlistLoading || !waitlistEmail.trim()}
                      style={{ width: '100%', padding: '13px', background: waitlistEmail.trim() ? C.gold : C.muted, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: waitlistLoading || !waitlistEmail.trim() ? 'not-allowed' : 'pointer', opacity: waitlistLoading ? 0.7 : 1, transition: 'all 0.2s ease', fontFamily: 'inherit', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      {waitlistLoading ? (<><div style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid #0a090840', borderTopColor: '#0a0908', animation: 'spin 0.7s linear infinite' }} />Submitting...</>) : 'Request Access'}
                    </button>
                  </div>
                </>
              )}
            </div>
            {!waitlistDone && (
              <button onClick={() => setShowWaitlist(false)}
                style={{ width: '100%', background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', letterSpacing: '0.04em', fontFamily: 'inherit', padding: '10px', textAlign: 'center', transition: 'color 0.15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = C.secondary}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = C.muted}>
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
