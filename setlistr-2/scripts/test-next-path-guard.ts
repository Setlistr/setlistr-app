// Behavioral tests for lib/nextPathGuard.ts — the one function standing
// between the team-invite redirect-preservation fix (middleware.ts,
// app/auth/login/page.tsx, app/auth/confirm/page.tsx) and an open
// redirect. No network, no database — pure string logic.
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-next-path-guard.ts

import { sanitizeNextPath } from '../lib/nextPathGuard'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

check('null -> null', sanitizeNextPath(null) === null)
check('undefined -> null', sanitizeNextPath(undefined) === null)
check('empty string -> null', sanitizeNextPath('') === null)

check('the one real destination passes through unchanged', sanitizeNextPath('/app/accept-invite?token=abc123') === '/app/accept-invite?token=abc123')
check('bare path with no query also passes', sanitizeNextPath('/app/accept-invite') === '/app/accept-invite')

check('protocol-relative host ("//evil.com") rejected even with the right prefix smuggled in', sanitizeNextPath('//evil.com/app/accept-invite') === null)
check('absolute URL (scheme) rejected', sanitizeNextPath('https://evil.com/app/accept-invite') === null)
check('absolute URL with the allowed path as a DECOY query value is still rejected — the check is on the raw value\'s own prefix, not a substring search', sanitizeNextPath('https://evil.com/?x=/app/accept-invite') === null)

check('a different /app/* destination is rejected — this is not a general redirect-preservation mechanism', sanitizeNextPath('/app/dashboard') === null)
check('a path that merely CONTAINS the allowed prefix later in the string is rejected (startsWith, not includes)', sanitizeNextPath('/not/app/accept-invite') === null)
check('a similarly-named but different path is rejected, not matched by a loose prefix check', sanitizeNextPath('/app/accept-invite-evil') === null)
check('the allowed path with a trailing slash is rejected — not the same path', sanitizeNextPath('/app/accept-invite/') === null)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
