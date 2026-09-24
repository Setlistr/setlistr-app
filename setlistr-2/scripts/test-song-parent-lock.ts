// Real Postgres/PostgREST-level tests for the song-parent reassignment
// lock (0012_song_parent_lock.sql), run against a LOCAL Supabase instance
// with real Auth sessions. Covers both performance_songs.performance_id
// and setlist_items.setlist_id.
//
// HARD LOCALHOST GUARD: refuses to run unless the Supabase URL resolves to
// 127.0.0.1/localhost. There is no override.
//
// Every denial requires BOTH the trigger's own SQLSTATE (23514) and its
// exact raised message — not just "the request failed" — which is what
// proves the TRIGGER caught it, as opposed to RLS silently filtering the
// row (success, zero rows, no error) or some other constraint. Every
// denial also asserts the before/after rows both actually exist
// (non-null) before comparing them — rowsEqual(null, null) is vacuously
// true and would otherwise silently pass if a row were unexpectedly
// missing. Every denial is run as a caller RLS would otherwise authorize
// to write the row for that specific new value — most directly, a manager
// holding an accepted delegation for BOTH the old and the new parent's
// artist, which is the exact scenario reproduced against the live
// policies (songs_own / setlist_items_self) before this migration
// existed: both currently authorize UPDATE by checking whether the caller
// can act for the CURRENT parent's owner, with no WITH CHECK narrowing
// the new parent-reference value, so a caller authorized for both artists
// passed on both sides of a reparenting UPDATE.
//
// FIXTURE NOTE: setlists/setlist_items have no CREATE TABLE anywhere in
// this repository (live-schema-only). This fixture now matches the live-
// confirmed structure: setlists.artist_id NOT NULL REFERENCES artists(id)
// with UNIQUE(show_id, artist_id), and setlist_items.position NOT NULL
// with no default. The `artists` table itself is a documented
// simplification — only a bare id column, since artists' own real column
// set/ownership model is outside this task's scope; it exists here only
// as a valid FK target for setlists.artist_id. setlist_items.setlist_id
// is confirmed live NOT NULL REFERENCES setlists(id) ON DELETE CASCADE —
// no longer an assumption.
//
// The same-artist reparenting test uses two DIFFERENT shows belonging to
// the same owner (each with its own setlist, same artist_id) rather than
// two setlists under one show — UNIQUE(show_id, artist_id) would reject a
// duplicate (show_id, artist_id) pair outright, which is not what that
// test is checking.
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-song-parent-lock.ts

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import * as crypto from 'crypto'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function isLocalhost(url: string) {
  try {
    const h = new URL(url).hostname
    return h === '127.0.0.1' || h === 'localhost'
  } catch {
    return false
  }
}

if (!isLocalhost(SUPABASE_URL)) {
  console.error(`REFUSING TO RUN: this harness only targets localhost. NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL || '(unset)'}`)
  process.exit(1)
}
if (!ANON_KEY || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const service: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY)

const RUN = Date.now().toString(36)
const createdUserIds: string[] = []
const createdArtistIds: string[] = []

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

const TRIGGER_MSG_SONG = 'performance_songs.performance_id cannot be changed after creation'
const TRIGGER_MSG_ITEM = 'setlist_items.setlist_id cannot be changed after creation'
const SQLSTATE_CHECK_VIOLATION = '23514'

function rowsEqual(a: Record<string, unknown> | null, b: Record<string, unknown> | null): boolean {
  if (a === null || b === null) return a === b
  const aKeys = Object.keys(a).sort()
  const bKeys = Object.keys(b).sort()
  if (aKeys.length !== bKeys.length || aKeys.some((k, i) => k !== bKeys[i])) return false
  return aKeys.every((k) => a[k] === b[k])
}

// Asserts the row existed both before and after (never vacuously equal
// because both happen to be null) AND every field matches exactly.
function checkUnchanged(label: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  check(`${label}: before/after rows both exist`, before !== null && after !== null, `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
  check(`${label}: complete row match`, rowsEqual(before, after), `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
}

function checkDenied(label: string, error: { code?: string; message?: string } | null | undefined, expectedMessage: string) {
  check(`${label}: SQLSTATE 23514`, error?.code === SQLSTATE_CHECK_VIOLATION, JSON.stringify(error))
  check(`${label}: exact trigger message`, error?.message === expectedMessage, JSON.stringify(error))
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }, label: string): T {
  if (res.error || !res.data) throw new Error(`${label} failed: ${res.error?.message || 'no data returned'}`)
  return res.data
}

