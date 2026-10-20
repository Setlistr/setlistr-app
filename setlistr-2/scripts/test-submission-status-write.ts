// Focused, direct-PostgREST tests for the exact write
// app/app/submit/[id]/page.tsx's markSubmitted() now performs and checks:
//   supabase.from('performances')
//     .update({ submission_status: 'submitted', submitted_at })
//     .eq('id', performanceId)
//     .or('submission_status.is.null,submission_status.neq.submitted')
//     .select('id')
// and, when that isn't a clean one-row success, the read-back it is
// judged against (lib/claim-progress.ts judgeReadBack).
//
// This does NOT test React rendering (no component-test framework is
// configured in this repo) — it verifies the underlying DB-level fact the
// page's fix depends on: RLS can return HTTP 200 with ZERO rows updated,
// which is indistinguishable from success by status code alone. Every
// check below inspects the actual returned row count, matching what the
// page's own code now does (data.length !== 1, not just !error).
//
// Verifies:
//   1. Owner: exactly 1 row updated, HTTP 200.
//   2. Write-capable delegate (manager): exactly 1 row updated, HTTP 200.
//   3. Viewer delegate: HTTP 200, ZERO rows updated — the exact "false
//      success by status code" case the page's fix exists to catch.
//   4. Revoked delegate (even though role='manager'): HTTP 200, zero rows.
//   5. A genuine database error (malformed id — invalid uuid syntax):
//      non-2xx status, distinct from the zero-row RLS-denial case.
//   7. A repeat write (double tap, retry after a lost response) matches no
//      row and leaves submitted_at as first recorded; the read-back calls
//      it recorded, not failed.
//   8. A write that commits but whose response is lost: the read-back
//      finds it recorded.
//   9. Viewer: the read-back shows it isn't recorded — "not saved", never
//      a success and never "uncertain".
//   6. missingIdentityFields (lib/submission-identity.ts) — imports and
//      calls the ACTUAL production function, not a re-typed copy of its
//      logic, against null/undefined/blank-string/whitespace/complete
//      profiles, for both the owner's own-account check and the
//      delegate's always-omitted claim-sheet case.
//
// Requires no schema changes — performances.submission_status/
// submitted_at already exist and are unrelated to the parked local 0018/
// 0019 proposals (setlists/performance_songs), not touched by this file.
//
// HARD LOCALHOST GUARD: refuses to run unless the Supabase URL resolves
// to 127.0.0.1/localhost. No override.
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-submission-status-write.ts

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import * as crypto from 'crypto'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'
import { missingIdentityFields } from '../lib/submission-identity'
import { judgeWrite, judgeReadBack, type ReadBack } from '../lib/claim-progress'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function isLocalhost(url: string) {
  try { return ['127.0.0.1', 'localhost'].includes(new URL(url).hostname) } catch { return false }
}
if (!isLocalhost(SUPABASE_URL)) {
  console.error('REFUSING TO RUN: this harness only targets localhost.')
  process.exit(1)
}
if (!ANON_KEY || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const service: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY)
const RUN = Date.now().toString(36)
// performances.artist_name is NOT NULL in the local fixture schema — same
// fixture value the viewer-write-containment suite uses.
const FIXTURE_ARTIST_NAME = 'Fixture Artist'

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

