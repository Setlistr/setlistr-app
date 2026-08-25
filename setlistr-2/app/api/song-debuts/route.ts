import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url        = new URL(req.url)
    const userIdParam = url.searchParams.get('userId')

    let targetUserId = user.id

    if (userIdParam && userIdParam !== user.id) {
      const service = getServiceClient()
      const { data: delegation } = await service
        .from('artist_delegates')
        .select('id')
        .eq('artist_id', userIdParam)
        .eq('delegate_id', user.id)
        .not('accepted_at', 'is', null)
        .maybeSingle()

      if (!delegation) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      targetUserId = userIdParam
    }

    const service = getServiceClient()
    const { data, error } = await service
      .from('performance_songs_visible')
      .select('title, artist, performances!inner(performance_date)')
      .eq('performances.user_id', targetUserId)

    if (error) {
      console.error('[SongDebuts] DB error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Group by (title, artist), keep MIN(performance_date) per song
    const map = new Map<string, { title: string; artist: string | null; first_performed_at: string }>()
    for (const row of data || []) {
      const date: string | null = (row as any).performances?.performance_date
      if (!date) continue
      const key = `${(row.title || '').toLowerCase()}|||${(row.artist || '').toLowerCase()}`
      const existing = map.get(key)
      if (!existing || date < existing.first_performed_at) {
        map.set(key, { title: row.title, artist: row.artist || null, first_performed_at: date })
      }
    }

    const debuts = Array.from(map.values())
      .sort((a, b) => a.first_performed_at.localeCompare(b.first_performed_at))

    return NextResponse.json({ debuts })
  } catch (err: any) {
    console.error('[SongDebuts] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
