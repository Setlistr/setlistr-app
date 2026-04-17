'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const C = {
  bg: '#0a0908', card: '#141210',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.08)',
  red: '#f87171', redDim: 'rgba(248,113,113,0.08)',
}

const ADMIN_EMAILS = ['jesse.slack.music@gmail.com', 'darylscottsongs@gmail.com']

type Invite = {
  id: string; email: string; name: string | null
  added_by: string | null; created_at: string; accepted_at: string | null
}

export default function InvitePage() {
  const router = useRouter()
  const [authorized, setAuthorized]   = useState(false)
  const [checking, setChecking]       = useState(true)
  const [invites, setInvites]         = useState<Invite[]>([])
  const [email, setEmail]             = useState('')
  const [name, setName]               = useState('')
  const [sending, setSending]         = useState(false)
  const [sent, setSent]               = useState<string | null>(null)
  const [error, setError]             = useState('')
  const [deleting, setDeleting]       = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || !ADMIN_EMAILS.includes(user.email || '')) {
        router.replace('/app/dashboard')
        return
      }
      setAuthorized(true)
      setChecking(false)
      loadInvites()
    })
  }, [router])

  async function loadInvites() {
    const supabase = createClient()
    const { data } = await supabase
      .from('beta_invites')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setInvites(data)
  }

  async function sendInvite() {
    if (!email.trim() || sending) return
    setSending(true); setError(''); setSent(null)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/beta-invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ email: email.trim(), name: name.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send invite')
      setSent(email.trim())
      setEmail(''); setName('')
      loadInvites()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  async function removeInvite(id: string) {
    setDeleting(id)
    try {
      await fetch('/api/admin/beta-invite', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setInvites(prev => prev.filter(i => i.id !== id))
    } finally {
      setDeleting(null)
    }
  }

  function copySignupLink(inviteEmail: string) {
    const url = `${window.location.origin}/auth/login`
    navigator.clipboard.writeText(url)
  }

  function timeAgo(d: string) {
    const diff = Date.now() - new Date(d).getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days}d ago`
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (checking) return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: `1.5px solid ${C.gold}`, animation: 'breathe 1.8s ease-in-out infinite' }} />
      <style>{`@keyframes breathe{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.2);opacity:.8}}`}</style>
    </div>
  )

  if (!authorized) return null

  const accepted = invites.filter(i => i.accepted_at)
  const pending  = invites.filter(i => !i.accepted_at)

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif', padding: '0 16px 60px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ padding: '28px 0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold, margin: '0 0 4px' }}>Admin</p>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.02em' }}>Beta Invites</h1>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: C.green, background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20, padding: '4px 10px' }}>
              {accepted.length} accepted
            </span>
            <span style={{ fontSize: 12, color: C.muted, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 20, padding: '4px 10px' }}>
              {pending.length} pending
            </span>
          </div>
        </div>

        {/* Invite form */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: '0 0 16px' }}>Send an invite</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Name (optional)"
                style={{ flex: 1, background: C.input, border: `1px solid ${C.border}`, borderRadius: 10, padding: '11px 14px', color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
                onFocus={e => (e.target.style.borderColor = C.borderGold)}
                onBlur={e => (e.target.style.borderColor = C.border)}
              />
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendInvite()}
                placeholder="Email address"
                style={{ flex: 2, background: C.input, border: `1px solid ${email.trim() ? C.borderGold : C.border}`, borderRadius: 10, padding: '11px 14px', color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
                onFocus={e => (e.target.style.borderColor = C.borderGold)}
                onBlur={e => (e.target.style.borderColor = email.trim() ? C.borderGold : C.border)}
              />
            </div>

            {error && (
              <div style={{ background: C.redDim, border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '10px 12px' }}>
                <p style={{ fontSize: 12, color: C.red, margin: 0 }}>{error}</p>
              </div>
            )}

            {sent && (
              <div style={{ background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontSize: 12, color: C.green, margin: 0 }}>✓ {sent} added — send them the signup link below</p>
              </div>
            )}

            <button onClick={sendInvite} disabled={!email.trim() || sending}
              style={{ width: '100%', padding: '12px', background: email.trim() ? C.gold : C.muted, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: email.trim() && !sending ? 'pointer' : 'not-allowed', opacity: sending ? 0.7 : email.trim() ? 1 : 0.4, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {sending
                ? <><div style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid #0a090840', borderTopColor: '#0a0908', animation: 'spin 0.7s linear infinite' }} />Adding...</>
                : 'Add to Beta'}
            </button>
          </div>
        </div>

        {/* Signup link to share */}
        <div style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 14, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: C.gold, margin: '0 0 2px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Share this link</p>
            <p style={{ fontSize: 12, color: C.secondary, margin: 0, fontFamily: '"DM Mono", monospace' }}>setlistr.ai/auth/login</p>
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(`${window.location.origin}/auth/login`)}
            style={{ padding: '8px 14px', background: C.gold, border: 'none', borderRadius: 8, color: '#0a0908', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
            Copy
          </button>
        </div>

        {/* Pending invites */}
        {pending.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 8px' }}>
              Pending · {pending.length}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pending.map(invite => (
                <div key={invite.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {invite.name && <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: '0 0 1px' }}>{invite.name}</p>}
                    <p style={{ fontSize: invite.name ? 12 : 14, color: invite.name ? C.secondary : C.text, margin: 0, fontWeight: invite.name ? 400 : 600 }}>{invite.email}</p>
                  </div>
                  <span style={{ fontSize: 11, color: C.muted, flexShrink: 0 }}>{timeAgo(invite.created_at)}</span>
                  <button onClick={() => removeInvite(invite.id)} disabled={deleting === invite.id}
                    style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 16, padding: '2px 6px', opacity: deleting === invite.id ? 0.4 : 0.5, flexShrink: 0 }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Accepted invites */}
        {accepted.length > 0 && (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, margin: '0 0 8px' }}>
              Accepted · {accepted.length}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {accepted.map(invite => (
                <div key={invite.id} style={{ background: C.card, border: `1px solid rgba(74,222,128,0.12)`, borderRadius: 12, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, flexShrink: 0, opacity: 0.7 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {invite.name && <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: '0 0 1px' }}>{invite.name}</p>}
                    <p style={{ fontSize: invite.name ? 12 : 14, color: invite.name ? C.secondary : C.text, margin: 0, fontWeight: invite.name ? 400 : 600 }}>{invite.email}</p>
                  </div>
                  <span style={{ fontSize: 11, color: C.green, flexShrink: 0, opacity: 0.7 }}>Joined {timeAgo(invite.accepted_at!)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {invites.length === 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '40px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 4px', fontWeight: 600 }}>No invites yet</p>
            <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>Add emails above and share the signup link</p>
          </div>
        )}

        <button onClick={() => router.push('/app/dashboard')}
          style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: '20px 0 0', display: 'block', width: '100%', textAlign: 'center' }}>
          ← Back to Dashboard
        </button>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes spin { to{transform:rotate(360deg)} }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
        input::placeholder { color: #6a6050; }
        input:focus { outline: none; }
      `}</style>
    </div>
  )
}
