// The Proof of Performance PDF (approved revision 3: cover, performance
// register, how this record is made). Server-only: imported by
// app/api/proof/pdf and never by client code. Built from the same summary and
// wording as the page (lib/proof/load.ts, lib/proof/wording.ts).

import path from 'path'
import React from 'react'
import { Document, Page, View, Text, Image, Font, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { ProofSummary } from '../load'
import type { ProofShow } from '../summary'
import type { PdfImage } from './assets'
import {
  METHOD, SOURCE_LINE, HOW_MADE, pl, proofDay, shortDate, periodText, importedYears,
  relationText, coverageText, unplacedText, factsText, type Day,
} from '../wording'

// ── Fonts (SIL Open Font License; lib/proof/pdf/fonts/OFL-*.txt) ───────────
// Registered afresh for every document. react-pdf keeps loaded fonts between
// renders, and a second document in the same server process lost glyphs from
// its embedded font subset (reproduced: Bebas's W vanished after an earlier
// render). Its Font.reset() doesn't reload, so the store is cleared instead,
// and renders run one at a time per process (renderQueue) so a clear can
// never land in the middle of another export.
function registerFonts() {
  Font.clear()
  // react-pdf's default family (registered by its store, removed by clear()).
  Font.register({ family: 'Helvetica', fonts: [
    { src: 'Helvetica', fontWeight: 400 }, { src: 'Helvetica-Bold', fontWeight: 700 },
    { src: 'Helvetica-Oblique', fontWeight: 400, fontStyle: 'italic' }, { src: 'Helvetica-BoldOblique', fontWeight: 700, fontStyle: 'italic' },
  ] })
  const dir = path.join(process.cwd(), 'lib', 'proof', 'pdf', 'fonts')
  const f = (n: string) => path.join(dir, n)
  Font.register({ family: 'Bebas Neue', src: f('BebasNeue-Regular.ttf') })
  Font.register({ family: 'DM Sans', fonts: [
    { src: f('DMSans-Regular.ttf'), fontWeight: 400 },
    { src: f('DMSans-Italic.ttf'), fontWeight: 400, fontStyle: 'italic' },
    { src: f('DMSans-Medium.ttf'), fontWeight: 500 },
    { src: f('DMSans-Bold.ttf'), fontWeight: 700 },
  ] })
  Font.register({ family: 'DM Mono', fonts: [
    { src: f('DMMono-Regular.ttf'), fontWeight: 400 },
    { src: f('DMMono-Medium.ttf'), fontWeight: 500 },
  ] })
  // Names and venues wrap at word boundaries, never with inserted hyphens.
  Font.registerHyphenationCallback(word => [word])
}

// ── Palette (paper: one look whatever the app theme) ───────────────────────
const INK = '#16140f', INK2 = '#4b463c', INK3 = '#6d6656', RULE = '#d9d2c3', FAINT = '#e7e1d4', GOLD = '#7a5e14', GOLD_MARK = '#b8963e', MAP_BG = '#0a0908', DOT = '#c9a84c'
const PAGE_W = 612, MARGIN_X = 44, CONTENT_W = PAGE_W - MARGIN_X * 2

const st = StyleSheet.create({
  page: { paddingTop: 38, paddingBottom: 48, paddingHorizontal: MARGIN_X, fontFamily: 'DM Sans', fontSize: 9, color: INK, backgroundColor: '#ffffff' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  wm: { fontFamily: 'DM Sans', fontWeight: 700, fontSize: 8.5, letterSpacing: 2.6, color: INK },
  headR: { fontFamily: 'DM Sans', fontWeight: 500, fontSize: 8.5, color: GOLD },
  foot: { position: 'absolute', left: MARGIN_X, right: MARGIN_X, bottom: 24, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.6, borderTopColor: RULE, paddingTop: 7, fontSize: 7.6, color: INK3 },
  ov: { fontFamily: 'DM Sans', fontWeight: 700, fontSize: 8.6, letterSpacing: 1.5, color: GOLD },
  period: { fontSize: 11.5, color: INK2, marginTop: 12 },
  figRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: INK },
  big: { fontFamily: 'Bebas Neue', fontSize: 110, lineHeight: 0.8, color: INK },
  figL: { fontFamily: 'DM Sans', fontWeight: 700, fontSize: 12, color: INK },
  figS: { fontSize: 10, color: INK2, marginTop: 3, lineHeight: 1.4 },
  cap: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5, fontSize: 7.6, color: INK3 },
  place: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 5, borderBottomWidth: 0.6, borderBottomColor: FAINT },
  placeName: { fontFamily: 'Bebas Neue', fontSize: 28, lineHeight: 0.95, color: INK },
  mono: { fontFamily: 'DM Mono', fontSize: 9, color: INK3 },
  srcLine: { fontSize: 8.2, color: INK2, lineHeight: 1.5 },
  regTitle: { fontFamily: 'Bebas Neue', fontSize: 30, lineHeight: 0.95, marginTop: 16, color: INK },
  regSub: { fontSize: 8.6, color: INK2, marginTop: 3 },
  th: { flexDirection: 'row', marginTop: 10, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: INK },
  thCell: { fontFamily: 'DM Sans', fontWeight: 700, fontSize: 6.8, letterSpacing: 0.9, color: INK3 },
  tr: { flexDirection: 'row', paddingVertical: 4.2, borderBottomWidth: 0.6, borderBottomColor: FAINT },
  td: { fontSize: 8.2, color: INK, lineHeight: 1.3, paddingRight: 6 },
  year: { fontFamily: 'Bebas Neue', fontSize: 15, color: GOLD, marginTop: 9, marginBottom: 1 },
  keyGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 },
  keyItem: { width: '50%', paddingRight: 14, fontSize: 7.6, color: INK2, lineHeight: 1.4, marginBottom: 4 },
  h2: { fontFamily: 'Bebas Neue', fontSize: 30, lineHeight: 0.95, marginTop: 16, color: INK },
  dt: { fontFamily: 'DM Sans', fontWeight: 700, fontSize: 10, color: INK, marginTop: 12 },
  dd: { fontSize: 9.4, color: INK2, lineHeight: 1.5, marginTop: 2 },
})

