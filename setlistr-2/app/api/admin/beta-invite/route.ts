import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAILS = [
  'jesse.slack.music@gmail.com',
  'darylscottsongs@gmail.com',
]

const BASE_URL       = process.env.NEXT_PUBLIC_APP_URL || 'https://setlistr.ai'
const RESEND_API_KEY = process.env.RESEND_API_KEY

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function sendBetaInviteEmail({ to, name }: { to: string; name?: string | null }) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping beta invite email')
    return false
  }

  const signupUrl  = `${BASE_URL}/auth/login`
  const displayName = name || 'there'

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; background: #0a0908; color: #f0ece3; padding: 40px 32px; border-radius: 16px;">
      <p style="font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #c9a84c; margin: 0 0 24px;">Setlistr</p>
      <h1 style="font-size: 24px; font-weight: 800; color: #f0ece3; margin: 0 0 12px; letter-spacing: -0.025em; line-height: 1.2;">
        You're in.
      </h1>
      <p style="font-size: 14px; color: #b8a888; margin: 0 0 16px; line-height: 1.6;">
        Hi ${displayName},
      </p>
      <p style="font-size: 14px; color: #b8a888; margin: 0 0 16px; line-height: 1.6;">
        You've been invited to the Setlistr beta. We're building the system that ensures every live performance turns into royalties — automatically.
      </p>
      <p style="font-size: 14px; color: #b8a888; margin: 0 0 24px; line-height: 1.6;">
        Takes 5 minutes to set up. Your first show is on us.
      </p>
      <a href="${signupUrl}" style="display: inline-block; background: #c9a84c; color: #0a0908; font-size: 14px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; text-decoration: none; padding: 16px 32px; border-radius: 12px; margin-bottom: 24px;">
        Create Your Account →
      </a>
      <p style="font-size: 12px; color: #8a7a68; margin: 0 0 24px; line-height: 1.6;">
        Or copy this link: <span style="color: #b8a888;">${signupUrl}</span>
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
        from: 'Setlistr <invites@setlistr.ai>',
        to,
        subject: "You're invited to the Setlistr beta",
        html,
      }),
    })
    if (!res.ok) {
      console.error('Resend beta invite error:', await res.text())
      return false
    }
    return true
  } catch (err) {
    console.error('Beta invite email failed:', err)
    return false
  }
}

// ── POST — add a beta user ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const supabase    = getSupabase()
    const authHeader  = req.headers.get('authorization')
    let callerEmail   = ''

    if (authHeader) {
      const { data: { user } } = await createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ).auth.getUser(authHeader.replace('Bearer ', ''))
      callerEmail = user?.email || ''
    }

    const { email, name } = await req.json()

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 })
    }

    const { data: invite, error } = await supabase
      .from('beta_invites')
      .insert({
        email:    email.toLowerCase().trim(),
        name:     name || null,
        added_by: callerEmail || 'admin',
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'This email is already invited' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Send the invite email via Resend
    const emailSent = await sendBetaInviteEmail({ to: email.toLowerCase().trim(), name })

    return NextResponse.json({ invite, email_sent: emailSent })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── DELETE — remove a beta user ───────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 })
    }

    const supabase    = getSupabase()
    const { error }   = await supabase
      .from('beta_invites')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
