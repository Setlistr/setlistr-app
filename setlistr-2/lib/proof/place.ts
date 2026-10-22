// Proof of Performance: reading a show's place from its free-text city and
// country fields, and accepting a city lookup only with enough context.
// Pure; used by lib/proof/summary.ts (grouping, counts) and lib/proof/load.ts
// (lookups). Scoped to Proof: Career and capture keep their own handling.
//
// Rules (docs/proof-of-performance-plan.md §2, Location):
// - An explicit state or province ("Austin, TX", "London, Ontario") is kept
//   and must agree with the country; disagreement leaves the place unresolved.
// - A two-letter value that is also a US state or Canadian province code
//   (TN, CA, IN…) is not read as a country on its own: both readings are
//   looked up, and only one reading that identifies a place settles it.
// - A lookup is accepted only when exactly one city-level place of that name
//   matches the context; the highest-ranked result is never taken on rank alone.
// - Stored countries and coordinates are never overridden.

export type Subdivision = { country: 'US' | 'CA'; code: string; name: string }

const US: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
}
const CA: Record<string, string> = {
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick', NL: 'Newfoundland and Labrador', NS: 'Nova Scotia',
  NT: 'Northwest Territories', NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec', SK: 'Saskatchewan', YT: 'Yukon',
}

