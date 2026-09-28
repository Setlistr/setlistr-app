// Real HTTP-level tests for /api/upload-identify's authorization — the
// revoked_at + write-capable-role gap fixed this pass (it already required
// mandatory auth and an accepted delegation; it was missing the same
// role/revocation check already present elsewhere). Uses the same
// test-process-only provider-call interception as
// scripts/test-identify-authorization.ts (scripts/acr-stub-preload.js) —
// not application code, not reachable in production, does not touch
// recognition/audio-processing logic.
//
// PRECONDITION CHECK (section 0): the very first thing this suite does is
// verify the stub interception is actually active — a real, hard failure
// here, not a soft check buried among others — before trusting any later
// "zero provider calls" assertion. If this fails, the suite refuses to
// continue rather than risk a real ACRCloud call going unnoticed.
//
// Every denied-request check covers audio_captures, recognition_jobs, AND
// detection_events — not audio_captures alone. audio_captures/
// recognition_jobs are checked via a global row count for the "zero
// writes on denial" assertions ONLY (valid for that narrow purpose here
// because this is an isolated local test DB with no other concurrent
// writer during the run); detection_events is checked scoped to this
// run's own performance_id, which the table actually carries.
//
// CLEANUP no longer uses that same global-count reasoning as an ownership
// proof — deleting every row in a table because counts moved would also
// delete unrelated, pre-existing rows this run never created. Instead,
// cleanup() tracks the EXACT audio_captures ids this run's own requests
// produced, via ACR_STUB_CAPTURE_ID_LOG_FILE: scripts/acr-stub-preload.js
// optionally logs the real, database-confirmed id from each local POST
// .../rest/v1/audio_captures response (this route always writes
// show_id/artist_id as null by design, so there is no other column to
// scope a delete by). See that preload's header for how the log is
// produced; see section 5 below for the explicit proof that an unrelated
// pre-existing row survives cleanup.
//
// HARD LOCALHOST GUARD: refuses to run unless both the Supabase URL and
// the app URL under test resolve to 127.0.0.1/localhost. No override.
//
// Run via (dev server must already be running WITH the stub preload active
// — see scripts/test-identify-authorization.ts's header for the command —
// PLUS ACR_STUB_CAPTURE_ID_LOG_FILE, required by this suite specifically):
//   ACR_STUB_STATE_FILE=<path> ACR_STUB_CALL_LOG_FILE=<path> \
//     ACR_STUB_CAPTURE_ID_LOG_FILE=<path> \
//     npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-upload-identify-authorization.ts

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import * as fs from 'fs'
import * as crypto from 'crypto'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const APP_URL = process.env.TEST_APP_URL || 'http://127.0.0.1:3000'
const ACR_STUB_STATE_FILE = process.env.ACR_STUB_STATE_FILE || ''
const ACR_STUB_CALL_LOG_FILE = process.env.ACR_STUB_CALL_LOG_FILE || ''
const ACR_STUB_CAPTURE_ID_LOG_FILE = process.env.ACR_STUB_CAPTURE_ID_LOG_FILE || ''

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
  process.exit(1)
}
if (!ANON_KEY || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
if (!ACR_STUB_STATE_FILE || !ACR_STUB_CALL_LOG_FILE) {
  console.error('Missing ACR_STUB_STATE_FILE / ACR_STUB_CALL_LOG_FILE — refuses to run rather than risk a real call.')
  process.exit(1)
}
if (!ACR_STUB_CAPTURE_ID_LOG_FILE) {
  console.error('Missing ACR_STUB_CAPTURE_ID_LOG_FILE — this suite requires it to scope cleanup to the exact')
  console.error('audio_captures ids it creates (this route writes show_id/artist_id as null, so there is no')
  console.error('other column to scope a delete by). Refuses to run rather than fall back to a broad delete.')
  process.exit(1)
}

const service: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY)

const RUN = Date.now().toString(36)
const createdUserIds: string[] = []
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

interface Persona {
  label: string
  userId: string
  accessToken: () => string | null
}

