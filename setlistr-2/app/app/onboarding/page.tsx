'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'
import { ArrowRight } from 'lucide-react'

const C = {
  bg: '#0a0908',
  card: '#141210',
  border: 'rgba(255,255,255,0.07)',
  input: '#0f0e0c',
  text: '#f0ece3',
  secondary: '#a09070',
  muted: '#6a6050',
  gold: '#c9a84c',
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [fullName, setFullName] = useState('')
  const [artistName, setArtistName] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleFinish() {
    if (!fullName.trim() || !artistName.trim()) return
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    await supabase.from('profiles').update({
      full_name: fullName.trim(),
      artist_name: artistName.trim(),
    }).eq('id', user.id)

    router.push('/app/performances/new')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: `radial-gradient(ellipse at 50% 0%, #1a1814 0%, ${C.bg} 100%)` }}>

      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(201,168,76,0.08) 0%, transparent 70%)' }} />

      <div className="w-full max-w-sm">

        <div className="flex justify-center mb-10">
          <Image src="/logo-white.png" alt="Setlistr" width={180} height={46} priority />
        </div>

        {step === 1 && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="font-display text-3xl mb-2" style={{ color: C.text }}>
                Welcome to Setlistr
              </h1>
              <p className="text-sm" style={{ color: C.secondary }}>
                Let's get your profile set up. Takes 30 seconds.
              </p>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: C.secondary }}>
                Your Name
              </label>
              <input
                autoFocus
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fullName.trim() && setStep(2)}
                placeholder="e.g. John Smith"
                className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors"
                style={{ background: C.input, border: `1px solid ${C.border}`, color: C.text }}
              />
            </div>

            <button
              onClick={() => fullName.trim() && setStep(2)}
              disabled={!fullName.trim()}
              className="w-full flex items-center justify-center gap-2 font-bold rounded-2xl py-4 transition-all disabled:opacity-30"
              style={{ background: C.gold, color: '#0a0908' }}
            >
              Continue
              <ArrowRight size={18} />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="font-display text-3xl mb-2" style={{ color: C.text }}>
                What's your artist name?
              </h1>
              <p className="text-sm" style={{ color: C.secondary }}>
                This will appear on your setlists and PRO reports.
              </p>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider block mb-1.5" style={{ color: C.secondary }}>
                Artist Name
              </label>
              <input
                autoFocus
                value={artistName}
                onChange={e => setArtistName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && artistName.trim() && handleFinish()}
                placeholder="e.g. Hozier, The Midnight..."
                className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none transition-colors"
                style={{ background: C.input, border: `1px solid ${C.border}`, color: C.text }}
              />
            </div>

            <button
              onClick={handleFinish}
              disabled={!artistName.trim() || loading}
              className="w-full flex items-center justify-center gap-2 font-bold rounded-2xl py-4 transition-all disabled:opacity-30"
              style={{ background: C.gold, color: '#0a0908' }}
            >
              {loading ? 'Setting up...' : 'Start First Show'}
              {!loading && <ArrowRight size={18} />}
            </button>

            <button onClick={() => setStep(1)}
              className="text-center text-sm transition-colors"
              style={{ color: C.muted }}>
              Back
            </button>
          </div>
        )}

        <div className="flex justify-center gap-2 mt-8">
          {[1, 2].map(s => (
            <div key={s} className="h-1 rounded-full transition-all"
              style={{
                width: step === s ? '24px' : '8px',
                background: step === s ? C.gold : C.muted,
              }} />
          ))}
        </div>
      </div>
    </div>
  )
}