export function normaliseText(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

const SUB_BY_KEY = new Map<string, Subdivision>()
for (const [code, name] of Object.entries(US)) { const s = { country: 'US' as const, code, name }; SUB_BY_KEY.set(code.toLowerCase(), s); SUB_BY_KEY.set(normaliseText(name), s) }
for (const [code, name] of Object.entries(CA)) { const s = { country: 'CA' as const, code, name }; SUB_BY_KEY.set(code.toLowerCase(), s); SUB_BY_KEY.set(normaliseText(name), s) }
SUB_BY_KEY.set('d c', SUB_BY_KEY.get('dc')!); SUB_BY_KEY.set('que', SUB_BY_KEY.get('qc')!); SUB_BY_KEY.set('ont', SUB_BY_KEY.get('on')!)
SUB_BY_KEY.set('pq', SUB_BY_KEY.get('qc')!); SUB_BY_KEY.set('newfoundland', SUB_BY_KEY.get('nl')!); SUB_BY_KEY.set('quebec province', SUB_BY_KEY.get('qc')!)

export function subdivisionOf(text: string | null | undefined): Subdivision | null {
  if (!text) return null
  return SUB_BY_KEY.get(normaliseText(text)) ?? null
}

// Country names as people write them. Two-letter values are handled apart.
const COUNTRY_NAMES: Record<string, string> = {
  canada: 'CA', 'united states': 'US', 'united states of america': 'US', usa: 'US', 'u s': 'US', 'u s a': 'US', america: 'US',
  'united kingdom': 'GB', uk: 'GB', 'u k': 'GB', 'great britain': 'GB', britain: 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB',
  ireland: 'IE', australia: 'AU', 'new zealand': 'NZ', germany: 'DE', deutschland: 'DE', france: 'FR', netherlands: 'NL', 'the netherlands': 'NL', holland: 'NL',
  belgium: 'BE', spain: 'ES', espana: 'ES', italy: 'IT', italia: 'IT', portugal: 'PT', sweden: 'SE', norway: 'NO', denmark: 'DK', finland: 'FI', iceland: 'IS',
  switzerland: 'CH', austria: 'AT', poland: 'PL', czechia: 'CZ', 'czech republic': 'CZ', hungary: 'HU', greece: 'GR', mexico: 'MX', brazil: 'BR',
  argentina: 'AR', chile: 'CL', colombia: 'CO', japan: 'JP', 'south korea': 'KR', korea: 'KR', china: 'CN', india: 'IN', 'south africa': 'ZA', singapore: 'SG',
}
// ISO 3166-1 alpha-2 codes (current), so arbitrary two letters aren't taken as a country.
const ISO2 = new Set(('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ ' +
  'DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ ' +
  'OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ ' +
  'UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' '))

// Readings of a free-text country field: a country, a state/province typed in
// the country field, or (for codes such as TN or CA) both.
export type CountryReading = { country: string; region: Subdivision | null }
export function countryReadings(field: string | null | undefined): CountryReading[] {
  if (!field || !field.trim()) return []
  const t = field.trim()
  if (/^[A-Za-z]{2}$/.test(t) || /^[A-Za-z]\.[A-Za-z]\.?$/.test(t)) {
    const code = t.replace(/\./g, '').toUpperCase()
    const out: CountryReading[] = []
    const iso = code === 'UK' ? 'GB' : code
    if (ISO2.has(iso)) out.push({ country: iso, region: null })
    const sub = subdivisionOf(code)
    if (sub) out.push({ country: sub.country, region: sub })
    return out
  }
  const named = COUNTRY_NAMES[normaliseText(t)]
  if (named) return [{ country: named, region: null }]
  const sub = subdivisionOf(t)
  return sub ? [{ country: sub.country, region: sub }] : []
}

// The country a field names, when that is unambiguous (a name, or a code that
// isn't also a state or province); otherwise null. Used where no lookup runs.
export function countryCode(field: string | null | undefined): string | null {
  const r = countryReadings(field)
  return r.length === 1 && !r[0].region ? r[0].country : null
}

// Established city-name variants, deliberately few: the name a lookup will
// return for the way people write it.
const VARIANTS: Record<string, { name: string; region?: string; country?: string }> = {
  'new york city': { name: 'New York', region: 'NY', country: 'US' }, nyc: { name: 'New York', region: 'NY', country: 'US' },
  'quebec city': { name: 'Québec', region: 'QC', country: 'CA' }, 'ville de quebec': { name: 'Québec', region: 'QC', country: 'CA' },
  'washington dc': { name: 'Washington', region: 'DC', country: 'US' }, 'washington d c': { name: 'Washington', region: 'DC', country: 'US' },
}

// City names compared for identity: accents, case and punctuation ignored, and
// "St."/"Saint" and "Ste."/"Sainte" treated as the same word.
export function cityKey(name: string): string {
  return normaliseText(name).split(' ').map(w => w === 'st' ? 'saint' : w === 'ste' ? 'sainte' : w).join(' ')
}

export type PlaceContext = {
  name: string | null              // the city as written (before any comma)
  query: string | null             // the name to look up (a variant's established name)
  // Every (country, state/province) reading consistent with the fields; one
  // means the context is settled, several need a lookup to choose, none means
  // missing or conflicting context (unresolved).
  readings: CountryReading[]
  conflict: boolean
}

function intersect(a: CountryReading[], b: CountryReading[]): CountryReading[] {
  const out: CountryReading[] = []
  for (const x of a) for (const y of b) {
    if (x.country !== y.country) continue
    if (x.region && y.region && x.region.code !== y.region.code) continue
    const r = { country: x.country, region: x.region ?? y.region }
    if (!out.some(o => o.country === r.country && o.region?.code === r.region?.code)) out.push(r)
  }
  return out
}

export function placeContext(cityField: string | null | undefined, countryField: string | null | undefined): PlaceContext {
  const parts = (cityField || '').split(',').map(s => s.trim()).filter(Boolean)
  const name = parts[0] || null
  if (!name) return { name: null, query: null, readings: [], conflict: false }
  const variant = VARIANTS[normaliseText(name)]
  // Context written with the city ("Austin, TX", "Toronto, ON, Canada") and
  // implied by an established variant ("NYC"). Unrecognised extras are ignored.
  const constraints: CountryReading[][] = []
  if (variant?.country) constraints.push([{ country: variant.country, region: variant.region ? subdivisionOf(variant.region) : null }])
  for (const extra of parts.slice(1)) { const r = countryReadings(extra); if (r.length) constraints.push(r) }
  const field = countryReadings(countryField)
  let readings = field.length ? field : constraints.shift() ?? []
  const hadContext = readings.length > 0
  for (const c of constraints) readings = intersect(readings, c)
  // Context that disagrees (Toronto, ON with US; Austin, TX with Canada) is a
  // conflict: nothing is chosen.
  return { name, query: variant?.name ?? name, readings, conflict: hadContext && readings.length === 0 }
}

// The grouping key for a place: same city and same readings.
export function contextKey(ctx: PlaceContext): string | null {
  if (!ctx.name) return null
  const r = ctx.readings.map(x => `${x.country}${x.region ? '-' + x.region.code : ''}`).sort().join('/')
  return `${cityKey(ctx.query || ctx.name)}|${r || (ctx.conflict ? '!' : '?')}`
}

// ── Lookups ─────────────────────────────────────────────────────────────────
export type GeoFeature = { text?: string; place_type?: string[]; relevance?: number; center?: [number, number]; context?: { id?: string; short_code?: string; text?: string }[]; properties?: { short_code?: string } }

// The request for one reading: the established name, with the state or
// province named when known, limited to the country and to city-level places.
export function lookupQuery(ctx: PlaceContext, reading: CountryReading): { text: string; country: string } {
  return { text: reading.region ? `${ctx.query}, ${reading.region.name}` : ctx.query!, country: reading.country }
}

// Accept a city only when exactly one city-level result has the name, the
// country and (when known) the state or province. Several same-named places
// with no state or province to choose between them stay unresolved.
export function acceptPlace(ctx: PlaceContext, reading: CountryReading, features: GeoFeature[]): { lat: number; lng: number } | null {
  const want = cityKey(ctx.query || '')
  const matches = features.filter(f => {
    if (!f.center || !f.place_type?.includes('place')) return false
    if (cityKey(f.text || '') !== want) return false
    const country = f.context?.find(c => c.id?.startsWith('country'))?.short_code?.toUpperCase()
    if (country !== reading.country) return false
    if (reading.region) {
      const region = f.context?.find(c => c.id?.startsWith('region'))?.short_code?.toUpperCase()
      if (region !== `${reading.country}-${reading.region.code}`) return false
    }
    return true
  })
  if (matches.length !== 1) return null
  const [lng, lat] = matches[0].center!
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
}
