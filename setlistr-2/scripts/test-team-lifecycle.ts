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
//   G. unadmitted (beta) recipient: invite link -> /beta with the invite
//      preserved; after approval, /beta resumes the SAME invite — both with
//      the pending-invite cookie and without it (approval opened elsewhere)
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

async function createPersona(label: string, artistName?: string): Promise<Persona> {
  const email = `teamlife-${RUN}-${label}@example.test`.toLowerCase()
  const password = crypto.randomBytes(18).toString('base64url')
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser failed for ${label}: ${error?.message}`)
  const userId = data.user.id
  createdUserIds.push(userId)
  // Upsert: on_auth_user_created (supabase-schema.sql) may already have created this row.
  const { error: profErr } = await service.from('profiles').upsert(
    { id: userId, full_name: label, email, artist_name: artistName ?? null }, { onConflict: 'id' })
  if (profErr) throw new Error(`profile for ${label} failed: ${profErr.message}`)

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
const accept = (caller: Persona, token: string | null) =>
  callApi(caller, 'POST', '/api/team/accept', { token })
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

  const artist = await createPersona('artist', 'Lifecycle Artist')
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

  console.log('\nG. Unadmitted (beta) recipient: invite preserved through approval')
  const newcomer = await createPersona('newcomer') // signed in, NOT in beta_invites
  r = await invite(artist, artist.userId, newcomer.email, 'tour_manager')
  check('invite to unadmitted account -> 200', r.status === 200, JSON.stringify(r.json))
  const newcomerToken = tokenFrom(r.json)
  if (!newcomerToken) throw new Error('no token returned for newcomer invite — cannot continue')

  let nav = await navigate(`/app/accept-invite?token=${newcomerToken}`, newcomer.cookieHeader())
  check('unadmitted: invite link redirects to /beta', nav.status >= 300 && nav.status < 400 && nav.path === '/beta', `${nav.status} ${nav.path}`)
  check('unadmitted: pending-invite cookie set to the SAME token', nav.pendingCookie === newcomerToken, nav.pendingCookie ? 'present-mismatch' : 'absent')
  const pendingCookie = `${PENDING_INVITE_COOKIE}=${nav.pendingCookie}`

  nav = await navigate('/beta', `${newcomer.cookieHeader()}; ${pendingCookie}`)
  check('unadmitted: /beta renders (no redirect, no loop)', nav.status === 200, String(nav.status))
  check('unadmitted: cannot accept before approval (still not a member)', !(await delegation(artist.userId, newcomer.userId))?.accepted_at)

  const { error: betaErr } = await service.from('beta_invites').insert({ email: newcomer.email, invited_role: 'artist', added_by: 'test-team-lifecycle' })
  if (betaErr) throw new Error(`beta_invites fixture failed: ${betaErr.message}`)
  createdBetaEmails.push(newcomer.email)

  nav = await navigate('/beta', `${newcomer.cookieHeader()}; ${pendingCookie}`)
  check('approved (with cookie): /beta resumes accept-invite', nav.path === '/app/accept-invite', `${nav.status} ${nav.path}`)
  check('approved (with cookie): resumes the SAME token', nav.token === newcomerToken, nav.token ? 'present-mismatch' : 'absent')

  nav = await navigate('/beta', newcomer.cookieHeader())
  check('approved (no cookie, e.g. other device): /beta resumes accept-invite', nav.path === '/app/accept-invite', `${nav.status} ${nav.path}`)
  check('approved (no cookie): resumes the SAME token via email lookup', nav.token === newcomerToken, nav.token ? 'present-mismatch' : 'absent')

  nav = await navigate(`/app/accept-invite?token=${newcomerToken}`, newcomer.cookieHeader())
  check('approved: invite link now reaches accept-invite (no redirect)', nav.status === 200, `${nav.status} ${nav.path}`)
  r = await accept(newcomer, newcomerToken)
  check('approved: accept -> 200', r.status === 200, JSON.stringify(r.json))

  console.log(`\n${pass} passed, ${fail} failed`)

  await cleanup()

  if (fail > 0) process.exit(1)
}

main().catch(async (err) => {
  console.error('Harness error:', err)
  await cleanup().catch(() => {})
  process.exit(1)
})
