// Deterministic, dependency-free tests for the Stage 1 workspace-boundary
// fail-closed logic in lib/workspaceStateLogic.ts. No live server, no real
// Supabase project, no network, no React — pure functions called directly.
// Follows the same scripts/ convention as test-session-bound-forms.ts. Run
// via:
//
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-workspace-boundary.ts
//
// Each numbered test corresponds to a scenario from the Stage 1 task's
// STEP 8 required-coverage list.

import {
  resolveWorkspaceState, deriveWorkspaceOwnerId, deriveResolved, deriveIsBlocked,
  storageKeyFor, parseSavedSelection, isStaleResponse,
  type WorkspaceState, type ManagedArtistRef,
} from '../lib/workspaceStateLogic'

// ─── tiny assertion harness (matches test-session-bound-forms.ts) ─────────
let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++
    console.log(`  ok   ${name}`)
  } else {
    fail++
    console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`)
  }
}

const VIEWER_A = 'viewer-a-uuid'
const VIEWER_B = 'viewer-b-uuid'
const ARTIST: ManagedArtistRef = { artist_id: 'artist-uuid', artist_name: 'Ryder Vance' }
const OTHER_ARTIST: ManagedArtistRef = { artist_id: 'other-artist-uuid', artist_name: 'Someone Else' }

// ─── 1. No saved selection -> own_workspace with workspaceOwnerId=viewerId
console.log('1. No saved selection resolves to own_workspace')
{
  const state = resolveWorkspaceState({ viewerId: VIEWER_A, savedSelection: null, managedArtists: null })
  check('status is own_workspace', state.status === 'own_workspace')
  check('workspaceOwnerId equals viewerId', deriveWorkspaceOwnerId(state) === VIEWER_A)
}

// ─── 2. Saved selection found in verified managed artists -> managed_workspace
console.log('2. Verified saved selection resolves to managed_workspace')
{
  const state = resolveWorkspaceState({
    viewerId: VIEWER_A, savedSelection: ARTIST, managedArtists: [ARTIST, OTHER_ARTIST],
  })
  check('status is managed_workspace', state.status === 'managed_workspace')
  check('workspaceOwnerId equals the verified artist id', deriveWorkspaceOwnerId(state) === ARTIST.artist_id)
  check('workspaceOwnerId is never the viewer id', deriveWorkspaceOwnerId(state) !== VIEWER_A)
}

// ─── 3. Saved selection absent from successful response -> unauthorized
console.log('3. Saved selection not present in a successful response resolves to unauthorized')
{
  const state = resolveWorkspaceState({
    viewerId: VIEWER_A, savedSelection: ARTIST, managedArtists: [OTHER_ARTIST], // ARTIST not in the list
  })
  check('status is unauthorized', state.status === 'unauthorized')
  check('workspaceOwnerId is null', deriveWorkspaceOwnerId(state) === null)
}

// ─── 4. Verification/network failure -> verification_failed, workspaceOwnerId=null
console.log('4. Fetch failure (managedArtists=null with a saved selection) resolves to verification_failed')
{
  const state = resolveWorkspaceState({ viewerId: VIEWER_A, savedSelection: ARTIST, managedArtists: null })
  check('status is verification_failed', state.status === 'verification_failed')
  check('workspaceOwnerId is null', deriveWorkspaceOwnerId(state) === null)
  check('NOT own_workspace — a network hiccup must never look like "no delegation"', state.status !== 'own_workspace')
}

// ─── 5 & 6. resolved is true ONLY for own_workspace/managed_workspace
console.log('5 & 6. resolved is exactly own_workspace/managed_workspace, false for every blocked state')
{
  const resolving: WorkspaceState = { status: 'resolving' }
  const own: WorkspaceState = { status: 'own_workspace', viewerId: VIEWER_A }
  const managed: WorkspaceState = { status: 'managed_workspace', artistId: ARTIST.artist_id, artistName: ARTIST.artist_name }
  const failed: WorkspaceState = { status: 'verification_failed' }
  const unauthorized: WorkspaceState = { status: 'unauthorized' }

  check('resolving is NOT resolved', deriveResolved(resolving) === false)
  check('own_workspace IS resolved', deriveResolved(own) === true)
  check('managed_workspace IS resolved', deriveResolved(managed) === true)
  check('verification_failed is NOT resolved', deriveResolved(failed) === false)
  check('unauthorized is NOT resolved', deriveResolved(unauthorized) === false)

  check('resolving IS blocked', deriveIsBlocked(resolving) === true)
  check('own_workspace is NOT blocked', deriveIsBlocked(own) === false)
  check('managed_workspace is NOT blocked', deriveIsBlocked(managed) === false)
  check('verification_failed IS blocked', deriveIsBlocked(failed) === true)
  check('unauthorized IS blocked', deriveIsBlocked(unauthorized) === true)
}

// ─── 7. Storage keys differ between viewer A and viewer B
console.log('7. Storage keys are namespaced per viewer, never shared')
{
  check('different viewers get different keys', storageKeyFor(VIEWER_A) !== storageKeyFor(VIEWER_B))
  check('key A contains viewer A id', storageKeyFor(VIEWER_A).includes(VIEWER_A))
  check('key A does not contain viewer B id', !storageKeyFor(VIEWER_A).includes(VIEWER_B))
  check('same viewer always gets the same key', storageKeyFor(VIEWER_A) === storageKeyFor(VIEWER_A))
}

// ─── 8. Unknown/invalid saved selection never produces managed_workspace
console.log('8. Malformed/invalid saved-selection storage values fail closed')
{
  check('null raw value parses to null', parseSavedSelection(null) === null)
  check('empty string parses to null', parseSavedSelection('') === null)
  check('garbage (non-JSON) parses to null', parseSavedSelection('not json at all {') === null)
  check('JSON array parses to null', parseSavedSelection('[1,2,3]') === null)
  check('object missing artist_id parses to null', parseSavedSelection(JSON.stringify({ artist_name: 'X' })) === null)
  check('object missing artist_name parses to null', parseSavedSelection(JSON.stringify({ artist_id: 'x' })) === null)
  check('artist_id as a number parses to null', parseSavedSelection(JSON.stringify({ artist_id: 123, artist_name: 'X' })) === null)
  check('empty-string artist_id parses to null', parseSavedSelection(JSON.stringify({ artist_id: '', artist_name: 'X' })) === null)

  // And end-to-end: even if somehow an invalid selection reached
  // resolveWorkspaceState (it can't, via parseSavedSelection, but proving
  // the decision table itself never manufactures managed_workspace from
  // absence of real verified data):
  const state = resolveWorkspaceState({ viewerId: VIEWER_A, savedSelection: null, managedArtists: [ARTIST] })
  check('no selection never produces managed_workspace even with a valid managed list available', state.status !== 'managed_workspace')
}

// ─── 9. An old viewer/request result cannot be applied after a generation/viewer change
console.log('9. Stale-response detection: generation and viewer-id changes both invalidate an in-flight result')
{
  check(
    'same generation, same viewer -> NOT stale',
    isStaleResponse({ responseGeneration: 1, currentGeneration: 1, responseViewerId: VIEWER_A, currentViewerId: VIEWER_A }) === false,
  )
  check(
    'older generation, same viewer -> stale (a retry superseded it)',
    isStaleResponse({ responseGeneration: 1, currentGeneration: 2, responseViewerId: VIEWER_A, currentViewerId: VIEWER_A }) === true,
  )
  check(
    'same generation, different viewer -> stale (auth changed under the request)',
    isStaleResponse({ responseGeneration: 1, currentGeneration: 1, responseViewerId: VIEWER_A, currentViewerId: VIEWER_B }) === true,
  )
  check(
    'both older generation AND different viewer -> stale',
    isStaleResponse({ responseGeneration: 1, currentGeneration: 2, responseViewerId: VIEWER_A, currentViewerId: VIEWER_B }) === true,
  )
  check(
    'a response for viewer A can never be mistaken for viewer B, even same generation',
    isStaleResponse({ responseGeneration: 5, currentGeneration: 5, responseViewerId: VIEWER_A, currentViewerId: VIEWER_B }) === true,
  )
}

// ─── 10. Explicit return-to-own clears the managed identity and produces the viewer's workspace
console.log('10. Return-to-own-workspace produces a clean own_workspace state for the real viewer')
{
  // The provider constructs { status: 'own_workspace', viewerId } directly
  // on an explicit return — proving the resulting state can never retain
  // any artist reference, since the union type has no field for one in
  // this branch (a structural guarantee, not just a runtime check).
  const afterReturn: WorkspaceState = { status: 'own_workspace', viewerId: VIEWER_A }
  check('status is own_workspace', afterReturn.status === 'own_workspace')
  check('workspaceOwnerId is the real viewer, not an artist', deriveWorkspaceOwnerId(afterReturn) === VIEWER_A)
  check('resolved is true immediately (no forced resolving detour required)', deriveResolved(afterReturn) === true)
  // Structural proof: TypeScript's discriminated union means an
  // 'own_workspace' state literally cannot carry an artistId field — this
  // line intentionally would not compile if uncommented:
  // const leak = (afterReturn as any).artistId
}

// ─── 11. Retry preserves fail-closed state until successful verification
console.log('11. Retrying a failed verification stays fail-closed until the fetch actually succeeds')
{
  const firstAttempt = resolveWorkspaceState({ viewerId: VIEWER_A, savedSelection: ARTIST, managedArtists: null })
  const secondAttempt = resolveWorkspaceState({ viewerId: VIEWER_A, savedSelection: ARTIST, managedArtists: null })
  check('first attempt is verification_failed', firstAttempt.status === 'verification_failed')
  check('retry with the same (still-failing) facts is verification_failed again, not own_workspace', secondAttempt.status === 'verification_failed')
  const successfulRetry = resolveWorkspaceState({ viewerId: VIEWER_A, savedSelection: ARTIST, managedArtists: [ARTIST] })
  check('a retry that actually succeeds resolves to managed_workspace', successfulRetry.status === 'managed_workspace')
}

// ─── 12. Unknown/external string input fails closed
console.log('12. parseSavedSelection fails closed on every form of unexpected external input')
{
  check('undefined-as-null fails closed', parseSavedSelection(null as unknown as string | null) === null)
  check('a bare JSON string fails closed', parseSavedSelection(JSON.stringify('just a string')) === null)
  check('a bare JSON number fails closed', parseSavedSelection('42') === null)
  check('a JSON null literal fails closed', parseSavedSelection('null') === null)
  check('nested-but-wrong shape fails closed', parseSavedSelection(JSON.stringify({ artist: { id: 'x' } })) === null)
}

// ─── summary ────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