interface Persona {
  label: string
  userId: string
  client: SupabaseClient
}

async function createPersona(label: string): Promise<Persona> {
  const email = `songlock-${RUN}-${label}@example.test`.toLowerCase()
  const password = crypto.randomBytes(18).toString('base64url')

  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser failed for ${label}: ${error?.message}`)
  const userId = data.user.id
  createdUserIds.push(userId)

  const profile = unwrap<{ id: string }>(await service.from('profiles').insert({ id: userId, full_name: label }).select().single(), `profile insert for ${label}`)
  void profile

  const client = createClient(SUPABASE_URL, ANON_KEY)
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password })
  if (signInErr) throw new Error(`sign-in failed for ${label}: ${signInErr.message}`)

  return { label, userId, client }
}

async function seedDelegation(artistId: string, delegateId: string) {
  const row = unwrap<{ id: string }>(await service.from('artist_delegates').insert({
    artist_id: artistId, delegate_id: delegateId, role: 'manager', accepted_at: new Date().toISOString(),
  }).select().single(), `seedDelegation(${artistId}, ${delegateId})`)
  void row
}

async function readSong(id: string) {
  const { data, error } = await service.from('performance_songs').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`readSong failed: ${error.message}`)
  return data
}
async function readItem(id: string) {
  const { data, error } = await service.from('setlist_items').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`readItem failed: ${error.message}`)
  return data
}

async function cleanup() {
  const errors: string[] = []

  const { data: perfRows, error: perfLookupErr } = await service.from('performances').select('id').in('user_id', createdUserIds)
  if (perfLookupErr) errors.push(`lookup performances: ${perfLookupErr.message}`)
  const perfIds = (perfRows || []).map((p: any) => p.id)
  if (perfIds.length > 0) {
    const { error } = await service.from('performance_songs').delete().in('performance_id', perfIds)
    if (error) errors.push(`delete performance_songs: ${error.message}`)
  }
  {
    const { error } = await service.from('performances').delete().in('user_id', createdUserIds)
    if (error) errors.push(`delete performances: ${error.message}`)
  }

  const { data: showRows, error: showLookupErr } = await service.from('shows').select('id').in('created_by', createdUserIds)
  if (showLookupErr) errors.push(`lookup shows: ${showLookupErr.message}`)
  const showIds = (showRows || []).map((s: any) => s.id)
  let setlistIds: string[] = []
  if (showIds.length > 0) {
    const { data: setlistRows, error: setlistLookupErr } = await service.from('setlists').select('id').in('show_id', showIds)
    if (setlistLookupErr) errors.push(`lookup setlists: ${setlistLookupErr.message}`)
    setlistIds = (setlistRows || []).map((s: any) => s.id)
  }
  if (setlistIds.length > 0) {
    const { error } = await service.from('setlist_items').delete().in('setlist_id', setlistIds)
    if (error) errors.push(`delete setlist_items: ${error.message}`)
    const { error: e2 } = await service.from('setlists').delete().in('id', setlistIds)
    if (e2) errors.push(`delete setlists: ${e2.message}`)
  }
  {
    const { error } = await service.from('shows').delete().in('created_by', createdUserIds)
    if (error) errors.push(`delete shows: ${error.message}`)
  }

  if (createdArtistIds.length > 0) {
    const { error } = await service.from('artists').delete().in('id', createdArtistIds)
    if (error) errors.push(`delete artists: ${error.message}`)
  }

  {
    const { error } = await service.from('artist_delegates').delete().in('artist_id', createdUserIds)
    if (error) errors.push(`delete artist_delegates by artist_id: ${error.message}`)
  }
  {
    const { error } = await service.from('artist_delegates').delete().in('delegate_id', createdUserIds)
    if (error) errors.push(`delete artist_delegates by delegate_id: ${error.message}`)
  }
  for (const id of createdUserIds) {
    const { error } = await service.from('profiles').delete().eq('id', id)
    if (error) errors.push(`delete profile ${id}: ${error.message}`)
    const { error: userErr } = await service.auth.admin.deleteUser(id)
    if (userErr) errors.push(`delete auth user ${id}: ${userErr.message}`)
  }

  if (errors.length > 0) {
    console.error(`Cleanup failed with ${errors.length} error(s):`)
    for (const e of errors) console.error(`  ${e}`)
    throw new Error(`cleanup failed with ${errors.length} error(s)`)
  }
}

async function main() {
  console.log(`Run ${RUN} — targeting ${SUPABASE_URL}\n`)

  const ownerA = await createPersona('ownerA')
  const ownerC = await createPersona('ownerC')
  const manager = await createPersona('manager')

  await seedDelegation(ownerA.userId, manager.userId)
  await seedDelegation(ownerC.userId, manager.userId)

  const artistA = unwrap<{ id: string }>(await service.from('artists').insert({}).select().single(), 'artistA insert')
  createdArtistIds.push(artistA.id)
  const artistC = unwrap<{ id: string }>(await service.from('artists').insert({}).select().single(), 'artistC insert')
  createdArtistIds.push(artistC.id)

  const perfA1 = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: 'A1' }).select().single(), 'perfA1 insert')
  const perfA2 = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: 'A2' }).select().single(), 'perfA2 insert')
  const perfC = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerC.userId, venue_name: 'C' }).select().single(), 'perfC insert')
  const song = unwrap<{ id: string }>(await service.from('performance_songs').insert({ performance_id: perfA1.id, title: 'Song One' }).select().single(), 'song insert')

  // Same-artist reparenting test needs TWO shows for ownerA (not two
  // setlists under one show — UNIQUE(show_id, artist_id) forbids a
  // duplicate pair, and that's not what's being tested here).
  const showA1 = unwrap<{ id: string }>(await service.from('shows').insert({ created_by: ownerA.userId }).select().single(), 'showA1 insert')
  const showA2 = unwrap<{ id: string }>(await service.from('shows').insert({ created_by: ownerA.userId }).select().single(), 'showA2 insert')
  const showC = unwrap<{ id: string }>(await service.from('shows').insert({ created_by: ownerC.userId }).select().single(), 'showC insert')
  const setlistA1 = unwrap<{ id: string }>(await service.from('setlists').insert({ show_id: showA1.id, artist_id: artistA.id }).select().single(), 'setlistA1 insert')
  const setlistA2 = unwrap<{ id: string }>(await service.from('setlists').insert({ show_id: showA2.id, artist_id: artistA.id }).select().single(), 'setlistA2 insert')
  const setlistC = unwrap<{ id: string }>(await service.from('setlists').insert({ show_id: showC.id, artist_id: artistC.id }).select().single(), 'setlistC insert')
  const item = unwrap<{ id: string }>(await service.from('setlist_items').insert({ setlist_id: setlistA1.id, title: 'Item One', position: 1 }).select().single(), 'item insert')

  console.log('\n1. Cross-artist reparenting blocked (manager authorized for BOTH artists)')
  {
    const before = await readSong(song.id)
    const { error } = await manager.client.from('performance_songs').update({ performance_id: perfC.id }).eq('id', song.id)
    checkDenied('performance_songs', error, TRIGGER_MSG_SONG)
    const after = await readSong(song.id)
    checkUnchanged('performance_songs', before, after)

    const beforeI = await readItem(item.id)
    const { error: errI } = await manager.client.from('setlist_items').update({ setlist_id: setlistC.id }).eq('id', item.id)
    checkDenied('setlist_items', errI, TRIGGER_MSG_ITEM)
    const afterI = await readItem(item.id)
    checkUnchanged('setlist_items', beforeI, afterI)
  }

  console.log('\n2. Same-artist reparenting also blocked (two different shows, same owner)')
  {
    const before = await readSong(song.id)
    const { error } = await manager.client.from('performance_songs').update({ performance_id: perfA2.id }).eq('id', song.id)
    checkDenied('performance_songs (same-artist)', error, TRIGGER_MSG_SONG)
    const after = await readSong(song.id)
    checkUnchanged('performance_songs (same-artist)', before, after)

    const beforeI = await readItem(item.id)
    const { error: errI } = await manager.client.from('setlist_items').update({ setlist_id: setlistA2.id }).eq('id', item.id)
    checkDenied('setlist_items (same-artist)', errI, TRIGGER_MSG_ITEM)
    const afterI = await readItem(item.id)
    checkUnchanged('setlist_items (same-artist)', beforeI, afterI)
  }

  console.log('\n3. service_role cannot reparent either (no bypass)')
  {
    const before = await readSong(song.id)
    const { error } = await service.from('performance_songs').update({ performance_id: perfC.id }).eq('id', song.id)
    checkDenied('performance_songs (service_role)', error, TRIGGER_MSG_SONG)
    const after = await readSong(song.id)
    checkUnchanged('performance_songs (service_role)', before, after)

    const beforeI = await readItem(item.id)
    const { error: errI } = await service.from('setlist_items').update({ setlist_id: setlistC.id }).eq('id', item.id)
    checkDenied('setlist_items (service_role)', errI, TRIGGER_MSG_ITEM)
    const afterI = await readItem(item.id)
    checkUnchanged('setlist_items (service_role)', beforeI, afterI)
  }

  console.log('\n4. Bundled reparenting attempt + other field change leaves the ENTIRE row unchanged')
  {
    const before = await readSong(song.id)
    const { error } = await manager.client.from('performance_songs').update({ performance_id: perfC.id, title: 'Should Not Apply' }).eq('id', song.id)
    checkDenied('performance_songs (bundled)', error, TRIGGER_MSG_SONG)
    const after = await readSong(song.id)
    checkUnchanged('performance_songs (bundled)', before, after)

    const beforeI = await readItem(item.id)
    const { error: errI } = await manager.client.from('setlist_items').update({ setlist_id: setlistC.id, title: 'Should Not Apply' }).eq('id', item.id)
    checkDenied('setlist_items (bundled)', errI, TRIGGER_MSG_ITEM)
    const afterI = await readItem(item.id)
    checkUnchanged('setlist_items (bundled)', beforeI, afterI)
  }

  console.log('\n5. Ordinary edits (parent untouched) still work, verified by readback')
  {
    const { data, error } = await manager.client.from('performance_songs').update({ title: 'Edited Title' }).eq('id', song.id).select()
    check('performance_songs: ordinary edit succeeds', !error && (data?.length ?? 0) === 1, JSON.stringify(error))
    const after = await readSong(song.id)
    check('performance_songs: edit persisted, parent unchanged (readback)', after?.title === 'Edited Title' && after?.performance_id === perfA1.id, JSON.stringify(after))

    const { data: dataI, error: errI } = await manager.client.from('setlist_items').update({ title: 'Edited Item' }).eq('id', item.id).select()
    check('setlist_items: ordinary edit succeeds', !errI && (dataI?.length ?? 0) === 1, JSON.stringify(errI))
    const afterI = await readItem(item.id)
    check('setlist_items: edit persisted, parent unchanged (readback)', afterI?.title === 'Edited Item' && afterI?.setlist_id === setlistA1.id, JSON.stringify(afterI))
  }

  console.log('\n6. No-op parent value (re-sent unchanged) + another field change still works, verified by readback')
  {
    const { data, error } = await manager.client.from('performance_songs')
      .update({ performance_id: perfA1.id, artist: 'Re-sent Same Parent' }).eq('id', song.id).select()
    check('performance_songs: no-op parent update succeeds', !error && (data?.length ?? 0) === 1, JSON.stringify(error))
    const after = await readSong(song.id)
    check('performance_songs: no-op update persisted correctly (readback)', after?.artist === 'Re-sent Same Parent' && after?.performance_id === perfA1.id, JSON.stringify(after))

    const { data: dataI, error: errI } = await manager.client.from('setlist_items')
      .update({ setlist_id: setlistA1.id, artist_name: 'Re-sent Same Parent' }).eq('id', item.id).select()
    check('setlist_items: no-op parent update succeeds', !errI && (dataI?.length ?? 0) === 1, JSON.stringify(errI))
    const afterI = await readItem(item.id)
    check('setlist_items: no-op update persisted correctly (readback)', afterI?.artist_name === 'Re-sent Same Parent' && afterI?.setlist_id === setlistA1.id, JSON.stringify(afterI))
  }

  console.log('\n7. Legitimate inserts (new rows under their correct parent) still work')
  {
    const newSong = unwrap<{ id: string }>(await manager.client.from('performance_songs').insert({ performance_id: perfA1.id, title: 'New Song' }).select().single(), 'new song insert (manager)')
    check('performance_songs: insert succeeds', !!newSong)

    const newItem = unwrap<{ id: string }>(await manager.client.from('setlist_items').insert({ setlist_id: setlistA1.id, title: 'New Item', position: 2 }).select().single(), 'new item insert (manager)')
    check('setlist_items: insert succeeds', !!newItem)
  }

  console.log('\n8. Parent deletion retains its existing CASCADE behavior (DELETE never touches this BEFORE UPDATE trigger)')
  {
    const perfTemp = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: 'Temp' }).select().single(), 'perfTemp insert')
    const songTemp = unwrap<{ id: string }>(await service.from('performance_songs').insert({ performance_id: perfTemp.id, title: 'Temp Song' }).select().single(), 'songTemp insert')

    const { data: deletedPerf, error: delErr } = await service.from('performances').delete().eq('id', perfTemp.id).select()
    check('performances: delete succeeds with no error', !delErr, JSON.stringify(delErr))
    check('performances: exactly one row deleted', (deletedPerf?.length ?? 0) === 1, JSON.stringify(deletedPerf))

    const { data: perfGone, error: perfReadErr } = await service.from('performances').select('id').eq('id', perfTemp.id).maybeSingle()
    check('performances: readback succeeds with no error', !perfReadErr, JSON.stringify(perfReadErr))
    check('performances: parent confirmed absent', !perfGone, JSON.stringify(perfGone))

    const { data: songGone, error: songReadErr } = await service.from('performance_songs').select('id').eq('id', songTemp.id).maybeSingle()
    check('performance_songs: readback succeeds with no error', !songReadErr, JSON.stringify(songReadErr))
    check('performance_songs: child confirmed absent (cascade-deleted)', !songGone, JSON.stringify(songGone))

    const setlistTemp = unwrap<{ id: string }>(await service.from('setlists').insert({ show_id: showA1.id, artist_id: artistC.id }).select().single(), 'setlistTemp insert')
    const itemTemp = unwrap<{ id: string }>(await service.from('setlist_items').insert({ setlist_id: setlistTemp.id, title: 'Temp Item', position: 1 }).select().single(), 'itemTemp insert')

    const { data: deletedSetlist, error: delErr2 } = await service.from('setlists').delete().eq('id', setlistTemp.id).select()
    check('setlists: delete succeeds with no error', !delErr2, JSON.stringify(delErr2))
    check('setlists: exactly one row deleted', (deletedSetlist?.length ?? 0) === 1, JSON.stringify(deletedSetlist))

    const { data: setlistGone, error: setlistReadErr } = await service.from('setlists').select('id').eq('id', setlistTemp.id).maybeSingle()
    check('setlists: readback succeeds with no error', !setlistReadErr, JSON.stringify(setlistReadErr))
    check('setlists: parent confirmed absent', !setlistGone, JSON.stringify(setlistGone))

    const { data: itemGone, error: itemReadErr } = await service.from('setlist_items').select('id').eq('id', itemTemp.id).maybeSingle()
    check('setlist_items: readback succeeds with no error', !itemReadErr, JSON.stringify(itemReadErr))
    check('setlist_items: child confirmed absent (cascade-deleted)', !itemGone, JSON.stringify(itemGone))
  }

  console.log(`\n${pass} passed, ${fail} failed`)

  await cleanup()

  if (fail > 0) process.exit(1)
}

main().catch(async (err) => {
  console.error('Harness error:', err)
  await cleanup().catch(() => {})
  process.exit(1)
})
