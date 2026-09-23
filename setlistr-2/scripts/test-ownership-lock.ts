// Real Postgres/PostgREST-level tests for the ownership-reassignment lock
// (0011_ownership_reassignment_lock.sql), run against a LOCAL Supabase
// instance with real Auth sessions. There is no HTTP route for
// reassignment (none exists, by design), so this tests the actual
// database boundary directly: each persona's supabase-js client carries a
// real signed-in session, and PostgREST derives auth.uid() from that
// session's JWT exactly as it would for any real request — no mocked
// authorization, no RLS bypass for the behavior under test.
//
// HARD LOCALHOST GUARD: refuses to run unless the Supabase URL resolves to
// 127.0.0.1/localhost. There is no override.
//
// Every denial in this suite is checked by asserting the returned error's
// message is this migration's own raised text ("... cannot be changed
// after creation"), not just that the request failed — that's what proves
// the OWNERSHIP TRIGGER caught it, as opposed to RLS silently filtering
// the row (which would return success with zero rows, not an error) or a
// generic NOT NULL/other constraint violation. Every denial case is also
// run as a caller who is otherwise authorized under RLS to write to the
// row (the current owner, or an accepted delegate of either the old or
// the new target) specifically because can_act_for() alone can't tell
// these apart from a legitimate edit — only the trigger can.
//
// FIXTURE NOTE (corrected this pass): shows.created_by is nullable and
// REFERENCES auth.users(id) ON DELETE SET NULL in the live schema — a
// first draft of this fixture had it NOT NULL / profiles(id) ON DELETE
// CASCADE, which hid a real bug (an unconditional rejection made real
// account deletion fail outright, since the FK's own SET NULL action is
// itself an UPDATE this trigger would otherwise catch). The local `shows`
// table this script assumes already exists is recreated with the correct
// structure as part of this fixture (nullable created_by, FK to
// auth.users ON DELETE SET NULL) — see the migration file's own comments
// for the full reproduction.
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-ownership-lock.ts

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

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

const TRIGGER_MSG_PERF = 'performances.user_id cannot be changed after creation'
const TRIGGER_MSG_SHOW = 'shows.created_by cannot be changed after creation'

interface Persona {
  label: string
  userId: string
  client: SupabaseClient
}

