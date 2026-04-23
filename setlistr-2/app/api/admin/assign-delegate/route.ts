import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { artist_id, delegate_id, role = 'manager' } = await req.json()
    if (!artist_id || !delegate_id) {
      return NextResponse.json({ error: 'artist_id and delegate_id required' }, { status: 400 })
    }

    // Check if already exists
    const { data: existing } = await supabase
      .from('artist_delegates')
      .select('id, accepted_at')
      .eq('artist_id', artist_id)
      .eq('delegate_id', delegate_id)
      .maybeSingle()

    if (existing?.accepted_at) {
      return NextResponse.json({ success: true, message: 'Already assigned' })
    }

    if (existing) {
      // Pending invite — just accept it
      await supabase
        .from('artist_delegates')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', existing.id)
      return NextResponse.json({ success: true, message: 'Existing invite accepted' })
    }

    // Create fresh — pre-accepted, no invite flow needed
    const { error } = await supabase
      .from('artist_delegates')
      .insert({
        artist_id,
        delegate_id,
        role,
        invited_by: artist_id,
        accepted_at: new Date().toISOString(), // pre-accept — superadmin bypass
      })

    if (error) {
      console.error('assign-delegate error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
