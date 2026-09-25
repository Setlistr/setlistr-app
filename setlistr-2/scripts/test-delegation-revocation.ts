// Real Postgres/PostgREST-level AND real-HTTP-level tests for delegation
// revocation enforcement (0015_delegation_revocation_enforcement.sql, plus
// app/api/upload-performance/route.ts's isAuthorizedFor()).
//
// Covers both enforcement points independently:
//   - can_act_for() (direct DB reads/writes through RLS, via a real
//     authenticated PostgREST session)
//   - isAuthorizedFor() (the actual running /api/upload-performance
//     POST and PATCH routes, via real HTTP requests with real
//     @supabase/ssr cookie sessions — not a direct call to the function)
//
// HARD LOCALHOST GUARD: refuses to run unless both the Supabase URL and
// the app URL under test resolve to 127.0.0.1/localhost. No override.
//
// Requires a local `supabase start` stack (already running, shared with
// other worktrees in this session) and `npm run dev` already running
// against this worktree's .env.local. No external recognition, email,
// or production webhook is touched by anything below.
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-delegation-revocation.ts

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import * as crypto from 'crypto'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const APP_URL = process.env.TEST_APP_URL || 'http://127.0.0.1:3000'

function isLocalhost(url: string) {
  try {
    const h = new URL(url).hostname
    return h === '127.0.0.1' || h === 'localhost'
  } catch {
    return false
  }
}
if (!isLocalhost(SUPABASE_URL) || !isLocalhost(APP_URL)) {
  console.error('REFUSING TO RUN: this harness only targets localhost.')
  console.error(`  NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL || '(unset)'}`)
  console.error(`  APP_URL=${APP_URL}`)
  process.exit(1)
}
if (!ANON_KEY || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const service: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY)

const RUN = Date.now().toString(36)
const createdUserIds: string[] = []
const createdShowIds: string[] = []
const createdPerformanceIds: string[] = []
const createdDelegationIds: string[] = []

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}
function unwrap<T>(res: { data: T | null; error: { message: string } | null }, label: string): T {
  if (res.error || !res.data) throw new Error(`${label} failed: ${res.error?.message || 'no data returned'}`)
  return res.data
}

const RLS_SQLSTATE = '42501'
const MSG_PERF_RLS = 'new row violates row-level security policy for table "performances"'

