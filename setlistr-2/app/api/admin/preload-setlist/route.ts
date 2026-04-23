import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { user_id, songs } = await req.json()
    if (!user_id || !songs?.length) {
      return NextResponse.json({ error: 'user_id and songs required' }, { status: 400 })
    }

    // Get existing song titles to avoid duplicates
    const { data: existing } = await supabase
      .from('user_songs')
      .select('song_title')
      .eq('user_id', user_id)

    const existingTitles = new Set(
      (existing || []).map((s: any) => s.song_title.toLowerCase().trim())
    )

    const toInsert = (songs as string[])
      .map(s => s.trim())
      .filter(s => s && !existingTitles.has(s.toLowerCase()))
      .map(title => ({
        user_id,
        song_title: title,
        artist_name: '',
        confirmed_count: 1,
        last_confirmed_at: new Date().toISOString(),
        source: 'admin_preload',
      }))

    if (toInsert.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: 'All songs already in catalog' })
    }

    const { error } = await supabase.from('user_songs').insert(toInsert)

    if (error) {
      console.error('preload-setlist error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, count: toInsert.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
