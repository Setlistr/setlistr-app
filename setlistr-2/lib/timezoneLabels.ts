// Human-readable labels for IANA timezone identifiers, for a searchable
// picker — replaces a raw few-hundred-entry <select> of strings like
// "America/Indiana/Vincennes" with something a person can actually scan
// and search ("Chicago" finds it, "central" finds it too).

export interface TimezoneOption {
  value: string   // IANA identifier, e.g. "America/Chicago" — what's stored
  label: string   // "Chicago — Central Time (GMT-05:00)"
  search: string  // lowercased value+label, precomputed once for filtering
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
    const label = `${city}${region && region !== city ? ` — ${region}` : ''}${offset ? ` (${offset})` : ''}`
    return { value: zone, label, search: `${zone} ${label}`.toLowerCase() }
  }).sort((a, b) => a.label.localeCompare(b.label))

  return cached
}

export function labelForZone(zone: string): string {
  return getTimezoneOptions().find(o => o.value === zone)?.label || zone
}
