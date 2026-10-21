import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { loadProofSummary, ProofError } from '@/lib/proof/load'
import { isRealTimeZone } from '@/lib/show-date'
import { fetchArtistImage, fetchCoverMap } from '@/lib/proof/pdf/assets'
import { renderProofPdf } from '@/lib/proof/pdf/document'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// GET /api/proof/pdf?artist_id=&tz= — the Proof of Performance PDF.
// Every request is authorised again: the caller must be able to export for
// this workspace (the artist, or an accepted, non-revoked manager, tour
// manager or band member; Viewers can view only). The file is generated per
// request and returned privately; nothing is stored or published.
export async function GET(req: NextRequest) {
  const noStore = { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache' }
  const artistId = req.nextUrl.searchParams.get('artist_id')
  if (!artistId || !/^[0-9a-f-]{36}$/i.test(artistId)) return NextResponse.json({ error: 'artist_id required' }, { status: 400, headers: noStore })
  const tzParam = req.nextUrl.searchParams.get('tz')
  const zone = tzParam && (isRealTimeZone(tzParam) || tzParam === 'UTC') ? tzParam : null

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Not configured' }, { status: 500, headers: noStore })

  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore })

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || null
  const referer = req.headers.get('origin') || (req.headers.get('host') ? `https://${req.headers.get('host')}/` : null)
  try {
    const summary = await loadProofSummary({ service: createClient(url, key), callerId: user.id, artistId, mapboxToken: token, referer, supabaseUrl: url })
    if (!summary.access.canExport) return NextResponse.json({ error: 'Export needs permission to edit this workspace' }, { status: 403, headers: noStore })

    const [photo, map] = await Promise.all([
      fetchArtistImage(summary.artist.imageUrl, summary.artist.imageExportable),
      summary.map.mode === 'map' ? fetchCoverMap(summary.map.views.cover, token, referer) : Promise.resolve({ image: null, status: 'none' as const }),
    ])
    if (map.status === 'failed') console.error('[proof/pdf] map image unavailable')
    const preparedAt = new Date()
    const pdf = await renderProofPdf({ summary, zone, preparedAt, photo: photo.image, map: map.image, mapStatus: map.status })

    const slug = summary.artist.name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'artist'
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: zone || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(preparedAt)
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        ...noStore,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="proof-of-performance-${slug}-${day}.pdf"`,
        'Content-Length': String(pdf.length),
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (e) {
    if (e instanceof ProofError) return NextResponse.json({ error: e.message }, { status: e.status, headers: noStore })
    console.error('[proof/pdf] failed:', e)
    return NextResponse.json({ error: 'The PDF could not be created' }, { status: 500, headers: noStore })
  }
}
