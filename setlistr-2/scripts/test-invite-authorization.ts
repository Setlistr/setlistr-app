// Deterministic, dependency-free tests for lib/inviteAuthorization.ts
// (delegation containment hotfix, Patch 2). No live server, no real
// Supabase project, no network. Follows the same scripts/ convention as
// test-session-bound-forms.ts / test-workspace-boundary.ts. Run via:
//
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-invite-authorization.ts

import { canCreateInvite, isAssignableInviteRole, ASSIGNABLE_INVITE_ROLES } from '../lib/inviteAuthorization'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

const ARTIST = 'artist-uuid'
const OTHER_ARTIST = 'other-artist-uuid'
const CALLER = 'caller-uuid'

console.log('1. Owner (identity equality) can always invite, with or without a delegation row')
{
  check('owner, no delegation row', canCreateInvite({ actorId: ARTIST, artistId: ARTIST, delegation: null }) === true)
  check('owner, even with a garbage delegation row present', canCreateInvite({
    actorId: ARTIST, artistId: ARTIST,
    delegation: { artist_id: ARTIST, role: 'viewer', accepted_at: null, revoked_at: null },
  }) === true)
}

console.log('2. Accepted, non-revoked manager can invite')
{
  const ok = canCreateInvite({
    actorId: CALLER, artistId: ARTIST,
    delegation: { artist_id: ARTIST, role: 'manager', accepted_at: '2026-01-01T00:00:00Z', revoked_at: null },
  })
  check('accepted manager -> allowed', ok === true)
}

console.log('3. Every non-manager role is denied, even accepted and non-revoked')
{
  for (const role of ['viewer', 'tour_manager', 'band_member']) {
    const denied = canCreateInvite({
      actorId: CALLER, artistId: ARTIST,
      delegation: { artist_id: ARTIST, role, accepted_at: '2026-01-01T00:00:00Z', revoked_at: null },
    }) === false
    check(`${role} denied`, denied)
  }
}

console.log('4. Unknown/null role denied')
{
  check('null role denied', canCreateInvite({
    actorId: CALLER, artistId: ARTIST,
    delegation: { artist_id: ARTIST, role: null, accepted_at: '2026-01-01T00:00:00Z', revoked_at: null },
  }) === false)
  check('garbage role string denied', canCreateInvite({
    actorId: CALLER, artistId: ARTIST,
    delegation: { artist_id: ARTIST, role: 'superadmin', accepted_at: '2026-01-01T00:00:00Z', revoked_at: null },
  }) === false)
}

console.log('5. Unaccepted invitation denied, even for a manager role')
{
  check('accepted_at null -> denied', canCreateInvite({
    actorId: CALLER, artistId: ARTIST,
    delegation: { artist_id: ARTIST, role: 'manager', accepted_at: null, revoked_at: null },
  }) === false)
}

console.log('6. Revoked delegation denied, even for an accepted manager')
{
  check('revoked_at set -> denied', canCreateInvite({
    actorId: CALLER, artistId: ARTIST,
    delegation: { artist_id: ARTIST, role: 'manager', accepted_at: '2026-01-01T00:00:00Z', revoked_at: '2026-02-01T00:00:00Z' },
  }) === false)
}

console.log('7. No delegation row at all denied')
{
  check('null delegation -> denied', canCreateInvite({ actorId: CALLER, artistId: ARTIST, delegation: null }) === false)
}

console.log('8. Delegation for a DIFFERENT artist denied — checked by the function itself, not trusted from caller query scoping')
{
  // A real, accepted, manager delegation — but for OTHER_ARTIST, while the
  // call is asking about ARTIST. Defense in depth: this must deny even
  // though every other field looks perfectly valid.
  const denied = canCreateInvite({
    actorId: CALLER, artistId: ARTIST,
    delegation: { artist_id: OTHER_ARTIST, role: 'manager', accepted_at: '2026-01-01T00:00:00Z', revoked_at: null },
  }) === false
  check('accepted manager delegation for a different artist_id is denied', denied)
}

console.log('9. ASSIGNABLE_INVITE_ROLES never includes owner')
{
  check('owner not assignable', !(ASSIGNABLE_INVITE_ROLES as readonly string[]).includes('owner'))
  check('exactly 4 assignable roles', ASSIGNABLE_INVITE_ROLES.length === 4)
}

console.log('10. isAssignableInviteRole validates correctly')
{
  for (const role of ASSIGNABLE_INVITE_ROLES) {
    check(`${role} is assignable`, isAssignableInviteRole(role) === true)
  }
  check('"owner" is not assignable', isAssignableInviteRole('owner') === false)
  check('null is not assignable', isAssignableInviteRole(null) === false)
  check('undefined is not assignable', isAssignableInviteRole(undefined) === false)
  check('number is not assignable', isAssignableInviteRole(42) === false)
  check('empty string is not assignable', isAssignableInviteRole('') === false)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
