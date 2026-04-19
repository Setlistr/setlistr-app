import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://setlistr.ai'
const RESEND_API_KEY = process.env.RESEND_API_KEY

async function sendPublisherInviteEmail({
  to, artistName, publisherName, inviteUrl,
}: {
  to: string
  artistName: string
  publisherName: string
  inviteUrl: string
}) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email')
    return false
  }

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; background: #0a0908; color: #f0ece3; padding: 40px 32px; border-radius: 16px;">
      <p style="font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #c9a84c; margin: 0 0 24px;">Setlistr</p>
      <h1 style="font-size: 24px; font-weight: 800; color: #f0ece3; margin: 0 0 12px; letter-spacing: -0.025em; line-height: 1.2;">
        ${publisherName} is tracking your live royalties
      </h1>
      <p style="font-size: 14px; color: #b8a888; margin: 0 0 16px; line-height: 1.6;">
        Hi ${artistName},
      </p>
      <p style="font-size: 14px; color: #b8a888; margin: 0 0 16px; line-height: 1.6;">
        ${publisherName} is now using Setlistr to track live performance royalties across their roster. They'd like to invite you to join — it takes about 5 minutes to set up.
      </p>
      <p style="font-size: 14px; color: #b8a888; margin: 0 0 24px; line-height: 1.6;">
        Most artists miss out on royalties simply because they don't submit their setlists after a show. Setlistr makes that automatic.
      </p>
      <a href="${inviteUrl}" style="display: inline-block; background: #c9a84c; color: #0a0908; font-size: 14px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; text-decoration: none; padding: 16px 32px; border-radius: 12px; margin-bottom: 24px;">
        Join Setlistr →
      </a>
      <p style="font-size: 12px; color: #8a7a68; margin: 0 0 24px; line-height: 1.6;">
        Or copy this link: <span style="color: #b8a888;">${inviteUrl}</span>
      </p>
      <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.07); margin: 24px 0;" />
      <p style="font-size: 11px; color: #8a7a68; margin: 0;">
        Questions? <a href="mailto:support@setlistr.ai" style="color: #c9a84c;">support@setlistr.ai</a> · <a href="https://setlistr.ai" style="color: #c9a84c;">setlistr.ai</a>
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
        from: `${publisherName} via Setlistr <invites@setlistr.ai>`,
        to,
        subject: `${publisherName} is tracking your royalties on Setlistr`,
        html,
      }),
    })
    if (!res.ok) {
      console.error('Resend publisher invite error:', await res.text())
      return false
    }
    return true
  } catch (err) {
    console.error('Publisher invite email failed:', err)
    return false
  }
}

export async function POST(req: NextRequest) {
  try {
    const { publisher_id, publisher_name, artist_name, artist_email } = await req.json()

    if (!publisher_id || !artist_name) {
      return NextResponse.json({ error: 'publisher_id and artist_name required' }, { status: 400 })
    }

    // Check for existing invite to avoid duplicates
    const { data: existing } = await supabase
      .from('publisher_roster_invites')
      .select('id, invite_token')
      .eq('publisher_id', publisher_id)
      .ilike('artist_name', artist_name)
      .maybeSingle()

    let inviteToken: string
    let inviteId: string

    if (existing) {
      inviteToken = existing.invite_token
      inviteId    = existing.id
    } else {
      const { data: inserted, error } = await supabase
        .from('publisher_roster_invites')
        .insert({ publisher_id, artist_name, artist_email: artist_email || null })
        .select('id, invite_token')
        .single()

      if (error || !inserted) {
        console.error('Invite insert error:', error)
        return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
      }

      inviteToken = inserted.invite_token
      inviteId    = inserted.id
    }

    const inviteUrl = `${BASE_URL}/join?ref=${inviteToken}`
    const displayName = publisher_name || 'Your publisher'

    // Send via Resend if email provided
    let emailSent = false
    if (artist_email) {
      emailSent = await sendPublisherInviteEmail({
        to: artist_email,
        artistName: artist_name,
        publisherName: displayName,
        inviteUrl,
      })
    }

    // Always return the pre-written copy as fallback
    const emailSubject = `${displayName} is tracking your royalties on Setlistr`
    const emailBody = `Hi ${artist_name},

${displayName} is now using Setlistr to track live performance royalties across their roster. They'd like to invite you to join — it takes about 5 minutes to set up, and it ensures your live shows are properly documented and submitted to your PRO so you get paid.

Most artists miss out on royalties simply because they don't submit their setlists after a show. Setlistr makes that automatic.

Join here: ${inviteUrl}

Questions? Reply to this email or reach us at support@setlistr.ai

— The Setlistr Team`

    return NextResponse.json({
      success: true,
      email_sent: emailSent,
      invite_id: inviteId,
      invite_token: inviteToken,
      invite_url: inviteUrl,
      email_subject: emailSubject,
      email_body: emailBody,
    })
  } catch (err: any) {
    console.error('Invite route error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
