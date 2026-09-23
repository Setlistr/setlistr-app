// Real HTTP-level integration tests for the invite / accept / revoke routes
// (delegation containment hotfix), run against a LOCAL Supabase instance and
// a LOCALLY running Next.js dev server. Uses real Supabase Auth sessions
// (via @supabase/ssr's cookie contract, the same one the browser uses) and
// the actual routes — no mocked authorization, no direct RLS bypass for the
// behavior under test.
//
// HARD LOCALHOST GUARD: refuses to run unless both the Supabase URL and the
// app URL under test resolve to 127.0.0.1/localhost. There is no override.
//
// Requires a local `supabase start` stack and `npm run dev` already running
// against this worktree's .env.local (which must itself point at the local
// stack, never production). Creates and deletes its own synthetic Auth
// users/profiles/delegation rows — does not touch any other data.
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-invite-http-integration.ts

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
  console.error(`REFUSING TO RUN: this harness only targets localhost.`)
  console.error(`  NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL || '(unset)'}`)
  console.error(`  APP_URL=${APP_URL}`)
  process.exit(1)
}
if (!ANON_KEY || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const service: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY)
const admin = service

const RUN = Date.now().toString(36)
const createdUserIds: string[] = []

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
  cookieHeader: () => string
}

async function createPersona(label: string, emailOverride?: string): Promise<Persona> {
  // The invite route always lowercases delegate_email before querying
  // profiles.email, and that column isn't queried case-insensitively — so
  // fixture emails must be lowercase too, or a real, matching account looks
  // to the route like "no account found" and it silently falls back to the
  // placeholder branch instead.
  const email = (emailOverride ?? `inv-test-${RUN}-${label}@example.test`).toLowerCase()
  const password = crypto.randomBytes(18).toString('base64url')

  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser failed for ${label}: ${error?.message}`)
  const userId = data.user.id
  createdUserIds.push(userId)

  const { error: profErr } = await service.from('profiles').insert({
    id: userId, full_name: label, email, artist_name: label,
  })
  if (profErr) throw new Error(`profile insert failed for ${label}: ${profErr.message}`)

  const jar = new Map<string, string>()
  const browserClient = createBrowserClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => Array.from(jar.entries()).map(([name, value]) => ({ name, value })),
      setAll: (cookiesToSet: { name: string; value: string }[]) => {
        for (const { name, value } of cookiesToSet) jar.set(name, value)
      },
    },
  })
  const { error: signInErr } = await browserClient.auth.signInWithPassword({ email, password })
  if (signInErr) throw new Error(`sign-in failed for ${label}: ${signInErr.message}`)

  return {
    label, userId, email,
    cookieHeader: () => Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; '),
  }
}

const UNAUTH: Persona = { label: 'unauthenticated', userId: '', email: '', cookieHeader: () => '' }

async function seedDelegation(opts: {
  artistId: string; delegateId: string; role: string
  accepted?: boolean; revoked?: boolean
}) {
  const { data, error } = await service.from('artist_delegates').insert({
    artist_id: opts.artistId,
    delegate_id: opts.delegateId,
    role: opts.role,
    accepted_at: opts.accepted ? new Date().toISOString() : null,
    revoked_at: opts.revoked ? new Date().toISOString() : null,
  }).select('id').single()
  if (error || !data) throw new Error(`seedDelegation failed: ${error?.message}`)
  return data.id as string
}

async function callInvite(caller: Persona, body: Record<string, unknown>) {
  const res = await fetch(`${APP_URL}/api/team/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(caller.cookieHeader() ? { Cookie: caller.cookieHeader() } : {}) },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

