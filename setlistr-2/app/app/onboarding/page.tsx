'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowRight } from 'lucide-react'

const C = {
  bg: '#0a0908', card: '#141210',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
}

const PRO_OPTIONS = ['SOCAN', 'ASCAP', 'BMI', 'SESAC', 'GMR', 'APRA', 'PRS', 'Other', 'Not sure']

export default function OnboardingPage() {
  const router  = useRouter()
  const [fullName, setFullName]         = useState('')
  const [artistName, setArtistName]     = useState('')
  const [proAffiliation, setProAffiliation] = useState('')
  const [loading, setLoading]           = useState(false)
  const [checking, setChecking]         = useState(true)

  // If profile already complete, skip onboarding
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/auth/login'); return }
      supabase.from('profiles').select('full_name, artist_name').eq('id', user.id).single()
        .then(({ data }) => {
          if (data?.artist_name?.trim()) {
            router.replace('/app/dashboard')
          } else {
            if (data?.full_name) setFullName(data.full_name)
            setChecking(false)
          }
        })
    })
  }, [router])

  async function handleFinish() {
    if (!fullName.trim() || !artistName.trim() || loading) return
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    await supabase.from('profiles').update({
      full_name: fullName.trim(),
      artist_name: artistName.trim(),
      pro_affiliation: proAffiliation || null,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id)

    router.push('/app/show/new')
  }

  if (checking) return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: `1.5px solid ${C.gold}`, animation: 'breathe 1.8s ease-in-out infinite' }} />
      <style>{`@keyframes breathe{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.2);opacity:.8}}`}</style>
    </div>
  )

  const isValid = fullName.trim().length > 0 && artistName.trim().length > 0

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

        {/* Wordmark */}
        <div style={{ textAlign: 'center', marginBottom: 36, animation: 'fadeUp 0.3s ease' }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: C.gold, letterSpacing: '0.16em', textTransform: 'uppercase', margin: '0 0 6px' }}>Setlistr</p>
          <p style={{ fontSize: 11, color: C.muted, letterSpacing: '0.2em', textTransform: 'uppercase', margin: 0 }}>Live Performance Registry</p>
        </div>

        {/* Card */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: '28px 24px', animation: 'fadeUp 0.35s ease' }}>

          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
            Let's set up your profile.
          </h1>
          <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 26px', lineHeight: 1.5 }}>
            This takes 30 seconds. You'll load your first set right after.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Full name */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 6 }}>
                Your Name
              </label>
              <input
                autoFocus
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fullName.trim() && document.getElementById('artist-input')?.focus()}
                placeholder="e.g. Jesse Slack"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: C.input,
                  border: `1px solid ${fullName.trim() ? C.borderGold : C.border}`,
                  borderRadius: 10, padding: '12px 14px',
                  color: C.text, fontSize: 14, fontFamily: 'inherit',
                  outline: 'none', transition: 'border-color 0.15s ease',
                }}
                onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.4)')}
                onBlur={e => (e.target.style.borderColor = fullName.trim() ? C.borderGold : C.border)}
              />
            </div>

            {/* Artist name */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 6 }}>
                Artist Name
              </label>
              <input
                id="artist-input"
                type="text"
                value={artistName}
                onChange={e => setArtistName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && isValid && handleFinish()}
                placeholder="Your stage name or band name"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: C.input,
                  border: `1px solid ${artistName.trim() ? C.borderGold : C.border}`,
                  borderRadius: 10, padding: '12px 14px',
                  color: C.text, fontSize: 14, fontFamily: 'inherit',
                  outline: 'none', transition: 'border-color 0.15s ease',
                }}
                onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.4)')}
                onBlur={e => (e.target.style.borderColor = artistName.trim() ? C.borderGold : C.border)}
              />
              <p style={{ fontSize: 11, color: C.muted, margin: '5px 0 0' }}>Appears on your setlists and PRO exports</p>
            </div>

            {/* PRO affiliation */}
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: C.muted, display: 'block', marginBottom: 8 }}>
                PRO Affiliation <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {PRO_OPTIONS.map(pro => (
                  <button
                    key={pro}
                    type="button"
                    onClick={() => setProAffiliation(pro === proAffiliation ? '' : pro)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: `1px solid ${proAffiliation === pro ? C.borderGold : C.border}`,
                      background: proAffiliation === pro ? C.goldDim : 'transparent',
                      color: proAffiliation === pro ? C.gold : C.secondary,
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      transition: 'all 0.15s ease', fontFamily: 'inherit',
                    }}
                  >
                    {pro}
                  </button>
                ))}
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={handleFinish}
              disabled={!isValid || loading}
              style={{
                width: '100%', padding: '14px',
                background: isValid ? C.gold : C.muted,
                border: 'none', borderRadius: 12,
                color: '#0a0908', fontSize: 13, fontWeight: 800,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                cursor: isValid && !loading ? 'pointer' : 'not-allowed',
                opacity: loading ? 0.7 : isValid ? 1 : 0.4,
                transition: 'all 0.2s ease',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                fontFamily: 'inherit', marginTop: 4,
              }}
            >
              {loading ? (
                <>
                  <div style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid #0a090840', borderTopColor: '#0a0908', animation: 'spin 0.7s linear infinite' }} />
                  Setting up...
                </>
              ) : (
                <>Load Your First Set <ArrowRight size={16} strokeWidth={2.5} /></>
              )}
            </button>
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 10, color: C.muted, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.45, marginTop: 20 }}>
          Free forever · No credit card
        </p>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input::placeholder { color: #6a6050; }
        input:focus { outline: none; }
      `}</style>
    </div>
  )
}
