import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

    const { performance_id } = await req.json()
    if (!performance_id) {
      return NextResponse.json({ error: 'performance_id required' }, { status: 400 })
    }

    const supabase = getSupabase()

    // Get the performance to find show_id and setlist_id
    const { data: perf } = await supabase
      .from('performances')
      .select('id, show_id, setlist_id')
      .eq('id', performance_id)
      .single()

    // Delete children first
    await supabase.from('detection_events').delete().eq('performance_id', performance_id)
    await supabase.from('performance_songs').delete().eq('performance_id', performance_id)
    await supabase.from('capture_sessions').delete().eq('performance_id', performance_id)

    // Delete setlist items if there's a setlist
    if (perf?.setlist_id) {
      await supabase.from('setlist_items').delete().eq('setlist_id', perf.setlist_id)
      await supabase.from('setlists').delete().eq('id', perf.setlist_id)
    }

    // Delete performance
    await supabase.from('performances').delete().eq('id', performance_id)

    // Delete the parent show if it exists
    if (perf?.show_id) {
      // Check if other performances reference this show
      const { data: otherPerfs } = await supabase
        .from('performances')
        .select('id')
        .eq('show_id', perf.show_id)
        .limit(1)
      // Only delete show if no other performances reference it
      if (!otherPerfs || otherPerfs.length === 0) {
        await supabase.from('shows').delete().eq('id', perf.show_id)
      }
    }

    console.log(`[AdminDelete] ${user.email} deleted performance ${performance_id}`)
    return NextResponse.json({ success: true })

  } catch (err: any) {
    console.error('[AdminDelete] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Force-end a stuck live show
export async function PATCH(req: NextRequest) {
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

    const { performance_id } = await req.json()
    if (!performance_id) {
      return NextResponse.json({ error: 'performance_id required' }, { status: 400 })
    }

    const supabase = getSupabase()

    const { data: perf } = await supabase
      .from('performances')
      .select('show_id')
      .eq('id', performance_id)
      .single()

    await supabase.from('performances')
      .update({ status: 'review', ended_at: new Date().toISOString() })
      .eq('id', performance_id)

    if (perf?.show_id) {
      await supabase.from('shows')
        .update({ status: 'completed', ended_at: new Date().toISOString() })
        .eq('id', perf.show_id)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
