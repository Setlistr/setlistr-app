// Real HTTP-level regression harness for the full team-invitation lifecycle,
// modeled on a real team shape: an artist (owner), their manager, and a tour
// manager invited by that manager. Covers, end to end through the actual
// running routes (/api/team/invite, /api/team/accept, /api/team/delegates)
// and middleware.ts:
//
//   A. owner invites a manager; manager accepts
//   B. manager invites a tour manager; wrong account can't accept; accept
//   C. tour_manager role enforcement (can write, cannot invite; no `owner`)
//   D. removal: only the owner can remove; soft revoke keeps history; old
//      link can't restore access
//   E. re-invite: same row reopened with a NEW token, reset to pending; old
//      token dead; access only after re-accepting; active member -> 409
//   F. invite to an email with no account: placeholder delegate_id = null
//      (migration 0024)
//   G. intended recipient without Setlistr approval: opens the invite link
//      directly (no /beta detour), accepts only with a fresh inbox code, and
//      gets workspace-only access — never general admission; a cookie saved
//      before this change still resumes the accept page
//   H. squatter (signed up with the invited address): no page discloses the
//      token or invite details; without the token accept fails; WITH a
//      leaked token the code still goes to the real inbox, so a guess fails
//   I. declined, revoked (old link), and manager self-request rows denied
//   J. admission rule: admin exception, fail closed on lookup error
//   K. full-admission parity (team/request) with middleware when user.email
//      differs from the access token's email claim (beta_invites RLS active,
//      as production); acceptance itself proves the CURRENT address's inbox
//
// Requires scripts/local-fixture-setup.sql applied (beta_invites RLS), and
// Supabase Auth sending the magic-link email as a code-only template
// containing {{ .Token }} to a local mail catcher whose Mailpit API is at
// TEST_MAIL_API (default http://127.0.0.1:54324/api/v1, `supabase start`).
// Every positive acceptance reads its code from there, as a person would
// from their inbox. Codes, like tokens, are never printed.
//
// Security model under test: token possession plus inbox ownership, proved
// by a fresh code at acceptance — see docs/team-invite-admission-validation.md.
//
// HARD LOCALHOST GUARD: refuses to run unless both the Supabase URL and
// the app URL under test resolve to 127.0.0.1/localhost. No override.
//
// Requires a local `supabase start` stack and `npm run dev` already running
// against this worktree's .env.local. No RESEND_API_KEY should be set
// locally (none is needed — invite responses carry invite_url directly).
// All fixture accounts are @example.test and are deleted afterward, along
// with every artist_delegates / beta_invites / shows / performances row
// they created. Token values are never printed.
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-team-lifecycle.ts

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import * as crypto from 'crypto'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'
import { checkBetaAdmission } from '../lib/betaAdmission'
import { ADMIN_EMAILS } from '../lib/admin-config'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const APP_URL = process.env.TEST_APP_URL || 'http://127.0.0.1:3000'
const MAIL_API = process.env.TEST_MAIL_API || 'http://127.0.0.1:54324/api/v1'

