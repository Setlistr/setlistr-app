// Automated assembly for the "Your Passport, already started" local demonstration.
// Free, keyless, CC0 sources only: MusicBrainz web service (core data CC0) and Wikidata (CC0).
// No Setlistr production data, no keys, no paid calls. Every request is logged with status and time.
// Usage: node assemble.js "Jesse Slack"   ->  assembled.json, requests.log.json
const fs = require('fs'), path = require('path')
const NAME = process.argv[2] || 'Jesse Slack'
const UA = 'SetlistrPassportDemo/0.1 ( https://setlistr.ai )'
const MB = 'https://musicbrainz.org/ws/2/'
const MAX_REQ = 80
const log = [], t0 = Date.now()
let last = 0
async function get(url, { mb = true } = {}) {
  if (log.length >= MAX_REQ) throw new Error('request budget reached')
  if (mb) { const wait = last + 1100 - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait)) }
  for (let a = 0; a < 3; a++) {
    const s = Date.now(); last = s
    let status = 0, body = null
    try { const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } }); status = r.status; if (r.ok) body = await r.json() } catch (e) { status = 'network' }
    log.push({ url, status, ms: Date.now() - s, at: new Date(s).toISOString() })
    if (body) return body
    if (status === 503 || status === 'network') { await new Promise(r => setTimeout(r, 2000 * (a + 1))); continue }
    return { __status: status }
  }
  return { __status: 'failed' }
}
const q = s => encodeURIComponent(s)
const norm = s => (s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N} ]/gu, '').trim()