interface Persona { label: string; userId: string; token: string }
async function persona(label: string): Promise<Persona> {
  const email = `submitwrite-${RUN}-${label}@example.test`.toLowerCase()
  const password = crypto.randomBytes(18).toString('base64url')
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser failed for ${label}: ${error?.message}`)
  const userId = data.user.id
  unwrap(await service.from('profiles').upsert({ id: userId, full_name: label, email }, { onConflict: 'id' }).select().single(), `profile for ${label}`)
  const jar = new Map<string, string>()
  const browserClient = createBrowserClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => Array.from(jar.entries()).map(([name, value]) => ({ name, value })),
      setAll: (c: { name: string; value: string }[]) => { for (const { name, value } of c) jar.set(name, value) },
    },
  })
  const { data: signIn, error: signInErr } = await browserClient.auth.signInWithPassword({ email, password })
  if (signInErr) throw new Error(`sign-in failed for ${label}: ${signInErr.message}`)
  return { label, userId, token: signIn.session!.access_token }
}

async function seedDelegation(ownerId: string, delegateId: string, role: string, opts: { revoked?: boolean } = {}) {
  unwrap(await service.from('artist_delegates').insert({
    artist_id: ownerId, delegate_id: delegateId, role,
    accepted_at: new Date().toISOString(),
    revoked_at: opts.revoked ? new Date().toISOString() : null,
  }).select().single(), 'seedDelegation')
}

// The exact PostgREST call markSubmitted() makes.
async function attemptMarkSubmitted(token: string, performanceId: string) {
  const filter = `id=eq.${performanceId}&or=(submission_status.is.null,submission_status.neq.submitted)`
  const res = await fetch(`${SUPABASE_URL}/rest/v1/performances?${filter}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ submission_status: 'submitted', submitted_at: new Date().toISOString() }),
  })
  const json = await res.json().catch(() => null)
  const rowsUpdated = Array.isArray(json) ? json.length : 0
  return { status: res.status, rowsUpdated, json }
}

