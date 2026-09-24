// Real Postgres/PostgREST-level tests for the show/artist link
// reassignment lock (0013_show_link_reassignment_lock.sql): performances.
// show_id, performances.setlist_id, setlists.show_id, setlists.artist_id.
//
// HARD LOCALHOST GUARD: refuses to run unless the Supabase URL resolves to
// 127.0.0.1/localhost. There is no override.
//
// This migration deliberately does NOT assert that a show's creator must
// equal every performing artist, or that setlists.artist_id's owner must
// match performances.user_id/shows.created_by. Confirmed product decision
// (recorded, not implemented here): shared events (festivals, writers'
// rounds) are intentionally supported, with separate artist-owned
// performances/setlists per participating artist and no cross-artist
// private-access grant from shared membership. INSERT-time relationship
// validation implementing that decision remains explicitly open — these
// tests verify only that an EXISTING link cannot be silently reassigned
// or cleared after creation except by the FK's own confirmed cascade.
//
// Confirmed live FK actions (do not re-derive):
//   performances.show_id    -> shows(id)    ON DELETE SET NULL
//   performances.setlist_id -> setlists(id) ON DELETE SET NULL
//   setlists.show_id        -> shows(id)    ON DELETE CASCADE
//   setlists.artist_id      -> artists(id)  ON DELETE CASCADE
//
// Every denial requires the trigger's own SQLSTATE (23514) and exact
// message, plus before/after rows that both exist and match completely.
// Every legitimate SET NULL is verified by an explicit, error-checked
// readback of the actual stored state — not status/non-error alone.
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-show-link-lock.ts

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
const createdShowIds: string[] = []
const createdSetlistIds: string[] = []
const createdPerformanceIds: string[] = []

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

const MSG_PERF_SHOW = 'performances.show_id cannot be changed after creation'
const MSG_PERF_SETLIST = 'performances.setlist_id cannot be changed after creation'
const MSG_SETLIST_SHOW = 'setlists.show_id cannot be changed after creation'
const MSG_SETLIST_ARTIST = 'setlists.artist_id cannot be changed after creation'
const SQLSTATE = '23514'

