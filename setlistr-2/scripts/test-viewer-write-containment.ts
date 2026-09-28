// Real Postgres/PostgREST-level AND real-HTTP-level tests for viewer-write
// containment (0016_viewer_write_containment.sql, plus lib/writeCapableRoles.ts's
// shared isWriteCapableRole() check, applied identically in all three
// service-role performance-mutation routes it's imported into:
// app/api/upload-performance/route.ts (POST/PATCH) and
// app/api/performances/[id]/delete/route.ts (+ its /undo). These three
// routes mutate performances/shows (and, via upload-performance's PATCH,
// performance_songs) — they do not write to artist_delegates itself, which
// 0010 already confined to service-role-only paths; each performs only a
// SELECT lookup against artist_delegates to authorize its own mutation.
//
// NOT full capability enforcement — this only tests the single coarse
// boundary: manager/tour_manager/band_member may write, viewer/unknown/
// pending/revoked may not. READ access is completely unchanged by this
// patch for every role including unknown/viewer — can_act_for() itself was
// not modified and still does not consult role at all.
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
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-viewer-write-containment.ts

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import * as crypto from 'crypto'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'
import { isWriteCapableRole } from '../lib/writeCapableRoles'

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
const createdArtistIds: string[] = []
const createdShowIds: string[] = []
const createdSetlistIds: string[] = []
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
function checkUnchanged(label: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  check(`${label}: before/after rows both exist`, before !== null && after !== null, `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
  check(`${label}: complete row match`, rowsEqual(before, after), `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
}

interface Persona {
  label: string
  userId: string
  client: SupabaseClient
  cookieHeader: () => string
}

async function createPersona(label: string): Promise<Persona> {
  const email = `viewerwrite-${RUN}-${label}@example.test`.toLowerCase()
  const password = crypto.randomBytes(18).toString('base64url')
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser failed for ${label}: ${error?.message}`)
  const userId = data.user.id
  createdUserIds.push(userId)
  unwrap<{ id: string }>(await service.from('profiles').insert({ id: userId, full_name: label, email }).select().single(), `profile for ${label}`)

  const client = createClient(SUPABASE_URL, ANON_KEY)
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password })
  if (signInErr) throw new Error(`sign-in failed for ${label}: ${signInErr.message}`)

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

  return { label, userId, client, cookieHeader: () => Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ') }
}

async function seedDelegation(opts: { artistId: string; delegateId: string; role: string; accepted: boolean; revoked?: boolean }) {
  const row = unwrap<{ id: string }>(await service.from('artist_delegates').insert({
    artist_id: opts.artistId,
    delegate_id: opts.delegateId,
    role: opts.role,
    accepted_at: opts.accepted ? new Date().toISOString() : null,
    revoked_at: opts.revoked ? new Date().toISOString() : null,
  }).select().single(), 'seedDelegation')
  createdDelegationIds.push(row.id)
  return row.id
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

async function main() {
  console.log(`Run ${RUN} — DB ${SUPABASE_URL}, app ${APP_URL}\n`)

  const ownerA = await createPersona('ownerA')
  const manager = await createPersona('manager')
  const tourManager = await createPersona('tourManager')
  const bandMember = await createPersona('bandMember')
  const viewer = await createPersona('viewer')
  const unknownRole = await createPersona('unknownRole')
  const pending = await createPersona('pending')
  const revoked = await createPersona('revoked')

  await seedDelegation({ artistId: ownerA.userId, delegateId: manager.userId, role: 'manager', accepted: true })
  await seedDelegation({ artistId: ownerA.userId, delegateId: tourManager.userId, role: 'tour_manager', accepted: true })
  await seedDelegation({ artistId: ownerA.userId, delegateId: bandMember.userId, role: 'band_member', accepted: true })
  await seedDelegation({ artistId: ownerA.userId, delegateId: viewer.userId, role: 'viewer', accepted: true })
  await seedDelegation({ artistId: ownerA.userId, delegateId: unknownRole.userId, role: 'some_future_role', accepted: true })
  await seedDelegation({ artistId: ownerA.userId, delegateId: pending.userId, role: 'manager', accepted: false })
  await seedDelegation({ artistId: ownerA.userId, delegateId: revoked.userId, role: 'manager', accepted: true, revoked: true })

  const WRITE_OK: [string, Persona][] = [['owner', ownerA], ['manager', manager], ['tour_manager', tourManager], ['band_member', bandMember]]
  const WRITE_DENIED: [string, Persona][] = [['viewer', viewer], ['unknown_role', unknownRole], ['pending', pending], ['revoked', revoked]]
  const READ_OK: [string, Persona][] = [...WRITE_OK, ['viewer', viewer]]

  console.log('\n=== SQL/TS parity: isWriteCapableRole() vs. can_write_for()\'s role allowlist ===')
  console.log('    (role dimension only — isolated from accepted/revoked, which are exercised')
  console.log('     independently in the DB tests below via the same accepted+non-revoked')
  console.log('     manager/tour_manager/band_member/viewer/unknown_role personas)')
  {
    const roleParity: [string, boolean][] = [
      ['manager', true], ['tour_manager', true], ['band_member', true],
      ['viewer', false], ['some_future_role', false],
    ]
    for (const [role, expected] of roleParity) {
      check(`isWriteCapableRole('${role}') === ${expected} (matches can_write_for()'s role IN (...) list)`, isWriteCapableRole(role) === expected)
    }
    check('isWriteCapableRole(null) === false (matches NULL IN (...) being non-matching in can_write_for())', isWriteCapableRole(null) === false)
    check('isWriteCapableRole(undefined) === false', isWriteCapableRole(undefined) === false)
  }

  const artistA = unwrap<{ id: string }>(await service.from('artists').insert({ user_id: ownerA.userId }).select().single(), 'artistA')
  createdArtistIds.push(artistA.id)
  const showA = unwrap<{ id: string }>(await service.from('shows').insert({ created_by: ownerA.userId }).select().single(), 'showA')
  createdShowIds.push(showA.id)
  const setlistA = unwrap<{ id: string }>(await service.from('setlists').insert({ show_id: showA.id, artist_id: artistA.id }).select().single(), 'setlistA')
  createdSetlistIds.push(setlistA.id)
  const perfA = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: `Fixture ${RUN}`, show_id: showA.id }).select().single(), 'perfA')
  createdPerformanceIds.push(perfA.id)

  // ── performances ──────────────────────────────────────────────────────
  console.log('\n=== performances ===')
  for (const [label, persona] of READ_OK) {
    const { data, error } = await persona.client.from('performances').select('id').eq('id', perfA.id)
    check(`${label}: SELECT performances succeeds with no error`, !error, JSON.stringify(error))
    check(`${label}: SELECT performances returns the row`, (data?.length ?? 0) === 1, JSON.stringify(data))
  }
  for (const [label, persona] of WRITE_DENIED) {
    const venue = `Perf Insert Denied ${label} ${RUN}`
    const { data: ins, error: insErr } = await persona.client.from('performances').insert({ user_id: ownerA.userId, venue_name: venue, show_id: showA.id }).select()
    check(`${label}: performances INSERT denied`, !ins || ins.length === 0, JSON.stringify({ ins, insErr }))
    const { data: stored, error: storedErr } = await service.from('performances').select('id').eq('venue_name', venue)
    check(`${label}: performances INSERT denial readback succeeded`, !storedErr, JSON.stringify(storedErr))
    check(`${label}: performances INSERT denial left no stored row`, (stored?.length ?? 0) === 0, JSON.stringify(stored))

    const before = await service.from('performances').select('*').eq('id', perfA.id).maybeSingle()
    check(`${label}: performances UPDATE before-readback succeeded`, !before.error, JSON.stringify(before.error))
    const { data: upd, error: updErr } = await persona.client.from('performances').update({ venue_name: `Hacked ${label} ${RUN}` }).eq('id', perfA.id).select()
    check(`${label}: performances UPDATE denied (zero rows)`, (upd?.length ?? -1) === 0, JSON.stringify({ upd, updErr }))
    const after = await service.from('performances').select('*').eq('id', perfA.id).maybeSingle()
    check(`${label}: performances UPDATE after-readback succeeded`, !after.error, JSON.stringify(after.error))
    checkUnchanged(`${label}: performances UPDATE`, before.data, after.data)

    const perfTemp = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: `Perf Delete Denied ${label} ${RUN}`, show_id: showA.id }).select().single(), `perfTemp for ${label} delete-denial`)
    createdPerformanceIds.push(perfTemp.id)
    const { data: del, error: delErr } = await persona.client.from('performances').delete().eq('id', perfTemp.id).select()
    check(`${label}: performances DELETE denied (zero rows)`, (del?.length ?? -1) === 0, JSON.stringify({ del, delErr }))
    const { data: stillThere, error: readErr } = await service.from('performances').select('id').eq('id', perfTemp.id).maybeSingle()
    check(`${label}: performances DELETE denial readback succeeded`, !readErr, JSON.stringify(readErr))
    check(`${label}: performances DELETE denial left row present`, !!stillThere, JSON.stringify(stillThere))
  }
  for (const [label, persona] of WRITE_OK) {
    const venue = `Perf Insert OK ${label} ${RUN}`
    const { data, error } = await persona.client.from('performances').insert({ user_id: ownerA.userId, venue_name: venue, show_id: showA.id }).select().single()
    check(`${label}: performances INSERT succeeds`, !error && !!data, JSON.stringify(error))
    if (data) createdPerformanceIds.push((data as any).id)
    if (data) {
      const { data: upd, error: updErr } = await persona.client.from('performances').update({ venue_name: `Edited by ${label} ${RUN}` }).eq('id', (data as any).id).select()
      check(`${label}: performances UPDATE succeeds`, !updErr && (upd?.length ?? 0) === 1, JSON.stringify(updErr))
    }
    const perfTempOk = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: `Perf Delete OK ${label} ${RUN}`, show_id: showA.id }).select().single(), `perfTempOk for ${label} delete-ok`)
    const { data: del, error: delErr } = await persona.client.from('performances').delete().eq('id', perfTempOk.id).select()
    check(`${label}: performances DELETE succeeds`, !delErr && (del?.length ?? 0) === 1, JSON.stringify(delErr))
  }

  // ── shows ─────────────────────────────────────────────────────────────
  console.log('\n=== shows ===')
  for (const [label, persona] of READ_OK) {
    const { data, error } = await persona.client.from('shows').select('id').eq('id', showA.id)
    check(`${label}: SELECT shows succeeds with no error`, !error, JSON.stringify(error))
    check(`${label}: SELECT shows returns the row`, (data?.length ?? 0) === 1, JSON.stringify(data))
  }
  for (const [label, persona] of WRITE_DENIED) {
    const { data: ins, error: insErr } = await persona.client.from('shows').insert({ created_by: ownerA.userId }).select()
    check(`${label}: shows INSERT denied`, !ins || ins.length === 0, JSON.stringify({ ins, insErr }))
    if (ins && ins.length > 0) createdShowIds.push((ins[0] as any).id)

    const before = await service.from('shows').select('*').eq('id', showA.id).maybeSingle()
    check(`${label}: shows UPDATE before-readback succeeded`, !before.error, JSON.stringify(before.error))
    const { data: upd, error: updErr } = await persona.client.from('shows').update({ status: 'hacked' }).eq('id', showA.id).select()
    check(`${label}: shows UPDATE denied (zero rows)`, (upd?.length ?? -1) === 0, JSON.stringify({ upd, updErr }))
    const after = await service.from('shows').select('*').eq('id', showA.id).maybeSingle()
    check(`${label}: shows UPDATE after-readback succeeded`, !after.error, JSON.stringify(after.error))
    checkUnchanged(`${label}: shows UPDATE`, before.data, after.data)

    const showTemp = unwrap<{ id: string }>(await service.from('shows').insert({ created_by: ownerA.userId }).select().single(), `showTemp for ${label} delete-denial`)
    createdShowIds.push(showTemp.id)
    const { data: del, error: delErr } = await persona.client.from('shows').delete().eq('id', showTemp.id).select()
    check(`${label}: shows DELETE denied (zero rows)`, (del?.length ?? -1) === 0, JSON.stringify({ del, delErr }))
    const { data: stillThere, error: readErr } = await service.from('shows').select('id').eq('id', showTemp.id).maybeSingle()
    check(`${label}: shows DELETE denial readback succeeded`, !readErr, JSON.stringify(readErr))
    check(`${label}: shows DELETE denial left row present`, !!stillThere, JSON.stringify(stillThere))
  }
  for (const [label, persona] of WRITE_OK) {
    const { data, error } = await persona.client.from('shows').insert({ created_by: ownerA.userId }).select().single()
    check(`${label}: shows INSERT succeeds`, !error && !!data, JSON.stringify(error))
    if (data) createdShowIds.push((data as any).id)
    if (data) {
      const { data: upd, error: updErr } = await persona.client.from('shows').update({ status: 'completed' }).eq('id', (data as any).id).select()
      check(`${label}: shows UPDATE succeeds`, !updErr && (upd?.length ?? 0) === 1, JSON.stringify(updErr))
    }
    const showTempOk = unwrap<{ id: string }>(await service.from('shows').insert({ created_by: ownerA.userId }).select().single(), `showTempOk for ${label} delete-ok`)
    const { data: del, error: delErr } = await persona.client.from('shows').delete().eq('id', showTempOk.id).select()
    check(`${label}: shows DELETE succeeds`, !delErr && (del?.length ?? 0) === 1, JSON.stringify(delErr))
  }

  // ── setlists (INSERT/DELETE only — no safe mutable field exists on this
  //    table for an UPDATE test independent of 0013's artist_id/show_id
  //    immutability trigger, which would confound the result) ────────────
  console.log('\n=== setlists (INSERT/DELETE only — see note above) ===')
  for (const [label, persona] of READ_OK) {
    const { data, error } = await persona.client.from('setlists').select('id').eq('id', setlistA.id)
    check(`${label}: SELECT setlists succeeds with no error`, !error, JSON.stringify(error))
    check(`${label}: SELECT setlists returns the row`, (data?.length ?? 0) === 1, JSON.stringify(data))
  }
  for (const [label, persona] of WRITE_DENIED) {
    const { data: ins, error: insErr } = await persona.client.from('setlists').insert({ show_id: showA.id, artist_id: artistA.id }).select()
    check(`${label}: setlists INSERT denied`, !ins || ins.length === 0, JSON.stringify({ ins, insErr }))
    if (ins && ins.length > 0) createdSetlistIds.push((ins[0] as any).id)

    // Distinct artist per iteration — setlists has UNIQUE(show_id, artist_id).
    const artistTemp = unwrap<{ id: string }>(await service.from('artists').insert({ user_id: ownerA.userId }).select().single(), `artistTemp for ${label} delete-denial`)
    createdArtistIds.push(artistTemp.id)
    const setlistTemp = unwrap<{ id: string }>(await service.from('setlists').insert({ show_id: showA.id, artist_id: artistTemp.id }).select().single(), `setlistTemp for ${label} delete-denial`)
    createdSetlistIds.push(setlistTemp.id)
    const { data: del, error: delErr } = await persona.client.from('setlists').delete().eq('id', setlistTemp.id).select()
    check(`${label}: setlists DELETE denied (zero rows)`, (del?.length ?? -1) === 0, JSON.stringify({ del, delErr }))
    const { data: stillThere, error: readErr } = await service.from('setlists').select('id').eq('id', setlistTemp.id).maybeSingle()
    check(`${label}: setlists DELETE denial readback succeeded`, !readErr, JSON.stringify(readErr))
    check(`${label}: setlists DELETE denial left row present`, !!stillThere, JSON.stringify(stillThere))
  }
  for (const [label, persona] of WRITE_OK) {
    // Distinct artist per iteration — setlists has UNIQUE(show_id, artist_id),
    // and artistA is already used by the baseline setlistA fixture.
    const artistTempOk = unwrap<{ id: string }>(await service.from('artists').insert({ user_id: ownerA.userId }).select().single(), `artistTemp for ${label} insert-ok`)
    createdArtistIds.push(artistTempOk.id)
    const { data, error } = await persona.client.from('setlists').insert({ show_id: showA.id, artist_id: artistTempOk.id }).select().single()
    check(`${label}: setlists INSERT succeeds`, !error && !!data, JSON.stringify(error))
    if (data) createdSetlistIds.push((data as any).id)
    if (data) {
      const { data: del, error: delErr } = await persona.client.from('setlists').delete().eq('id', (data as any).id).select()
      check(`${label}: setlists DELETE succeeds`, !delErr && (del?.length ?? 0) === 1, JSON.stringify(delErr))
    }
  }

  // ── setlists: real status UPDATE (draft/review/confirmed), verifying the
  //    0013-locked links (show_id, artist_id) stay untouched — this is the
  //    mutable field the earlier note said didn't exist; it does, so it's
  //    tested here explicitly instead of being skipped. ───────────────────
  console.log("\n=== setlists: status UPDATE ('draft' -> 'confirmed') — link columns must stay unchanged ===")
  for (const [label, persona] of WRITE_DENIED) {
    const artistStatusDenied = unwrap<{ id: string }>(await service.from('artists').insert({ user_id: ownerA.userId }).select().single(), `artist for ${label} status-denial`)
    createdArtistIds.push(artistStatusDenied.id)
    const setlistStatusDenied = unwrap<{ id: string }>(await service.from('setlists').insert({ show_id: showA.id, artist_id: artistStatusDenied.id, status: 'draft' }).select().single(), `setlist for ${label} status-denial`)
    createdSetlistIds.push(setlistStatusDenied.id)

    const before = await service.from('setlists').select('*').eq('id', setlistStatusDenied.id).maybeSingle()
    check(`${label}: setlists status UPDATE before-readback succeeded`, !before.error, JSON.stringify(before.error))
    const { data: upd, error: updErr } = await persona.client.from('setlists').update({ status: 'confirmed' }).eq('id', setlistStatusDenied.id).select()
    check(`${label}: setlists status UPDATE denied (zero rows)`, (upd?.length ?? -1) === 0, JSON.stringify({ upd, updErr }))
    const after = await service.from('setlists').select('*').eq('id', setlistStatusDenied.id).maybeSingle()
    check(`${label}: setlists status UPDATE after-readback succeeded`, !after.error, JSON.stringify(after.error))
    checkUnchanged(`${label}: setlists status UPDATE (full row, including links)`, before.data, after.data)
  }
  for (const [label, persona] of WRITE_OK) {
    const artistStatusOk = unwrap<{ id: string }>(await service.from('artists').insert({ user_id: ownerA.userId }).select().single(), `artist for ${label} status-ok`)
    createdArtistIds.push(artistStatusOk.id)
    const setlistStatusOk = unwrap<{ id: string }>(await service.from('setlists').insert({ show_id: showA.id, artist_id: artistStatusOk.id, status: 'draft' }).select().single(), `setlist for ${label} status-ok`)
    createdSetlistIds.push(setlistStatusOk.id)

    const before = await service.from('setlists').select('*').eq('id', setlistStatusOk.id).maybeSingle()
    check(`${label}: setlists status UPDATE (write-capable) before-readback succeeded`, !before.error, JSON.stringify(before.error))
    const { data: upd, error: updErr } = await persona.client.from('setlists').update({ status: 'confirmed' }).eq('id', setlistStatusOk.id).select()
    check(`${label}: setlists status UPDATE succeeds`, !updErr && (upd?.length ?? 0) === 1, JSON.stringify(updErr))
    const after = await service.from('setlists').select('*').eq('id', setlistStatusOk.id).maybeSingle()
    check(`${label}: setlists status UPDATE after-readback succeeded`, !after.error, JSON.stringify(after.error))
    check(`${label}: setlists status actually persisted as 'confirmed'`, after.data?.status === 'confirmed', JSON.stringify(after.data))
    check(`${label}: setlists status UPDATE left show_id (locked link) unchanged`, before.data?.show_id === after.data?.show_id, JSON.stringify({ before: before.data, after: after.data }))
    check(`${label}: setlists status UPDATE left artist_id (locked link) unchanged`, before.data?.artist_id === after.data?.artist_id, JSON.stringify({ before: before.data, after: after.data }))
  }

  // ── performance_songs ────────────────────────────────────────────────
  console.log('\n=== performance_songs ===')
  const songBase = unwrap<{ id: string }>(await service.from('performance_songs').insert({ performance_id: perfA.id, title: `Base Song ${RUN}`, position: 1 }).select().single(), 'songBase')
  for (const [label, persona] of READ_OK) {
    const { data, error } = await persona.client.from('performance_songs').select('id').eq('id', songBase.id)
    check(`${label}: SELECT performance_songs succeeds with no error`, !error, JSON.stringify(error))
    check(`${label}: SELECT performance_songs returns the row`, (data?.length ?? 0) === 1, JSON.stringify(data))
  }
  for (const [label, persona] of WRITE_DENIED) {
    const { data: ins, error: insErr } = await persona.client.from('performance_songs').insert({ performance_id: perfA.id, title: `Denied Insert ${label} ${RUN}`, position: 2 }).select()
    check(`${label}: performance_songs INSERT denied`, !ins || ins.length === 0, JSON.stringify({ ins, insErr }))

    const before = await service.from('performance_songs').select('*').eq('id', songBase.id).maybeSingle()
    check(`${label}: performance_songs UPDATE before-readback succeeded`, !before.error, JSON.stringify(before.error))
    const { data: upd, error: updErr } = await persona.client.from('performance_songs').update({ title: `Hacked ${label} ${RUN}` }).eq('id', songBase.id).select()
    check(`${label}: performance_songs UPDATE denied (zero rows)`, (upd?.length ?? -1) === 0, JSON.stringify({ upd, updErr }))
    const after = await service.from('performance_songs').select('*').eq('id', songBase.id).maybeSingle()
    check(`${label}: performance_songs UPDATE after-readback succeeded`, !after.error, JSON.stringify(after.error))
    checkUnchanged(`${label}: performance_songs UPDATE`, before.data, after.data)

    const songTemp = unwrap<{ id: string }>(await service.from('performance_songs').insert({ performance_id: perfA.id, title: `Song Delete Denied ${label} ${RUN}`, position: 4 }).select().single(), `songTemp for ${label} delete-denial`)
    const { data: del, error: delErr } = await persona.client.from('performance_songs').delete().eq('id', songTemp.id).select()
    check(`${label}: performance_songs DELETE denied (zero rows)`, (del?.length ?? -1) === 0, JSON.stringify({ del, delErr }))
    const { data: stillThere, error: readErr } = await service.from('performance_songs').select('id').eq('id', songTemp.id).maybeSingle()
    check(`${label}: performance_songs DELETE denial readback succeeded`, !readErr, JSON.stringify(readErr))
    check(`${label}: performance_songs DELETE denial left row present`, !!stillThere, JSON.stringify(stillThere))
  }
  for (const [label, persona] of WRITE_OK) {
    const { data, error } = await persona.client.from('performance_songs').insert({ performance_id: perfA.id, title: `OK Insert ${label} ${RUN}`, position: 3 }).select().single()
    check(`${label}: performance_songs INSERT succeeds`, !error && !!data, JSON.stringify(error))
    if (data) {
      const { data: upd, error: updErr } = await persona.client.from('performance_songs').update({ title: `Edited by ${label} ${RUN}` }).eq('id', (data as any).id).select()
      check(`${label}: performance_songs UPDATE succeeds`, !updErr && (upd?.length ?? 0) === 1, JSON.stringify(updErr))
    }
    const songTempOk = unwrap<{ id: string }>(await service.from('performance_songs').insert({ performance_id: perfA.id, title: `Song Delete OK ${label} ${RUN}`, position: 5 }).select().single(), `songTempOk for ${label} delete-ok`)
    const { data: del, error: delErr } = await persona.client.from('performance_songs').delete().eq('id', songTempOk.id).select()
    check(`${label}: performance_songs DELETE succeeds`, !delErr && (del?.length ?? 0) === 1, JSON.stringify(delErr))
  }

  // ── setlist_items ────────────────────────────────────────────────────
  console.log('\n=== setlist_items ===')
  const itemBase = unwrap<{ id: string }>(await service.from('setlist_items').insert({ setlist_id: setlistA.id, title: `Base Item ${RUN}`, position: 1 }).select().single(), 'itemBase')
  for (const [label, persona] of READ_OK) {
    const { data, error } = await persona.client.from('setlist_items').select('id').eq('id', itemBase.id)
    check(`${label}: SELECT setlist_items succeeds with no error`, !error, JSON.stringify(error))
    check(`${label}: SELECT setlist_items returns the row`, (data?.length ?? 0) === 1, JSON.stringify(data))
  }
  for (const [label, persona] of WRITE_DENIED) {
    const { data: ins, error: insErr } = await persona.client.from('setlist_items').insert({ setlist_id: setlistA.id, title: `Denied Insert ${label} ${RUN}`, position: 2 }).select()
    check(`${label}: setlist_items INSERT denied`, !ins || ins.length === 0, JSON.stringify({ ins, insErr }))

    const before = await service.from('setlist_items').select('*').eq('id', itemBase.id).maybeSingle()
    check(`${label}: setlist_items UPDATE before-readback succeeded`, !before.error, JSON.stringify(before.error))
    const { data: upd, error: updErr } = await persona.client.from('setlist_items').update({ title: `Hacked ${label} ${RUN}` }).eq('id', itemBase.id).select()
    check(`${label}: setlist_items UPDATE denied (zero rows)`, (upd?.length ?? -1) === 0, JSON.stringify({ upd, updErr }))
    const after = await service.from('setlist_items').select('*').eq('id', itemBase.id).maybeSingle()
    check(`${label}: setlist_items UPDATE after-readback succeeded`, !after.error, JSON.stringify(after.error))
    checkUnchanged(`${label}: setlist_items UPDATE`, before.data, after.data)

    const itemTemp = unwrap<{ id: string }>(await service.from('setlist_items').insert({ setlist_id: setlistA.id, title: `Item Delete Denied ${label} ${RUN}`, position: 4 }).select().single(), `itemTemp for ${label} delete-denial`)
    const { data: del, error: delErr } = await persona.client.from('setlist_items').delete().eq('id', itemTemp.id).select()
    check(`${label}: setlist_items DELETE denied (zero rows)`, (del?.length ?? -1) === 0, JSON.stringify({ del, delErr }))
    const { data: stillThere, error: readErr } = await service.from('setlist_items').select('id').eq('id', itemTemp.id).maybeSingle()
    check(`${label}: setlist_items DELETE denial readback succeeded`, !readErr, JSON.stringify(readErr))
    check(`${label}: setlist_items DELETE denial left row present`, !!stillThere, JSON.stringify(stillThere))
  }
  for (const [label, persona] of WRITE_OK) {
    const { data, error } = await persona.client.from('setlist_items').insert({ setlist_id: setlistA.id, title: `OK Insert ${label} ${RUN}`, position: 3 }).select().single()
    check(`${label}: setlist_items INSERT succeeds`, !error && !!data, JSON.stringify(error))
    if (data) {
      const { data: upd, error: updErr } = await persona.client.from('setlist_items').update({ title: `Edited by ${label} ${RUN}` }).eq('id', (data as any).id).select()
      check(`${label}: setlist_items UPDATE succeeds`, !updErr && (upd?.length ?? 0) === 1, JSON.stringify(updErr))
    }
    const itemTempOk = unwrap<{ id: string }>(await service.from('setlist_items').insert({ setlist_id: setlistA.id, title: `Item Delete OK ${label} ${RUN}`, position: 5 }).select().single(), `itemTempOk for ${label} delete-ok`)
    const { data: del, error: delErr } = await persona.client.from('setlist_items').delete().eq('id', itemTempOk.id).select()
    check(`${label}: setlist_items DELETE succeeds`, !delErr && (del?.length ?? 0) === 1, JSON.stringify(delErr))
  }

  // ── HTTP: upload-performance POST/PATCH, performances/[id]/delete(/undo) ─
  console.log('\n=== HTTP: /api/upload-performance, /api/performances/[id]/delete, and its /undo ===')
  for (const [label, persona] of WRITE_OK) {
    const created = await callUploadPost(persona, ownerA.userId)
    check(`${label}: HTTP POST upload-performance succeeds`, created.status === 200 && !!created.json.performance_id, JSON.stringify(created))
    if (created.json.performance_id) createdPerformanceIds.push(created.json.performance_id)
    if (created.json.show_id) createdShowIds.push(created.json.show_id)
    if (created.json.performance_id) {
      const { status, json } = await callUploadPatch(persona, created.json.performance_id, `HTTP Patched by ${label} ${RUN}`)
      check(`${label}: HTTP PATCH upload-performance succeeds`, status === 200, JSON.stringify({ status, json }))
      const { status: delStatus, json: delJson } = await callDelete(persona, created.json.performance_id)
      check(`${label}: HTTP POST performances/[id]/delete succeeds`, delStatus === 200 && delJson.success === true, JSON.stringify({ delStatus, delJson }))
      const midway = await service.from('performances').select('deleted_at').eq('id', created.json.performance_id).maybeSingle()
      check(`${label}: readback after HTTP delete succeeded`, !midway.error, JSON.stringify(midway.error))
      check(`${label}: readback after HTTP delete confirms deleted_at set`, !!midway.data?.deleted_at, JSON.stringify(midway.data))

      const { status: undoStatus, json: undoJson } = await callUndo(persona, created.json.performance_id)
      check(`${label}: HTTP POST performances/[id]/delete/undo succeeds`, undoStatus === 200 && undoJson.success === true, JSON.stringify({ undoStatus, undoJson }))
      const restored = await service.from('performances').select('deleted_at').eq('id', created.json.performance_id).maybeSingle()
      check(`${label}: readback after HTTP undo succeeded`, !restored.error, JSON.stringify(restored.error))
      check(`${label}: readback after HTTP undo confirms deleted_at cleared`, restored.data?.deleted_at === null, JSON.stringify(restored.data))
    }
  }
  for (const [label, persona] of WRITE_DENIED) {
    const beforeCount = await service.from('performances').select('id', { count: 'exact', head: true }).eq('user_id', ownerA.userId)
    check(`${label}: before-count query succeeded`, !beforeCount.error, JSON.stringify(beforeCount.error))
    const { status, json } = await callUploadPost(persona, ownerA.userId)
    check(`${label}: HTTP POST upload-performance denied (403)`, status === 403, JSON.stringify({ status, json }))
    const afterCount = await service.from('performances').select('id', { count: 'exact', head: true }).eq('user_id', ownerA.userId)
    check(`${label}: after-count query succeeded`, !afterCount.error, JSON.stringify(afterCount.error))
    check(`${label}: HTTP POST upload-performance denial created no new row`, (afterCount.count ?? -1) === (beforeCount.count ?? -2), JSON.stringify({ before: beforeCount.count, after: afterCount.count }))

    const beforePerf = await service.from('performances').select('*').eq('id', perfA.id).maybeSingle()
    check(`${label}: delete before-readback succeeded`, !beforePerf.error, JSON.stringify(beforePerf.error))
    const { status: delStatus, json: delJson } = await callDelete(persona, perfA.id)
    check(`${label}: HTTP POST performances/[id]/delete denied (403)`, delStatus === 403, JSON.stringify({ delStatus, delJson }))
    const afterPerf = await service.from('performances').select('*').eq('id', perfA.id).maybeSingle()
    check(`${label}: delete after-readback succeeded`, !afterPerf.error, JSON.stringify(afterPerf.error))
    checkUnchanged(`${label}: HTTP delete denial`, beforePerf.data, afterPerf.data)

    const perfDeletedTemp = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: `Undo Denial ${label} ${RUN}`, show_id: showA.id, deleted_at: new Date().toISOString() }).select().single(), `perfDeletedTemp for ${label} undo-denial`)
    createdPerformanceIds.push(perfDeletedTemp.id)
    const beforeUndo = await service.from('performances').select('*').eq('id', perfDeletedTemp.id).maybeSingle()
    check(`${label}: undo before-readback succeeded`, !beforeUndo.error, JSON.stringify(beforeUndo.error))
    const { status: undoStatus, json: undoJson } = await callUndo(persona, perfDeletedTemp.id)
    check(`${label}: HTTP POST performances/[id]/delete/undo denied (403)`, undoStatus === 403, JSON.stringify({ undoStatus, undoJson }))
    const afterUndo = await service.from('performances').select('*').eq('id', perfDeletedTemp.id).maybeSingle()
    check(`${label}: undo after-readback succeeded`, !afterUndo.error, JSON.stringify(afterUndo.error))
    checkUnchanged(`${label}: HTTP undo denial`, beforeUndo.data, afterUndo.data)

    // PATCH denial: a fresh performance with a pre-existing song row, to
    // prove the denial leaves BOTH the performance and its songs untouched
    // — not just that the PATCH call itself returns 403.
    const perfPatchTemp = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: `Patch Denial ${label} ${RUN}`, show_id: showA.id }).select().single(), `perfPatchTemp for ${label} patch-denial`)
    createdPerformanceIds.push(perfPatchTemp.id)
    const songPatchTemp = unwrap<{ id: string }>(await service.from('performance_songs').insert({ performance_id: perfPatchTemp.id, title: `Patch Denial Song ${label} ${RUN}`, position: 1 }).select().single(), `songPatchTemp for ${label} patch-denial`)

    const beforePatchPerf = await service.from('performances').select('*').eq('id', perfPatchTemp.id).maybeSingle()
    check(`${label}: PATCH before-readback (performance) succeeded`, !beforePatchPerf.error, JSON.stringify(beforePatchPerf.error))
    const beforePatchShow = await service.from('shows').select('*').eq('id', showA.id).maybeSingle()
    check(`${label}: PATCH before-readback (show) succeeded`, !beforePatchShow.error, JSON.stringify(beforePatchShow.error))
    const beforePatchSong = await service.from('performance_songs').select('*').eq('id', songPatchTemp.id).maybeSingle()
    check(`${label}: PATCH before-readback (song) succeeded`, !beforePatchSong.error, JSON.stringify(beforePatchSong.error))

    const { status: patchStatus, json: patchJson } = await callUploadPatch(persona, perfPatchTemp.id, `Should Not Apply ${label} ${RUN}`)
    check(`${label}: HTTP PATCH upload-performance denied (403)`, patchStatus === 403, JSON.stringify({ patchStatus, patchJson }))

    const afterPatchPerf = await service.from('performances').select('*').eq('id', perfPatchTemp.id).maybeSingle()
    check(`${label}: PATCH after-readback (performance) succeeded`, !afterPatchPerf.error, JSON.stringify(afterPatchPerf.error))
    checkUnchanged(`${label}: HTTP PATCH denial (performance)`, beforePatchPerf.data, afterPatchPerf.data)
    const afterPatchShow = await service.from('shows').select('*').eq('id', showA.id).maybeSingle()
    check(`${label}: PATCH after-readback (show) succeeded`, !afterPatchShow.error, JSON.stringify(afterPatchShow.error))
    checkUnchanged(`${label}: HTTP PATCH denial (show)`, beforePatchShow.data, afterPatchShow.data)
    const afterPatchSong = await service.from('performance_songs').select('*').eq('id', songPatchTemp.id).maybeSingle()
    check(`${label}: PATCH after-readback (song) succeeded`, !afterPatchSong.error, JSON.stringify(afterPatchSong.error))
    checkUnchanged(`${label}: HTTP PATCH denial (song)`, beforePatchSong.data, afterPatchSong.data)
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