;(async () => {
  const out = { artist_query: NAME, assembled_at: new Date().toISOString(), sources: {}, identity: {}, events: [], releases: [], recordings: [], works: [], links: [], wikidata: null }

  // 1. Identity: every exact-name candidate is kept; nothing is chosen if more than one.
  const s = await get(`${MB}artist/?query=${q(`artist:"${NAME}"`)}&fmt=json&limit=10`)
  const cands = (s.artists || []).map(a => ({ mbid: a.id, name: a.name, score: a.score, type: a.type || null, country: a.country || null, area: a.area && a.area.name || null, begin_area: a['begin-area'] && a['begin-area'].name || null, disambiguation: a.disambiguation || '', life_begin: a['life-span'] && a['life-span'].begin || null, url: `https://musicbrainz.org/artist/${a.id}` }))
  const exact = cands.filter(c => norm(c.name) === norm(NAME))
  out.identity = { candidates: cands, exact_matches: exact.length, chosen: exact.length === 1 ? exact[0].mbid : null,
    rule: 'Chosen automatically only when exactly one MusicBrainz artist has this exact name; otherwise the person must pick.' }
  out.sources.musicbrainz_search = { status: s.__status ? 'not_retrieved' : 'retrieved', detail: s.__status ? `HTTP ${s.__status}` : `${cands.length} candidates, ${exact.length} exact` }

  // Wikidata: who has this label (independent identity check).
  const wd = await get(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${q(NAME)}&language=en&type=item&limit=10&format=json`, { mb: false })
  out.wikidata = { query: NAME, results: (wd.search || []).map(r => ({ id: r.id, label: r.label, description: r.description || '', url: `https://www.wikidata.org/wiki/${r.id}` })) }
  out.sources.wikidata = { status: wd.__status ? 'not_retrieved' : 'retrieved', detail: wd.__status ? `HTTP ${wd.__status}` : `${out.wikidata.results.length} items labelled "${NAME}"` }

  const id = out.identity.chosen
  if (!id) { out.sources.musicbrainz_artist = { status: 'not_retrieved', detail: 'identity not resolved automatically' }; return finish(out) }

  // 2. Artist detail with links (official site, socials, listing pages).
  const a = await get(`${MB}artist/${id}?inc=url-rels+tags+aliases&fmt=json`)
  out.identity.detail = { mbid: id, name: a.name, type: a.type, country: a.country, area: a.area && a.area.name, begin_area: a['begin-area'] && a['begin-area'].name, life_span: a['life-span'], disambiguation: a.disambiguation, tags: (a.tags || []).map(t => t.name), url: `https://musicbrainz.org/artist/${id}` }
  out.links = (a.relations || []).filter(r => r.url).map(r => ({ type: r.type, url: r.url.resource }))

  // 3. Events (past reported and upcoming) where this artist is linked.
  const ev = await get(`${MB}event?artist=${id}&inc=place-rels+area-rels+artist-rels&limit=100&fmt=json`)
  out.events = (ev.events || []).map(e => {
    const place = (e.relations || []).find(r => r.place), area = (e.relations || []).find(r => r.area)
    return { mbid: e.id, name: e.name, type: e.type || null, date: e['life-span'] && e['life-span'].begin || null, time: e.time || null, cancelled: !!e.cancelled,
      place: place ? place.place.name : null, area: area ? area.area.name : (place && place.place.area ? place.place.area.name : null),
      has_setlist: !!e.setlist, url: `https://musicbrainz.org/event/${e.id}` }
  })
  out.sources.musicbrainz_events = { status: ev.__status ? 'not_retrieved' : 'retrieved', detail: ev.__status ? `HTTP ${ev.__status}` : `${out.events.length} events linked to this artist (of ${ev['event-count'] ?? '?'})` }

  // 4. Releases (release groups) — released repertoire, with dates.
  const rg = await get(`${MB}release-group?artist=${id}&limit=100&fmt=json`)
  out.releases = (rg['release-groups'] || []).map(r => ({ mbid: r.id, title: r.title, type: r['primary-type'] || null, secondary: r['secondary-types'] || [], first_release: r['first-release-date'] || null, url: `https://musicbrainz.org/release-group/${r.id}` }))
    .sort((x, y) => (y.first_release || '').localeCompare(x.first_release || ''))
  out.sources.musicbrainz_releases = { status: rg.__status ? 'not_retrieved' : 'retrieved', detail: rg.__status ? `HTTP ${rg.__status}` : `${out.releases.length} release groups` }

  // 5. Recordings with ISRCs and their linked works.
  const rc = await get(`${MB}recording?artist=${id}&inc=isrcs&limit=100&fmt=json`)
  const recs = rc.recordings || []
  out.recordings = recs.map(r => ({ mbid: r.id, title: r.title, length_s: r.length ? Math.round(r.length / 1000) : null, isrcs: r.isrcs || [], first_release: r['first-release-date'] || null,
    releases: (r.releases || []).slice(0, 3).map(x => x.title), work_ids: (r.relations || []).filter(x => x.work).map(x => x.work.id), url: `https://musicbrainz.org/recording/${r.id}` }))
  out.sources.musicbrainz_recordings = { status: rc.__status ? 'not_retrieved' : 'retrieved', detail: rc.__status ? `HTTP ${rc.__status}` : `${recs.length} recordings (of ${rc['recording-count'] ?? '?'})` }

  // Browse requests can't include work relationships, so look each recording up (bounded).
  for (const r of out.recordings.slice(0, 40)) {
    const x = await get(`${MB}recording/${r.mbid}?inc=work-rels+releases+artist-credits&fmt=json`)
    r.work_ids = x.__status ? [] : (x.relations || []).filter(y => y.work).map(y => y.work.id)
    if (x.__status) r.work_lookup = `HTTP ${x.__status}`
    else { r.releases = (x.releases || []).slice(0, 3).map(y => ({ title: y.title, date: y.date || null, url: `https://musicbrainz.org/release/${y.id}` })); r.credit = (x['artist-credit'] || []).map(c => c.name + (c.joinphrase || '')).join('') }
  }

  // Name-only searches (lower certainty: not linked to the chosen identity, just the same name).
  const es = await get(`${MB}event/?query=${q(`"${NAME}"`)}&fmt=json&limit=25`)
  out.name_only_events = (es.events || []).filter(e => !out.events.some(x => x.mbid === e.id)).map(e => ({ mbid: e.id, name: e.name, date: e['life-span'] && e['life-span'].begin || null, score: e.score, url: `https://musicbrainz.org/event/${e.id}` }))
  out.sources.musicbrainz_event_name_search = { status: es.__status ? 'not_retrieved' : 'retrieved', detail: es.__status ? `HTTP ${es.__status}` : `${out.name_only_events.length} events mentioning the name but not linked` }
  const rs = await get(`${MB}recording/?query=${q(`artistname:"${NAME}"`)}&fmt=json&limit=25`)
  out.name_only_recordings = (rs.recordings || []).filter(r => !out.recordings.some(x => x.mbid === r.id) && r.score >= 90).map(r => ({ mbid: r.id, title: r.title, credit: (r['artist-credit'] || []).map(c => c.name + (c.joinphrase || '')).join(''), first_release: r['first-release-date'] || null, score: r.score, url: `https://musicbrainz.org/recording/${r.id}` }))
  out.sources.musicbrainz_recording_name_search = { status: rs.__status ? 'not_retrieved' : 'retrieved', detail: rs.__status ? `HTTP ${rs.__status}` : `${out.name_only_recordings.length} further recordings credited to the name (score ≥ 90)` }

  // 6. Works (compositions): writers and ISWC, for works linked from those recordings (bounded).
  const workIds = [...new Set(out.recordings.flatMap(r => r.work_ids))].slice(0, 40)
  for (const w of workIds) {
    const x = await get(`${MB}work/${w}?inc=artist-rels&fmt=json`)
    if (x.__status) { out.works.push({ mbid: w, status: 'not_retrieved', detail: `HTTP ${x.__status}` }); continue }
    out.works.push({ mbid: w, title: x.title, iswcs: x.iswcs || [], status: 'retrieved',
      writers: (x.relations || []).filter(r => r.artist && ['composer', 'lyricist', 'writer'].includes(r.type)).map(r => ({ role: r.type, name: r.artist.name })),
      url: `https://musicbrainz.org/work/${w}` })
  }
  out.sources.musicbrainz_works = { status: 'retrieved', detail: `${out.works.length} works looked up (cap 40)` }
  finish(out)
})().catch(e => { console.error('failed:', e.message); process.exit(1) })

function finish(out) {
  out.effort = { requests: log.length, elapsed_s: Math.round((Date.now() - t0) / 1000) }
  // Sources considered and deliberately not used (see ACCESS.md for the verified rules).
  out.sources.not_used = [
    { source: 'Bandsintown', reason: 'Needs an app_id. Official docs reviewed do not state who may hold one or the usage terms; Setlistr\'s existing key has an open terms question. Unavailable here.' },
    { source: 'Ticketmaster Discovery', reason: 'Needs an API key; none held for this demo and terms for this use not reviewed. Unavailable here.' },
    { source: 'Spotify Web API', reason: 'Needs client credentials; Setlistr\'s production credentials are not used for this demo. Unavailable here.' },
    { source: 'setlist.fm', reason: 'Needs a key; terms limit API use to non-commercial purposes without permission. Unavailable here.' },
    { source: 'Apple iTunes Search API', reason: 'Keyless, but terms permit use only to promote store content. Not a fit; unavailable here.' },
    { source: 'Deezer API', reason: 'Terms limit use to non-commercial purposes. Unavailable here.' },
    { source: 'Discogs API', reason: 'Terms page could not be retrieved (HTTP 403), so not verified. Unavailable here.' },
    { source: 'Your Setlistr record', reason: 'Production reads are not authorised for this demo. Not loaded.' },
  ]
  fs.writeFileSync(path.join(__dirname, 'assembled.json'), JSON.stringify(out, null, 1))
  fs.writeFileSync(path.join(__dirname, 'requests.log.json'), JSON.stringify(log, null, 1))
  console.log(JSON.stringify({ identity: { exact: out.identity.exact_matches, chosen: out.identity.chosen, candidates: out.identity.candidates.map(c => `${c.name} [${c.score}] ${c.disambiguation} ${c.country || ''}`) }, sources: out.sources, counts: { events: out.events.length, releases: out.releases.length, recordings: out.recordings.length, works: out.works.length, links: out.links.length }, effort: out.effort }, null, 1))
}
