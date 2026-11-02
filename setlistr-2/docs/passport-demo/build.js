// Builds passport.html from template.html + assembled.json (automated output) + the effort record.
const fs = require('fs'), path = require('path')
const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'assembled.json'), 'utf8'))
const started = fs.readFileSync(path.join(__dirname, 'started.txt'), 'utf8').trim()
const mins = Math.round((Date.now() - Date.parse(started)) / 60000)
D.effort_log = {
  requests: D.effort.requests, elapsed_s: D.effort.elapsed_s,
  manual: [
    'Checked access rules for 9 sources in official documentation (by hand).',
    'Fixed two query mistakes in the retrieval script (an include parameter MusicBrainz rejects) and reran it: 3 automated runs in total.',
    'Added two name-only searches after the first run found nothing linked. Still automated.',
  ],
  wall: `about ${mins} min, including page build`,
}
const html = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8').replace('__DATA__', JSON.stringify(D).replace(/</g, '\\u003c'))
fs.writeFileSync(path.join(__dirname, 'passport.html'), html)
console.log('built', html.length, 'bytes; wall', mins, 'min')