// Register columns (widths in points; the rest share what's left).
const COL = { date: 68, venue: 0, city: 86, songs: 32, method: 86, facts: 116 }
const venueW = CONTENT_W - COL.date - COL.city - COL.songs - COL.method - COL.facts

// Bebas is about 0.42em per character: the longest word sets the size.
function nameSize(name: string, width: number, max: number, min: number) {
  const longest = Math.max(5, ...name.split(/\s+/).map(w => w.length))
  return Math.max(min, Math.min(max, Math.floor(width / (longest * 0.42))))
}

// Lines a name takes at a size, by greedy word wrap (Bebas ≈ 0.42em/char).
function nameLines(name: string, width: number, size: number) {
  const cpl = Math.max(1, Math.floor(width / (size * 0.42)))
  let lines = 1, cur = 0
  for (const w of name.split(/\s+/)) {
    const len = w.length
    if (cur === 0) cur = len
    else if (cur + 1 + len <= cpl) cur += 1 + len
    else { lines++; cur = len }
  }
  return lines
}

// The cover always fits one page. Heights in points; content area 792 − 38 − 48.
const COVER_H = 706, PHOTO_W = 168, PHOTO_H = 210
const FIG_H = 24 + 16 + 88 + 4, SRC_H = 44, HEAD_H = 12 + 30
const PLACE_ROW = 28 * 0.95 + 10.6, SHOW_ROW = 18, NOTE = 13

