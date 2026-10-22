import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { loadProofSummary, ProofError } from '@/lib/proof/load'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// GET /api/proof/summary?artist_id= — the Proof of Performance summary for
// one artist workspace. Reads with the service role, so it authorises the
// caller itself on every request (lib/proof/load.ts authoriseProof): the
// artist, or an accepted, non-revoked team member. Returns summaries only.
export async function GET(req: NextRequest) {
  const noStore = { 'Cache-Control': 'private, no-store' }
  const artistId = req.nextUrl.searchParams.get('artist_id')
  if (!artistId || !/^[0-9a-f-]{36}$/i.test(artistId)) {
    return NextResponse.json({ error: 'artist_id required' }, { status: 400, headers: noStore })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Not configured' }, { status: 500, headers: noStore })

  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore })

  try {
    const summary = await loadProofSummary({
      service: createClient(url, key),
      callerId: user.id,
      artistId,
      mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN || null,
      // Mapbox lookups made for this page carry the page's own origin.
      referer: req.headers.get('origin') || (req.headers.get('host') ? `https://${req.headers.get('host')}/` : null),
      supabaseUrl: url,
    })
    return NextResponse.json(summary, { headers: noStore })
  } catch (e) {
    if (e instanceof ProofError) return NextResponse.json({ error: e.message }, { status: e.status, headers: noStore })
    console.error('[proof/summary] failed:', e)
    return NextResponse.json({ error: 'The record could not be loaded' }, { status: 500, headers: noStore })
  }
}
