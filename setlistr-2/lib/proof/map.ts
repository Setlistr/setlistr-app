// Proof of Performance map framing (docs/proof-of-performance-plan.md §3).
// Pure Web Mercator maths: fits the confirmed places into a Mapbox Static
// Images view and returns the view's centre and zoom plus each place's dot
// position as a percentage of the image. The image is drawn without
// markers and Setlistr's gold dots sit on top, so the page and the export
// share one framing and venue coordinates never leave the server.

import { normaliseText } from './summary'

// Mapbox styles render 512px tiles: the world is 512 · 2^zoom pixels wide.
const TILE = 512
const MAX_LAT = 85.0511

export type MapPlace = { name: string; shows: number; lat: number; lng: number }
export type MapDot = { x: number; y: number; d: number; shows: number; name: string }
export type MapView = { lng: number; lat: number; zoom: number; w: number; h: number; dots: MapDot[] }
export type ViewSpec = { w: number; h: number; pad: number; base: number; step: number }

// Logical sizes (images are requested @2x). Aspect ratios match the approved
// revision 3 compositions: phone 332×176, desktop 888×300, cover 524×210.
export const VIEWS = {
  phone: { w: 400, h: 212, pad: 20, base: 6, step: 1.6 },
  wide: { w: 1000, h: 338, pad: 36, base: 7, step: 1.9 },
  cover: { w: 524, h: 210, pad: 22, base: 6, step: 1.6 },
} satisfies Record<string, ViewSpec>
export type ViewName = keyof typeof VIEWS

// Fewer places than this are set in type instead of drawn.
export const MIN_MAPPED_PLACES = 3

function unitX(lng: number) { return (lng + 180) / 360 }
function unitY(lat: number) {
  const r = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI / 180
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2
}
function lngOf(x: number) { return x * 360 - 180 }
function latOf(y: number) { return Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI }

// Gentle size differences: base for one show, + step · √(n−1).
export function dotSize(shows: number, spec: Pick<ViewSpec, 'base' | 'step'>): number {
  return Math.round((spec.base + spec.step * Math.sqrt(Math.max(0, shows - 1))) * 10) / 10
}

export function frameView(places: MapPlace[], spec: ViewSpec, maxZoom = 9): MapView | null {
  if (places.length === 0) return null
  const xs = places.map(p => unitX(p.lng)), ys = places.map(p => unitY(p.lat))
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  // Leave room for the largest dot at the edges as well as the padding.
  const edge = spec.pad + dotSize(Math.max(...places.map(p => p.shows)), spec) / 2
  const spanX = Math.max(maxX - minX, 1e-6), spanY = Math.max(maxY - minY, 1e-6)
  let zoom = Math.log2(Math.min((spec.w - 2 * edge) / (spanX * TILE), (spec.h - 2 * edge) / (spanY * TILE)))
  zoom = Math.max(0, Math.min(maxZoom, zoom))
  zoom = Math.floor(zoom * 100) / 100
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  const scale = TILE * Math.pow(2, zoom)
  const dots = places
    .map((p, i) => ({
      x: Math.round(((xs[i] - cx) * scale + spec.w / 2) / spec.w * 10000) / 100,
      y: Math.round(((ys[i] - cy) * scale + spec.h / 2) / spec.h * 10000) / 100,
      d: dotSize(p.shows, spec), shows: p.shows, name: p.name,
    }))
    // Smaller dots last, so a single show is never hidden under a busy city.
    .sort((a, b) => b.shows - a.shows)
  return { lng: Math.round(lngOf(cx) * 1e5) / 1e5, lat: Math.round(latOf(cy) * 1e5) / 1e5, zoom, w: spec.w, h: spec.h, dots }
}

// The Static Images URL for a view (no markers; the dots are drawn on top).
// The token is the public browser token, as Career's map already uses.
export function staticMapUrl(v: Pick<MapView, 'lng' | 'lat' | 'zoom' | 'w' | 'h'>, token: string): string {
  return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${v.lng},${v.lat},${v.zoom},0/${v.w}x${v.h}@2x?access_token=${encodeURIComponent(token)}`
}

// A Mapbox geocoding answer for "city, country" is used only when it is
// unambiguous: a city-level place, in the requested country, named as the
// city, and the best match by a clear margin.
export type GeoFeature = { text?: string; place_type?: string[]; relevance?: number; center?: [number, number]; context?: { id?: string; short_code?: string }[]; properties?: { short_code?: string } }

export function acceptGeocode(city: string, iso: string, features: GeoFeature[]): { lat: number; lng: number } | null {
  const top = features[0]
  if (!top || !top.center || !top.place_type?.includes('place')) return null
  if ((top.relevance ?? 0) < 0.9) return null
  const second = features[1]
  if (second && second.place_type?.includes('place') && (second.relevance ?? 0) >= (top.relevance ?? 0) - 0.05 && normaliseText(second.text || '') === normaliseText(top.text || '')) return null
  if (normaliseText(top.text || '') !== normaliseText(city)) return null
  const country = top.context?.find(c => c.id?.startsWith('country'))?.short_code
  if (!country || country.toUpperCase() !== iso.toUpperCase()) return null
  const [lng, lat] = top.center
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}
