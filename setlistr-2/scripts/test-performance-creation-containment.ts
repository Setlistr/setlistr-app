// Real Postgres/PostgREST-level tests for the interim performance-
// creation containment (0014_performance_creation_containment.sql):
// performances.show_id must match a show created_by the same user_id
// at INSERT time, and performances.setlist_id must be NULL at INSERT
// time. Both are BEFORE INSERT checks — 0013's BEFORE UPDATE locks are
// untouched and out of scope here.
//
// HARD LOCALHOST GUARD: refuses to run unless the Supabase URL resolves
// to 127.0.0.1/localhost. There is no override.
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-performance-creation-containment.ts

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
const createdShowIds: string[] = []
const createdPerformanceIds: string[] = []

// Every venue marker is scoped to this run so readbacks can't pick up
// rows left by a previous (possibly failed-cleanup) run or a concurrent
// one — never a fixed, reusable literal.
const v = (label: string) => `${label} ${RUN}`

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

const MSG_SHOW_MATCH = 'performances.show_id must reference a show created by the same performer (performances.user_id)'
const MSG_SETLIST_BLOCKED = 'performances.setlist_id cannot be set at creation until a validated artist/event participation mechanism exists'
const SQLSTATE = '23514'
const RLS_SQLSTATE = '42501'
const MSG_PERF_RLS = 'new row violates row-level security policy for table "performances"'

function checkDenied(label: string, error: { code?: string; message?: string } | null | undefined, expectedMessage: string) {
  check(`${label}: SQLSTATE 23514`, error?.code === SQLSTATE, JSON.stringify(error))
  check(`${label}: exact trigger message`, error?.message === expectedMessage, JSON.stringify(error))
}
function unwrap<T>(res: { data: T | null; error: { message: string } | null }, label: string): T {
  if (res.error || !res.data) throw new Error(`${label} failed: ${res.error?.message || 'no data returned'}`)
  return res.data
}

// Service-role readback — bypasses RLS so it reflects true stored state,
// not what a particular caller's own policy would let them see back.
async function readPerfByVenue(venueName: string) {
  const { data, error } = await service.from('performances').select('*').eq('venue_name', venueName)
  if (error) throw new Error(`readPerfByVenue(${venueName}) failed: ${error.message}`)
  return data ?? []
}
function checkAbsent(label: string, rows: unknown[]) {
  check(`${label}: rejected insert left NO stored row`, rows.length === 0, JSON.stringify(rows))
}
function checkPersisted(label: string, rows: { id: string; user_id: unknown; show_id: unknown; setlist_id: unknown }[], expected: { user_id: string; show_id: string | null; setlist_id: string | null }) {
  check(`${label}: exactly one stored row`, rows.length === 1, JSON.stringify(rows))
  if (rows.length !== 1) return
  const row = rows[0]
  check(`${label}: persisted user_id matches`, row.user_id === expected.user_id, JSON.stringify(row))
  check(`${label}: persisted show_id matches`, row.show_id === expected.show_id, JSON.stringify(row))
  check(`${label}: persisted setlist_id matches`, row.setlist_id === expected.setlist_id, JSON.stringify(row))
}

interface Persona {
  label: string
  userId: string
  client: SupabaseClient
}

