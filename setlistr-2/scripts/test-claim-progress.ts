// DB-free tests for lib/claim-progress.ts and the rule data the claim sheet
// relies on. Run:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-claim-progress.ts
import {
  claimInputsKey, legacyClaimInputsKey, preflightKey, legacyPreflightKey, progressKey, scrollKey,
  fingerprint, markCopied, isCopied, songCopied, allSongsCopied, ALL_SONGS_KEY, allTitles, parseProgress,
  judgeWrite, judgeReadBack,
} from '../lib/claim-progress'
import { PRO_RULES, type ProCode } from '../lib/pro-rules'

let pass = 0, fail = 0
function check(name: string, ok: boolean) { if (ok) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`  FAIL ${name}`) } }

// Keys: every one names the account; none collide across accounts, shows or PROs.
const A = 'aaaa-viewer', B = 'bbbb-viewer', OWNER = 'oooo-owner', SHOW = 'ssss-show', SHOW2 = 'tttt-show'
check('claim inputs: per account', claimInputsKey(A, SHOW) !== claimInputsKey(B, SHOW))
check('claim inputs: per show', claimInputsKey(A, SHOW) !== claimInputsKey(A, SHOW2))
check('claim inputs: never the released account-less key', claimInputsKey(A, SHOW) !== legacyClaimInputsKey(SHOW))
check('claim inputs: released key unchanged', legacyClaimInputsKey(SHOW) === `setlistr:claim:${SHOW}`)
check('preflight: per account', preflightKey(A, OWNER, 'BMI') !== preflightKey(B, OWNER, 'BMI'))
check('preflight: per artist', preflightKey(A, OWNER, 'BMI') !== preflightKey(A, 'other-owner', 'BMI'))
check('preflight: per PRO', preflightKey(A, OWNER, 'BMI') !== preflightKey(A, OWNER, 'ASCAP'))
check('preflight: released key unchanged', legacyPreflightKey(OWNER, 'BMI') === `setlistr:preflight:${OWNER}:BMI`)
check('progress: per account, show and PRO', new Set([progressKey(A, SHOW, 'SOCAN'), progressKey(B, SHOW, 'SOCAN'), progressKey(A, SHOW2, 'SOCAN'), progressKey(A, SHOW, 'BMI')]).size === 4)
check('scroll: per account and show', scrollKey(A, SHOW) !== scrollKey(B, SHOW) && scrollKey(A, SHOW) !== scrollKey(A, SHOW2))

// Copied marks follow the value.
let m = markCopied({}, 'promoter', 'Collective Concerts')
check('copied value is marked', isCopied(m, 'promoter', 'Collective Concerts'))
check('editing the value clears its mark', !isCopied(m, 'promoter', 'Collective Concerts Ltd'))
check('restoring the value restores the mark', isCopied(m, 'promoter', 'Collective Concerts'))
check('an empty value is never copied', !isCopied(markCopied({}, 'promoter', ''), 'promoter', ''))
check('another field is unaffected', !isCopied(m, 'venue_name', 'Collective Concerts'))
check('marks store a fingerprint, not the value', !JSON.stringify(markCopied({}, 'ipi_number', '00012345678')).includes('00012345678'))
check('fingerprint separates near values', fingerprint('9:00 PM') !== fingerprint('9:30 PM') && fingerprint('ab') !== fingerprint('ba'))

const titles = ['Northern Sky', 'Harbour Lights', 'Last Train']
m = markCopied({}, 'song-0', 'Northern Sky')
check('one song copied', songCopied(m, titles, 0) && !songCopied(m, titles, 1))
check('not all songs yet', !allSongsCopied(m, titles))
m = markCopied(markCopied(m, 'song-1', 'Harbour Lights'), 'song-2', 'Last Train')
check('every song copied one by one', allSongsCopied(m, titles))
const all = markCopied({}, ALL_SONGS_KEY, allTitles(titles))
check('Copy all titles marks every song', allSongsCopied(all, titles) && songCopied(all, titles, 2))
check('a changed setlist clears Copy all titles', !allSongsCopied(all, [...titles, 'Encore']) && !allSongsCopied(all, ['Northern Sky', 'Harbor Lights', 'Last Train']))
check('no songs is never "all copied"', !allSongsCopied(markCopied({}, ALL_SONGS_KEY, ''), []))

// Stored progress is parsed defensively.
check('progress: empty', JSON.stringify(parseProgress(null)) === JSON.stringify({ marks: {}, portalOpened: false }))
check('progress: corrupt JSON', parseProgress('{oops').portalOpened === false)
check('progress: released array shape is dropped', Object.keys(parseProgress(JSON.stringify({ copiedKeys: ['venue_name'], portalOpened: true })).marks).length === 0)
check('progress: portal flag must be true exactly', parseProgress(JSON.stringify({ marks: {}, portalOpened: 'yes' })).portalOpened === false)
check('progress: non-string marks dropped', JSON.stringify(parseProgress(JSON.stringify({ marks: { a: 'x', b: 3 }, portalOpened: true }))) === JSON.stringify({ marks: { a: 'x' }, portalOpened: true }))

