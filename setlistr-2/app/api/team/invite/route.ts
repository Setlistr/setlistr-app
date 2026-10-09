import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { canCreateInvite, isAssignableInviteRole } from '@/lib/inviteAuthorization'
import { getBaseUrl } from '@/lib/baseUrl'
import { roleInfoFor } from '@/lib/teamRoleInfo'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_URL = getBaseUrl()
const RESEND_API_KEY = process.env.RESEND_API_KEY

// Returns whether the email actually went out — never just whether a
// key is configured. Every caller below reports THIS value as
// email_sent, not !!RESEND_API_KEY, so the response reflects actual
// delivery, not configuration.
async function sendInviteEmail({
  to, artistName, inviteUrl, delegateFound, role,
}: {
  to: string
  artistName: string
  inviteUrl: string
  delegateFound: boolean
  role: string
}): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email send')
    return false
  }

  const subject = `${artistName} added you to their Setlistr account`

  // Capability text pulled from the SAME single source of truth the Team
  // page and the accept screen already render from (lib/teamRoleInfo.ts)
  // — never a separate description written here that could drift from
  // what the role actually grants, which is exactly what happened before
  // this fix: every invite email said "capturing shows... preparing
  // claim information" regardless of role, including for Viewer, who is
  // explicitly read-only and can't do either.
  const { label, capabilities } = roleInfoFor(role)
  const roleLabelLower = label.toLowerCase()
  const capabilitiesList = capabilities.map(c =>
    `<li style="font-size: 13px; color: #b8a888; margin: 0 0 6px; padding-left: 16px; position: relative;"><span style="position: absolute; left: 0; color: #c9a84c;">·</span>${c}</li>`
  ).join('')

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; background: #0a0908; color: #f0ece3; padding: 40px 32px; border-radius: 16px;">
      <img src="https://setlistr.ai/logo-white-tight.png" width="160" alt="Setlistr" style="display: block; height: auto; margin: 0 0 24px;" />
      <h1 style="font-size: 24px; font-weight: 800; color: #f0ece3; margin: 0 0 12px; letter-spacing: -0.025em; line-height: 1.2;">
        ${artistName} invited you to their team
      </h1>
      <p style="font-size: 14px; color: #b8a888; margin: 0 0 20px; line-height: 1.6;">
        ${delegateFound
          ? `You've been added as a ${roleLabelLower} on ${artistName}'s Setlistr account.`
          : `${artistName} is using Setlistr to track live performance royalties and has invited you as a ${roleLabelLower}.`
        }
      </p>
      <div style="background: #141210; border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 14px 18px; margin: 0 0 24px;">
        <p style="font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #8a7a68; margin: 0 0 8px;">As a ${roleLabelLower} you can</p>
        <ul style="margin: 0; padding: 0; list-style: none;">${capabilitiesList}</ul>
      </div>
      <a href="${inviteUrl}" style="display: inline-block; background: #c9a84c; color: #0a0908; font-size: 14px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; text-decoration: none; padding: 16px 32px; border-radius: 12px; margin-bottom: 24px;">
        Accept Invite
      </a>
      <p style="font-size: 12px; color: #8a7a68; margin: 0 0 24px; line-height: 1.6;">
        Or copy this link: <span style="color: #b8a888;">${inviteUrl}</span>
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
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Setlistr <invites@setlistr.ai>',
        to,
        subject,
        html,
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error('Resend error:', err)
      return false
    }
    return true
  } catch (err) {
    console.error('Email send failed:', err)
    return false
  }
}

