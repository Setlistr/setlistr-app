'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

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
      // Auto sign in after signup
      await supabase.auth.signInWithPassword({ email, password })
    }
    // Hard redirect so middleware can set cookies properly
    window.location.href = '/app/dashboard'
  }

  return (
    <div className="min-h-screen bg-ink flex flex-col items-center justify-center px-4"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #2a2620 0%, #1a1814 70%)' }}>

      {/* Logo */}
      <div className="flex flex-col items-center mb-12 animate-fade-in">
        <div className="flex flex-col gap-[3px] w-8 mb-5">
          <div className="h-[3px] w-full bg-gold rounded-sm"/>
          <div className="h-[3px] w-[65%] bg-gold rounded-sm"/>
          <div className="h-[3px] w-[80%] bg-gold rounded-sm"/>
          <div className="flex items-center gap-[5px]">
            <div className="h-[3px] w-[45%] bg-gold rounded-sm"/>
            <div className="h-[7px] w-[7px] rounded-full bg-gold"/>
          </div>
        </div>
        <div className="font-display text-3xl text-cream tracking-wide">Setlistr</div>
        <p className="text-ink-light text-xs tracking-[0.2em] uppercase mt-1">Live Performance Registry</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm animate-slide-up" style={{ animationDelay: '0.1s', opacity: 0 }}>
        <div className="bg-[#211f1b] rounded-2xl p-8 border border-[#2e2b26]">
          <h1 className="text-cream text-lg font-semibold mb-1">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="text-ink-light text-sm mb-7">
            {mode === 'signin' ? 'Sign in to continue' : 'Start capturing performances tonight'}
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-ink-light uppercase tracking-wider block mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                className="w-full bg-[#1a1814] border border-[#2e2b26] rounded-xl px-4 py-3 text-cream placeholder:text-[#4a4640] focus:outline-none focus:border-gold transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-ink-light uppercase tracking-wider block mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                className="w-full bg-[#1a1814] border border-[#2e2b26] rounded-xl px-4 py-3 text-cream placeholder:text-[#4a4640] focus:outline-none focus:border-gold transition-colors"
              />
            </div>

            {error && (
              <div className="bg-red-950/40 border border-red-900/50 rounded-xl px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gold hover:bg-gold-light disabled:opacity-50 text-ink font-semibold rounded-xl py-3.5 transition-colors mt-2"
            >
              {loading ? '...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-xs text-ink-light mt-6">
            {mode === 'signin' ? "No account? " : "Have an account? "}
            <button
              onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError('') }}
              className="text-gold hover:text-gold-light font-medium"
            >
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
