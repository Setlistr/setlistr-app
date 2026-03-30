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

export async function DELETE(req: NextRequest) {
  try {
    // Auth check — verify caller is admin via cookie session
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: { user } } = await anonClient.auth.getUser()
    if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { performance_id } = await req.json()
    if (!performance_id) {
      return NextResponse.json({ error: 'performance_id required' }, { status: 400 })
    }

    const supabase = getSupabase()

    // Look up setlist ID first — separate step, no nested await
    const { data: setlist } = await supabase
      .from('setlists')
      .select('id')
      .eq('performance_id', performance_id)
      .single()

    // Delete in safe order — children before parent
    await supabase.from('detection_events').delete().eq('performance_id', performance_id)
    await supabase.from('performance_songs').delete().eq('performance_id', performance_id)

    if (setlist?.id) {
      await supabase.from('setlist_items').delete().eq('setlist_id', setlist.id)
    }

    await supabase.from('setlists').delete().eq('performance_id', performance_id)
    await supabase.from('capture_sessions').delete().eq('performance_id', performance_id)
    await supabase.from('performances').delete().eq('id', performance_id)

    console.log(`[AdminDelete] ${user.email} deleted performance ${performance_id}`)
    return NextResponse.json({ success: true })

  } catch (err: any) {
    console.error('[AdminDelete] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
