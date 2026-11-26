// The setlist CSV moved from Review to the claim sheet in Submissions: same
// columns and values as the released Review export, offered first in the
// artist's own PRO's layout, and never a write to the show.
// npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-setlist-csv.ts
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildSetlistCsv, orderedLayouts, CSV_LAYOUTS, type CsvLayout } from '../lib/setlist-csv'

let pass = 0, fail = 0
function check(name: string, ok: boolean, got?: unknown) {
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok || got === undefined ? '' : ` → ${JSON.stringify(got)}`}`)
}

// The released Review export (main f021702, generateExportCSV), copied
// verbatim minus the browser download and telemetry, as the reference.
function releasedCsv(pro: CsvLayout, performance: any, songs: any[], day: Date) {
  const date = day.toLocaleDateString()
  const confirmedSongs = songs.filter(s => s.source !== 'planned' && !s.isRemoved)
  const headers: Record<CsvLayout, string[]> = {
    SOCAN: ['Title', 'Artist', 'Composer', 'Publisher', 'ISRC', 'Duration', 'Date', 'Venue', 'City'],
    ASCAP: ['Title', 'Performer', 'Composer/Author', 'Publisher', 'ISRC', 'Venue', 'Date', 'City', 'State'],
    BMI:   ['Song Title', 'Artist', 'BMI Work #', 'Composer', 'Publisher', 'Venue Name', 'Date', 'City'],
  }
  const rows = confirmedSongs.map(s => {
    const c = s.composer || '', p = s.publisher || '', i = s.isrc || ''
    if (pro === 'SOCAN') return [s.title, s.artist, c, p, i, '', date, performance.venue_name, performance.city]
    if (pro === 'ASCAP') return [s.title, performance.artist_name, c, p, i, performance.venue_name, date, performance.city, performance.country || '']
    return [s.title, performance.artist_name, '', c, p, performance.venue_name, date, performance.city]
  })
  const csv = [headers[pro], ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
  return { text: csv, filename: `${pro}-setlist-${performance.venue_name}-${date.replace(/\//g, '-')}.csv` }
}

const show = { venue_name: 'The Fern Room', city: 'Seattle', country: 'US', artist_name: 'Marlowe Finch' }
const day = new Date(2026, 10, 26)
const songs = [
  { title: 'Northbound', artist: 'Marlowe Finch', composer: 'M. Finch', publisher: 'Fern Songs', isrc: 'QZXYZ2600001', source: 'recognized' },
  { title: 'Salt & Cedar', artist: 'Marlowe Finch', composer: '', publisher: null, isrc: null, source: 'manual' },
  { title: 'Copper Sky', artist: 'Marlowe Finch', source: 'planned' },                 // planned, not marked played
  { title: 'Glasshouse', artist: 'Marlowe Finch', source: 'recognized', isRemoved: true }, // removed in Review
]
// Submissions' songs: removed rows never arrive (the view hides them); a
// planned-only row arrives flagged and is left out before building.
const fromSubmissions = songs.filter(s => !s.isRemoved && s.source !== 'planned')

for (const layout of CSV_LAYOUTS) {
  const want = releasedCsv(layout, show, songs, day), got = buildSetlistCsv(layout, show, fromSubmissions, day)
  check(`${layout}: same text as the released Review export`, got.text === want.text, got.text)
  check(`${layout}: same file name`, got.filename === want.filename, got.filename)
}
check('empty setlist: header row only, as before', buildSetlistCsv('BMI', show, [], day).text === releasedCsv('BMI', show, [], day).text)

// Order: the artist's own PRO first when it has a layout; never a new layout.
check('SOCAN artist: SOCAN first', orderedLayouts('SOCAN').join() === 'SOCAN,ASCAP,BMI')
check('BMI artist: BMI first', orderedLayouts('BMI').join() === 'BMI,SOCAN,ASCAP')
check('ASCAP artist: ASCAP first', orderedLayouts('ASCAP').join() === 'ASCAP,SOCAN,BMI')
for (const code of ['PRS', 'APRA', 'SESAC', 'GMR', null]) {
  check(`${code ?? 'no PRO'}: the released three, no invented layout`, orderedLayouts(code).join() === 'SOCAN,ASCAP,BMI')
}

// Source checks: Review no longer exports; the claim sheet's downloads never record a submission.
const root = join(__dirname, '..')
const review = readFileSync(join(root, 'app/app/review/[id]/page.tsx'), 'utf8')
const submit = readFileSync(join(root, 'app/app/submit/[id]/page.tsx'), 'utf8')
check('Review: no CSV export left', !/Export CSV|generateExportCSV|export_generated|text\/csv/.test(review))
const fn = (name: string) => { const a = submit.indexOf(`async function ${name}(`); return submit.slice(a, submit.indexOf('\n  }\n', a)) }
for (const name of ['downloadCsv', 'download']) {
  const body = fn(name)
  check(`Submissions ${name}(): no write to the show (no update/insert/markSubmitted)`, body.length > 100 && !/\.update\(|\.insert\(|\.upsert\(|markSubmitted|submission_status/.test(body))
}
check('Submissions: Other formats is folded (details) and holds the CSV', /<details className="sb-more"[^>]*>\s*<summary[^>]*>\s*Other formats/.test(submit) && submit.includes('downloadCsv(layout)'))
check('Submissions: layouts ordered by the show owner\'s PRO (rule from the loaded owner profile)', submit.includes('orderedLayouts(rule?.code)'))

console.log(`${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
