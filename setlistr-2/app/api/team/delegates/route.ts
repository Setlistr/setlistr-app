import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getBaseUrl } from '@/lib/baseUrl'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type DelegateRow = {
  // Nullable since migration 0024 — a pending invite to an email with
  // no account yet uses NULL (new convention) or, for pre-0024 rows
  // still outstanding during the rollout, the legacy artist_id
  // placeholder. Every filter below already treats both correctly
  // (equality checks against a real id, never a string method).
  id: string; delegate_id: string | null; role: string
  accepted_at: string | null; declined_at: string | null; revoked_at: string | null
  invited_at: string; invited_by: string; invited_email: string | null; invite_token: string | null
}

type ProfileInfo = { artist_name: string | null; full_name: string | null; avatar_url: string | null; email: string | null }

async function profilesById(ids: string[]): Promise<Record<string, ProfileInfo>> {
  if (ids.length === 0) return {}
  const { data } = await supabase.from('profiles').select('id, artist_name, full_name, avatar_url, email').in('id', ids)
  const out: Record<string, ProfileInfo> = {}
  data?.forEach(p => { out[p.id] = { artist_name: p.artist_name, full_name: p.full_name, avatar_url: p.avatar_url, email: p.email } })
  return out
}

// Owner view — full detail across all three sections. Separate shape from
// buildManagerRosterView below, not the same payload with fields stripped
// in React: a manager's response never travels through this function at
// all, so there's no field here a bug could forget to hide.
async function buildOwnerView(artistId: string) {
  const { data } = await supabase
    .from('artist_delegates')
    .select('id, delegate_id, role, accepted_at, declined_at, revoked_at, invited_at, invited_by, invited_email, invite_token')
    .eq('artist_id', artistId)
    .order('invited_at', { ascending: false })

  // A revoked row is never active, pending, or requesting — regardless of
  // what accepted_at/declined_at happen to hold, it belongs in none of the
  // three sections.
  const rows = ((data || []) as DelegateRow[]).filter(d => !d.revoked_at)

  // A manager-initiated request has invited_by === delegate_id === the
  // real requesting manager's own id. This can NEVER equal artistId
  // (request/route.ts blocks a manager from requesting access to their
  // own account), so anchoring the check against the known artistId —
  // rather than comparing invited_by to delegate_id directly — is what
  // actually distinguishes it from an artist-initiated invite to an email
  // with no account yet, where delegate_id is a PLACEHOLDER equal to
  // artist_id until accepted. That placeholder also makes invited_by
  // (artist_id) equal delegate_id (also artist_id) by coincidence, which
  // a bare invited_by === delegate_id comparison cannot tell apart from a
  // real request.
  const isIncomingRequest = (d: DelegateRow) => d.invited_by === d.delegate_id && d.invited_by !== artistId

  // Both branches of this filter guarantee a real, non-null delegate_id:
  // an accepted row is only ever rebound to a real id atomically
  // alongside accepted_at (see app/api/team/accept/route.ts), and an
  // incoming request's delegate_id IS invited_by, already known
  // non-null. Never true for a still-pending, no-account-yet invite
  // (delegate_id null or the legacy artist_id placeholder), which this
  // filter excludes either way.
  const realIds = rows
    .filter(d => (d.delegate_id !== artistId && d.accepted_at) || isIncomingRequest(d))
    .map(d => d.delegate_id!)
  const profiles = await profilesById(realIds)
  const nameFor = (p?: ProfileInfo) => p?.artist_name || p?.full_name || null
  const BASE_URL = getBaseUrl()

  const incoming = rows
    .filter(d => isIncomingRequest(d) && !d.accepted_at && !d.declined_at)
    .map(d => {
      const p = profiles[d.delegate_id!] // real id — isIncomingRequest guarantees it
      return {
        id: d.id, delegate_id: d.delegate_id,
        name: nameFor(p) || d.invited_email || 'Unknown',
        email: p?.email || d.invited_email || null,
        role: d.role, invited_at: d.invited_at, avatar_url: p?.avatar_url || null,
      }
    })

  const members = rows
    .filter(d => !!d.accepted_at)
    .map(d => {
      const p = profiles[d.delegate_id!] // real id — accepted rows are always rebound atomically
      // Owner view already includes this member's email as its own field
      // right below (rendered alongside the name in the Team page), so
      // falling back to it here exposes nothing the owner can't already
      // see — unlike buildManagerRosterView below, which never selects
      // email at all and must not start implying one through this fallback.
      return {
        id: d.id, delegate_id: d.delegate_id,
        name: nameFor(p) || p?.email || 'Team member',
        email: p?.email || null,
        role: d.role, accepted_at: d.accepted_at, avatar_url: p?.avatar_url || null,
      }
    })

  // Pending invites the ARTIST sent — the direction GET's old single list
  // used to mix in with active members. delegate_id is still the
  // artist_id placeholder here until accepted, so it's never looked up as
  // a real profile above.
  const outgoing = rows
    .filter(d => d.invited_by === artistId && !d.accepted_at)
    .map(d => ({
      id: d.id, delegate_id: d.delegate_id,
      email: d.invited_email, role: d.role, invited_at: d.invited_at,
      invite_url: `${BASE_URL}/app/accept-invite?token=${d.invite_token}`,
      invite_token: d.invite_token,
    }))

  return { view: 'owner' as const, incoming, members, outgoing }
}

