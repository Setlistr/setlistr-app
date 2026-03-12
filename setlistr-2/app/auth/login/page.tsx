'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      await supabase.auth.signInWithPassword({ email, password })
    }
    window.location.href = '/app/dashboard'
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #1e1c18 0%, #0a0908 100%)' }}>

      {/* Subtle top glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full opacity-10 blur-[120px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, #c9a84c 0%, transparent 70%)' }} />

      {/* Logo */}
      <div className="flex flex-col items-center mb-10">
        <Image
          src="/logo-white.png"
          alt="Setlistr"
          width={320}
          height={82}
          className="mb-6"
          priority
        />
        <p className="text-[#5a5650] text-[11px] tracking-[0.25em] uppercase">Live Performance Registry</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm">
        <div className="rounded-2xl p-8 border border-[#2a2720]"
          style={{ background: 'linear-gradient(160deg, #1e1c18 0%, #161410 100%)' }}>

          <h1 className="text-cream text-lg font-semibold mb-1">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="text-[#5a5650] text-sm mb-7">
            {mode === 'signin' ? 'Sign in to continue' : 'Start capturing performances tonight'}
          </p>

          <div className="flex flex-col gap-4">
            <div>
              <label className="text-[10px] text-[#5a5650] uppercase tracking-[0.15em] block mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                className="w-full bg-[#0f0e0c] border border-[#2a2720] rounded-xl px-4 py-3 text-cream placeholder:text-[#3a3830] focus:outline-none focus:border-gold transition-colors text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] text-[#5a5650] uppercase tracking-[0.15em] block mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                className="w-full bg-[#0f0e0c] border border-[#2a2720] rounded-xl px-4 py-3 text-cream placeholder:text-[#3a3830] focus:outline-none focus:border-gold transition-colors text-sm"
              />
            </div>

            {error && (
              <div className="bg-red-950/40 border border-red-900/50 rounded-xl px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit as any}
              disabled={loading}
              className="w-full bg-gold hover:bg-yellow-400 disabled:opacity-50 text-ink font-bold rounded-xl py-3.5 transition-all mt-1 text-sm tracking-wide"
            >
              {loading ? '...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </div>

          <p className="text-center text-xs text-[#4a4640] mt-6">
            {mode === 'signin' ? "No account? " : "Have an account? "}
            <button
              onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError('') }}
              className="text-gold hover:text-yellow-300 font-medium transition-colors"
            >
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>

        <p className="text-center text-[10px] text-[#3a3830] mt-6 tracking-wider uppercase">
          Private Beta · Invite Only
        </p>
      </div>
    </div>
  )
}
