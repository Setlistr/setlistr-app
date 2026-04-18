import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { publisher_id, artist_user_id, artist_name } = await req.json()

    if (!publisher_id || !artist_user_id || !artist_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Avoid duplicates
    const { data: existing } = await supabase
      .from('publisher_roster')
      .select('id')
      .eq('publisher_id', publisher_id)
      .eq('artist_user_id', artist_user_id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ success: true, already_exists: true })
    }

    const { error } = await supabase
      .from('publisher_roster')
      .insert({ publisher_id, artist_user_id, artist_name })

    if (error) {
      console.error('Roster add error:', error)
      return NextResponse.json({ error: 'Failed to add artist' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Roster add route error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