// Manager roster view — active members ONLY, minimal fields. No
// invite_token, no pending/incoming rows, no other member's email — per
// the explicit scope decision that a manager's visibility is narrower
// than the owner's, not the same payload filtered client-side.
async function buildManagerRosterView(artistId: string) {
  const { data } = await supabase
    .from('artist_delegates')
    .select('id, delegate_id, role, accepted_at')
    .eq('artist_id', artistId)
    .not('accepted_at', 'is', null)
    .is('revoked_at', null)
    .order('accepted_at', { ascending: false })

  // Query is already scoped to accepted_at IS NOT NULL, so every row's
  // delegate_id is real — only a still-pending invite can have a null
  // or placeholder one, and this query never returns those.
  const rows = (data || []) as Pick<DelegateRow, 'id' | 'delegate_id' | 'role' | 'accepted_at'>[]
  const profiles = await profilesById(rows.map(d => d.delegate_id!))

  const members = rows.map(d => {
    const p = profiles[d.delegate_id!]
    // Deliberately never falls back to email here — this view never
    // selects it at all (see this function's own doc comment: "no other
    // member's email" is a scope decision, not an oversight), so a nicer
    // fallback than "Unknown" still can't be the email.
    return {
      id: d.id, delegate_id: d.delegate_id,
      name: p?.artist_name || p?.full_name || 'Team member',
      role: d.role, accepted_at: d.accepted_at, avatar_url: p?.avatar_url || null,
    }
  })

  return { view: 'manager_roster' as const, members }
}

// Three distinct, server-authorized response shapes, never one owner
// payload with fields hidden in React. Which shape a caller gets is
// re-derived from their verified relationship to artistId on THIS
// request — the workspace selector (acting-as) is navigation, not a
// security boundary, so a stale selection, a direct artist_id
// substitution, or a pending/revoked delegation all get denied here
// exactly as they would with no selection at all.
export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get('artist_id')
  if (!artistId) return NextResponse.json({ error: 'artist_id required' }, { status: 400 })

  const authSupabase = await createServerSupabaseClient()
  const { data: { user } } = await authSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    if (user.id === artistId) {
      return NextResponse.json(await buildOwnerView(artistId))
    }

    const { data: delegation, error: delegationError } = await supabase
      .from('artist_delegates')
      .select('role, accepted_at')
      .eq('artist_id', artistId)
      .eq('delegate_id', user.id)
      .not('accepted_at', 'is', null)
      .is('revoked_at', null)
      .maybeSingle()

    if (delegationError) return NextResponse.json({ error: 'Authorization check failed' }, { status: 500 })
    if (!delegation) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    if (delegation.role === 'manager') {
      return NextResponse.json(await buildManagerRosterView(artistId))
    }

    // Tour manager / band member / viewer — their own access details only,
    // never the roster (product scope: "Do not expose the full roster in
    // this slice" for these roles).
    return NextResponse.json({ view: 'self' as const, role: delegation.role, accepted_at: delegation.accepted_at })
  } catch (err) {
    console.error('Delegates fetch error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { delegate_id, artist_id } = await req.json()
    if (!delegate_id || !artist_id) {
      return NextResponse.json({ error: 'delegate_id and artist_id required' }, { status: 400 })
    }

    const authSupabase = await createServerSupabaseClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    if (!user || user.id !== artist_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { error } = await supabase
      .from('artist_delegates')
      .delete()
      .eq('id', delegate_id)
      .eq('artist_id', artist_id) // verified above: caller's session must match artist_id

    if (error) return NextResponse.json({ error: 'Failed to revoke access' }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
