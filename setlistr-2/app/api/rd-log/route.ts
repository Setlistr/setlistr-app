import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { ADMIN_EMAILS } from '@/lib/admin-config'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getCallerEmail(): Promise<string | null> {
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
    return user?.email ?? null
  } catch {
    return null
  }
}

// ── GET — fetch all entries or export as CSV ──────────────────────────────────
export async function GET(req: NextRequest) {
  const email = await getCallerEmail()
  if (!email || !ADMIN_EMAILS.includes(email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('rd_log')
    .select('*')
    .order('entry_date', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)

  if (searchParams.get('export') === 'csv') {
    const cols = [
      'id', 'entry_date', 'team_member', 'role', 'workstream',
      'technical_problem', 'hypothesis', 'work_performed', 'hours',
      'outcome', 'remaining_uncertainty', 'related_file', 'evidence_link',
      'funding_relevance', 'is_retroactive', 'notes', 'created_at',
    ]

    const esc = (v: any) => {
      if (v == null) return '""'
      if (Array.isArray(v)) return `"${v.join('; ').replace(/"/g, '""')}"`
      return `"${String(v).replace(/"/g, '""')}"`
    }

    const csv = [
      cols.join(','),
      ...(data ?? []).map(row => cols.map(c => esc(row[c])).join(',')),
    ].join('\n')

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="setlistr-rd-log.csv"',
      },
    })
  }

  return NextResponse.json({ entries: data ?? [] })
}

// ── POST — insert a new entry ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const email = await getCallerEmail()
  if (!email || !ADMIN_EMAILS.includes(email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const body = await req.json()

    if (!body.entry_date || !body.team_member || !body.workstream) {
      return NextResponse.json(
        { error: 'entry_date, team_member, and workstream are required' },
        { status: 400 }
      )
    }

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('rd_log')
      .insert({
        entry_date:            body.entry_date,
        team_member:           body.team_member,
        role:                  body.role ?? '',
        workstream:            body.workstream,
        technical_problem:     body.technical_problem    ?? null,
        hypothesis:            body.hypothesis           ?? null,
        work_performed:        body.work_performed       ?? null,
        hours:                 body.hours                ?? null,
        outcome:               body.outcome              ?? null,
        remaining_uncertainty: body.remaining_uncertainty ?? null,
        related_file:          body.related_file         ?? null,
        evidence_link:         body.evidence_link        ?? null,
        funding_relevance:     body.funding_relevance    ?? null,
        is_retroactive:        body.is_retroactive       ?? false,
        notes:                 body.notes                ?? null,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ entry: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
