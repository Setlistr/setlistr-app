// Seeds ONE fictional artist on the LOCAL disposable Supabase stack for website screenshots.
// Refuses to run unless NEXT_PUBLIC_SUPABASE_URL is localhost/127.0.0.1. Never prints keys.
// All data is invented and labelled: email website-screens@example.test, profile full_name
// "SAMPLE DATA (website screenshots)". Re-running replaces this artist's rows only.
// Usage: node seed.js <repo dir>   → writes credentials for the capture script to ./local-login.json (0600)
const path = require('path'), fs = require('fs')
const REPO = process.argv[2]
require(path.join(REPO, 'node_modules/dotenv')).config({ path: path.join(REPO, '.env.local') })
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(URL_)) { console.error('Refusing: Supabase URL is not local.'); process.exit(2) }
const { createClient } = require(path.join(REPO, 'node_modules/@supabase/supabase-js'))
const db = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const EMAIL = 'website-screens@example.test'
const PASSWORD = 'local-only-' + require('crypto').randomBytes(9).toString('hex')
const ARTIST = 'Ryder Vance'
const SONGS = ['Static & Neon', 'Rearview Gold', 'Every Small Town', 'Backroad Sermon', 'Wildfire Heart', 'Ghost of a Good Time',
  'Hold the Line Down', 'Copper Wire', 'Last Call Lullaby', 'Gravel & Grace', 'Southbound', 'Porch Light']
const SHOWS = [ // invented venues
  ['2026-09-04', 'Mile Marker Tavern', 'Louisville', 'US'], ['2026-09-12', 'Lantern Hall', 'Lexington', 'US'],
  ['2026-09-19', 'Red Clay Social', 'Atlanta', 'US'], ['2026-09-26', 'Copperline Hall', 'Austin', 'US'],
  ['2026-10-03', 'Fox Hollow Hall', 'Nashville', 'US'], ['2026-10-10', 'The Saltbox', 'Nashville', 'US'],
  ['2026-10-17', 'The Saltbox', 'Nashville', 'US'],
]
const must = (r, what) => { if (r.error) { console.error(what + ': ' + r.error.message); process.exit(1) } return r.data }

;(async () => {
  // Fresh user (replace any previous run's).
  const list = must(await db.auth.admin.listUsers({ page: 1, perPage: 1000 }), 'list users')
  const old = list.users.find(u => u.email === EMAIL)
  if (old) {
    const perfs = must(await db.from('performances').select('id').eq('user_id', old.id), 'old perfs')
    if (perfs.length) {
      must(await db.from('performance_songs').delete().in('performance_id', perfs.map(p => p.id)), 'del songs')
      must(await db.from('performances').delete().eq('user_id', old.id), 'del perfs')
    }
    must(await db.from('user_songs').delete().eq('user_id', old.id), 'del user_songs')
    must(await db.from('user_song_performances').delete().eq('user_id', old.id), 'del markers')
    must(await db.from('beta_invites').delete().eq('email', EMAIL), 'del invite')
    must(await db.auth.admin.deleteUser(old.id), 'del user')
  }
  const user = must(await db.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true }), 'create user').user
  must(await db.from('profiles').upsert({ id: user.id, email: EMAIL, full_name: 'SAMPLE DATA (website screenshots)', artist_name: ARTIST, pro_affiliation: 'BMI', role: 'artist', legal_name: 'Ryder Vance', ipi_number: '00000000000' }), 'profile')
  must(await db.from('beta_invites').insert({ email: EMAIL, accepted_at: new Date().toISOString(), name: 'Website screenshots (sample)', added_by: 'local seed' }), 'invite')

  const perf = async (date, venue, city, country, status, songs, extra = {}) => {
    const p = must(await db.from('performances').insert({
      user_id: user.id, artist_name: ARTIST, venue_name: venue, city, country, status,
      performance_date: date + 'T02:30:00Z', started_at: date + 'T02:30:00Z', ended_at: status === 'live' ? null : date + 'T03:40:00Z',
      set_duration_minutes: 70, data_source: 'sample', ...extra,
    }).select().single(), 'perf ' + venue)
    if (songs.length) must(await db.from('performance_songs').insert(songs.map((s, i) => ({
      performance_id: p.id, title: s.title, artist: ARTIST, position: i + 1, source: s.source || 'recognized',
      was_planned: s.was_planned ?? true, inclusion_reason: s.inclusion_reason || 'planned setlist - detected',
      artist_save_complete: status === 'complete', confusion_matrix_result: 'TBD',
    }))), 'songs ' + venue)
    return p
  }
  const pick = (n, off) => Array.from({ length: n }, (_, i) => ({ title: SONGS[(i + off) % SONGS.length] }))
  const out = { email: EMAIL, password: PASSWORD, userId: user.id, complete: [], review: null, live: null }
  for (const [i, [d, v, c, co]] of SHOWS.entries()) out.complete.push((await perf(d, v, c, co, 'complete', pick(10 + (i % 3), i))).id)
  // A show waiting for review (used for the celebration and its share card).
  out.review = (await perf('2026-10-24', 'The Saltbox', 'Nashville', 'US', 'review', pick(8, 0))).id
  // A show being captured right now: six recognised so far, six planned still to come.
  const now = new Date(Date.now() - 16 * 60000).toISOString()
  const live = must(await db.from('performances').insert({
    user_id: user.id, artist_name: ARTIST, venue_name: 'The Saltbox', city: 'Nashville', country: 'US', status: 'live',
    performance_date: now, started_at: now, set_duration_minutes: 70, auto_close_buffer_minutes: 5, data_source: 'sample',
  }).select().single(), 'live perf')
  // Recognised so far, no planned setlist on this show (the live screen labels plan matches "Verified ✓").
  must(await db.from('performance_songs').insert(SONGS.slice(0, 6).map((t, i) =>
    ({ performance_id: live.id, title: t, artist: ARTIST, position: i + 1, source: 'recognized', was_planned: false, inclusion_reason: 'artist catalogue', confusion_matrix_result: 'TBD' }))), 'live songs')
  out.live = live.id
  fs.writeFileSync(path.join(__dirname, 'local-login.json'), JSON.stringify(out, null, 1), { mode: 0o600 })
  console.log(`seeded ${ARTIST}: ${out.complete.length} complete, 1 review, 1 live (local only)`)
})().catch(e => { console.error(e.message); process.exit(1) })
