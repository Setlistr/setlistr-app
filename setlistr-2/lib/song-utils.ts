/**
 * song-utils.ts
 *
 * Utilities for normalizing song titles and metadata.
 * Strip noisy suffixes from titles before saving to DB and before display.
 * This runs on save — the clean title is what gets stored everywhere.
 */

// Patterns to strip — order matters, more specific first
const STRIP_PATTERNS: RegExp[] = [
  // Alternate/Alternative versions
  /\s*[\(\[]\s*alternate\s+version\s*[\)\]]/gi,
  /\s*[\(\[]\s*alternative\s+version\s*[\)\]]/gi,
  /\s*[\(\[]\s*alt\.?\s+version\s*[\)\]]/gi,
  /\s*[\(\[]\s*alt\.?\s+ver\.?\s*[\)\]]/gi,

  // Live versions
  /\s*[\(\[]\s*live\s+(version|recording|at\s+.+)?\s*[\)\]]/gi,
  /\s*[\(\[]\s*live\s*[\)\]]/gi,

  // Acoustic versions
  /\s*[\(\[]\s*acoustic\s+(version|mix)?\s*[\)\]]/gi,

  // Radio/Single edits
  /\s*[\(\[]\s*radio\s+(edit|version|mix)\s*[\)\]]/gi,
  /\s*[\(\[]\s*single\s+(version|edit)\s*[\)\]]/gi,

  // Remixes (keep artist name remixes? No — strip all for consistency)
  /\s*[\(\[]\s*.*?remix\s*[\)\]]/gi,

  // Remastered
  /\s*[\(\[]\s*\d{4}?\s*remaster(ed)?\s*[\)\]]/gi,
  /\s*[\(\[]\s*remaster(ed)?\s*[\)\]]/gi,

  // Explicit tags
  /\s*[\(\[]\s*(explicit|clean|censored)\s*[\)\]]/gi,

  // Edit/Extended/Short versions
  /\s*[\(\[]\s*(extended|short|full|original)\s+(version|mix|edit)\s*[\)\]]/gi,
  /\s*[\(\[]\s*(extended|short)\s*[\)\]]/gi,

  // Featuring (strip feat. from title — artist field handles this)
  /\s*(feat\.|featuring|ft\.)\s+[^[\](]+/gi,

  // Dash-separated versions at end of title
  /\s+-\s+(live|acoustic|alternate|alternative|radio edit|single version|remastered.*)$/gi,
]

/**
 * Normalize a song title by stripping version noise.
 * Call this before saving to DB — clean title is stored and displayed.
 *
 * Examples:
 *   "Dollar Bill Bar (Alternate Version)"  → "Dollar Bill Bar"
 *   "American Dreaming (Alternative Version)" → "American Dreaming"
 *   "Ring of Fire (Live at Carnegie Hall)" → "Ring of Fire"
 *   "Jolene (Acoustic)"                    → "Jolene"
 *   "Born Again"                           → "Born Again" (unchanged)
 */
export function normalizeSongTitle(title: string): string {
  if (!title) return title

  let normalized = title.trim()

  for (const pattern of STRIP_PATTERNS) {
    normalized = normalized.replace(pattern, '')
  }

  // Clean up any trailing punctuation or whitespace left behind
  normalized = normalized
    .replace(/\s*[-–—]\s*$/, '')   // trailing dash
    .replace(/\s+/g, ' ')           // collapse spaces
    .trim()

  // Don't return empty string — fall back to original
  return normalized || title.trim()
}

/**
 * Normalize artist name — basic cleanup only, no stripping.
 * Removes "feat." additions that sometimes come from ACRCloud.
 */
export function normalizeArtistName(artist: string): string {
  if (!artist) return artist
  return artist
    .replace(/\s*(feat\.|featuring|ft\.)\s+.*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Returns true if a title looks like it has version noise we'd strip.
 * Useful for showing a "cleaned title" indicator in the UI.
 */
export function hasTitleNoise(title: string): boolean {
  return normalizeSongTitle(title) !== title.trim()
}

/**
 * Normalize a full song object — title + artist.
 * Use this before any DB insert/update.
 */
export function normalizeSong<T extends { title: string; artist?: string }>(song: T): T {
  return {
    ...song,
    title:  normalizeSongTitle(song.title),
    artist: song.artist ? normalizeArtistName(song.artist) : song.artist,
  }
}
