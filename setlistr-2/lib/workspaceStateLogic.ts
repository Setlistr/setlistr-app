// Pure, zero-dependency workspace-resolution logic behind ActingAsProvider.tsx
// — no React, no Supabase client, no localStorage access, no '@/' path
// aliases — so it can be imported directly from a plain ts-node script
// (matching the pattern already used by lib/sessionGuardLogic.ts) and
// exercised without a browser, a live session, or a network call.
//
// ActingAsProvider.tsx is the only caller. It performs every side effect
// (the localStorage read/write, the /api/team/managed-artists fetch, the
// setState calls) and hands the results to the functions below to decide
// what state comes next. Nothing here decides HOW to fetch or store —
// only WHAT STATE a given set of facts implies.

export type ManagedArtistRef = { artist_id: string; artist_name: string }

// A saved selection is a REQUEST, never authorization on its own — see
// resolveWorkspaceState below, which is the only place a 'managed_workspace'
// state is ever constructed, and it always requires a verified match.
export type WorkspaceState =
  | { status: 'resolving' }
  | { status: 'own_workspace'; viewerId: string }
  | { status: 'managed_workspace'; artistId: string; artistName: string }
  | { status: 'verification_failed' }
  | { status: 'unauthorized' }

// What localStorage actually held, before any server verification.
// Deliberately three-way, not a nullable ManagedArtistRef: 'none' (the key
// is genuinely absent — no workspace was ever requested) and 'invalid' (the
// key EXISTS but cannot be safely parsed/validated — malformed JSON, wrong
// shape, missing/non-string/empty/non-UUID artist_id, etc.) are DIFFERENT
// facts and must resolve to different states. Collapsing them into one
// "no selection" outcome was a real bug: it silently treated "a workspace
// was requested but the request is corrupt" the same as "no workspace was
// ever requested", producing own_workspace for both — exactly the silent
// substitution this whole state machine exists to prevent.
export type SavedSelectionParseResult =
  | { kind: 'none' }
  | { kind: 'valid'; selection: ManagedArtistRef }
  | { kind: 'invalid' }

// The one place "what state follows from these facts" is decided.
//   - none                                -> own_workspace (nothing was
//     ever requested; nothing to verify)
//   - invalid                             -> unauthorized (a corrupt/
//     untrustworthy request is treated exactly like a confirmed-absent
//     delegation: blocked, requiring an explicit return-to-own, never
//     silently downgraded to "no selection")
//   - valid, fetch failed                 -> verification_failed (NOT
//     own_workspace — a network hiccup is not the same as "no delegation
//     exists", and must never be treated as permission to silently
//     view/edit the viewer's own records while the UI still names the
//     artist)
//   - valid, fetch ok, no match           -> unauthorized (a confirmed
//     negative answer — the delegation is gone or never existed)
//   - valid, fetch ok, match              -> managed_workspace, values
//     taken from the VERIFIED list, never from the unverified saved
//     selection
//
// 'unauthorized' is deliberately reused for both the invalid-parse and the
// confirmed-no-longer-delegated cases rather than adding a sixth state —
// both are "blocked, requires an explicit return-to-own, no retry-only
// recovery path", and the caller (ActingAsProvider) is the layer that
// decides whether the stored value should be auto-cleared (only for the
// confirmed case — see its own comment), not this function.
export function resolveWorkspaceState(args: {
  viewerId: string
  savedSelection: SavedSelectionParseResult
  managedArtists: ManagedArtistRef[] | null // null = fetch failed; [] = fetch ok, empty
}): WorkspaceState {
  const { viewerId, savedSelection, managedArtists } = args
  if (savedSelection.kind === 'none') return { status: 'own_workspace', viewerId }
  if (savedSelection.kind === 'invalid') return { status: 'unauthorized' }
  if (managedArtists === null) return { status: 'verification_failed' }
  const match = managedArtists.find(m => m.artist_id === savedSelection.selection.artist_id)
  if (match) return { status: 'managed_workspace', artistId: match.artist_id, artistName: match.artist_name }
  return { status: 'unauthorized' }
}