function isLocalhost(url: string) {
  try {
    const h = new URL(url).hostname
    return h === '127.0.0.1' || h === 'localhost'
  } catch {
    return false
  }
}
if (!isLocalhost(SUPABASE_URL) || !isLocalhost(APP_URL) || !isLocalhost(MAIL_API)) {
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
const createdBetaEmails: string[] = []

// performances.artist_name is NOT NULL (the app always sets it — see
// 0022_start_scheduled_show_artist_name.sql).
const FIXTURE_ARTIST_NAME = 'Fixture Artist'
const PENDING_INVITE_COOKIE = 'sl_pending_team_invite' // middleware.ts

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

interface Persona {
  label: string
  userId: string
  email: string
  client: SupabaseClient // anon-key, signed-in — for direct DB/RLS checks
  cookieHeader: () => string // for real HTTP requests against the dev server
}

// admitted (default true): a beta_invites row, i.e. Setlistr-approved.
// Acceptance no longer requires it; unadmitted personas are used where
// workspace-only admission is under test.
async function createPersona(label: string, opts: { artistName?: string; admitted?: boolean; email?: string } = {}): Promise<Persona> {
  const { artistName, admitted = true } = opts
  const email = (opts.email ?? `teamlife-${RUN}-${label}@example.test`).toLowerCase()
  const password = crypto.randomBytes(18).toString('base64url')
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser failed for ${label}: ${error?.message}`)
  const userId = data.user.id
  createdUserIds.push(userId)
  // Upsert: on_auth_user_created (supabase-schema.sql) may already have created this row.
  const { error: profErr } = await service.from('profiles').upsert(
    { id: userId, full_name: label, email, artist_name: artistName ?? null }, { onConflict: 'id' })
  if (profErr) throw new Error(`profile for ${label} failed: ${profErr.message}`)
  if (admitted) await admit(email)

  const jar = new Map<string, string>()
  const client = createBrowserClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => Array.from(jar.entries()).map(([name, value]) => ({ name, value })),
      setAll: (cookiesToSet: { name: string; value: string }[]) => {
        for (const { name, value } of cookiesToSet) jar.set(name, value)
      },
    },
  })
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password })
  if (signInErr) throw new Error(`sign-in failed for ${label}: ${signInErr.message}`)

  return {
    label, userId, email, client,
    cookieHeader: () => Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; '),
  }
}

async function admit(email: string) {
  const { error } = await service.from('beta_invites').insert({ email, invited_role: 'artist', added_by: 'test-team-lifecycle' })
  if (error) throw new Error(`beta_invites fixture for ${email} failed: ${error.message}`)
  createdBetaEmails.push(email)
}

async function callApi(caller: Persona, method: string, path: string, body?: unknown) {
  const res = await fetch(`${APP_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: caller.cookieHeader() },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}
const invite = (caller: Persona, artistId: string, email: string, role: string) =>
  callApi(caller, 'POST', '/api/team/invite', { artist_id: artistId, delegate_email: email, role })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// The newest 6-digit code emailed to `email` since `since` (ms), from the
// local mail catcher. Never printed.
async function latestCode(email: string, since: number): Promise<string | null> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAIL_API}/search?query=${encodeURIComponent(`to:${email}`)}`)
    const json = await res.json() as { messages?: { ID: string; Created: string }[] }
    const fresh = (json.messages || []).filter(m => new Date(m.Created).getTime() >= since)
    if (fresh.length) {
      const msg = await (await fetch(`${MAIL_API}/message/${fresh[0].ID}`)).json() as { Text?: string }
      const m = (msg.Text || '').match(/\b(\d{6})\b/)
      if (m) return m[1]
    }
    await sleep(300)
  }
  return null
}

const acceptWithoutCode = (caller: Persona, token: string | null) =>
  callApi(caller, 'POST', '/api/team/accept', { token })

// Acceptance as the accept screen does it: ask for a code to the caller's
// own inbox, read it, submit it. Anything refused before the code step
// (wrong account, revoked, expired, unknown token) is returned exactly as
// the accept route reports it. Waits out Supabase Auth's 60-second
// per-address throttle when a persona accepts twice in quick succession.
async function accept(caller: Persona, token: string | null) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const since = Date.now() - 1000
    const sent = await callApi(caller, 'POST', '/api/team/accept/code', { token })
    if (sent.status === 429 && sent.json.code === 'too_soon') { await sleep(61_000); continue }
    if (sent.status !== 200 || !sent.json.sent) return acceptWithoutCode(caller, token)
    const code = await latestCode(caller.email, since)
    if (!code) throw new Error(`no code email for ${caller.label} — is the code-only magic-link template configured?`)
    return callApi(caller, 'POST', '/api/team/accept', { token, code })
  }
  throw new Error(`code throttle did not clear for ${caller.label}`)
}
const remove = (caller: Persona, rowId: string, artistId: string) =>
  callApi(caller, 'DELETE', '/api/team/delegates', { delegate_id: rowId, artist_id: artistId })

function tokenFrom(json: { invite_url?: string }): string | null {
  try { return json.invite_url ? new URL(json.invite_url).searchParams.get('token') : null } catch { return null }
}

// A page navigation (not an API call) through middleware, without following
// redirects — returns the redirect target path, its token, and whatever
// pending-invite cookie value the response set.
async function navigate(path: string, cookie: string) {
  const res = await fetch(`${APP_URL}${path}`, { headers: { Cookie: cookie }, redirect: 'manual' })
  const loc = res.headers.get('location')
  const target = loc ? new URL(loc, APP_URL) : null
  const setCookie = res.headers.get('set-cookie') || ''
  const m = setCookie.match(new RegExp(`${PENDING_INVITE_COOKIE}=([^;]*)`))
  return {
    status: res.status,
    path: target?.pathname ?? null,
    token: target?.searchParams.get('token') ?? null,
    pendingCookie: m ? m[1] : null,
  }
}

// Rendered page HTML (no redirect following) — to assert what a page does
// or does not disclose. Only ever inspected for presence, never printed.
async function pageHtml(path: string, cookie: string) {
  const res = await fetch(`${APP_URL}${path}`, { headers: { Cookie: cookie }, redirect: 'manual' })
  return { status: res.status, body: await res.text() }
}

// Asserts a navigation disclosed neither a token (in Location or the
// pending-invite cookie) nor a redirect into accept-invite.
function checkNoDisclosure(label: string, nav: { path: string | null; token: string | null; pendingCookie: string | null }) {
  check(`${label}: no redirect into accept-invite`, nav.path !== '/app/accept-invite', String(nav.path))
  check(`${label}: no token in Location`, !nav.token, 'present')
  check(`${label}: no pending-invite cookie set`, !nav.pendingCookie, 'present')
}

async function inviteRow(artistId: string, email: string) {
  const { data, error } = await service.from('artist_delegates').select('*').eq('artist_id', artistId).eq('invited_email', email).maybeSingle()
  if (error) throw new Error(`invite row lookup failed: ${error.message}`)
  return data
}

async function delegation(artistId: string, delegateId: string) {
  const { data, error } = await service.from('artist_delegates').select('*').eq('artist_id', artistId).eq('delegate_id', delegateId).maybeSingle()
  if (error) throw new Error(`delegation lookup failed: ${error.message}`)
  return data
}

// Direct-DB write through RLS (can_write_for()): the real capability a
// write-capable team role grants, independent of any one route.
async function canWrite(p: Persona, owner: Persona, showId: string) {
  const { data, error } = await p.client.from('performances')
    .insert({ user_id: owner.userId, venue_name: `Lifecycle ${RUN} ${p.label}`, show_id: showId, artist_name: FIXTURE_ARTIST_NAME })
    .select('id').maybeSingle()
  if (data) createdPerformanceIds.push((data as { id: string }).id)
  return !error && !!data
}

async function cleanup() {
  const errors: string[] = []
  if (createdUserIds.length > 0) {
    const { error } = await service.from('performances').delete().in('user_id', createdUserIds)
    if (error) errors.push(`delete performances: ${error.message}`)
  }
  if (createdShowIds.length > 0) {
    const { error } = await service.from('shows').delete().in('id', createdShowIds)
    if (error) errors.push(`delete shows: ${error.message}`)
  }
  if (createdUserIds.length > 0) {
    const { error: e1 } = await service.from('artist_delegates').delete().in('artist_id', createdUserIds)
    if (e1) errors.push(`delete artist_delegates by artist_id: ${e1.message}`)
    const { error: e2 } = await service.from('artist_delegates').delete().in('delegate_id', createdUserIds)
    if (e2) errors.push(`delete artist_delegates by delegate_id: ${e2.message}`)
  }
  if (createdBetaEmails.length > 0) {
    const { error } = await service.from('beta_invites').delete().in('email', createdBetaEmails)
    if (error) errors.push(`delete beta_invites: ${error.message}`)
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

  // Unique per run, so its presence/absence in rendered /beta HTML is a
  // reliable signal of whether invitation details were disclosed.
  const ARTIST_NAME = `Lifecycle Artist ${RUN}`
  const artist = await createPersona('artist', { artistName: ARTIST_NAME })
  const manager = await createPersona('manager')
  const tourManager = await createPersona('tourmanager')
  const outsider = await createPersona('outsider')

  const { data: show, error: showErr } = await service.from('shows').insert({ created_by: artist.userId }).select('id').single()
  if (showErr || !show) throw new Error(`show fixture failed: ${showErr?.message}`)
  createdShowIds.push(show.id)

  console.log('A. Artist invites a Manager; Manager accepts')
  let r = await invite(artist, artist.userId, manager.email, 'manager')
  check('artist invite -> 200', r.status === 200, JSON.stringify(r.json))
  const managerToken = tokenFrom(r.json)
  r = await callApi(manager, 'GET', `/api/team/accept?token=${managerToken}`)
  check('accept preview: role manager, intended recipient', r.json.role === 'manager' && r.json.is_intended_recipient === true, JSON.stringify({ role: r.json.role, intended: r.json.is_intended_recipient }))
  r = await accept(manager, managerToken)
  check('manager accept -> 200', r.status === 200, JSON.stringify(r.json))

  console.log('\nB. Manager invites a Tour Manager; wrong account cannot accept; Tour Manager accepts')
  r = await invite(manager, artist.userId, tourManager.email, 'tour_manager')
  check('manager invite -> 200', r.status === 200, JSON.stringify(r.json))
  const tmToken1 = tokenFrom(r.json)
  r = await accept(outsider, tmToken1)
  check('outsider accept -> 403', r.status === 403, String(r.status))
  check('no write access before accepting', !(await canWrite(tourManager, artist, show.id)))
  r = await accept(tourManager, tmToken1)
  check('tour manager accept -> 200', r.status === 200, JSON.stringify(r.json))
  const tmRow = await delegation(artist.userId, tourManager.userId)
  check('row: role tour_manager, accepted, not revoked', tmRow?.role === 'tour_manager' && !!tmRow.accepted_at && !tmRow.revoked_at)
  if (!tmRow) throw new Error('tour manager delegation row missing — cannot continue')

  console.log('\nC. Tour Manager role enforcement')
  check('tour manager can write for the artist', await canWrite(tourManager, artist, show.id))
  r = await invite(tourManager, artist.userId, `teamlife-${RUN}-x@example.test`, 'viewer')
  check('tour manager cannot invite -> 403', r.status === 403, String(r.status))
  r = await invite(manager, artist.userId, `teamlife-${RUN}-y@example.test`, 'owner')
  check('role=owner cannot be assigned -> 400', r.status === 400, String(r.status))

  console.log('\nD. Removal')
  r = await remove(tourManager, tmRow.id, artist.userId)
  check('tour manager cannot remove via owner route -> 403', r.status === 403, String(r.status))
  r = await remove(manager, tmRow.id, artist.userId)
  check('manager cannot remove -> 403 (owner-only)', r.status === 403, String(r.status))
  r = await remove(artist, tmRow.id, artist.userId)
  check('artist removes tour manager -> 200', r.status === 200, JSON.stringify(r.json))
  const removedRow = await delegation(artist.userId, tourManager.userId)
  check('row persists, revoked_at set, acceptance history kept', !!removedRow?.revoked_at && !!removedRow.accepted_at)
  check('write denied after removal', !(await canWrite(tourManager, artist, show.id)))
  await accept(tourManager, tmToken1)
  check('replaying the old link leaves the row revoked', !!(await delegation(artist.userId, tourManager.userId))?.revoked_at)
  check('replaying the old link does not restore write access', !(await canWrite(tourManager, artist, show.id)))

  console.log('\nE. Re-invite')
  r = await invite(artist, artist.userId, tourManager.email, 'tour_manager')
  check('re-invite -> 200', r.status === 200, JSON.stringify(r.json))
  const tmToken2 = tokenFrom(r.json)
  const reopened = await delegation(artist.userId, tourManager.userId)
  check('same row reopened', reopened?.id === tmRow.id)
  check('new token, different from the removed one', !!tmToken2 && tmToken2 !== tmToken1)
  check('reset to pending (accepted_at, revoked_at cleared)', !!reopened && !reopened.accepted_at && !reopened.revoked_at)
  check('no access before re-accepting', !(await canWrite(tourManager, artist, show.id)))
  r = await accept(tourManager, tmToken1)
  check('old token cannot accept the reopened invite', r.status !== 200 && !(await delegation(artist.userId, tourManager.userId))?.accepted_at, String(r.status))
  r = await accept(tourManager, tmToken2)
  check('new token accept -> 200', r.status === 200, JSON.stringify(r.json))
  check('access restored only after re-accepting', await canWrite(tourManager, artist, show.id))
  r = await invite(artist, artist.userId, tourManager.email, 'tour_manager')
  check('inviting an active member again -> 409', r.status === 409, String(r.status))

  console.log('\nF. Invite to an email with no account (migration 0024 placeholder)')
  const noAccountEmail = `teamlife-${RUN}-noaccount@example.test`
  r = await invite(artist, artist.userId, noAccountEmail, 'tour_manager')
  check('no-account invite -> 200', r.status === 200, JSON.stringify(r.json))
  const { data: placeholder, error: phErr } = await service.from('artist_delegates').select('delegate_id, accepted_at').eq('artist_id', artist.userId).eq('invited_email', noAccountEmail).maybeSingle()
  if (phErr) throw new Error(`placeholder lookup failed: ${phErr.message}`)
  check('placeholder: delegate_id null, unaccepted', !!placeholder && placeholder.delegate_id === null && !placeholder.accepted_at)

  console.log('\nG. Intended recipient without Setlistr approval: inbox code, workspace-only access')
  // Placeholder invite (no account at invite time), then the recipient signs
  // up with that address — the realistic new-recipient shape.
  const newcomerEmail = `teamlife-${RUN}-newcomer@example.test`
  r = await invite(artist, artist.userId, newcomerEmail, 'tour_manager')
  check('invite to no-account email -> 200', r.status === 200, JSON.stringify(r.json))
  const newcomerToken = tokenFrom(r.json)
  if (!newcomerToken) throw new Error('no token returned for newcomer invite — cannot continue')
  // Production's fresh-invite token shape (0009: encode(gen_random_bytes(16),'hex')).
  // If this fails, scripts/local-fixture-setup.sql isn't applied and the
  // checks below are testing a token shape production never issues.
  check('precondition: fresh invite token has production\'s 32-hex shape', /^[0-9a-f]{32}$/.test(newcomerToken), 'not 32-hex — apply scripts/local-fixture-setup.sql')
  const newcomer = await createPersona('newcomer', { email: newcomerEmail, admitted: false })

  let nav = await navigate(`/app/accept-invite?token=${newcomerToken}`, newcomer.cookieHeader())
  check('unadmitted: the invite link opens the accept page (no /beta detour)', nav.status === 200, `${nav.status} ${nav.path}`)
  check('unadmitted: no pending-invite cookie needed or set', !nav.pendingCookie, 'present')
  nav = await navigate('/app/dashboard', newcomer.cookieHeader())
  check('unadmitted, not yet accepted: other pages still -> /beta', nav.path === '/beta', `${nav.status} ${nav.path}`)

  const before = await inviteRow(artist.userId, newcomerEmail)
  r = await acceptWithoutCode(newcomer, newcomerToken)
  check('token holder without a code: accept -> 400 code_required', r.status === 400 && r.json.code === 'code_required', `${r.status} ${JSON.stringify(r.json)}`)
  r = await callApi(newcomer, 'POST', '/api/team/accept', { token: newcomerToken, code: '000000' })
  check('token holder with a wrong code: accept -> 400 bad_code', r.status === 400 && r.json.code === 'bad_code', `${r.status} ${JSON.stringify(r.json)}`)
  const after = await inviteRow(artist.userId, newcomerEmail)
  check('refused accepts left the invite unbound and unaccepted', !!after && after.delegate_id === null && !after.accepted_at && JSON.stringify(before) === JSON.stringify(after))

  r = await callApi(newcomer, 'GET', `/api/team/accept?token=${newcomerToken}`)
  check('accept preview marks them the intended recipient', r.json.is_intended_recipient === true)
  r = await accept(newcomer, newcomerToken)
  check('intended recipient with the inbox code: accept -> 200', r.status === 200, JSON.stringify(r.json))
  const bound = await inviteRow(artist.userId, newcomerEmail)
  check('invite bound to the recipient and accepted', bound?.delegate_id === newcomer.userId && !!bound.accepted_at)
  r = await acceptWithoutCode(newcomer, newcomerToken)
  check('repeat accept by the same recipient: 200 already_accepted, no code', r.status === 200 && r.json.already_accepted === true, JSON.stringify(r.json))

  nav = await navigate('/app/dashboard', newcomer.cookieHeader())
  check('workspace-only: Dashboard allowed', nav.status === 200, `${nav.status} ${nav.path}`)
  nav = await navigate('/app/onboarding', newcomer.cookieHeader())
  check('workspace-only: artist onboarding -> /app/manager', nav.path === '/app/manager', `${nav.status} ${nav.path}`)
  check('workspace-only: no beta_invites row was created', !(await service.from('beta_invites').select('id').eq('email', newcomerEmail).maybeSingle()).data)
  r = await callApi(newcomer, 'POST', '/api/team/request', { artist_email: outsider.email })
  check('workspace-only: request to manage another artist -> 403', r.status === 403 && r.json.code === 'admission_required', `${r.status} ${JSON.stringify(r.json)}`)

  console.log('\nG3. Reopened invite (UUID-shaped token, lib/reopenRevokedDelegation.ts); a cookie saved before this change')
  {
    // Production holds BOTH token shapes: fresh invites are 32-hex (G above),
    // re-invites after removal are UUIDs.
    const reinvitee = await createPersona('reinvitee', { admitted: false })
    r = await invite(artist, artist.userId, reinvitee.email, 'tour_manager')
    const firstRow = await delegation(artist.userId, reinvitee.userId)
    r = await remove(artist, firstRow!.id, artist.userId)
    r = await invite(artist, artist.userId, reinvitee.email, 'tour_manager')
    const reopenedToken = tokenFrom(r.json)
    check('precondition: reopened token is UUID-shaped', !!reopenedToken && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(reopenedToken))
    nav = await navigate(`/app/accept-invite?token=${reopenedToken}`, reinvitee.cookieHeader())
    check('reopened (UUID) token: unapproved recipient reaches the accept page', nav.status === 200, `${nav.status} ${nav.path}`)
    // A pending-invite cookie saved by the previous release still resumes.
    nav = await navigate('/beta', `${reinvitee.cookieHeader()}; ${PENDING_INVITE_COOKIE}=${reopenedToken}`)
    check('legacy cookie: /beta resumes the accept page with the SAME token', nav.path === '/app/accept-invite' && nav.token === reopenedToken, `${nav.status} ${nav.path}`)
    r = await accept(reinvitee, reopenedToken)
    check('reopened (UUID) token: accept with code -> 200', r.status === 200, JSON.stringify(r.json))
  }

  console.log('\nG2. Cross-device recovery requires reopening the inbox-delivered link')
  // Independent of G's state: a fresh, still-PENDING invite, so a pass here
  // can't come from there being nothing left to disclose. The recipient is
  // approved and signed in on a device that never presented the link (no
  // cookie) — they must NOT be routed to the invite by email match.
  const travelerEmail = `teamlife-${RUN}-traveler@example.test`
  r = await invite(artist, artist.userId, travelerEmail, 'band_member')
  const travelerToken = tokenFrom(r.json)
  const traveler = await createPersona('traveler', { email: travelerEmail })
  const pendingBefore = await inviteRow(artist.userId, travelerEmail)
  check('precondition: invite is pending (unbound, unaccepted)', !!pendingBefore && pendingBefore.delegate_id === null && !pendingBefore.accepted_at && !pendingBefore.revoked_at)
  for (const path of ['/beta', '/', '/app/dashboard']) {
    checkNoDisclosure(`other device: ${path}`, await navigate(path, traveler.cookieHeader()))
  }
  nav = await navigate(`/app/accept-invite?token=${travelerToken}`, traveler.cookieHeader())
  check('other device: reopening the inbox link reaches accept-invite', nav.status === 200, `${nav.status} ${nav.path}`)
  r = await accept(traveler, travelerToken)
  check('other device: accept with the reopened link -> 200', r.status === 200, JSON.stringify(r.json))

  console.log('\nH. Squatter: claims the invited address, never received or presented the token')
  for (const admitted of [false, true]) {
    const tag = admitted ? 'approved squatter' : 'unapproved squatter'
    const victimEmail = `teamlife-${RUN}-victim-${admitted ? 'a' : 'u'}@example.test`
    r = await invite(artist, artist.userId, victimEmail, 'tour_manager')
    check(`${tag}: placeholder invite created`, r.status === 200, JSON.stringify(r.json))
    const victimToken = tokenFrom(r.json)
    const victimBefore = await inviteRow(artist.userId, victimEmail)
    // Self-typed signup with the invited address (production: Confirm email OFF).
    const squatter = await createPersona(`squatter-${admitted ? 'a' : 'u'}`, { email: victimEmail, admitted })

    for (const path of ['/', '/beta', '/app/dashboard', '/app/accept-invite']) {
      checkNoDisclosure(`${tag}: ${path}`, await navigate(path, squatter.cookieHeader()))
    }
    if (!admitted) {
      const page = await pageHtml('/beta', squatter.cookieHeader())
      check(`${tag}: /beta discloses no invitation details`, !page.body.includes(ARTIST_NAME))
      check(`${tag}: /beta discloses no token`, !!victimToken && !page.body.includes(victimToken))
    }
    r = await callApi(squatter, 'POST', '/api/team/accept', {})
    check(`${tag}: accept without a token -> 400`, r.status === 400, String(r.status))
    r = await accept(squatter, crypto.randomUUID())
    check(`${tag}: accept with a guessed token -> rejected`, r.status === 404 || r.status === 403, String(r.status))
    // The inbox code is what stops a squatter who obtained the link: a code
    // can be requested, but it goes to the invited inbox, not to them.
    r = await callApi(squatter, 'POST', '/api/team/accept', { token: victimToken, code: '123456' })
    check(`${tag}: holding a leaked token, a guessed code -> 400 bad_code`, r.status === 400 && r.json.code === 'bad_code', `${r.status} ${JSON.stringify(r.json)}`)
    const victimAfter = await inviteRow(artist.userId, victimEmail)
    check(`${tag}: invite still unbound, unaccepted, unchanged`, !!victimAfter && victimAfter.delegate_id === null && !victimAfter.accepted_at && JSON.stringify(victimBefore) === JSON.stringify(victimAfter))
  }

  // A cookie is navigation context, not authorization: one naming someone
  // else's invite only resumes the accept page, which then refuses.
  const otherEmail = `teamlife-${RUN}-other@example.test`
  r = await invite(artist, artist.userId, otherEmail, 'viewer')
  const otherToken = tokenFrom(r.json)
  const cookieProbe = await createPersona('cookieprobe', { admitted: false })
  r = await callApi(cookieProbe, 'GET', `/api/team/accept?token=${otherToken}`)
  check('cookie/token naming ANOTHER recipient\'s invite: not the intended recipient', r.json.is_intended_recipient === false && !r.json.recipient_email, JSON.stringify({ intended: r.json.is_intended_recipient }))
  r = await callApi(cookieProbe, 'POST', '/api/team/accept/code', { token: otherToken })
  check('…and no code is sent for it -> 403', r.status === 403, String(r.status))
  // Intended recipient whose pending invite is revoked: refused afterwards.
  const revokedRecipient = await createPersona('revokedrecipient', { admitted: false })
  r = await invite(artist, artist.userId, revokedRecipient.email, 'viewer')
  const revokedToken = tokenFrom(r.json)
  const revokedRow = await delegation(artist.userId, revokedRecipient.userId)
  r = await remove(artist, revokedRow!.id, artist.userId)
  check('owner revokes the pending invite -> 200', r.status === 200, String(r.status))
  r = await callApi(revokedRecipient, 'POST', '/api/team/accept/code', { token: revokedToken })
  check('revoked invite: no code sent -> 404', r.status === 404, String(r.status))
  await admit(revokedRecipient.email)
  r = await accept(revokedRecipient, revokedToken)
  check('revoked invite, approved holder of its token: accept -> 404', r.status === 404, String(r.status))
  check('revoked invite: still unaccepted', !(await delegation(artist.userId, revokedRecipient.userId))?.accepted_at)

  console.log('\nI. Terminal and wrong-direction rows stay denied for admitted callers')
  const declinedTarget = await createPersona('declined')
  r = await invite(artist, artist.userId, declinedTarget.email, 'viewer')
  const declinedToken = tokenFrom(r.json)
  const { error: declineErr } = await service.from('artist_delegates').update({ declined_at: new Date().toISOString() }).eq('artist_id', artist.userId).eq('delegate_id', declinedTarget.userId)
  if (declineErr) throw new Error(`decline fixture failed: ${declineErr.message}`)
  r = await accept(declinedTarget, declinedToken)
  check('declined invite: accept -> 404', r.status === 404, String(r.status))
  check('declined invite: still unaccepted', !(await delegation(artist.userId, declinedTarget.userId))?.accepted_at)

  r = await accept(tourManager, tmToken1)
  check('removed-then-reinvited: the old link is rejected -> 404', r.status === 404, String(r.status))

  // Manager self-request (migration 0023 direction): invited_by = delegate_id
  // = the requesting manager. Its token must never self-accept here.
  const { data: selfReq, error: selfReqErr } = await service.from('artist_delegates').insert({
    artist_id: artist.userId, delegate_id: outsider.userId, invited_by: outsider.userId,
    role: 'manager', invited_email: artist.email,
  }).select('id, invite_token').single()
  if (selfReqErr || !selfReq) throw new Error(`manager self-request fixture failed: ${selfReqErr?.message}`)
  r = await accept(outsider, selfReq.invite_token)
  check('manager self-request: accept -> 404', r.status === 404, String(r.status))
  check('manager self-request: still unaccepted', !(await delegation(artist.userId, outsider.userId))?.accepted_at)

  console.log('\nK. Admission parity with middleware when user.email differs from the token\'s email claim')
  {
    // Precondition: beta_invites RLS (users_read_own_invite) is active, as
    // in production — otherwise every check below passes vacuously. Apply
    // scripts/local-fixture-setup.sql if this fails.
    const { data: ownRow, error: ownErr } = await manager.client.from('beta_invites').select('email').eq('email', manager.email)
    const { data: otherRow, error: otherErr } = await manager.client.from('beta_invites').select('email').eq('email', tourManager.email)
    check('precondition: session client reads its OWN beta_invites row', !ownErr && ownRow?.length === 1, JSON.stringify(ownErr))
    check('precondition: RLS hides OTHER users\' beta_invites rows', !otherErr && otherRow?.length === 0, 'RLS not active — apply scripts/local-fixture-setup.sql')

    const claimOf = async (p: Persona) => {
      const { data } = await p.client.auth.getSession()
      const tok = data.session?.access_token
      return tok ? JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString()).email as string : null
    }
    const diverge = async (label: string) => {
      const oldEmail = `teamlife-${RUN}-${label}-old@example.test`
      const newEmail = `teamlife-${RUN}-${label}-new@example.test`
      const p = await createPersona(label, { email: oldEmail, admitted: false })
      // Server-side change of the account email (no new token issued): the
      // session keeps a token whose email claim is still oldEmail.
      const { error } = await service.auth.admin.updateUserById(p.userId, { email: newEmail, email_confirm: true })
      if (error) throw new Error(`email change fixture failed: ${error.message}`)
      const { data: { user } } = await p.client.auth.getUser()
      check(`${label}: precondition — user.email is the NEW address`, user?.email === newEmail)
      check(`${label}: precondition — token email claim is still the OLD address`, (await claimOf(p)) === oldEmail)
      return { p, oldEmail, newEmail }
    }

    // Full admission (team/request) must be no broader than middleware's.
    // K1: admitted ONLY under the new user.email. Middleware (session
    // client + RLS on the token's OLD email claim) denies; the API must too.
    const k1 = await diverge('mover')
    await admit(k1.newEmail)
    nav = await navigate('/app/dashboard', k1.p.cookieHeader())
    check('K1 middleware: denies (redirects to /beta)', nav.path === '/beta', `${nav.status} ${nav.path}`)
    r = await callApi(k1.p, 'POST', '/api/team/request', { artist_email: outsider.email })
    check('K1 API: denies too -> 403 admission_required (no broader than middleware)', r.status === 403 && r.json.code === 'admission_required', `${r.status} ${JSON.stringify(r.json)}`)

    // K2: admitted ONLY under the token's OLD email claim. Middleware's
    // eq(user.email = new) + RLS(old) finds nothing -> denies; the API too.
    const k2 = await diverge('mover2')
    await admit(k2.oldEmail)
    nav = await navigate('/app/dashboard', k2.p.cookieHeader())
    check('K2 middleware: denies (redirects to /beta)', nav.path === '/beta', `${nav.status} ${nav.path}`)
    r = await callApi(k2.p, 'POST', '/api/team/request', { artist_email: outsider.email })
    check('K2 API: denies -> 403 admission_required', r.status === 403 && r.json.code === 'admission_required', `${r.status} ${JSON.stringify(r.json)}`)

    // K3: once the session refreshes (token claim = new user.email), the
    // legitimately admitted account is admitted by both.
    const { error: refreshErr } = await k1.p.client.auth.refreshSession()
    if (refreshErr) throw new Error(`refresh failed: ${refreshErr.message}`)
    check('K3 precondition: refreshed token claim is the NEW address', (await claimOf(k1.p)) === k1.newEmail)
    nav = await navigate('/app/dashboard', k1.p.cookieHeader())
    check('K3 middleware: admits (no /beta redirect)', nav.path !== '/beta', `${nav.status} ${nav.path}`)
    r = await callApi(k1.p, 'POST', '/api/team/request', { artist_email: outsider.email })
    check('K3 API: admits -> 200', r.status === 200, `${r.status} ${JSON.stringify(r.json)}`)

    // K4: an invite to the account's CURRENT address is accepted with a code
    // from that address's inbox; the old address proves nothing.
    r = await invite(artist, artist.userId, k2.newEmail, 'viewer')
    const k4Token = tokenFrom(r.json)
    // The code goes to the session's current address, so that's the inbox to read.
    r = await accept({ ...k2.p, email: k2.newEmail }, k4Token)
    check('K4: invite to the current address, code from its inbox -> 200', r.status === 200, `${r.status} ${JSON.stringify(r.json)}`)
  }

  console.log('\nJ. Admission rule (lib/betaAdmission.ts) — admin exception and fail-closed')
  {
    const untouchable = { from: () => { throw new Error('admin path must not query') } } as unknown as SupabaseClient
    const result = (data: unknown, error: unknown) => ({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error }) }) }) }),
    }) as unknown as SupabaseClient
    check('admin email -> admitted (no lookup)', (await checkBetaAdmission(untouchable, ADMIN_EMAILS[0])) === 'admitted')
    check('beta_invites row -> admitted', (await checkBetaAdmission(result({ id: 'x' }, null), 'a@example.test')) === 'admitted')
    check('no row -> not_admitted', (await checkBetaAdmission(result(null, null), 'a@example.test')) === 'not_admitted')
    check('lookup error -> error (callers deny)', (await checkBetaAdmission(result(null, { message: 'boom' }), 'a@example.test')) === 'error')
    check('no email -> not_admitted', (await checkBetaAdmission(untouchable, null)) === 'not_admitted')
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
