// Focused, DB-free tests for lib/geocode-match.ts — the venue-disambiguation
// logic behind the "map showed the wrong city" fix. Ported from
// app/app/show/new/page.tsx's already-correct VenueMap component into a
// shared function so app/app/upload/new/page.tsx's VenueMapPreview can't
// silently drift away from it again (that drift — a "trimmed duplicate"
// that dropped the city check — is what caused the original bug).
//
// Run via:
//   npx ts-node --transpile-only -P scripts/tsconfig.json scripts/test-geocode-match.ts

import { pickGeocodeMatch, type GeocodeFeature } from '../lib/geocode-match'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ok   ${name}`) }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`) }
}

function feature(place: string | undefined, lat: number, lng: number): GeocodeFeature {
  return { properties: { context: { place: place ? { name: place } : undefined }, coordinates: { latitude: lat, longitude: lng } } }
}

// The exact reported scenario: a venue name that resolves near Nashville
// (top-ranked, e.g. via IP-based proximity bias) AND near Peterborough
// (the real, historical show location) — the artist entered "Peterborough"
// as the city.
const nashvilleTop = feature('Nashville', 36.1627, -86.7816)
const peterboroughSecond = feature('Peterborough', 44.3091, -78.3197)
const ambiguousResults = [nashvilleTop, peterboroughSecond]

// ── 1. City provided, and it matches a non-top result — picks the CITY
//    match, never the unrelated top-ranked one. This is the core fix. ────
{
  const chosen = pickGeocodeMatch(ambiguousResults, 'Peterborough')
  check('1. city given, matches second result: picks Peterborough, not the top-ranked Nashville result',
    chosen === peterboroughSecond, JSON.stringify(chosen))
}

// ── 2. City provided, case/whitespace-insensitive match ──────────────────
check('2. city match is case-insensitive', pickGeocodeMatch(ambiguousResults, '  peterborough  ') === peterboroughSecond)

// ── 3. City provided, no candidate matches it — must fail closed (null),
//    never silently fall back to an unrelated city's result. This is the
//    "do not silently claim the phone's current location is the historical
//    venue" requirement. ──────────────────────────────────────────────────
{
  const chosen = pickGeocodeMatch(ambiguousResults, 'Austin')
  check('3. city given, nothing matches: returns null (fail closed), never a wrong-city fallback', chosen === null, JSON.stringify(chosen))
}

// ── 4. No city provided at all — accepts the top result, same as
//    show/new's VenueMap's own no-city fallback (nothing to validate
//    against, so behavior is unchanged from before city support existed). ─
{
  const chosen = pickGeocodeMatch(ambiguousResults, undefined)
  check('4a. no city (undefined): accepts top result', chosen === nashvilleTop)
  const chosenEmpty = pickGeocodeMatch(ambiguousResults, '')
  check('4b. no city (empty string): accepts top result', chosenEmpty === nashvilleTop)
  const chosenBlank = pickGeocodeMatch(ambiguousResults, '   ')
  check('4c. no city (whitespace only): accepts top result', chosenBlank === nashvilleTop)
}

// ── 5. Empty features array ────────────────────────────────────────────
check('5a. empty features, no city: null', pickGeocodeMatch([], undefined) === null)
check('5b. empty features, city given: null', pickGeocodeMatch([], 'Peterborough') === null)

// ── 6. City given, only one result and it matches — picks it ────────────
check('6. single matching result: picks it', pickGeocodeMatch([peterboroughSecond], 'Peterborough') === peterboroughSecond)

// ── 7. Feature missing context/place entirely — never matches a city
//    filter, never crashes. ────────────────────────────────────────────
{
  const noContext: GeocodeFeature = { properties: { coordinates: { latitude: 1, longitude: 2 } } }
  const chosen = pickGeocodeMatch([noContext, peterboroughSecond], 'Peterborough')
  check('7. malformed feature (no context) is skipped, real match still found', chosen === peterboroughSecond)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
