// Real HTTP-level tests for /api/identify's mandatory caller authorization,
// using REAL controlled recognition-provider responses via test-process
// network interception (scripts/acr-stub-preload.js) — NOT the app's own
// code, loaded only via `node --require` when starting the dev server for
// this test run. It substitutes ACRCloud/MusicBrainz's raw HTTP responses;
// app/api/identify/route.ts itself, its scoring, thresholds, and all
// recognition logic are completely unchanged and untouched by this file.
//
// This replaces the quota-exhaustion-only proof from the previous pass:
// that only proved a request reached the quota gate, not that it reached a
// real recognition round trip or wrote the expected forensic rows. This
// suite now proves the full authorized path — audio_captures written,
// recognition_jobs written+updated, exactly one (stubbed, not real)
// ACRCloud call made, detection_events written, 200 returned — and
// separately proves every denied case makes ZERO provider calls and ZERO
// writes, verified against the stub's own call log, not assumed.
//
// setlist_id validation (section 3): app/api/identify/route.ts now
// verifies a supplied setlist_id against the authorized, stored
// performance record (matching id, show_id, AND performances.artist_id —
// a real, live column, confirmed via information_schema.columns and via
// a live join against setlists.artist_id: 5 matches, 0 mismatches)
// rather than rejecting every supplied setlist_id outright. Section 3
// exercises the full space: a valid linked request (including proving
// the setlist_items mirror write actually happens on a real add), an
// id that doesn't match the stored link, a matching id whose setlist's
// show_id doesn't match, a matching id whose setlist's artist_id doesn't
// match, and a performance missing a required stored id — every failure
// denies before quota/recognition/writes, and the plain no-setlist-id
// flow is confirmed unaffected.
//
// HARD LOCALHOST GUARD: refuses to run unless both the Supabase URL and
// the app URL under test resolve to 127.0.0.1/localhost. No override.
//
// Requires the dev server to be started WITH the stub preload active:
//   ACR_STUB_STATE_FILE=<path> ACR_STUB_CALL_LOG_FILE=<path> \
//     node --require ./scripts/acr-stub-preload.js node_modules/.bin/next dev
// (the accompanying report shows the exact command used). Makes zero real
// ACRCloud/MusicBrainz calls when run this way — verified via the call log,
// not merely claimed.
//
// Run via (LOCAL_SUPABASE_DB_CONTAINER is the local Supabase Postgres
// container's name — required for section 3, see seedLegacyLinkedPerformances()
// above; `docker` must be resolvable on PATH in this shell):
//   LOCAL_SUPABASE_DB_CONTAINER=<container name> \
//     npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-identify-authorization.ts

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import * as fs from 'fs'
import * as crypto from 'crypto'
import { execSync } from 'child_process'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'
import { isWriteCapableRole } from '../lib/writeCapableRoles'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const APP_URL = process.env.TEST_APP_URL || 'http://127.0.0.1:3000'
const ACR_STUB_STATE_FILE = process.env.ACR_STUB_STATE_FILE || ''
const ACR_STUB_CALL_LOG_FILE = process.env.ACR_STUB_CALL_LOG_FILE || ''
const LOCAL_SUPABASE_DB_CONTAINER = process.env.LOCAL_SUPABASE_DB_CONTAINER || ''

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
if (!ACR_STUB_STATE_FILE || !ACR_STUB_CALL_LOG_FILE) {
  console.error('Missing ACR_STUB_STATE_FILE / ACR_STUB_CALL_LOG_FILE — the dev server must be started with')
  console.error('the same values plus scripts/acr-stub-preload.js loaded via `node --require`, or this suite')
  console.error('cannot prove provider-call counts and refuses to run rather than risk a real ACRCloud call.')
  process.exit(1)
}
if (!LOCAL_SUPABASE_DB_CONTAINER) {
  console.error('Missing LOCAL_SUPABASE_DB_CONTAINER — section 3 needs it to seed legacy-style setlist-linked')
  console.error('performance fixtures. performances_require_authorized_creation (migration 0014) unconditionally')
  console.error('rejects ANY non-null setlist_id at INSERT time for every caller including service_role, and')
  console.error('performances_lock_links (0013) separately blocks ever setting it via UPDATE — so there is no')
  console.error('way to create that fixture shape through the ordinary Supabase client at all; it requires a')
  console.error('direct psql connection to briefly disable just that one trigger. Refuses to run without it')
  console.error('rather than silently skip section 3 or fall back to touching the trigger some other way.')
  process.exit(1)
}

const service: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY)
const ACR_DAILY_CALL_LIMIT = 1500 // must match lib/acr-limits.ts