// The one canonical subject id. Null in every state where reading or
// writing workspace data must not happen — resolving, verification_failed,
// unauthorized. No consumer may ever fall back to a session id when this is
// null; a null workspaceOwnerId IS the "do not proceed" signal.
export function deriveWorkspaceOwnerId(state: WorkspaceState): string | null {
  if (state.status === 'own_workspace') return state.viewerId
  if (state.status === 'managed_workspace') return state.artistId
  return null
}

// Legacy compatibility contract, corrected: only true when the workspace is
// actually usable. Previously `status !== 'resolving'`, which marked
// verification_failed/unauthorized as "resolved" — the exact hole that let
// existing `actingAsArtistId || user.id` consumers execute against the
// viewer's own data while still displaying the artist's context.
export function deriveResolved(state: WorkspaceState): boolean {
  return state.status === 'own_workspace' || state.status === 'managed_workspace'
}

// Central-gate signal: block rendering entirely in every non-usable state.
export function deriveIsBlocked(state: WorkspaceState): boolean {
  return state.status === 'resolving' || state.status === 'verification_failed' || state.status === 'unauthorized'
}

// Per-viewer storage namespace. A bare, unnamespaced key is exactly the
// device-wide leak this replaced — this function's only job is making that
// leak structurally impossible to reintroduce by accident.
export function storageKeyFor(viewerId: string): string {
  return `setlistr_acting_as:${viewerId}`
}

// Legacy, unscoped key from before storage was namespaced per viewer — only
// ever deleted, its VALUE must never be read/trusted again.
export const LEGACY_ACTING_AS_KEY = 'setlistr_acting_as'

// Artist ids are Supabase profile ids — always UUIDs throughout this
// schema (see e.g. lib/profileUpdateHandler.ts's identical check). A
// stored artist_id that isn't a real UUID cannot be a genuine value this
// app ever wrote itself, so it's treated as corrupt, not merely "unusual".
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Defensive localStorage parse, three-way (see SavedSelectionParseResult):
//   - raw === null              -> 'none' (key genuinely absent)
//   - raw exists but is empty,
//     malformed JSON, wrong shape, missing/non-string/empty/non-UUID
//     artist_id, or missing/non-string/empty artist_name -> 'invalid'
//   - raw parses to a structurally valid selection -> 'valid'
// Extra/unknown fields on an otherwise-valid object do not affect the
// result either way — only the required fields are checked, and only
// their presence/shape, never their absence of siblings.
export function parseSavedSelection(raw: string | null): SavedSelectionParseResult {
  if (raw === null) return { kind: 'none' }
  try {
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      typeof parsed.artist_id === 'string' &&
      UUID_RE.test(parsed.artist_id) &&
      typeof parsed.artist_name === 'string' &&
      parsed.artist_name.length > 0
    ) {
      return { kind: 'valid', selection: { artist_id: parsed.artist_id, artist_name: parsed.artist_name } }
    }
    return { kind: 'invalid' }
  } catch {
    return { kind: 'invalid' }
  }
}

// Request-generation guard. A verification request is stale — and its
// result must be discarded unapplied — if EITHER the generation counter has
// moved on (a newer verify()/retry()/explicit action started) OR the viewer
// it was issued for is no longer the current viewer (an auth change during
// the request). Both conditions are checked independently: a generation
// bump with the same viewer (e.g. two rapid retries) and a viewer change
// with no generation bump (shouldn't happen given the provider always bumps
// generation on a viewer change too, but checked independently anyway so
// this function's correctness never depends on the caller doing both
// correctly in lockstep).
export function isStaleResponse(args: {
  responseGeneration: number
  currentGeneration: number
  responseViewerId: string
  currentViewerId: string | null
}): boolean {
  return (
    args.responseGeneration !== args.currentGeneration ||
    args.responseViewerId !== args.currentViewerId
  )
}
