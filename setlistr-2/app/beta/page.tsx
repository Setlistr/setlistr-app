import Image from 'next/image'
import { cookies } from 'next/headers'
import WaitlistForm from '@/components/WaitlistForm'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function BetaPage() {
  // Set by middleware.ts only when a real, un-admitted user followed an
  // actual team-invite link to /app/accept-invite — never trusted beyond
  // "show a more specific message"; beta admission itself still happens
  // the normal way (admin grants access or the waitlist converts them),
  // and middleware re-checks that on every request regardless of this.
  const pendingInvite = cookies().get('sl_pending_team_invite')?.value
  const hasPendingInvite = !!pendingInvite && UUID_RE.test(pendingInvite)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-cream px-6 py-12"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #1e1c18 0%, #0f0e0c 100%)' }}>
      <Image src="/logo-pill.png" alt="Setlistr" width={200} height={52} className="mb-8" />
      {hasPendingInvite ? (
        <div style={{ textAlign: 'center', maxWidth: 360, marginBottom: 32 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#c9a84c', margin: '0 0 8px' }}>You have a pending team invitation</p>
          <p style={{ fontSize: 13, color: '#8a7a68', margin: 0, lineHeight: 1.6 }}>
            Setlistr is invite-only, so we need to approve your account first — request access below and we'll get you straight to the invitation once you're in.
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