async function createPersona(label: string): Promise<Persona> {
  const email = `uploadidauth-${RUN}-${label}@example.test`.toLowerCase()
  const password = crypto.randomBytes(18).toString('base64url')
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser failed for ${label}: ${error?.message}`)
  const userId = data.user.id
  createdUserIds.push(userId)
  unwrap<{ id: string }>(await service.from('profiles').insert({ id: userId, full_name: label, email }).select().single(), `profile for ${label}`)

  const jar = new Map<string, string>()
  let latestToken: string | null = null
  const browserClient = createBrowserClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => Array.from(jar.entries()).map(([name, value]) => ({ name, value })),
      setAll: (cookiesToSet: { name: string; value: string }[]) => {
        for (const { name, value } of cookiesToSet) jar.set(name, value)
      },
    },
  })
  const { data: signInData, error: signInErr } = await browserClient.auth.signInWithPassword({ email, password })
  if (signInErr) throw new Error(`sign-in failed for ${label}: ${signInErr.message}`)
  latestToken = signInData.session?.access_token || null
  return { label, userId, accessToken: () => latestToken }
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

function setStubResponse(response: Record<string, unknown>) {
  fs.writeFileSync(ACR_STUB_STATE_FILE, JSON.stringify({ response }))
}
function callLogCount(): number {
  if (!fs.existsSync(ACR_STUB_CALL_LOG_FILE)) return 0
  return fs.readFileSync(ACR_STUB_CALL_LOG_FILE, 'utf8').split('\n').filter(Boolean).length
}
// Exact, database-confirmed audio_captures ids this run's own requests
// produced — logged by scripts/acr-stub-preload.js from the real local
// insert response, NOT inferred from timestamps or a before/after count.
// The log file is truncated at the start of main(), so every id in it at
// any point belongs to this run. Best-effort extraction for cleanup's own
// use — a malformed line here is still surfaced as a real test failure by
// assertCaptureIdLogHealthy() below, not silently ignored; this function
// just doesn't let a single bad line block cleanup from acting on the
// good ones.
function loggedCaptureIds(): string[] {
  if (!fs.existsSync(ACR_STUB_CAPTURE_ID_LOG_FILE)) return []
  const lines = fs.readFileSync(ACR_STUB_CAPTURE_ID_LOG_FILE, 'utf8').split('\n').filter(Boolean)
  const ids = new Set<string>()
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line)
      if (parsed && typeof parsed.id === 'string' && parsed.id) ids.add(parsed.id)
    } catch { /* malformed line — flagged by assertCaptureIdLogHealthy(), not skipped silently overall */ }
  }
  return Array.from(ids)
}

const ACR_STUB_CAPTURE_ID_ERROR_LOG_FILE = `${ACR_STUB_CAPTURE_ID_LOG_FILE}.errors`
// scripts/acr-stub-preload.js appends here for every capture-id logging
// problem it hits (missing id, unparseable response body, an
// origin/pathname it can't verify, or a failure writing the success line
// itself) — see that file's header. NEVER silently trusted as "probably
// fine": this is read and asserted empty at assertCaptureIdLogHealthy().
function captureIdErrorLines(): string[] {
  if (!fs.existsSync(ACR_STUB_CAPTURE_ID_ERROR_LOG_FILE)) return []
  return fs.readFileSync(ACR_STUB_CAPTURE_ID_ERROR_LOG_FILE, 'utf8').split('\n').filter(Boolean)
}
// Fails the test (not a soft warning) if the preload ever recorded a
// capture-id problem, OR if the success log itself contains a malformed/
// incomplete line — either one means "cleanup's exact-id list is not
// trustworthy," which is exactly the property this whole mechanism exists
// to guarantee.
function assertCaptureIdLogHealthy(label: string) {
  const errorLines = captureIdErrorLines()
  check(`${label}: capture-id error log is empty (no missing ids / parse errors / origin mismatches / write failures)`, errorLines.length === 0, JSON.stringify(errorLines))

  const rawLines = fs.existsSync(ACR_STUB_CAPTURE_ID_LOG_FILE) ? fs.readFileSync(ACR_STUB_CAPTURE_ID_LOG_FILE, 'utf8').split('\n').filter(Boolean) : []
  const malformed: string[] = []
  for (const line of rawLines) {
    try {
      const parsed = JSON.parse(line)
      if (!parsed || typeof parsed.id !== 'string' || !parsed.id) malformed.push(line)
    } catch {
      malformed.push(line)
    }
  }
  check(`${label}: capture-id success log has zero malformed/incomplete lines`, malformed.length === 0, JSON.stringify(malformed))
}
const NO_MATCH_RESPONSE = { status: { code: 1001, msg: 'No result' } }

function tinyAudioBlob(): Blob {
  return new Blob([new Uint8Array(16)], { type: 'audio/webm' })
}
async function callUploadIdentify(token: string | null, fields: Record<string, string>) {
  const form = new FormData()
  form.append('audio', tinyAudioBlob(), 'audio.webm')
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  const res = await fetch(`${APP_URL}/api/upload-identify`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

// Global counts — valid here: this is an isolated local test DB with no
// other concurrent writer for the duration of this run.
async function globalCount(table: string): Promise<number> {
  const { count, error } = await service.from(table).select('id', { count: 'exact', head: true })
  if (error) throw new Error(`globalCount(${table}) failed: ${error.message}`)
  return count ?? -1
}
async function detectionEventsCount(performanceId: string): Promise<number> {
  const { data, error } = await service.from('detection_events').select('id').eq('performance_id', performanceId)
  if (error) throw new Error(`detectionEventsCount(${performanceId}) failed: ${error.message}`)
  return data?.length ?? -1
}

interface WriteSnapshot { audioCaptures: number; recognitionJobs: number; detectionEvents: number }
async function snapshot(performanceId: string): Promise<WriteSnapshot> {
  return {
    audioCaptures: await globalCount('audio_captures'),
    recognitionJobs: await globalCount('recognition_jobs'),
    detectionEvents: await detectionEventsCount(performanceId),
  }
}
function checkNoWrites(label: string, before: WriteSnapshot, after: WriteSnapshot) {
  check(`${label}: zero audio_captures rows written`, after.audioCaptures === before.audioCaptures, JSON.stringify({ before, after }))
  check(`${label}: zero recognition_jobs rows written`, after.recognitionJobs === before.recognitionJobs, JSON.stringify({ before, after }))
  check(`${label}: zero detection_events rows written`, after.detectionEvents === before.detectionEvents, JSON.stringify({ before, after }))
}

async function cleanup() {
  const errors: string[] = []
  if (createdPerformanceIds.length > 0) {
    const { error } = await service.from('detection_events').delete().in('performance_id', createdPerformanceIds)
    if (error) errors.push(`delete detection_events: ${error.message}`)
    const { error: perfErr } = await service.from('performances').delete().in('id', createdPerformanceIds)
    if (perfErr) errors.push(`delete performances: ${perfErr.message}`)
  }
  // audio_captures/recognition_jobs carry no performance_id on this route
  // (show_id/artist_id are always null by design here) — delete ONLY the
  // exact ids this run's own requests produced, per loggedCaptureIds()
  // above. Any pre-existing or otherwise-unrelated row in either table is
  // never touched.
  {
    const captureIds = loggedCaptureIds()
    if (captureIds.length > 0) {
      const { error } = await service.from('recognition_jobs').delete().in('audio_capture_id', captureIds)
      if (error) errors.push(`delete recognition_jobs: ${error.message}`)
      const { error: captureDelErr } = await service.from('audio_captures').delete().in('id', captureIds)
      if (captureDelErr) errors.push(`delete audio_captures: ${captureDelErr.message}`)
    }
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
    console.error('PRESERVING ACR_STUB_CAPTURE_ID_LOG_FILE (and its .errors sibling) so a retry can target the exact same ids — stub state is only retired on a fully successful cleanup.')
    throw new Error(`cleanup failed with ${errors.length} error(s)`)
  }
  // Only reached once every delete above actually succeeded — safe to
  // retire this run's stub state now. On failure (thrown above), none of
  // this runs: the capture-id log (and its error log) survive so a retry
  // can read the exact same ids rather than losing track of what still
  // needs deleting.
  if (fs.existsSync(ACR_STUB_STATE_FILE)) fs.unlinkSync(ACR_STUB_STATE_FILE)
  if (fs.existsSync(ACR_STUB_CALL_LOG_FILE)) fs.unlinkSync(ACR_STUB_CALL_LOG_FILE)
  if (fs.existsSync(ACR_STUB_CAPTURE_ID_LOG_FILE)) fs.unlinkSync(ACR_STUB_CAPTURE_ID_LOG_FILE)
  if (fs.existsSync(ACR_STUB_CAPTURE_ID_ERROR_LOG_FILE)) fs.unlinkSync(ACR_STUB_CAPTURE_ID_ERROR_LOG_FILE)
}

// Proves cleanup() preserves unrelated rows: seeded once section 0 confirms
// interception is active, torn down explicitly by THIS test (never by
// cleanup(), which must never touch it) after section 5 verifies it
// survived. Module-scope so the top-level error handler can also tear it
// down if something throws mid-run.
let unrelatedFixture: { captureId: string; jobId: string } | null = null
async function teardownUnrelatedFixture() {
  if (!unrelatedFixture) return
  await service.from('recognition_jobs').delete().eq('id', unrelatedFixture.jobId)
  await service.from('audio_captures').delete().eq('id', unrelatedFixture.captureId)
}

async function main() {
  console.log(`Run ${RUN} — DB ${SUPABASE_URL}, app ${APP_URL}\n`)

  if (fs.existsSync(ACR_STUB_CALL_LOG_FILE)) fs.unlinkSync(ACR_STUB_CALL_LOG_FILE)
  if (fs.existsSync(ACR_STUB_CAPTURE_ID_LOG_FILE)) fs.unlinkSync(ACR_STUB_CAPTURE_ID_LOG_FILE)
  if (fs.existsSync(ACR_STUB_CAPTURE_ID_ERROR_LOG_FILE)) fs.unlinkSync(ACR_STUB_CAPTURE_ID_ERROR_LOG_FILE)
  setStubResponse(NO_MATCH_RESPONSE)

  const ownerA = await createPersona('ownerA')
  const ownerC = await createPersona('ownerC')

  const perfA = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: `Upload Identify Fixture ${RUN}` }).select().single(), 'perfA')
  createdPerformanceIds.push(perfA.id)

  // ── 0. PRECONDITION: interception is genuinely active — hard failure,
  //    not a soft check, before trusting anything below. ───────────────────
  console.log('=== 0. PRECONDITION: provider-call interception is active ===')
  {
    const before = callLogCount()
    const capturesLoggedBefore = loggedCaptureIds().length
    const { status, json } = await callUploadIdentify(ownerA.accessToken(), { performance_id: perfA.id, previous_songs: '[]' })
    const activatedCorrectly = status === 200 && json.detected === false && callLogCount() === before + 1
    check('interception precondition: authorized request returns the stubbed no-match verdict via exactly one intercepted call', activatedCorrectly, JSON.stringify({ status, json, before, after: callLogCount() }))
    check('interception precondition: capture-id log recorded exactly this request\'s new audio_captures id', loggedCaptureIds().length === capturesLoggedBefore + 1, JSON.stringify({ before: capturesLoggedBefore, after: loggedCaptureIds().length }))
    assertCaptureIdLogHealthy('precondition')
    if (!activatedCorrectly) {
      console.error('REFUSING TO CONTINUE: provider-call interception could not be confirmed active. Aborting before any further request risks a real ACRCloud call.')
      await cleanup().catch(() => {})
      process.exit(1)
    }
  }

  // Seeded now (interception confirmed active, so nothing below this point
  // is at risk of leaking on an early abort) — a pre-existing row this run
  // never created and must not delete. See section 5 for the assertion.
  {
    const unrelatedCapture = unwrap<{ id: string }>(await service.from('audio_captures').insert({
      show_id: null, artist_id: null, captured_by: null,
      duration_seconds: 99, file_size_bytes: 12345,
      mime_type: 'audio/webm', captured_at: new Date().toISOString(),
    }).select().single(), 'unrelated audio_captures fixture')
    const unrelatedJob = unwrap<{ id: string }>(await service.from('recognition_jobs').insert({
      audio_capture_id: unrelatedCapture.id, vendor: 'acrcloud', status: 'completed',
      submitted_at: new Date().toISOString(),
    }).select().single(), 'unrelated recognition_jobs fixture')
    unrelatedFixture = { captureId: unrelatedCapture.id, jobId: unrelatedJob.id }
  }

  const manager = await createPersona('manager')
  const viewer = await createPersona('viewer')
  const unknownRole = await createPersona('unknownRole')
  const pending = await createPersona('pending')
  const revoked = await createPersona('revoked')
  const unrelated = await createPersona('unrelated')

  await seedDelegation({ artistId: ownerA.userId, delegateId: manager.userId, role: 'manager', accepted: true })
  await seedDelegation({ artistId: ownerA.userId, delegateId: viewer.userId, role: 'viewer', accepted: true })
  await seedDelegation({ artistId: ownerA.userId, delegateId: unknownRole.userId, role: 'some_future_role', accepted: true })
  await seedDelegation({ artistId: ownerA.userId, delegateId: pending.userId, role: 'manager', accepted: false })
  await seedDelegation({ artistId: ownerA.userId, delegateId: revoked.userId, role: 'manager', accepted: true, revoked: true })

  // ── 1. Denied: missing / invalid identity ───────────────────────────────
  console.log('\n=== 1. Denied: missing / invalid identity ===')
  for (const [label, token] of [['no Authorization header', null], ['garbage bearer token', 'not-a-real-token']] as [string, string | null][]) {
    const callsBefore = callLogCount()
    const before = await snapshot(perfA.id)
    const { status, json } = await callUploadIdentify(token, { performance_id: perfA.id, previous_songs: '[]' })
    check(`${label}: denied (401)`, status === 401, JSON.stringify({ status, json }))
    check(`${label}: zero provider calls`, callLogCount() === callsBefore)
    checkNoWrites(label, before, await snapshot(perfA.id))
  }

  // ── 2. Denied: authenticated but unauthorized for this target ──────────
  console.log('\n=== 2. Denied: authenticated but unauthorized for this target ===')
  const deniedCases: [string, Persona][] = [
    ['viewer (recognized role, not write-capable)', viewer],
    ['unknown_role (not in the recognized allowlist)', unknownRole],
    ['pending (not yet accepted)', pending],
    ['revoked (accepted, then revoked)', revoked],
    ['unrelated (zero delegation rows at all)', unrelated],
  ]
  for (const [label, persona] of deniedCases) {
    const callsBefore = callLogCount()
    const before = await snapshot(perfA.id)
    const { status, json } = await callUploadIdentify(persona.accessToken(), { performance_id: perfA.id, previous_songs: '[]' })
    check(`${label}: denied (403)`, status === 403, JSON.stringify({ status, json }))
    check(`${label}: zero provider calls`, callLogCount() === callsBefore)
    checkNoWrites(label, before, await snapshot(perfA.id))
  }

  // ── 3. Owner/active write-role success: full round trip ────────────────
  console.log('\n=== 3. Owner/active write-role success: full round trip via controlled (stubbed) response ===')
  for (const [label, persona] of [['owner', ownerA], ['manager', manager]] as [string, Persona][]) {
    const callsBefore = callLogCount()
    const before = await snapshot(perfA.id)
    const capturesLoggedBefore = loggedCaptureIds().length
    const { status, json } = await callUploadIdentify(persona.accessToken(), { performance_id: perfA.id, previous_songs: '[]' })
    check(`${label}: authorized request succeeds (200)`, status === 200, JSON.stringify({ status, json }))
    check(`${label}: response reflects the real (stubbed) no-match verdict`, json.detected === false, JSON.stringify(json))
    check(`${label}: exactly ONE provider call made (stubbed, not real)`, callLogCount() === callsBefore + 1)
    const after = await snapshot(perfA.id)
    check(`${label}: audio_captures row written`, after.audioCaptures === before.audioCaptures + 1)
    check(`${label}: recognition_jobs row written`, after.recognitionJobs === before.recognitionJobs + 1)
    check(`${label}: detection_events row written`, after.detectionEvents === before.detectionEvents + 1)
    check(`${label}: capture-id log recorded exactly this request's new audio_captures id`, loggedCaptureIds().length === capturesLoggedBefore + 1, JSON.stringify({ before: capturesLoggedBefore, after: loggedCaptureIds().length }))
    assertCaptureIdLogHealthy(label)
  }

  // ── 4. mismatched target: authorized for a DIFFERENT artist entirely ───
  console.log('\n=== 4. Denied: caller authorized for a different artist (ownerC), not this performance\'s owner ===')
  {
    const callsBefore = callLogCount()
    const before = await snapshot(perfA.id)
    const { status, json } = await callUploadIdentify(ownerC.accessToken(), { performance_id: perfA.id, previous_songs: '[]' })
    check('ownerC (owns a different performance entirely): denied (403)', status === 403, JSON.stringify({ status, json }))
    check('ownerC: zero provider calls', callLogCount() === callsBefore)
    checkNoWrites('ownerC', before, await snapshot(perfA.id))
  }

  // ── 5. Cleanup removes this run's own captures/jobs, preserves unrelated
  //    pre-existing rows ───────────────────────────────────────────────────
  // cleanup() runs HERE, deliberately before this section's own assertions,
  // so every check below proves what actually happened from a REAL
  // cleanup() run — not a hypothetical. unrelatedFixture was seeded in
  // section 0's wake, never touched by any request this suite made, and is
  // NOT part of loggedCaptureIds() (nothing in this suite's own flow ever
  // POSTs using its id), so cleanup()'s exact-id-scoped delete has no way
  // to reach it. capturedIdsBeforeCleanup is snapshotted BEFORE cleanup()
  // runs specifically so this section can assert those exact rows are
  // actually gone afterward, not just that unrelated rows survived.
  console.log('\n=== 5. Cleanup removes this run\'s own captures/jobs, preserves unrelated pre-existing rows ===')
  assertCaptureIdLogHealthy('pre-cleanup')
  const capturedIdsBeforeCleanup = loggedCaptureIds()
  check('capture-id log recorded at least one id before cleanup (section 3 produced captures)', capturedIdsBeforeCleanup.length > 0, JSON.stringify(capturedIdsBeforeCleanup))
  await cleanup()
  if (capturedIdsBeforeCleanup.length > 0) {
    const survivingOwnCaptures = await service.from('audio_captures').select('id').in('id', capturedIdsBeforeCleanup)
    check("this run's own audio_captures rows were actually deleted by cleanup()", !survivingOwnCaptures.error && (survivingOwnCaptures.data?.length ?? -1) === 0, JSON.stringify(survivingOwnCaptures))
    const survivingOwnJobs = await service.from('recognition_jobs').select('id').in('audio_capture_id', capturedIdsBeforeCleanup)
    check("this run's own recognition_jobs rows were actually deleted by cleanup()", !survivingOwnJobs.error && (survivingOwnJobs.data?.length ?? -1) === 0, JSON.stringify(survivingOwnJobs))
  }
  if (unrelatedFixture) {
    const survivingCapture = await service.from('audio_captures').select('id').eq('id', unrelatedFixture.captureId).maybeSingle()
    check('unrelated audio_captures row survives cleanup()', !survivingCapture.error && survivingCapture.data?.id === unrelatedFixture.captureId, JSON.stringify(survivingCapture))
    const survivingJob = await service.from('recognition_jobs').select('id').eq('id', unrelatedFixture.jobId).maybeSingle()
    check('unrelated recognition_jobs row survives cleanup()', !survivingJob.error && survivingJob.data?.id === unrelatedFixture.jobId, JSON.stringify(survivingJob))
  } else {
    check('unrelated-row fixture was seeded (precondition for section 5)', false, 'unrelatedFixture was never set')
  }
  // This test's own fixture, not cleanup()'s responsibility — tear it down
  // explicitly now that its survival has been proven.
  await teardownUnrelatedFixture()

  console.log(`\n${pass} passed, ${fail} failed`)

  if (fail > 0) process.exit(1)
}

main().catch(async (err) => {
  console.error('Harness error:', err)
  await cleanup().catch(() => {})
  await teardownUnrelatedFixture().catch(() => {})
  process.exit(1)
})
