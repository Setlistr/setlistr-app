// Regression test for the reported bug: searching "Colorado" in the
// timezone picker returned no match at all, because IANA zone
// identifiers carry city names ("America/Denver"), never state/region
// names. Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-timezone-labels.ts

import { getTimezoneOptions, labelForZone } from '../lib/timezoneLabels'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

const options = getTimezoneOptions()
function matchesFor(term: string) {
  return options.filter(o => o.search.includes(term.toLowerCase()))
}

check('"colorado" resolves to America/Denver (the exact reported failure)', matchesFor('colorado').some(o => o.value === 'America/Denver'))
check('"denver" also resolves directly (city name, not just alias)', matchesFor('denver').some(o => o.value === 'America/Denver'))
check('"mountain" resolves to America/Denver', matchesFor('mountain').some(o => o.value === 'America/Denver'))
check('"arizona" resolves to its own zone (no DST, distinct from Denver)', matchesFor('arizona').some(o => o.value === 'America/Phoenix'))

const indianaMatches = matchesFor('indiana')
check('"indiana" surfaces multiple distinct zones, not a silently-chosen single one', new Set(indianaMatches.map(o => o.value)).size >= 2, JSON.stringify(indianaMatches.map(o => o.value)))
check('"indiana" includes both the Eastern and Indiana-local zones it actually spans', indianaMatches.some(o => o.value === 'America/New_York') && indianaMatches.some(o => o.value.startsWith('America/Indiana')))

check('labelForZone reads "Region — City" order (e.g. Mountain Time — Denver)', /^.*Time — Denver/.test(labelForZone('America/Denver')), labelForZone('America/Denver'))
check('every option has a non-empty label', options.every(o => o.label.length > 0))
check('no duplicate IANA values in the option list', new Set(options.map(o => o.value)).size === options.length)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
