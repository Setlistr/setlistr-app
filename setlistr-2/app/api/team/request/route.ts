import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { escapeHtml } from '@/lib/escapeHtml'
import { getBaseUrl } from '@/lib/baseUrl'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_URL = getBaseUrl()
const RESEND_API_KEY = process.env.RESEND_API_KEY

// Manager-initiated connection request — the reverse direction of
// app/api/team/invite (artist invites a delegate). Same table, same
// accepted_at/role semantics once approved; distinguished only by
// invited_by = delegate_id (see migration 0023's own comment for why
// that convention is safe to reuse).
//
// Enumeration: a FIRST-time request for any given email always returns
// the identical { status: 'requested', ... } shape, whether or not that
// email has an account — this route performs a comparable lookup in both
// branches so the response is not trivially distinguishable by shape, but
// no claim is made about timing; this has not been measured and is not a
// guaranteed side-channel defense. The one place this route DOES
// differentiate is a repeat request for an email the SAME manager has
// already successfully requested before — that describes the manager's
// own established request history, which they already know about, not
// new information about an unrelated account.
async function sendRequestEmail({ to, managerName, managerEmail, artistName }: {
  to: string; managerName: string; managerEmail: string; artistName: string
}) {
  if (!RESEND_API_KEY) return false

  const settingsUrl = `${BASE_URL}/app/team`
  const safeManagerName = escapeHtml(managerName)
  const safeManagerEmail = escapeHtml(managerEmail)
  const safeArtistName = escapeHtml(artistName)

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; background: #0a0908; color: #f0ece3; padding: 40px 32px; border-radius: 16px;">
      <img src="https://setlistr.ai/logo-white-tight.png" width="160" alt="Setlistr" style="display: block; height: auto; margin: 0 0 24px;" />
      <h1 style="font-size: 24px; font-weight: 800; color: #f0ece3; margin: 0 0 12px; letter-spacing: -0.025em; line-height: 1.2;">
        Someone wants to manage your account
      </h1>
      <p style="font-size: 14px; color: #b8a888; margin: 0 0 16px; line-height: 1.6;">
        Hi ${safeArtistName},
      </p>
      <p style="font-size: 14px; color: #b8a888; margin: 0 0 24px; line-height: 1.6;">
        <strong style="color: #f0ece3;">${safeManagerName}</strong> (${safeManagerEmail}) has requested manager access to your Setlistr account — capturing shows, reviewing setlists, and preparing claim information on your behalf. Nothing happens unless you approve it.
      </p>
      <a href="${settingsUrl}" style="display: inline-block; background: #c9a84c; color: #0a0908; font-size: 14px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; text-decoration: none; padding: 16px 32px; border-radius: 12px; margin-bottom: 24px;">
        Review Request →
      </a>
      <p style="font-size: 12px; color: #8a7a68; margin: 0 0 24px; line-height: 1.6;">
        Or go to Settings → Team on setlistr.ai to approve or decline.
      </p>
      <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.07); margin: 24px 0;" />
      <p style="font-size: 11px; color: #8a7a68; margin: 0;">
        Questions? <a href="mailto:info@setlistr.ai" style="color: #c9a84c;">info@setlistr.ai</a> · <a href="https://setlistr.ai" style="color: #c9a84c;">setlistr.ai</a>
      </p>
    </div>
  `

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Setlistr <invites@setlistr.ai>', to, subject: `${managerName || managerEmail} wants to manage your Setlistr account`, html }),
    })
    if (!res.ok) { console.error('Resend request-notify error:', await res.text()); return false }
    return true
  } catch (err) {
    console.error('Request-notify email failed:', err)
    return false
  }
}

const GENERIC_RESPONSE = { status: 'requested', message: "If that email has a Setlistr artist account, they'll now see your request in Team settings." }

export async function POST(req: NextRequest) {
  try {
    const authSupabase = await createServerSupabaseClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { artist_email } = await req.json()
    const email = typeof artist_email === 'string' ? artist_email.trim().toLowerCase() : ''
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
    }
    if (email === (user.email || '').toLowerCase()) {
      return NextResponse.json({ error: "You can't request access to your own account." }, { status: 400 })
    }

    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('artist_name, full_name')
      .eq('id', user.id)
      .single()
    const managerName = callerProfile?.artist_name || callerProfile?.full_name || user.email || 'A manager'

    // Describes the MANAGER'S OWN prior request history for this exact
    // email, scoped to delegate_id = this caller — never another user's
    // requests, never information about an account the caller hasn't
    // already successfully reached before.
    const { data: ownHistory } = await supabase
      .from('artist_delegates')
      .select('id, artist_id, accepted_at, declined_at, revoked_at')
      .eq('delegate_id', user.id)
      .eq('invited_by', user.id)
      .eq('invited_email', email)
      .order('invited_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (ownHistory) {
      if (ownHistory.accepted_at && !ownHistory.revoked_at) {
        return NextResponse.json({ status: 'already_connected', message: 'You already have access to this artist.' })
      }
      if (ownHistory.revoked_at) {
        return NextResponse.json({ status: 'revoked', message: 'Your access to this artist was removed. Contact them directly to reconnect.' })
      }
      if (ownHistory.declined_at) {
        return NextResponse.json({ status: 'declined', message: 'Your previous request for this email was declined.' })
      }
      // Still pending — a resend is a legitimate controlled retry of the
      // notification, never a second row.
      const { data: artist } = await supabase.from('profiles').select('artist_name, full_name').eq('id', ownHistory.artist_id).single()
      const artistName = artist?.artist_name || artist?.full_name || 'the artist'
      const emailSent = await sendRequestEmail({ to: email, managerName, managerEmail: user.email || '', artistName })
      return NextResponse.json({ status: 'pending', message: 'Request already pending — notification resent.', email_sent: emailSent })
    }

    // First contact for this (manager, email) pair. Equivalent lookup
    // work happens in both branches below so a found/not-found email
    // can't be told apart by response shape — not a measured timing
    // guarantee, just not a trivially different code path.
    const { data: artist } = await supabase
      .from('profiles')
      .select('id, artist_name, full_name')
      .eq('email', email)
      .maybeSingle()

    if (artist) {
      const { error: insertError } = await supabase
        .from('artist_delegates')
        .insert({
          artist_id: artist.id, delegate_id: user.id, role: 'manager',
          invited_by: user.id, invited_email: email,
        })
      if (insertError) {
        console.error('Request insert error:', insertError)
        // Still return the generic response — a DB error here must not
        // become an enumeration signal either.
        return NextResponse.json(GENERIC_RESPONSE)
      }
      const artistName = artist.artist_name || artist.full_name || 'the artist'
      await sendRequestEmail({ to: email, managerName, managerEmail: user.email || '', artistName })
    }

    return NextResponse.json(GENERIC_RESPONSE)
  } catch (err) {
    console.error('Team request error:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

// GET — the caller's own outgoing requests. Scoped to delegate_id = caller
// AND invited_by = delegate_id (never shows artist-initiated invites the
// caller happens to be the delegate_id of — those are a different list,
// already served by GET /api/team/delegates from the artist's side).
export async function GET(req: NextRequest) {
  const authSupabase = await createServerSupabaseClient()
  const { data: { user } } = await authSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: rows } = await supabase
    .from('artist_delegates')
    .select('id, artist_id, invited_email, invited_at, accepted_at, declined_at, revoked_at')
    .eq('delegate_id', user.id)
    .eq('invited_by', user.id)
    .order('invited_at', { ascending: false })

  if (!rows || rows.length === 0) return NextResponse.json({ requests: [] })

  const artistIds = rows.map(r => r.artist_id)
  const { data: profiles } = await supabase.from('profiles').select('id, artist_name, full_name').in('id', artistIds)
  const nameById: Record<string, string> = {}
  profiles?.forEach(p => { nameById[p.id] = p.artist_name || p.full_name || 'Unknown' })

  const requests = rows.map(r => ({
    id: r.id,
    artist_name: nameById[r.artist_id] || r.invited_email,
    invited_email: r.invited_email,
    invited_at: r.invited_at,
    status: r.revoked_at ? 'revoked' : r.accepted_at ? 'accepted' : r.declined_at ? 'declined' : 'pending',
  }))

  return NextResponse.json({ requests })
}
