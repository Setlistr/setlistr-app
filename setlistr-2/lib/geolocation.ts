// Geolocation verification for live captures.
//
// A performance carries two coordinate pairs: the venue's own coordinates
// (venue_latitude/venue_longitude, copied off the venues row at show
// creation) and the device's coordinates at the moment capture started
// (latitude/longitude). The distance between them is the evidence that the
// artist was physically at the venue they claim to have played.
//
// Deliberately tri-state: a missing coordinate on either side yields null,
// not false. `false` means "we measured, and they were too far away" — a
// claim worth making to a PRO. A denied permission prompt or a venue with no
// stored coordinates is not that claim, and must not be recorded as one.

export const GEOLOCATION_VERIFY_RADIUS_KM = 0.5

const EARTH_RADIUS_KM = 6371

export type Coords = { lat: number; lng: number }

export type GeolocationVerdict = {
  distanceKm: number | null
  verified: boolean | null
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

// Accepts the loose shapes coordinates arrive in — a Supabase numeric column
// can deserialize as a string, and either side may be null/undefined.
export function toCoords(lat: unknown, lng: unknown): Coords | null {
  const latNum = typeof lat === 'string' ? parseFloat(lat) : lat
  const lngNum = typeof lng === 'string' ? parseFloat(lng) : lng
  if (typeof latNum !== 'number' || typeof lngNum !== 'number') return null
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null
  // 0,0 is in the Gulf of Guinea. Nothing is played there, and it's the
  // classic shape of an uninitialized coordinate pair.
  if (latNum === 0 && lngNum === 0) return null
  if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) return null
  return { lat: latNum, lng: lngNum }
}

// Great-circle distance in kilometres.
export function haversineKm(a: Coords, b: Coords): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2)
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

// Both coordinate pairs present → measured distance and a true/false verdict.
// Either side missing → null distance and a null verdict (see note above).
export function evaluateGeolocation(
  venue: Coords | null,
  device: Coords | null,
): GeolocationVerdict {
  if (!venue || !device) return { distanceKm: null, verified: null }
  const distanceKm = haversineKm(venue, device)
  return {
    distanceKm: Math.round(distanceKm * 1000) / 1000,
    verified: distanceKm <= GEOLOCATION_VERIFY_RADIUS_KM,
  }
}
