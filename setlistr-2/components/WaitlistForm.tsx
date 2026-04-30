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
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{
          fontFamily: '"Bebas Neue", sans-serif',
          fontSize: 38, letterSpacing: '0.06em',
          color: '#FFFFFF', marginBottom: 10,
        }}>
          APPLICATION RECEIVED
        </div>
        <p style={{
          fontFamily: '"DM Sans", sans-serif',
          fontSize: 15, fontWeight: 300,
          color: '#605e58', lineHeight: 1.7,
        }}>
          We review applications personally.<br />We will be in touch.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 420, margin: '0 auto' }}>
      {/* Type toggle */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        {(['artist', 'publisher'] as AccessType[]).map(t => (
          <button
            key={t!}
            type="button"
            onClick={() => setAccessType(t)}
            style={{
              padding: '13px 8px',
              background: accessType === t
                ? 'rgba(201,168,76,0.12)'
                : 'rgba(255,255,255,0.04)',
              border: `1px solid ${accessType === t
                ? 'rgba(201,168,76,0.45)'
                : 'rgba(255,255,255,0.08)'}`,
              color: accessType === t ? '#C9A84C' : '#605e58',
              fontFamily: '"DM Mono", monospace',
              fontSize: 11, letterSpacing: '0.14em',
              textTransform: 'uppercase' as const,
              cursor: 'pointer',
              borderRadius: 8,
              transition: 'all 0.2s ease',
            }}
          >
            {t === 'artist' ? 'Artist' : 'Publisher / Label'}
          </button>
        ))}
      </div>

      {/* Email */}
      <div style={{ marginBottom: 10 }}>
        <input
          type="email"
          required
          placeholder="Email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box' as const,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            color: '#f5f3ef',
            fontFamily: '"DM Sans", sans-serif',
            fontSize: 15, fontWeight: 300,
            padding: '14px 18px',
            outline: 'none',
          }}
          onFocus={e  => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.4)' }}
          onBlur={e   => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
        />
      </div>

      {error && (
        <p style={{
          fontFamily: '"DM Mono", monospace',
          fontSize: 11, color: '#c0392b',
          textAlign: 'center', margin: '0 0 10px',
        }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !email || !accessType}
        style={{
          width: '100%',
          padding: '16px',
          background: email && accessType ? '#C9A84C' : 'rgba(201,168,76,0.2)',
          border: 'none',
          borderRadius: 10,
          color: email && accessType ? '#080706' : '#3a3028',
          fontFamily: '"Bebas Neue", sans-serif',
          fontSize: 18, letterSpacing: '0.12em',
          cursor: email && accessType ? 'pointer' : 'not-allowed',
          transition: 'all 0.2s ease',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? 'Submitting...' : 'Apply for Early Access'}
      </button>

      <p style={{
        fontFamily: '"DM Mono", monospace',
        fontSize: 10, color: '#3a3028',
        textAlign: 'center', margin: '14px 0 0',
        letterSpacing: '0.08em',
      }}>
        Already have access?{' '}
        <a href="/auth/login" style={{ color: 'rgba(201,168,76,0.5)', textDecoration: 'none' }}>
          Sign in
        </a>
      </p>
    </form>
  )
}
