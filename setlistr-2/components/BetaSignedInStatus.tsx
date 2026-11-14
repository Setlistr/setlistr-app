'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import WaitlistForm from '@/components/WaitlistForm'
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
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  // A team invitation is named precisely for the reviewer. Its role (viewer/
  // manager/tour_manager/band_member) is a delegation permission level, not
  // the request form's description of the person, so it goes in the note;
  // the applicant describes themselves in the form, and Admin still chooses
  // the access role (a self-described role never grants anything).
  const contextNote = inviteDetails
    ? `Responding to a team invitation (${roleInfoFor(inviteDetails.role).label}) from ${inviteDetails.artistName}.`
    : null

  return (
    <div style={{ width: '100%', maxWidth: 420, margin: '0 auto' }}>
      <div style={{ background: 'linear-gradient(180deg, #171512 0%, #121009 100%)', border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <p style={{ fontSize: 12, color: C.muted, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Signed in as <span style={{ color: C.secondary }}>{email}</span>
          </p>
          <button onClick={handleSignOut} disabled={signingOut}
            style={{ minHeight: 36, background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '5px 10px', color: C.secondary, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, opacity: signingOut ? 0.6 : 1 }}>
            {signingOut ? '...' : 'Sign Out'}
          </button>
        </div>

        {inviteDetails ? (
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: C.gold, margin: '0 0 6px' }}>Your team invitation is saved</p>
            <p style={{ fontSize: 13, color: C.secondary, margin: 0, lineHeight: 1.5 }}>
              {inviteDetails.artistName} invited you as a {roleInfoFor(inviteDetails.role).label.toLowerCase()}. Your account needs approval before you can accept it. Once you're approved, come back here on this device, or reopen the invitation link from your email.
            </p>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: '0 0 6px' }}>Your account is waiting for approval</p>
            <p style={{ fontSize: 13, color: C.secondary, margin: 0, lineHeight: 1.5 }}>
              Setlistr is free to download, and account access requires approval. Your account is saved and opens as soon as it’s approved. If you were invited to a team, open the invitation link from your email.
            </p>
          </div>
        )}

        {alreadyRequested ? (
          <div role="status" style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10, padding: '12px 14px' }}>
            <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: C.gold, margin: '0 0 4px' }}>
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: C.gold, flexShrink: 0 }} />
              Request received
            </p>
            <p style={{ fontSize: 12.5, color: C.secondary, margin: 0, lineHeight: 1.5 }}>
              We review every request individually. If it’s approved, we’ll email you at this address and your account opens the next time you sign in.
            </p>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: '0 0 10px' }}>Tell us about your music</p>
            <WaitlistForm lockedEmail={email} defaultName={fullName} contextNote={contextNote} onDone={() => setAlreadyRequested(true)} />
          </div>
        )}

        {/* Approval belongs to an email address, never moved between accounts. */}
        <p style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.5 }}>
          Approval is linked to the email you sign in with ({email}). If you requested access, or were approved or invited, with a different email address, sign out and use that one. We can’t move an approval to another account.
        </p>
      </div>
    </div>
  )
}
