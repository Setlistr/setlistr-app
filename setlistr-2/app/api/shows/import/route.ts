import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { loadImportContext } from '@/lib/shows/import/server'
import { prepare, unansweredPairs } from '@/lib/shows/import/commit'
import { importPreviewMode, PREVIEW_DISABLED_MESSAGE } from '@/lib/shows/import/mode'

export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store, max-age=0' }

// GET /api/shows/import?artist_id= — this artist's recent imports, newest
// first, so a result (skipped rows, Undo) can be reopened later. Anyone who
// can see the artist's shows can see them (RLS: can_act_for).
export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get('artist_id') || ''
  if (!/^[0-9a-f-]{36}$/i.test(artistId)) return NextResponse.json({ error: 'artist_id required' }, { status: 400, headers: noStore })
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore })
  if (importPreviewMode(req.headers.get('host'))) return NextResponse.json({ imports: [], preview: true }, { headers: noStore })
  const { data, error } = await supabase.from('show_import_batches')
    .select('id, file_name, created_at, imported_count, skipped_rows, status, imported_by_name')
    .eq('artist_id', artistId).order('created_at', { ascending: false }).limit(10)
  if (error) return NextResponse.json({ error: 'Could not load imports' }, { status: 500, headers: noStore })
  return NextResponse.json({ imports: (data || []).map(b => ({ id: b.id, file: b.file_name, at: b.created_at, imported: b.imported_count, leftOut: Array.isArray(b.skipped_rows) ? b.skipped_rows.length : 0, status: b.status, by: b.imported_by_name })) }, { headers: noStore })
}

// POST /api/shows/import — commit a reviewed import. Every check is made
// again here: rows and instants (prepare), permission and staleness
// (import_shows), and possible duplicates against the records as they are
// now. A retry with the same batch id returns the first result.
export async function POST(req: NextRequest) {
  // Preview deployments use production data: importing is refused there first.
  if (importPreviewMode(req.headers.get('host'))) return NextResponse.json({ error: 'disabled', message: PREVIEW_DISABLED_MESSAGE }, { status: 403, headers: noStore })
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400, headers: noStore }) }
  const p = prepare(body)
  if (!p.ok) return NextResponse.json({ error: p.error, row: p.row }, { status: p.status, headers: noStore })

  // The access check and the records as they are now.
  const { data: fingerprint, error: fpError } = await supabase.rpc('show_records_fingerprint', { p_artist: body.artist_id })
  if (fpError) return NextResponse.json({ error: /NOT_AUTHORIZED/.test(fpError.message) ? 'You can no longer edit this artist’s shows, so nothing was imported.' : 'Could not import' }, { status: /NOT_AUTHORIZED/.test(fpError.message) ? 403 : 500, headers: noStore })
  let current = fingerprint as string
  if (current !== body.fingerprint) {
    // Something changed since the review: re-check duplicates on fresh records.
    // A retry of an import that already went through changes the records too;
    // import_shows recognises its batch id before any other check.
    const { data: existing } = await supabase.from('show_import_batches').select('id').eq('id', body.batch.id).maybeSingle()
    if (!existing) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!url || !key) return NextResponse.json({ error: 'Not configured' }, { status: 500, headers: noStore })
      const ctx = await loadImportContext(createClient(url, key), body.artist_id)
      const rows = unansweredPairs(p.rows, ctx, body.decided)
      if (rows.length) return NextResponse.json({ error: 'changed', message: 'Schedule changed while you were reviewing. Nothing was imported.', rows }, { status: 409, headers: noStore })
    }
  }
  const { data, error } = await supabase.rpc('import_shows', {
    p_batch: { ...body.batch, artist_id: body.artist_id },
    p_rows: p.rows.map(r => ({ source_row: r.source_row, local_date: r.local_date, local_time: r.local_time, timezone: r.timezone, scheduled_at: r.scheduled_at, expect: r.expect, venue_id: r.venue_id, venue_name: r.venue_name, venue_city: r.venue_city, venue_country: r.venue_country, name: r.name })),
    p_fingerprint: current,
  })
  if (error) {
    const m = error.message
    const [status, msg] = /NOT_AUTHORIZED/.test(m) ? [403, 'You can no longer edit this artist’s shows, so nothing was imported.']
      : /IMPORT_STALE/.test(m) ? [409, 'Schedule changed while you were importing. Nothing was imported; review again.']
      : /BATCH_ID_CONFLICT/.test(m) ? [409, 'This import was already sent with different rows. Start the import again.']
      : /ROW_CHANGED_SINCE_REVIEW/.test(m) ? [409, 'A date has passed since you reviewed. Review again.']
      : /ROW_|VENUE_NOT_IN_RECORDS|BAD_/.test(m) ? [422, 'A row couldn’t be imported. Review again.']
      : [500, 'Could not import. Nothing was saved; try again.']
    if (status === 500) console.error('[shows/import] failed:', m)
    return NextResponse.json({ error: /IMPORT_STALE/.test(m) ? 'changed' : 'refused', message: msg, row: (error as any).details || undefined }, { status, headers: noStore })
  }
  return NextResponse.json(data, { headers: noStore })
}
