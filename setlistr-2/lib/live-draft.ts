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
// The draft is written on every change and removed once the server holds the
// same list (or End has finished the show). When the show is opened again the
// draft is merged into the saved songs: its edits apply to rows saved under
// the same id, and songs only it has are added after them. Rows saved on the
// server that it doesn't have are kept (a song deleted while offline may come
// back; one added or recorded meanwhile is never dropped). No audio is kept.

const KEY_PREFIX = 'sl_live_draft:'
// Unfinished shows can be resumed days later; a draft older than this is
// dropped rather than merged.
export const LIVE_DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

export type LiveDraft<T> = { savedAt: number; songs: T[] }

function storage(): Storage | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null } catch { return null }
}

export function writeLiveDraft<T extends { row_id?: string }>(performanceId: string, songs: T[]): void {
  const s = storage(); if (!s) return
  try {
    s.setItem(KEY_PREFIX + performanceId, JSON.stringify({ savedAt: Date.now(), songs: songs.filter(x => !!x.row_id) }))
  } catch { /* full or unavailable: the server save is still the main copy */ }
}

export function readLiveDraft<T extends { row_id?: string }>(performanceId: string, now = Date.now()): LiveDraft<T> | null {
  const s = storage(); if (!s) return null
  try {
    const raw = s.getItem(KEY_PREFIX + performanceId)
    if (!raw) return null
    const d = JSON.parse(raw)
    if (!d || typeof d.savedAt !== 'number' || !Array.isArray(d.songs)) return null
    if (now - d.savedAt > LIVE_DRAFT_MAX_AGE_MS) { s.removeItem(KEY_PREFIX + performanceId); return null }
    return { savedAt: d.savedAt, songs: d.songs.filter((x: T) => x && typeof x.row_id === 'string') }
  } catch { return null }
}

export function clearLiveDraft(performanceId: string): void {
  const s = storage(); if (!s) return
  try { s.removeItem(KEY_PREFIX + performanceId) } catch {}
}

// Saved rows first (with the draft's version of any row it also has), then
// songs only the draft has, in its order.
// recovered: songs the draft added or retitled, i.e. changes the server didn't have.
export function mergeLiveDraft<T extends { row_id?: string; title: string; artist: string }>(saved: T[], draft: T[]): { songs: T[]; recovered: number } {
  const byId = new Map(draft.map(d => [d.row_id as string, d]))
  const savedIds = new Set(saved.map(s => s.row_id))
  const merged = saved.map(s => (s.row_id && byId.get(s.row_id)) || s)
  const extra = draft.filter(d => !savedIds.has(d.row_id))
  const edited = saved.filter(s => { const d = s.row_id ? byId.get(s.row_id) : undefined; return !!d && (d.title !== s.title || d.artist !== s.artist) }).length
  return { songs: [...merged, ...extra], recovered: extra.length + edited }
}
