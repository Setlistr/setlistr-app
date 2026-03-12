'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Waitlist state
  const [showWaitlist, setShowWaitlist] = useState(false)
  const [waitlistEmail, setWaitlistEmail] = useState('')
  const [waitlistName, setWaitlistName] = useState('')
  const [waitlistNote, setWaitlistNote] = useState('')
  const [waitlistLoading, setWaitlistLoading] = useState(false)
  const [waitlistDone, setWaitlistDone] = useState(false)
  const [waitlistError, setWaitlistError] = useState('')

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    window.location.href = '/app/dashboard'
  }

  async function handleWaitlist(e: React.FormEvent) {
    e.preventDefault()
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #1e1c18 0%, #0a0908 100%)' }}>

      {/* Glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full opacity-10 blur-[120px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, #c9a84c 0%, transparent 70%)' }} />

      {/* Logo */}
      <div className="flex flex-col items-center mb-10">
        <Image src="/logo-white.png" alt="Setlistr" width={320} height={82} className="mb-6" priority />
        <p className="text-[#5a5650] text-[11px] tracking-[0.25em] uppercase">Live Performance Registry</p>
      </div>

      <div className="w-full max-w-sm">

        {!showWaitlist ? (
          <>
            {/* Sign in card */}
            <div className="rounded-2xl p-8 border border-[#2a2720]"
              style={{ background: 'linear-gradient(160deg, #1e1c18 0%, #161410 100%)' }}>

              <h1 className="text-cream text-lg font-semibold mb-1">Welcome back</h1>
              <p className="text-[#5a5650] text-sm mb-7">Sign in to continue</p>

              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-[10px] text-[#5a5650] uppercase tracking-[0.15em] block mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSignIn(e as any)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="w-full bg-[#0f0e0c] border border-[#2a2720] rounded-xl px-4 py-3 text-cream placeholder:text-[#3a3830] focus:outline-none focus:border-gold transition-colors text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#5a5650] uppercase tracking-[0.15em] block mb-1.5">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSignIn(e as any)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full bg-[#0f0e0c] border border-[#2a2720] rounded-xl px-4 py-3 text-cream placeholder:text-[#3a3830] focus:outline-none focus:border-gold transition-colors text-sm"
                  />
                </div>

                {error && (
                  <div className="bg-red-950/40 border border-red-900/50 rounded-xl px-4 py-3 text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <button onClick={handleSignIn as any} disabled={loading}
                  className="w-full bg-gold hover:bg-yellow-400 disabled:opacity-50 text-ink font-bold rounded-xl py-3.5 transition-all mt-1 text-sm tracking-wide">
                  {loading ? '...' : 'Sign In'}
                </button>
              </div>
            </div>

            {/* Waitlist CTA */}
            <div className="mt-6 rounded-2xl p-5 border border-[#2a2720] text-center"
              style={{ background: 'linear-gradient(160deg, #1a1814 0%, #131210 100%)' }}>
              <p className="text-[#a09070] text-sm font-medium mb-1">Not a member yet?</p>
              <p className="text-[#5a5650] text-xs mb-4">
                Setlistr is in private beta. Join the waitlist and we'll reach out when we open access.
              </p>
              <button
                onClick={() => setShowWaitlist(true)}
                className="w-full border font-semibold rounded-xl py-3 text-sm transition-all"
                style={{ borderColor: 'rgba(201,168,76,0.3)', color: '#c9a84c', background: 'rgba(201,168,76,0.05)' }}>
                Join the Waitlist
              </button>
            </div>

            <p className="text-center text-[10px] text-[#3a3830] mt-6 tracking-wider uppercase">
              Private Beta · Invite Only
            </p>
          </>
        ) : (
          <>
            {/* Waitlist card */}
            <div className="rounded-2xl p-8 border border-[#2a2720]"
              style={{ background: 'linear-gradient(160deg, #1e1c18 0%, #161410 100%)' }}>

              {waitlistDone ? (
                <div className="text-center py-4">
                  <div className="text-4xl mb-4">🎸</div>
                  <h2 className="text-cream text-lg font-semibold mb-2">You're on the list!</h2>
                  <p className="text-[#a09070] text-sm">
                    We'll reach out to {waitlistEmail} when we open access. Keep playing shows.
                  </p>
                </div>
              ) : (
                <>
                  <h1 className="text-cream text-lg font-semibold mb-1">Join the Waitlist</h1>
                  <p className="text-[#5a5650] text-sm mb-7">
                    We're onboarding artists in waves. Drop your info and we'll be in touch.
                  </p>

                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="text-[10px] text-[#5a5650] uppercase tracking-[0.15em] block mb-1.5">Your Name</label>
                      <input
                        type="text"
                        value={waitlistName}
                        onChange={e => setWaitlistName(e.target.value)}
                        placeholder="e.g. John Smith"
                        className="w-full bg-[#0f0e0c] border border-[#2a2720] rounded-xl px-4 py-3 text-cream placeholder:text-[#3a3830] focus:outline-none focus:border-gold transition-colors text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-[#5a5650] uppercase tracking-[0.15em] block mb-1.5">
                        Email <span style={{ color: '#c9a84c' }}>*</span>
                      </label>
                      <input
                        type="email"
                        value={waitlistEmail}
                        onChange={e => setWaitlistEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full bg-[#0f0e0c] border border-[#2a2720] rounded-xl px-4 py-3 text-cream placeholder:text-[#3a3830] focus:outline-none focus:border-gold transition-colors text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-[#5a5650] uppercase tracking-[0.15em] block mb-1.5">
                        Tell us about your gigs (optional)
                      </label>
                      <textarea
                        value={waitlistNote}
                        onChange={e => setWaitlistNote(e.target.value)}
                        placeholder="e.g. Cover band, 3 nights a week in Nashville..."
                        rows={3}
                        className="w-full bg-[#0f0e0c] border border-[#2a2720] rounded-xl px-4 py-3 text-cream placeholder:text-[#3a3830] focus:outline-none focus:border-gold transition-colors text-sm resize-none"
                      />
                    </div>

                    {waitlistError && (
                      <div className="bg-red-950/40 border border-red-900/50 rounded-xl px-4 py-3 text-red-400 text-sm">
                        {waitlistError}
                      </div>
                    )}

                    <button onClick={handleWaitlist as any} disabled={waitlistLoading || !waitlistEmail.trim()}
                      className="w-full bg-gold hover:bg-yellow-400 disabled:opacity-50 text-ink font-bold rounded-xl py-3.5 transition-all mt-1 text-sm tracking-wide">
                      {waitlistLoading ? 'Submitting...' : 'Request Access'}
                    </button>
                  </div>
                </>
              )}
            </div>

            {!waitlistDone && (
              <button onClick={() => setShowWaitlist(false)}
                className="w-full text-center text-sm mt-4 transition-colors"
                style={{ color: '#5a5650' }}>
                ← Back to sign in
              </button>
            )}

            <p className="text-center text-[10px] text-[#3a3830] mt-6 tracking-wider uppercase">
              Private Beta · Invite Only
            </p>
          </>
        )}
      </div>
    </div>
  )
}
