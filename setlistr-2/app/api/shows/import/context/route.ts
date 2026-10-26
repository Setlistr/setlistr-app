import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { loadImportContext } from '@/lib/shows/import/server'
import { importPreviewMode } from '@/lib/shows/import/mode'
import { sampleContext } from '@/lib/shows/import/sample'
import { authoriseProof, ProofError } from '@/lib/proof/load'
import { isWriteCapableRole } from '@/lib/writeCapableRoles'

export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store, max-age=0' }

// GET /api/shows/import/context?artist_id= — what the import review checks
// rows against (docs/spreadsheet-import-plan.md): the artist's records for
// possible duplicates, venues with known zones, earlier imports, and the
// records fingerprint the commit is checked against. Write roles only:
// show_records_fingerprint() refuses everyone else, so it is the access check.
export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get('artist_id') || ''
  if (!/^[0-9a-f-]{36}$/i.test(artistId)) return NextResponse.json({ error: 'artist_id required' }, { status: 400, headers: noStore })
  const auth = await createServerSupabaseClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore })
  if (importPreviewMode()) {
    // Preview: no import schema is assumed and nothing real is read beyond
    // the access check (write roles only, as below); the review runs on
    // labelled sample records and the commit is refused.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return NextResponse.json({ error: 'Not configured' }, { status: 500, headers: noStore })
    try {
      const access = await authoriseProof(createClient(url, key), user.id, artistId)
      if (access.role !== 'owner' && !isWriteCapableRole(access.role)) throw new ProofError(403, 'Access denied')
    } catch (e) {
      const st = e instanceof ProofError ? e.status : 500
      return NextResponse.json({ error: st === 403 ? 'Only the artist and teammates who can edit can import shows' : 'Could not load' }, { status: st, headers: noStore })
    }
    return NextResponse.json({ mode: 'preview', fingerprint: 'preview', context: sampleContext() }, { headers: noStore })
  }
  const { data: fingerprint, error } = await auth.rpc('show_records_fingerprint', { p_artist: artistId })
  if (error) return NextResponse.json({ error: /NOT_AUTHORIZED/.test(error.message) ? 'Only the artist and teammates who can edit can import shows' : 'Could not load' }, { status: /NOT_AUTHORIZED/.test(error.message) ? 403 : 500, headers: noStore })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Not configured' }, { status: 500, headers: noStore })
  try {
    const context = await loadImportContext(createClient(url, key), artistId)
    return NextResponse.json({ mode: 'live', fingerprint, context }, { headers: noStore })
  } catch (e) {
    console.error('[shows/import/context] failed:', (e as Error).message)
    return NextResponse.json({ error: 'Could not load' }, { status: 500, headers: noStore })
  }
}
