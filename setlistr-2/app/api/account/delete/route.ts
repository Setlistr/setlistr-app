import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CHUNK_SIZE = 200
const REMOVE_BATCH = 100

// Each failure says exactly what has and hasn't been removed. The stages run
// in this order so the account is never deleted while its files remain:
// 1) collect, 2) delete files and verify they're gone, 3) request removal of
// the internal Notion record, 4) delete or anonymise database records,
// 5) delete the sign-in last. Every step is safe to repeat, so trying again
// after a failure picks up where it stopped.
const FILES_NOT_DELETED = {
  error: 'We couldn’t delete all of your files, so your account hasn’t been deleted and nothing else was removed. Please try again, or contact info@setlistr.ai.',
  code: 'files_not_deleted',
}
const NOTICE_NOT_SENT = {
  error: 'Your uploaded files were deleted, but we couldn’t finish deleting your account, and nothing else was removed. Please try again, or contact info@setlistr.ai.',
  code: 'deletion_incomplete',
}
const RECORDS_INCOMPLETE = {
  error: 'Your uploaded files were deleted, but we couldn’t finish deleting your account records. Please try again, or contact info@setlistr.ai.',
  code: 'deletion_incomplete',
}

// Shown on other artists' records this person worked on as a team member,
// in place of their name, once their account is gone.
const FORMER_MEMBER = 'Former team member'

// Internal inbox that receives the request to remove the account's entry from
// the Notion artists database (see step 3).
const NOTION_REMOVAL_INBOX = 'info@setlistr.ai'

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

function fail(step: string, error: unknown, body: { error: string; code: string } = RECORDS_INCOMPLETE) {
  console.error(`[account/delete] Failed at step "${step}":`, error)
  return NextResponse.json(body, { status: 500 })
}

// Parses a Supabase Storage object URL (public, signed, or authenticated)
// into { bucket, path }. Returns null if the URL doesn't match that shape.
function parseStorageObjectUrl(url: string): { bucket: string; path: string } | null {
  const match = url.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?]+)/)
  if (!match) return null
  return { bucket: match[1], path: decodeURIComponent(match[2]) }
}

function splitPath(path: string): { dir: string; name: string } {
  const i = path.lastIndexOf('/')
  return i === -1 ? { dir: '', name: path } : { dir: path.slice(0, i), name: path.slice(i + 1) }
}