function rowsEqual(a: Record<string, unknown> | null, b: Record<string, unknown> | null): boolean {
  if (a === null || b === null) return a === b
  const aKeys = Object.keys(a).sort()
  const bKeys = Object.keys(b).sort()
  if (aKeys.length !== bKeys.length || aKeys.some((k, i) => k !== bKeys[i])) return false
  return aKeys.every((k) => a[k] === b[k])
}
function checkUnchanged(label: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  check(`${label}: before/after rows both exist`, before !== null && after !== null, `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
  check(`${label}: complete row match`, rowsEqual(before, after), `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
}
// For a legitimate SET NULL: every column must match EXCEPT the ones the
// FK cascade is expected to have nulled — a full-row comparison with a
// precise exclusion list, not a hand-picked subset of "the fields we
// remembered to check."
function checkUnchangedExceptLinks(label: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null, exceptKeys: string[]) {
  check(`${label}: before/after rows both exist`, before !== null && after !== null, `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
  if (before === null || after === null) return
  const strip = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).filter(([k]) => !exceptKeys.includes(k)))
  check(`${label}: every column other than [${exceptKeys.join(', ')}] unchanged`, rowsEqual(strip(before), strip(after)), `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
  for (const k of exceptKeys) {
    check(`${label}: ${k} is specifically NULL`, after[k] === null, `after.${k}=${JSON.stringify(after[k])}`)
  }
}
function checkDenied(label: string, error: { code?: string; message?: string } | null | undefined, expectedMessage: string) {
  check(`${label}: SQLSTATE 23514`, error?.code === SQLSTATE, JSON.stringify(error))
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
  const email = `showlink-${RUN}-${label}@example.test`.toLowerCase()
  const password = crypto.randomBytes(18).toString('base64url')
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser failed for ${label}: ${error?.message}`)
  const userId = data.user.id
  createdUserIds.push(userId)
  unwrap<{ id: string }>(await service.from('profiles').insert({ id: userId, full_name: label }).select().single(), `profile for ${label}`)
  const client = createClient(SUPABASE_URL, ANON_KEY)
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password })
  if (signInErr) throw new Error(`sign-in failed for ${label}: ${signInErr.message}`)
  return { label, userId, client }
}

async function seedDelegation(artistId: string, delegateId: string) {
  unwrap<{ id: string }>(await service.from('artist_delegates').insert({
    artist_id: artistId, delegate_id: delegateId, role: 'manager', accepted_at: new Date().toISOString(),
  }).select().single(), `seedDelegation(${artistId}, ${delegateId})`)
}

async function readPerf(id: string) {
  const { data, error } = await service.from('performances').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`readPerf failed: ${error.message}`)
  return data
}
async function readSetlist(id: string) {
  const { data, error } = await service.from('setlists').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`readSetlist failed: ${error.message}`)
  return data
}

async function cleanup() {
  const errors: string[] = []
  if (createdPerformanceIds.length > 0) {
    const { error } = await service.from('performances').delete().in('id', createdPerformanceIds)
    if (error) errors.push(`delete performances: ${error.message}`)
  }
  if (createdSetlistIds.length > 0) {
    const { error } = await service.from('setlists').delete().in('id', createdSetlistIds)
    if (error) errors.push(`delete setlists: ${error.message}`)
  }
  if (createdShowIds.length > 0) {
    const { error } = await service.from('shows').delete().in('id', createdShowIds)
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

  const artistA = unwrap<{ id: string }>(await service.from('artists').insert({ user_id: ownerA.userId }).select().single(), 'artistA')
  createdArtistIds.push(artistA.id)
  const artistC = unwrap<{ id: string }>(await service.from('artists').insert({ user_id: ownerC.userId }).select().single(), 'artistC')
  createdArtistIds.push(artistC.id)

  const showA1 = unwrap<{ id: string }>(await service.from('shows').insert({ created_by: ownerA.userId }).select().single(), 'showA1')
  createdShowIds.push(showA1.id)
  const showA2 = unwrap<{ id: string }>(await service.from('shows').insert({ created_by: ownerA.userId }).select().single(), 'showA2')
  createdShowIds.push(showA2.id)
  const showC = unwrap<{ id: string }>(await service.from('shows').insert({ created_by: ownerC.userId }).select().single(), 'showC')
  createdShowIds.push(showC.id)

  const setlistA1 = unwrap<{ id: string }>(await service.from('setlists').insert({ show_id: showA1.id, artist_id: artistA.id }).select().single(), 'setlistA1')
  createdSetlistIds.push(setlistA1.id)
  const setlistA2 = unwrap<{ id: string }>(await service.from('setlists').insert({ show_id: showA2.id, artist_id: artistA.id }).select().single(), 'setlistA2')
  createdSetlistIds.push(setlistA2.id)
  const setlistC = unwrap<{ id: string }>(await service.from('setlists').insert({ show_id: showC.id, artist_id: artistC.id }).select().single(), 'setlistC')
  createdSetlistIds.push(setlistC.id)

  const perfA = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: 'A', show_id: showA1.id, setlist_id: setlistA1.id }).select().single(), 'perfA')
  createdPerformanceIds.push(perfA.id)

  console.log('\n1. Cross-artist reassignment blocked (manager authorized for both)')
  {
    const before = await readPerf(perfA.id)
    const { error } = await manager.client.from('performances').update({ show_id: showC.id }).eq('id', perfA.id)
    checkDenied('performances.show_id (cross-artist)', error, MSG_PERF_SHOW)
    checkUnchanged('performances.show_id (cross-artist)', before, await readPerf(perfA.id))

    const before2 = await readPerf(perfA.id)
    const { error: e2 } = await manager.client.from('performances').update({ setlist_id: setlistC.id }).eq('id', perfA.id)
    checkDenied('performances.setlist_id (cross-artist)', e2, MSG_PERF_SETLIST)
    checkUnchanged('performances.setlist_id (cross-artist)', before2, await readPerf(perfA.id))

    const beforeS = await readSetlist(setlistA1.id)
    const { error: e3 } = await manager.client.from('setlists').update({ artist_id: artistC.id }).eq('id', setlistA1.id)
    checkDenied('setlists.artist_id (cross-artist)', e3, MSG_SETLIST_ARTIST)
    checkUnchanged('setlists.artist_id (cross-artist)', beforeS, await readSetlist(setlistA1.id))
  }

  console.log('\n2. Same-artist reassignment also blocked')
  {
    const before = await readPerf(perfA.id)
    const { error } = await manager.client.from('performances').update({ show_id: showA2.id }).eq('id', perfA.id)
    checkDenied('performances.show_id (same-artist)', error, MSG_PERF_SHOW)
    checkUnchanged('performances.show_id (same-artist)', before, await readPerf(perfA.id))

    const before2 = await readPerf(perfA.id)
    const { error: e2 } = await manager.client.from('performances').update({ setlist_id: setlistA2.id }).eq('id', perfA.id)
    checkDenied('performances.setlist_id (same-artist)', e2, MSG_PERF_SETLIST)
    checkUnchanged('performances.setlist_id (same-artist)', before2, await readPerf(perfA.id))

    const setlistIso = unwrap<{ id: string }>(await service.from('setlists').insert({ show_id: showA2.id, artist_id: artistC.id }).select().single(), 'setlistIso')
    createdSetlistIds.push(setlistIso.id)
    const beforeS = await readSetlist(setlistIso.id)
    const { error: e3 } = await manager.client.from('setlists').update({ show_id: showC.id }).eq('id', setlistIso.id)
    checkDenied('setlists.show_id', e3, MSG_SETLIST_SHOW)
    checkUnchanged('setlists.show_id', beforeS, await readSetlist(setlistIso.id))
  }

  console.log('\n3. service_role cannot reassign (no bypass)')
  {
    const before = await readPerf(perfA.id)
    const { error } = await service.from('performances').update({ show_id: showC.id }).eq('id', perfA.id)
    checkDenied('performances.show_id (service_role)', error, MSG_PERF_SHOW)
    checkUnchanged('performances.show_id (service_role)', before, await readPerf(perfA.id))

    const beforeS = await readSetlist(setlistA1.id)
    const { error: e2 } = await service.from('setlists').update({ artist_id: artistC.id }).eq('id', setlistA1.id)
    checkDenied('setlists.artist_id (service_role)', e2, MSG_SETLIST_ARTIST)
    checkUnchanged('setlists.artist_id (service_role)', beforeS, await readSetlist(setlistA1.id))
  }

  console.log('\n4. Bundled reassignment + other field leaves the ENTIRE row unchanged')
  {
    const before = await readPerf(perfA.id)
    const { error } = await manager.client.from('performances').update({ show_id: showC.id, venue_name: 'Should Not Apply' }).eq('id', perfA.id)
    checkDenied('performances (bundled)', error, MSG_PERF_SHOW)
    checkUnchanged('performances (bundled)', before, await readPerf(perfA.id))
  }

  console.log('\n5. Direct NULL write while the referenced parent still exists is rejected (owner/delegate AND service_role)')
  {
    const before = await readPerf(perfA.id)
    const { error } = await manager.client.from('performances').update({ show_id: null }).eq('id', perfA.id)
    checkDenied('performances.show_id -> NULL (manager, parent exists)', error, MSG_PERF_SHOW)
    checkUnchanged('performances.show_id -> NULL (manager, parent exists)', before, await readPerf(perfA.id))

    const before2 = await readPerf(perfA.id)
    const { error: e2 } = await manager.client.from('performances').update({ setlist_id: null }).eq('id', perfA.id)
    checkDenied('performances.setlist_id -> NULL (manager, parent exists)', e2, MSG_PERF_SETLIST)
    checkUnchanged('performances.setlist_id -> NULL (manager, parent exists)', before2, await readPerf(perfA.id))

    const before3 = await readPerf(perfA.id)
    const { error: e3 } = await service.from('performances').update({ show_id: null }).eq('id', perfA.id)
    checkDenied('performances.show_id -> NULL (service_role, parent exists)', e3, MSG_PERF_SHOW)
    checkUnchanged('performances.show_id -> NULL (service_role, parent exists)', before3, await readPerf(perfA.id))

    const before4 = await readPerf(perfA.id)
    const { error: e4 } = await service.from('performances').update({ setlist_id: null }).eq('id', perfA.id)
    checkDenied('performances.setlist_id -> NULL (service_role, parent exists)', e4, MSG_PERF_SETLIST)
    checkUnchanged('performances.setlist_id -> NULL (service_role, parent exists)', before4, await readPerf(perfA.id))
  }

  console.log('\n6. Ordinary edits (links untouched) still work, verified by readback')
  {
    const { data, error } = await manager.client.from('performances').update({ venue_name: 'Edited Venue' }).eq('id', perfA.id).select()
    check('performances: ordinary edit succeeds', !error && (data?.length ?? 0) === 1, JSON.stringify(error))
    const after = await readPerf(perfA.id)
    check('performances: edit persisted, links unchanged (readback)', after?.venue_name === 'Edited Venue' && after?.show_id === showA1.id && after?.setlist_id === setlistA1.id, JSON.stringify(after))
  }

  console.log('\n7. No-op link value (re-sent unchanged) + another field change still works')
  {
    const { data, error } = await manager.client.from('performances')
      .update({ show_id: showA1.id, setlist_id: setlistA1.id, venue_name: 'Re-sent Same Links' }).eq('id', perfA.id).select()
    check('performances: no-op link update succeeds', !error && (data?.length ?? 0) === 1, JSON.stringify(error))
    const after = await readPerf(perfA.id)
    check('performances: no-op update persisted correctly (readback), BOTH links unchanged', after?.venue_name === 'Re-sent Same Links' && after?.show_id === showA1.id && after?.setlist_id === setlistA1.id, JSON.stringify(after))
  }

  console.log('\n8. Legitimate inserts (new rows with fresh links) still work')
  {
    const newPerf = unwrap<{ id: string }>(await manager.client.from('performances').insert({ user_id: ownerA.userId, venue_name: 'New', show_id: showA2.id, setlist_id: setlistA2.id }).select().single(), 'new performance insert')
    createdPerformanceIds.push(newPerf.id)
    check('performances: insert with show_id/setlist_id succeeds', !!newPerf)

    const newSetlist = unwrap<{ id: string }>(await manager.client.from('setlists').insert({ show_id: showC.id, artist_id: artistA.id }).select().single(), 'new setlist insert (cross-artist INSERT — out of this patch\'s scope)')
    createdSetlistIds.push(newSetlist.id)
    check('setlists: cross-artist insert succeeds (INSERT-time validation is explicitly still open)', !!newSetlist)
  }

  console.log('\n9. Referenced-parent deletion, case A: delete shows row referenced by performances.show_id')
  {
    const showX = unwrap<{ id: string }>(await service.from('shows').insert({ created_by: ownerA.userId }).select().single(), 'showX')
    createdShowIds.push(showX.id)
    const perfX = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: 'X', show_id: showX.id }).select().single(), 'perfX')
    createdPerformanceIds.push(perfX.id)
    const before = await readPerf(perfX.id)

    const { data: deleted, error: delErr } = await service.from('shows').delete().eq('id', showX.id).select()
    check('shows: referenced delete succeeds with no error', !delErr, JSON.stringify(delErr))
    check('shows: exactly one row deleted', (deleted?.length ?? 0) === 1, JSON.stringify(deleted))

    const { data: showGone, error: showReadErr } = await service.from('shows').select('id').eq('id', showX.id).maybeSingle()
    check('shows: readback succeeds with no error', !showReadErr, JSON.stringify(showReadErr))
    check('shows: parent confirmed absent', !showGone, JSON.stringify(showGone))

    const after = await readPerf(perfX.id)
    checkUnchangedExceptLinks('performances (case A)', before, after, ['show_id'])
  }

  console.log('\n10. Referenced-parent deletion, case B: delete setlists row referenced by performances.setlist_id')
  {
    const showY = unwrap<{ id: string }>(await service.from('shows').insert({ created_by: ownerA.userId }).select().single(), 'showY')
    createdShowIds.push(showY.id)
    const setlistY = unwrap<{ id: string }>(await service.from('setlists').insert({ show_id: showY.id, artist_id: artistA.id }).select().single(), 'setlistY')
    createdSetlistIds.push(setlistY.id)
    const perfY = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: 'Y', setlist_id: setlistY.id }).select().single(), 'perfY')
    createdPerformanceIds.push(perfY.id)
    const before = await readPerf(perfY.id)

    const { data: deleted, error: delErr } = await service.from('setlists').delete().eq('id', setlistY.id).select()
    check('setlists: referenced delete succeeds with no error', !delErr, JSON.stringify(delErr))
    check('setlists: exactly one row deleted', (deleted?.length ?? 0) === 1, JSON.stringify(deleted))

    const { data: setlistGone, error: setlistReadErr } = await service.from('setlists').select('id').eq('id', setlistY.id).maybeSingle()
    check('setlists: readback succeeds with no error', !setlistReadErr, JSON.stringify(setlistReadErr))
    check('setlists: parent confirmed absent', !setlistGone, JSON.stringify(setlistGone))

    const after = await readPerf(perfY.id)
    checkUnchangedExceptLinks('performances (case B)', before, after, ['setlist_id'])
  }

  console.log('\n11. Referenced-parent deletion, case C: delete shows row referenced by setlists.show_id (CASCADE)')
  {
    const showZ = unwrap<{ id: string }>(await service.from('shows').insert({ created_by: ownerA.userId }).select().single(), 'showZ')
    createdShowIds.push(showZ.id)
    const setlistZ = unwrap<{ id: string }>(await service.from('setlists').insert({ show_id: showZ.id, artist_id: artistA.id }).select().single(), 'setlistZ')
    createdSetlistIds.push(setlistZ.id)

    const { data: deleted, error: delErr } = await service.from('shows').delete().eq('id', showZ.id).select()
    check('shows: delete (cascading to setlists) succeeds with no error', !delErr, JSON.stringify(delErr))
    check('shows: exactly one row deleted', (deleted?.length ?? 0) === 1, JSON.stringify(deleted))

    const { data: setlistGone, error: readErr } = await service.from('setlists').select('id').eq('id', setlistZ.id).maybeSingle()
    check('setlists: readback succeeds with no error', !readErr, JSON.stringify(readErr))
    check('setlists: CASCADE-deleted along with its show', !setlistGone, JSON.stringify(setlistGone))
  }

  console.log('\n12. Referenced-parent deletion, case D: delete artists row referenced by setlists.artist_id (CASCADE)')
  {
    const showW = unwrap<{ id: string }>(await service.from('shows').insert({ created_by: ownerA.userId }).select().single(), 'showW')
    createdShowIds.push(showW.id)
    const artistTemp = unwrap<{ id: string }>(await service.from('artists').insert({ user_id: ownerA.userId }).select().single(), 'artistTemp')
    createdArtistIds.push(artistTemp.id)
    const setlistW = unwrap<{ id: string }>(await service.from('setlists').insert({ show_id: showW.id, artist_id: artistTemp.id }).select().single(), 'setlistW')
    createdSetlistIds.push(setlistW.id)

    const { data: deleted, error: delErr } = await service.from('artists').delete().eq('id', artistTemp.id).select()
    check('artists: delete (cascading to setlists) succeeds with no error', !delErr, JSON.stringify(delErr))
    check('artists: exactly one row deleted', (deleted?.length ?? 0) === 1, JSON.stringify(deleted))

    const { data: setlistGone, error: readErr } = await service.from('setlists').select('id').eq('id', setlistW.id).maybeSingle()
    check('setlists: readback succeeds with no error', !readErr, JSON.stringify(readErr))
    check('setlists: CASCADE-deleted along with its artist', !setlistGone, JSON.stringify(setlistGone))
  }

  console.log('\n13. Combined: deleting a show both directly clears performances.show_id AND cascades through setlists to clear performances.setlist_id')
  {
    const showV = unwrap<{ id: string }>(await service.from('shows').insert({ created_by: ownerA.userId }).select().single(), 'showV')
    createdShowIds.push(showV.id)
    const setlistV = unwrap<{ id: string }>(await service.from('setlists').insert({ show_id: showV.id, artist_id: artistA.id }).select().single(), 'setlistV')
    createdSetlistIds.push(setlistV.id)
    const perfV = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: 'V', show_id: showV.id, setlist_id: setlistV.id }).select().single(), 'perfV')
    createdPerformanceIds.push(perfV.id)
    const before = await readPerf(perfV.id)
    check('fixture sanity: perfV starts with both links set', before?.show_id === showV.id && before?.setlist_id === setlistV.id)

    const { data: deleted, error: delErr } = await service.from('shows').delete().eq('id', showV.id).select()
    check('shows: single delete triggering both effects succeeds with no error', !delErr, JSON.stringify(delErr))
    check('shows: exactly one row deleted', (deleted?.length ?? 0) === 1, JSON.stringify(deleted))

    const { data: setlistGone, error: setlistReadErr } = await service.from('setlists').select('id').eq('id', setlistV.id).maybeSingle()
    check('setlists: readback succeeds with no error', !setlistReadErr, JSON.stringify(setlistReadErr))
    check('setlists: CASCADE-deleted as part of the same show deletion', !setlistGone, JSON.stringify(setlistGone))

    const after = await readPerf(perfV.id)
    checkUnchangedExceptLinks('performances (combined)', before, after, ['show_id', 'setlist_id'])
  }

  console.log('\n14. NULL -> non-NULL remains rejected for BOTH show_id and setlist_id (already-orphaned rows cannot be reassigned)')
  {
    const showU = unwrap<{ id: string }>(await service.from('shows').insert({ created_by: ownerA.userId }).select().single(), 'showU')
    createdShowIds.push(showU.id)
    const perfU = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: 'U', show_id: showU.id }).select().single(), 'perfU')
    createdPerformanceIds.push(perfU.id)
    const { data: deletedU, error: delErrU } = await service.from('shows').delete().eq('id', showU.id).select()
    check('fixture setup: show delete (orphaning show_id) succeeds with no error', !delErrU, JSON.stringify(delErrU))
    check('fixture setup: exactly one row deleted', (deletedU?.length ?? 0) === 1, JSON.stringify(deletedU))
    const before = await readPerf(perfU.id)
    check('fixture sanity: perfU is now orphaned (show_id NULL)', before?.show_id === null)

    const { error } = await manager.client.from('performances').update({ show_id: showA1.id }).eq('id', perfU.id)
    checkDenied('performances.show_id NULL -> non-NULL', error, MSG_PERF_SHOW)
    checkUnchanged('performances.show_id NULL -> non-NULL', before, await readPerf(perfU.id))

    const showT = unwrap<{ id: string }>(await service.from('shows').insert({ created_by: ownerA.userId }).select().single(), 'showT')
    createdShowIds.push(showT.id)
    const setlistT = unwrap<{ id: string }>(await service.from('setlists').insert({ show_id: showT.id, artist_id: artistA.id }).select().single(), 'setlistT')
    createdSetlistIds.push(setlistT.id)
    const perfT = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: 'T', setlist_id: setlistT.id }).select().single(), 'perfT')
    createdPerformanceIds.push(perfT.id)
    const { data: deletedT, error: delErrT } = await service.from('setlists').delete().eq('id', setlistT.id).select()
    check('fixture setup: setlist delete (orphaning setlist_id) succeeds with no error', !delErrT, JSON.stringify(delErrT))
    check('fixture setup: exactly one row deleted', (deletedT?.length ?? 0) === 1, JSON.stringify(deletedT))
    const beforeT = await readPerf(perfT.id)
    check('fixture sanity: perfT is now orphaned (setlist_id NULL)', beforeT?.setlist_id === null)

    const { error: errT } = await manager.client.from('performances').update({ setlist_id: setlistA1.id }).eq('id', perfT.id)
    checkDenied('performances.setlist_id NULL -> non-NULL', errT, MSG_PERF_SETLIST)
    checkUnchanged('performances.setlist_id NULL -> non-NULL', beforeT, await readPerf(perfT.id))
  }

  console.log('\n15. Visibility regression: a caller authorized to edit the performance but with NO visibility into its referenced show must not be able to clear that link — invisible must not be mistaken for nonexistent')
  {
    // ownerZ has no delegation relationship with ownerA or manager at all,
    // so ownerA's own RLS-scoped SELECT on `shows` would never include
    // showZ2 — ownerA cannot see it exists. The performances row itself
    // is only reachable this way via a direct service-role insert (an
    // INSERT-time mismatch — explicitly out of this patch's scope, see
    // test 8) purely to construct the precondition: ownerA IS authorized
    // to UPDATE this specific performances row (performances_own only
    // checks user_id), while being unable to see the shows row it points
    // to. If the trigger's existence check used the CALLER's visibility
    // instead of a fixed SECURITY DEFINER view of the table, it would
    // wrongly conclude "not visible" means "does not exist" and allow the
    // NULL write through.
    const ownerZ = await createPersona('ownerZ')
    const showZ2 = unwrap<{ id: string }>(await service.from('shows').insert({ created_by: ownerZ.userId }).select().single(), 'showZ2')
    createdShowIds.push(showZ2.id)
    const perfMismatch = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: 'Mismatch', show_id: showZ2.id }).select().single(), 'perfMismatch')
    createdPerformanceIds.push(perfMismatch.id)

    const { data: visibleToOwnerA } = await ownerA.client.from('shows').select('id').eq('id', showZ2.id).maybeSingle()
    check('fixture sanity: ownerA genuinely cannot see showZ2 via their own RLS-scoped access', !visibleToOwnerA)

    const before = await readPerf(perfMismatch.id)
    const { error } = await ownerA.client.from('performances').update({ show_id: null }).eq('id', perfMismatch.id)
    checkDenied('performances.show_id -> NULL (caller authorized to edit, but cannot see the referenced show)', error, MSG_PERF_SHOW)
    checkUnchanged('performances.show_id -> NULL (invisible parent still exists)', before, await readPerf(perfMismatch.id))
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
