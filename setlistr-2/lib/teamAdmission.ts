// Workspace-only ("team") admission — middleware.ts.
//
// An account without Setlistr (beta) admission that holds an accepted,
// unrevoked membership on some artist's workspace may use the app pages
// needed to work in that workspace, and nothing else. It is NOT general
// admission: everything outside this list (onboarding/artist setup, admin,
// unlinked legacy pages) redirects to /app/manager, and the restricted API
// actions (own-workspace invites, requests to manage other artists, artist
// setup) check full admission explicitly on the server.
//
// Pages only. Data access stays enforced per request by the APIs and RLS
// (can_act_for / can_write_for), which also make revocation take effect on
// the very next request.

const TEAM_ALLOWED_EXACT = [
  '/app/dashboard',
  '/app/team',
  '/app/history',
  '/app/file',
  '/app/stats',
  '/app/career-map',
  '/app/proof',
  '/app/settings',
  '/app/accept-invite',
  '/app/show/new',
]

const TEAM_ALLOWED_PREFIXES = [
  '/app/manager',     // the team member's home, roster, schedule, analytics
  '/app/schedule',    // including spreadsheet import
  '/app/upload/',
  '/app/live/',
  '/app/review/',
  '/app/submit/',
  '/app/artist/',
  '/app/venue/',
]

export function isTeamAllowedPath(pathname: string): boolean {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  if (TEAM_ALLOWED_EXACT.includes(path)) return true
  return TEAM_ALLOWED_PREFIXES.some(p => p.endsWith('/') ? path.startsWith(p) : (path === p || path.startsWith(`${p}/`)))
}

export const TEAM_HOME = '/app/manager'
