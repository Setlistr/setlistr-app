// A copy of the live capture list kept on the device, so songs that haven't
// reached the server yet survive the page itself being thrown away.
//
// The in-progress save (app/app/live/[id]/page.tsx) can't save without a
// connection, and until it does those songs exist only in the page's memory.
// In the native app the page can be destroyed with no warning while offline:
// the WebView's web process is killed and reloaded, or a full page load fails
// and Capacitor shows its bundled "Setlistr couldn't load" page
// (server.errorPath). Either way the page is gone and so is anything unsaved.
//
// Each copy belongs to one signed-in account and one show: it is stored under
// both ids, so another account on the same device never reads it. It is
// written on every change and removed once the server holds the same list (or
// End has finished the show). No audio is kept.
//
// The copy also records the server's version of each row as this device last
// saw it ("base"), so reopening the show can tell its own unsaved changes from
// changes made elsewhere since (mergeLiveDraft below).

import { normalizeSongKey } from './reconciliation/normalize'

const KEY_PREFIX = 'sl_live_draft:v2:'
// Unfinished shows can be resumed days later; a copy older than this is
// dropped rather than merged.
export const LIVE_DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

export type DraftSong = {
  row_id?: string; title: string; artist: string
  isrc?: string | null; composer?: string | null; publisher?: string | null
  source?: string | null; was_planned?: boolean | null
}
export type LiveDraft<T> = { savedAt: number; songs: T[]; base: Record<string, string> }

// The saved fields of a song, for telling whether a row changed.
export function songFingerprint(s: DraftSong): string {
  return JSON.stringify([s.title || '', s.artist || '', s.isrc || '', s.composer || '', s.publisher || '', s.source || 'manual', !!s.was_planned])
}

function storage(): Storage | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null }
}
const keyFor = (ownerId: string, performanceId: string) => `${KEY_PREFIX}${ownerId}:${performanceId}`

// Returns whether the copy was stored. false: no account, or storage is
// unavailable or full; the caller must not tell the artist changes are kept.
export function writeLiveDraft<T extends DraftSong>(ownerId: string | null, performanceId: string, songs: T[], base: Record<string, string>): boolean {
  const s = storage(); if (!s || !ownerId) return false
  try {
    s.setItem(keyFor(ownerId, performanceId), JSON.stringify({ savedAt: Date.now(), songs: songs.filter(x => !!x.row_id), base }))
    return true
  } catch { return false }
}

export function readLiveDraft<T extends DraftSong>(ownerId: string | null, performanceId: string, now = Date.now()): LiveDraft<T> | null {
  const s = storage(); if (!s || !ownerId) return null
  try {
    const key = keyFor(ownerId, performanceId)
    const raw = s.getItem(key)
    if (!raw) return null
    const d = JSON.parse(raw)
    if (!d || typeof d.savedAt !== 'number' || !Array.isArray(d.songs) || !d.base || typeof d.base !== 'object') return null
    if (now - d.savedAt > LIVE_DRAFT_MAX_AGE_MS) { s.removeItem(key); return null }
    return { savedAt: d.savedAt, songs: d.songs.filter((x: T) => x && typeof x.row_id === 'string' && typeof x.title === 'string'), base: d.base }
  } catch { return null }
}

export function clearLiveDraft(ownerId: string | null, performanceId: string): void {
  const s = storage(); if (!s || !ownerId) return
  try { s.removeItem(keyFor(ownerId, performanceId)) } catch {}
}

// Merges a device copy into the songs saved on the server. Rows are matched
// by row id; the server wins whenever it changed since this device last saw
// it, so an older copy never overwrites newer work:
//   - in both, server row unchanged since the copy's base → the copy's version
//     (an edit made here that didn't save);
//   - in both, server row changed since (or no base) → the server's version;
//   - only in the copy, never saved (no base) → added after the saved rows,
//     unless the server already has a song of the same title (not counting
//     unconfirmed planned entries), so nothing is duplicated;
//   - only in the copy, but saved before (has a base) → removed elsewhere
//     since; not brought back;
//   - only on the server → kept. This includes a song deleted here while
//     offline: it can come back (documented limitation; never drops a song).
export function mergeLiveDraft<T extends DraftSong>(saved: T[], draft: LiveDraft<T>): { songs: T[]; recovered: number; keptServer: number } {
  const byId = new Map(draft.songs.map(d => [d.row_id as string, d]))
  const savedIds = new Set(saved.map(s => s.row_id))
  let recovered = 0, keptServer = 0
  const merged = saved.map(s => {
    const d = s.row_id ? byId.get(s.row_id) : undefined
    if (!d || songFingerprint(d) === songFingerprint(s)) return s
    if (draft.base[s.row_id as string] === songFingerprint(s)) { recovered++; return d }
    keptServer++; return s
  })
  const savedTitles = new Set(saved.filter(s => s.source !== 'planned').map(s => normalizeSongKey(s.title)))
  const extra: T[] = []
  for (const d of draft.songs) {
    if (savedIds.has(d.row_id)) continue
    if (draft.base[d.row_id as string] !== undefined) { keptServer++; continue }
    if (d.source !== 'planned' && savedTitles.has(normalizeSongKey(d.title))) { keptServer++; continue }
    extra.push(d); recovered++
  }
  return { songs: [...merged, ...extra], recovered, keptServer }
}
