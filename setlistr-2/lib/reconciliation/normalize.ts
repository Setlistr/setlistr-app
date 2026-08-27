// The one shared definition — every write site that needs a normalized song
// key imports this instead of keeping its own copy. Previously duplicated
// across seven files (including inline in api/identify/route.ts, which is
// otherwise off-limits to touch); centralized because the confirmed_count
// reversal logic depends on every write site normalizing identically, and a
// duplicated function can't guarantee that going forward.

const VERSION_SUFFIX_RE = /\s*[\(\[](alternate|alternative|live|edit|radio edit|radio|album version|acoustic|acoustic version|remaster|remastered|instrumental|original mix|original|extended|extended mix|deluxe|explicit|clean|single|mono|stereo|demo|bonus track|remix|mixed|mix|re-mix|part \d+|teil \d+|vol\.?\s*\d+|version|ver\.?)[^\)\]]*[\)\]]/gi

export function cleanTitle(raw: string): string {
  return raw.replace(VERSION_SUFFIX_RE, '').replace(/\s+/g, ' ').trim()
}

export function normalizeSongKey(title: string): string {
  return title.toLowerCase().trim()
    .replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '')
    .replace(/[-–—]/g, ' ').replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ').trim()
}
