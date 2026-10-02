'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useActingAs } from '@/components/ActingAsProvider'
import { Check, Users } from 'lucide-react'
import { roleInfoFor } from '@/lib/teamRoleInfo'

// What the recipient is actually told before accepting must match what the
// role actually grants in code — shared with the sender's own pre-send
// description (app/app/settings/page.tsx) via lib/teamRoleInfo.ts, so the
// two can never drift into describing the same role differently.

const C = {
  bg: '#0a0908', card: '#141210',
  border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.08)',
  red: '#f87171', redDim: 'rgba(248,113,113,0.08)',
}

type InviteData = {
  id: string
  artist_id: string
  is_intended_recipient: boolean
  role: string
  artist_name: string
  artist_email: string
  already_accepted: boolean
}

export default function AcceptInvitePage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const token        = searchParams.get('token')
  const { selectManagedArtist } = useActingAs()

  const [loading, setLoading]       = useState(true)
  const [invite, setInvite]         = useState<InviteData | null>(null)
  const [error, setError]           = useState('')
  const [accepting, setAccepting]   = useState(false)
  const [accepted, setAccepted]     = useState(false)
  const [wrongAccount, setWrongAccount]   = useState(false)

  useEffect(() => {
    if (!token) { setError('Invalid invite link.'); setLoading(false); return }

    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      // Not logged in — redirect to login with return URL
      if (!user) {
        router.push(`/auth/login?next=/app/accept-invite?token=${token}`)
        return
      }

      // Look up the invite via service-side API
      const res = await fetch(`/api/team/accept?token=${token}`)
      const data = await res.json()

      if (data.error) { setError(data.error); setLoading(false); return }

      // Check if the logged-in user is the intended delegate
      if (!data.is_intended_recipient) {
        setWrongAccount(true)
        setInvite(data)
        setLoading(false)
        return
      }

      if (data.already_accepted) {
        // Revisiting an already-accepted link (e.g. clicking the original
        // email again later) is safe to re-enter the workspace from too —
        // the GET above already re-verified is_intended_recipient against
        // the live session before this branch is ever reached.
        selectManagedArtist({ artist_id: data.artist_id, artist_name: data.artist_name })
        setAccepted(true)
        setInvite(data)
        setLoading(false)
        return
      }

      setInvite(data)
      setLoading(false)
    }

    load()
  }, [token])

  async function acceptInvite() {
    if (!invite || !token) return
    setAccepting(true)
    try {
      const res = await fetch('/api/team/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      // The POST response itself is the fresh, authoritative confirmation
      // that this binding now exists — selecting the workspace only on
      // this success, never speculatively before it, and only with the
      // artist identity already verified by the GET load above (never a
      // client-supplied value). This is what makes "Go to Dashboard" below
      // actually land in the artist's workspace instead of the recipient's
      // own, which previously required manually finding the new artist in
      // the switcher after the fact.
      if (invite) selectManagedArtist({ artist_id: invite.artist_id, artist_name: invite.artist_name })
      setAccepted(true)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setAccepting(false)
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', border: `1.5px solid ${C.gold}`, animation: 'breathe 1.8s ease-in-out infinite' }} />
      <style>{`@keyframes breathe{0%,100%{transform:scale(1);opacity:.3}50%{transform:scale(1.2);opacity:.8}}`}</style>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: '0 0 8px' }}>Invalid Invite</h2>
        <p style={{ fontSize: 14, color: C.muted, margin: '0 0 24px' }}>{error}</p>
        <button onClick={() => router.push('/app/dashboard')}
          style={{ padding: '13px 24px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
          Go to Dashboard
        </button>
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');`}</style>
    </div>
  )

  // ── Already accepted ──────────────────────────────────────────────────────
  if (accepted) return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '60vh', pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 0%, rgba(74,222,128,0.06) 0%, transparent 65%)' }} />
      <div style={{ maxWidth: 400, width: '100%', textAlign: 'center', position: 'relative', zIndex: 1, animation: 'fadeUp 0.5s ease' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: C.greenDim, border: '1px solid rgba(74,222,128,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <Check size={28} color={C.green} strokeWidth={2.5} />
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.025em' }}>
          You're in
        </h1>
        <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 6px' }}>
          You now have {roleInfoFor(invite?.role).label.toLowerCase()} access to
        </p>
        <p style={{ fontSize: 18, fontWeight: 800, color: C.gold, margin: '0 0 28px' }}>
          {invite?.artist_name}'s account
        </p>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 20px', marginBottom: 20, textAlign: 'left' }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: C.muted, margin: '0 0 10px' }}>What you can do</p>
          {(() => {
            const items = [...roleInfoFor(invite?.role).capabilities, 'All actions are logged under their account']
            return items.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: i < items.length - 1 ? 8 : 0 }}>
                <Check size={13} color={C.green} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: 13, color: C.secondary }}>{item}</span>
              </div>
            ))
          })()}
        </div>

        <button onClick={() => router.push('/app/dashboard')}
          style={{ width: '100%', padding: '15px', background: C.gold, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, cursor: 'pointer', fontFamily: 'inherit' }}>
          Go to Dashboard
        </button>
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  )

  // ── Wrong account logged in ───────────────────────────────────────────────
  if (wrongAccount) return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <Users size={32} color={C.gold} style={{ marginBottom: 12 }} />
        <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: '0 0 8px' }}>Wrong account</h2>
        <p style={{ fontSize: 14, color: C.muted, margin: '0 0 6px', lineHeight: 1.5 }}>
          This invite was sent to a different account. Log in with the correct account to accept.
        </p>
        <p style={{ fontSize: 13, color: C.muted, margin: '0 0 24px' }}>
          Invited artist: <span style={{ color: C.gold }}>{invite?.artist_name}</span>
        </p>
        <button onClick={() => router.push(`/auth/login?next=/app/accept-invite?token=${token}`)}
          style={{ width: '100%', padding: '13px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10 }}>
          Switch Account
        </button>
        <button onClick={() => router.push('/app/dashboard')}
          style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
          Back to Dashboard
        </button>
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');`}</style>
    </div>
  )

  // ── Main accept screen ────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '60vh', pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 65%)' }} />

      <div style={{ maxWidth: 400, width: '100%', position: 'relative', zIndex: 1, animation: 'fadeUp 0.4s ease' }}>

        {/* Icon */}
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <Users size={24} color={C.gold} strokeWidth={2} />
        </div>

        {/* Heading — role shown explicitly here, not just implied by the
            capability list below, since this is the one place a recipient
            decides whether to accept at all. */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: C.gold, margin: '0 0 8px', opacity: 0.8 }}>
            Team Invite · {roleInfoFor(invite?.role).label}
          </p>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: C.text, margin: '0 0 8px', letterSpacing: '-0.025em', lineHeight: 1.1 }}>
            {invite?.artist_name} invited you
          </h1>
          <p style={{ fontSize: 14, color: C.secondary, margin: 0, lineHeight: 1.5 }}>
            {invite?.role === 'viewer'
              ? 'Accept to view their shows, setlists, and submission status.'
              : 'Accept to manage their shows and royalty submissions on their behalf.'}
          </p>
        </div>

        {/* What this means — reflects the invite's actual role, never a
            hardcoded assumption. */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '16px 20px', marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: C.muted, margin: '0 0 12px' }}>
            As a {roleInfoFor(invite?.role).label.toLowerCase()} you can
          </p>
          {roleInfoFor(invite?.role).capabilities.map((item, i, arr) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: i < arr.length - 1 ? 8 : 0 }}>
              <Check size={13} color={C.green} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: 2 }} />
              <span style={{ fontSize: 13, color: C.secondary, lineHeight: 1.4 }}>{item}</span>
            </div>
          ))}
        </div>

        {/* Audit trail note */}
        <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: C.muted, margin: 0, lineHeight: 1.5 }}>
            Every action you take is logged and visible to {invite?.artist_name}. They can remove your access at any time from their Settings.
          </p>
        </div>

        {/* Accept CTA */}
        <button onClick={acceptInvite} disabled={accepting}
          style={{ width: '100%', padding: '15px', background: C.gold, border: 'none', borderRadius: 12, color: '#0a0908', fontSize: 14, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, cursor: accepting ? 'default' : 'pointer', fontFamily: 'inherit', opacity: accepting ? 0.7 : 1, marginBottom: 10 }}>
          {accepting ? 'Accepting...' : invite?.role === 'viewer' ? `Accept — View ${invite?.artist_name}` : `Accept — Manage ${invite?.artist_name}`}
        </button>

        <button onClick={() => router.push('/app/dashboard')}
          style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', width: '100%', padding: '8px' }}>
          Decline
        </button>

        {error && (
          <div style={{ marginTop: 12, padding: '11px 14px', background: C.redDim, border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10 }}>
            <p style={{ fontSize: 13, color: C.red, margin: 0 }}>{error}</p>
          </div>
        )}
      </div>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}*{-webkit-tap-highlight-color:transparent;box-sizing:border-box}`}</style>
    </div>
  )
}
