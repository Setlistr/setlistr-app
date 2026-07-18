// Deliberately duplicated from app/api/identify/route.ts rather than imported.
// That route is explicitly off-limits to touch, and importing a Next route
// module into a standalone script/lib is fragile. These two functions are
// small and stable; keep them in lockstep by eye if the source ever changes.

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
