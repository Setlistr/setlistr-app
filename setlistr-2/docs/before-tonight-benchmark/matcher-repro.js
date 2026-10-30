// Reproduces the production title-matcher failures (logic copied verbatim from
// app/api/parse-setlist/route.ts at 21d2b63) on a small catalogue. No network, no production data.
const CAT = [
  { id: 'own-dreams', title: 'Dreams', artist: 'Lena Hart' },
  { id: 'harbour', title: 'Harbour', artist: 'Lena Hart' },
  { id: 'june', title: 'June', artist: 'Lena Hart' },
  { id: 'home', title: 'Home', artist: 'Lena Hart' },
  { id: 'home-again', title: 'Home Again', artist: 'Lena Hart' },
  { id: 'saint-agnes', title: 'Saint Agnes', artist: 'Lena Hart' },
  { id: 'wildfire', title: 'Wildfire Season', artist: 'Lena Hart' },
  { id: 'neon', title: 'Neon Lights', artist: 'Lena Hart' },
  { id: 'cover-dreams', title: 'Dreams', artist: 'Fleetwood Mac' },
]
const { prodFuzzy } = require('./lib.js')(CAT)
const cases = ['Dreams (FM)', 'Dreams - Fleetwood Mac', 'Harbour > June', 'Medley: Wildfire Season / Neon Lights', 'Home', 'Home Agn', 'St Agnes', 'Neon']
for (const c of cases) { const m = prodFuzzy(c); console.log(JSON.stringify(c).padEnd(42), '→', m ? `${m.title} · ${m.artist}` : '(no match; title kept as written)') }
