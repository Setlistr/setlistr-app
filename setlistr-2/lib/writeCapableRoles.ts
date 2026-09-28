// Viewer-write containment: the explicit recognized-role write allowlist,
// shared by every service-role route that mutates a performance/show on a
// delegate's behalf. Deliberately dependency-free (no Supabase/React
// imports), matching this codebase's existing convention for narrow
// authorization helpers (see lib/inviteAuthorization.ts) so it can be
// imported anywhere without pulling in unrelated surface.
//
// An explicit IN-list (allowlist), never role !== 'viewer' — a NOT-EQUAL
// test would let an unrecognized future role string through by accident.
// Unknown or null roles are NOT write-capable; they are unaffected on the
// READ side, which remains governed entirely by can_act_for() (unchanged
// by this patch) and does not consult role at all.
//
// Must be kept in parity with can_write_for()'s SQL allowlist
// (supabase/migrations/0016_viewer_write_containment.sql) — exercised by
// scripts/test-viewer-write-containment.ts against the real database, not
// merely asserted here.

export const WRITE_CAPABLE_ROLES = new Set(['manager', 'tour_manager', 'band_member'])

export function isWriteCapableRole(role: string | null | undefined): boolean {
  return typeof role === 'string' && WRITE_CAPABLE_ROLES.has(role)
}
