// Writer credits from MusicBrainz relations.
//
// MusicBrainz gives one relation per role, so a songwriter credited as both
// composer and lyricist comes back twice (for example "Bohemian Rhapsody":
// composer Freddie Mercury, lyricist Freddie Mercury, same artist id). Joining
// the relations as-is printed "Freddie Mercury, Freddie Mercury".
//
// One credit per MusicBrainz artist, in the order MusicBrainz lists them. The
// key is the artist id, never the name: two different people who share a name
// keep a credit each. A relation without an id can't be matched to another,
// so it is kept.

type ArtistRelation = { artist?: { id?: string | null; name?: string | null } | null }

export function writerNames(relations: ArtistRelation[]): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const r of relations) {
    const name = r?.artist?.name
    if (!name) continue
    const id = r.artist?.id
    if (id) {
      if (seen.has(id)) continue
      seen.add(id)
    }
    names.push(name)
  }
  return names
}

export function writerCredit(relations: ArtistRelation[]): string {
  return writerNames(relations).join(', ')
}
