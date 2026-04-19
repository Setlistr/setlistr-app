import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://setlistr.ai'
const RESEND_API_KEY = process.env.RESEND_API_KEY

async function sendInviteEmail({
  to, artistName, inviteUrl, delegateFound,
}: {
  to: string
  artistName: string
  inviteUrl: string
  delegateFound: boolean
}) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email send')
    return
  }

  const subject = `${artistName} added you to their Setlistr account`

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; background: #0a0908; color: #f0ece3; padding: 40px 32px; border-radius: 16px;">
      <p style="font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #c9a84c; margin: 0 0 24px;">Setlistr</p>
      <h1 style="font-size: 24px; font-weight: 800; color: #f0ece3; margin: 0 0 12px; letter-spacing: -0.025em; line-height: 1.2;">
        ${artistName} invited you to their team
      </h1>
      <p style="font-size: 14px; color: #b8a888; margin: 0 0 24px; line-height: 1.6;">
        ${delegateFound
          ? `You've been added as a team member on ${artistName}'s Setlistr account. Accept to start managing their shows and royalty submissions.`
          : `${artistName} is using Setlistr to track live performance royalties. They'd like you to manage their account — capturing shows, reviewing setlists, and submitting to their PRO on their behalf.`
        }
      </p>
      <a href="${inviteUrl}" style="display: inline-block; background: #c9a84c; color: #0a0908; font-size: 14px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; text-decoration: none; padding: 16px 32px; border-radius: 12px; margin-bottom: 24px;">
        Accept Invite
      </a>
      <p style="font-size: 12px; color: #8a7a68; margin: 0 0 24px; line-height: 1.6;">
        Or copy this link: <span style="color: #b8a888;">${inviteUrl}</span>
      </p>
      <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.07); margin: 24px 0;" />
      <p style="font-size: 11px; color: #8a7a68; margin: 0;">
        Setlistr · Live performance royalty tracking · <a href="https://setlistr.ai" style="color: #c9a84c;">setlistr.ai</a>
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
    }
  } catch (err) {
    console.error('Email send failed:', err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { artist_id, delegate_email, role = 'manager' } = await req.json()

    if (!artist_id || !delegate_email) {
      return NextResponse.json({ error: 'artist_id and delegate_email required' }, { status: 400 })
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
      const { data: existing } = await supabase
        .from('artist_delegates')
        .select('id, accepted_at, invite_token')
        .eq('artist_id', artist_id)
        .eq('delegate_id', delegateUser.id)
        .maybeSingle()

      if (existing?.accepted_at) {
        return NextResponse.json({ error: 'This person already has access to your account' }, { status: 409 })
      }

      if (existing) {
        const inviteUrl = `${BASE_URL}/app/accept-invite?token=${existing.invite_token}`
        await sendInviteEmail({ to: delegate_email, artistName: artistDisplayName, inviteUrl, delegateFound: true })
        return NextResponse.json({
          success: true,
          email_sent: !!RESEND_API_KEY,
          delegate_found: true,
          delegate_name: delegateUser.artist_name || delegateUser.full_name,
          invite_url: inviteUrl,
          already_exists: true,
        })
      }
    }

    const { data: delegate, error } = await supabase
      .from('artist_delegates')
      .insert(delegateUser ? {
        artist_id, delegate_id: delegateUser.id, role, invited_by: artist_id,
      } : {
        artist_id, delegate_id: artist_id, role, invited_by: artist_id,
      })
      .select('id, invite_token')
      .single()

    if (error || !delegate) {
      console.error('Delegate insert error:', error)
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
    }

    const inviteUrl = `${BASE_URL}/app/accept-invite?token=${delegate.invite_token}`

    await sendInviteEmail({
      to: delegate_email,
      artistName: artistDisplayName,
      inviteUrl,
      delegateFound: !!delegateUser,
    })

    return NextResponse.json({
      success: true,
      email_sent: !!RESEND_API_KEY,
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
