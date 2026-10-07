// Pure, dependency-free mapping from a Team page response's `view`
// discriminant to which actions the UI may offer — explicit capabilities
// (canInvite/canRespond/canRemove/canResend), never one broad canManage
// boolean, so adding a new action later can't silently inherit the wrong
// role's authority by accident.
//
// This is UI ergonomics only, never the actual security boundary: each
// route (POST /api/team/invite, POST /api/team/respond, DELETE
// /api/team/delegates) independently re-derives and enforces its own
// authorization from the session + artist_id on every request, exactly as
// before this file existed. If this function were wrong or bypassed
// entirely, those routes still deny the same way — see
// app/api/team/delegates/route.ts's own `view` derivation, which this
// mirrors but does not replace.
export type TeamView = 'owner' | 'manager_roster' | 'self'

export interface TeamCapabilities {
  canInvite: boolean
  canRespond: boolean
  canRemove: boolean
  canResend: boolean
}

const OWNER: TeamCapabilities = { canInvite: true, canRespond: true, canRemove: true, canResend: true }
// Matches lib/inviteAuthorization.ts's canCreateInvite() exactly: an
// accepted, non-revoked manager delegate may invite — nothing else. No
// role-editing capability exists here or anywhere in this slice.
const MANAGER: TeamCapabilities = { canInvite: true, canRespond: false, canRemove: false, canResend: false }
const SELF: TeamCapabilities = { canInvite: false, canRespond: false, canRemove: false, canResend: false }

export function capabilitiesFor(view: TeamView): TeamCapabilities {
  if (view === 'owner') return OWNER
  if (view === 'manager_roster') return MANAGER
  return SELF
}