async function callAccept(caller: Persona, token: string) {
  const res = await fetch(`${APP_URL}/api/team/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(caller.cookieHeader() ? { Cookie: caller.cookieHeader() } : {}) },
    body: JSON.stringify({ token }),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

async function callRevoke(caller: Persona, rowId: string, artistId: string) {
  const res = await fetch(`${APP_URL}/api/team/delegates`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...(caller.cookieHeader() ? { Cookie: caller.cookieHeader() } : {}) },
    body: JSON.stringify({ delegate_id: rowId, artist_id: artistId }),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

async function getDelegationRow(artistId: string, delegateId: string) {
  const { data, error } = await service.from('artist_delegates').select('*').eq('artist_id', artistId).eq('delegate_id', delegateId).maybeSingle()
  if (error) throw new Error(`getDelegationRow(${artistId}, ${delegateId}) failed: ${error.message}`)
  return data
}
async function getRowById(id: string) {
  const { data, error } = await service.from('artist_delegates').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`getRowById(${id}) failed: ${error.message}`)
  return data
}
async function findByInvitedEmail(artistId: string, email: string) {
  const { data, error } = await service.from('artist_delegates').select('*').eq('artist_id', artistId).eq('invited_email', email).maybeSingle()
  if (error) throw new Error(`findByInvitedEmail(${artistId}, ${email}) failed: ${error.message}`)
  return data
}

// Field-level equality for a full artist_delegates row snapshot. Strict
// equality for scalars; JSON comparison for the one array column (`grants`)
// so a same-contents array isn't reported as "changed" on reference
// inequality alone.
function rowsEqual(a: Record<string, unknown> | null, b: Record<string, unknown> | null): boolean {
  if (a === null || b === null) return a === b
  const aKeys = Object.keys(a).sort()
  const bKeys = Object.keys(b).sort()
  if (aKeys.length !== bKeys.length || aKeys.some((k, i) => k !== bKeys[i])) return false
  return aKeys.every((k) => {
    const av = a[k]
    const bv = b[k]
    if (av === bv) return true
    if (typeof av === 'object' && typeof bv === 'object') return JSON.stringify(av) === JSON.stringify(bv)
    return false
  })
}

async function cleanup() {
  const errors: string[] = []

  const { error: byArtistErr } = await service.from('artist_delegates').delete().in('artist_id', createdUserIds)
  if (byArtistErr) errors.push(`delete artist_delegates by artist_id: ${byArtistErr.message}`)

  const { error: byDelegateErr } = await service.from('artist_delegates').delete().in('delegate_id', createdUserIds)
  if (byDelegateErr) errors.push(`delete artist_delegates by delegate_id: ${byDelegateErr.message}`)

  for (const id of createdUserIds) {
    const { error: profErr } = await service.from('profiles').delete().eq('id', id)
    if (profErr) errors.push(`delete profile ${id}: ${profErr.message}`)

    const { error: userErr } = await admin.auth.admin.deleteUser(id)
    if (userErr) errors.push(`delete auth user ${id}: ${userErr.message}`)
  }

  if (errors.length > 0) {
    console.error(`Cleanup failed with ${errors.length} error(s):`)
    for (const e of errors) console.error(`  ${e}`)
    throw new Error(`cleanup failed with ${errors.length} error(s)`)
  }
}

async function main() {
  console.log(`Run ${RUN} — targeting ${APP_URL} / ${SUPABASE_URL}\n`)

  const ownerA = await createPersona('ownerA')
  const ownerB = await createPersona('ownerB')
  const mgrAccepted = await createPersona('mgrAccepted')
  const viewerAccepted = await createPersona('viewerAccepted')
  const tmAccepted = await createPersona('tmAccepted')
  const bandAccepted = await createPersona('bandAccepted')
  const unknownRoleAccepted = await createPersona('unknownRoleAccepted')
  const mgrUnaccepted = await createPersona('mgrUnaccepted')
  const mgrRevoked = await createPersona('mgrRevoked')
  const mgrOtherArtist = await createPersona('mgrOtherArtist')
  const unrelatedUser = await createPersona('unrelatedUser')
  const existingAccount = await createPersona('existingAccount')
  const wrongRecipient = await createPersona('wrongRecipient')
  const ownerFresh1 = await createPersona('ownerFresh1')
  const mgrInviteTarget = await createPersona('mgrInviteTarget')

  await seedDelegation({ artistId: ownerA.userId, delegateId: mgrAccepted.userId, role: 'manager', accepted: true })
  await seedDelegation({ artistId: ownerA.userId, delegateId: viewerAccepted.userId, role: 'viewer', accepted: true })
  await seedDelegation({ artistId: ownerA.userId, delegateId: tmAccepted.userId, role: 'tour_manager', accepted: true })
  await seedDelegation({ artistId: ownerA.userId, delegateId: bandAccepted.userId, role: 'band_member', accepted: true })
  await seedDelegation({ artistId: ownerA.userId, delegateId: unknownRoleAccepted.userId, role: 'superadmin', accepted: true })
  await seedDelegation({ artistId: ownerA.userId, delegateId: mgrUnaccepted.userId, role: 'manager', accepted: false })
  await seedDelegation({ artistId: ownerA.userId, delegateId: mgrRevoked.userId, role: 'manager', accepted: true, revoked: true })
  await seedDelegation({ artistId: ownerB.userId, delegateId: mgrOtherArtist.userId, role: 'manager', accepted: true })

  console.log('\n1. Owner can invite a fresh (no-account) email — placeholder row created')
  {
    // Dedicated throwaway owner: the pre-existing (non-hotfix) insert logic
    // stores placeholder rows as delegate_id === artist_id, which the
    // artist_delegates_artist_id_delegate_id_key UNIQUE constraint only
    // allows ONE of per artist until it's accepted/rebound. Using ownerA
    // here would collide with the placeholder tests in section 16-17 below.
    // Confirmed by an earlier run of this harness: reusing ownerA for a
    // second concurrent fresh-email invite produced a real "Failed to
    // create invite" 500 from that unique-constraint collision — a
    // pre-existing behavior of the insert branch this hotfix does not
    // touch, not a regression from this patch. Out of scope to fix here.
    const email = `inv-test-${RUN}-fresh1@example.test`
    const r = await callInvite(ownerFresh1, { artist_id: ownerFresh1.userId, delegate_email: email, role: 'manager' })
    check('status 200', r.status === 200, JSON.stringify(r.json))
    const row = await findByInvitedEmail(ownerFresh1.userId, email)
    check('row created, placeholder (delegate_id === artist_id)', !!row && row.delegate_id === ownerFresh1.userId)
    check('role stored as requested', row?.role === 'manager')
  }

  console.log('\n2. Accepted non-revoked manager can invite on behalf of the artist')
  {
    // Targets an existing account (not a fresh email) — see note above on
    // why a second fresh-email placeholder for the same artist can't be
    // used here without tripping the unrelated pre-existing constraint
    // collision.
    const r = await callInvite(mgrAccepted, { artist_id: ownerA.userId, delegate_email: mgrInviteTarget.email, role: 'viewer' })
    check('status 200', r.status === 200, JSON.stringify(r.json))
    const row = await getDelegationRow(ownerA.userId, mgrInviteTarget.userId)
    check('row created', !!row)
  }

  const deniedRoleCases: [string, Persona][] = [
    ['viewer', viewerAccepted],
    ['tour_manager', tmAccepted],
    ['band_member', bandAccepted],
    ['unknown role (superadmin)', unknownRoleAccepted],
    ['unaccepted manager invite', mgrUnaccepted],
    ['revoked manager', mgrRevoked],
    ['manager delegation for a different artist', mgrOtherArtist],
    ['no delegation at all', unrelatedUser],
  ]

  console.log('\n3-10. Every non-qualifying caller is denied, and leaves no new row behind')
  for (const [label, persona] of deniedRoleCases) {
    const email = `inv-test-${RUN}-denied-${label.replace(/[^a-z0-9]+/gi, '')}@example.test`
    const r = await callInvite(persona, { artist_id: ownerA.userId, delegate_email: email, role: 'manager' })
    check(`${label} -> 403`, r.status === 403, `got ${r.status} ${JSON.stringify(r.json)}`)
    const row = await findByInvitedEmail(ownerA.userId, email)
    check(`${label} -> no row created`, !row)
  }

  console.log('\n11. Unauthenticated caller denied')
  {
    const email = `inv-test-${RUN}-unauth@example.test`
    const r = await callInvite(UNAUTH, { artist_id: ownerA.userId, delegate_email: email, role: 'manager' })
    check('status 401', r.status === 401, JSON.stringify(r.json))
    const row = await findByInvitedEmail(ownerA.userId, email)
    check('no row created', !row)
  }

  console.log('\n12-13. Requested owner / invalid role rejected')
  {
    const email1 = `x-${RUN}@example.test`
    const r1 = await callInvite(ownerA, { artist_id: ownerA.userId, delegate_email: email1, role: 'owner' })
    check('role=owner -> 400', r1.status === 400, JSON.stringify(r1.json))
    const row1 = await findByInvitedEmail(ownerA.userId, email1)
    check('role=owner -> no invitation created', !row1)

    const email2 = `y-${RUN}@example.test`
    const r2 = await callInvite(ownerA, { artist_id: ownerA.userId, delegate_email: email2, role: 'superadmin' })
    check('role=superadmin -> 400', r2.status === 400, JSON.stringify(r2.json))
    const row2 = await findByInvitedEmail(ownerA.userId, email2)
    check('role=superadmin -> no invitation created', !row2)
  }

  console.log('\n14-15. Existing-account acceptance succeeds')
  {
    const r = await callInvite(ownerA, { artist_id: ownerA.userId, delegate_email: existingAccount.email, role: 'manager' })
    check('invite to existing account -> 200', r.status === 200, JSON.stringify(r.json))
    const token = r.json.invite_token
    check('invite_token returned', typeof token === 'string' && token.length > 0)
    const accept = await callAccept(existingAccount, token)
    check('accept -> 200', accept.status === 200, JSON.stringify(accept.json))
    const row = await findByInvitedEmail(ownerA.userId, existingAccount.email)
    check('accepted_at set, delegate_id unchanged', !!row?.accepted_at && row.delegate_id === existingAccount.userId)
  }

  console.log('\n16. Placeholder (email-bound) acceptance succeeds for the matching new signup')
  let placeholderRowId = ''
  let placeholderToken = ''
  const placeholderEmail = `inv-test-${RUN}-placeholder@example.test`
  {
    const r = await callInvite(ownerA, { artist_id: ownerA.userId, delegate_email: placeholderEmail, role: 'manager' })
    check('placeholder invite -> 200', r.status === 200, JSON.stringify(r.json))
    const row = await findByInvitedEmail(ownerA.userId, placeholderEmail)
    check('placeholder row created', !!row && row.delegate_id === ownerA.userId)
    placeholderRowId = row!.id
    placeholderToken = row!.invite_token

    const newSignup = await createPersona('placeholderSignup', placeholderEmail)
    const accept = await callAccept(newSignup, placeholderToken)
    check('matching new signup accept -> 200', accept.status === 200, JSON.stringify(accept.json))
    const after = await getRowById(placeholderRowId)
    check('rebound to new signup, accepted_at set', after?.delegate_id === newSignup.userId && !!after?.accepted_at)
  }

  console.log('\n17. Wrong recipient cannot accept or rebind')
  {
    const email = `inv-test-${RUN}-placeholder2@example.test`
    const r = await callInvite(ownerA, { artist_id: ownerA.userId, delegate_email: email, role: 'manager' })
    check('second placeholder invite -> 200', r.status === 200)
    const row = await findByInvitedEmail(ownerA.userId, email)
    const rowId = row!.id
    const token = row!.invite_token

    const before = await getRowById(rowId)
    const wrongAccept = await callAccept(wrongRecipient, token)
    check('wrong-recipient accept -> 403', wrongAccept.status === 403, JSON.stringify(wrongAccept.json))
    const after = await getRowById(rowId)
    check('row completely unchanged after denied accept', rowsEqual(before, after), `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)

    // placeholderToken (from section 16) was already accepted by the
    // rightful recipient. The route short-circuits an already-accepted
    // token to an idempotent { success: true, already_accepted: true }
    // before checking caller identity — by design, since there's nothing
    // left to authorize. The security property that actually matters here
    // is that this idempotent path can't be used to rebind: the row must
    // still belong to whoever legitimately accepted it, never to whoever
    // replays the token afterward.
    const beforeReplay = await getRowById(placeholderRowId)
    const wrongAccept2 = await callAccept(wrongRecipient, placeholderToken)
    check('replaying an already-accepted token is a no-op (idempotent, not an error)', wrongAccept2.status === 200 && wrongAccept2.json.already_accepted === true, JSON.stringify(wrongAccept2.json))
    const afterReplay = await getRowById(placeholderRowId)
    check('row completely unchanged after replaying an already-accepted token', rowsEqual(beforeReplay, afterReplay), `before=${JSON.stringify(beforeReplay)} after=${JSON.stringify(afterReplay)}`)
  }

  console.log('\n18-19. Owner revocation succeeds; non-owner revoke denied and leaves row unchanged')
  {
    const mgrRow = await getDelegationRow(ownerA.userId, mgrAccepted.userId)
    const rowId = mgrRow!.id

    const before = await getRowById(rowId)
    const deniedRevoke = await callRevoke(mgrAccepted, rowId, ownerA.userId)
    check('non-owner revoke -> 403', deniedRevoke.status === 403, JSON.stringify(deniedRevoke.json))
    const after = await getRowById(rowId)
    check('row completely unchanged after denied revoke', rowsEqual(before, after), `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)

    const ownerRevoke = await callRevoke(ownerA, rowId, ownerA.userId)
    check('owner revoke -> 200', ownerRevoke.status === 200, JSON.stringify(ownerRevoke.json))
    const gone = await getRowById(rowId)
    check('row deleted after owner revoke', !gone)
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
