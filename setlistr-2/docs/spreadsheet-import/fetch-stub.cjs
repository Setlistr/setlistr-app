// Local stub for outside services, preloaded into the Next server process
// (NODE_OPTIONS=--require). DISPOSABLE TESTING ONLY. ACRCloud returns one
// fixed match per call (titles rotate so a recording yields several songs);
// MusicBrainz, Mapbox and Spotify return empty results. Calls are counted.
const fs = require('fs')
const LOG = process.env.STUB_LOG || '/tmp/fetch-stub.log'
const real = globalThis.fetch
let n = 0
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } })
globalThis.fetch = async function (input, init) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  let host = ''
  try { host = new URL(url).host } catch {}
  const note = k => { try { fs.appendFileSync(LOG, k + '\n') } catch {} }
  if (host.endsWith('acrcloud.com')) {
    n++; note('acr')
    const title = ['Stub Song One', 'Stub Song Two', 'Stub Song Three'][Math.floor((n - 1) / 3) % 3]
    return json({ status: { msg: 'Success', code: 0, version: '1.0' }, result_type: 0, cost_time: 0.1,
      metadata: { timestamp_utc: new Date().toISOString(), music: [{ title, artists: [{ name: 'Lena Marsh' }], album: { name: 'Stub' }, score: 100, acrid: 'stub-' + title, duration_ms: 200000, play_offset_ms: 30000, external_ids: {}, label: 'Stub' }] } })
  }
  if (host.endsWith('musicbrainz.org')) { note('musicbrainz'); return json({ recordings: [], works: [] }) }
  if (host.endsWith('mapbox.com') || host.endsWith('spotify.com')) { note(host); return json({ features: [], suggestions: [] }) }
  return real(input, init)
}