// The read-back markSubmitted() makes when the write's answer isn't clean.
async function readBack(token: string, performanceId: string): Promise<ReadBack> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/performances_visible?id=eq.${performanceId}&select=submission_status,submitted_at`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return { ok: false }
  const json = await res.json().catch(() => null)
  if (!Array.isArray(json) || json.length !== 1) return { ok: false }
  return { ok: true, submissionStatus: json[0].submission_status ?? null, submittedAt: json[0].submitted_at ?? null }
}

async function seedPerformance(ownerId: string, label: string) {
  return unwrap<{ id: string }>(await service.from('performances').insert({ artist_name: FIXTURE_ARTIST_NAME,
    user_id: ownerId, venue_name: `Submit Write ${label} ${RUN}`,
  }).select().single(), `perf ${label}`)
}

async function main() {
  console.log(`Run ${RUN} — DB ${SUPABASE_URL}\n`)

  const owner = await persona('owner')
  const manager = await persona('manager')
  const viewer = await persona('viewer')
  const revoked = await persona('revoked')

  await seedDelegation(owner.userId, manager.userId, 'manager')
  await seedDelegation(owner.userId, viewer.userId, 'viewer')
  await seedDelegation(owner.userId, revoked.userId, 'manager', { revoked: true })

  // ── 1. Owner: exactly one row ────────────────────────────────────────
  {
    const perf = await seedPerformance(owner.userId, 'owner')
    const { status, rowsUpdated } = await attemptMarkSubmitted(owner.token, perf.id)
    check('1. owner: HTTP 200', status === 200, String(status))
    check('1. owner: exactly 1 row updated', rowsUpdated === 1, String(rowsUpdated))
    const row = await service.from('performances').select('submission_status').eq('id', perf.id).single()
    check('1. owner: submission_status actually set in DB', row.data?.submission_status === 'submitted')
    await service.from('performances').delete().eq('id', perf.id)
  }

  // ── 2. Write-capable delegate (manager): exactly one row ────────────
  {
    const perf = await seedPerformance(owner.userId, 'manager')
    const { status, rowsUpdated } = await attemptMarkSubmitted(manager.token, perf.id)
    check('2. manager delegate: HTTP 200', status === 200, String(status))
    check('2. manager delegate: exactly 1 row updated', rowsUpdated === 1, String(rowsUpdated))
    await service.from('performances').delete().eq('id', perf.id)
  }

  // ── 3. Viewer: HTTP 200, ZERO rows — the exact false-success case ────
  {
    const perf = await seedPerformance(owner.userId, 'viewer')
    const { status, rowsUpdated } = await attemptMarkSubmitted(viewer.token, perf.id)
    check('3. viewer: HTTP 200 (RLS denial is not an HTTP error)', status === 200, String(status))
    check('3. viewer: ZERO rows updated (this is what the page must detect, not just status)', rowsUpdated === 0, String(rowsUpdated))
    const row = await service.from('performances').select('submission_status').eq('id', perf.id).single()
    check('3. viewer: submission_status NOT set in DB', row.data?.submission_status !== 'submitted', JSON.stringify(row.data))
    await service.from('performances').delete().eq('id', perf.id)
  }

  // ── 4. Revoked delegate: HTTP 200, zero rows ─────────────────────────
  {
    const perf = await seedPerformance(owner.userId, 'revoked')
    const { status, rowsUpdated } = await attemptMarkSubmitted(revoked.token, perf.id)
    check('4. revoked delegate: HTTP 200', status === 200, String(status))
    check('4. revoked delegate: ZERO rows updated', rowsUpdated === 0, String(rowsUpdated))
    await service.from('performances').delete().eq('id', perf.id)
  }

  // ── 5. Genuine database error: malformed id (invalid uuid syntax) ───
  {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/performances?id=eq.not-a-real-uuid`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${owner.token}`, Prefer: 'return=representation' },
      body: JSON.stringify({ submission_status: 'submitted', submitted_at: new Date().toISOString() }),
    })
    const json = await res.json().catch(() => null)
    check('5. malformed id: real error status (distinct from the zero-row RLS case)', res.status >= 400, JSON.stringify({ status: res.status, json }))
  }

  // ── 7. Repeat write: no row, first timestamp kept, judged recorded ──
  {
    const perf = await seedPerformance(owner.userId, 'repeat')
    const first = await attemptMarkSubmitted(owner.token, perf.id)
    const stored1 = (await service.from('performances').select('submitted_at').eq('id', perf.id).single()).data?.submitted_at
    await new Promise(r => setTimeout(r, 20))
    // Two taps at once, after the first already committed.
    const [a, b] = await Promise.all([attemptMarkSubmitted(owner.token, perf.id), attemptMarkSubmitted(owner.token, perf.id)])
    const stored2 = (await service.from('performances').select('submitted_at').eq('id', perf.id).single()).data?.submitted_at
    check('7. first write: one row', first.rowsUpdated === 1, String(first.rowsUpdated))
    check('7. repeat writes: zero rows each', a.status === 200 && b.status === 200 && a.rowsUpdated === 0 && b.rowsUpdated === 0, JSON.stringify([a.rowsUpdated, b.rowsUpdated]))
    check('7. submitted_at unchanged by repeats', !!stored1 && stored1 === stored2, `${stored1} → ${stored2}`)
    const back = await readBack(owner.token, perf.id)
    check('7. repeat judged "already recorded", not a failure', judgeWrite({ error: false, rows: a.rowsUpdated }) === 'check' && judgeReadBack({ error: false, rows: a.rowsUpdated }, back) === 'already')
    check('7. read-back carries the stored time for the confirmation', back.ok && back.submittedAt === stored1)
    await service.from('performances').delete().eq('id', perf.id)
  }

  // ── 7b. Two first taps racing: exactly one row changes ──────────────
  {
    const perf = await seedPerformance(owner.userId, 'race')
    const [a, b] = await Promise.all([attemptMarkSubmitted(owner.token, perf.id), attemptMarkSubmitted(owner.token, perf.id)])
    check('7b. racing first writes: one row in total', a.rowsUpdated + b.rowsUpdated === 1, JSON.stringify([a.rowsUpdated, b.rowsUpdated]))
    const back = await readBack(owner.token, perf.id)
    const loser = a.rowsUpdated === 0 ? a : b
    check('7b. the other write is judged already recorded', judgeReadBack({ error: false, rows: loser.rowsUpdated }, back) === 'already')
    await service.from('performances').delete().eq('id', perf.id)
  }

  // ── 8. Committed, response lost ──────────────────────────────────────
  {
    const perf = await seedPerformance(owner.userId, 'lost')
    await attemptMarkSubmitted(manager.token, perf.id) // response discarded, as if the connection dropped
    const back = await readBack(manager.token, perf.id)
    check('8. lost response: read-back by the manager succeeds', back.ok)
    check('8. lost response: judged recorded', judgeReadBack({ error: true, rows: 0 }, back) === 'saved')
    check('8. read-back failure is uncertain, never "not saved"', judgeReadBack({ error: true, rows: 0 }, { ok: false }) === 'uncertain')
    await service.from('performances').delete().eq('id', perf.id)
  }

  // ── 9. Viewer: denied write, read-back says not recorded ─────────────
  {
    const perf = await seedPerformance(owner.userId, 'viewer-back')
    const w = await attemptMarkSubmitted(viewer.token, perf.id)
    const back = await readBack(viewer.token, perf.id)
    check('9. viewer: can read the status back', back.ok, JSON.stringify(back))
    check('9. viewer: judged not saved', judgeReadBack({ error: false, rows: w.rowsUpdated }, back) === 'not_saved')
    const r = await readBack(revoked.token, perf.id)
    check('9. revoked delegate: read-back fails closed (uncertain), never a success', judgeReadBack({ error: false, rows: 0 }, r) !== 'saved' && judgeReadBack({ error: false, rows: 0 }, r) !== 'already')
    await service.from('performances').delete().eq('id', perf.id)
  }

  // ── 6. missingIdentityFields — the ACTUAL function from
  //    lib/submission-identity.ts, imported above, not a copy. One shared
  //    check drives both the owner's own-account notice and the
  //    delegate's always-omitted-claim-sheet notice (see page.tsx) — this
  //    section proves the function itself is correct for null, undefined,
  //    blank, and whitespace-only values, and for the exact profile
  //    shapes each caller actually passes it. ──────────────────────────
  const BOTH = ['legal name', 'IPI number']
  // Owner: incomplete cases — null, undefined (key omitted), empty
  // string, and whitespace-only must all be treated identically as
  // missing, not just a strict `=== null` check.
  check('6a. owner: both null -> both flagged', JSON.stringify(missingIdentityFields({ legal_name: null, ipi_number: null })) === JSON.stringify(BOTH))
  check('6b. owner: both undefined (keys omitted) -> both flagged', JSON.stringify(missingIdentityFields({})) === JSON.stringify(BOTH))
  check('6c. owner: both empty string -> both flagged', JSON.stringify(missingIdentityFields({ legal_name: '', ipi_number: '' })) === JSON.stringify(BOTH))
  check('6d. owner: both whitespace-only -> both flagged', JSON.stringify(missingIdentityFields({ legal_name: '   ', ipi_number: '\t\n' })) === JSON.stringify(BOTH))
  check('6e. owner: profile itself null -> both flagged', JSON.stringify(missingIdentityFields(null)) === JSON.stringify(BOTH))
  check('6f. owner: only IPI missing (blank) -> only IPI flagged', JSON.stringify(missingIdentityFields({ legal_name: 'Jane Doe', ipi_number: '' })) === JSON.stringify(['IPI number']))
  check('6g. owner: only legal name missing (undefined) -> only legal name flagged', JSON.stringify(missingIdentityFields({ legal_name: undefined, ipi_number: '123' })) === JSON.stringify(['legal name']))
  // Owner: complete case — real, non-blank values -> nothing flagged.
  check('6h. owner: both present and non-blank -> none flagged (complete)', missingIdentityFields({ legal_name: 'Jane Doe', ipi_number: '123456789' }).length === 0)
  check('6i. owner: present but whitespace-padded real value is NOT blank -> none flagged', missingIdentityFields({ legal_name: '  Jane Doe  ', ipi_number: '123' }).length === 0)
  // Delegate: profileData is built with legal_name/ipi_number explicitly
  // null (the real shape load() constructs for a delegate) — the SAME
  // function call the page makes for a delegate must report both
  // missing, every time, regardless of the artist's real values, since
  // this profile object never carries them.
  check('6j. delegate-shaped profile (privacy-redacted nulls) -> both flagged, consistently', JSON.stringify(missingIdentityFields({ legal_name: null, ipi_number: null })) === JSON.stringify(BOTH))

  console.log(`\n${pass} passed, ${fail} failed`)

  await service.from('artist_delegates').delete().eq('artist_id', owner.userId)
  for (const p of [owner, manager, viewer, revoked]) {
    await service.from('profiles').delete().eq('id', p.userId)
    await service.auth.admin.deleteUser(p.userId)
  }

  if (fail > 0) process.exit(1)
}

main().catch(err => { console.error('Harness error:', err); process.exit(1) })