// Recording outcomes.
check('one row, no error: saved without a read-back', judgeWrite({ error: false, rows: 1 }) === 'saved')
check('zero rows: read back', judgeWrite({ error: false, rows: 0 }) === 'check')
check('error: read back', judgeWrite({ error: true, rows: 0 }) === 'check')
check('two rows (never expected): read back, not success', judgeWrite({ error: false, rows: 2 }) === 'check')
check('lost response, stored submitted: saved', judgeReadBack({ error: true, rows: 0 }, { ok: true, submissionStatus: 'submitted', submittedAt: 'x' }) === 'saved')
check('zero rows, stored submitted: already recorded', judgeReadBack({ error: false, rows: 0 }, { ok: true, submissionStatus: 'submitted', submittedAt: 'x' }) === 'already')
check('rejected write, stored not submitted: not saved', judgeReadBack({ error: true, rows: 0 }, { ok: true, submissionStatus: null, submittedAt: null }) === 'not_saved')
check('zero rows (denied), stored not submitted: not saved', judgeReadBack({ error: false, rows: 0 }, { ok: true, submissionStatus: null, submittedAt: null }) === 'not_saved')
check('read-back failed: uncertain, never "not saved"', judgeReadBack({ error: true, rows: 0 }, { ok: false }) === 'uncertain')

// Rule data the sheet depends on.
const codes = Object.keys(PRO_RULES) as ProCode[]
check('seven PROs', codes.length === 7)
check('writer-submits only where the PRO says so (ASCAP, BMI)', codes.filter(c => PRO_RULES[c].writerSubmits).sort().join() === 'ASCAP,BMI')
check('ASCAP note says writers submit', PRO_RULES.ASCAP.notes.some(n => /writer/i.test(n)))
check('BMI preflight says the performing songwriter enters shows', PRO_RULES.BMI.preflight.some(p => /performing songwriter/i.test(p.detail)))
check('GMR stays a rep path', !PRO_RULES.GMR.selfServe && PRO_RULES.GMR.portalLabel === 'Contact GMR Rep')
check('official deadlines only ASCAP and BMI', codes.filter(c => PRO_RULES[c].deadline(new Date(2026, 9, 10)).confidence === 'official').sort().join() === 'ASCAP,BMI')
check('working defaults SOCAN, PRS, APRA', codes.filter(c => PRO_RULES[c].deadline(new Date(2026, 9, 10)).confidence === 'unverified').sort().join() === 'APRA,PRS,SOCAN')
check('reminders SESAC, GMR', codes.filter(c => PRO_RULES[c].deadline(new Date(2026, 9, 10)).confidence === 'reminder').sort().join() === 'GMR,SESAC')
// ASCAP's published table (ascap.com/music-creators/ascap-onstage, read 2026-10-20).
const ascap = (y: number, mo: number) => { const d = PRO_RULES.ASCAP.deadline(new Date(y, mo, 15)).date; return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` }
check('ASCAP: Jan–Mar → Jun 30', ascap(2026, 1) === '2026-6-30')
check('ASCAP: Apr–Jun → Sep 30', ascap(2026, 4) === '2026-9-30')
check('ASCAP: Jul–Sep → Dec 31', ascap(2026, 7) === '2026-12-31')
check('ASCAP: Oct–Dec → Mar 31 next year', ascap(2026, 10) === '2027-3-31')
// Field order is the portal's, unchanged.
const order = (c: ProCode) => PRO_RULES[c].fields.map(f => f.key).join(',')
check('SOCAN order', order('SOCAN') === 'setlist_title,songs,venue_name,venue_city,performance_date,promoter')
check('BMI order', order('BMI') === 'venue_name,venue_city,performance_date,start_time,ticket_price,promoter,songs')
check('GMR order', order('GMR') === 'venue_name,venue_city,performance_date,promoter,attendance,songs')
check('ASCAP order', order('ASCAP') === 'setlist_title,songs,venue_name,venue_city,performance_date,ticket_price,promoter,attendance')
check('PRS order', order('PRS') === 'venue_name,venue_city,performance_date,ticket_price,promoter,songs')
check('APRA order', order('APRA') === 'venue_name,venue_city,performance_date,promoter,songs')
check('SESAC order', order('SESAC') === 'setlist_title,venue_name,venue_city,capacity,performance_date,ticket_price,attendance,songs')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