function rowsEqual(a: Record<string, unknown> | null, b: Record<string, unknown> | null): boolean {
  if (a === null || b === null) return a === b
  const aKeys = Object.keys(a).sort()
  const bKeys = Object.keys(b).sort()
  if (aKeys.length !== bKeys.length || aKeys.some((k, i) => k !== bKeys[i])) return false
  return aKeys.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]))
}
// rowsEqual(null, null) === true is correct in isolation (both absent is
// "equal"), but that must never be read as "preserved data" — a denied
// write whose before/after readback both come back null proves nothing.
// This wrapper asserts both records actually exist BEFORE trusting the
// equality check.
function checkUnchanged(label: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  check(`${label}: before/after rows both exist`, before !== null && after !== null, `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
  check(`${label}: complete row match`, rowsEqual(before, after), `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
}
// Throws on a query error rather than silently treating "the query
// failed" the same as "the query succeeded and found nothing."
async function countRows(table: string, column: string, value: string): Promise<number> {
  const { data, error } = await service.from(table).select('id').eq(column, value)
  if (error) throw new Error(`countRows(${table}.${column}=${value}) failed: ${error.message}`)
  return data?.length ?? 0
}

interface Persona {
  label: string
  userId: string
  email: string
  client: SupabaseClient // anon-key, signed-in — for direct DB/RLS checks
  cookieHeader: () => string // for real HTTP requests against the dev server
}

async function createPersona(label: string): Promise<Persona> {
  const email = `revoke-${RUN}-${label}@example.test`.toLowerCase()
  const password = crypto.randomBytes(18).toString('base64url')
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser failed for ${label}: ${error?.message}`)
  const userId = data.user.id
  createdUserIds.push(userId)
  unwrap<{ id: string }>(await service.from('profiles').insert({ id: userId, full_name: label, email }).select().single(), `profile for ${label}`)

  // Plain anon client for direct-DB checks.
  const client = createClient(SUPABASE_URL, ANON_KEY)
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password })
  if (signInErr) throw new Error(`sign-in failed for ${label}: ${signInErr.message}`)

  // Cookie-jar-backed browser client, matching the real app's auth
  // contract, for HTTP requests against the actual running routes.
  const jar = new Map<string, string>()
  const browserClient = createBrowserClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => Array.from(jar.entries()).map(([name, value]) => ({ name, value })),
      setAll: (cookiesToSet: { name: string; value: string }[]) => {
        for (const { name, value } of cookiesToSet) jar.set(name, value)
      },
    },
  })
  const { error: cookieSignInErr } = await browserClient.auth.signInWithPassword({ email, password })
  if (cookieSignInErr) throw new Error(`cookie sign-in failed for ${label}: ${cookieSignInErr.message}`)

  return {
    label, userId, email, client,
    cookieHeader: () => Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; '),
  }
}

async function seedDelegation(opts: { artistId: string; delegateId: string; accepted: boolean; revoked?: boolean }) {
  const row = unwrap<{ id: string }>(await service.from('artist_delegates').insert({
    artist_id: opts.artistId,
    delegate_id: opts.delegateId,
    role: 'manager',
    accepted_at: opts.accepted ? new Date().toISOString() : null,
    revoked_at: opts.revoked ? new Date().toISOString() : null,
  }).select().single(), 'seedDelegation')
  createdDelegationIds.push(row.id)
  return row.id
}

async function revoke(delegationId: string) {
  const { data, error } = await service.from('artist_delegates').update({ revoked_at: new Date().toISOString() }).eq('id', delegationId).select('id, revoked_at')
  if (error) throw new Error(`revoke(${delegationId}) failed: ${error.message}`)
  if (!data || data.length !== 1) throw new Error(`revoke(${delegationId}) expected exactly 1 updated row, got ${data?.length ?? 0}`)
  if (!data[0].revoked_at) throw new Error(`revoke(${delegationId}) did not persist a non-null revoked_at`)
}

async function readPerf(id: string) {
  const { data, error } = await service.from('performances').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`readPerf failed: ${error.message}`)
  return data
}
async function readShow(id: string) {
  const { data, error } = await service.from('shows').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`readShow failed: ${error.message}`)
  return data
}
async function readSongs(performanceId: string) {
  const { data, error } = await service.from('performance_songs').select('*').eq('performance_id', performanceId).order('position')
  if (error) throw new Error(`readSongs failed: ${error.message}`)
  return data ?? []
}

async function callUploadPost(caller: Persona, targetUserId: string) {
  const res = await fetch(`${APP_URL}/api/upload-performance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(caller.cookieHeader() ? { Cookie: caller.cookieHeader() } : {}) },
    body: JSON.stringify({ targetUserId }),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}
