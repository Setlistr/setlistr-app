import Image from 'next/image'
import { cookies } from 'next/headers'
import WaitlistForm from '@/components/WaitlistForm'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { findPendingInviteTokenByEmail } from '@/lib/pendingInvite'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function BetaPage() {
  // The cookie is set by middleware.ts whenever a real, un-admitted user
  // reaches this page via a CROSS-path redirect (accept-invite -> beta,
  // or dashboard -> beta) — never trusted beyond "show a more specific
  // message"; beta admission itself still happens the normal way (admin
  // grants access or the waitlist converts them), and middleware
  // re-checks that on every request regardless of this.
  const pendingInviteCookie = cookies().get('sl_pending_team_invite')?.value
  let hasPendingInvite = !!pendingInviteCookie && UUID_RE.test(pendingInviteCookie)

  // No cookie — e.g. this page was reached directly (bookmark, refresh)
  // rather than via one of those redirects. Server Components can't set
  // cookies, so there's nothing to persist here; this is a live,
  // read-only check purely to decide what to SHOW on this render. (A
  // middleware self-redirect to attach the cookie in this exact case was
  // tried and reverted — redirecting /beta to itself caused
  // ERR_TOO_MANY_REDIRECTS on Preview regardless of whether the cookie
  // would eventually land.)
  if (!hasPendingInvite) {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email) {
      const token = await findPendingInviteTokenByEmail(user.email)
      hasPendingInvite = !!token
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-cream px-6 py-12"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #1e1c18 0%, #0f0e0c 100%)' }}>
      <Image src="/logo-pill.png" alt="Setlistr" width={200} height={52} className="mb-8" />
      {hasPendingInvite ? (
        <div style={{ textAlign: 'center', maxWidth: 360, marginBottom: 32 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#c9a84c', margin: '0 0 8px' }}>Your team invitation is saved</p>
          <p style={{ fontSize: 13, color: '#8a7a68', margin: 0, lineHeight: 1.6 }}>
            Setlistr approval is required before you can accept it. Request access below — once you're approved, revisiting this page (or the link in your invite email) will take you straight to the invitation.
          </p>
        </div>
      ) : (
        <p className="text-[#6a6660] text-center text-sm max-w-xs mb-8">
          Setlistr is invite-only. Request access and we'll be in touch.
        </p>
      )}
      <div className="bg-[#1a1814] border border-[#2e2b26] rounded-2xl px-6 py-6 text-center w-full max-w-md">
        <p className="text-xs text-[#4a4640] uppercase tracking-wider mb-4">Need access?</p>
        <WaitlistForm />
      </div>
    </div>
  )
}