export async function POST(req: NextRequest) {
  try {
    const { artist_id, delegate_email, role = 'manager' } = await req.json()

    if (!artist_id || !delegate_email) {
      return NextResponse.json({ error: 'artist_id and delegate_email required' }, { status: 400 })
    }

    // Requested role must be one of the four assignable roles — 'owner' can
    // never be assigned (it is resolved from identity equality, never
    // stored), and an unrecognized value is rejected outright rather than
    // silently defaulting to anything.
    if (!isAssignableInviteRole(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    // Caller must be authenticated before artist_id is trusted for anything.
    const authSupabase = await createServerSupabaseClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Authorized only if the caller IS the artist (identity equality, never
    // a stored role string), or holds a currently accepted, non-revoked
    // MANAGER delegation for this exact artist_id. Every other role
    // (viewer, tour_manager, band_member), an unaccepted invitation, a
    // revoked delegation, a delegation for a different artist, or no
    // delegation row at all — all deny. See lib/inviteAuthorization.ts.
    if (user.id !== artist_id) {
      const { data: delegation } = await supabase
        .from('artist_delegates')
        .select('artist_id, role, accepted_at, revoked_at')
        .eq('artist_id', artist_id)
        .eq('delegate_id', user.id)
        .maybeSingle()

      if (!canCreateInvite({ actorId: user.id, artistId: artist_id, delegation })) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    const { data: artist } = await supabase
      .from('profiles')
      .select('artist_name, full_name')
      .eq('id', artist_id)
      .single()

    if (!artist) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 })
    }

    const artistDisplayName = artist.artist_name || artist.full_name || 'An artist'

    const { data: delegateUser } = await supabase
      .from('profiles')
      .select('id, artist_name, full_name')
      .eq('email', delegate_email.toLowerCase().trim())
      .maybeSingle()

    if (delegateUser) {
      const { data: existing, error: existingError } = await supabase
        .from('artist_delegates')
        .select('id, accepted_at, declined_at, revoked_at, invite_token, role')
        .eq('artist_id', artist_id)
        .eq('delegate_id', delegateUser.id)
        .maybeSingle()

      if (existingError) {
        console.error('Existing-delegation lookup error:', existingError)
        return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
      }

      if (existing?.accepted_at) {
        return NextResponse.json({ error: 'This person already has access to your account' }, { status: 409 })
      }

      // A terminal row (declined or revoked) is never a usable pending
      // invite — falls through to the insert below, which creates a
      // fresh row (and fresh token) rather than resurrecting this one.
      if (existing && !existing.declined_at && !existing.revoked_at) {
        const inviteUrl = `${BASE_URL}/app/accept-invite?token=${existing.invite_token}`
        const emailSent = await sendInviteEmail({ to: delegate_email, artistName: artistDisplayName, inviteUrl, delegateFound: true, role: existing.role })
        return NextResponse.json({
          success: true,
          email_sent: emailSent,
          delegate_found: true,
          delegate_name: delegateUser.artist_name || delegateUser.full_name,
          invite_url: inviteUrl,
          already_exists: true,
        })
      }
    } else {
      // No Setlistr account yet — still dedupe by (artist_id,
      // invited_email) before falling through to the insert below.
      // Without this, resending to an email with no account created a
      // SECOND delegation row with a new invite_token and whatever role
      // this particular request happened to carry (e.g. the invite
      // form's current/default selection) — silently overriding the
      // originally-chosen role on every resend. Reusing the existing
      // row's own stored role/token, exactly like the delegateUser
      // branch above does, is what actually preserves it.
      //
      // Matches BOTH placeholder conventions during the rollout: a
      // legacy row (delegate_id = artist_id, pre-migration-0024) and a
      // new row (delegate_id = null, post-0024) for the same invited
      // email are the same logical pending invite — either shape must
      // be found and reused here, never duplicated. declined_at/
      // revoked_at excluded — a terminal row is never a usable pending
      // invite to resend; it falls through to a fresh insert instead.
      const { data: existingByEmail, error: existingByEmailError } = await supabase
        .from('artist_delegates')
        .select('id, invite_token, role')
        .eq('artist_id', artist_id)
        .eq('invited_email', delegate_email.toLowerCase().trim())
        .is('accepted_at', null)
        .is('declined_at', null)
        .is('revoked_at', null)
        .or(`delegate_id.is.null,delegate_id.eq.${artist_id}`)
        .maybeSingle()

      if (existingByEmailError) {
        console.error('Existing-invite-by-email lookup error:', existingByEmailError)
        return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
      }

      if (existingByEmail) {
        const inviteUrl = `${BASE_URL}/app/accept-invite?token=${existingByEmail.invite_token}`
        const emailSent = await sendInviteEmail({ to: delegate_email, artistName: artistDisplayName, inviteUrl, delegateFound: false, role: existingByEmail.role })
        return NextResponse.json({
          success: true,
          email_sent: emailSent,
          delegate_found: false,
          delegate_name: null,
          invite_url: inviteUrl,
          already_exists: true,
        })
      }
    }

    const { data: delegate, error } = await supabase
      .from('artist_delegates')
      .insert(delegateUser ? {
        artist_id, delegate_id: delegateUser.id, role, invited_by: artist_id,
        invited_email: delegate_email.toLowerCase().trim(),
      } : {
        // New convention — requires migration 0024 (delegate_id made
        // nullable) to already be applied. Only pre-existing legacy
        // rows (delegate_id = artist_id) are still recognized above and
        // in app/api/team/accept/route.ts; every NEW row uses null.
        artist_id, delegate_id: null, role, invited_by: artist_id,
        invited_email: delegate_email.toLowerCase().trim(),
      })
      .select('id, invite_token')
      .single()

    if (error || !delegate) {
      // delegateUser case: the conflict is against the UNCHANGED, always-
      // on UNIQUE(artist_id, delegate_id) — which has no exception for a
      // declined/revoked row, unlike the new pending-email index above.
      // Demonstrated gap, not yet resolved at the schema level: a real
      // person who previously declined (or had access revoked) blocks
      // ANY future row for that exact pair, through either direction,
      // forever. Re-reading and reusing the conflicting row — safe for
      // the !delegateUser race below — would be WRONG here if that row
      // turns out to be the old terminal one: it must never be surfaced
      // as a usable invite. So the three outcomes are handled
      // separately, and a terminal conflict fails honestly rather than
      // either resurrecting the old row or raising a raw 500.
      if (error?.code === '23505' && delegateUser) {
        const { data: conflicting, error: conflictReadError } = await supabase
          .from('artist_delegates')
          .select('invite_token, accepted_at, declined_at, revoked_at')
          .eq('artist_id', artist_id)
          .eq('delegate_id', delegateUser.id)
          .maybeSingle()

        if (conflictReadError) {
          console.error('Post-conflict re-read error:', conflictReadError)
          return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
        }
        if (conflicting?.accepted_at) {
          return NextResponse.json({ error: 'This person already has access to your account' }, { status: 409 })
        }
        if (conflicting?.declined_at || conflicting?.revoked_at) {
          return NextResponse.json({ error: 'This person has a previous connection with your account that needs to be cleared before they can be invited again.' }, { status: 409 })
        }
        if (conflicting) {
          // A legitimate concurrent pending invite won the race — reuse
          // it exactly like the existing-row branch above does.
          const inviteUrl = `${BASE_URL}/app/accept-invite?token=${conflicting.invite_token}`
          return NextResponse.json({
            success: true, email_sent: false, delegate_found: true,
            delegate_name: delegateUser.artist_name || delegateUser.full_name,
            invite_url: inviteUrl, already_exists: true,
          })
        }
      }

      if (error?.code === '23505') {
        // !delegateUser case: lost a race to a concurrent identical
        // invite (same artist, same invited email) — re-read and reuse
        // the row that won, rather than erroring. Safe to reuse
        // unconditionally here: the pending-email index this collided
        // with is itself scoped to accepted_at/declined_at/revoked_at
        // all NULL, so the winning row can never be a terminal one.
        // Never send a second email for it: the winning request's own
        // sendInviteEmail call already attempted
        // that, so email_sent here is honestly false (not sent BY THIS
        // request), not a guess about the other request's delivery.
        const { data: justCreated, error: reReadError } = await supabase
          .from('artist_delegates')
          .select('invite_token')
          .eq('artist_id', artist_id)
          .eq('invited_email', delegate_email.toLowerCase().trim())
          .is('accepted_at', null)
          .is('declined_at', null)
          .is('revoked_at', null)
          .maybeSingle()

        if (reReadError) {
          console.error('Post-conflict re-read error:', reReadError)
          return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
        }
        if (justCreated) {
          const inviteUrl = `${BASE_URL}/app/accept-invite?token=${justCreated.invite_token}`
          return NextResponse.json({
            success: true, email_sent: false, delegate_found: !!delegateUser,
            delegate_name: null, invite_url: inviteUrl, already_exists: true,
          })
        }
      }
      console.error('Delegate insert error:', error)
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
    }

    const inviteUrl = `${BASE_URL}/app/accept-invite?token=${delegate.invite_token}`

    const emailSent = await sendInviteEmail({
      to: delegate_email,
      artistName: artistDisplayName,
      inviteUrl,
      delegateFound: !!delegateUser,
      role,
    })

    return NextResponse.json({
      success: true,
      email_sent: emailSent,
      delegate_found: !!delegateUser,
      delegate_name: delegateUser?.artist_name || delegateUser?.full_name || null,
      invite_url: inviteUrl,
      invite_token: delegate.invite_token,
      invite_message: `${artistDisplayName} has invited you to their Setlistr account. Accept here: ${inviteUrl}`,
    })
  } catch (err) {
    console.error('Team invite error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
