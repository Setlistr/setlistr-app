// Real HTTP-level test for /api/upload-performance's PATCH (finalize) —
// verifies the actual root-cause fix for the Upload Performance date
// mismatch: the draft performance's `started_at` is set to "now" (upload
// time) at create-draft, before the artist has entered the real show date.
// The finalize PATCH previously updated `performance_date` but never
// `started_at` — and every other screen (review, dashboard, history, the
// claim sheet) reads started_at as the show's date, not performance_date.
// This test PATCHes with a date nowhere near "now" and asserts the
// PERSISTED started_at (read directly from the DB via the service client,
// not just the HTTP response) actually reflects it — the exact class of
// bug that can't be caught by checking the API's 200 response alone.
//
// Also verifies the venue_city write (part of the geocode-disambiguation
// fix — a historical upload's location must be attributable to the venue
// the artist actually typed, not left blank).
//
// Does not touch ACR/recognition in any way — no stub needed. Requires the
// dev server running locally (npm run dev) against the same local Supabase
// this script targets.
//
// HARD LOCALHOST GUARD: refuses to run unless both the Supabase URL and the
// app URL under test resolve to 127.0.0.1/localhost. No override.
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-upload-performance-date-city.ts

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
  try { const h = new URL(url).hostname; return h === '127.0.0.1' || h === 'localhost' } catch { return false }
}
if (!isLocalhost(SUPABASE_URL) || !isLocalhost(APP_URL)) {
  console.error('REFUSING TO RUN: this harness only targets localhost.')
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

// /api/upload-performance's authenticate() uses createServerSupabaseClient()
// (lib/supabase/server.ts), which is COOKIE-based (@supabase/ssr), unlike
// /api/upload-identify's token-argument auth.getUser(token) — a bare
// Authorization: Bearer header is a no-op against this route. Signing in
// through a real createBrowserClient and capturing exactly the cookies it
// writes (via the cookies.setAll callback below) reproduces what an actual
// browser session would send, then replays them as a Cookie header.
async function persona(label: string) {
  const email = `uploadperf-${RUN}-${label}@example.test`.toLowerCase()
  const password = crypto.randomBytes(18).toString('base64url')
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`)
  const userId = data.user.id
  await service.from('profiles').insert({ id: userId, full_name: label, email })
  const jar = new Map<string, string>()
  const browserClient = createBrowserClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => Array.from(jar.entries()).map(([name, value]) => ({ name, value })),
      setAll: (c: { name: string; value: string }[]) => { for (const { name, value } of c) jar.set(name, value) },
    },
  })
  const { error: signInErr } = await browserClient.auth.signInWithPassword({ email, password })
  if (signInErr) throw new Error(`sign-in failed: ${signInErr.message}`)
  const cookieHeader = Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`).join('; ')
  return { userId, cookieHeader }
}

async function main() {
  console.log(`Run ${RUN} — DB ${SUPABASE_URL} — APP ${APP_URL}\n`)

  const owner = await persona('owner')
  let performanceId = ''
  let showId: string | null = null

  try {
    // ── 1. Create draft (POST) ──────────────────────────────────────────
    const createRes = await fetch(`${APP_URL}/api/upload-performance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: owner.cookieHeader },
      body: JSON.stringify({ targetUserId: owner.userId }),
    })
    const createData = await createRes.json()
    check('1. create-draft: HTTP 200', createRes.status === 200, String(createRes.status))
    check('1. create-draft: returns a performance_id', typeof createData.performance_id === 'string' && createData.performance_id.length > 0)
    performanceId = createData.performance_id
    showId = createData.show_id || null

    const draftRow = await service.from('performances').select('started_at, performance_date').eq('id', performanceId).single()
    const draftStartedAt = new Date(draftRow.data!.started_at)
    check('1. draft started_at is close to "now" (upload time), confirming the pre-fix baseline', Math.abs(Date.now() - draftStartedAt.getTime()) < 5 * 60 * 1000, draftRow.data?.started_at)

    // ── 2. Finalize (PATCH) with a date nowhere near "now" and a city,
    //    near a UTC day-boundary shape (midnight UTC on the chosen date —
    //    the exact construction the client sends). ─────────────────────
    const chosenDate = '2026-06-29'
    const patchRes = await fetch(`${APP_URL}/api/upload-performance`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: owner.cookieHeader },
      body: JSON.stringify({
        performance_id: performanceId,
        venue_name: 'Test Venue',
        venue_city: 'Peterborough',
        performance_date: new Date(chosenDate).toISOString(),
        start_time: '20:00',
        show_type: 'single',
        songs: [],
      }),
    })
    const patchData = await patchRes.json()
    check('2. finalize: HTTP 200', patchRes.status === 200, JSON.stringify(patchData))

    // ── 3. Read the PERSISTED row directly — not the HTTP response —
    //    the actual bug this test exists to catch. ─────────────────────
    const finalRow = await service.from('performances')
      .select('started_at, performance_date, venue_name, city, status')
      .eq('id', performanceId).single()
    check('3. persisted status is now "review"', finalRow.data?.status === 'review', finalRow.data?.status)
    check('3. persisted venue_name matches what was sent', finalRow.data?.venue_name === 'Test Venue', finalRow.data?.venue_name)
    check('3. persisted city matches what was sent (was previously never written at all)', finalRow.data?.city === 'Peterborough', finalRow.data?.city)

    const persistedStartedAtDate = (finalRow.data?.started_at || '').split('T')[0].split(' ')[0]
    check(
      '3. persisted started_at carries the CHOSEN date, not the draft-creation "now" — the actual fix',
      persistedStartedAtDate === chosenDate,
      `started_at=${finalRow.data?.started_at}`,
    )
    check(
      '3. started_at no longer stuck at draft time — moved away from the original draft value',
      finalRow.data?.started_at !== draftRow.data?.started_at,
    )
    const persistedPerfDateDate = (finalRow.data?.performance_date || '').split('T')[0].split(' ')[0]
    check('3. performance_date and started_at now agree on the same calendar day', persistedPerfDateDate === persistedStartedAtDate, `performance_date=${finalRow.data?.performance_date} started_at=${finalRow.data?.started_at}`)

    // ── 4. Idempotency: a second PATCH after status flipped to 'review'
    //    must not clobber the already-saved date (pre-existing guard,
    //    unaffected by this fix — confirms it still holds). ─────────────
    const secondPatchRes = await fetch(`${APP_URL}/api/upload-performance`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: owner.cookieHeader },
      body: JSON.stringify({
        performance_id: performanceId,
        venue_name: 'Different Venue',
        venue_city: 'Nashville',
        performance_date: new Date('2020-01-01').toISOString(),
        songs: [],
      }),
    })
    const secondPatchData = await secondPatchRes.json()
    check('4. repeat PATCH: HTTP 200, reports already_finalized', secondPatchRes.status === 200 && secondPatchData.already_finalized === true, JSON.stringify(secondPatchData))
    const afterSecond = await service.from('performances').select('started_at, city').eq('id', performanceId).single()
    check('4. repeat PATCH did not overwrite the original date', (afterSecond.data?.started_at || '').split('T')[0] === chosenDate, afterSecond.data?.started_at)
    check('4. repeat PATCH did not overwrite the original city', afterSecond.data?.city === 'Peterborough', afterSecond.data?.city)
  } finally {
    if (performanceId) await service.from('performances').delete().eq('id', performanceId)
    if (showId) await service.from('shows').delete().eq('id', showId)
    await service.from('profiles').delete().eq('id', owner.userId)
    await service.auth.admin.deleteUser(owner.userId)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch(err => { console.error('Harness error:', err); process.exit(1) })
