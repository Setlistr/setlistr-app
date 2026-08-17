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
      <div style={{ textAlign: 'center', padding: '24px 0', maxWidth: 420, margin: '0 auto' }}>
        <div style={{
          fontFamily: '"Bebas Neue", sans-serif',
          fontSize: 38, letterSpacing: '0.06em',
          color: '#FFFFFF', marginBottom: 10,
        }}>
          Request Received
        </div>
        <p style={{
          fontFamily: '"DM Sans", sans-serif',
          fontSize: 15, fontWeight: 300,
          color: 'rgba(212,209,202,0.7)', lineHeight: 1.7, marginBottom: 28,
        }}>
          We’ll be in touch shortly.
        </p>
        <a href="/auth/login" style={{
          display: 'block',
          fontFamily: '"Bebas Neue", sans-serif',
          fontSize: 16, letterSpacing: '0.1em',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: '#f5f3ef',
          padding: '14px',
          textDecoration: 'none',
          borderRadius: 10,
          transition: 'border-color 0.2s',
        }}>
          Already have access? Sign in →
        </a>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', maxWidth: 420, margin: '0 auto' }}>

      {/* ── Sign in — dominant, above the form ── */}
      <a href="/auth/login" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        fontFamily: '"Bebas Neue", sans-serif',
        fontSize: 17, letterSpacing: '0.1em',
        color: '#C9A84C',
        background: 'rgba(201,168,76,0.08)',
        border: '1px solid rgba(201,168,76,0.3)',
        padding: '14px 24px',
        textDecoration: 'none',
        borderRadius: 10,
        marginBottom: 20,
        transition: 'background 0.2s, border-color 0.2s',
      }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.7 }}>
          <path d="M8 1a4 4 0 1 1 0 8A4 4 0 0 1 8 1zm0 9c3.314 0 6 1.343 6 3v1H2v-1c0-1.657 2.686-3 6-3z" fill="#C9A84C"/>
        </svg>
        Already have access? Sign In
        <span style={{ opacity: 0.5 }}>→</span>
      </a>

      {/* ── Divider ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 20,
      }}>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
        <span style={{
          fontFamily: '"DM Mono", monospace',
          fontSize: 9, letterSpacing: '0.2em',
          color: 'rgba(212,209,202,0.5)', textTransform: 'uppercase',
        }}>or request access</span>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
      </div>

      {/* ── Waitlist form ── */}
      <form onSubmit={handleSubmit}>
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
                color: accessType === t ? '#C9A84C' : 'rgba(232,228,219,0.75)',
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
            width: '100%', padding: '16px',
            background: email && accessType ? '#C9A84C' : 'rgba(201,168,76,0.32)',
            border: 'none', borderRadius: 10,
            color: email && accessType ? '#080706' : 'rgba(232,228,219,0.6)',
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: 18, letterSpacing: '0.12em',
            cursor: email && accessType ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s ease',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Submitting...' : 'Request Access'}
        </button>
      </form>
    </div>
  )
}
