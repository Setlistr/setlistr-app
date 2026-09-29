// Picks the correct candidate out of a Mapbox Search Box `/forward` response
// when more than one place shares a venue name. Extracted from
// app/app/show/new/page.tsx's VenueMap component, which already solved this
// correctly: search on the venue name alone (broad), then validate against
// the city the artist actually entered, rather than trusting Mapbox's
// top-ranked result unconditionally.
//
// This exists as a shared function because app/app/upload/new/page.tsx's
// VenueMapPreview was built as a "trimmed duplicate" of VenueMap and, in the
// trim, dropped the city-validation step entirely — it took Mapbox's first
// result with no city to check it against. Mapbox's Search Box API falls
// back to IP-based proximity bias when no `proximity`/city constraint is
// given, so for a venue name that exists in more than one city, an artist
// uploading a recording of a past show somewhere else could get back a
// result near wherever THEY are right now — their phone's current city,
// silently presented as if it were the historical venue's location. Reusing
// this one function in both places means that gap can't reopen by drifting
// between two copies again.

export interface GeocodeFeature {
  properties?: {
    context?: { place?: { name?: string } }
    coordinates?: { latitude?: number; longitude?: number }
  }
}

// Returns the first candidate (in Mapbox's own relevance order) whose
// place-level context matches `city`, case-insensitively. If `city` isn't
// provided, there's nothing to validate against, so the top result is
// accepted as-is — same fallback app/app/show/new/page.tsx's VenueMap uses.
// Returns null when a city WAS provided but no candidate matches it —
// callers must treat that as "couldn't confirm this location," never fall
// back to an unrelated result.
export function pickGeocodeMatch(features: GeocodeFeature[], city: string | null | undefined): GeocodeFeature | null {
  if (!city || !city.trim()) return features[0] || null
  const target = city.trim().toLowerCase()
  return features.find(f => {
    const placeName = f.properties?.context?.place?.name
    return typeof placeName === 'string' && placeName.trim().toLowerCase() === target
  }) || null
}
