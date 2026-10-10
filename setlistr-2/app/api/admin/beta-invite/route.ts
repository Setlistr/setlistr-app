import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { ADMIN_EMAILS } from '@/lib/admin-config'
import { escapeHtml } from '@/lib/escapeHtml'
import { getBaseUrl } from '@/lib/baseUrl'
import { findPendingInviteDetailsByEmail } from '@/lib/pendingInvite'
import { roleInfoFor } from '@/lib/teamRoleInfo'

const BASE_URL       = getBaseUrl()
const RESEND_API_KEY = process.env.RESEND_API_KEY
const APP_STORE_URL  = 'https://apps.apple.com/us/app/setlistr-live-performance/id6794425733'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function sendBetaInviteEmail({ to, name, invitedRole }: { to: string; name?: string | null; invitedRole: 'artist' | 'manager' }) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping beta invite email')
    return false
  }

  const signupUrl  = `${BASE_URL}/auth/login`
  // Escaped: name is admin-entered but goes verbatim into HTML — an admin
  // typo or paste should never become a markup break, same discipline as
  // any other user-provided string reaching an email template.
  const displayName = escapeHtml(name) || 'there'

  // Fresh, send-time lookup — never a value captured earlier (e.g. at the
  // moment the waitlist request was submitted) that could have gone stale
  // by the time this email actually goes out (invite since accepted,
  // declined, revoked, or replaced by a different one). Takes priority
  // over the generic artist/manager recruitment copy below whenever it
  // finds a real, still-pending invite: this person isn't being generically
  // recruited, they're being handed back to something they already started.
  const pendingInvite = await findPendingInviteDetailsByEmail(to)

  let heading: string
  let bodyCopy: string
  let ctaCopy: string
  let ctaHref: string
  let fallbackLabel: string
  let fallbackUrl: string

  if (pendingInvite) {
    const roleLabel = roleInfoFor(pendingInvite.role).label.toLowerCase()
    heading = "You're approved — your invite is waiting."
    bodyCopy = `${escapeHtml(pendingInvite.artistName)} invited you as a ${roleLabel} on Setlistr. You're approved — pick up right where you left off.`
    ctaCopy = 'Continue to Your Team Invitation →'
    ctaHref = `${BASE_URL}/app/accept-invite?token=${pendingInvite.token}`
    fallbackLabel = 'Or use this link:'
    fallbackUrl = ctaHref
  } else {
    const isManager = invitedRole === 'manager'
    heading = isManager ? "You're in — as a manager." : "You're in."
    bodyCopy = isManager
      ? `You've been invited to the Setlistr beta as a manager. Once you sign up, you'll land in your Manager workspace — no artist profile to set up. From there you can request access to the artists you work with.`
      : `You've been invited to the Setlistr beta. Capture your live performances and we'll help you prepare the royalty claims that follow.`
    ctaCopy = isManager ? 'Set Up Your Workspace →' : 'Get the App →'
    ctaHref = isManager ? signupUrl : APP_STORE_URL
    fallbackLabel = isManager ? 'Sign in here:' : 'On desktop or Android? Use this link instead:'
    fallbackUrl = signupUrl
  }

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; background: #0a0908; color: #f0ece3; padding: 40px 32px; border-radius: 16px;">
      <img src="https://setlistr.ai/logo-white-tight.png" width="160" alt="Setlistr" style="display: block; height: auto; margin: 0 0 24px;" />
      <h1 style="font-size: 24px; font-weight: 800; color: #f0ece3; margin: 0 0 12px; letter-spacing: -0.025em; line-height: 1.2;">
        ${heading}
      </h1>
      <p style="font-size: 14px; color: #b8a888; margin: 0 0 16px; line-height: 1.6;">
        Hi ${displayName},
      </p>
      <p style="font-size: 14px; color: #b8a888; margin: 0 0 24px; line-height: 1.6;">
        ${bodyCopy}
      </p>
      <a href="${ctaHref}" style="display: inline-block; background: #c9a84c; color: #0a0908; font-size: 14px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; text-decoration: none; padding: 16px 32px; border-radius: 12px; margin-bottom: 24px;">
        ${ctaCopy}
      </a>
      <p style="font-size: 12px; color: #8a7a68; margin: 0 0 24px; line-height: 1.6;">
        ${fallbackLabel} <span style="color: #b8a888;">${fallbackUrl}</span>
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
        subject: pendingInvite ? "You're approved — continue to your team invitation" : "You're invited to the Setlistr beta",
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
    const cookieStore = cookies()
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() {},
        },
      }
    )
    const { data: { user: sessionUser } } = await authClient.auth.getUser()
    if (!sessionUser || !ADMIN_EMAILS.includes(sessionUser.email ?? '')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

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

    const { email, name, role } = await req.json()

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 })
    }

    const invitedRole: 'artist' | 'manager' = role === 'manager' ? 'manager' : 'artist'

    const { data: invite, error } = await supabase
      .from('beta_invites')
      .insert({
        email:    email.toLowerCase().trim(),
        name:     name || null,
        added_by: callerEmail || 'admin',
        invited_role: invitedRole,
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
    const emailSent = await sendBetaInviteEmail({ to: email.toLowerCase().trim(), name, invitedRole })

    return NextResponse.json({ invite, email_sent: emailSent })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── DELETE — remove a beta user ───────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const cookieStore = cookies()
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() {},
        },
      }
    )
    const { data: { user } } = await authClient.auth.getUser()
    if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

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