const RUN = Date.now().toString(36)
const createdUserIds: string[] = []
const createdShowIds: string[] = []
const createdPerformanceIds: string[] = []
const createdDelegationIds: string[] = []
const createdArtistIds: string[] = []

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
  const email = `identifyauth-${RUN}-${label}@example.test`.toLowerCase()
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

function currentAcrWindowDate(): string {
  const chicagoNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }))
  const shifted = new Date(chicagoNow.getTime() - 5 * 60 * 60 * 1000)
  return shifted.toISOString().slice(0, 10)
}
async function exhaustQuota(userId: string) {
  const { data, error } = await service.from('profiles').update({
    acr_window_start: currentAcrWindowDate(),
    acr_calls_today: ACR_DAILY_CALL_LIMIT,
  }).eq('id', userId).select('id')
  if (error) throw new Error(`exhaustQuota(${userId}) failed: ${error.message}`)
  if (!data || data.length !== 1) throw new Error(`exhaustQuota(${userId}) expected exactly 1 updated row, got ${data?.length ?? 0}`)
}
async function resetQuota(userId: string) {
  const { error } = await service.from('profiles').update({ acr_calls_today: 0, acr_window_start: currentAcrWindowDate() }).eq('id', userId)
  if (error) throw new Error(`resetQuota(${userId}) failed: ${error.message}`)
}

// ── Stub control: writes the response the NEXT intercepted ACRCloud call(s)
// will receive, and reads the call log to count actual intercepted calls.
function setStubResponse(response: Record<string, unknown>) {
  fs.writeFileSync(ACR_STUB_STATE_FILE, JSON.stringify({ response }))
}
function callLogCount(): number {
  if (!fs.existsSync(ACR_STUB_CALL_LOG_FILE)) return 0
  return fs.readFileSync(ACR_STUB_CALL_LOG_FILE, 'utf8').split('\n').filter(Boolean).length
}
const NO_MATCH_RESPONSE = { status: { code: 1001, msg: 'No result' } }

// performances_require_authorized_creation (0014) unconditionally rejects
// ANY non-null setlist_id at INSERT time, for every caller including
// service_role — and performances_lock_links (0013) separately rejects
// ever SETTING setlist_id via UPDATE (only an existing non-null value
// going to null, when the old referenced row is actually gone, is
// allowed). Both are real, intentional, currently-enforced containment
// migrations, not bugs — so there is no way to create a fixture
// performance with setlist_id already set through the ordinary Supabase
// client. This matches how production's own 5 linked performances must
// predate these triggers (grandfathered legacy rows, not something new
// code can produce today). Section 3's fixtures reproduce that same
// legacy shape locally by briefly disabling just this one INSERT trigger
// via a direct psql connection, inserting, and re-enabling it
// immediately — wrapped in one transaction so a failure rolls back
// everything, including the disable. Never touched via the app's own
// Supabase client at any point, never left disabled.
function seedLegacyLinkedPerformances(sql: string) {
  execSync(
    `docker exec -i ${LOCAL_SUPABASE_DB_CONTAINER} psql -U postgres -d postgres -v ON_ERROR_STOP=1`,
    { input: `BEGIN;\n${sql}\nCOMMIT;\n`, stdio: ['pipe', 'pipe', 'inherit'] }
  )
}

function tinyAudioBlob(): Blob {
  return new Blob([new Uint8Array(16)], { type: 'audio/webm' })
}
async function callIdentify(token: string | null, fields: Record<string, string>) {
  const form = new FormData()
  form.append('audio', tinyAudioBlob(), 'audio.webm')
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  const res = await fetch(`${APP_URL}/api/identify`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)) }
// writeToUserSongs() in app/api/identify/route.ts is called WITHOUT await
// (fire-and-forget) — a pre-existing characteristic discovered by this test,
// not something this pass changes (recognition/catalogue-write logic is out
// of scope here). The HTTP response can return before that specific write
// lands, so a readback immediately after the response is not reliable for
// this one table. Polls briefly rather than asserting on a race.
async function pollForUserSong(userId: string, songTitle: string, timeoutMs = 1500): Promise<{ id: string }[]> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { data, error } = await service.from('user_songs').select('id').eq('user_id', userId).eq('song_title', songTitle)
    if (error) throw new Error(`pollForUserSong failed: ${error.message}`)
    if (data && data.length > 0) return data
    await sleep(50)
  }
  const { data } = await service.from('user_songs').select('id').eq('user_id', userId).eq('song_title', songTitle)
  return data ?? []
}

async function countRows(table: string, column: string, value: string): Promise<number> {
  const { data, error } = await service.from(table).select('id').eq(column, value)
  if (error) throw new Error(`countRows(${table}.${column}=${value}) failed: ${error.message}`)
  return data?.length ?? 0
}

