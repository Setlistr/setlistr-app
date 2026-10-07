// Single source of truth for what each team role is shown to grant — used
// by both the sender (app/app/settings/page.tsx, before sending) and the
// recipient (app/app/accept-invite/page.tsx, before accepting), so the two
// can never drift into describing the same role differently.
//
// Capability text must match what the role actually grants in code
// (lib/writeCapableRoles.ts, lib/inviteAuthorization.ts) — never aspirational
// copy. 'viewer' is the one role the codebase materially distinguishes
// today (read-only — isWriteCapableRole excludes it). tour_manager and
// band_member share manager's write-capable set at the DB layer
// (can_write_for() has no finer differentiation yet) but do NOT share
// manager's invite authority (canCreateInvite() requires role === 'manager'
// specifically) — the copy below reflects exactly that split, not more.

export const TEAM_ROLE_INFO: Record<string, { label: string; capabilities: string[] }> = {
  manager: {
    label: 'Manager',
    capabilities: [
      'Capture live shows on their behalf',
      'Review and clean up setlists',
      'Prepare claim information and mark performances as submitted.',
      'Invite other teammates to this workspace',
      'View their show history and royalty estimates',
    ],
  },
  tour_manager: {
    label: 'Tour Manager',
    capabilities: [
      'Capture live shows on their behalf',
      'Review and clean up setlists',
      'Prepare claim information and mark performances as submitted.',
      'View their show history and royalty estimates',
    ],
  },
  band_member: {
    label: 'Band Member',
    capabilities: [
      'Capture live shows on their behalf',
      'Review and clean up setlists',
      'Prepare claim information and mark performances as submitted.',
      'View their show history and royalty estimates',
    ],
  },
  viewer: {
    label: 'Viewer',
    capabilities: [
      'View their show history and royalty estimates',
      'See setlists and submission status',
      'Read-only — cannot capture, edit, or submit anything',
    ],
  },
}

export function roleInfoFor(role: string | undefined): { label: string; capabilities: string[] } {
  return TEAM_ROLE_INFO[role || 'manager'] || TEAM_ROLE_INFO.manager
}