async function callUploadPatch(caller: Persona, performanceId: string, venueName: string) {
  const res = await fetch(`${APP_URL}/api/upload-performance`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(caller.cookieHeader() ? { Cookie: caller.cookieHeader() } : {}) },
    body: JSON.stringify({ performance_id: performanceId, venue_name: venueName, performance_date: new Date().toISOString() }),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

async function cleanup() {
  const errors: string[] = []
  if (createdPerformanceIds.length > 0) {
    // performance_songs cascades on performance delete — no separate cleanup needed.
    const { error } = await service.from('performances').delete().in('id', createdPerformanceIds)
    if (error) errors.push(`delete performances: ${error.message}`)
  }
  if (createdShowIds.length > 0) {
    const { error } = await service.from('shows').delete().in('id', createdShowIds)
    if (error) errors.push(`delete shows: ${error.message}`)
  }
  if (createdDelegationIds.length > 0) {
    const { error } = await service.from('artist_delegates').delete().in('id', createdDelegationIds)
    if (error) errors.push(`delete artist_delegates: ${error.message}`)
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
  console.log(`Run ${RUN} — DB ${SUPABASE_URL}, app ${APP_URL}\n`)

  const ownerA = await createPersona('ownerA')
  const activeDelegate = await createPersona('activeDelegate')
  const pendingDelegate = await createPersona('pendingDelegate')
  const revokedDelegate = await createPersona('revokedDelegate')
  const toBeRevoked = await createPersona('toBeRevoked') // starts active, revoked mid-test

  await seedDelegation({ artistId: ownerA.userId, delegateId: activeDelegate.userId, accepted: true })
  await seedDelegation({ artistId: ownerA.userId, delegateId: pendingDelegate.userId, accepted: false })
  await seedDelegation({ artistId: ownerA.userId, delegateId: revokedDelegate.userId, accepted: true, revoked: true })
  const toBeRevokedDelegationId = await seedDelegation({ artistId: ownerA.userId, delegateId: toBeRevoked.userId, accepted: true })

  const showA = unwrap<{ id: string }>(await service.from('shows').insert({ created_by: ownerA.userId }).select().single(), 'showA')
  createdShowIds.push(showA.id)

  console.log('\n1. can_act_for(): owner retains direct-DB access (baseline, unaffected by this migration)')
  let ownerPerfId = ''
  {
    const { data, error } = await ownerA.client.from('performances').insert({ user_id: ownerA.userId, venue_name: `Owner ${RUN}`, show_id: showA.id }).select().single()
    check('owner: direct insert succeeds', !error && !!data, JSON.stringify(error))
    if (data) { createdPerformanceIds.push((data as any).id); ownerPerfId = (data as any).id }
  }

  console.log('\n2. can_act_for(): active accepted delegate retains direct-DB access')
  {
    const { data, error } = await activeDelegate.client.from('performances').insert({ user_id: ownerA.userId, venue_name: `Active Delegate ${RUN}`, show_id: showA.id }).select().single()
    check('active delegate: direct insert succeeds', !error && !!data, JSON.stringify(error))
    if (data) createdPerformanceIds.push((data as any).id)
  }

  console.log('\n3. can_act_for(): pending (unaccepted) delegate direct INSERT denied — SQLSTATE/message asserted, stored state unchanged')
  {
    const venue = `Pending Delegate ${RUN}`
    const { data, error } = await pendingDelegate.client.from('performances').insert({ user_id: ownerA.userId, venue_name: venue, show_id: showA.id }).select().single()
    check('pending delegate: direct insert denied', !data, JSON.stringify({ data, error }))
    check('pending delegate: SQLSTATE 42501 (RLS policy violation)', (error as any)?.code === RLS_SQLSTATE, JSON.stringify(error))
    check('pending delegate: exact RLS rejection message', (error as any)?.message === MSG_PERF_RLS, JSON.stringify(error))
    check('pending delegate: denied INSERT left no stored row', (await countRows('performances', 'venue_name', venue)) === 0)
  }

  console.log('\n4. can_act_for(): revoked delegate direct INSERT denied — SQLSTATE/message asserted, stored state unchanged')
  {
    const venue = `Revoked Delegate ${RUN}`
    const { data, error } = await revokedDelegate.client.from('performances').insert({ user_id: ownerA.userId, venue_name: venue, show_id: showA.id }).select().single()
    check('revoked delegate: direct insert denied', !data, JSON.stringify({ data, error }))
    check('revoked delegate: SQLSTATE 42501 (RLS policy violation)', (error as any)?.code === RLS_SQLSTATE, JSON.stringify(error))
    check('revoked delegate: exact RLS rejection message', (error as any)?.message === MSG_PERF_RLS, JSON.stringify(error))
    check('revoked delegate: denied INSERT left no stored row', (await countRows('performances', 'venue_name', venue)) === 0)
  }

  console.log("\n5. can_act_for(): pending/revoked delegate direct SELECT returns NO private rows (not an error — RLS silently filters)")
  {
    const { data: pendingView, error: pendingErr } = await pendingDelegate.client.from('performances').select('id').eq('id', ownerPerfId)
    check('pending delegate: SELECT succeeds with no error (RLS filters, does not error)', !pendingErr, JSON.stringify(pendingErr))
    check('pending delegate: SELECT returns zero rows for ownerA\'s private performance', (pendingView?.length ?? -1) === 0, JSON.stringify(pendingView))

    const { data: revokedView, error: revokedErr } = await revokedDelegate.client.from('performances').select('id').eq('id', ownerPerfId)
    check('revoked delegate: SELECT succeeds with no error (RLS filters, does not error)', !revokedErr, JSON.stringify(revokedErr))
    check('revoked delegate: SELECT returns zero rows for ownerA\'s private performance', (revokedView?.length ?? -1) === 0, JSON.stringify(revokedView))
  }

  console.log('\n6. can_act_for(): pending/revoked delegate direct UPDATE denied — zero affected rows, stored state unchanged')
  {
    const before = await readPerf(ownerPerfId)

    const { data: pendingUpd, error: pendingErr } = await pendingDelegate.client.from('performances').update({ venue_name: `Hacked By Pending ${RUN}` }).eq('id', ownerPerfId).select()
    check('pending delegate: UPDATE affects zero rows', (pendingUpd?.length ?? -1) === 0, JSON.stringify({ pendingUpd, pendingErr }))
    checkUnchanged('pending delegate: UPDATE left stored row', before, await readPerf(ownerPerfId))

    const { data: revokedUpd, error: revokedErr } = await revokedDelegate.client.from('performances').update({ venue_name: `Hacked By Revoked ${RUN}` }).eq('id', ownerPerfId).select()
    check('revoked delegate: UPDATE affects zero rows', (revokedUpd?.length ?? -1) === 0, JSON.stringify({ revokedUpd, revokedErr }))
    checkUnchanged('revoked delegate: UPDATE left stored row', before, await readPerf(ownerPerfId))
  }

  console.log('\n7. can_act_for(): pending/revoked delegate direct DELETE denied — zero affected rows, row still present unchanged')
  {
    const before = await readPerf(ownerPerfId)

    const { data: pendingDel, error: pendingErr } = await pendingDelegate.client.from('performances').delete().eq('id', ownerPerfId).select()
    check('pending delegate: DELETE affects zero rows', (pendingDel?.length ?? -1) === 0, JSON.stringify({ pendingDel, pendingErr }))
    checkUnchanged('pending delegate: DELETE left row present', before, await readPerf(ownerPerfId))

    const { data: revokedDel, error: revokedErr } = await revokedDelegate.client.from('performances').delete().eq('id', ownerPerfId).select()
    check('revoked delegate: DELETE affects zero rows', (revokedDel?.length ?? -1) === 0, JSON.stringify({ revokedDel, revokedErr }))
    checkUnchanged('revoked delegate: DELETE left row present', before, await readPerf(ownerPerfId))
  }

  console.log('\n8. can_act_for(): an already-signed-in delegate loses direct-DB access on the NEXT request after revocation (same session; not an in-flight cancellation claim)')
  {
    const before = await toBeRevoked.client.from('performances').insert({ user_id: ownerA.userId, venue_name: `Before Revoke ${RUN}`, show_id: showA.id }).select().single()
    check('toBeRevoked: access works before revocation (fixture sanity)', !before.error && !!before.data, JSON.stringify(before.error))
    if (before.data) createdPerformanceIds.push((before.data as any).id)

    await revoke(toBeRevokedDelegationId)

    const venue = `After Revoke Same Session ${RUN}`
    const { data, error } = await toBeRevoked.client.from('performances').insert({ user_id: ownerA.userId, venue_name: venue, show_id: showA.id }).select().single()
    check('toBeRevoked: SAME already-signed-in session denied on its next request after revocation', !data, JSON.stringify({ data, error }))
    check('toBeRevoked: post-revocation denied write left no stored row', (await countRows('performances', 'venue_name', venue)) === 0)
  }

  console.log('\n9. HTTP: POST /api/upload-performance — owner succeeds')
  {
    const { status, json } = await callUploadPost(ownerA, ownerA.userId)
    check('owner: POST succeeds (200)', status === 200 && !!json.performance_id, JSON.stringify({ status, json }))
    if (json.performance_id) createdPerformanceIds.push(json.performance_id)
    if (json.show_id) createdShowIds.push(json.show_id)
  }

  console.log('\n10. HTTP: POST /api/upload-performance — active accepted delegate succeeds')
  {
    const { status, json } = await callUploadPost(activeDelegate, ownerA.userId)
    check('active delegate: POST succeeds (200)', status === 200 && !!json.performance_id, JSON.stringify({ status, json }))
    if (json.performance_id) createdPerformanceIds.push(json.performance_id)
    if (json.show_id) createdShowIds.push(json.show_id)
  }

  console.log('\n11. HTTP: POST /api/upload-performance — pending delegate denied (403), leaves NO shows or performances behind')
  {
    const beforePerf = await service.from('performances').select('id', { count: 'exact', head: true }).eq('user_id', ownerA.userId)
    const beforeShows = await service.from('shows').select('id', { count: 'exact', head: true }).eq('created_by', ownerA.userId)
    check('pending delegate: before-count queries succeeded with no error', !beforePerf.error && !beforeShows.error, JSON.stringify({ perfErr: beforePerf.error, showsErr: beforeShows.error }))
    const { status, json } = await callUploadPost(pendingDelegate, ownerA.userId)
    check('pending delegate: POST denied (403)', status === 403, JSON.stringify({ status, json }))
    const afterPerf = await service.from('performances').select('id', { count: 'exact', head: true }).eq('user_id', ownerA.userId)
    const afterShows = await service.from('shows').select('id', { count: 'exact', head: true }).eq('created_by', ownerA.userId)
    check('pending delegate: after-count queries succeeded with no error', !afterPerf.error && !afterShows.error, JSON.stringify({ perfErr: afterPerf.error, showsErr: afterShows.error }))
    check('pending delegate: POST denial created no new performances row', (afterPerf.count ?? -1) === (beforePerf.count ?? -2), JSON.stringify({ before: beforePerf.count, after: afterPerf.count }))
    check('pending delegate: POST denial created no new shows row', (afterShows.count ?? -1) === (beforeShows.count ?? -2), JSON.stringify({ before: beforeShows.count, after: afterShows.count }))
  }

  console.log('\n12. HTTP: POST /api/upload-performance — revoked delegate denied (403), leaves NO shows or performances behind')
  {
    const beforePerf = await service.from('performances').select('id', { count: 'exact', head: true }).eq('user_id', ownerA.userId)
    const beforeShows = await service.from('shows').select('id', { count: 'exact', head: true }).eq('created_by', ownerA.userId)
    check('revoked delegate: before-count queries succeeded with no error', !beforePerf.error && !beforeShows.error, JSON.stringify({ perfErr: beforePerf.error, showsErr: beforeShows.error }))
    const { status, json } = await callUploadPost(revokedDelegate, ownerA.userId)
    check('revoked delegate: POST denied (403)', status === 403, JSON.stringify({ status, json }))
    const afterPerf = await service.from('performances').select('id', { count: 'exact', head: true }).eq('user_id', ownerA.userId)
    const afterShows = await service.from('shows').select('id', { count: 'exact', head: true }).eq('created_by', ownerA.userId)
    check('revoked delegate: after-count queries succeeded with no error', !afterPerf.error && !afterShows.error, JSON.stringify({ perfErr: afterPerf.error, showsErr: afterShows.error }))
    check('revoked delegate: POST denial created no new performances row', (afterPerf.count ?? -1) === (beforePerf.count ?? -2), JSON.stringify({ before: beforePerf.count, after: afterPerf.count }))
    check('revoked delegate: POST denial created no new shows row', (afterShows.count ?? -1) === (beforeShows.count ?? -2), JSON.stringify({ before: beforeShows.count, after: afterShows.count }))
  }

  console.log('\n13. HTTP: PATCH /api/upload-performance — active delegate can finalize an owner-created draft')
  {
    const created = await callUploadPost(ownerA, ownerA.userId)
    check('fixture: owner draft created for PATCH test', created.status === 200 && !!created.json.performance_id, JSON.stringify(created))
    if (created.json.performance_id) createdPerformanceIds.push(created.json.performance_id)
    if (created.json.show_id) createdShowIds.push(created.json.show_id)

    const venue = `Patched By Active Delegate ${RUN}`
    const { status, json } = await callUploadPatch(activeDelegate, created.json.performance_id, venue)
    check('active delegate: PATCH succeeds (200)', status === 200, JSON.stringify({ status, json }))
    const after = await readPerf(created.json.performance_id)
    check('active delegate: PATCH persisted the new venue_name', after?.venue_name === venue, JSON.stringify(after))
  }

  console.log('\n14. HTTP: PATCH /api/upload-performance — revoked delegate denied (403); performance, associated show, and song rows all unchanged')
  {
    const created = await callUploadPost(ownerA, ownerA.userId)
    check('fixture: owner draft created for revoked-PATCH test', created.status === 200 && !!created.json.performance_id, JSON.stringify(created))
    const perfId = created.json.performance_id
    const showId = created.json.show_id
    if (perfId) createdPerformanceIds.push(perfId)
    if (showId) createdShowIds.push(showId)
    unwrap<{ id: string }>(await service.from('performance_songs').insert({ performance_id: perfId, title: 'Pre-Existing Song', position: 1 }).select().single(), 'pre-existing song fixture')

    const beforePerf = await readPerf(perfId)
    const beforeShow = await readShow(showId)
    const beforeSongs = await readSongs(perfId)

    const { status, json } = await callUploadPatch(revokedDelegate, perfId, `Should Not Apply ${RUN}`)
    check('revoked delegate: PATCH denied (403)', status === 403, JSON.stringify({ status, json }))

    const afterPerf = await readPerf(perfId)
    const afterShow = await readShow(showId)
    const afterSongs = await readSongs(perfId)
    checkUnchanged('revoked delegate: denied PATCH — performances row', beforePerf, afterPerf)
    checkUnchanged('revoked delegate: denied PATCH — associated shows row', beforeShow, afterShow)
    check('revoked delegate: denied PATCH left performance_songs rows unchanged', JSON.stringify(beforeSongs) === JSON.stringify(afterSongs), JSON.stringify({ beforeSongs, afterSongs }))
  }

  console.log('\n15. HTTP: PATCH /api/upload-performance — an already-signed-in delegate is denied on the NEXT request after full revocation; performance, associated show, and song rows all unchanged')
  {
    // activeDelegate already has earlier accepted rows for ownerA from
    // tests 2/10/13 — can_act_for()/isAuthorizedFor() only need ONE valid
    // row to pass, so to actually prove revocation blocks access, every
    // one of this delegate's rows for ownerA must be revoked, not just a
    // freshly-seeded one.
    const { data: allRows, error: allRowsErr } = await service.from('artist_delegates').select('id').eq('artist_id', ownerA.userId).eq('delegate_id', activeDelegate.userId)
    if (allRowsErr) throw new Error(`test 15 delegation lookup failed: ${allRowsErr.message}`)
    if (!allRows || allRows.length === 0) throw new Error('test 15 fixture invariant violated: expected at least one existing artist_delegates row for activeDelegate to revoke')
    for (const row of allRows) {
      await revoke(row.id)
    }

    const created = await callUploadPost(ownerA, ownerA.userId)
    check('fixture: owner draft created for same-session revoke test', created.status === 200 && !!created.json.performance_id, JSON.stringify(created))
    const perfId = created.json.performance_id
    const showId = created.json.show_id
    if (perfId) createdPerformanceIds.push(perfId)
    if (showId) createdShowIds.push(showId)
    unwrap<{ id: string }>(await service.from('performance_songs').insert({ performance_id: perfId, title: 'Pre-Existing Song 2', position: 1 }).select().single(), 'pre-existing song fixture 2')

    const beforePerf = await readPerf(perfId)
    const beforeShow = await readShow(showId)
    const beforeSongs = await readSongs(perfId)

    const { status, json } = await callUploadPatch(activeDelegate, perfId, `Post Revoke Same Session ${RUN}`)
    check('activeDelegate (now fully revoked): SAME already-signed-in session denied by PATCH on its next request', status === 403, JSON.stringify({ status, json }))

    const afterPerf = await readPerf(perfId)
    const afterShow = await readShow(showId)
    const afterSongs = await readSongs(perfId)
    checkUnchanged('post-revoke PATCH — performances row', beforePerf, afterPerf)
    checkUnchanged('post-revoke PATCH — associated shows row', beforeShow, afterShow)
    check('post-revoke PATCH left performance_songs rows unchanged', JSON.stringify(beforeSongs) === JSON.stringify(afterSongs), JSON.stringify({ beforeSongs, afterSongs }))
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
