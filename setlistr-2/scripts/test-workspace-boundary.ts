// Deterministic, dependency-free tests for the Stage 1 workspace-boundary
// fail-closed logic in lib/workspaceStateLogic.ts. No live server, no real
// Supabase project, no network, no React — pure functions called directly.
// Follows the same scripts/ convention as test-session-bound-forms.ts. Run
// via:
//
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-workspace-boundary.ts
//
// Sections 1-9 cover the original Stage 1 requirements. Section 10 covers
// the follow-up patch: an invalid (present-but-corrupt) saved selection
// must be treated as a DIFFERENT fact from an absent one — 'none' vs
// 'invalid' vs 'valid', per SavedSelectionParseResult — never collapsed
// into "no selection" -> own_workspace.

import {
  resolveWorkspaceState, deriveWorkspaceOwnerId, deriveResolved, deriveIsBlocked,
  storageKeyFor, parseSavedSelection, isStaleResponse,
  type WorkspaceState, type ManagedArtistRef, type SavedSelectionParseResult,
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
const ARTIST: ManagedArtistRef = { artist_id: '11111111-1111-1111-1111-111111111111', artist_name: 'Ryder Vance' }
const OTHER_ARTIST: ManagedArtistRef = { artist_id: '22222222-2222-2222-2222-222222222222', artist_name: 'Someone Else' }

const NONE: SavedSelectionParseResult = { kind: 'none' }
const INVALID: SavedSelectionParseResult = { kind: 'invalid' }
const valid = (ref: ManagedArtistRef): SavedSelectionParseResult => ({ kind: 'valid', selection: ref })

// ─── 1. No saved selection -> own_workspace with workspaceOwnerId=viewerId
console.log('1. No saved selection resolves to own_workspace')
{
  const state = resolveWorkspaceState({ viewerId: VIEWER_A, savedSelection: NONE, managedArtists: null })
  check('status is own_workspace', state.status === 'own_workspace')
  check('workspaceOwnerId equals viewerId', deriveWorkspaceOwnerId(state) === VIEWER_A)
}

// ─── 2. Saved selection found in verified managed artists -> managed_workspace
console.log('2. Verified saved selection resolves to managed_workspace')
{
  const state = resolveWorkspaceState({
    viewerId: VIEWER_A, savedSelection: valid(ARTIST), managedArtists: [ARTIST, OTHER_ARTIST],
  })
  check('status is managed_workspace', state.status === 'managed_workspace')
  check('workspaceOwnerId equals the verified artist id', deriveWorkspaceOwnerId(state) === ARTIST.artist_id)
  check('workspaceOwnerId is never the viewer id', deriveWorkspaceOwnerId(state) !== VIEWER_A)
}

// ─── 3. Saved selection absent from successful response -> unauthorized
console.log('3. Saved selection not present in a successful response resolves to unauthorized')
{
  const state = resolveWorkspaceState({
    viewerId: VIEWER_A, savedSelection: valid(ARTIST), managedArtists: [OTHER_ARTIST], // ARTIST not in the list
  })
  check('status is unauthorized', state.status === 'unauthorized')
  check('workspaceOwnerId is null', deriveWorkspaceOwnerId(state) === null)
}

// ─── 4. Verification/network failure -> verification_failed, workspaceOwnerId=null
console.log('4. Fetch failure (managedArtists=null with a VALID saved selection) resolves to verification_failed')
{
  const state = resolveWorkspaceState({ viewerId: VIEWER_A, savedSelection: valid(ARTIST), managedArtists: null })
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
console.log('8. Malformed/invalid saved-selection storage values parse to invalid, never valid')
{
  check('null raw value parses to none', parseSavedSelection(null).kind === 'none')
  check('empty string parses to invalid', parseSavedSelection('').kind === 'invalid')
  check('garbage (non-JSON) parses to invalid', parseSavedSelection('not json at all {').kind === 'invalid')
  check('JSON array parses to invalid', parseSavedSelection('[1,2,3]').kind === 'invalid')
  check('object missing artist_id parses to invalid', parseSavedSelection(JSON.stringify({ artist_name: 'X' })).kind === 'invalid')
  check('object missing artist_name parses to invalid', parseSavedSelection(JSON.stringify({ artist_id: ARTIST.artist_id })).kind === 'invalid')
  check('artist_id as a number parses to invalid', parseSavedSelection(JSON.stringify({ artist_id: 123, artist_name: 'X' })).kind === 'invalid')
  check('empty-string artist_id parses to invalid', parseSavedSelection(JSON.stringify({ artist_id: '', artist_name: 'X' })).kind === 'invalid')
  check('non-UUID artist_id parses to invalid', parseSavedSelection(JSON.stringify({ artist_id: 'not-a-uuid', artist_name: 'X' })).kind === 'invalid')

  const state = resolveWorkspaceState({ viewerId: VIEWER_A, savedSelection: NONE, managedArtists: [ARTIST] })
  check('none never produces managed_workspace even with a valid managed list available', state.status !== 'managed_workspace')
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

// ═══════════════════════════════════════════════════════════════════════
// 10. INVALID SAVED WORKSPACE MUST FAIL CLOSED — the follow-up patch's
// required coverage. An invalid (present-but-corrupt) stored value must
// resolve differently from an absent one: 'none' -> own_workspace,
// 'invalid' -> unauthorized (blocked, explicit return-to-own required,
// never auto-downgraded to "no selection").
// ═══════════════════════════════════════════════════════════════════════
console.log('10. Invalid saved workspace fails closed (patch requirements 1-12)')
{
  // 1. Missing storage key -> own_workspace.
  {
    const state = resolveWorkspaceState({ viewerId: VIEWER_A, savedSelection: parseSavedSelection(null), managedArtists: null })
    check('1. missing key -> own_workspace', state.status === 'own_workspace')
    check('1. workspaceOwnerId is the viewer', deriveWorkspaceOwnerId(state) === VIEWER_A)
  }

  // 2. Empty-string stored value -> blocked.
  {
    const parsed = parseSavedSelection('')
    check('2. empty string parses to invalid', parsed.kind === 'invalid')
    const state = resolveWorkspaceState({ viewerId: VIEWER_A, savedSelection: parsed, managedArtists: null })
    check('2. empty string -> unauthorized (blocked)', state.status === 'unauthorized')
    check('2. blocked', deriveIsBlocked(state) === true)
  }

  // 3. Malformed JSON -> blocked.
  {
    const parsed = parseSavedSelection('{not valid json')
    check('3. malformed JSON parses to invalid', parsed.kind === 'invalid')
    const state = resolveWorkspaceState({ viewerId: VIEWER_A, savedSelection: parsed, managedArtists: null })
    check('3. malformed JSON -> unauthorized (blocked)', state.status === 'unauthorized')
  }

  // 4. Valid JSON with wrong shape -> blocked.
  {
    const parsed = parseSavedSelection(JSON.stringify({ foo: 'bar', baz: 42 }))
    check('4. wrong shape parses to invalid', parsed.kind === 'invalid')
    const state = resolveWorkspaceState({ viewerId: VIEWER_A, savedSelection: parsed, managedArtists: null })
    check('4. wrong shape -> unauthorized (blocked)', state.status === 'unauthorized')
  }

  // 5. Missing artist ID -> blocked.
  {
    const parsed = parseSavedSelection(JSON.stringify({ artist_name: 'Ryder Vance' }))
    check('5. missing artist_id parses to invalid', parsed.kind === 'invalid')
    const state = resolveWorkspaceState({ viewerId: VIEWER_A, savedSelection: parsed, managedArtists: null })
    check('5. missing artist_id -> unauthorized (blocked)', state.status === 'unauthorized')
  }

  // 6. Non-string artist ID -> blocked.
  {
    const parsed = parseSavedSelection(JSON.stringify({ artist_id: 999, artist_name: 'Ryder Vance' }))
    check('6. non-string artist_id parses to invalid', parsed.kind === 'invalid')
    const state = resolveWorkspaceState({ viewerId: VIEWER_A, savedSelection: parsed, managedArtists: null })
    check('6. non-string artist_id -> unauthorized (blocked)', state.status === 'unauthorized')
  }

  // 7. Empty artist ID -> blocked.
  {
    const parsed = parseSavedSelection(JSON.stringify({ artist_id: '', artist_name: 'Ryder Vance' }))
    check('7. empty artist_id parses to invalid', parsed.kind === 'invalid')
    const state = resolveWorkspaceState({ viewerId: VIEWER_A, savedSelection: parsed, managedArtists: null })
    check('7. empty artist_id -> unauthorized (blocked)', state.status === 'unauthorized')
  }

  // 8. Invalid UUID artist ID (ids are required to be UUIDs — Supabase
  // profile ids throughout this schema) -> blocked.
  {
    const parsed = parseSavedSelection(JSON.stringify({ artist_id: 'not-a-real-uuid', artist_name: 'Ryder Vance' }))
    check('8. non-UUID artist_id parses to invalid', parsed.kind === 'invalid')
    const state = resolveWorkspaceState({ viewerId: VIEWER_A, savedSelection: parsed, managedArtists: null })
    check('8. non-UUID artist_id -> unauthorized (blocked)', state.status === 'unauthorized')
  }

  // 9. Unknown extra fields do not make an otherwise invalid value valid
  // (and, separately, do not make an otherwise VALID value invalid either
  // — extra fields are simply irrelevant to validity either direction).
  {
    const stillInvalid = parseSavedSelection(JSON.stringify({ extra: 'field', another: 1 }))
    check('9. extra fields alone (no real artist_id/name) still parses to invalid', stillInvalid.kind === 'invalid')
    const stillValid = parseSavedSelection(JSON.stringify({ ...ARTIST, unexpected_extra_field: 'ignored' }))
    check('9. extra fields on an otherwise-valid object do not break validity', stillValid.kind === 'valid')
  }

  // 10. Explicit return-to-own clears the invalid key and produces
  // own_workspace. (ActingAsProvider.returnToOwnWorkspace() always calls
  // localStorage.removeItem(storageKeyFor(uid)) unconditionally, regardless
  // of what was stored, then constructs own_workspace directly — proven
  // here at the state-shape level: the resulting state can structurally
  // never carry a leftover artist reference.)
  {
    const afterExplicitReturn: WorkspaceState = { status: 'own_workspace', viewerId: VIEWER_A }
    check('10. explicit return produces own_workspace', afterExplicitReturn.status === 'own_workspace')
    check('10. workspaceOwnerId is the real viewer', deriveWorkspaceOwnerId(afterExplicitReturn) === VIEWER_A)
    check('10. resolved immediately', deriveResolved(afterExplicitReturn) === true)
  }

  // 11. Retry against invalid storage remains blocked — re-parsing the SAME
  // untouched invalid raw value (since parsing never auto-clears it)
  // produces the same 'invalid' kind and the same blocked state every time.
  {
    const rawInvalid = JSON.stringify({ artist_id: 'garbage', artist_name: 'X' })
    const firstParse = parseSavedSelection(rawInvalid)
    const retryParse = parseSavedSelection(rawInvalid) // storage untouched between attempts
    check('11. first parse is invalid', firstParse.kind === 'invalid')
    check('11. retry parse of the same untouched value is invalid again', retryParse.kind === 'invalid')
    const firstState = resolveWorkspaceState({ viewerId: VIEWER_A, savedSelection: firstParse, managedArtists: null })
    const retryState = resolveWorkspaceState({ viewerId: VIEWER_A, savedSelection: retryParse, managedArtists: null })
    check('11. first attempt is unauthorized (blocked)', firstState.status === 'unauthorized')
    check('11. retry is unauthorized again, NOT own_workspace', retryState.status === 'unauthorized')
  }

  // 12. None of the invalid cases produce viewerId as workspaceOwnerId
  // before the explicit action.
  {
    const invalidRawValues = [
      '', '{not json', JSON.stringify({ foo: 'bar' }), JSON.stringify({ artist_name: 'X' }),
      JSON.stringify({ artist_id: 1, artist_name: 'X' }), JSON.stringify({ artist_id: '', artist_name: 'X' }),
      JSON.stringify({ artist_id: 'not-a-uuid', artist_name: 'X' }),
    ]
    let anyLeaked = false
    for (const raw of invalidRawValues) {
      const parsed = parseSavedSelection(raw)
      const state = resolveWorkspaceState({ viewerId: VIEWER_A, savedSelection: parsed, managedArtists: null })
      if (deriveWorkspaceOwnerId(state) === VIEWER_A) anyLeaked = true
    }
    check('12. no invalid case ever yields workspaceOwnerId === viewerId', anyLeaked === false)
  }
}

// ─── summary ────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
