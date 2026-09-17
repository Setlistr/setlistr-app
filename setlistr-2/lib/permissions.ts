// ─── Setlistr Team Permissions ───────────────────────────────────────────────
// Single source of truth for what each team role may do inside an artist
// workspace. Pure logic: no imports, no Supabase, no React. Nothing here reads
// or writes the database, so it can be adopted UI-first and reversed by
// deleting the call sites.
//
// AUTHORITY: permissions derive from `artist_delegates.role` ONLY.
// `profiles.role` is a different column, is writable by the user it belongs to,
// and must never gate anything. Do not read it here or anywhere downstream.
//
// The artist (the performance's `user_id`) is the OWNER and is never a row in
// artist_delegates. Owner is a resolved role, not a stored one — see
// resolveRole() below.

export type TeamRole = 'owner' | 'manager' | 'tour_manager' | 'band_member' | 'viewer'

export type Capability =
  | 'view_workspace'          // see the artist's shows and career record
  | 'schedule_show'           // create an upcoming show
  | 'capture_show'            // start/run a capture
  | 'edit_setlist'            // edit show details and songs
  | 'confirm_recording_match' // accept/reject a recognition candidate
  | 'confirm_work_info'       // confirm composition/work identity (Phase 1)
  | 'prepare_claim'           // assemble a PRO claim sheet and hand it off
  | 'submit_to_pro'           // mark a show as filed with a PRO
  | 'view_financial'          // see payout/financial data
  | 'manage_team'             // invite, change roles, revoke
  | 'transfer_ownership'      // hand the workspace to another account

export const ALL_CAPABILITIES: Capability[] = [
  'view_workspace', 'schedule_show', 'capture_show', 'edit_setlist',
  'confirm_recording_match', 'confirm_work_info', 'prepare_claim',
  'submit_to_pro', 'view_financial', 'manage_team', 'transfer_ownership',
]

export const ROLE_LABELS: Record<TeamRole, string> = {
  owner: 'Artist',
  manager: 'Manager',
  tour_manager: 'Tour manager',
  band_member: 'Band member',
  viewer: 'Viewer',
}

// Roles an artist can assign when inviting someone. 'owner' is not assignable —
// it's resolved from record ownership, never granted.
export const ASSIGNABLE_ROLES: TeamRole[] = ['manager', 'tour_manager', 'band_member', 'viewer']

// ─── Presets ──────────────────────────────────────────────────────────────────
// What a role can do with no per-person exceptions applied.

const OWNER_CAPABILITIES: Capability[] = ALL_CAPABILITIES

export const ROLE_PRESETS: Record<TeamRole, Capability[]> = {
  owner: OWNER_CAPABILITIES,

  manager: [
    'view_workspace', 'schedule_show', 'capture_show', 'edit_setlist',
    'confirm_recording_match', 'confirm_work_info', 'prepare_claim',
    'submit_to_pro', 'view_financial', 'manage_team',
  ],

  tour_manager: [
    'view_workspace', 'schedule_show', 'capture_show', 'edit_setlist',
    'confirm_recording_match', 'prepare_claim',
  ],

  band_member: [
    'view_workspace', 'schedule_show', 'capture_show', 'edit_setlist',
    'confirm_recording_match', 'prepare_claim',
  ],

  viewer: ['view_workspace'],
}

// ─── Grants ───────────────────────────────────────────────────────────────────
// The blueprint's "Optional" cells: off by default, the artist may turn them on
// for one specific person. A grant can only ADD a capability listed here for
// that role — it can never add a capability the role isn't allowed to hold.

export const GRANTABLE_BY_ROLE: Record<TeamRole, Capability[]> = {
  owner: [],
  manager: [],
  tour_manager: ['confirm_work_info'],
  band_member: [],
  viewer: [],
}

// Never grantable to anyone, at any role, by any mechanism.
export const OWNER_ONLY: Capability[] = ['transfer_ownership']

// ─── Resolution ───────────────────────────────────────────────────────────────

