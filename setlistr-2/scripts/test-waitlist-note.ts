// DB-free tests for lib/waitlist-note.ts (artist/project name and link carried
// in the waitlist row's existing note column). Run:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-waitlist-note.ts
import { cleanProject, cleanLink, composeNote, parseNote, linkHref, NOTE_MAX_LENGTH } from '../lib/waitlist-note'

let pass = 0, fail = 0
function check(name: string, ok: boolean) { if (ok) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`  FAIL ${name}`) } }

console.log('Links')
for (const ok of ['https://juniperhale.com', 'juniperhale.com', 'open.spotify.com/artist/abc123', 'www.instagram.com/juniper', '@juniperhale', 'http://band.example.co.uk/tour'])
  check(`accepts ${ok}`, cleanLink(ok).value === ok && !cleanLink(ok).error)
for (const bad of ['javascript:alert(1)', 'not a link', 'juniper', 'ftp://files.example.com', 'https://', '@', 'a'.repeat(201) + '.com'])
  check(`rejects ${bad.slice(0, 30)}`, cleanLink(bad).value === null && !!cleanLink(bad).error)
check('empty link is fine (optional)', cleanLink('  ').value === null && !cleanLink('  ').error)

console.log('Project')
check('trims and collapses spaces', cleanProject('  The   Late Shift ').value === 'The Late Shift')
check('too long is an error', !!cleanProject('x'.repeat(121)).error)
check('newlines cannot forge another field', cleanProject('Juniper\nLink: https://evil.example').value === 'Juniper Link: https://evil.example')

console.log('Compose and read back')
const note = composeNote({ project: 'Juniper Hale', link: '@juniperhale', note: 'Three nights a week in Nashville.' })
check('labelled lines first', note === 'Artist or project: Juniper Hale\nLink: @juniperhale\nThree nights a week in Nashville.')
const back = parseNote(note)
check('round-trips', back.project === 'Juniper Hale' && back.link === '@juniperhale' && back.rest === 'Three nights a week in Nashville.')
check('old plain notes read as text only', JSON.stringify(parseNote('Requesting beta approval after signing up.')) === JSON.stringify({ project: null, link: null, rest: 'Requesting beta approval after signing up.' }))
check('no fields and no note is null', composeNote({ project: null, link: null, note: '  ' }) === null)
const long = composeNote({ project: 'P', link: 'https://example.com', note: 'n'.repeat(1000) })
check('total stays within the column limit', !!long && long.length <= NOTE_MAX_LENGTH && long.startsWith('Artist or project: P\nLink: https://example.com\n'))

console.log('Admin links')
check('handle is not a link', linkHref('@juniperhale') === null)
check('bare domain gets https', linkHref('juniperhale.com') === 'https://juniperhale.com')
check('a forged unsafe scheme stays inert', linkHref('javascript:alert(1)') === 'https://javascript:alert(1)')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