async function createPersona(label: string): Promise<Persona> {
  const email = `perfcreate-${RUN}-${label}@example.test`.toLowerCase()
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
  const ownerD = await createPersona('ownerD') // unrelated — no delegation to/from anyone
  const manager = await createPersona('manager') // delegated for BOTH ownerA and ownerC
  await seedDelegation(ownerA.userId, manager.userId)
  await seedDelegation(ownerC.userId, manager.userId)

  const showA = unwrap<{ id: string }>(await service.from('shows').insert({ created_by: ownerA.userId }).select().single(), 'showA')
  createdShowIds.push(showA.id)
  const showC = unwrap<{ id: string }>(await service.from('shows').insert({ created_by: ownerC.userId }).select().single(), 'showC')
  createdShowIds.push(showC.id)

  console.log('\n1. Owner creating a valid record (show_id matches own user_id)')
  {
    const venue = v('Owner Valid')
    const { data, error } = await ownerA.client.from('performances').insert({ user_id: ownerA.userId, venue_name: venue, show_id: showA.id }).select().single()
    check('owner: valid same-user show_id succeeds', !error && !!data, JSON.stringify(error))
    if (data) createdPerformanceIds.push((data as any).id)
    checkPersisted('owner valid creation', await readPerfByVenue(venue), { user_id: ownerA.userId, show_id: showA.id, setlist_id: null })
  }

  console.log('\n2. Accepted delegate creating a valid record on behalf of the managed artist')
  {
    const venue = v('Delegate Valid')
    const { data, error } = await manager.client.from('performances').insert({ user_id: ownerA.userId, venue_name: venue, show_id: showA.id }).select().single()
    check('delegate: valid delegated show_id succeeds', !error && !!data, JSON.stringify(error))
    if (data) createdPerformanceIds.push((data as any).id)
    checkPersisted('delegate valid creation', await readPerfByVenue(venue), { user_id: ownerA.userId, show_id: showA.id, setlist_id: null })
  }

  console.log('\n3. Manager authorized for BOTH artists attempts an invalid cross-artist attachment')
  {
    // manager can_act_for both ownerA and ownerC individually (existing RLS
    // would happily allow user_id=ownerC on its own) — but showA.created_by
    // is ownerA, not ownerC. Dual delegation must not substitute for a real
    // artist/event relationship.
    const venue = v('Cross-Artist Invalid')
    const { data, error } = await manager.client.from('performances').insert({ user_id: ownerC.userId, venue_name: venue, show_id: showA.id }).select().single()
    check('manager (dual delegation): cross-artist attachment rejected, not silently allowed', !data, JSON.stringify({ data, error }))
    checkDenied('manager cross-artist attachment', error, MSG_SHOW_MATCH)
    checkAbsent('manager cross-artist attachment', await readPerfByVenue(venue))
  }

  console.log('\n4. Unrelated caller (no delegation at all) attempts impersonation')
  {
    // Must already be blocked by the EXISTING users_insert_own_performance
    // RLS policy (can_act_for(user_id)) before this migration's trigger is
    // even relevant — proves the new trigger layers on top of, and does not
    // weaken, caller-authorization enforcement. Asserted precisely: the
    // real Postgres RLS violation code/message, not merely "not this
    // trigger's message" (which would also pass for an unrelated failure).
    const venue = v('Impersonation')
    const { data, error } = await ownerD.client.from('performances').insert({ user_id: ownerA.userId, venue_name: venue, show_id: showA.id }).select().single()
    check('unrelated caller: impersonation rejected, not silently allowed', !data, JSON.stringify({ data, error }))
    check('unrelated caller: SQLSTATE 42501 (RLS policy violation)', error?.code === RLS_SQLSTATE, JSON.stringify(error))
    check('unrelated caller: exact RLS rejection message', error?.message === MSG_PERF_RLS, JSON.stringify(error))
    checkAbsent('unrelated caller impersonation', await readPerfByVenue(venue))
  }

  console.log('\n5. NULL show_id remains permitted (currently-legitimate case untouched)')
  {
    const venue = v('Draft No Show')
    const { data, error } = await ownerA.client.from('performances').insert({ user_id: ownerA.userId, venue_name: venue }).select().single()
    check('owner: NULL show_id still succeeds', !error && !!data, JSON.stringify(error))
    if (data) createdPerformanceIds.push((data as any).id)
    checkPersisted('NULL show_id creation', await readPerfByVenue(venue), { user_id: ownerA.userId, show_id: null, setlist_id: null })
  }

  console.log('\n6. Non-NULL setlist_id is rejected unconditionally at creation')
  {
    const venue = v('Setlist Attempt')
    const { data, error } = await ownerA.client.from('performances').insert({ user_id: ownerA.userId, venue_name: venue, show_id: showA.id, setlist_id: crypto.randomUUID() }).select().single()
    check('owner: non-NULL setlist_id at creation rejected', !data, JSON.stringify({ data, error }))
    checkDenied('non-NULL setlist_id at creation', error, MSG_SETLIST_BLOCKED)
    checkAbsent('non-NULL setlist_id at creation', await readPerfByVenue(venue))
  }

  console.log('\n7. service_role is not exempt: a mismatched show_id/user_id is still rejected (trigger, not RLS-bypassable)')
  {
    const venue = v('Service Role Mismatch')
    const { data, error } = await service.from('performances').insert({ user_id: ownerC.userId, venue_name: venue, show_id: showA.id }).select().single()
    check('service_role: cross-artist mismatch rejected', !data, JSON.stringify({ data, error }))
    checkDenied('service_role cross-artist mismatch', error, MSG_SHOW_MATCH)
    checkAbsent('service_role cross-artist mismatch', await readPerfByVenue(venue))
  }

  console.log('\n8. service_role valid creation still works (regression)')
  {
    const venue = v('Service Role Valid')
    const { data, error } = await service.from('performances').insert({ user_id: ownerC.userId, venue_name: venue, show_id: showC.id }).select().single()
    check('service_role: matched show_id/user_id still succeeds', !error && !!data, JSON.stringify(error))
    if (data) createdPerformanceIds.push((data as any).id)
    checkPersisted('service_role valid creation', await readPerfByVenue(venue), { user_id: ownerC.userId, show_id: showC.id, setlist_id: null })
  }

  console.log('\n9. Ordinary UPDATE of an existing performance (unrelated field) remains unaffected (BEFORE INSERT only)')
  {
    const venueBefore = v('Edit Regression Before')
    const venueAfter = v('Edit Regression After')
    const created = unwrap<{ id: string; user_id: string; show_id: string | null; setlist_id: string | null }>(
      await ownerA.client.from('performances').insert({ user_id: ownerA.userId, venue_name: venueBefore, show_id: showA.id }).select().single(),
      'fixture: created for edit regression'
    )
    createdPerformanceIds.push(created.id)

    const { data: updatedRows, error } = await ownerA.client.from('performances').update({ venue_name: venueAfter }).eq('id', created.id).select()
    check('owner: ordinary edit after creation still succeeds', !error && (updatedRows?.length ?? 0) === 1, JSON.stringify(error))

    // Independent readback (service role, bypasses RLS) of the actual
    // stored row — not trusting the UPDATE call's own .select() echo.
    const { data: after, error: readErr } = await service.from('performances').select('*').eq('id', created.id).maybeSingle()
    check('edit regression: readback succeeds with no error', !readErr, JSON.stringify(readErr))
    check('edit regression: venue_name changed to the new value', after?.venue_name === venueAfter, JSON.stringify(after))
    check('edit regression: user_id unchanged', after?.user_id === created.user_id, JSON.stringify(after))
    check('edit regression: show_id unchanged', after?.show_id === created.show_id, JSON.stringify(after))
    check('edit regression: setlist_id unchanged', after?.setlist_id === created.setlist_id, JSON.stringify(after))
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
