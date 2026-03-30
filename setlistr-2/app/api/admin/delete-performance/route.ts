import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Admin-only route — deletes a performance and all associated data
// Only accessible from the admin dashboard (you and Daryl)
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    const supabase = getSupabase()

    // Delete in correct order to respect foreign keys
    await supabase.from('performance_songs').delete().eq('performance_id', id)
    await supabase.from('detection_events').delete().eq('performance_id', id)
    await supabase.from('capture_sessions').delete().eq('performance_id', id)
    await supabase.from('setlist_items').delete().eq('setlist_id',
      (await supabase.from('setlists').select('id').eq('performance_id', id)).data?.[0]?.id || ''
    )
    await supabase.from('setlists').delete().eq('performance_id', id)
    await supabase.from('performances').delete().eq('id', id)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
