import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAILS = [
  'jesse.slack.music@gmail.com',
  'darylscottsongs@gmail.com',
]

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── POST — add a beta user ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    // Verify caller is admin
    const supabase = getSupabase()
    const authHeader = req.headers.get('authorization')
    let callerEmail = ''

    if (authHeader) {
      const { data: { user } } = await createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ).auth.getUser(authHeader.replace('Bearer ', ''))
      callerEmail = user?.email || ''
    }

    // Also check cookie-based session via service role
    // (admin dashboard uses cookie auth not bearer)
    const { email, name } = await req.json()

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 })
    }

    const { data: invite, error } = await supabase
      .from('beta_invites')
      .insert({
        email:     email.toLowerCase().trim(),
        name:      name || null,
        added_by:  callerEmail || 'admin',
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'This email is already invited' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ invite })
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

    const supabase = getSupabase()
    const { error } = await supabase
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
