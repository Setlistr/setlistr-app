'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type AccessType = 'artist' | 'publisher' | null

export default function WaitlistForm() {
  const [accessType, setAccessType] = useState<AccessType>(null)
  const [email, setEmail]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [done, setDone]             = useState(false)
  const [error, setError]           = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !accessType) return
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: err } = await supabase.from('waitlist').insert({
      email: email.trim().toLowerCase(),
      note: accessType === 'publisher' ? '[PUBLISHER]' : '[ARTIST]',
    })

    if (err) {
      setError(err.code === '23505' ? 'Already registered.' : 'Something went wrong.')
      setLoading(false)
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <p style={{
          fontFamily: 'var(--font-display)',
          fontSize: 28, fontWeight: 400,
          color: '#f0ece3', margin: '0 0 12px', lineHeight: 1.1,
        }}>
          Application received.
        </p>
        <p style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 14, fontWeight: 300,
          color: '#6a5f50', lineHeight: 1.7, margin: 0,
        }}>
          We review applications personally.<br />We will be in touch.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 400, margin: '0 auto' }}>

      {/* Type toggle */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 6, marginBottom: 10,
      }}>
        {(['artist', 'publisher'] as AccessType[]).map(t => (
          <button
            key={t!}
            type="button"
            onClick={() => setAccessType(t)}
            style={{
              padding: '12px 8px',
              background: accessType === t
                ? 'rgba(201,168,76,0.1)'
                : 'rgba(255,255,255,0.03)',
              border: `1px solid ${accessType === t
                ? 'rgba(201,168,76,0.35)'
                : 'rgba(255,255,255,0.07)'}`,
              color: accessType === t ? '#c9a84c' : '#5a5448',
              fontFamily: 'var(--font-mono)',
              fontSize: 10, letterSpacing: '0.16em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            {t === 'artist' ? 'Artist' : 'Publisher / Label'}
          </button>
        ))}
      </div>

      {/* Email */}
      <div style={{ position: 'relative', marginBottom: 8 }}>
        <input
          type="email"
          required
          placeholder="Email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            color: '#f0ece3',
            fontFamily: 'var(--font-sans)',
            fontSize: 14, fontWeight: 300,
            padding: '13px 16px',
            outline: 'none',
            transition: 'border-color 0.2s ease',
          }}
          onFocus={e  => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.3)' }}
          onBlur={e   => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)' }}
        />
      </div>

      {error && (
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11, color: '#f87171',
          textAlign: 'center', margin: '0 0 8px', letterSpacing: '0.05em',
        }}>
          {error}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || !email || !accessType}
        style={{
          width: '100%',
          padding: '14px',
          background: email && accessType ? '#c9a84c' : 'rgba(201,168,76,0.2)',
          border: 'none',
          color: email && accessType ? '#0a0908' : '#3a3028',
          fontFamily: 'var(--font-mono)',
          fontSize: 11, fontWeight: 500,
          letterSpacing: '0.16em', textTransform: 'uppercase',
          cursor: email && accessType ? 'pointer' : 'not-allowed',
          transition: 'all 0.2s ease',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? 'Submitting...' : 'Apply for Access →'}
      </button>

      {/* Sign in escape */}
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10, color: '#3a3028',
        textAlign: 'center', margin: '14px 0 0',
        letterSpacing: '0.08em',
      }}>
        Already have access?{' '}
        <a
          href="/auth/login"
          style={{ color: 'rgba(201,168,76,0.5)', textDecoration: 'none' }}
        >
          Sign in
        </a>
      </p>
    </form>
  )
}
