'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { submitWaitlistEntry } from '@/lib/waitlist'
import { roleInfoFor } from '@/lib/teamRoleInfo'

const C = {
  card: '#141210', border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.08)',
  red: '#f87171', redDim: 'rgba(248,113,113,0.08)',
}

type Props = {
  email: string
  fullName: string | null
  inviteDetails: { role: string; artistName: string } | null
  initialAlreadyRequested: boolean
}

// The signed-in, awaiting-approval state — rendered only when
// app/beta/page.tsx has already confirmed (server-side) that this
// session is authenticated and not yet admitted. Never shows a Sign In
// action (they're already signed in — that's the exact dead-end this
// replaces: the old WaitlistForm always showed "Sign In", which for an
// authenticated user just bounced them through /auth/login straight
// back to /app/dashboard and then back here, doing nothing).
export default function BetaSignedInStatus({ email, fullName, inviteDetails, initialAlreadyRequested }: Props) {
  const router = useRouter()
  const [alreadyRequested, setAlreadyRequested] = useState(initialAlreadyRequested)
  const [requesting, setRequesting] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  async function handleRequestApproval() {
    setRequesting(true)
    setRequestError('')
    // Auto-filled from what we already know — never re-asks a known
    // recipient for their email or to re-describe why they're here.
    // roles/note reuse the EXISTING waitlist columns; 'manager' is the
    // closest fit in that table's own taxonomy for anyone invited to a
    // team workspace, regardless of their specific team role (viewer/
    // manager/tour_manager/band_member) — the real nuance is preserved
    // in the note instead of inventing a new category.
    const note = inviteDetails
      ? `Responding to a team invitation (${roleInfoFor(inviteDetails.role).label}) from ${inviteDetails.artistName}.`
      : 'Requesting beta approval after signing up.'
    const { error } = await submitWaitlistEntry({
      email,
      name: fullName || email,
      note,
      roles: ['manager'],
      pro: null,
    })
    setRequesting(false)
    if (error) {
      setRequestError(error.code === '23505' ? 'Already requested.' : 'Something went wrong — try again.')
      // A 23505 here means a request already exists (e.g. a concurrent
      // submission from another tab) — reflect that as success, not an
      // error state with no way forward.
      if (error.code === '23505') setAlreadyRequested(true)
      return
    }
    setAlreadyRequested(true)
  }

  return (
    <div style={{ width: '100%', maxWidth: 420, margin: '0 auto' }}>
      <div style={{ background: 'linear-gradient(180deg, #171512 0%, #121009 100%)', border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <p style={{ fontSize: 12, color: C.muted, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Signed in as <span style={{ color: C.secondary }}>{email}</span>
          </p>
          <button onClick={handleSignOut} disabled={signingOut}
            style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 10px', color: C.secondary, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, opacity: signingOut ? 0.6 : 1 }}>
            {signingOut ? '...' : 'Sign Out'}
          </button>
        </div>

        {inviteDetails ? (
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: C.gold, margin: '0 0 6px' }}>Your team invitation is saved</p>
            <p style={{ fontSize: 13, color: C.secondary, margin: 0, lineHeight: 1.5 }}>
              {inviteDetails.artistName} invited you as a {roleInfoFor(inviteDetails.role).label.toLowerCase()}. Setlistr approval is required before you can accept it — once approved, this page (or your invite email) will take you straight there.
            </p>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: C.secondary, margin: 0, lineHeight: 1.5 }}>
            Setlistr is invite-only — your account is saved and ready as soon as you're approved.
          </p>
        )}

        {alreadyRequested ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10, padding: '10px 14px' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.gold, flexShrink: 0 }} />
            <p style={{ fontSize: 12, fontWeight: 700, color: C.gold, margin: 0 }}>Awaiting approval</p>
          </div>
        ) : (
          <button onClick={handleRequestApproval} disabled={requesting}
            style={{ width: '100%', padding: '13px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, letterSpacing: '0.04em', cursor: requesting ? 'default' : 'pointer', fontFamily: 'inherit', opacity: requesting ? 0.7 : 1 }}>
            {requesting ? 'Requesting...' : 'Request Approval'}
          </button>
        )}

        {requestError && (
          <p style={{ fontSize: 12, color: C.red, margin: 0 }}>{requestError}</p>
        )}
      </div>
    </div>
  )
}
