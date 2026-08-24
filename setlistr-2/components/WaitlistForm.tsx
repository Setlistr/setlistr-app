'use client'
import { useState } from 'react'
import { submitWaitlistEntry } from '@/lib/waitlist'

const ROLE_OPTIONS = ['Artist', 'Songwriter', 'Manager', 'Publisher', 'Label', 'Booking agent', 'Other']
const PRO_OPTIONS = ['SOCAN', 'ASCAP', 'BMI', 'PRS', 'APRA', 'SESAC', 'GMR', 'Other', 'Not sure', 'None']

const fieldStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box' as const,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10,
  color: '#f5f3ef',
  fontFamily: '"DM Sans", sans-serif',
  fontSize: 15, fontWeight: 300,
  padding: '14px 18px',
  outline: 'none',
}

export default function WaitlistForm() {
  const [email, setEmail]           = useState('')
  const [name, setName]             = useState('')
  const [roles, setRoles]           = useState<string[]>([])
  const [pro, setPro]               = useState('')
  const [note, setNote]             = useState('')
  const [loading, setLoading]       = useState(false)
  const [done, setDone]             = useState(false)
  const [error, setError]           = useState('')

  function toggleRole(role: string) {
    const key = role.toLowerCase()
    setRoles(prev => prev.includes(key) ? prev.filter(r => r !== key) : [...prev, key])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !name.trim() || roles.length === 0) return
    setLoading(true)
    setError('')
    const { error: err } = await submitWaitlistEntry({
      email,
      name,
      note: note.trim() || null,
      roles,
      pro: pro || null,
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
        {/* Email */}
        <div style={{ marginBottom: 10 }}>
          <input
            type="email"
            required
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={fieldStyle}
            onFocus={e  => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.4)' }}
            onBlur={e   => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
          />
        </div>

        {/* Full name */}
        <div style={{ marginBottom: 10 }}>
          <input
            type="text"
            required
            placeholder="Full name"
            value={name}
            onChange={e => setName(e.target.value)}
            style={fieldStyle}
            onFocus={e  => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.4)' }}
            onBlur={e   => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
          />
        </div>

        {/* Role — multi-select pills */}
        <div style={{ marginBottom: 10 }}>
          <p style={{
            fontFamily: '"DM Mono", monospace',
            fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase' as const,
            color: 'rgba(212,209,202,0.5)', margin: '0 0 6px',
          }}>
            What best describes you? <span style={{ color: '#C9A84C' }}>*</span>
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
            {ROLE_OPTIONS.map(role => {
              const key = role.toLowerCase()
              const selected = roles.includes(key)
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleRole(role)}
                  style={{
                    padding: '8px 14px',
                    background: selected ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${selected ? 'rgba(201,168,76,0.45)' : 'rgba(255,255,255,0.08)'}`,
                    color: selected ? '#C9A84C' : 'rgba(232,228,219,0.75)',
                    fontFamily: '"DM Mono", monospace',
                    fontSize: 11, letterSpacing: '0.06em',
                    cursor: 'pointer',
                    borderRadius: 8,
                    transition: 'all 0.2s ease',
                  }}
                >
                  {role}
                </button>
              )
            })}
          </div>
        </div>

        {/* PRO — optional single-select */}
        <div style={{ marginBottom: 10 }}>
          <select
            value={pro}
            onChange={e => setPro(e.target.value)}
            style={{ ...fieldStyle, cursor: 'pointer' }}
          >
            <option value="">PRO (optional)</option>
            {PRO_OPTIONS.map(opt => (
              <option key={opt} value={opt.toLowerCase()}>{opt}</option>
            ))}
          </select>
        </div>

        {/* Free text */}
        <div style={{ marginBottom: 10 }}>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Anything else we should know? (optional)"
            rows={3}
            style={{ ...fieldStyle, resize: 'none' as const, lineHeight: 1.5 }}
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
          disabled={loading || !email || !name || roles.length === 0}
          style={{
            width: '100%', padding: '16px',
            background: email && name && roles.length ? '#C9A84C' : 'rgba(201,168,76,0.32)',
            border: 'none', borderRadius: 10,
            color: email && name && roles.length ? '#080706' : 'rgba(232,228,219,0.6)',
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: 18, letterSpacing: '0.12em',
            cursor: email && name && roles.length ? 'pointer' : 'not-allowed',
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