async function createPersona(label: string): Promise<Persona> {
  const email = `own-test-${RUN}-${label}@example.test`.toLowerCase()
  const password = crypto.randomBytes(18).toString('base64url')

  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser failed for ${label}: ${error?.message}`)
  const userId = data.user.id
  createdUserIds.push(userId)

  const { error: profErr } = await service.from('profiles').insert({ id: userId, full_name: label })
  if (profErr) throw new Error(`profile insert failed for ${label}: ${profErr.message}`)

  const client = createClient(SUPABASE_URL, ANON_KEY)
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password })
  if (signInErr) throw new Error(`sign-in failed for ${label}: ${signInErr.message}`)

  return { label, userId, client }
}

async function seedDelegation(artistId: string, delegateId: string) {
  const { error } = await service.from('artist_delegates').insert({
    artist_id: artistId, delegate_id: delegateId, role: 'manager', accepted_at: new Date().toISOString(),
  })
  if (error) throw new Error(`seedDelegation failed: ${error.message}`)
}

function rowsEqual(a: Record<string, unknown> | null, b: Record<string, unknown> | null): boolean {
  if (a === null || b === null) return a === b
  const aKeys = Object.keys(a).sort()
  const bKeys = Object.keys(b).sort()
  if (aKeys.length !== bKeys.length || aKeys.some((k, i) => k !== bKeys[i])) return false
  return aKeys.every((k) => a[k] === b[k])
}

async function readPerformance(id: string) {
  const { data, error } = await service.from('performances').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`readPerformance failed: ${error.message}`)
  return data
}
async function readShow(id: string) {
  const { data, error } = await service.from('shows').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`readShow failed: ${error.message}`)
  return data
}

// Rows that fall outside the normal createdUserIds-keyed cleanup sweep —
// specifically, a show deliberately left with created_by = NULL (an
// orphan is the whole point of check 9/10) can never be matched by
// `.in('created_by', createdUserIds)`, and its owner's profile row
// outlives their auth.users deletion (no FK from profiles to auth.users
// in this fixture) even after that owner is removed from createdUserIds.
const extraShowIdsToClean: string[] = []
const extraProfileIdsToClean: string[] = []

async function cleanup() {
  const errors: string[] = []
  const { error: perfErr } = await service.from('performances').delete().in('user_id', createdUserIds)
  if (perfErr) errors.push(`delete performances: ${perfErr.message}`)
  const { error: showErr } = await service.from('shows').delete().in('created_by', createdUserIds)
  if (showErr) errors.push(`delete shows: ${showErr.message}`)
  if (extraShowIdsToClean.length > 0) {
    const { error: extraShowErr } = await service.from('shows').delete().in('id', extraShowIdsToClean)
    if (extraShowErr) errors.push(`delete extra shows: ${extraShowErr.message}`)
  }
  if (extraProfileIdsToClean.length > 0) {
    const { error: extraProfErr } = await service.from('profiles').delete().in('id', extraProfileIdsToClean)
    if (extraProfErr) errors.push(`delete extra profiles: ${extraProfErr.message}`)
  }
  const { error: delArtistErr } = await service.from('artist_delegates').delete().in('artist_id', createdUserIds)
  if (delArtistErr) errors.push(`delete artist_delegates by artist_id: ${delArtistErr.message}`)
  const { error: delDelegateErr } = await service.from('artist_delegates').delete().in('delegate_id', createdUserIds)
  if (delDelegateErr) errors.push(`delete artist_delegates by delegate_id: ${delDelegateErr.message}`)
  for (const id of createdUserIds) {
    const { error: profErr } = await service.from('profiles').delete().eq('id', id)
    if (profErr) errors.push(`delete profile ${id}: ${profErr.message}`)
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
  const delegateD = await createPersona('delegateD')

  // ownerA -> accepted manager delegate of ownerC. This is what makes
  // ownerA "otherwise authorized" under can_act_for() to write NEW.user_id
  // = ownerC.id: RLS's implicit WITH CHECK (performances_own/shows_self
  // have no explicit WITH CHECK, so Postgres uses their USING expression
  // against the NEW row) would itself permit this specific reassignment —
  // only the trigger stops it.
  await seedDelegation(ownerC.userId, ownerA.userId)
  // delegateD -> accepted manager delegate of ownerA, for the
  // delegate-reassigns-to-self and legitimate-delegate-edit cases.
  await seedDelegation(ownerA.userId, delegateD.userId)

  const { data: p1, error: p1Err } = await ownerA.client.from('performances').insert({
    user_id: ownerA.userId, venue_name: 'Venue One',
  }).select().single()
  if (p1Err || !p1) throw new Error(`fixture performance insert failed: ${p1Err?.message}`)

  const { data: s1, error: s1Err } = await ownerA.client.from('shows').insert({
    created_by: ownerA.userId, status: 'live',
  }).select().single()
  if (s1Err || !s1) throw new Error(`fixture show insert failed: ${s1Err?.message}`)

  console.log('\n1. Accepted delegate cannot reassign to themselves')
  {
    const before = await readPerformance(p1.id)
    const { error } = await delegateD.client.from('performances').update({ user_id: delegateD.userId }).eq('id', p1.id)
    check('performances: rejected by the ownership trigger specifically', !!error?.message?.includes(TRIGGER_MSG_PERF), JSON.stringify(error))
    const after = await readPerformance(p1.id)
    check('performances: row completely unchanged', rowsEqual(before, after))

    const beforeS = await readShow(s1.id)
    const { error: errS } = await delegateD.client.from('shows').update({ created_by: delegateD.userId }).eq('id', s1.id)
    check('shows: rejected by the ownership trigger specifically', !!errS?.message?.includes(TRIGGER_MSG_SHOW), JSON.stringify(errS))
    const afterS = await readShow(s1.id)
    check('shows: row completely unchanged', rowsEqual(beforeS, afterS))
  }

  console.log('\n2. Owner cannot reassign to another identity they can also act for')
  {
    const before = await readPerformance(p1.id)
    const { error } = await ownerA.client.from('performances').update({ user_id: ownerC.userId }).eq('id', p1.id)
    check('performances: rejected by the ownership trigger specifically', !!error?.message?.includes(TRIGGER_MSG_PERF), JSON.stringify(error))
    const after = await readPerformance(p1.id)
    check('performances: row completely unchanged', rowsEqual(before, after))

    const beforeS = await readShow(s1.id)
    const { error: errS } = await ownerA.client.from('shows').update({ created_by: ownerC.userId }).eq('id', s1.id)
    check('shows: rejected by the ownership trigger specifically', !!errS?.message?.includes(TRIGGER_MSG_SHOW), JSON.stringify(errS))
    const afterS = await readShow(s1.id)
    check('shows: row completely unchanged', rowsEqual(beforeS, afterS))
  }

  console.log('\n3. Ordinary NULL ownership change is rejected (owner\'s own auth.users row obviously still exists)')
  {
    const before = await readPerformance(p1.id)
    const { error } = await ownerA.client.from('performances').update({ user_id: null }).eq('id', p1.id)
    check('performances: rejected (trigger, evaluated before any NOT NULL constraint)', !!error?.message?.includes(TRIGGER_MSG_PERF), JSON.stringify(error))
    const after = await readPerformance(p1.id)
    check('performances: row completely unchanged', rowsEqual(before, after))

    // shows.created_by is nullable with the narrow non-NULL -> NULL
    // exception (see migration comments) — but that exception only
    // applies when the OLD owner's auth.users row has actually stopped
    // existing. ownerA is live and signed in right now, so their own
    // auth.users row unambiguously still exists: this must still be
    // rejected by the same exact trigger message, not silently allowed.
    const beforeS = await readShow(s1.id)
    const { error: errS } = await ownerA.client.from('shows').update({ created_by: null }).eq('id', s1.id)
    check('shows: owner NULL attempt rejected by the same trigger message (user still exists)', !!errS?.message?.includes(TRIGGER_MSG_SHOW), JSON.stringify(errS))
    const afterS = await readShow(s1.id)
    check('shows: row completely unchanged (owner NULL attempt)', rowsEqual(beforeS, afterS))

    // Same check, but for an accepted delegate — can_act_for(s1's current
    // owner) is true for delegateD, so RLS alone would let this reach the
    // trigger exactly like check 1 above; ownerA's auth.users row is still
    // live, so the narrow exception must not apply.
    const beforeD = await readShow(s1.id)
    const { error: errD } = await delegateD.client.from('shows').update({ created_by: null }).eq('id', s1.id)
    check('shows: accepted-delegate NULL attempt rejected by the same trigger message (user still exists)', !!errD?.message?.includes(TRIGGER_MSG_SHOW), JSON.stringify(errD))
    const afterD = await readShow(s1.id)
    check('shows: row completely unchanged (delegate NULL attempt)', rowsEqual(beforeD, afterD))

    // Same check for service_role — bypasses RLS entirely, so this
    // isolates the trigger's own NOT EXISTS(auth.users) check as the only
    // thing standing between "user still exists" and "allow the NULL."
    const beforeSR = await readShow(s1.id)
    const { error: errSR } = await service.from('shows').update({ created_by: null }).eq('id', s1.id)
    check('shows: service_role NULL attempt rejected by the same trigger message (user still exists)', !!errSR?.message?.includes(TRIGGER_MSG_SHOW), JSON.stringify(errSR))
    const afterSR = await readShow(s1.id)
    check('shows: row completely unchanged (service_role NULL attempt)', rowsEqual(beforeSR, afterSR))
  }

  console.log('\n4. service_role update cannot accidentally reassign ownership (no bypass)')
  {
    const before = await readPerformance(p1.id)
    const { error } = await service.from('performances').update({ user_id: ownerC.userId }).eq('id', p1.id)
    check('performances: rejected even for service_role', !!error?.message?.includes(TRIGGER_MSG_PERF), JSON.stringify(error))
    const after = await readPerformance(p1.id)
    check('performances: row completely unchanged', rowsEqual(before, after))

    const beforeS = await readShow(s1.id)
    const { error: errS } = await service.from('shows').update({ created_by: ownerC.userId }).eq('id', s1.id)
    check('shows: rejected even for service_role', !!errS?.message?.includes(TRIGGER_MSG_SHOW), JSON.stringify(errS))
    const afterS = await readShow(s1.id)
    check('shows: row completely unchanged', rowsEqual(beforeS, afterS))
  }

  console.log('\n5. Rejected ownership change bundled with other field changes leaves the ENTIRE row unchanged')
  {
    const before = await readPerformance(p1.id)
    const { error } = await ownerA.client.from('performances').update({ user_id: ownerC.userId, venue_name: 'Should Not Apply' }).eq('id', p1.id)
    check('performances: bundled update rejected', !!error?.message?.includes(TRIGGER_MSG_PERF), JSON.stringify(error))
    const after = await readPerformance(p1.id)
    check('performances: entire row unchanged, including the unrelated field', rowsEqual(before, after), `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)

    const beforeS = await readShow(s1.id)
    const { error: errS } = await ownerA.client.from('shows').update({ created_by: ownerC.userId, status: 'completed' }).eq('id', s1.id)
    check('shows: bundled update rejected', !!errS?.message?.includes(TRIGGER_MSG_SHOW), JSON.stringify(errS))
    const afterS = await readShow(s1.id)
    check('shows: entire row unchanged, including the unrelated field', rowsEqual(beforeS, afterS), `before=${JSON.stringify(beforeS)} after=${JSON.stringify(afterS)}`)
  }

  console.log('\n6. Update that re-sends the SAME ownership value (no-op) still works, alongside another field change')
  {
    const { data, error, count } = await ownerA.client.from('performances')
      .update({ user_id: ownerA.userId, venue_name: 'Venue One Renamed' })
      .eq('id', p1.id).select()
    check('performances: no-op ownership update succeeds', !error, JSON.stringify(error))
    check('performances: exactly one row affected', (data?.length ?? 0) === 1)
    const after = await readPerformance(p1.id)
    check('performances: unrelated field actually updated, ownership unchanged', after?.venue_name === 'Venue One Renamed' && after?.user_id === ownerA.userId)

    // shows.status is constrained by the live shows_status_check
    // (scheduled, live, completed, cancelled) — reproduced in the local
    // fixture. s1 starts at 'live' (fixture creation); 'completed' is a
    // different valid value, checked explicitly against the pre-update
    // read so this proves an actual change, not just a non-error response.
    const beforeS6 = await readShow(s1.id)
    const { data: dataS, error: errS } = await ownerA.client.from('shows')
      .update({ created_by: ownerA.userId, status: 'completed' })
      .eq('id', s1.id).select()
    check('shows: no-op ownership update succeeds', !errS, JSON.stringify(errS))
    check('shows: exactly one row affected', (dataS?.length ?? 0) === 1)
    const afterS = await readShow(s1.id)
    check('shows: unrelated field actually changed from its previous value, ownership unchanged',
      afterS?.status === 'completed' && beforeS6?.status !== 'completed' && afterS?.created_by === ownerA.userId,
      `before=${beforeS6?.status} after=${afterS?.status}`)
  }

  console.log('\n7. Legitimate owner and accepted-delegate edits (no ownership field touched) still work')
  {
    const { data, error } = await ownerA.client.from('performances').update({ venue_name: 'Owner Edit' }).eq('id', p1.id).select()
    check('performances: owner edit succeeds', !error && (data?.length ?? 0) === 1, JSON.stringify(error))

    const { data: dData, error: dError } = await delegateD.client.from('performances').update({ venue_name: 'Delegate Edit' }).eq('id', p1.id).select()
    check('performances: accepted-delegate edit succeeds', !dError && (dData?.length ?? 0) === 1, JSON.stringify(dError))
    const after = await readPerformance(p1.id)
    check('performances: delegate edit actually persisted', after?.venue_name === 'Delegate Edit')

    // s1.status is 'completed' at this point (from check 6). 'cancelled'
    // and 'scheduled' are the two remaining valid shows_status_check
    // values, each distinct from what precedes it.
    const beforeOwnerEdit = await readShow(s1.id)
    const { data: sData, error: sError } = await ownerA.client.from('shows').update({ status: 'cancelled' }).eq('id', s1.id).select()
    check('shows: owner edit succeeds', !sError && (sData?.length ?? 0) === 1, JSON.stringify(sError))
    const afterOwnerEdit = await readShow(s1.id)
    check('shows: owner edit actually changed status from its previous value',
      afterOwnerEdit?.status === 'cancelled' && beforeOwnerEdit?.status !== 'cancelled',
      `before=${beforeOwnerEdit?.status} after=${afterOwnerEdit?.status}`)

    const { data: sdData, error: sdError } = await delegateD.client.from('shows').update({ status: 'scheduled' }).eq('id', s1.id).select()
    check('shows: accepted-delegate edit succeeds', !sdError && (sdData?.length ?? 0) === 1, JSON.stringify(sdError))
    const afterS = await readShow(s1.id)
    check('shows: delegate edit actually changed status from its previous value',
      afterS?.status === 'scheduled' && afterOwnerEdit?.status !== 'scheduled',
      `before=${afterOwnerEdit?.status} after=${afterS?.status}`)
  }

  console.log('\n8. Legitimate inserts (owner, and delegate creating on behalf of the artist) still work')
  {
    const { data, error } = await ownerA.client.from('performances').insert({ user_id: ownerA.userId, venue_name: 'Owner Insert' }).select().single()
    check('performances: owner insert succeeds', !error && !!data, JSON.stringify(error))

    const { data: dData, error: dError } = await delegateD.client.from('performances').insert({ user_id: ownerA.userId, venue_name: 'Delegate Insert For Artist' }).select().single()
    check('performances: delegate insert on behalf of artist succeeds', !dError && !!dData, JSON.stringify(dError))

    const { data: sData, error: sError } = await ownerA.client.from('shows').insert({ created_by: ownerA.userId, status: 'live' }).select().single()
    check('shows: owner insert succeeds', !sError && !!sData, JSON.stringify(sError))

    const { data: sdData, error: sdError } = await delegateD.client.from('shows').insert({ created_by: ownerA.userId, status: 'live' }).select().single()
    check('shows: delegate insert on behalf of artist succeeds', !sdError && !!sdData, JSON.stringify(sdError))
  }

  console.log('\n9. Actual Auth deletion succeeds and leaves the surviving show\'s owner NULL')
  let orphanedShowId = ''
  {
    const ownerF = await createPersona('ownerF')
    const { data: showF, error: showFErr } = await ownerF.client.from('shows').insert({ created_by: ownerF.userId, status: 'live' }).select().single()
    if (showFErr || !showF) throw new Error(`ownerF show insert failed: ${showFErr?.message}`)
    orphanedShowId = showF.id
    extraShowIdsToClean.push(orphanedShowId)

    const { error: delErr } = await service.auth.admin.deleteUser(ownerF.userId)
    check('auth.admin.deleteUser succeeds while the user still owns a show', !delErr, JSON.stringify(delErr))

    // Confirmed empirically against this local GoTrue: both a genuinely
    // deleted user and an id that never existed return the exact same
    // shape — { data: { user: null }, error: { status: 404,
    // code: 'user_not_found' } }. A different failure (network error,
    // rate limit, malformed id) would surface as a DIFFERENT error, not
    // this one — so checking specifically for code === 'user_not_found'
    // is what distinguishes "confirmed absent" from "the request simply
    // failed," which a bare `!data?.user` check cannot do (any failed
    // request also leaves data.user falsy).
    const { data: lookupData, error: lookupErr } = await service.auth.admin.getUserById(ownerF.userId)
    const confirmedDeleted = !lookupData?.user && lookupErr?.code === 'user_not_found'
    check('the deleted user is confirmed absent via the explicit user_not_found response', confirmedDeleted, JSON.stringify({ data: lookupData, error: lookupErr }))

    const after = await readShow(showF.id)
    check('surviving show\'s created_by is now NULL', after?.created_by === null, JSON.stringify(after))

    // Only stop tracking ownerF for the normal per-persona cleanup once
    // deletion is actually confirmed above — if either check failed,
    // ownerF stays in createdUserIds so cleanup() still retries deleting
    // both their auth user and profile at the end, rather than silently
    // leaking them because a mid-test assertion (not cleanup) failed.
    if (!delErr && confirmedDeleted) {
      // ownerF's auth.users row is confirmed gone — remove it from the
      // normal per-persona list so cleanup() doesn't try to delete a
      // nonexistent auth user again. Its profile row and the now-orphaned
      // show both fall outside that list's reach from here on (the
      // show's created_by is NULL; the profile's id is no longer in
      // createdUserIds) — tracked separately so cleanup() still removes them.
      const idx = createdUserIds.indexOf(ownerF.userId)
      if (idx !== -1) createdUserIds.splice(idx, 1)
      extraProfileIdsToClean.push(ownerF.userId)
    }
  }

  console.log('\n10. An orphaned show cannot subsequently be assigned to another owner')
  {
    const before = await readShow(orphanedShowId)
    check('fixture sanity: orphaned show really has a NULL owner', before?.created_by === null)
    // Issued as service_role — can_act_for(NULL) is always false, so an
    // ordinary authenticated caller couldn't even target this row under
    // RLS (0 rows, not an error). service_role bypasses that filtering,
    // isolating the trigger itself as the thing being tested here, same
    // reasoning as check 4 above.
    const { error } = await service.from('shows').update({ created_by: ownerA.userId }).eq('id', orphanedShowId)
    check('NULL -> non-NULL reassignment rejected by the same trigger message', !!error?.message?.includes(TRIGGER_MSG_SHOW), JSON.stringify(error))
    const after = await readShow(orphanedShowId)
    check('orphaned show completely unchanged, still NULL', rowsEqual(before, after))
  }

  console.log('\n11. Profile deletion still cascades to performances via the existing FK (unaffected by this trigger — DELETE, not UPDATE)')
  {
    const ownerG = await createPersona('ownerG')
    const { data: perfG, error: perfGErr } = await ownerG.client.from('performances').insert({ user_id: ownerG.userId, venue_name: 'Cascade Check' }).select().single()
    if (perfGErr || !perfG) throw new Error(`ownerG performance insert failed: ${perfGErr?.message}`)

    const { error: profDelErr } = await service.from('profiles').delete().eq('id', ownerG.userId)
    check('profiles delete succeeds', !profDelErr, JSON.stringify(profDelErr))

    // A failed readback query (permission issue, network blip) also
    // returns data: null — indistinguishable from "genuinely absent"
    // unless the query's own error is checked too. Require the read
    // itself to have succeeded (no error) as part of proving absence.
    const { data: profAfter, error: profAfterErr } = await service.from('profiles').select('id').eq('id', ownerG.userId).maybeSingle()
    check('profile actually gone (readback succeeded and found nothing)', !profAfterErr && !profAfter, JSON.stringify({ data: profAfter, error: profAfterErr }))

    const { data: perfAfter, error: perfAfterErr } = await service.from('performances').select('id').eq('id', perfG.id).maybeSingle()
    check('performances.user_id -> profiles(id) ON DELETE CASCADE still deletes the performance row (readback succeeded and found nothing, not just nulls it)', !perfAfterErr && !perfAfter, JSON.stringify({ data: perfAfter, error: perfAfterErr }))
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
