import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NOTE_MAX_LENGTH = 500

// ── POST — public waitlist signup, dedupes and merges by email ────────────────
// waitlist's only RLS policy is INSERT-only (WITH CHECK (true)) — the
// table is anonymously writable, so it can't also allow SELECT/UPDATE from
// the browser without letting anyone read or overwrite the whole list.
// The dedup-then-merge has to happen here, behind the service role.
export async function POST(req: NextRequest) {
  try {
    const { email, name, roles, pro, note } = await req.json()

    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
    const normalizedName  = typeof name === 'string' ? name.trim() : ''
    const normalizedRoles = Array.isArray(roles)
      ? roles.filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
      : []
    const normalizedPro  = typeof pro === 'string' && pro.trim() ? pro.trim().toLowerCase() : null
    const normalizedNote = typeof note === 'string' && note.trim()
      ? note.trim().slice(0, NOTE_MAX_LENGTH)
      : null

    if (!normalizedEmail || !EMAIL_RE.test(normalizedEmail)) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }
    if (!normalizedName) {
      return NextResponse.json({ error: 'Name required' }, { status: 400 })
    }
    if (normalizedRoles.length === 0) {
      return NextResponse.json({ error: 'At least one role required' }, { status: 400 })
    }

    const supabase = getSupabase()

    const { data: existing } = await supabase
      .from('waitlist')
      .select('id, name, note, roles, pro')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('waitlist')
        .update({
          name:  normalizedName || existing.name,
          note:  normalizedNote || existing.note,
          roles: normalizedRoles.length ? normalizedRoles : existing.roles,
          pro:   normalizedPro || existing.pro,
        })
        .eq('id', existing.id)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }

    const { error } = await supabase.from('waitlist').insert({
      email: normalizedEmail,
      name:  normalizedName,
      note:  normalizedNote,
      roles: normalizedRoles,
      pro:   normalizedPro,
    })

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Already registered.', code: '23505' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