// Every affected write table, not just audio_captures — recognition_jobs
// (via the show-scoped audio_captures ids, since it has no show_id of its
// own) and detection_events (has performance_id directly).
interface WriteSnapshot { audioCaptures: number; recognitionJobs: number; detectionEvents: number }
async function snapshot(showId: string, performanceId: string): Promise<WriteSnapshot> {
  const { data: captureIds, error: captureErr } = await service.from('audio_captures').select('id').eq('show_id', showId)
  if (captureErr) throw new Error(`snapshot audio_captures failed: ${captureErr.message}`)
  const ids = (captureIds ?? []).map(c => c.id)
  let recognitionJobs = 0
  if (ids.length > 0) {
    const { data: jobs, error: jobErr } = await service.from('recognition_jobs').select('id').in('audio_capture_id', ids)
    if (jobErr) throw new Error(`snapshot recognition_jobs failed: ${jobErr.message}`)
    recognitionJobs = jobs?.length ?? 0
  }
  return {
    audioCaptures: ids.length,
    recognitionJobs,
    detectionEvents: await countRows('detection_events', 'performance_id', performanceId),
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
    const { error: guardErr } = await service.from('user_song_performances').delete().in('performance_id', createdPerformanceIds)
    if (guardErr) errors.push(`delete user_song_performances: ${guardErr.message}`)
    const { error: perfErr } = await service.from('performances').delete().in('id', createdPerformanceIds)
    if (perfErr) errors.push(`delete performances: ${perfErr.message}`)
  }
  if (createdUserIds.length > 0) {
    const { error } = await service.from('user_songs').delete().in('user_id', createdUserIds)
    if (error) errors.push(`delete user_songs: ${error.message}`)
  }
  if (createdArtistIds.length > 0) {
    // artists has no FK back to performances/shows, so nothing else
    // cascades this — explicit delete. setlists rows referencing these
    // artist ids are also reachable via createdShowIds' cascade below
    // (setlists_show_id_fkey ... ON DELETE CASCADE), so no separate
    // setlists tracking/delete is needed regardless of ordering here.
    const { error } = await service.from('artists').delete().in('id', createdArtistIds)
    if (error) errors.push(`delete artists: ${error.message}`)
  }
  if (createdShowIds.length > 0) {
    // audio_captures/recognition_jobs have no FK/cascade on this local
    // fixture table — delete explicitly, recognition_jobs first (it
    // references audio_capture_id).
    const { data: captures, error: captureReadErr } = await service.from('audio_captures').select('id').in('show_id', createdShowIds)
    if (captureReadErr) errors.push(`read audio_captures: ${captureReadErr.message}`)
    const captureIds = (captures ?? []).map(c => c.id)
    if (captureIds.length > 0) {
      const { error } = await service.from('recognition_jobs').delete().in('audio_capture_id', captureIds)
      if (error) errors.push(`delete recognition_jobs: ${error.message}`)
    }
    const { error: captureDelErr } = await service.from('audio_captures').delete().in('show_id', createdShowIds)
    if (captureDelErr) errors.push(`delete audio_captures: ${captureDelErr.message}`)

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
  if (fs.existsSync(ACR_STUB_STATE_FILE)) fs.unlinkSync(ACR_STUB_STATE_FILE)
  if (fs.existsSync(ACR_STUB_CALL_LOG_FILE)) fs.unlinkSync(ACR_STUB_CALL_LOG_FILE)
  if (errors.length > 0) {
    console.error(`Cleanup failed with ${errors.length} error(s):`)
    for (const e of errors) console.error(`  ${e}`)
    throw new Error(`cleanup failed with ${errors.length} error(s)`)
  }
}

async function main() {
  console.log(`Run ${RUN} — DB ${SUPABASE_URL}, app ${APP_URL}`)
  console.log(`Stub state: ${ACR_STUB_STATE_FILE}, call log: ${ACR_STUB_CALL_LOG_FILE}\n`)

  if (fs.existsSync(ACR_STUB_CALL_LOG_FILE)) fs.unlinkSync(ACR_STUB_CALL_LOG_FILE)
  setStubResponse(NO_MATCH_RESPONSE)

  const ownerA = await createPersona('ownerA')
  const ownerC = await createPersona('ownerC')
  const manager = await createPersona('manager')
  const tourManager = await createPersona('tourManager')
  const bandMember = await createPersona('bandMember')
  const viewer = await createPersona('viewer')
  const unknownRole = await createPersona('unknownRole')
  const pending = await createPersona('pending')
  const revoked = await createPersona('revoked')
  const unrelated = await createPersona('unrelated')
  const mismatchedManager = await createPersona('mismatchedManager')

  await seedDelegation({ artistId: ownerA.userId, delegateId: manager.userId, role: 'manager', accepted: true })
  await seedDelegation({ artistId: ownerA.userId, delegateId: tourManager.userId, role: 'tour_manager', accepted: true })
  await seedDelegation({ artistId: ownerA.userId, delegateId: bandMember.userId, role: 'band_member', accepted: true })
  await seedDelegation({ artistId: ownerA.userId, delegateId: viewer.userId, role: 'viewer', accepted: true })
  await seedDelegation({ artistId: ownerA.userId, delegateId: unknownRole.userId, role: 'some_future_role', accepted: true })
  await seedDelegation({ artistId: ownerA.userId, delegateId: pending.userId, role: 'manager', accepted: false })
  await seedDelegation({ artistId: ownerA.userId, delegateId: revoked.userId, role: 'manager', accepted: true, revoked: true })
  await seedDelegation({ artistId: ownerC.userId, delegateId: mismatchedManager.userId, role: 'manager', accepted: true })

  const showA = unwrap<{ id: string }>(await service.from('shows').insert({ created_by: ownerA.userId }).select().single(), 'showA')
  createdShowIds.push(showA.id)
  const perfA = unwrap<{ id: string }>(await service.from('performances').insert({ user_id: ownerA.userId, venue_name: `Identify Fixture ${RUN}`, show_id: showA.id }).select().single(), 'perfA')
  createdPerformanceIds.push(perfA.id)

  // ── 0. PRECONDITION: interception is genuinely active — hard failure, not
  //    a soft check, before trusting any "zero provider calls" assertion
  //    below. ─────────────────────────────────────────────────────────────
  console.log('=== 0. PRECONDITION: provider-call interception is active ===')
  {
    const before = callLogCount()
    const { status, json } = await callIdentify(ownerA.accessToken(), { performance_id: perfA.id, show_id: showA.id })
    const activatedCorrectly = status === 200 && json.detected === false && callLogCount() === before + 1
    check('interception precondition: authorized request returns the stubbed no-match verdict via exactly one intercepted call', activatedCorrectly, JSON.stringify({ status, json, before, after: callLogCount() }))
    if (!activatedCorrectly) {
      console.error('REFUSING TO CONTINUE: provider-call interception could not be confirmed active. Aborting before any further request risks a real ACRCloud call.')
      await cleanup().catch(() => {})
      process.exit(1)
    }
  }

  // ── 1. Denied: missing / invalid identity — zero provider calls, zero writes
  console.log('\n=== 1. Denied: missing / invalid identity ===')
  for (const [label, token] of [['no Authorization header', null], ['garbage bearer token', 'not-a-real-token']] as [string, string | null][]) {
    const before = callLogCount()
    const writesBefore = await snapshot(showA.id, perfA.id)
    const { status, json } = await callIdentify(token, { performance_id: perfA.id })
    check(`${label}: denied (401)`, status === 401, JSON.stringify({ status, json }))
    check(`${label}: zero provider calls`, callLogCount() === before)
    checkNoWrites(label, writesBefore, await snapshot(showA.id, perfA.id))
  }

  // ── 1b. Malformed input, UNAUTHENTICATED: rejected (400), zero provider
  //    calls, zero writes of ANY kind — including recognition_logs, which
  //    the outer catch-all used to insert unconditionally even when the
  //    failure (malformed previous_songs JSON) happened before
  //    authentication was ever checked. That write was itself an
  //    unauthorized write triggered by an unauthenticated caller. ────────
  console.log('\n=== 1b. Denied: malformed previous_songs, no credentials — 400, zero writes of any kind ===')
  {
    const before = callLogCount()
    const writesBefore = await snapshot(showA.id, perfA.id)
    const logsBefore = await countRows('recognition_logs', 'performance_id', perfA.id)
    const { status, json } = await callIdentify(null, { performance_id: perfA.id, previous_songs: 'not valid json{' })
    check('1b. malformed previous_songs (unauthenticated): denied (400)', status === 400, JSON.stringify({ status, json }))
    check('1b. malformed previous_songs (unauthenticated): zero provider calls', callLogCount() === before)
    checkNoWrites('1b. malformed previous_songs (unauthenticated)', writesBefore, await snapshot(showA.id, perfA.id))
    check('1b. malformed previous_songs (unauthenticated): zero recognition_logs rows written', (await countRows('recognition_logs', 'performance_id', perfA.id)) === logsBefore, JSON.stringify({ logsBefore }))
  }

  // ── 2. Denied: authenticated but unauthorized for this target ──────────
  console.log('\n=== 2. Denied: authenticated but unauthorized for this target ===')
  const deniedCases: [string, Persona][] = [
    ['viewer (recognized role, not write-capable)', viewer],
    ['unknown_role (not in the recognized allowlist)', unknownRole],
    ['pending (not yet accepted)', pending],
    ['revoked (accepted, then revoked)', revoked],
    ['unrelated (zero delegation rows at all)', unrelated],
    ['mismatchedManager (write-capable, but for a different artist)', mismatchedManager],
  ]
  for (const [label, persona] of deniedCases) {
    const before = callLogCount()
    const writesBefore = await snapshot(showA.id, perfA.id)
    const { status, json } = await callIdentify(persona.accessToken(), { performance_id: perfA.id })
    check(`${label}: denied (403)`, status === 403, JSON.stringify({ status, json }))
    check(`${label}: zero provider calls`, callLogCount() === before)
    checkNoWrites(label, writesBefore, await snapshot(showA.id, perfA.id))
  }

  // ── 3. setlist_id validation: valid links, invalid/mismatched links,
  //    missing required ids, and the plain no-setlist flow ────────────────
  console.log('\n=== 3. setlist_id validation ===')

  const artistX = unwrap<{ id: string }>(await service.from('artists').insert({ user_id: ownerA.userId }).select().single(), 'artistX')
  createdArtistIds.push(artistX.id)
  const artistZ = unwrap<{ id: string }>(await service.from('artists').insert({ user_id: ownerA.userId }).select().single(), 'artistZ')
  createdArtistIds.push(artistZ.id)

  const setlistX = unwrap<{ id: string }>(await service.from('setlists').insert({ show_id: showA.id, artist_id: artistX.id }).select().single(), 'setlistX (valid: matches showA + artistX)')
  const showB = unwrap<{ id: string }>(await service.from('shows').insert({ created_by: ownerA.userId }).select().single(), 'showB')
  createdShowIds.push(showB.id)
  const setlistY = unwrap<{ id: string }>(await service.from('setlists').insert({ show_id: showB.id, artist_id: artistX.id }).select().single(), 'setlistY (show_id will mismatch the performance that references it)')
  const setlistZ = unwrap<{ id: string }>(await service.from('setlists').insert({ show_id: showA.id, artist_id: artistZ.id }).select().single(), 'setlistZ (artist_id will mismatch the performance that references it)')

  // performances.setlist_id can only be created in this already-linked
  // shape by briefly disabling 0014's INSERT trigger — see
  // seedLegacyLinkedPerformances() above for why.
  const perfLinkedId = crypto.randomUUID()
  const perfShowMismatchId = crypto.randomUUID()
  const perfArtistMismatchId = crypto.randomUUID()
  const perfMissingArtistId = crypto.randomUUID()
  seedLegacyLinkedPerformances(`
ALTER TABLE public.performances DISABLE TRIGGER performances_require_authorized_creation;
INSERT INTO public.performances (id, user_id, venue_name, show_id, setlist_id, artist_id) VALUES
  ('${perfLinkedId}', '${ownerA.userId}', 'Identify Linked Fixture ${RUN}', '${showA.id}', '${setlistX.id}', '${artistX.id}'),
  ('${perfShowMismatchId}', '${ownerA.userId}', 'Identify Show-Mismatch Fixture ${RUN}', '${showA.id}', '${setlistY.id}', '${artistX.id}'),
  ('${perfArtistMismatchId}', '${ownerA.userId}', 'Identify Artist-Mismatch Fixture ${RUN}', '${showA.id}', '${setlistZ.id}', '${artistX.id}'),
  ('${perfMissingArtistId}', '${ownerA.userId}', 'Identify Missing-Artist Fixture ${RUN}', '${showA.id}', '${setlistX.id}', NULL);
ALTER TABLE public.performances ENABLE TRIGGER performances_require_authorized_creation;
`)
  createdPerformanceIds.push(perfLinkedId, perfShowMismatchId, perfArtistMismatchId, perfMissingArtistId)

  // ── 3a. Denied: supplied id doesn't match the performance's own stored
  //    setlist_id at all ──────────────────────────────────────────────────
  {
    const before = callLogCount()
    const writesBefore = await snapshot(showA.id, perfLinkedId)
    const { status, json } = await callIdentify(ownerA.accessToken(), { performance_id: perfLinkedId, setlist_id: crypto.randomUUID() })
    check('3a. unmatched setlist_id: denied (403), not silently skipped', status === 403, JSON.stringify({ status, json }))
    check('3a. unmatched setlist_id: zero provider calls', callLogCount() === before)
    checkNoWrites('3a. unmatched setlist_id', writesBefore, await snapshot(showA.id, perfLinkedId))
  }

  // ── 3b. Denied: matching id, but the setlist's own show_id doesn't
  //    match the performance's stored show_id ─────────────────────────────
  {
    const before = callLogCount()
    const writesBefore = await snapshot(showA.id, perfShowMismatchId)
    const { status, json } = await callIdentify(ownerA.accessToken(), { performance_id: perfShowMismatchId, setlist_id: setlistY.id })
    check('3b. show_id mismatch: denied (403)', status === 403, JSON.stringify({ status, json }))
    check('3b. show_id mismatch: zero provider calls', callLogCount() === before)
    checkNoWrites('3b. show_id mismatch', writesBefore, await snapshot(showA.id, perfShowMismatchId))
  }

  // ── 3c. Denied: matching id and show_id, but the setlist's own
  //    artist_id doesn't match the performance's stored artist_id — this
  //    is exactly the case show_id-only matching would have missed ───────
  {
    const before = callLogCount()
    const writesBefore = await snapshot(showA.id, perfArtistMismatchId)
    const { status, json } = await callIdentify(ownerA.accessToken(), { performance_id: perfArtistMismatchId, setlist_id: setlistZ.id })
    check('3c. artist_id mismatch: denied (403)', status === 403, JSON.stringify({ status, json }))
    check('3c. artist_id mismatch: zero provider calls', callLogCount() === before)
    checkNoWrites('3c. artist_id mismatch', writesBefore, await snapshot(showA.id, perfArtistMismatchId))
  }

  // ── 3d. Denied: the performance's own stored artist_id is missing —
  //    nothing authoritative to verify the setlist's artist_id against,
  //    so this denies rather than assumes a match ─────────────────────────
  {
    const before = callLogCount()
    const writesBefore = await snapshot(showA.id, perfMissingArtistId)
    const { status, json } = await callIdentify(ownerA.accessToken(), { performance_id: perfMissingArtistId, setlist_id: setlistX.id })
    check('3d. missing performance.artist_id: denied (403)', status === 403, JSON.stringify({ status, json }))
    check('3d. missing performance.artist_id: zero provider calls', callLogCount() === before)
    checkNoWrites('3d. missing performance.artist_id', writesBefore, await snapshot(showA.id, perfMissingArtistId))
  }
  // (A "setlist row referenced but missing" case is not exercised: the
  // performances.setlist_id -> setlists.id FK is enforced independently
  // of the disabled INSERT trigger above, so a fixture with a dangling
  // reference cannot exist — that branch in the route is a defensive
  // check against a state the schema itself already prevents.)

  // ── 3e. Allowed: a fully valid linked request succeeds AND, on a real
  //    add, the setlist mirror write actually lands in setlist_items —
  //    proving validation doesn't just avoid rejecting, it restores the
  //    write path it gates. Uses the existing, unmodified "multiple
  //    detections" inclusion path (two identical-title stubbed calls),
  //    same technique as section 7b, not a threshold change. ─────────────
  {
    await resetQuota(ownerA.userId)
    const songTitle = `Stub Linked Setlist Match ${RUN}`
    setStubResponse({
      status: { code: 0 },
      metadata: { music: [{ title: songTitle, artists: [{ name: 'Stub Artist' }], score: '95', external_ids: {} }] },
    })

    const first = await callIdentify(ownerA.accessToken(), { performance_id: perfLinkedId, show_id: showA.id, setlist_id: setlistX.id })
    check('3e. valid linked request: first stubbed-match call succeeds (200), not rejected', first.status === 200, JSON.stringify(first))

    const second = await callIdentify(ownerA.accessToken(), { performance_id: perfLinkedId, show_id: showA.id, setlist_id: setlistX.id })
    check('3e. valid linked request: second identical call is detected+added', second.status === 200 && second.json.detected === true, JSON.stringify(second))
    check('3e. valid linked request: response carries a setlist_item_id (mirror write happened)', typeof second.json.setlist_item_id === 'string' && second.json.setlist_item_id.length > 0, JSON.stringify(second.json))

    const mirrorRows = await service.from('setlist_items').select('id, title').eq('setlist_id', setlistX.id).ilike('title', songTitle)
    check('3e. valid linked request: setlist_items row actually exists under the verified setlist_id', !mirrorRows.error && (mirrorRows.data?.length ?? 0) === 1, JSON.stringify(mirrorRows))

    setStubResponse(NO_MATCH_RESPONSE) // restore default for anything after this section
  }

  // ── 3f. No-setlist flow unaffected: omitting setlist_id on a performance
  //    that DOES have a valid stored link still succeeds normally ─────────
  {
    await resetQuota(ownerA.userId)
    const { status, json } = await callIdentify(ownerA.accessToken(), { performance_id: perfLinkedId, show_id: showA.id })
    check('3f. no setlist_id supplied: succeeds (200), unaffected by the stored link existing', status === 200, JSON.stringify({ status, json }))
  }

  // ── 4. Authorized owner/team paths: REAL stubbed round trip ─────────────
  console.log('\n=== 4. Authorized owner/team paths: full round trip via controlled (stubbed) provider response ===')
  const allowedCases: [string, Persona][] = [
    ['owner', ownerA],
    ['manager', manager],
    ['tour_manager', tourManager],
    ['band_member', bandMember],
  ]
  for (const [label, persona] of allowedCases) {
    await resetQuota(ownerA.userId)
    const callsBefore = callLogCount()
    const audioBefore = await countRows('audio_captures', 'show_id', showA.id)
    const eventsBefore = await countRows('detection_events', 'performance_id', perfA.id)

    const { status, json } = await callIdentify(persona.accessToken(), { performance_id: perfA.id, show_id: showA.id })

    check(`${label}: authorized request succeeds (200)`, status === 200, JSON.stringify({ status, json }))
    check(`${label}: response reflects the real (stubbed) no-match verdict`, json.detected === false, JSON.stringify(json))
    check(`${label}: exactly ONE provider call made (stubbed, not real)`, callLogCount() === callsBefore + 1, `before=${callsBefore} after=${callLogCount()}`)
    check(`${label}: audio_captures forensic row written`, (await countRows('audio_captures', 'show_id', showA.id)) === audioBefore + 1)
    check(`${label}: detection_events row written`, (await countRows('detection_events', 'performance_id', perfA.id)) === eventsBefore + 1)
  }

  // ── 5. Quota gate: still enforced, still zero provider calls when over ──
  console.log('\n=== 5. Quota gate: an authorized caller over quota gets 200/quota_exceeded, zero provider calls ===')
  {
    await exhaustQuota(ownerA.userId)
    const before = callLogCount()
    const { status, json } = await callIdentify(ownerA.accessToken(), { performance_id: perfA.id })
    check('owner over quota: 200 with quota_exceeded, not an error', status === 200 && json.quota_exceeded === true, JSON.stringify({ status, json }))
    check('owner over quota: zero provider calls', callLogCount() === before)
    await resetQuota(ownerA.userId)
  }

  // ── 6. Same-session-after-revocation: denied on the NEXT request, zero
  //    provider calls ─────────────────────────────────────────────────────
  console.log('\n=== 6. Same already-signed-in session is denied on the NEXT request after revocation ===')
  {
    const toBeRevoked = await createPersona('toBeRevoked')
    const delegationId = await seedDelegation({ artistId: ownerA.userId, delegateId: toBeRevoked.userId, role: 'manager', accepted: true })

    const callsBefore1 = callLogCount()
    const before = await callIdentify(toBeRevoked.accessToken(), { performance_id: perfA.id, show_id: showA.id })
    check('toBeRevoked: authorized before revocation (200, real round trip)', before.status === 200 && before.json.detected === false, JSON.stringify(before))
    check('toBeRevoked: exactly one provider call before revocation', callLogCount() === callsBefore1 + 1)

    const { data: revokeData, error: revokeErr } = await service.from('artist_delegates').update({ revoked_at: new Date().toISOString() }).eq('id', delegationId).select('id, revoked_at')
    check('revoke: update succeeded with no error', !revokeErr, JSON.stringify(revokeErr))
    check('revoke: exactly one row updated with non-null revoked_at', (revokeData?.length ?? 0) === 1 && !!revokeData?.[0]?.revoked_at, JSON.stringify(revokeData))

    const callsBefore2 = callLogCount()
    const writesBefore = await snapshot(showA.id, perfA.id)
    const after = await callIdentify(toBeRevoked.accessToken(), { performance_id: perfA.id })
    check('toBeRevoked: SAME already-signed-in session denied (403) on its next request after revocation', after.status === 403, JSON.stringify(after))
    checkNoWrites('toBeRevoked (post-revocation)', writesBefore, await snapshot(showA.id, perfA.id))
    check('toBeRevoked: zero provider calls on the denied request', callLogCount() === callsBefore2)
  }

  // ── 7. Catalogue/quota identity: always the OWNER, for owner AND every
  //    delegate role — verified against real profiles.acr_calls_today, not
  //    asserted ────────────────────────────────────────────────────────────
  console.log('\n=== 7. Catalogue/quota identity is always the OWNER (deliberate change — see route comments) ===')
  for (const [label, persona] of [['owner', ownerA], ['manager (delegate)', manager]] as [string, Persona][]) {
    await resetQuota(ownerA.userId)
    const before = await service.from('profiles').select('acr_calls_today').eq('id', ownerA.userId).single()
    check(`${label}: quota-before readback succeeded`, !before.error, JSON.stringify(before.error))
    const { status } = await callIdentify(persona.accessToken(), { performance_id: perfA.id, show_id: showA.id })
    check(`${label}: request succeeded`, status === 200)
    const after = await service.from('profiles').select('acr_calls_today').eq('id', ownerA.userId).single()
    check(`${label}: quota-after readback succeeded`, !after.error, JSON.stringify(after.error))
    check(`${label}: quota consumption landed on the OWNER's profile regardless of caller`, (after.data?.acr_calls_today ?? -1) === (before.data?.acr_calls_today ?? -2) + 1, JSON.stringify({ before: before.data, after: after.data }))
  }

  // ── 7b. Confident-match: a controlled successful-detection response, for
  //     both owner and a delegate — verifying the detected result AND the
  //     catalogue writes (user_songs/user_song_performances) land on the
  //     performance OWNER in both cases, with no delegate-catalogue
  //     contamination. Uses the existing, unmodified "multiple detections"
  //     inclusion path (MULTIPLE_DETECTIONS_THRESHOLD=2, unchanged) — two
  //     identical-title stubbed calls, not a threshold change. ────────────
  console.log('\n=== 7b. Confident match: detected result and catalogue writes belong to the OWNER, for owner and delegate callers ===')
  for (const [label, persona] of [['owner', ownerA], ['manager (delegate)', manager]] as [string, Persona][]) {
    const songTitle = `Stub Match ${label} ${RUN}`
    setStubResponse({
      status: { code: 0 },
      metadata: { music: [{ title: songTitle, artists: [{ name: 'Stub Artist' }], score: '95', external_ids: {} }] },
    })

    const first = await callIdentify(persona.accessToken(), { performance_id: perfA.id, show_id: showA.id })
    check(`${label}: first stubbed-match call succeeds (not yet added — below multiple-detections threshold)`, first.status === 200, JSON.stringify(first))

    const second = await callIdentify(persona.accessToken(), { performance_id: perfA.id, show_id: showA.id })
    check(`${label}: second identical stubbed-match call is detected+added`, second.status === 200 && second.json.detected === true && second.json.chunk?.title === songTitle, JSON.stringify(second))

    const ownerSongRows = await pollForUserSong(ownerA.userId, songTitle)
    check(`${label}: catalogue growth landed on the OWNER's user_songs`, ownerSongRows.length === 1, JSON.stringify(ownerSongRows))

    const ownerGuard = await service.from('user_song_performances').select('*').eq('user_id', ownerA.userId).eq('performance_id', perfA.id)
    check(`${label}: user_song_performances readback (owner) succeeded`, !ownerGuard.error, JSON.stringify(ownerGuard.error))
    check(`${label}: guard row exists under the OWNER's user_id`, (ownerGuard.data?.length ?? 0) >= 1, JSON.stringify(ownerGuard.data))

    if (persona.userId !== ownerA.userId) {
      const delegateSongs = await service.from('user_songs').select('id').eq('user_id', persona.userId).eq('song_title', songTitle)
      check(`${label}: no delegate-catalogue contamination — zero user_songs rows under the delegate's own user_id`, !delegateSongs.error && (delegateSongs.data?.length ?? -1) === 0, JSON.stringify(delegateSongs))
      const delegateGuard = await service.from('user_song_performances').select('id').eq('user_id', persona.userId).eq('performance_id', perfA.id)
      check(`${label}: no delegate-catalogue contamination — zero user_song_performances rows under the delegate's own user_id`, !delegateGuard.error && (delegateGuard.data?.length ?? -1) === 0, JSON.stringify(delegateGuard))
    }
  }
  setStubResponse(NO_MATCH_RESPONSE) // restore default for anything after this section

  // ── 8. SQL/TS parity ─────────────────────────────────────────────────────
  console.log('\n=== 8. SQL/TS parity: isWriteCapableRole() vs. roles exercised above ===')
  {
    const roleParity: [string, boolean][] = [
      ['manager', true], ['tour_manager', true], ['band_member', true],
      ['viewer', false], ['some_future_role', false],
    ]
    for (const [role, expected] of roleParity) {
      check(`isWriteCapableRole('${role}') === ${expected}`, isWriteCapableRole(role) === expected)
    }
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
