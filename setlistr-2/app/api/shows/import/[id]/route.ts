import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { importPreviewMode, PREVIEW_DISABLED_MESSAGE } from '@/lib/shows/import/mode'

export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store, max-age=0' }

// GET /api/shows/import/[id] — one import's result: counts, the rows left
// out with their reasons, each imported show and whether Undo would keep it
// (used since: capture linked, setlist attached, started, cancelled or
// edited — the same rules as undo_show_import). Readable by anyone who can
// see the artist's shows (the batch read goes through RLS first).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (importPreviewMode(req.headers.get('host'))) return NextResponse.json({ error: 'Not available on Preview' }, { status: 404, headers: noStore })
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: noStore })
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore })
  const { data: batch } = await supabase.from('show_import_batches')
    .select('id, artist_id, file_name, sheet_name, created_at, imported_count, row_count, skipped_rows, status, imported_by, imported_by_name, undo_result, undone_at')
    .eq('id', params.id).maybeSingle()
  if (!batch) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: noStore })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Not configured' }, { status: 500, headers: noStore })
  const service = createClient(url, key)
  const { data: shows, error } = await service.from('shows')
    .select('id, status, source_row, local_date, local_time, scheduled_at, timezone, created_at, updated_at, venues(name, city)')
    .eq('import_batch_id', params.id).order('source_row').order('local_date')
  if (error) return NextResponse.json({ error: 'Could not load' }, { status: 500, headers: noStore })
  // Why Undo would keep each show: the database's own rule (show_import_usage),
  // so this preview always matches what Undo does.
  const { data: usage, error: usageError } = await supabase.rpc('show_import_usage', { p_batch_id: params.id })
  if (usageError) return NextResponse.json({ error: 'Could not load' }, { status: 500, headers: noStore })
  const reasonOf = new Map(((usage || []) as { show_id: string; reason: string | null }[]).map(u => [u.show_id, u.reason]))
  const used = (s: any) => reasonOf.get(s.id) ?? null
  return NextResponse.json({
    id: batch.id, artistId: batch.artist_id, file: batch.file_name, sheet: batch.sheet_name, at: batch.created_at, by: batch.imported_by_name,
    rowCount: batch.row_count, status: batch.status, undo: batch.undo_result, undoneAt: batch.undone_at,
    leftOut: batch.skipped_rows || [],
    shows: (shows || []).map((s: any) => ({ id: s.id, row: s.source_row, date: s.local_date, time: s.local_time ? s.local_time.slice(0, 5) : null, scheduledAt: s.scheduled_at, zone: s.scheduled_at ? s.timezone : null, status: s.status, venue: s.venues?.name || '', city: s.venues?.city || '', used: used(s) })),
  }, { headers: noStore })
}

// DELETE /api/shows/import/[id] — Undo: removes only the shows from this
// import that haven't been used since; keeps the rest and says why.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  // Preview deployments use production data: Undo is refused there first.
  if (importPreviewMode(req.headers.get('host'))) return NextResponse.json({ error: PREVIEW_DISABLED_MESSAGE }, { status: 403, headers: noStore })
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore })
  const { data, error } = await supabase.rpc('undo_show_import', { p_batch_id: params.id })
  if (error) {
    const m = error.message
    return NextResponse.json({ error: /NOT_AUTHORIZED/.test(m) ? 'Only the artist and teammates who can edit can undo an import.' : /BATCH_NOT_FOUND/.test(m) ? 'Not found' : 'Could not undo. Nothing was removed; try again.' },
      { status: /NOT_AUTHORIZED/.test(m) ? 403 : /BATCH_NOT_FOUND/.test(m) ? 404 : 500, headers: noStore })
  }
  return NextResponse.json(data, { headers: noStore })
}
