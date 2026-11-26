// The setlist as a CSV file, in the three column layouts Review used to offer
// ("Export CSV for SOCAN, ASCAP or BMI"). Moved here unchanged so the claim
// sheet in Submissions can offer it; the columns and values are exactly the
// released ones. These are spreadsheet copies of the setlist: nothing here
// files with a PRO, records a submission, or claims a PRO accepts the file.

export type CsvLayout = 'SOCAN' | 'ASCAP' | 'BMI'
export const CSV_LAYOUTS: CsvLayout[] = ['SOCAN', 'ASCAP', 'BMI']

export type CsvSong = { title: string; artist: string; composer?: string | null; publisher?: string | null; isrc?: string | null }
export type CsvShow = { venue_name: string; city: string; country?: string | null; artist_name: string }

// The artist's own PRO first when it has a layout here; otherwise the
// released order. No layout is invented for any other society.
export function orderedLayouts(proCode: string | null | undefined): CsvLayout[] {
  const own = CSV_LAYOUTS.find(l => l === proCode)
  return own ? [own, ...CSV_LAYOUTS.filter(l => l !== own)] : CSV_LAYOUTS
}

export function buildSetlistCsv(layout: CsvLayout, show: CsvShow, songs: CsvSong[], showDate: Date): { text: string; filename: string } {
  const date = showDate.toLocaleDateString()
  const headers: Record<CsvLayout, string[]> = {
    SOCAN: ['Title', 'Artist', 'Composer', 'Publisher', 'ISRC', 'Duration', 'Date', 'Venue', 'City'],
    ASCAP: ['Title', 'Performer', 'Composer/Author', 'Publisher', 'ISRC', 'Venue', 'Date', 'City', 'State'],
    BMI:   ['Song Title', 'Artist', 'BMI Work #', 'Composer', 'Publisher', 'Venue Name', 'Date', 'City'],
  }
  const rows = songs.map(s => {
    const c = s.composer || '', p = s.publisher || '', i = s.isrc || ''
    if (layout === 'SOCAN') return [s.title, s.artist, c, p, i, '', date, show.venue_name, show.city]
    if (layout === 'ASCAP') return [s.title, show.artist_name, c, p, i, show.venue_name, date, show.city, show.country || '']
    return [s.title, show.artist_name, '', c, p, show.venue_name, date, show.city]
  })
  const text = [headers[layout], ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
  return { text, filename: `${layout}-setlist-${show.venue_name}-${date.replace(/\//g, '-')}.csv` }
}
