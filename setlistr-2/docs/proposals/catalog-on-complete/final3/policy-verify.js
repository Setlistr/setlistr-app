// Tests of the separate catalogue write-access repair (and the stale-write interleavings) on the
// DISPOSABLE stack in production's shape, with both proposed migrations applied. Real PostgREST +
// gotrue with each user's own session; service-role writers through the service key, as the routes do.
// node policy-verify.js <repo>
const path = require('path'), fs = require('fs')
const { execSync } = require('child_process')
const REPO = process.argv[2]
const req = m => require(path.join(REPO, 'node_modules', m))
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, 'app.env'), 'utf8').split('\n').filter(Boolean).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL
if (SUPA !== 'http://127.0.0.1:54621') { console.error('REFUSING: not the disposable stack', SUPA); process.exit(1) }
const { createClient } = req('@supabase/supabase-js')
const svc = createClient(SUPA, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const DB = 'supabase_db_setlistr-catalog-disposable'
const SQL = q => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim()
const SQLerr = q => { try { SQL(q); return null } catch (e) { const m = String(e.stderr || e.message); return (m.match(/ERROR:\s+([^\n]+)/) || [m])[1] } }
let pass = 0, fail = 0
const ok = (n, c, d = '') => { c ? pass++ : fail++; console.log(c ? '  ok  ' : '  FAIL', n, c ? '' : d) }
const key = t => t.toLowerCase().trim().replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').replace(/[-–—]/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()

async function persona(label) {
  const email = `pv-${label}@example.test`, password = 'Pw-pv-' + label + '-Aa1x9'
  await svc.from('beta_invites').insert({ email, invited_role: 'artist', added_by: 'policy-verify' })
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true }); if (error) throw error
  await svc.from('profiles').upsert({ id: data.user.id, full_name: label, email }, { onConflict: 'id' })
  const c = createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { error: e2 } = await c.auth.signInWithPassword({ email, password }); if (e2) throw e2
  return { id: data.user.id, c, label }
}
let seq = 0
function show(owner, titles, status = 'review') {
  const id = SQL(`insert into performances (user_id, artist_name, venue_name, city, status, data_source, started_at, performance_date)
    values ('${owner.id}', 'Northern Lights', 'Disposable Hall', 'Toronto', '${status}', 'captured', now() - interval '${++seq} minutes', current_date) returning id;`).split('\n')[0]
  titles.forEach((t, i) => SQL(`insert into performance_songs (performance_id, title, artist, position, source, confusion_matrix_result) values ('${id}', $q$${t}$q$, 'Northern Lights', ${i + 1}, 'recognized', 'TBD');`))
  return id
}
const count = (u, t) => SQL(`select coalesce(sum(confirmed_count),0)||'/'||count(*) from user_songs where user_id = '${u.id}' and song_title = $q$${t}$q$`)
const markersFor = id => +SQL(`select count(*) from user_song_performances where performance_id = '${id}'`)
// The live page's and the old review loop's writer, call for call (app/app/live/[id]/page.tsx:66-75).
async function pageWriter(client, userId, performanceId, title, artist = 'Northern Lights') {
  const { error: guardError } = await client.from('user_song_performances').insert({ user_id: userId, performance_id: performanceId, normalized_title: key(title) })
  if (guardError) return guardError.code === '23505' ? 'already counted' : 'refused ' + guardError.code
  const { data: existing } = await client.from('user_songs').select('id, confirmed_count').eq('user_id', userId).eq('song_title', title).single()
  const { error } = existing
    ? await client.from('user_songs').update({ confirmed_count: existing.confirmed_count + 1, canonical_artist: artist || null, last_confirmed_at: new Date().toISOString() }).eq('id', existing.id)
    : await client.from('user_songs').insert({ user_id: userId, song_title: title, canonical_artist: artist || null, confirmed_count: 1, last_confirmed_at: new Date().toISOString() })
  return error ? 'refused ' + error.code : 'counted'
}

