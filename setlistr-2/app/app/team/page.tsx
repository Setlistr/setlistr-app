'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useActingAs } from '@/components/ActingAsProvider'
import { Users, Check, X, Copy, Send, AlertCircle } from 'lucide-react'
import { ASSIGNABLE_INVITE_ROLES, type AssignableInviteRole } from '@/lib/inviteAuthorization'
import { roleInfoFor } from '@/lib/teamRoleInfo'
import { capabilitiesFor, type TeamView } from '@/lib/teamViewCapabilities'

const CARD = {
  background: 'linear-gradient(180deg, #171512 0%, #121009 100%)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
}
const C = {
  bg: '#0a0908', card: '#141210', border: 'rgba(255,255,255,0.07)', borderGold: 'rgba(201,168,76,0.3)',
  input: '#0f0e0c', inputBorder: 'rgba(255,255,255,0.09)',
  text: '#f0ece3', secondary: '#b8a888', muted: '#8a7a68',
  gold: '#c9a84c', goldDim: 'rgba(201,168,76,0.1)',
  green: '#4ade80', greenDim: 'rgba(74,222,128,0.08)',
  red: '#f87171', redDim: 'rgba(248,113,113,0.08)',
}

type OwnerIncoming = { id: string; delegate_id: string; name: string; email: string | null; role: string; invited_at: string; avatar_url: string | null }
type OwnerMember = { id: string; delegate_id: string; name: string; email: string | null; role: string; accepted_at: string; avatar_url: string | null }
type OwnerOutgoing = { id: string; delegate_id: string; email: string | null; role: string; invited_at: string; invite_url: string; invite_token: string | null }
type OwnerData = { view: 'owner'; incoming: OwnerIncoming[]; members: OwnerMember[]; outgoing: OwnerOutgoing[] }

type ManagerMember = { id: string; delegate_id: string; name: string; role: string; accepted_at: string; avatar_url: string | null }
type ManagerRosterData = { view: 'manager_roster'; members: ManagerMember[] }

type SelfData = { view: 'self'; role: string; accepted_at: string }

type TeamData = OwnerData | ManagerRosterData | SelfData

function initialsFor(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

function Avatar({ name, url }: { name: string; url?: string | null }) {
  return (
    <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
      {url ? <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ fontSize: 13, fontWeight: 800, color: C.gold }}>{initialsFor(name)}</span>}
    </div>
  )
}

function copyText(text: string) {
  try { navigator.clipboard.writeText(text) } catch {
    const el = document.createElement('textarea')
    el.value = text; document.body.appendChild(el); el.select()
    document.execCommand('copy'); document.body.removeChild(el)
  }
}

type RemainingConnection = { artist_id: string; artist_name: string; role: string; avatar_url?: string | null }

