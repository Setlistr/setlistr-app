// DB-free tests for lib/deadline-wording.ts. Run:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-deadline-wording.ts
import { deadlineLine, deadlineQualifier, claimSheetDeadlineLines } from '../lib/deadline-wording'
import { getProRule, daysUntil, urgencyFor, type DeadlineResult, type Urgency } from '../lib/pro-rules'

let pass = 0, fail = 0
function check(name: string, ok: boolean, got?: unknown) { if (ok) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`  FAIL ${name}`, got ?? '') } }

const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const long = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

// The released page's own expression (app/app/submit/[id]/page.tsx at 3e955c2).
function releasedLine(deadline: DeadlineResult, daysLeft: number, urgency: Urgency) {
  const daysText = daysLeft >= 0 ? `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left` : null
  return urgency === 'expired' ? `${deadline.confidence === 'official' ? 'Deadline passed' : deadline.confidence === 'unverified' ? 'Working window passed' : 'Reminder date passed'} ${fmt(deadline.date)}`
    : deadline.confidence === 'official' ? `Due ${fmt(deadline.date)} · ${daysText}`
    : deadline.confidence === 'unverified' ? `Working window to ${fmt(deadline.date)}${urgency !== 'open' ? ` · ${daysText}` : ''}`
    : `Reminder ${fmt(deadline.date)}${urgency !== 'open' ? ` · ${daysText}` : ''}`
}

const PROS = ['ASCAP', 'BMI', 'SOCAN', 'PRS', 'APRA', 'SESAC', 'GMR']
let same = 0, total = 0
for (const pro of PROS) {
  const rule = getProRule(pro)!
  for (let back = -800; back <= 30; back += 1) {
    const show = new Date(); show.setHours(0, 0, 0, 0); show.setDate(show.getDate() + back)
    const d = rule.deadline(show), days = daysUntil(d.date), u = urgencyFor(days)
    total++; if (deadlineLine(d, days, u, fmt) === releasedLine(d, days, u)) same++
  }
}
check(`page line identical to the released wording (${total} show dates across 7 PROs, every urgency)`, same === total, `${same}/${total}`)
check('page qualifier: official', deadlineQualifier('official', 'BMI') === 'From BMI’s published rule')
check('page qualifier: working window', deadlineQualifier('unverified', 'SOCAN') === 'Setlistr default, not a published deadline')
check('page qualifier: reminder', deadlineQualifier('reminder', 'GMR') === 'No published deadline')

const lines = (pro: string, show: Date, now = new Date()) => {
  const rule = getProRule(pro)!, d = rule.deadline(show)
  return claimSheetDeadlineLines(d, {
    proName: rule.name, confirmWith: rule.selfServe ? rule.name : 'the rep',
    passed: daysUntil(d.date, now) < 0, earlyStillOpen: !!(d.earlyCutoff && daysUntil(d.earlyCutoff, now) > 0), fmt: long,
  })
}
const july16 = new Date(2026, 6, 16), now = new Date(2026, 9, 21)

const bmi = lines('BMI', july16, now)
check('BMI export: "Due" with the official rule and source', bmi.some(l => /^Due:\s+March 31, 2027$/.test(l)) && bmi.some(l => l.startsWith('Basis:') && l.includes('From BMI’s published rule.') && l.includes('Dec 21') && l.includes('bmi.com/creators/bmi-live')), bmi)
check('BMI export: no "Deadline:" label', !bmi.some(l => l.startsWith('Deadline')))
check('BMI export: an open early cutoff (Dec 21, 2026) is listed', bmi[0].startsWith('Early cutoff:  December 21, 2026'), bmi)
const bmiApril = lines('BMI', new Date(2026, 3, 10), now)
check('BMI export: a passed early cutoff is left out, as on the page', !bmiApril.some(l => l.startsWith('Early cutoff')) && /^Due:\s+December 21, 2026$/.test(bmiApril[0]), bmiApril)
const bmiEarly = lines('BMI', new Date(2026, 9, 1), now)
check('BMI export: an open early cutoff is listed before Due', bmiEarly[0].startsWith('Early cutoff:') && bmiEarly[1].startsWith('Due:'), bmiEarly)

const ascap = lines('ASCAP', july16, now)
check('ASCAP export: "Due"', /^Due:\s+December 31, 2026$/.test(ascap[0]) && ascap[1].includes('From ASCAP’s published rule.'), ascap)

for (const pro of ['SOCAN', 'PRS', 'APRA']) {
  const l = lines(pro, july16, now)
  check(`${pro} export: "Working window to", Setlistr default`, /^Working window: to July 16, 2027$/.test(l[0]) && l[1].includes('Setlistr default, not a published deadline.') && l[1].includes('check it in the portal'), l)
}
for (const pro of ['SESAC', 'GMR']) {
  const l = lines(pro, july16, now)
  check(`${pro} export: "Reminder", no published deadline`, /^Reminder:\s+January 1[0-9], 2027$/.test(l[0]) && l[1].includes('No published deadline.') && l[1].includes('reminder at six months'), l)
}
const gmr = lines('GMR', july16, now)
check('GMR export: confirm timing with the rep', gmr[1].includes('confirm timing with the rep.'), gmr)

const old = new Date(2023, 0, 10)
check('passed: "Deadline passed" for official', /^Deadline passed: /.test(lines('BMI', old, now)[0]))
check('passed: "Working window passed"', /^Working window passed: /.test(lines('SOCAN', old, now)[0]))
check('passed: "Reminder date passed"', /^Reminder date passed: /.test(lines('GMR', old, now)[0]))

const sameDates = PROS.every(pro => {
  const rule = getProRule(pro)!, d = rule.deadline(july16)
  return lines(pro, july16, now).join('\n').includes(long(d.date))
})
check('export dates are the rules’ own dates, unchanged', sameDates)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
