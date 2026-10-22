// Images for the Proof of Performance PDF, fetched on the server with a time
// and size bound. Every failure is reported, never thrown: the document
// then uses its photo-free cover or sets the places in type and says so.

import { staticMapUrl, type MapView } from '../map'

export type PdfImage = { data: Buffer; format: 'jpg' | 'png' }
export type Fetched = { image: PdfImage | null; status: 'ok' | 'none' | 'failed'; unsupported?: boolean }

const MAX_BYTES = 10 * 1024 * 1024

async function fetchImage(url: string, headers: Record<string, string> = {}): Promise<Fetched> {
  try {
    const res = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(8000) })
    if (!res.ok) return { image: null, status: 'failed' }
    const type = (res.headers.get('content-type') || '').toLowerCase()
    const format = type.includes('png') ? 'png' : type.includes('jpeg') || type.includes('jpg') ? 'jpg' : null
    // Other formats (WebP, HEIC) can't be embedded: treated as no photo.
    if (!format) return { image: null, status: 'none', unsupported: true }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0 || buf.length > MAX_BYTES) return { image: null, status: 'failed' }
    return { image: { data: buf, format }, status: 'ok' }
  } catch {
    return { image: null, status: 'failed' }
  }
}

// The artist's own upload only (summary.artist.imageExportable). Externally
// hosted images, such as the Spotify import's, are not fetched.
export async function fetchArtistImage(imageUrl: string | null, exportable: boolean): Promise<Fetched> {
  if (!imageUrl || !exportable) return { image: null, status: 'none' }
  return fetchImage(imageUrl)
}

export async function fetchCoverMap(view: MapView | undefined, token: string | null, referer: string | null): Promise<Fetched> {
  if (!view || !token) return { image: null, status: 'none' }
  return fetchImage(staticMapUrl(view, token), referer ? { Referer: referer } : {})
}