export default function TeamPage() {
  const router = useRouter()
  const { workspaceOwnerId, actingAs } = useActingAs()

  // Identity bootstrap — independent of workspaceOwnerId, loaded once.
  // Distinguishes a genuine artist's own (possibly still-empty) team from
  // a recruited manager who hasn't selected any artist yet, AND from a
  // former delegate with no artist identity of their own at all (e.g. a
  // Band Member whose last connection was just removed) — the two cases
  // that need a dedicated safe state rather than calling the API with the
  // viewer's own id as if it were an artist workspace, which silently
  // infers artist ownership from nothing more than "no one else was
  // selected."
  const [initializing, setInitializing] = useState(true)
  const [ownProfile, setOwnProfile] = useState<{ artist_name: string | null; full_name: string | null } | null>(null)
  const [recruitedAsManager, setRecruitedAsManager] = useState(false)
  const [remainingConnections, setRemainingConnections] = useState<RemainingConnection[]>([])
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadIdentity() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return
      const [{ data: profile }, { data: betaInvite }, managedRes] = await Promise.all([
        supabase.from('profiles').select('artist_name, full_name').eq('id', user.id).maybeSingle(),
        user.email
          ? supabase.from('beta_invites').select('invited_role').eq('email', user.email).maybeSingle()
          : Promise.resolve({ data: null as { invited_role: string } | null }),
        fetch('/api/team/managed-artists').then(r => r.ok ? r.json() : { managed: [] }).catch(() => ({ managed: [] })),
      ])
      if (cancelled) return
      setOwnProfile(profile ?? null)
      setRecruitedAsManager(betaInvite?.invited_role === 'manager')
      setRemainingConnections(managedRes?.managed || [])
      setInitializing(false)
    }
    loadIdentity()
    return () => { cancelled = true }
  }, [])

  async function handleSignOut() {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const hasArtistProfile = !!ownProfile?.artist_name
  const noArtistSelected = !initializing && !actingAs && recruitedAsManager && !hasArtistProfile
  // A former delegate with no connections left is NEITHER a genuine artist
  // (no artist_name) NOR someone who was ever recruited as a manager —
  // falling through both of those checks previously meant calling
  // /api/team/delegates with the viewer's OWN id, which that route treats
  // as an authoritative "you are the artist" signal (see its own comment:
  // identity equality, nothing else) and happily returns a full owner view
  // — incoming requests, members, an invite form — for an artist identity
  // that was never actually established. Never infer ownership OR manager
  // intent from the mere absence of a current selection.
  const disconnected = !initializing && !actingAs && !recruitedAsManager && !hasArtistProfile
  const workspaceName = actingAs ? actingAs.artist_name : (ownProfile?.artist_name || ownProfile?.full_name || 'Your workspace')

  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [data, setData] = useState<TeamData | null>(null)
  const [retryTick, setRetryTick] = useState(0)
  // Guards against a response for an artist the viewer has since switched
  // away from landing after a newer request already started — the
  // `cancelled` flag below is the primary guard; this ref additionally
  // confirms the artistId a response belongs to still matches at apply
  // time, so a reorder can't slip through either.
  const requestedForRef = useRef<string | null>(null)

  const loadTeam = useCallback(async () => {
    if (!workspaceOwnerId) return
    requestedForRef.current = workspaceOwnerId
    const forId = workspaceOwnerId
    setStatus('loading')
    setData(null) // clear immediately — never show the previous artist's rows while loading
    try {
      const res = await fetch(`/api/team/delegates?artist_id=${forId}`)
      if (requestedForRef.current !== forId) return
      if (!res.ok) { setStatus('error'); return }
      const json = await res.json()
      if (requestedForRef.current !== forId) return
      setData(json)
      setStatus('ready')
    } catch {
      if (requestedForRef.current !== forId) return
      setStatus('error')
    }
  }, [workspaceOwnerId])

  useEffect(() => {
    if (initializing || noArtistSelected || disconnected || !workspaceOwnerId) return
    loadTeam()
  }, [workspaceOwnerId, initializing, noArtistSelected, disconnected, retryTick, loadTeam])

  const capabilities = data ? capabilitiesFor(data.view as TeamView) : capabilitiesFor('self')

  // ── Invite form ──
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<AssignableInviteRole>('manager')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteResult, setInviteResult] = useState<{ invite_url: string; email_sent: boolean } | null>(null)

  async function sendInvite() {
    if (!inviteEmail.trim() || !workspaceOwnerId) return
    setInviting(true); setInviteError(''); setInviteResult(null)
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist_id: workspaceOwnerId, delegate_email: inviteEmail.trim(), role: inviteRole }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setInviteError(json.error || 'Something went wrong.'); return }
      setInviteResult({ invite_url: json.invite_url, email_sent: !!json.email_sent })
      setInviteEmail('')
      loadTeam()
    } catch {
      setInviteError('Network error — try again.')
    } finally {
      setInviting(false)
    }
  }

  // ── Approve / decline incoming requests ──
  const [responding, setResponding] = useState<string | null>(null)
  const [respondError, setRespondError] = useState<Record<string, string>>({})

  async function respond(id: string, decision: 'approve' | 'decline') {
    setResponding(id); setRespondError(prev => ({ ...prev, [id]: '' }))
    try {
      const res = await fetch('/api/team/respond', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delegation_id: id, decision }),
      })
      const json = await res.json()
      if (!res.ok) { setRespondError(prev => ({ ...prev, [id]: json.error || 'Could not respond — try again.' })); return }
      loadTeam()
    } catch {
      setRespondError(prev => ({ ...prev, [id]: 'Network error — try again.' }))
    } finally {
      setResponding(null)
    }
  }

  // ── Remove / cancel ── (same DELETE endpoint; copy differs by context)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<Record<string, string>>({})

  async function remove(id: string) {
    if (!workspaceOwnerId) return
    setRemoving(id); setRemoveError(prev => ({ ...prev, [id]: '' }))
    try {
      const res = await fetch('/api/team/delegates', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delegate_id: id, artist_id: workspaceOwnerId }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setRemoveError(prev => ({ ...prev, [id]: json.error || 'Could not remove — try again.' }))
        return
      }
      setConfirmRemoveId(null)
      loadTeam()
    } catch {
      setRemoveError(prev => ({ ...prev, [id]: 'Network error — try again.' }))
    } finally {
      setRemoving(null)
    }
  }

  // ── Resend (re-sends the email via the same authorized route, always
  // preserving the invitation's own stored role — never inviteRole above) ──
  const [resending, setResending] = useState<string | null>(null)
  const [resendDone, setResendDone] = useState<string | null>(null)
  const [resendError, setResendError] = useState<Record<string, string>>({})

  async function resend(o: OwnerOutgoing) {
    if (!workspaceOwnerId || !o.email) return
    setResending(o.id); setResendError(prev => ({ ...prev, [o.id]: '' }))
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist_id: workspaceOwnerId, delegate_email: o.email, role: o.role }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setResendError(prev => ({ ...prev, [o.id]: json.error || 'Could not resend — try again.' })); return }
      setResendDone(o.id)
      setTimeout(() => setResendDone(null), 2500)
    } catch {
      setResendError(prev => ({ ...prev, [o.id]: 'Network error — try again.' }))
    } finally {
      setResending(null)
    }
  }

  const [copiedId, setCopiedId] = useState<string | null>(null)
  function copyLink(id: string, url: string) {
    copyText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: C.input, border: `1px solid ${C.inputBorder}`,
    borderRadius: 10, padding: '11px 14px', color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.secondary, display: 'block', marginBottom: 6,
  }

  return (
    <div style={{ minHeight: '100svh', background: C.bg, fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ padding: '32px 16px 8px', maxWidth: 560, margin: '0 auto' }}>
        <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.3em', color: C.gold + '99', margin: '0 0 4px' }}>
          {actingAs ? 'Managed Workspace' : 'Your Workspace'}
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, margin: 0, letterSpacing: '-0.025em' }}>
          {workspaceName ? `${workspaceName}'s Team` : 'Team'}
        </h1>
      </div>

      <div style={{ padding: '16px 16px 60px', maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {initializing && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', border: `1.5px solid ${C.gold}`, animation: 'teamBreathe 1.8s ease-in-out infinite' }} />
          </div>
        )}

        {!initializing && noArtistSelected && (
          <div style={{ background: CARD.background, border: `1px solid ${C.border}`, borderRadius: 16, padding: '28px 22px', textAlign: 'center' as const, boxShadow: CARD.boxShadow }}>
            <Users size={28} color={C.muted} style={{ marginBottom: 10 }} />
            <p style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: '0 0 6px' }}>No artist selected</p>
            <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 18px', lineHeight: 1.5 }}>
              Select an artist from your roster to view and manage their team.
            </p>
            <Link href="/app/manager/artists" style={{ display: 'inline-flex', padding: '11px 20px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>
              Go to Your Artists
            </Link>
          </div>
        )}

        {/* Former delegate with no connections left — e.g. the last team
            they belonged to just removed their access. Never styled or
            worded as if they own or manage anything; never calls
            /api/team/delegates for their own id, which would otherwise
            read as a legitimate (if empty) owner workspace. */}
        {!initializing && disconnected && (
          <div style={{ background: CARD.background, border: `1px solid ${C.border}`, borderRadius: 16, padding: '28px 22px', textAlign: 'center' as const, boxShadow: CARD.boxShadow, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <Users size={28} color={C.muted} style={{ marginBottom: 2 }} />
            <p style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: 0 }}>No connected workspace</p>
            <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 8px', lineHeight: 1.5 }}>
              You don't currently have access to an artist's workspace. This can happen if a team connection was removed.
            </p>
            {remainingConnections.length > 0 && (
              <Link href="/app/manager/artists" style={{ display: 'inline-flex', padding: '11px 20px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>
                You still have access to {remainingConnections.length} other artist{remainingConnections.length === 1 ? '' : 's'} →
              </Link>
            )}
            <button onClick={handleSignOut} disabled={signingOut}
              style={{ width: '100%', padding: '13px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 10, color: C.secondary, fontSize: 14, fontWeight: 700, cursor: signingOut ? 'default' : 'pointer', fontFamily: 'inherit', opacity: signingOut ? 0.6 : 1 }}>
              {signingOut ? 'Signing out…' : 'Sign Out'}
            </button>
          </div>
        )}

        {!initializing && !noArtistSelected && !disconnected && status === 'loading' && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', border: `1.5px solid ${C.gold}`, animation: 'teamBreathe 1.8s ease-in-out infinite' }} />
          </div>
        )}

        {!initializing && !noArtistSelected && !disconnected && status === 'error' && (
          <div style={{ background: CARD.background, border: '1px solid rgba(248,113,113,0.25)', borderRadius: 16, padding: '24px 22px', textAlign: 'center' as const }}>
            <AlertCircle size={22} color={C.red} style={{ marginBottom: 8 }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 6px' }}>Couldn't load the team</p>
            <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 16px' }}>Nothing was loaded — this is not an empty team.</p>
            <button onClick={() => setRetryTick(t => t + 1)}
              style={{ padding: '11px 20px', background: C.gold, border: 'none', borderRadius: 10, color: '#0a0908', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              Retry
            </button>
          </div>
        )}

        {!initializing && !noArtistSelected && !disconnected && status === 'ready' && data?.view === 'self' && (
          <div style={{ background: CARD.background, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: CARD.boxShadow }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={15} color={C.gold} />
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.secondary, margin: 0 }}>Your Access</p>
            </div>
            <p style={{ fontSize: 16, fontWeight: 800, color: C.gold, margin: 0 }}>{roleInfoFor(data.role).label}</p>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {roleInfoFor(data.role).capabilities.map((c, i) => (
                <li key={i} style={{ fontSize: 13, color: C.secondary, display: 'flex', gap: 8 }}>
                  <span style={{ color: C.gold, flexShrink: 0 }}>·</span>{c}
                </li>
              ))}
            </ul>
            <p style={{ fontSize: 12, color: C.muted, margin: '6px 0 0', lineHeight: 1.5, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
              {workspaceName} and any managers on this team can invite new teammates — only {workspaceName} can approve requests or remove access.
            </p>
          </div>
        )}

        {!initializing && !noArtistSelected && !disconnected && status === 'ready' && (data?.view === 'owner' || data?.view === 'manager_roster') && (
          <>
            {data.view === 'manager_roster' && (
              <div style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 12, padding: '12px 14px' }}>
                <p style={{ fontSize: 12, color: C.secondary, margin: 0, lineHeight: 1.5 }}>
                  You can invite teammates on {workspaceName}'s behalf. Only {workspaceName} can approve requests, cancel invitations, or remove access.
                </p>
              </div>
            )}

            {/* ── Incoming requests (owner only) ── */}
            {data.view === 'owner' && data.incoming.length > 0 && (
              <div style={{ background: CARD.background, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: CARD.boxShadow }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.gold, margin: 0 }}>Requesting Access</p>
                {data.incoming.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10, flexWrap: 'wrap' as const }}>
                    <Avatar name={r.name} url={r.avatar_url} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</p>
                      <p style={{ fontSize: 11, color: C.muted, margin: '1px 0 0' }}>{r.email ? `${r.email} · ` : ''}Wants {roleInfoFor(r.role).label.toLowerCase()} access · {timeAgo(r.invited_at)}</p>
                      {respondError[r.id] && <p style={{ fontSize: 11, color: C.red, margin: '3px 0 0' }}>{respondError[r.id]}</p>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => respond(r.id, 'decline')} disabled={responding === r.id}
                        style={{ background: 'none', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '6px 11px', color: C.red, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', opacity: responding === r.id ? 0.5 : 1 }}>
                        Decline
                      </button>
                      <button onClick={() => respond(r.id, 'approve')} disabled={responding === r.id}
                        style={{ background: C.gold, border: 'none', borderRadius: 8, padding: '6px 11px', color: '#0a0908', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: responding === r.id ? 0.5 : 1 }}>
                        {responding === r.id ? '...' : 'Approve'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Active members ── */}
            <div style={{ background: CARD.background, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: CARD.boxShadow }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.secondary, margin: 0 }}>Active Members</p>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.green, background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 20, padding: '3px 10px' }}>
                  {data.members.length}
                </span>
              </div>
              {data.members.length === 0 ? (
                <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>No team members yet.</p>
              ) : data.members.map(m => {
                const emailLine = data.view === 'owner' ? (m as OwnerMember).email : null
                return (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'rgba(255,255,255,0.02)', border: `1px solid rgba(74,222,128,0.15)`, borderRadius: 10, flexWrap: 'wrap' as const }}>
                    <Avatar name={m.name} url={m.avatar_url} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</p>
                      <p style={{ fontSize: 11, color: C.muted, margin: '1px 0 0' }}>
                        {roleInfoFor(m.role).label}{emailLine ? ` · ${emailLine}` : ''} · Joined {timeAgo(m.accepted_at)}
                      </p>
                      {capabilities.canRemove && removeError[m.id] && <p style={{ fontSize: 11, color: C.red, margin: '3px 0 0' }}>{removeError[m.id]}</p>}
                    </div>
                    {capabilities.canRemove && (
                      confirmRemoveId === m.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, width: '100%' }}>
                          <p style={{ fontSize: 11, color: C.secondary, margin: 0 }}>Remove {m.name} from {workspaceName}'s team?</p>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => setConfirmRemoveId(null)}
                              style={{ flex: 1, background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', color: C.secondary, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                              Cancel
                            </button>
                            <button onClick={() => remove(m.id)} disabled={removing === m.id}
                              style={{ flex: 1, background: C.red, border: 'none', borderRadius: 8, padding: '6px 10px', color: '#0a0908', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: removing === m.id ? 0.6 : 1 }}>
                              {removing === m.id ? '...' : 'Confirm Remove'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmRemoveId(m.id)}
                          style={{ background: 'none', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '6px 11px', color: C.red, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <X size={11} /> Remove
                        </button>
                      )
                    )}
                  </div>
                )
              })}
            </div>

            {/* ── Outgoing invitations (owner only) ── */}
            {data.view === 'owner' && data.outgoing.length > 0 && (
              <div style={{ background: CARD.background, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: CARD.boxShadow }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.secondary, margin: 0 }}>Outgoing Invitations</p>
                {data.outgoing.map(o => (
                  <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`, borderRadius: 10, flexWrap: 'wrap' as const }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: C.goldDim, border: `1px solid ${C.borderGold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: C.gold }}>{(o.email || '?').charAt(0).toUpperCase()}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* The email IS the identifier for a pending, not-yet-
                          registered recipient — unlike a name, hard-truncating
                          it with ellipsis can cut off enough of a long address
                          (especially the domain) that the artist can't verify
                          who they actually invited. Wraps instead; title is a
                          native-tooltip backup for anyone who still wants it
                          on one line via their own browser zoom/width. */}
                      <p title={o.email || 'Unknown'} style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0, wordBreak: 'break-all' }}>{o.email || 'Unknown'}</p>
                      <p style={{ fontSize: 11, color: C.muted, margin: '1px 0 0' }}>{roleInfoFor(o.role).label} · Invited {timeAgo(o.invited_at)}</p>
                      {resendError[o.id] && <p style={{ fontSize: 11, color: C.red, margin: '3px 0 0' }}>{resendError[o.id]}</p>}
                      {removeError[o.id] && <p style={{ fontSize: 11, color: C.red, margin: '3px 0 0' }}>{removeError[o.id]}</p>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' as const }}>
                      <button onClick={() => copyLink(o.id, o.invite_url)}
                        style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', color: C.muted, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Copy size={10} /> {copiedId === o.id ? 'Copied' : 'Copy Link'}
                      </button>
                      <button onClick={() => resend(o)} disabled={resending === o.id}
                        style={{ background: 'none', border: `1px solid ${C.borderGold}`, borderRadius: 8, padding: '6px 10px', color: C.gold, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, opacity: resending === o.id ? 0.6 : 1 }}>
                        <Send size={10} /> {resending === o.id ? '...' : resendDone === o.id ? 'Sent' : 'Resend'}
                      </button>
                      {confirmRemoveId === o.id ? (
                        <>
                          <span style={{ fontSize: 11, color: C.secondary, display: 'block', width: '100%' }}>Cancel invitation to {o.email} for {workspaceName}'s team?</span>
                          <button onClick={() => setConfirmRemoveId(null)}
                            style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', color: C.secondary, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                            Keep
                          </button>
                          <button onClick={() => remove(o.id)} disabled={removing === o.id}
                            style={{ background: C.red, border: 'none', borderRadius: 8, padding: '6px 10px', color: '#0a0908', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: removing === o.id ? 0.6 : 1 }}>
                            {removing === o.id ? '...' : 'Confirm Cancel'}
                          </button>
                        </>
                      ) : (
                        <button onClick={() => setConfirmRemoveId(o.id)}
                          style={{ background: 'none', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '6px 10px', color: C.red, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <X size={10} /> Cancel
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Invite form ── */}
            {capabilities.canInvite && (
              <div style={{ background: CARD.background, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: CARD.boxShadow }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.secondary, margin: 0 }}>Invite Someone</p>
                <div>
                  <label style={labelStyle}>Role</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: 10 }}>
                    {ASSIGNABLE_INVITE_ROLES.map(r => {
                      const active = inviteRole === r
                      return (
                        <button key={r} type="button" onClick={() => { setInviteRole(r); setInviteError(''); setInviteResult(null) }}
                          style={{ padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', background: active ? C.goldDim : 'transparent', border: `1px solid ${active ? C.borderGold : C.inputBorder}`, color: active ? C.gold : C.secondary }}>
                          {roleInfoFor(r).label}
                        </button>
                      )
                    })}
                  </div>
                  <div style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, margin: '0 0 6px' }}>
                      What {roleInfoFor(inviteRole).label.toLowerCase()} access grants
                    </p>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {roleInfoFor(inviteRole).capabilities.map((c, i) => (
                        <li key={i} style={{ fontSize: 12, color: C.secondary, display: 'flex', gap: 6 }}>
                          <span style={{ color: C.gold, flexShrink: 0 }}>·</span>{c}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <label style={labelStyle}>Invite by email</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                    <input value={inviteEmail} onChange={e => { setInviteEmail(e.target.value); setInviteError(''); setInviteResult(null) }}
                      onKeyDown={e => e.key === 'Enter' && sendInvite()} placeholder="teammate@email.com" type="email"
                      style={{ ...inputStyle, flex: 1, minWidth: 180 }} />
                    <button onClick={sendInvite} disabled={inviting || !inviteEmail.trim()}
                      style={{ padding: '11px 16px', background: inviteEmail.trim() ? C.gold : 'rgba(255,255,255,0.04)', border: `1px solid ${inviteEmail.trim() ? C.gold : C.border}`, borderRadius: 10, color: inviteEmail.trim() ? '#0a0908' : C.muted, fontSize: 13, fontWeight: 700, cursor: inviting || !inviteEmail.trim() ? 'default' : 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                      {inviting ? '...' : 'Invite'}
                    </button>
                  </div>
                </div>
                {inviteError && (
                  <div style={{ background: C.redDim, border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: '11px 14px' }}>
                    <p style={{ fontSize: 13, color: C.red, margin: 0 }}>{inviteError}</p>
                  </div>
                )}
                {inviteResult && (
                  <div style={{ background: C.greenDim, border: '1px solid rgba(74,222,128,0.2)', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Check size={14} color={C.green} strokeWidth={2.5} />
                      <p style={{ fontSize: 13, fontWeight: 700, color: C.green, margin: 0 }}>
                        {inviteResult.email_sent ? 'Invite email sent' : 'Invite created'}
                      </p>
                    </div>
                    <button onClick={() => copyLink('new-invite', inviteResult.invite_url)}
                      style={{ padding: '10px', background: 'transparent', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 10, color: C.secondary, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      {copiedId === 'new-invite' ? <><Check size={12} strokeWidth={2.5} /> Link Copied</> : <><Copy size={12} /> Copy Invite Link</>}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes teamBreathe { 0%,100% { transform: scale(1); opacity: .3 } 50% { transform: scale(1.2); opacity: .8 } }
        * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
      `}</style>
    </div>
  )
}