// Unknown/legacy role strings fail CLOSED to viewer rather than inheriting
// anything. As of the production check, every artist_delegates row is
// 'manager', so nothing currently lands here.
export function parseRole(raw: string | null | undefined): TeamRole {
  switch ((raw || '').trim().toLowerCase()) {
    case 'owner':        return 'owner'
    case 'manager':      return 'manager'
    case 'tour_manager':
    case 'tour-manager':
    case 'tm':           return 'tour_manager'
    case 'band_member':
    case 'band-member':
    case 'band':         return 'band_member'
    case 'viewer':       return 'viewer'
    default:             return 'viewer'
  }
}

// The only correct way to decide someone's role for a record. Ownership wins
// over any stored row: if the viewer IS the artist, they're the owner even if a
// stray artist_delegates row also names them.
export function resolveRole(args: {
  viewerId: string | null | undefined
  ownerId: string | null | undefined
  delegateRole?: string | null
  delegationAccepted?: boolean
}): TeamRole | null {
  const { viewerId, ownerId, delegateRole, delegationAccepted } = args
  if (!viewerId) return null
  if (ownerId && viewerId === ownerId) return 'owner'
  // A pending invite confers nothing until it's accepted.
  if (!delegateRole || delegationAccepted === false) return null
  return parseRole(delegateRole)
}

// ─── Checks ───────────────────────────────────────────────────────────────────

export type Grants = Capability[] | null | undefined

export function capabilitiesFor(role: TeamRole | null, grants?: Grants): Capability[] {
  if (!role) return []
  const preset = ROLE_PRESETS[role]
  if (!grants || grants.length === 0) return preset
  const allowed = GRANTABLE_BY_ROLE[role]
  const extra = grants.filter(g => allowed.includes(g) && !OWNER_ONLY.includes(g) && !preset.includes(g))
  return [...preset, ...extra]
}

export function can(role: TeamRole | null, capability: Capability, grants?: Grants): boolean {
  if (!role) return false
  if (OWNER_ONLY.includes(capability)) return role === 'owner'
  return capabilitiesFor(role, grants).includes(capability)
}

// ─── PRO submission authority ─────────────────────────────────────────────────
// Filing is not an ordinary capability. Some PROs restrict who may file at all,
// independent of what the artist has delegated — BMI Live only accepts entries
// from the performing songwriter, and BMI's Online Services terms put the
// consequences of bad data on the songwriter's own account. So the PRO's rule
// is applied AFTER the role check and can only ever narrow it.
//
// Pass the PRO code as a plain string (e.g. 'BMI') to keep this file free of
// any dependency on lib/pro-rules.ts.
//
// Evaluation order is load-bearing, not incidental:
//   1. owner                              -> submit
//   2. viewer                             -> view_only
//   3. BMI/writer-only PRO (any other role) -> prepare_only / pro_requires_writer
//   4. role holds submit_to_pro           -> submit
//   5. everything else                    -> prepare_only / not_permitted
// Viewer is checked immediately after owner and BEFORE the PRO/writer-only
// check, so a viewer never falls into a prepare_only hand-off branch (Send to
// artist / Artist filed it are still actionable claim-state controls a
// view_workspace-only role must never see) — viewer = view_workspace only,
// full stop, regardless of which PRO the show is for. parseRole() already
// fails closed to 'viewer' for any unrecognized stored role string, so an
// invalid/unknown role also lands here — never in a prepare_only or submit
// branch.

const WRITER_ONLY_PROS = new Set(['BMI'])

export type SubmissionAuthority =
  | { action: 'submit' }
  | { action: 'view_only' }
  | { action: 'prepare_only'; reason: 'pro_requires_writer' | 'not_permitted' }

export function submissionAuthority(args: {
  role: TeamRole | null
  pro?: string | null
  grants?: Grants
}): SubmissionAuthority {
  const { role, pro, grants } = args
  if (role === 'owner') return { action: 'submit' }
  if (role === 'viewer') return { action: 'view_only' }
  if (pro && WRITER_ONLY_PROS.has(pro.trim().toUpperCase())) {
    return { action: 'prepare_only', reason: 'pro_requires_writer' }
  }
  if (can(role, 'submit_to_pro', grants)) return { action: 'submit' }
  return { action: 'prepare_only', reason: 'not_permitted' }
}
