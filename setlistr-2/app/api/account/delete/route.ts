import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CHUNK_SIZE = 200
const GENERIC_ERROR = { error: 'Account deletion failed. Please try again or contact support.' }

// NOTE: audio_captures.storage_path is bucket-relative but which bucket it
// lives in is unconfirmed and currently unverifiable — storage_path is null
// on every existing row. Rather than guess, attempt removal in both private
// buckets; a remove() call against a bucket that doesn't hold the object is
// harmless. The first real (non-null) occurrence also logs a distinct
// warning so it's visible in Vercel logs the day the capture pipeline
// starts populating this column.
const AUDIO_CAPTURE_BUCKETS = ['show-recordings', 'performance-proofs']

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

function fail(step: string, error: unknown) {
  console.error(`[account/delete] Failed at step "${step}":`, error)
  return NextResponse.json(GENERIC_ERROR, { status: 500 })
}

// Parses a Supabase Storage object URL (public, signed, or authenticated)
// into { bucket, path }. Returns null if the URL doesn't match that shape.
function parseStorageObjectUrl(url: string): { bucket: string; path: string } | null {
  const match = url.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?]+)/)
  if (!match) return null
  return { bucket: match[1], path: decodeURIComponent(match[2]) }
}

export async function POST() {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = user.id
  const admin = createAdminSupabaseClient()

  // a) This user's performances
  const { data: performances, error: perfSelectError } = await admin
    .from('performances')
    .select('id')
    .eq('user_id', userId)
  if (perfSelectError) return fail('select performances', perfSelectError)
  const performanceIds = (performances ?? []).map(p => p.id as string)

  // b) This user's artist row(s) — one-to-one in practice, coded generally
  const { data: artists, error: artistSelectError } = await admin
    .from('artists')
    .select('id')
    .eq('user_id', userId)
  if (artistSelectError) return fail('select artists', artistSelectError)
  const artistIds = (artists ?? []).map(a => a.id as string)

  // c) audio_captures.storage_path (non-null) for those artist ids
  const audioCapturePaths: string[] = []
  for (const idChunk of chunk(artistIds, CHUNK_SIZE)) {
    const { data: captures, error: captureSelectError } = await admin
      .from('audio_captures')
      .select('storage_path')
      .in('artist_id', idChunk)
      .not('storage_path', 'is', null)
    if (captureSelectError) return fail('select audio_captures.storage_path', captureSelectError)
    for (const c of captures ?? []) {
      if (c.storage_path) audioCapturePaths.push(c.storage_path as string)
    }
  }

  // d) attachments.url for those performance ids, parsed into bucket + path.
  //    Must happen before performances are deleted (attachments cascades away with them).
  const attachmentObjects: { bucket: string; path: string }[] = []
  for (const idChunk of chunk(performanceIds, CHUNK_SIZE)) {
    const { data: attachments, error: attachmentSelectError } = await admin
      .from('attachments')
      .select('url')
      .in('performance_id', idChunk)
    if (attachmentSelectError) return fail('select attachments.url', attachmentSelectError)
    for (const a of attachments ?? []) {
      const parsed = a.url ? parseStorageObjectUrl(a.url as string) : null
      if (parsed) attachmentObjects.push(parsed)
    }
  }

  // e) Remove collected storage objects, plus an avatars/<userId> prefix sweep.
  //    Storage failures are logged only — they must never abort account deletion.
  try {
    const byBucket = new Map<string, string[]>()
    for (const path of audioCapturePaths) {
      console.warn('[account/delete] audio storage_path encountered — verify bucket', {
        storagePath: path,
        bucketsAttempted: AUDIO_CAPTURE_BUCKETS,
      })
      for (const bucket of AUDIO_CAPTURE_BUCKETS) {
        const list = byBucket.get(bucket) ?? []
        list.push(path)
        byBucket.set(bucket, list)
      }
    }
    for (const { bucket, path } of attachmentObjects) {
      const list = byBucket.get(bucket) ?? []
      list.push(path)
      byBucket.set(bucket, list)
    }
    for (const [bucket, paths] of Array.from(byBucket.entries())) {
      if (paths.length === 0) continue
      const { error: removeError } = await admin.storage.from(bucket).remove(paths)
      if (removeError) {
        console.error(`[account/delete] Storage removal failed for bucket "${bucket}":`, removeError)
      }
    }

    const { data: avatarFiles, error: avatarListError } = await admin.storage.from('avatars').list(userId)
    if (avatarListError) {
      console.error('[account/delete] Failed to list avatars/<userId> prefix:', avatarListError)
    } else if (avatarFiles && avatarFiles.length > 0) {
      const avatarPaths = avatarFiles.map(f => `${userId}/${f.name}`)
      const { error: avatarRemoveError } = await admin.storage.from('avatars').remove(avatarPaths)
      if (avatarRemoveError) {
        console.error('[account/delete] Failed to remove avatars/<userId> files:', avatarRemoveError)
      }
    }
  } catch (storageErr) {
    console.error('[account/delete] Unexpected storage cleanup error:', storageErr)
  }

  // f) detection_events / manual_song_events — by performance_id AND by user_id,
  //    since rows on both tables can carry a null performance_id.
  for (const idChunk of chunk(performanceIds, CHUNK_SIZE)) {
    const { error } = await admin.from('detection_events').delete().in('performance_id', idChunk)
    if (error) return fail('delete detection_events by performance_id', error)
  }
  {
    const { error } = await admin.from('detection_events').delete().eq('user_id', userId)
    if (error) return fail('delete detection_events by user_id', error)
  }
  for (const idChunk of chunk(performanceIds, CHUNK_SIZE)) {
    const { error } = await admin.from('manual_song_events').delete().in('performance_id', idChunk)
    if (error) return fail('delete manual_song_events by performance_id', error)
  }
  {
    const { error } = await admin.from('manual_song_events').delete().eq('user_id', userId)
    if (error) return fail('delete manual_song_events by user_id', error)
  }

  // g) Delete this user's performances. Cascades: attachments, capture_sessions,
  //    performance_songs, reconciliation_runs. SET NULL (automatic, no action
  //    needed here): recognition_logs.performance_id, planned_setlists.performance_id.
  {
    const { error } = await admin.from('performances').delete().eq('user_id', userId)
    if (error) return fail('delete performances', error)
  }

  // h) Children of the artist row that would otherwise SET NULL into orphans —
  //    must be removed before the artist row itself.
  for (const idChunk of chunk(artistIds, CHUNK_SIZE)) {
    const { error: audioErr } = await admin.from('audio_captures').delete().in('artist_id', idChunk)
    if (audioErr) return fail('delete audio_captures', audioErr)

    const { error: captureErr } = await admin.from('capture_sessions').delete().in('artist_id', idChunk)
    if (captureErr) return fail('delete capture_sessions by artist_id', captureErr)

    const { error: songsErr } = await admin.from('songs').delete().in('artist_id', idChunk)
    if (songsErr) return fail('delete songs', songsErr)
  }

  // i) Delete the artist row itself (no FK to auth.users/profiles — must be explicit)
  {
    const { error } = await admin.from('artists').delete().eq('user_id', userId)
    if (error) return fail('delete artists', error)
  }

  // j) Other users' performances captured by this user — null the reference, never delete the row
  {
    const { error } = await admin.from('performances').update({ captured_by: null }).eq('captured_by', userId)
    if (error) return fail('clear performances.captured_by', error)
  }

  // k) artist_delegates.invited_by — null first, fall back to delete if the column is NOT NULL
  {
    const { error } = await admin.from('artist_delegates').update({ invited_by: null }).eq('invited_by', userId)
    if (error) {
      console.warn('[account/delete] invited_by update failed, falling back to delete:', error)
      const { error: deleteErr } = await admin.from('artist_delegates').delete().eq('invited_by', userId)
      if (deleteErr) return fail('delete artist_delegates (invited_by fallback)', deleteErr)
    }
  }

  // l) Delete the auth user last — profiles and its remaining cascades fire from here
  {
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) return fail('delete auth user', error)
  }

  return NextResponse.json({ success: true })
}