export async function POST() {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = user.id
  const email = user.email ?? ''
  const admin = createAdminSupabaseClient()

  // ── 1. Collect ────────────────────────────────────────────────────────────

  // a) This account's own performances (it is the artist). Team members'
  //    performances for other artists are never collected here.
  const { data: performances, error: perfSelectError } = await admin
    .from('performances')
    .select('id, show_id, recording_path, setlist_path, setlist_photo_url, photo_url')
    .eq('user_id', userId)
  if (perfSelectError) return fail('select performances', perfSelectError, FILES_NOT_DELETED)
  const performanceIds = (performances ?? []).map(p => p.id as string)
  const showIds = Array.from(new Set((performances ?? []).map(p => p.show_id as string | null).filter((s): s is string => !!s)))

  // b) This user's artist row(s) — one-to-one in practice, coded generally
  const { data: artists, error: artistSelectError } = await admin
    .from('artists')
    .select('id')
    .eq('user_id', userId)
  if (artistSelectError) return fail('select artists', artistSelectError, FILES_NOT_DELETED)
  const artistIds = (artists ?? []).map(a => a.id as string)

  // c) Name and sign-up date, for the internal record removal request (step 3).
  //    The whole row, so a missing optional column can't drop the name.
  const { data: profile } = await admin.from('profiles').select('*').eq('id', userId).maybeSingle()

  // d) Files to delete, by bucket
  const files = new Map<string, Set<string>>()
  const addFile = (bucket: string, path: string | null | undefined) => {
    if (!path) return
    const set = files.get(bucket) ?? new Set<string>()
    set.add(path)
    files.set(bucket, set)
  }

  // Recordings, setlist files and photos attached to this account's own shows,
  // whoever uploaded them (a team member's upload for this artist is this
  // artist's record).
  for (const p of performances ?? []) {
    addFile('show-recordings', p.recording_path as string | null)
    addFile('show-recordings', p.setlist_path as string | null)
    for (const url of [p.setlist_photo_url, p.photo_url] as (string | null)[]) {
      const parsed = url ? parseStorageObjectUrl(url) : null
      if (parsed) addFile(parsed.bucket, parsed.path)
    }
  }

  // audio_captures.storage_path for those artist ids
  for (const idChunk of chunk(artistIds, CHUNK_SIZE)) {
    const { data: captures, error: captureSelectError } = await admin
      .from('audio_captures')
      .select('storage_path')
      .in('artist_id', idChunk)
      .not('storage_path', 'is', null)
    if (captureSelectError) return fail('select audio_captures.storage_path', captureSelectError, FILES_NOT_DELETED)
    for (const c of captures ?? []) {
      const path = c.storage_path as string | null
      if (!path) continue
      console.warn('[account/delete] audio storage_path encountered — verify bucket', { storagePath: path, bucketsAttempted: AUDIO_CAPTURE_BUCKETS })
      for (const bucket of AUDIO_CAPTURE_BUCKETS) addFile(bucket, path)
    }
  }

  // attachments.url for those performance ids (cascades away with the performances)
  for (const idChunk of chunk(performanceIds, CHUNK_SIZE)) {
    const { data: attachments, error: attachmentSelectError } = await admin
      .from('attachments')
      .select('url')
      .in('performance_id', idChunk)
    if (attachmentSelectError) return fail('select attachments.url', attachmentSelectError, FILES_NOT_DELETED)
    for (const a of attachments ?? []) {
      const parsed = a.url ? parseStorageObjectUrl(a.url as string) : null
      if (parsed) addFile(parsed.bucket, parsed.path)
    }
  }

  // Files this account uploaded under its own folders that no show uses any
  // more (for example a setlist photo read during New Show and then
  // abandoned). Files in those folders that belong to another artist's show,
  // uploaded while working for that artist, are that artist's records and stay.
  const { data: othersByPath, error: othersPathError } = await admin
    .from('performances')
    .select('recording_path, setlist_path')
    .neq('user_id', userId)
    .or(`recording_path.like.${userId}/*,setlist_path.like.${userId}/*`)
  if (othersPathError) return fail('select other artists\' recordings', othersPathError, FILES_NOT_DELETED)
  const { data: othersByPhoto, error: othersPhotoError } = await admin
    .from('performances')
    .select('setlist_photo_url')
    .neq('user_id', userId)
    .like('setlist_photo_url', `%/setlists/${userId}/%`)
  if (othersPhotoError) return fail('select other artists\' setlist photos', othersPhotoError, FILES_NOT_DELETED)
  const keep = new Set<string>()
  for (const p of othersByPath ?? []) {
    if (p.recording_path) keep.add(`show-recordings/${p.recording_path}`)
    if (p.setlist_path) keep.add(`show-recordings/${p.setlist_path}`)
  }
  for (const p of othersByPhoto ?? []) {
    const parsed = p.setlist_photo_url ? parseStorageObjectUrl(p.setlist_photo_url as string) : null
    if (parsed) keep.add(`${parsed.bucket}/${parsed.path}`)
  }
  for (const [bucket, folder] of [['show-recordings', userId], ['performance-photos', `setlists/${userId}`], ['avatars', userId]] as const) {
    for (let offset = 0; ; offset += 1000) {
      const { data: listed, error: listError } = await admin.storage.from(bucket).list(folder, { limit: 1000, offset })
      if (listError) return fail(`list ${bucket}/${folder}`, listError, FILES_NOT_DELETED)
      for (const f of listed ?? []) {
        if (!f.name || f.id === null) continue   // a sub-folder, not a file
        const path = `${folder}/${f.name}`
        if (!keep.has(`${bucket}/${path}`)) addFile(bucket, path)
      }
      if (!listed || listed.length < 1000) break
    }
  }

  // ── 2. Delete files, then confirm each one is gone ────────────────────────
  for (const [bucket, set] of Array.from(files.entries())) {
    for (const batch of chunk(Array.from(set), REMOVE_BATCH)) {
      const { error: removeError } = await admin.storage.from(bucket).remove(batch)
      if (removeError) return fail(`remove files from ${bucket}`, removeError, FILES_NOT_DELETED)
    }
  }
  let remaining = 0
  for (const [bucket, set] of Array.from(files.entries())) {
    for (const path of Array.from(set)) {
      const { dir, name } = splitPath(path)
      const { data: found, error: verifyError } = await admin.storage.from(bucket).list(dir, { search: name, limit: 100 })
      if (verifyError) return fail(`verify ${bucket}`, verifyError, FILES_NOT_DELETED)
      if ((found ?? []).some(f => f.name === name)) remaining++
    }
  }
  if (remaining > 0) return fail('files still present after removal', { remaining }, FILES_NOT_DELETED)

  // ── 3. Request removal of the internal Notion record ──────────────────────
  // The profile trigger copies new accounts into the Notion artists database,
  // titled with the person's name (or email when no name was set). No page id
  // is stored, and names aren't unique, so the page can't be matched safely
  // from here; an admin removes it from this request instead.
  {
    const key = process.env.RESEND_API_KEY
    if (!key) return fail('notion removal request (RESEND_API_KEY missing)', null, NOTICE_NOT_SENT)
    const created = (profile?.created_at as string | undefined) || user.created_at
    const signedUp = created ? new Date(created).toISOString().slice(0, 10) : 'unknown'
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Setlistr <invites@setlistr.ai>',
          to: NOTION_REMOVAL_INBOX,
          subject: 'Account deleted: remove its Notion artist entry',
          text: [
            'A Setlistr account was deleted. Please remove its entry from the Notion artists database, and its show entries.',
            '',
            `Name: ${(profile?.full_name as string | null) || '(none set)'}`,
            `Email: ${email || '(none)'}`,
            `Signed up: ${signedUp}`,
            '',
            'The Notion page is titled with the name, or the email when no name was set.',
          ].join('\n'),
        }),
      })
      if (!res.ok) return fail('notion removal request', await res.text().catch(() => res.status), NOTICE_NOT_SENT)
    } catch (err) {
      return fail('notion removal request', err, NOTICE_NOT_SENT)
    }
  }

  // ── 4. Database records ───────────────────────────────────────────────────

  // a) Recognition records for this account's shows: processing logs (they
  //    would otherwise lose their show link and stay as orphans holding the
  //    device type and recognition responses), recognition jobs and results,
  //    and capture records.
  for (const idChunk of chunk(performanceIds, CHUNK_SIZE)) {
    const { error } = await admin.from('recognition_logs').delete().in('performance_id', idChunk)
    if (error) return fail('delete recognition_logs', error)
  }
  const captureIds = new Set<string>()
  for (const [column, ids] of [['show_id', showIds], ['artist_id', [userId, ...artistIds]]] as const) {
    for (const idChunk of chunk(ids as string[], CHUNK_SIZE)) {
      const { data, error } = await admin.from('audio_captures').select('id').in(column, idChunk)
      if (error) return fail(`select audio_captures by ${column}`, error)
      for (const c of data ?? []) captureIds.add(c.id as string)
    }
  }
  const jobIds = new Set<string>()
  for (const idChunk of chunk(Array.from(captureIds), CHUNK_SIZE)) {
    const { data, error } = await admin.from('recognition_jobs').select('id').in('audio_capture_id', idChunk)
    if (error) return fail('select recognition_jobs by capture', error)
    for (const j of data ?? []) jobIds.add(j.id as string)
  }
  for (const idChunk of chunk(performanceIds, CHUNK_SIZE)) {
    const { data, error } = await admin.from('recognition_jobs').select('id').in('raw_request->>performance_id', idChunk)
    if (error) return fail('select recognition_jobs by performance', error)
    for (const j of data ?? []) jobIds.add(j.id as string)
  }
  for (const idChunk of chunk(Array.from(jobIds), CHUNK_SIZE)) {
    const { error: resultsErr } = await admin.from('recognition_results').delete().in('job_id', idChunk)
    if (resultsErr) return fail('delete recognition_results', resultsErr)
    const { error: jobsErr } = await admin.from('recognition_jobs').delete().in('id', idChunk)
    if (jobsErr) return fail('delete recognition_jobs', jobsErr)
  }
  for (const idChunk of chunk(Array.from(captureIds), CHUNK_SIZE)) {
    const { error } = await admin.from('audio_captures').delete().in('id', idChunk)
    if (error) return fail('delete audio_captures', error)
  }

  // b) Usage events about this account or its shows
  {
    const { error } = await admin.from('product_events').delete().eq('user_id', userId)
    if (error) return fail('delete product_events by user', error)
  }
  for (const idChunk of chunk(performanceIds, CHUNK_SIZE)) {
    const { error } = await admin.from('product_events').delete().in('performance_id', idChunk)
    if (error) return fail('delete product_events by performance', error)
  }

  // c) detection_events / manual_song_events — by performance_id AND by user_id,
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

  // d) Delete this user's performances. Cascades: attachments, capture_sessions,
  //    performance_songs, reconciliation_runs. SET NULL (automatic, no action
  //    needed here): planned_setlists.performance_id.
  {
    const { error } = await admin.from('performances').delete().eq('user_id', userId)
    if (error) return fail('delete performances', error)
  }

  // e) This account's own bookings and spreadsheet imports (its workspace).
  //    Shows go first: they reference the import batches.
  {
    const { error } = await admin.from('shows').delete().eq('created_by', userId)
    if (error) return fail('delete own shows', error)
  }
  {
    const { error } = await admin.from('show_import_batches').delete().eq('artist_id', userId)
    if (error) return fail('delete own show_import_batches', error)
  }

  // f) Children of the artist row that would otherwise SET NULL into orphans —
  //    must be removed before the artist row itself.
  for (const idChunk of chunk(artistIds, CHUNK_SIZE)) {
    const { error: captureErr } = await admin.from('capture_sessions').delete().in('artist_id', idChunk)
    if (captureErr) return fail('delete capture_sessions by artist_id', captureErr)

    const { error: songsErr } = await admin.from('songs').delete().in('artist_id', idChunk)
    if (songsErr) return fail('delete songs', songsErr)
  }

  // g) Delete the artist row itself (no FK to auth.users/profiles — must be explicit)
  {
    const { error } = await admin.from('artists').delete().eq('user_id', userId)
    if (error) return fail('delete artists', error)
  }

  // h) Other artists' records this person worked on as a team member: keep the
  //    records (they belong to those artists) and remove this person from them.
  //    These columns reference the profile without ON DELETE, so leaving them
  //    would also block step 5.
  {
    const { error } = await admin.from('performances').update({ captured_by: null, captured_by_name: FORMER_MEMBER }).eq('captured_by', userId)
    if (error) return fail('clear performances.captured_by', error)
  }
  {
    const { error } = await admin.from('performances').update({ started_by: null }).eq('started_by', userId)
    if (error) return fail('clear performances.started_by', error)
  }
  {
    const { error } = await admin.from('shows').update({ scheduled_by: null, scheduled_by_name: FORMER_MEMBER }).eq('scheduled_by', userId)
    if (error) return fail('clear shows.scheduled_by', error)
  }
  {
    // imported_by can't be empty: an import made for another artist is
    // attributed to that artist, on whose behalf it was made.
    const { data: batches, error: batchSelectError } = await admin.from('show_import_batches').select('id, artist_id').eq('imported_by', userId)
    if (batchSelectError) return fail('select show_import_batches.imported_by', batchSelectError)
    for (const b of batches ?? []) {
      const { error } = await admin.from('show_import_batches').update({ imported_by: b.artist_id }).eq('id', b.id)
      if (error) return fail('reassign show_import_batches.imported_by', error)
    }
    const { error: undoneError } = await admin.from('show_import_batches').update({ undone_by: null }).eq('undone_by', userId)
    if (undoneError) return fail('clear show_import_batches.undone_by', undoneError)
  }

  // i) artist_delegates.invited_by — null first, fall back to delete if the column is NOT NULL
  {
    const { error } = await admin.from('artist_delegates').update({ invited_by: null }).eq('invited_by', userId)
    if (error) {
      console.warn('[account/delete] invited_by update failed, falling back to delete:', error)
      const { error: deleteErr } = await admin.from('artist_delegates').delete().eq('invited_by', userId)
      if (deleteErr) return fail('delete artist_delegates (invited_by fallback)', deleteErr)
    }
  }

  // j) The access invitation for this email: it only grants access to the
  //    account being deleted. A later sign-up needs a new invitation.
  for (const address of Array.from(new Set([email, email.toLowerCase()].filter(Boolean)))) {
    const { error } = await admin.from('beta_invites').delete().eq('email', address)
    if (error) return fail('delete beta_invites', error)
  }

  // ── 5. Delete the auth user last — profiles and its remaining cascades fire from here
  {
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) return fail('delete auth user', error)
  }

  return NextResponse.json({ success: true })
}