function Header({ right }: { right: string }) {
  return <View style={st.head} fixed><Text style={st.wm}>SETLISTR<Text style={{ color: GOLD_MARK }}>.</Text></Text><Text style={st.headR}>{right}</Text></View>
}
function Footer({ prepared }: { prepared: string }) {
  return (
    <View style={st.foot} fixed>
      <Text>Prepared {prepared} with Setlistr</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} of ${totalPages}`} />
    </View>
  )
}

export type ProofPdfInput = {
  summary: ProofSummary
  zone: string | null
  preparedAt: Date
  photo: PdfImage | null
  map: PdfImage | null
  mapStatus: 'ok' | 'none' | 'failed'
}

function ProofDocument({ summary: s, zone, preparedAt, photo, map, mapStatus }: ProofPdfInput) {
  const c = s.counts
  const prepared = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: zone || undefined }).format(preparedAt)
  const period = periodText(s.shows, zone)
  const day = (d: ProofShow['date']): Day | null => proofDay(d, zone)
  const nameW = photo ? CONTENT_W - PHOTO_W - 26 : CONTENT_W
  // The name shrinks until the identity block fits beside the photo (or,
  // without one, within the photo's height plus a little).
  const idLimit = photo ? PHOTO_H : PHOTO_H + 30
  let size = nameSize(s.artist.name, nameW, photo ? 82 : 108, 30)
  // Accented capitals (Î, É…) rise above the cap height: such names get room between lines.
  const nameLH = /[\u00C0-\u024F]/.test(s.artist.name) ? 1.02 : 0.86
  const idHeight = (sz: number) => 12 + 8 + nameLines(s.artist.name, nameW, sz) * sz * nameLH + (period ? 22 : 0)
  while (size > 30 && idHeight(size) > idLimit) size -= 2
  const idH = Math.max(photo ? PHOTO_H : 0, idHeight(size))
  const view = s.map.views.cover
  const showMap = s.map.mode === 'map' && !!view && !!map
  // What's left for places and, on small records, the shows themselves.
  let room = COVER_H - HEAD_H - idH - FIG_H - SRC_H - 10
  const MAP_H = view ? 20 + CONTENT_W * view.h / view.w + 16 : 0
  if (showMap) room -= MAP_H
  const placeNotes = (s.map.placeNames.length > 0 ? 1 : 0) + (unplacedText(s.map.coverage) ? 1 : 0) + (s.map.mode === 'map' && mapStatus === 'failed' ? 1 : 0)
  const placeRows = showMap ? 0 : Math.max(1, Math.min(s.map.placeNames.length, Math.floor((room - 20 - placeNotes * NOTE) / PLACE_ROW)))
  if (!showMap) room -= 20 + placeRows * PLACE_ROW + placeNotes * NOTE
  const smallRows = c.confirmed > 0 && c.confirmed <= 8 ? Math.floor((room - 20 - 18) / SHOW_ROW) : 0
  const small = smallRows >= c.confirmed
  const sources = SOURCE_LINE.filter(([m]) => s.methods[m] > 0).map(([m, l]) => `${s.methods[m].toLocaleString('en-US')} ${l}`).join(' · ')
  const confirmedNote = c.legacyConfirmation > 0
    ? `Each show was confirmed in review by the artist or their team, except ${pl(c.legacyConfirmation, 'show', 'shows')} marked complete by an earlier version of Setlistr.`
    : 'Each show was confirmed in review by the artist or their team.'
  const notCounted = [c.awaiting ? pl(c.awaiting, 'show awaiting confirmation', 'shows awaiting confirmation') : '', c.imported ? `${c.imported.toLocaleString('en-US')} imported` : ''].filter(Boolean)

  // Register rows, grouped by year (newest first, as on the page).
  const groups: { y: string; shows: ProofShow[] }[] = []
  for (const sh of s.shows) {
    const d = day(sh.date), y = d ? String(d.y) : 'Date not recorded'
    if (!groups.length || groups[groups.length - 1].y !== y) groups.push({ y, shows: [] })
    groups[groups.length - 1].shows.push(sh)
  }

  const places = (
    <View style={{ marginTop: 20, borderTopWidth: 0.6, borderTopColor: RULE }}>
      {s.map.placeNames.slice(0, placeRows).map(p => (
        <View key={p.name} style={st.place}><Text style={st.placeName}>{p.name}</Text><Text style={st.mono}>{pl(p.shows, 'show', 'shows')}</Text></View>
      ))}
      {s.map.placeNames.length > placeRows && <Text style={[st.cap, { marginTop: 6 }]}>and {pl(s.map.placeNames.length - placeRows, 'more place', 'more places')}</Text>}
      {unplacedText(s.map.coverage) && <Text style={[st.cap, { marginTop: 6 }]}>{unplacedText(s.map.coverage)}</Text>}
      {s.map.mode === 'map' && mapStatus === 'failed' && <Text style={[st.cap, { marginTop: 6 }]}>The map couldn’t be drawn when this PDF was made.</Text>}
    </View>
  )

  return (
    <Document title={`${s.artist.name} · Proof of Performance`} author="Setlistr" creator="Setlistr" producer="Setlistr" subject="Live performance record">
      {/* ── Cover ── */}
      <Page size="LETTER" style={st.page}>
        <Header right="Proof of Performance" />
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 30 }}>
          <View style={{ flex: 1, paddingRight: photo ? 26 : 0 }}>
            <Text style={st.ov}>LIVE PERFORMANCE RECORD</Text>
            <Text style={{ fontFamily: 'Bebas Neue', fontSize: size, lineHeight: nameLH, marginTop: 8, color: INK }}>{s.artist.name}</Text>
            {period && <Text style={st.period}>{period}</Text>}
          </View>
          {photo && (
            <View style={{ width: PHOTO_W, height: PHOTO_H, overflow: 'hidden', backgroundColor: '#ece7dc' }}>
              <Image src={photo} style={{ width: PHOTO_W, height: PHOTO_H, objectFit: 'cover', objectPositionY: '30%' }} />
            </View>
          )}
        </View>

        {c.confirmed > 0 ? (
          <>
            <View style={st.figRow}>
              <Text style={st.big}>{c.confirmed.toLocaleString('en-US')}</Text>
              <View style={{ marginLeft: 18, paddingBottom: 6, flex: 1 }}>
                <Text style={st.figL}>{c.confirmed === 1 ? 'confirmed show' : 'confirmed shows'}</Text>
                <Text style={st.figS}>{pl(c.cities, 'city', 'cities')} · {pl(c.countries, 'country', 'countries')} · {pl(c.songPerformances, 'song performance', 'song performances')}</Text>
              </View>
            </View>
            {showMap && view ? (
              <View style={{ marginTop: 20 }}>
                <View style={{ width: CONTENT_W, height: CONTENT_W * view.h / view.w, backgroundColor: MAP_BG, position: 'relative' }}>
                  <Image src={map!} style={{ width: CONTENT_W, height: CONTENT_W * view.h / view.w }} />
                  {view.dots.map((d, i) => {
                    const dia = d.d * CONTENT_W / view.w
                    return <View key={i} style={{ position: 'absolute', left: d.x / 100 * CONTENT_W - dia / 2, top: d.y / 100 * (CONTENT_W * view.h / view.w) - dia / 2, width: dia, height: dia, borderRadius: dia / 2, backgroundColor: DOT, borderWidth: 0.9, borderColor: MAP_BG }} />
                  })}
                </View>
                <View style={st.cap}><Text style={{ maxWidth: CONTENT_W - 130 }}>{coverageText(s.map.mappedShows, c.confirmed, s.map.coverage)}</Text><Text>© Mapbox © OpenStreetMap</Text></View>
              </View>
            ) : places}
            {small && (
              <View style={{ marginTop: 20 }}>
                <Text style={[st.ov, { marginBottom: 6 }]}>CONFIRMED SHOWS</Text>
                {s.shows.map(sh => { const d = day(sh.date); return (
                  <View key={sh.id} style={[st.tr, { paddingVertical: 5 }]} wrap={false}>
                    <Text style={[st.td, { width: 96, fontFamily: 'DM Mono' }]}>{d ? `${shortDate(d)}, ${d.y}` : '—'}</Text>
                    <Text style={[st.td, { flex: 1 }]}>{sh.venue}</Text>
                    <Text style={[st.td, { width: 130 }]}>{sh.city || 'No city on file'}</Text>
                  </View>
                ) })}
              </View>
            )}
            <View style={{ flexGrow: 1 }} />
            <Text style={st.srcLine}>Setlists: {sources}. {confirmedNote}{notCounted.length ? ` Not counted: ${notCounted.join(', ')}.` : ''} The register follows; how this record is made is on the last page.</Text>
          </>
        ) : (
          <View style={{ marginTop: 28, paddingVertical: 16, borderTopWidth: 1, borderTopColor: INK, borderBottomWidth: 0.6, borderBottomColor: RULE }}>
            <Text style={{ fontFamily: 'DM Sans', fontWeight: 700, fontSize: 14 }}>No confirmed shows yet</Text>
            <Text style={[st.dd, { fontSize: 10 }]}>Shows appear in this record once their setlist is confirmed in review.{notCounted.length ? ` Not counted: ${notCounted.join(', ')}.` : ''}</Text>
          </View>
        )}
        <Footer prepared={prepared} />
      </Page>

      {/* ── Performance register ── */}
      {c.confirmed > 0 && (
        <Page size="LETTER" style={st.page} wrap>
          <View fixed>
            <Header right={`${s.artist.name} · Proof of Performance`} />
            <Text style={st.regTitle}>Performance register</Text>
            <Text style={st.regSub}>{pl(c.confirmed, 'confirmed show', 'confirmed shows')}, newest first</Text>
            <View style={st.th}>
              <Text style={[st.thCell, { width: COL.date }]}>DATE</Text>
              <Text style={[st.thCell, { width: venueW }]}>VENUE</Text>
              <Text style={[st.thCell, { width: COL.city }]}>CITY</Text>
              <Text style={[st.thCell, { width: COL.songs }]}>SONGS</Text>
              <Text style={[st.thCell, { width: COL.method }]}>SETLIST</Text>
              <Text style={[st.thCell, { width: COL.facts }]}>SUPPORTING FACTS</Text>
            </View>
          </View>
          {groups.map(g => (
            <View key={g.y}>
              <Text style={st.year} minPresenceAhead={40}>{g.y}</Text>
              {g.shows.map(sh => (
                <View key={sh.id} style={st.tr} wrap={false}>
                  <Text style={[st.td, { width: COL.date, fontFamily: 'DM Mono', fontSize: 7.8 }]}>{(() => { const d = day(sh.date); return d ? `${shortDate(d)}, ${d.y}` : '—' })()}</Text>
                  <Text style={[st.td, { width: venueW }]}>{sh.venue}</Text>
                  <Text style={[st.td, { width: COL.city, color: sh.city ? INK : INK3 }]}>{sh.city || 'No city on file'}</Text>
                  <Text style={[st.td, { width: COL.songs, fontFamily: 'DM Mono' }]}>{sh.songs}</Text>
                  <Text style={[st.td, { width: COL.method }, sh.method === 'unknown' ? { fontStyle: 'italic', color: INK3 } : {}]}>{METHOD[sh.method].label}</Text>
                  <Text style={[st.td, { width: COL.facts, color: INK2 }]}>{[factsText(sh), sh.confirmation === 'legacy' ? 'review not recorded' : ''].filter(Boolean).join(' · ')}</Text>
                </View>
              ))}
            </View>
          ))}
          <View style={st.keyGrid} wrap={false}>
            <Text style={st.keyItem}><Text style={{ fontWeight: 700, color: INK }}>Recognised live / From a recording</Text>: Setlistr holds evidence of how the show was captured. Recognition identifies recordings of songs, not performers.</Text>
            <Text style={st.keyItem}><Text style={{ fontWeight: 700, color: INK }}>Method not recorded</Text>: songs were recognised, but how the show was captured wasn’t recorded.</Text>
            <Text style={st.keyItem}><Text style={{ fontWeight: 700, color: INK }}>Phone near venue</Text>: within 500 m of the venue when capture began. Blank: no qualifying reading.</Text>
            <Text style={st.keyItem}><Text style={{ fontWeight: 700, color: INK }}>Songs</Text>: songs kept in the confirmed setlist. {confirmedNote}</Text>
          </View>
          <Footer prepared={prepared} />
        </Page>
      )}

      {/* ── How this record is made ── */}
      <Page size="LETTER" style={st.page}>
        <Header right={`${s.artist.name} · Proof of Performance`} />
        <Text style={st.h2}>How this record is made</Text>
        {HOW_MADE.map(([t, d]) => (<View key={t} wrap={false}><Text style={st.dt}>{t}</Text><Text style={st.dd}>{d}</Text></View>))}
        {c.confirmed > 0 && (
          <View wrap={false}>
            <Text style={st.dt}>Places</Text>
            <Text style={st.dd}>{coverageText(s.map.mappedShows, c.confirmed, s.map.coverage)}. Places come from each venue’s stored location, or from its city and country when that identifies one place exactly.{s.map.mode === 'map' && mapStatus === 'failed' ? ' The map couldn’t be drawn when this PDF was made, so the places are listed instead.' : ''}{showMap ? ' Map © Mapbox © OpenStreetMap.' : ''}</Text>
          </View>
        )}
        <View wrap={false}>
          <Text style={st.dt}>The Dashboard’s live record</Text>
          <Text style={st.dd}>{pl(c.confirmed, 'confirmed show', 'confirmed shows')}. {relationText(c)}</Text>
        </View>
        {(c.awaiting > 0 || c.imported > 0) && (
          <View wrap={false}>
            <Text style={st.dt}>Not included</Text>
            {c.awaiting > 0 && <Text style={st.dd}>{pl(c.awaiting, 'show is', 'shows are')} awaiting confirmation in review.</Text>}
            {c.imported > 0 && <Text style={st.dd}>{pl(c.imported, 'show', 'shows')}{importedYears(s.imported.first, s.imported.last, zone)} imported from setlist.fm, a public listing. They weren’t recorded or confirmed in Setlistr.</Text>}
          </View>
        )}
        <View wrap={false}>
          <Text style={st.dt}>This document</Text>
          <Text style={st.dd}>Prepared with Setlistr on {prepared}. It reflects the record at that time. It contains no legal names, identification numbers, contact details or location readings.</Text>
        </View>
        <Footer prepared={prepared} />
      </Page>
    </Document>
  )
}

let renderQueue: Promise<unknown> = Promise.resolve()
export function renderProofPdf(input: ProofPdfInput): Promise<Buffer> {
  const run = renderQueue.then(async () => {
    registerFonts()
    return renderToBuffer(<ProofDocument {...input} />)
  })
  renderQueue = run.catch(() => undefined)
  return run
}
