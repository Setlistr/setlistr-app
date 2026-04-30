'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type WaitlistType = 'artist' | 'publisher' | ''

const C = {
  bg:         '#0a0908',
  card:       '#141210',
  border:     'rgba(255,255,255,0.07)',
  borderGold: 'rgba(201,168,76,0.3)',
  text:       '#f0ece3',
  secondary:  '#a09880',
  muted:      '#5a5448',
  gold:       '#c9a84c',
  goldDim:    'rgba(201,168,76,0.12)',
  input:      '#0f0e0c',
}

export default function WaitlistForm() {
  const [type, setType]       = useState<WaitlistType>('')
  const [email, setEmail]     = useState('')
  const [name, setName]       = useState('')
  const [note, setNote]       = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone]       = useState(false)
  const [error, setError]     = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !type) return
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error: err } = await supabase.from('waitlist').insert({
      email: email.trim().toLowerCase(),
      name:  name.trim() || null,
      note:  (type === 'publisher' ? '[PUBLISHER] ' : '[ARTIST] ') + (note.trim() || ''),
    })

    if (err) {
      setError(err.code === '23505' ? "You're already on the list." : 'Something went wrong. Try again.')
      setLoading(false)
      return
    }

    setDone(true)
    setLoading(false)
  }

  if (done) {
    return (
      <div style={{
        textAlign: 'center', padding: '48px 24px',
        background: C.card, border: `1px solid ${C.borderGold}`,
        maxWidth: 480, margin: '0 auto',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: C.goldDim, border: `1px solid ${C.borderGold}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', fontSize: 20,
        }}>◆</div>
        <p style={{
          fontFamily: '"DM Serif Display", Georgia, serif',
          fontSize: 28, fontWeight: 400, color: C.text,
          margin: '0 0 12px',
        }}>
          You're on the list.
        </p>
        <p style={{ fontSize: 14, fontWeight: 300, color: C.secondary, lineHeight: 1.6, margin: 0 }}>
          {type === 'artist'
            ? "We'll be in touch. Every show you play from here is royalties waiting to be claimed."
            : "We'll reach out within 48 hours to schedule time. We have something specific to show you."}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 480, margin: '0 auto' }}>

      {/* Type selector */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        {(['artist', 'publisher'] as WaitlistType[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            style={{
              padding: '14px 16px',
              background: type === t ? C.goldDim : C.card,
              border: `1px solid ${type === t ? C.borderGold : C.border}`,
              color: type === t ? C.gold : C.muted,
              fontSize: 12, fontWeight: 600,
              fontFamily: '"DM Mono", monospace',
              letterSpacing: '0.12em', textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {t === 'artist' ? 'I\'m an Artist' : 'Publisher / Label'}
          </button>
        ))}
      </div>

      {/* Name */}
      <div style={{ marginBottom: 10 }}>
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={e => setName(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: C.input, border: `1px solid ${C.border}`,
            color: C.text, fontSize: 14, fontWeight: 300,
            fontFamily: '"DM Sans", sans-serif',
            padding: '13px 16px', outline: 'none',
            transition: 'border-color 0.15s ease',
          }}
          onFocus={e => e.currentTarget.style.borderColor = C.borderGold}
          onBlur={e => e.currentTarget.style.borderColor = C.border}
        />
      </div>

      {/* Email */}
      <div style={{ marginBottom: 10 }}>
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          style={{
            width: '100%', boxSizing: 'border-box',
            background: C.input, border: `1px solid ${C.border}`,
            color: C.text, fontSize: 14, fontWeight: 300,
            fontFamily: '"DM Sans", sans-serif',
            padding: '13px 16px', outline: 'none',
            transition: 'border-color 0.15s ease',
          }}
          onFocus={e => e.currentTarget.style.borderColor = C.borderGold}
          onBlur={e => e.currentTarget.style.borderColor = C.border}
        />
      </div>

      {/* Contextual note */}
      {type === 'publisher' && (
        <div style={{ marginBottom: 10 }}>
          <input
            type="text"
            placeholder="Company name (optional)"
            value={note}
            onChange={e => setNote(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: C.input, border: `1px solid ${C.border}`,
              color: C.text, fontSize: 14, fontWeight: 300,
              fontFamily: '"DM Sans", sans-serif',
              padding: '13px 16px', outline: 'none',
              transition: 'border-color 0.15s ease',
            }}
            onFocus={e => e.currentTarget.style.borderColor = C.borderGold}
            onBlur={e => e.currentTarget.style.borderColor = C.border}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <p style={{ fontSize: 12, color: '#f87171', margin: '0 0 12px', textAlign: 'center' }}>
          {error}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || !email.trim() || !type}
        style={{
          width: '100%', padding: '15px',
          background: (!email.trim() || !type) ? 'rgba(201,168,76,0.3)' : C.gold,
          border: 'none', color: '#0a0908',
          fontSize: 12, fontWeight: 700,
          fontFamily: '"DM Mono", monospace',
          letterSpacing: '0.12em', textTransform: 'uppercase',
          cursor: (!email.trim() || !type) ? 'not-allowed' : 'pointer',
          transition: 'opacity 0.15s ease, background 0.15s ease',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? 'Requesting...' : 'Request Early Access →'}
      </button>

      <p style={{
        fontSize: 11, color: C.muted, textAlign: 'center',
        margin: '12px 0 0', letterSpacing: '0.04em',
      }}>
        Already have access?{' '}
        <a href="/auth/login" style={{ color: C.gold, textDecoration: 'none' }}>
          Sign in →
        </a>
      </p>
    </form>
  )
}
