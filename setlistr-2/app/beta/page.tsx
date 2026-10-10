import Image from 'next/image'
import WaitlistForm from '@/components/WaitlistForm'
import BetaSignedInStatus from '@/components/BetaSignedInStatus'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { findPendingInviteDetailsByEmail } from '@/lib/pendingInvite'
import { waitlistRequestExists } from '@/lib/waitlistStatus'

const C = {
  bg: '#0a0908',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
}

export default async function BetaPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Signed-in, awaiting-approval state — the whole point of this task:
  // the OLD page always showed WaitlistForm's "Already have access?
  // Sign In" action regardless of auth state, which for an already-
  // authenticated user is a dead end (middleware redirects a signed-in
  // visit to /auth/login straight to /app/dashboard, which bounces them
  // right back here, not admitted, having accomplished nothing). Signed-
  // in and signed-out are genuinely different states now, each with only
  // the actions that actually make sense for it.
  let inviteDetails: { role: string; artistName: string } | null = null
  let alreadyRequested = false
  let fullName: string | null = null

  if (user?.email) {
    const [details, requested, profile] = await Promise.all([
      findPendingInviteDetailsByEmail(user.email),
      waitlistRequestExists(user.email),
      supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    ])
    inviteDetails = details
    alreadyRequested = requested
    fullName = profile.data?.full_name ?? null
  }

  return (
    <div style={{ minHeight: '100svh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 20px', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '120vw', height: '55vh', pointerEvents: 'none', background: 'radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 65%)' }} />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        <Image src="/logo-white.png" alt="Setlistr" width={200} height={52} priority style={{ marginBottom: 28 }} />

        {user?.email ? (
          <BetaSignedInStatus
            email={user.email}
            fullName={fullName}
            inviteDetails={inviteDetails}
            initialAlreadyRequested={alreadyRequested}
          />
        ) : (
          <>
            <p style={{ color: C.muted, textAlign: 'center', fontSize: 14, maxWidth: 320, margin: '0 0 28px', lineHeight: 1.5 }}>
              Setlistr is invite-only. Request access and we'll be in touch.
            </p>
            <div style={{ background: '#1a1814', border: '1px solid #2e2b26', borderRadius: 16, padding: '24px', width: '100%', maxWidth: 420 }}>
              <p style={{ fontSize: 11, color: '#4a4640', textTransform: 'uppercase' as const, letterSpacing: '0.1em', margin: '0 0 16px', textAlign: 'center' }}>Need access?</p>
              <WaitlistForm />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
