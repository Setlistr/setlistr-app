// Human-readable labels for IANA timezone identifiers, for a searchable
// picker — replaces a raw few-hundred-entry <select> of strings like
// "America/Indiana/Vincennes" with something a person can actually scan
// and search ("Chicago" finds it, "central" finds it too).

export interface TimezoneOption {
  value: string   // IANA identifier, e.g. "America/Chicago" — what's stored
  label: string   // "Central Time — Chicago (GMT-05:00)"
  search: string  // lowercased value+label+aliases, precomputed once for filtering
}

// IANA zone identifiers carry city names, not the regional/state names
// people actually search by — "Colorado" appears nowhere in
// "America/Denver", so it matched nothing. Curated US aliases, verified
// against the real Intl.supportedValuesOf('timeZone') list (not guessed):
// a state spanning multiple zones (Indiana, Kentucky, North Dakota, plus
// Texas/Florida/Oregon/Idaho/Nebraska/Michigan/Tennessee/Arizona at their
// real boundaries) lists every zone it actually touches, so searching it
// surfaces all of them as distinct choices rather than silently picking
// one.
const ZONE_ALIASES: Record<string, string[]> = {
  'America/New_York': ['eastern', 'et', 'est', 'edt', 'new york state', 'florida', 'georgia', 'virginia', 'north carolina', 'south carolina', 'pennsylvania', 'ohio', 'michigan', 'maine', 'massachusetts', 'connecticut', 'new jersey', 'maryland', 'tennessee', 'indiana'],
  'America/Chicago': ['central', 'ct', 'cst', 'cdt', 'illinois', 'texas', 'wisconsin', 'minnesota', 'iowa', 'missouri', 'louisiana', 'alabama', 'mississippi', 'arkansas', 'oklahoma', 'kansas', 'nebraska', 'north dakota', 'south dakota', 'tennessee'],
  'America/Denver': ['mountain', 'mt', 'mst', 'mdt', 'colorado', 'wyoming', 'utah', 'new mexico', 'montana'],
  'America/Phoenix': ['arizona', 'mountain standard', 'mst'],
  'America/Los_Angeles': ['pacific', 'pt', 'pst', 'pdt', 'california', 'washington state', 'nevada', 'oregon'],
  'America/Anchorage': ['alaska', 'akst', 'akdt'],
  'Pacific/Honolulu': ['hawaii', 'hst'],
  'America/Indianapolis': ['indiana'],
  'America/Indiana/Knox': ['indiana'],
  'America/Indiana/Marengo': ['indiana'],
  'America/Indiana/Petersburg': ['indiana'],
  'America/Indiana/Tell_City': ['indiana'],
  'America/Indiana/Vevay': ['indiana'],
  'America/Indiana/Vincennes': ['indiana'],
  'America/Indiana/Winamac': ['indiana'],
  'America/Kentucky/Monticello': ['kentucky'],
  'America/North_Dakota/Beulah': ['north dakota'],
  'America/North_Dakota/Center': ['north dakota'],
  'America/North_Dakota/New_Salem': ['north dakota'],
  'America/Boise': ['idaho'],
  'America/Detroit': ['michigan'],
  'America/Menominee': ['michigan'],
}

function currentOffsetLabel(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(new Date())
    return parts.find(p => p.type === 'timeZoneName')?.value.replace('GMT', 'GMT') || ''
  } catch { return '' }
}

function cityName(zone: string): string {
  const last = zone.split('/').pop() || zone
  return last.replace(/_/g, ' ')
}

function regionLabel(zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'long' }).formatToParts(new Date())
    return parts.find(p => p.type === 'timeZoneName')?.value || ''
  } catch { return '' }
}

let cached: TimezoneOption[] | null = null

export function getTimezoneOptions(): TimezoneOption[] {
  if (cached) return cached
  let zones: string[]
  try { zones = (Intl as any).supportedValuesOf('timeZone') }
  catch { zones = ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Australia/Sydney'] }

  cached = zones.map(zone => {
    const city = cityName(zone)
    const offset = currentOffsetLabel(zone)
    const region = regionLabel(zone)
    // "Mountain Time — Denver (GMT-07:00)" — region first, since that's
    // how people actually describe a timezone in conversation; the city
    // disambiguates which zone within that region.
    const label = `${region || city}${region && region !== city ? ` — ${city}` : ''}${offset ? ` (${offset})` : ''}`
    const aliases = (ZONE_ALIASES[zone] || []).join(' ')
    return { value: zone, label, search: `${zone} ${label} ${aliases}`.toLowerCase() }
  }).sort((a, b) => a.label.localeCompare(b.label))

  return cached
}

export function labelForZone(zone: string): string {
  return getTimezoneOptions().find(o => o.value === zone)?.label || zone
}
