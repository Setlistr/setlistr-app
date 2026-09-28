// Focused, direct-PostgREST tests for migration 0017
// (performances.artist_id reassignment lock) — NOT through any Next.js
// route; this suite doesn't need the dev server at all, only the local
// Supabase/Postgres stack. Scope is intentionally narrow: this migration
// and this one column, nothing else.
//
// Verifies:
//   1. The owner cannot PATCH artist_id to a different artist directly
//      via PostgREST — rejected, stored value unchanged.
//   2. A write-capable delegate (manager) cannot either.
//   3. A direct PATCH to NULL while the referenced artists row still
//      exists is rejected exactly like any other change (0017's null
//      exception is narrower than "any null write" — it only exempts a
//      null that arrives because the row is ACTUALLY gone).
//   4. An actual DELETE of the referenced artists row (simulating the
//      real FK cascade, not the lock) DOES null out
//      performances.artist_id via ON DELETE SET NULL — the lock's
//      narrow exception must not block that.
//
// Requires, already applied to the local fixture (see
// scripts/local-fixture-setup.sql and supabase/migrations/
// 0017_performance_artist_lock.sql — NEITHER is applied to production by
// this file or by running it):
//   - performances.artist_id
//   - performances_artist_id_fkey ... REFERENCES artists(id)
//     ON DELETE SET NULL
//   - reject_performance_link_change()'s artist_id branch (0017)
//
// HARD LOCALHOST GUARD: refuses to run unless the Supabase URL resolves
// to 127.0.0.1/localhost. No override.
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-performance-artist-lock.ts

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import * as crypto from 'crypto'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'

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
  console.error('REFUSING TO RUN: this harness only targets localhost.')
  console.error(`  NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL || '(unset)'}`)
  process.exit(1)
}
if (!ANON_KEY || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const service: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY)
const RUN = Date.now().toString(36)

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

interface Persona { label: string; userId: string; accessToken: () => string | null }
async function createPersona(label: string): Promise<Persona> {
  const email = `artistlock-${RUN}-${label}@example.test`.toLowerCase()
  const password = crypto.randomBytes(18).toString('base64url')
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser failed for ${label}: ${error?.message}`)
  const userId = data.user.id
  unwrap<{ id: string }>(await service.from('profiles').insert({ id: userId, full_name: label, email }).select().single(), `profile for ${label}`)

  const jar = new Map<string, string>()
  let latestToken: string | null = null
  const browserClient = createBrowserClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => Array.from(jar.entries()).map(([name, value]) => ({ name, value })),
      setAll: (c: { name: string; value: string }[]) => { for (const { name, value } of c) jar.set(name, value) },
    },
  })
  const { data: signInData, error: signInErr } = await browserClient.auth.signInWithPassword({ email, password })
  if (signInErr) throw new Error(`sign-in failed for ${label}: ${signInErr.message}`)
  latestToken = signInData.session?.access_token || null
  return { label, userId, accessToken: () => latestToken }
}

async function patchPerformance(token: string, performanceId: string, body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/performances?id=eq.${performanceId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${token}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

async function getArtistId(performanceId: string): Promise<string | null> {
  const { data, error } = await service.from('performances').select('artist_id').eq('id', performanceId).single()
  if (error) throw new Error(`getArtistId failed: ${error.message}`)
  return data.artist_id
}

async function main() {
  console.log(`Run ${RUN} — DB ${SUPABASE_URL}\n`)

  const owner = await createPersona('owner')
  const manager = await createPersona('manager')
  unwrap(await service.from('artist_delegates').insert({
    artist_id: owner.userId, delegate_id: manager.userId, role: 'manager', accepted_at: new Date().toISOString(),
  }).select().single(), 'seed manager delegation')

  const artistX = unwrap<{ id: string }>(await service.from('artists').insert({ user_id: owner.userId }).select().single(), 'artistX')
  const artistZ = unwrap<{ id: string }>(await service.from('artists').insert({ user_id: owner.userId }).select().single(), 'artistZ (reassignment target)')
  const show = unwrap<{ id: string }>(await service.from('shows').insert({ created_by: owner.userId }).select().single(), 'show')
  const perf = unwrap<{ id: string }>(await service.from('performances').insert({
    user_id: owner.userId, venue_name: `Artist Lock Fixture ${RUN}`, show_id: show.id, artist_id: artistX.id,
  }).select().single(), 'perf')

  // ── 1. Owner: direct PATCH artist_id -> a different artist ─────────────
  {
    const { status, json } = await patchPerformance(owner.accessToken()!, perf.id, { artist_id: artistZ.id })
    check('1. owner PATCH artist_id: rejected (not 2xx)', status >= 400, JSON.stringify({ status, json }))
    check('1. owner PATCH artist_id: stored value unchanged', (await getArtistId(perf.id)) === artistX.id)
  }

  // ── 2. Write-capable manager delegate: same attempt ─────────────────────
  {
    const { status, json } = await patchPerformance(manager.accessToken()!, perf.id, { artist_id: artistZ.id })
    check('2. manager PATCH artist_id: rejected (not 2xx)', status >= 400, JSON.stringify({ status, json }))
    check('2. manager PATCH artist_id: stored value unchanged', (await getArtistId(perf.id)) === artistX.id)
  }

  // ── 3. Direct PATCH to NULL while the referenced artists row STILL
  //    EXISTS — must be rejected exactly like any other change; 0017's
  //    exception only exempts a null that arrives because the row is
  //    ACTUALLY gone, not any caller-supplied null. ─────────────────────
  {
    const { status, json } = await patchPerformance(owner.accessToken()!, perf.id, { artist_id: null })
    check('3. owner PATCH artist_id -> null (artist still exists): rejected (not 2xx)', status >= 400, JSON.stringify({ status, json }))
    check('3. owner PATCH artist_id -> null (artist still exists): stored value unchanged', (await getArtistId(perf.id)) === artistX.id)
  }

  // ── 4. Real FK cascade: DELETE the referenced artists row (service
  //    role, simulating the genuine deletion path — not a caller PATCH)
  //    and confirm ON DELETE SET NULL is NOT blocked by the lock. ────────
  {
    const { error: delErr } = await service.from('artists').delete().eq('id', artistX.id)
    check('4. deleting the referenced artists row succeeds (lock does not block the FK cascade)', !delErr, JSON.stringify(delErr))
    check('4. performances.artist_id was nulled by the FK cascade', (await getArtistId(perf.id)) === null)
  }

  console.log(`\n${pass} passed, ${fail} failed`)

  // Cleanup
  await service.from('performances').delete().eq('id', perf.id)
  await service.from('shows').delete().eq('id', show.id)
  await service.from('artists').delete().eq('id', artistZ.id) // artistX already deleted in step 4
  await service.from('artist_delegates').delete().eq('artist_id', owner.userId).eq('delegate_id', manager.userId)
  for (const p of [owner, manager]) {
    await service.from('profiles').delete().eq('id', p.userId)
    await service.auth.admin.deleteUser(p.userId)
  }

  if (fail > 0) process.exit(1)
}

main().catch(async (err) => {
  console.error('Harness error:', err)
  process.exit(1)
})
