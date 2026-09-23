// Real HTTP-level integration tests for GET /api/performance-songs, run
// against a LOCAL Supabase instance and a LOCALLY running Next.js dev
// server, using real Auth sessions (the same @supabase/ssr cookie
// contract the browser uses) — no mocked authorization.
//
// This route previously had NO authentication check at all despite
// reading via the service-role client: any caller, authenticated or not,
// could read any performance's song data by supplying a performanceId.
// These tests verify the fix: an authenticated caller who is either the
// performance's actual owner, or a currently-accepted, non-revoked
// delegate of that owner (any role — view_workspace is universal), and
// no one else.
//
// HARD LOCALHOST GUARD: refuses to run unless both the Supabase URL and
// the app URL under test resolve to 127.0.0.1/localhost. There is no
// override.
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-performance-songs-auth.ts

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

const RUN = Date.now().toString(36)
const createdUserIds: string[] = []
const createdPerformanceIds: string[] = []

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

interface Persona {
  label: string
  userId: string
  cookieHeader: () => string
}

async function createPersona(label: string): Promise<Persona> {
  const email = `psauth-${RUN}-${label}@example.test`.toLowerCase()
  const password = crypto.randomBytes(18).toString('base64url')

  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser failed for ${label}: ${error?.message}`)
  const userId = data.user.id
  createdUserIds.push(userId)

  const { error: profErr } = await service.from('profiles').insert({ id: userId, full_name: label })
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
    label, userId,
    cookieHeader: () => Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; '),
  }
}

const UNAUTH: Persona = { label: 'unauthenticated', userId: '', cookieHeader: () => '' }

async function seedDelegation(opts: {
  artistId: string; delegateId: string; role: string
  accepted?: boolean; revoked?: boolean
}) {
  const { error } = await service.from('artist_delegates').insert({
    artist_id: opts.artistId,
    delegate_id: opts.delegateId,
    role: opts.role,
    accepted_at: opts.accepted ? new Date().toISOString() : null,
    revoked_at: opts.revoked ? new Date().toISOString() : null,
  })
  if (error) throw new Error(`seedDelegation failed: ${error.message}`)
}

async function createPerformanceWithSong(ownerId: string, venueName: string, songTitle: string) {
  const { data: perf, error: perfErr } = await service.from('performances').insert({
    user_id: ownerId, venue_name: venueName,
  }).select().single()
  if (perfErr || !perf) throw new Error(`performance insert failed: ${perfErr?.message}`)
  createdPerformanceIds.push(perf.id)

  const { error: songErr } = await service.from('performance_songs').insert({
    performance_id: perf.id, title: songTitle, artist: 'Test Artist', isrc: 'US-TEST-00001',
  })
  if (songErr) throw new Error(`song insert failed: ${songErr.message}`)

  return perf.id as string
}

async function callPerformanceSongs(caller: Persona, performanceId?: string) {
  const qs = performanceId !== undefined ? `?performanceId=${encodeURIComponent(performanceId)}` : ''
  const res = await fetch(`${APP_URL}/api/performance-songs${qs}`, {
    headers: caller.cookieHeader() ? { Cookie: caller.cookieHeader() } : {},
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

async function cleanup() {
  const errors: string[] = []
  if (createdPerformanceIds.length > 0) {
    const { error: perfErr } = await service.from('performances').delete().in('id', createdPerformanceIds)
    if (perfErr) errors.push(`delete performances: ${perfErr.message}`)
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

function hasNoSongData(json: any): boolean {
  return Array.isArray(json.songs) && json.songs.length === 0
}

async function main() {
  console.log(`Run ${RUN} — targeting ${APP_URL} / ${SUPABASE_URL}\n`)

  const ownerA = await createPersona('ownerA')
  const ownerB = await createPersona('ownerB')
  const unrelatedUser = await createPersona('unrelatedUser')
  const pendingDelegate = await createPersona('pendingDelegate')
  const revokedDelegate = await createPersona('revokedDelegate')
  const otherArtistDelegate = await createPersona('otherArtistDelegate')
  const managerDelegate = await createPersona('managerDelegate')
  const tourManagerDelegate = await createPersona('tourManagerDelegate')
  const bandMemberDelegate = await createPersona('bandMemberDelegate')
  const viewerDelegate = await createPersona('viewerDelegate')

  await seedDelegation({ artistId: ownerA.userId, delegateId: pendingDelegate.userId, role: 'manager', accepted: false })
  await seedDelegation({ artistId: ownerA.userId, delegateId: revokedDelegate.userId, role: 'manager', accepted: true, revoked: true })
  await seedDelegation({ artistId: ownerB.userId, delegateId: otherArtistDelegate.userId, role: 'manager', accepted: true })
  await seedDelegation({ artistId: ownerA.userId, delegateId: managerDelegate.userId, role: 'manager', accepted: true })
  await seedDelegation({ artistId: ownerA.userId, delegateId: tourManagerDelegate.userId, role: 'tour_manager', accepted: true })
  await seedDelegation({ artistId: ownerA.userId, delegateId: bandMemberDelegate.userId, role: 'band_member', accepted: true })
  await seedDelegation({ artistId: ownerA.userId, delegateId: viewerDelegate.userId, role: 'viewer', accepted: true })

  const perfA = await createPerformanceWithSong(ownerA.userId, 'Venue A', 'Song A')
  const perfB = await createPerformanceWithSong(ownerB.userId, 'Venue B', 'Song B')

  console.log('\n1. Unauthenticated caller denied, no song data')
  {
    const r = await callPerformanceSongs(UNAUTH, perfA)
    check('status 401', r.status === 401, JSON.stringify(r.json))
    check('no song data', hasNoSongData(r.json), JSON.stringify(r.json))
  }

  console.log('\n2. Unrelated authenticated user denied, no song data')
  {
    const r = await callPerformanceSongs(unrelatedUser, perfA)
    check('status 403', r.status === 403, JSON.stringify(r.json))
    check('no song data', hasNoSongData(r.json), JSON.stringify(r.json))
  }

  console.log('\n3. Pending (unaccepted) delegate denied, no song data')
  {
    const r = await callPerformanceSongs(pendingDelegate, perfA)
    check('status 403', r.status === 403, JSON.stringify(r.json))
    check('no song data', hasNoSongData(r.json), JSON.stringify(r.json))
  }

  console.log('\n4. Revoked delegate denied, no song data')
  {
    const r = await callPerformanceSongs(revokedDelegate, perfA)
    check('status 403', r.status === 403, JSON.stringify(r.json))
    check('no song data', hasNoSongData(r.json), JSON.stringify(r.json))
  }

  console.log('\n5. Accepted delegate for a DIFFERENT artist denied, no song data (cross-artist isolation)')
  {
    const r = await callPerformanceSongs(otherArtistDelegate, perfA)
    check('status 403', r.status === 403, JSON.stringify(r.json))
    check('no song data', hasNoSongData(r.json), JSON.stringify(r.json))
  }

  console.log('\n6. Actual owner authorized, receives exactly this performance\'s songs')
  {
    const r = await callPerformanceSongs(ownerA, perfA)
    check('status 200', r.status === 200, JSON.stringify(r.json))
    check('exactly one song, the right one', r.json.songs?.length === 1 && r.json.songs[0].title === 'Song A', JSON.stringify(r.json))
  }

  console.log('\n7-10. Every recognized accepted role is authorized (view_workspace is universal)')
  for (const [label, persona] of [
    ['manager', managerDelegate], ['tour_manager', tourManagerDelegate],
    ['band_member', bandMemberDelegate], ['viewer', viewerDelegate],
  ] as [string, Persona][]) {
    const r = await callPerformanceSongs(persona, perfA)
    check(`${label} -> 200`, r.status === 200, JSON.stringify(r.json))
    check(`${label} -> exactly this performance's song, not the other artist's`, r.json.songs?.length === 1 && r.json.songs[0].title === 'Song A', JSON.stringify(r.json))
  }

  console.log('\n11. Cross-artist request never returns the wrong artist\'s songs')
  {
    // managerDelegate is accepted for ownerA only — requesting ownerB's
    // performance must be denied, and specifically must never return
    // ownerB's song data even by accident.
    const r = await callPerformanceSongs(managerDelegate, perfB)
    check('status 403', r.status === 403, JSON.stringify(r.json))
    check('no song data (never leaks the other artist\'s songs)', hasNoSongData(r.json), JSON.stringify(r.json))
  }

  console.log('\n12. Missing performanceId')
  {
    const r = await callPerformanceSongs(ownerA, undefined)
    check('status 400', r.status === 400, JSON.stringify(r.json))
  }

  console.log('\n13. Malformed performanceId (not a UUID)')
  {
    const r = await callPerformanceSongs(ownerA, 'not-a-real-uuid')
    check('rejected, not a 200 with data', r.status !== 200, JSON.stringify(r.json))
    check('no song data', hasNoSongData(r.json), JSON.stringify(r.json))
  }

  console.log('\n14. Nonexistent performance (well-formed UUID, no matching row)')
  {
    const r = await callPerformanceSongs(ownerA, '00000000-0000-4000-8000-000000000000')
    check('status 404', r.status === 404, JSON.stringify(r.json))
    check('no song data', hasNoSongData(r.json), JSON.stringify(r.json))
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
