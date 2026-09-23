// Pure, zero-dependency authorization logic for who may create a team
// invite on an artist's behalf (delegation containment hotfix, Patch 2).
//
// Deliberately small and local to this hotfix — does NOT import the
// unfinished Team Permissions V1 capability system (lib/permissions.ts on
// team-workspace-isolation, unmerged), which models an 11-capability role
// system this narrow fix has no need for. No grants, no role
// administration — just "who may invite," nothing else.
//
// Owner status is always identity equality (actorId === artistId), never a
// stored role string — matches this codebase's existing convention
// throughout (resolveRole() on the unmerged branch documents the same
// principle; repeated here independently since that module isn't imported).

export const ASSIGNABLE_INVITE_ROLES = ['manager', 'tour_manager', 'band_member', 'viewer'] as const
export type AssignableInviteRole = typeof ASSIGNABLE_INVITE_ROLES[number]

export function isAssignableInviteRole(role: unknown): role is AssignableInviteRole {
  return typeof role === 'string' && (ASSIGNABLE_INVITE_ROLES as readonly string[]).includes(role)
}

export interface ExistingDelegationRow {
  artist_id: string
  role: string | null
  accepted_at: string | null
  revoked_at: string | null
}

// The only two callers who may create a new invite for artistId:
//   1. the artist themselves (actorId === artistId), or
//   2. a currently accepted, non-revoked MANAGER delegate for that exact
//      artist.
// Everything else denies: viewer, tour_manager, band_member, an unknown or
// null role, an unaccepted invitation (accepted_at is null), a revoked
// delegation (revoked_at is set), no delegation row at all, or a
// delegation recorded for a DIFFERENT artist. That last case is checked
// here directly (delegation.artist_id === artistId) rather than trusted
// from the caller's query scoping alone — defense in depth, so this
// function's correctness never depends on every call site getting its
// WHERE clause right.
export function canCreateInvite(args: {
  actorId: string
  artistId: string
  delegation: ExistingDelegationRow | null
}): boolean {
  const { actorId, artistId, delegation } = args
  if (actorId === artistId) return true
  if (!delegation) return false
  if (delegation.artist_id !== artistId) return false
  if (delegation.accepted_at === null) return false
  if (delegation.revoked_at !== null) return false
  return delegation.role === 'manager'
}
