// Real HTTP-level tests for accepted/non-revoked delegation parity across
// four routes that previously checked only accepted_at:
//   - POST /api/performances/[id]/delete
//   - POST /api/performances/[id]/delete/undo
//   - GET  /api/team/managed-artists
//   - GET  /api/team/context-data?artist_id=
//
// Uses real Supabase Auth sessions (via @supabase/ssr's cookie contract,
// the same one the browser uses) and the actual running routes — no
// mocked authorization, no direct RLS bypass for the behavior under test.
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
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-team-route-revocation-parity.ts

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

function rowsEqual(a: Record<string, unknown> | null, b: Record<string, unknown> | null): boolean {
  if (a === null || b === null) return a === b
  const aKeys = Object.keys(a).sort()
  const bKeys = Object.keys(b).sort()
  if (aKeys.length !== bKeys.length || aKeys.some((k, i) => k !== bKeys[i])) return false
  return aKeys.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]))
}
// A denial readback must prove the record actually EXISTS and is
// byte-for-byte unchanged — not merely that one field happened to still
// equal some expected value, which says nothing if the row itself was
// somehow gone.
function checkUnchanged(label: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  check(`${label}: before/after rows both exist`, before !== null && after !== null, `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
  check(`${label}: complete row match`, rowsEqual(before, after), `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
}

interface Persona {
  label: string
  userId: string
  email: string
  cookieHeader: () => string
}

async function createPersona(label: string): Promise<Persona> {
  const email = `teamparity-${RUN}-${label}@example.test`.toLowerCase()
  const password = crypto.randomBytes(18).toString('base64url')
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser failed for ${label}: ${error?.message}`)
  const userId = data.user.id
  createdUserIds.push(userId)
  unwrap<{ id: string }>(await service.from('profiles').insert({ id: userId, full_name: label, email }).select().single(), `profile for ${label}`)

  const jar = new Map<string, string>()
  const browserClient = createBrowserClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => Array.from(jar.entries()).map(([name, value]) => ({ name, value })),
      setAll: (cookiesToSet: { name: string; value: string }[]) => {
        for (const { name, value } of cookiesToSet) jar.set(name, value)
      },
    },
  })
  const { error: signInErr } = await browserClient.auth.signInWithPassword({ email, password })
  if (signInErr) throw new Error(`sign-in failed for ${label}: ${signInErr.message}`)

  return {
    label, userId, email,
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
  return { data, error }
}

async function callDelete(caller: Persona, performanceId: string) {
  const res = await fetch(`${APP_URL}/api/performances/${performanceId}/delete`, {
    method: 'POST',
    headers: { ...(caller.cookieHeader() ? { Cookie: caller.cookieHeader() } : {}) },
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}
async function callUndo(caller: Persona, performanceId: string) {
  const res = await fetch(`${APP_URL}/api/performances/${performanceId}/delete/undo`, {
    method: 'POST',
    headers: { ...(caller.cookieHeader() ? { Cookie: caller.cookieHeader() } : {}) },
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}
async function callManagedArtists(caller: Persona) {
  const res = await fetch(`${APP_URL}/api/team/managed-artists`, {
    headers: { ...(caller.cookieHeader() ? { Cookie: caller.cookieHeader() } : {}) },
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}
async function callContextData(caller: Persona, artistId: string) {
  const res = await fetch(`${APP_URL}/api/team/context-data?artist_id=${artistId}`, {
    headers: { ...(caller.cookieHeader() ? { Cookie: caller.cookieHeader() } : {}) },
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

async function cleanup() {
  const errors: string[] = []
  if (createdPerformanceIds.length > 0) {
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
  const toBeRevoked = await createPersona('toBeRevoked')

  await seedDelegation({ artistId: ownerA.userId, delegateId: activeDelegate.userId, accepted: true })
  await seedDelegation({ artistId: ownerA.userId, delegateId: pendingDelegate.userId, accepted: false })
  await seedDelegation({ artistId: ownerA.userId, delegateId: revokedDelegate.userId, accepted: true, revoked: true })
  const toBeRevokedDelegationId = await seedDelegation({ artistId: ownerA.userId, delegateId: toBeRevoked.userId, accepted: true })

  const showA = unwrap<{ id: string }>(await service.from('shows').insert({ created_by: ownerA.userId }).select().single(), 'showA')
  createdShowIds.push(showA.id)

  // ── /api/performances/[id]/delete and its /undo ──────────────────────────

  console.log('\n1. DELETE: owner can soft-delete their own performance')
  {
    const perf = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: `Owner Delete ${RUN}`, show_id: showA.id }).select().single(), 'perf for owner delete')
    createdPerformanceIds.push(perf.id)
    const { status, json } = await callDelete(ownerA, perf.id)
    check('owner: delete succeeds (200)', status === 200 && json.success === true, JSON.stringify({ status, json }))
    const after = await readPerf(perf.id)
    check('owner: readback succeeded with no error', !after.error, JSON.stringify(after.error))
    check('owner: deleted_at is set', !!after.data?.deleted_at, JSON.stringify(after.data))
  }

  console.log('\n2. DELETE: active accepted delegate can soft-delete an owned performance')
  {
    const perf = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: `Active Delete ${RUN}`, show_id: showA.id }).select().single(), 'perf for active delegate delete')
    createdPerformanceIds.push(perf.id)
    const { status, json } = await callDelete(activeDelegate, perf.id)
    check('active delegate: delete succeeds (200)', status === 200 && json.success === true, JSON.stringify({ status, json }))
    const after = await readPerf(perf.id)
    check('active delegate: readback succeeded with no error', !after.error, JSON.stringify(after.error))
    check('active delegate: deleted_at is set', !!after.data?.deleted_at, JSON.stringify(after.data))
  }

  console.log('\n3. DELETE: pending delegate denied (403), stored state unchanged')
  {
    const perf = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: `Pending Delete ${RUN}`, show_id: showA.id }).select().single(), 'perf for pending delegate delete')
    createdPerformanceIds.push(perf.id)
    const before = await readPerf(perf.id)
    check('pending delegate: before readback succeeded with no error', !before.error, JSON.stringify(before.error))
    const { status, json } = await callDelete(pendingDelegate, perf.id)
    check('pending delegate: delete denied (403)', status === 403, JSON.stringify({ status, json }))
    const after = await readPerf(perf.id)
    check('pending delegate: after readback succeeded with no error', !after.error, JSON.stringify(after.error))
    checkUnchanged('pending delegate: denied delete', before.data, after.data)
  }

  console.log('\n4. DELETE: revoked delegate denied (403), stored state unchanged')
  {
    const perf = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: `Revoked Delete ${RUN}`, show_id: showA.id }).select().single(), 'perf for revoked delegate delete')
    createdPerformanceIds.push(perf.id)
    const before = await readPerf(perf.id)
    check('revoked delegate: before readback succeeded with no error', !before.error, JSON.stringify(before.error))
    const { status, json } = await callDelete(revokedDelegate, perf.id)
    check('revoked delegate: delete denied (403)', status === 403, JSON.stringify({ status, json }))
    const after = await readPerf(perf.id)
    check('revoked delegate: after readback succeeded with no error', !after.error, JSON.stringify(after.error))
    checkUnchanged('revoked delegate: denied delete', before.data, after.data)
  }

  console.log('\n5. DELETE: an already-signed-in delegate is denied on the NEXT request after revocation')
  {
    const perf = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: `Same Session Delete ${RUN}`, show_id: showA.id }).select().single(), 'perf for same-session revoke delete')
    createdPerformanceIds.push(perf.id)
    await revoke(toBeRevokedDelegationId)
    const before = await readPerf(perf.id)
    check('toBeRevoked (delete): before readback succeeded with no error', !before.error, JSON.stringify(before.error))
    const { status, json } = await callDelete(toBeRevoked, perf.id)
    check('toBeRevoked: SAME already-signed-in session denied by delete on its next request', status === 403, JSON.stringify({ status, json }))
    const after = await readPerf(perf.id)
    check('toBeRevoked (delete): after readback succeeded with no error', !after.error, JSON.stringify(after.error))
    checkUnchanged('toBeRevoked: denied delete', before.data, after.data)
  }

  console.log('\n6. UNDO: owner can restore their own soft-deleted performance')
  {
    const perf = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: `Owner Undo ${RUN}`, show_id: showA.id, deleted_at: new Date().toISOString() }).select().single(), 'perf for owner undo')
    createdPerformanceIds.push(perf.id)
    const { status, json } = await callUndo(ownerA, perf.id)
    check('owner: undo succeeds (200)', status === 200 && json.success === true, JSON.stringify({ status, json }))
    const after = await readPerf(perf.id)
    check('owner: readback succeeded with no error', !after.error, JSON.stringify(after.error))
    check('owner: deleted_at cleared', after.data?.deleted_at === null, JSON.stringify(after.data))
  }

  console.log('\n7. UNDO: active accepted delegate can restore a soft-deleted performance')
  {
    const perf = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: `Active Undo ${RUN}`, show_id: showA.id, deleted_at: new Date().toISOString() }).select().single(), 'perf for active delegate undo')
    createdPerformanceIds.push(perf.id)
    const { status, json } = await callUndo(activeDelegate, perf.id)
    check('active delegate: undo succeeds (200)', status === 200 && json.success === true, JSON.stringify({ status, json }))
    const after = await readPerf(perf.id)
    check('active delegate: readback succeeded with no error', !after.error, JSON.stringify(after.error))
    check('active delegate: deleted_at cleared', after.data?.deleted_at === null, JSON.stringify(after.data))
  }

  console.log('\n8. UNDO: revoked delegate denied (403), stored state unchanged (still deleted)')
  {
    const perf = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: `Revoked Undo ${RUN}`, show_id: showA.id, deleted_at: new Date().toISOString() }).select().single(), 'perf for revoked delegate undo')
    createdPerformanceIds.push(perf.id)
    const before = await readPerf(perf.id)
    check('revoked delegate (undo): before readback succeeded with no error', !before.error, JSON.stringify(before.error))
    check('revoked delegate (undo): fixture starts deleted', !!before.data?.deleted_at, JSON.stringify(before.data))
    const { status, json } = await callUndo(revokedDelegate, perf.id)
    check('revoked delegate: undo denied (403)', status === 403, JSON.stringify({ status, json }))
    const after = await readPerf(perf.id)
    check('revoked delegate (undo): after readback succeeded with no error', !after.error, JSON.stringify(after.error))
    checkUnchanged('revoked delegate: denied undo', before.data, after.data)
  }

  console.log('\n9. UNDO: pending delegate denied (403), stored state unchanged (still deleted)')
  {
    const perf = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: `Pending Undo ${RUN}`, show_id: showA.id, deleted_at: new Date().toISOString() }).select().single(), 'perf for pending delegate undo')
    createdPerformanceIds.push(perf.id)
    const before = await readPerf(perf.id)
    check('pending delegate (undo): before readback succeeded with no error', !before.error, JSON.stringify(before.error))
    check('pending delegate (undo): fixture starts deleted', !!before.data?.deleted_at, JSON.stringify(before.data))
    const { status, json } = await callUndo(pendingDelegate, perf.id)
    check('pending delegate: undo denied (403)', status === 403, JSON.stringify({ status, json }))
    const after = await readPerf(perf.id)
    check('pending delegate (undo): after readback succeeded with no error', !after.error, JSON.stringify(after.error))
    checkUnchanged('pending delegate: denied undo', before.data, after.data)
  }

  console.log('\n10. UNDO: an already-signed-in delegate is denied on the NEXT request after revocation, stored state unchanged (still deleted)')
  {
    // toBeRevoked was already revoked in test 5 above.
    const perf = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: `Same Session Undo ${RUN}`, show_id: showA.id, deleted_at: new Date().toISOString() }).select().single(), 'perf for same-session revoke undo')
    createdPerformanceIds.push(perf.id)
    const before = await readPerf(perf.id)
    check('toBeRevoked (undo): before readback succeeded with no error', !before.error, JSON.stringify(before.error))
    check('toBeRevoked (undo): fixture starts deleted', !!before.data?.deleted_at, JSON.stringify(before.data))
    const { status, json } = await callUndo(toBeRevoked, perf.id)
    check('toBeRevoked: SAME already-signed-in session denied by undo on its next request', status === 403, JSON.stringify({ status, json }))
    const after = await readPerf(perf.id)
    check('toBeRevoked (undo): after readback succeeded with no error', !after.error, JSON.stringify(after.error))
    checkUnchanged('toBeRevoked: denied undo', before.data, after.data)
  }

  // ── /api/team/managed-artists ─────────────────────────────────────────────

  console.log('\n11. managed-artists: active delegate sees ownerA listed with the correct role')
  {
    const { status, json } = await callManagedArtists(activeDelegate)
    check('active delegate: managed-artists succeeds (200)', status === 200, JSON.stringify({ status, json }))
    const entry = (json.managed || []).find((m: any) => m.artist_id === ownerA.userId)
    check('active delegate: ownerA appears in managed list with role manager', entry?.role === 'manager', JSON.stringify(json.managed))
  }

  console.log('\n12. managed-artists: pending delegate does NOT see ownerA listed')
  {
    const { status, json } = await callManagedArtists(pendingDelegate)
    check('pending delegate: managed-artists succeeds (200)', status === 200, JSON.stringify({ status, json }))
    const entry = (json.managed || []).find((m: any) => m.artist_id === ownerA.userId)
    check('pending delegate: ownerA absent from managed list', !entry, JSON.stringify(json.managed))
  }

  console.log('\n13. managed-artists: revoked delegate does NOT see ownerA listed')
  {
    const { status, json } = await callManagedArtists(revokedDelegate)
    check('revoked delegate: managed-artists succeeds (200)', status === 200, JSON.stringify({ status, json }))
    const entry = (json.managed || []).find((m: any) => m.artist_id === ownerA.userId)
    check('revoked delegate: ownerA absent from managed list', !entry, JSON.stringify(json.managed))
  }

  console.log('\n14. managed-artists: an already-signed-in delegate loses the listing on the NEXT request after revocation')
  {
    // toBeRevoked was already revoked in test 5 above.
    const { status, json } = await callManagedArtists(toBeRevoked)
    check('toBeRevoked: managed-artists succeeds (200)', status === 200, JSON.stringify({ status, json }))
    const entry = (json.managed || []).find((m: any) => m.artist_id === ownerA.userId)
    check('toBeRevoked: ownerA absent from managed list on next request after revocation', !entry, JSON.stringify(json.managed))
  }

  // ── /api/team/context-data ────────────────────────────────────────────────

  console.log('\n15. context-data: active accepted delegate can fetch ownerA\'s context')
  {
    const { status, json } = await callContextData(activeDelegate, ownerA.userId)
    check('active delegate: context-data succeeds (200)', status === 200 && json.artist_id === ownerA.userId, JSON.stringify({ status, json }))
    check('active delegate: role reflects the delegation row', json.role === 'manager', JSON.stringify(json))
  }

  console.log('\n16. context-data: pending delegate denied (403), no artist data exposed')
  {
    const { status, json } = await callContextData(pendingDelegate, ownerA.userId)
    check('pending delegate: context-data denied (403)', status === 403, JSON.stringify({ status, json }))
    check('pending delegate: no performances/financial data leaked in the denial body', json.performances === undefined && json.artist_name === undefined, JSON.stringify(json))
  }

  console.log('\n17. context-data: revoked delegate denied (403), no artist data exposed')
  {
    const { status, json } = await callContextData(revokedDelegate, ownerA.userId)
    check('revoked delegate: context-data denied (403)', status === 403, JSON.stringify({ status, json }))
    check('revoked delegate: no performances/financial data leaked in the denial body', json.performances === undefined && json.artist_name === undefined, JSON.stringify(json))
  }

  console.log('\n18. context-data: an already-signed-in delegate is denied on the NEXT request after revocation, no data exposed')
  {
    // toBeRevoked was already revoked in test 5 above.
    const { status, json } = await callContextData(toBeRevoked, ownerA.userId)
    check('toBeRevoked: context-data denied (403) on next request after revocation', status === 403, JSON.stringify({ status, json }))
    check('toBeRevoked: no performances/financial data leaked in the denial body', json.performances === undefined && json.artist_name === undefined, JSON.stringify(json))
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