;(async () => {
  const owner = await persona('owner'), artistB = await persona('artist-b')
  const P = {}
  for (const l of ['manager', 'tour_manager', 'band_member', 'viewer', 'revoked_manager', 'pending_manager', 'stranger']) P[l] = await persona(l)
  const now = new Date().toISOString()
  await svc.from('artist_delegates').insert([
    { artist_id: owner.id, delegate_id: P.manager.id, role: 'manager', accepted_at: now },
    { artist_id: artistB.id, delegate_id: P.manager.id, role: 'manager', accepted_at: now },   // manages both artists
    { artist_id: owner.id, delegate_id: P.tour_manager.id, role: 'tour_manager', accepted_at: now },
    { artist_id: owner.id, delegate_id: P.band_member.id, role: 'band_member', accepted_at: now },
    { artist_id: owner.id, delegate_id: P.viewer.id, role: 'viewer', accepted_at: now },
    { artist_id: owner.id, delegate_id: P.revoked_manager.id, role: 'manager', accepted_at: now, revoked_at: now },
    { artist_id: owner.id, delegate_id: P.pending_manager.id, role: 'manager', accepted_at: null },
  ])
  const anon = { c: createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }), label: 'signed out' }

  console.log('\n— The migration applied, and refuses to run over anything else')
  { const pol = SQL(`select string_agg(tablename || '.' || policyname || ':' || cmd, ' ' order by tablename, policyname) from pg_policies where tablename in ('user_songs', 'user_song_performances')`)
    ok(`[migration] catalogue policies now: ${pol}`, pol.split(' ').length === 8 && !/_self/.test(pol))
    const e = SQLerr(fs.readFileSync(path.join(__dirname, 'supabase', 'migrations', '20261017000004_proposed_catalogue_write_access.sql'), 'utf8'))
    ok(`[migration] re-running it over a different policy state aborts, changing nothing: ${e}`, /policies differ from the reviewed production state/.test(e || ''))
  }

  console.log('\n— Access matrix on the artist\'s catalogue rows and show markers')
  const WRITE = new Set(['artist', 'manager', 'tour_manager', 'band_member'])
  const READ = new Set([...WRITE, 'viewer'])
  for (const who of [{ ...owner, label: 'artist' }, ...Object.values(P), anon]) {
    SQL(`delete from user_song_performances; delete from user_songs; insert into user_songs (user_id, song_title, confirmed_count) values ('${owner.id}', 'Artist Song', 3);`)
    const pid = show(owner, ['Probe'])
    SQL(`insert into user_song_performances (user_id, performance_id, normalized_title) values ('${owner.id}', '${pid}', 'existing marker');`)
    const r = {}
    const a = await who.c.from('user_songs').select('id').eq('user_id', owner.id); r.readRows = !a.error && a.data.length > 0
    const b = await who.c.from('user_song_performances').select('id').eq('user_id', owner.id); r.readMarkers = !b.error && b.data.length > 0
    const i1 = await who.c.from('user_songs').insert({ user_id: owner.id, song_title: 'Inserted By ' + who.label, confirmed_count: 1 }); r.insertRow = !i1.error
    const u1 = await who.c.from('user_songs').update({ confirmed_count: 1000 }).eq('user_id', owner.id).eq('song_title', 'Artist Song').select('id'); r.updateRow = !u1.error && u1.data.length > 0
    const i2 = await who.c.from('user_song_performances').insert({ user_id: owner.id, performance_id: pid, normalized_title: 'probe' }); r.insertMarker = !i2.error
    const u2 = await who.c.from('user_song_performances').update({ normalized_title: 'changed' }).eq('normalized_title', 'existing marker').select('id'); r.updateMarker = !u2.error && u2.data.length > 0
    const d2 = await who.c.from('user_song_performances').delete().eq('user_id', owner.id).eq('normalized_title', r.updateMarker ? 'changed' : 'existing marker').select('id'); r.deleteMarker = !d2.error && d2.data.length > 0
    const d1 = await who.c.from('user_songs').delete().eq('user_id', owner.id).eq('song_title', 'Artist Song').select('id'); r.deleteRow = !d1.error && d1.data.length > 0
    const canRead = READ.has(who.label), canWrite = WRITE.has(who.label)
    const writes = ['insertRow', 'updateRow', 'deleteRow', 'insertMarker', 'updateMarker', 'deleteMarker']
    const got = writes.filter(k => r[k])
    ok(`[access] ${who.label.padEnd(15)} read ${r.readRows && r.readMarkers ? 'yes' : 'no '} · writes allowed: ${got.length ? got.join(', ') : 'none'}`,
      r.readRows === canRead && r.readMarkers === canRead && writes.every(k => r[k] === canWrite), JSON.stringify(r))
  }

  console.log('\n— Ownership can\'t move')
  { SQL(`delete from user_song_performances; delete from user_songs;
         insert into user_songs (user_id, song_title, confirmed_count) values ('${owner.id}', 'Owned Song', 2);`)
    const pid = show(owner, ['Owned Song']); SQL(`insert into user_song_performances (user_id, performance_id, normalized_title) values ('${owner.id}', '${pid}', 'owned song');`)
    const tries = [
      ['a Manager of both artists moves a catalogue row to the other artist', P.manager.c.from('user_songs').update({ user_id: artistB.id }).eq('user_id', owner.id).eq('song_title', 'Owned Song').select('id')],
      ['a Manager of both artists moves a show marker to the other artist', P.manager.c.from('user_song_performances').update({ user_id: artistB.id }).eq('user_id', owner.id).select('id')],
      ['the artist gives a row away to an unrelated user', owner.c.from('user_songs').update({ user_id: P.stranger.id }).eq('user_id', owner.id).select('id')],
      ['the artist clears a row\'s owner', owner.c.from('user_songs').update({ user_id: null }).eq('user_id', owner.id).select('id')],
      ['a Viewer moves a row to themselves', P.viewer.c.from('user_songs').update({ user_id: P.viewer.id }).eq('user_id', owner.id).select('id')],
      ['a Manager inserts a row for an artist they don\'t manage', P.tour_manager.c.from('user_songs').insert({ user_id: artistB.id, song_title: 'Planted', confirmed_count: 50 }).select('id')],
    ]
    for (const [label, p] of tries) { const { data, error } = await p; ok(`[ownership] ${label}: refused (${error ? error.code : (data && data.length ? 'CHANGED' : 'no rows')})`, (!!error) || (data && data.length === 0)) }
    ok('[ownership] afterwards the row and marker still belong to the artist', count(owner, 'Owned Song') === '2/1' && +SQL(`select count(*) from user_song_performances where user_id = '${owner.id}'`) === 1)
    const e = SQLerr(`update user_songs set user_id = '${artistB.id}' where user_id = '${owner.id}';`)
    ok(`[ownership] even the service role / postgres can't move it (${e})`, /user_songs\.user_id cannot be changed after creation/.test(e || ''))
  }

  console.log('\n— Authorized writers keep working')
  SQL(`delete from user_song_performances; delete from user_songs;`)
  { const s1 = show(owner, ['Live Song']), s2 = show(owner, ['Live Song'])
    const r1 = await pageWriter(owner.c, owner.id, s1, 'Live Song'), r2 = await pageWriter(P.manager.c, owner.id, s2, 'Live Song')
    const r3 = await pageWriter(P.tour_manager.c, owner.id, s2, 'Live Song')
    ok(`[capture/live page + old review loop] artist: ${r1}; Manager on another show: ${r2}; Tour Manager on the same show: ${r3}; Live Song ${count(owner, 'Live Song')}`, r1 === 'counted' && r2 === 'counted' && r3 === 'already counted' && count(owner, 'Live Song') === '2/1')
    const s3 = show(owner, ['Live Song']); const rv = await pageWriter(P.viewer.c, owner.id, s3, 'Live Song')
    ok(`[capture/live page] a Viewer's write is refused (${rv}); nothing changed`, /^refused/.test(rv) && count(owner, 'Live Song') === '2/1' && markersFor(s3) === 0)
  }
  { // My Songs (components/MySongsTab.tsx): add, edit, delete — artist and Manager; Viewer refused.
    for (const who of [{ ...owner, label: 'artist' }, P.manager, P.viewer]) {
      const add = await who.c.from('user_songs').insert({ user_id: owner.id, song_title: 'Catalog Add ' + who.label, canonical_artist: 'Northern Lights', isrc: null, composer: null, publisher: null, confirmed_count: 0, source: 'manual_catalog' }).select().single()
      const id = add.data ? add.data.id : SQL(`insert into user_songs (user_id, song_title, confirmed_count) values ('${owner.id}', 'Catalog Add ${who.label}', 0) returning id;`).split('\n')[0]
      const edit = await who.c.from('user_songs').update({ song_title: 'Catalog Edited ' + who.label, canonical_artist: 'NL', isrc: 'CA-X', composer: 'C', publisher: 'P' }).eq('id', id).select('id')
      const del = await who.c.from('user_songs').delete().eq('id', id).select('id')
      const r = [!add.error, !edit.error && edit.data.length > 0, !del.error && del.data.length > 0]
      ok(`[My Songs] ${who.label}: add ${r[0] ? 'yes' : 'no'}, edit ${r[1] ? 'yes' : 'no'}, delete ${r[2] ? 'yes' : 'no'}`, who.label === 'viewer' ? r.every(x => !x) : r.every(Boolean))
    }
  }
  { // Spotify import (app/api/spotify-import/route.ts): the artist's own session deletes and re-inserts its own rows.
    SQL(`insert into user_songs (user_id, song_title, confirmed_count, source) values ('${owner.id}', 'Spotify Track', 1, 'spotify_import');`)
    const d = await owner.c.from('user_songs').delete().eq('user_id', owner.id).eq('source', 'spotify_import').in('song_title', ['Spotify Track'])
    const i = await owner.c.from('user_songs').insert([{ user_id: owner.id, song_title: 'Spotify Track', canonical_artist: 'Northern Lights', confirmed_count: 1, source: 'spotify_import', last_confirmed_at: new Date().toISOString() }]).select('id')
    ok('[Spotify import] the artist\'s own delete and re-insert still work', !d.error && !i.error && count(owner, 'Spotify Track') === '1/1')
  }
  { // Service-role writers (identify, upload-identify, upload-reconcile, delete, undo): RLS doesn't apply; the owner lock doesn't block them.
    const sid = show(owner, ['Svc Song'])
    const r = await pageWriter(svc, owner.id, sid, 'Svc Song')
    // delete route: read ledger, delete markers, write the recomputed count; undo: re-insert marker, write +1
    const { data: ledger } = await svc.from('user_song_performances').select('user_id, normalized_title').eq('performance_id', sid)
    const { error: dm } = await svc.from('user_song_performances').delete().eq('performance_id', sid)
    const { data: songs } = await svc.from('user_songs').select('id, song_title, confirmed_count').eq('user_id', owner.id)
    const match = songs.find(s => key(s.song_title) === ledger[0].normalized_title)
    const { error: du } = await svc.from('user_songs').update({ confirmed_count: Math.max(0, match.confirmed_count - 1), last_confirmed_at: null }).eq('id', match.id)
    const afterDelete = count(owner, 'Svc Song')
    const { error: ui } = await svc.from('user_song_performances').insert({ user_id: owner.id, performance_id: sid, normalized_title: 'svc song' })
    const { data: ex } = await svc.from('user_songs').select('id, confirmed_count').eq('user_id', owner.id).eq('song_title', 'Svc Song').maybeSingle()
    const { error: uu } = await svc.from('user_songs').update({ confirmed_count: ex.confirmed_count + 1, last_confirmed_at: new Date().toISOString() }).eq('id', ex.id)
    ok(`[capture identify / uploads / delete / undo, service role] count ${r}; delete → ${afterDelete}; undo → ${count(owner, 'Svc Song')}`, r === 'counted' && !dm && !du && afterDelete === '0/1' && !ui && !uu && count(owner, 'Svc Song') === '1/1')
  }
  { // The catalogue repair's trigger: a Manager's final write still records the artist's catalogue; a Viewer can't plant markers any more.
    const id = show(owner, ['Trigger Song', 'Planted Song'])
    const { error: vp } = await P.viewer.c.from('user_song_performances').insert({ user_id: owner.id, performance_id: id, normalized_title: 'planted song' })
    const { error } = await P.manager.c.from('performances').update({ status: 'complete' }).eq('id', id)
    ok(`[trigger] a Viewer can no longer pre-insert a marker (${vp && vp.code}); the Manager's completion records both songs (${count(owner, 'Trigger Song')}, ${count(owner, 'Planted Song')})`, vp && vp.code === '42501' && !error && count(owner, 'Trigger Song') === '1/1' && count(owner, 'Planted Song') === '1/1')
    const id2 = show(owner, ['Viewer Try'])
    const { data: vd, error: ve } = await P.viewer.c.from('performances').update({ status: 'complete' }).eq('id', id2).select('id')
    ok('[trigger] a Viewer still can\'t complete a show', (ve || vd.length === 0) && SQL(`select status from performances where id = '${id2}'`) === 'review')
  }

  console.log('\n— Stale writes from read-then-write writers (overlap guarantee)')
  { // O1. The trigger's committed increment is later overwritten by an older writer's stale value.
    SQL(`delete from user_song_performances; delete from user_songs; insert into user_songs (user_id, song_title, confirmed_count) values ('${owner.id}', 'Known Song', 5);`)
    const showOld = show(owner, ['Known Song']), showNew = show(owner, ['Known Song'])
    await owner.c.from('user_song_performances').insert({ user_id: owner.id, performance_id: showOld, normalized_title: 'known song' })   // old writer: marker
    const { data: stale } = await owner.c.from('user_songs').select('id, confirmed_count').eq('user_id', owner.id).eq('song_title', 'Known Song').single()   // old writer reads 5
    SQL(`update performances set status = 'complete' where id = '${showNew}';`)                      // trigger: atomic 5 → 6, committed
    const afterTrigger = count(owner, 'Known Song')
    await owner.c.from('user_songs').update({ confirmed_count: stale.confirmed_count + 1 }).eq('id', stale.id)                 // old writer writes 5 + 1
    ok(`[O1] trigger committed ${afterTrigger}; the older writer then wrote its stale 5+1: Known Song ${count(owner, 'Known Song')} after two counted shows (true value 7/1) — the trigger's increment is overwritten`, afterTrigger === '6/1' && count(owner, 'Known Song') === '6/1')
  }
  { // O2. A delete's decrement is overwritten by an older writer's stale increment: an over-count.
    SQL(`delete from user_song_performances; delete from user_songs; insert into user_songs (user_id, song_title, confirmed_count) values ('${owner.id}', 'Known Song', 5);`)
    const deleted = show(owner, ['Known Song'], 'complete'), showOld = show(owner, ['Known Song'])
    SQL(`insert into user_song_performances (user_id, performance_id, normalized_title) values ('${owner.id}', '${deleted}', 'known song');`)
    await owner.c.from('user_song_performances').insert({ user_id: owner.id, performance_id: showOld, normalized_title: 'known song' })
    const { data: stale } = await owner.c.from('user_songs').select('id, confirmed_count').eq('user_id', owner.id).eq('song_title', 'Known Song').single()   // reads 5
    // the delete route for the other show: reads 5, deletes its marker, writes 4
    const { data: songs } = await svc.from('user_songs').select('id, song_title, confirmed_count').eq('user_id', owner.id)
    await svc.from('user_song_performances').delete().eq('performance_id', deleted)
    await svc.from('user_songs').update({ confirmed_count: songs[0].confirmed_count - 1 }).eq('id', songs[0].id)
    const afterDelete = count(owner, 'Known Song')
    await owner.c.from('user_songs').update({ confirmed_count: stale.confirmed_count + 1 }).eq('id', stale.id)                 // writes 5 + 1
    ok(`[O2] delete committed ${afterDelete}; the older writer then wrote its stale 5+1: Known Song ${count(owner, 'Known Song')} (true value 5/1: one show removed, one added) — an over-count`, afterDelete === '4/1' && count(owner, 'Known Song') === '6/1')
  }
  { // O3. Trigger with trigger: increments compose exactly.
    SQL(`delete from user_song_performances; delete from user_songs; insert into user_songs (user_id, song_title, confirmed_count) values ('${owner.id}', 'Known Song', 5);`)
    const a = show(owner, ['Known Song']), b = show(owner, ['Known Song'])
    SQL(`update performances set status = 'complete' where id = '${a}';`); SQL(`update performances set status = 'complete' where id = '${b}';`)
    ok(`[O3] two trigger completions: Known Song ${count(owner, 'Known Song')} (exact)`, count(owner, 'Known Song') === '7/1')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error('ERROR', e); process.exit(1) })
