// Database-level tests of the revised migration on the DISPOSABLE stack, shaped like production
// (preflight Run 1, 2026-10-17). Real PostgREST + gotrue for every user-facing write, RLS on.
// node db-verify.js <repo>
const path = require('path'), fs = require('fs')
const { execSync, spawn } = require('child_process')
const REPO = process.argv[2]
const req = m => require(path.join(REPO, 'node_modules', m))
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, 'app.env'), 'utf8').split('\n').filter(Boolean).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL
if (SUPA !== 'http://127.0.0.1:54621') { console.error('REFUSING: not the disposable stack', SUPA); process.exit(1) }
const { createClient } = req('@supabase/supabase-js')
const svc = createClient(SUPA, env.SUPABASE_SERVICE_ROLE_KEY)
const DB = 'supabase_db_setlistr-catalog-disposable'
const SQL = q => execSync(`docker exec -i ${DB} psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim()
const SQLerr = q => { try { SQL(q); return null } catch (e) { const m = String(e.stderr || e.message); return (m.match(/ERROR:\s+([^\n]+)/) || [m])[1] } }
const hold = q => spawn('docker', ['exec', '-i', DB, 'psql', '-U', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1', '-c', q])
const sleep = ms => new Promise(r => setTimeout(r, ms))
let pass = 0, fail = 0
const ok = (n, c, d = '') => { c ? pass++ : fail++; console.log(c ? '  ok  ' : '  FAIL', n, c ? '' : d) }
const finding = (n, d) => console.log('  FINDING', n, d)
const key = t => t.toLowerCase().trim().replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').replace(/[-–—]/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()

async function persona(label) {
  const email = `db-${label}@example.test`, password = 'Pw-db-' + label + '-Aa1x9'
  await svc.from('beta_invites').insert({ email, invited_role: 'artist', added_by: 'db-verify' })
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true }); if (error) throw error
  await svc.from('profiles').upsert({ id: data.user.id, full_name: label, email }, { onConflict: 'id' })
  const c = createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { error: e2 } = await c.auth.signInWithPassword({ email, password }); if (e2) throw e2
  return { id: data.user.id, c }
}
let seq = 0
function show(owner, titles, status = 'review') {
  const id = SQL(`insert into performances (user_id, artist_name, venue_name, city, status, data_source, started_at, performance_date)
    values ('${owner.id}', 'Northern Lights', 'Disposable Hall', 'Toronto', '${status}', 'captured', now() - interval '${++seq} minutes', current_date) returning id;`).split('\n')[0]
  titles.forEach((t, i) => SQL(`insert into performance_songs (performance_id, title, artist, position, source, confusion_matrix_result) values ('${id}', $q$${t}$q$, 'Northern Lights', ${i + 1}, 'recognized', 'TBD');`))
  return id
}
const complete = id => SQL(`update performances set status = 'complete' where id = '${id}';`)
const count = (owner, t) => SQL(`select coalesce(sum(confirmed_count),0)||'/'||count(*) from user_songs where user_id = '${owner.id}' and song_title = $q$${t}$q$`)
const markersFor = id => +SQL(`select count(*) from user_song_performances where performance_id = '${id}'`)
const reset = () => SQL(`delete from user_song_performances; delete from user_songs;`)
// Revision 1 of the function, verbatim apart from its name, to show which production findings affect it.
const REV1 = fs.readFileSync(path.join(__dirname, '..', 'catalog', 'final-migration.sql'), 'utf8')
  .match(/CREATE OR REPLACE FUNCTION public\.record_performance_catalog\(p_performance_id uuid\)[\s\S]*?END \$\$;/)[0]
  .replace('public.record_performance_catalog(', 'public.zz_rev1_record_performance_catalog(')

;(async () => {
  const owner = await persona('owner'), manager = await persona('manager'), viewer = await persona('viewer'), stranger = await persona('stranger')
  await svc.from('artist_delegates').insert([
    { artist_id: owner.id, delegate_id: manager.id, role: 'manager', accepted_at: new Date().toISOString() },
    { artist_id: owner.id, delegate_id: viewer.id, role: 'viewer', accepted_at: new Date().toISOString() },
  ])
  const anon = createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })

  console.log('\n— Production column types')
  reset()
  { const id = show(owner, ['Polar Night', 'Paper Boats'])
    complete(id)
    const fmt = SQL(`select string_agg(distinct (performance_id = '${id}')::text, ',') from user_song_performances where user_id = '${owner.id}'`)
    ok(`[types] markers are written to the text performance_id in the app's form (the uuid's text): ${markersFor(id)} markers, match=${fmt}`, markersFor(id) === 2 && fmt === 'true')
    // The app writes the same form: a marker the page wrote is found by the trigger.
    const id2 = show(owner, ['Low Tide'])
    await owner.c.from('user_song_performances').insert({ user_id: owner.id, performance_id: id2, normalized_title: 'low tide' })
    await owner.c.from('user_songs').insert({ user_id: owner.id, song_title: 'Low Tide', confirmed_count: 1 })
    complete(id2)
    ok(`[types] a marker written by the app (capture) is recognised by the trigger: Low Tide stays ${count(owner, 'Low Tide')}`, count(owner, 'Low Tide') === '1/1')
    SQL(REV1)
    reset(); const id3 = show(owner, ['Polar Night'])
    const e = SQLerr(`select zz_rev1_record_performance_catalog('${id3}');`)
    ok(`[types, revision 1] revision 1 also writes markers on production's types (uuid → text is an assignment cast): ${e || 'no error'}, ${markersFor(id3)} marker`, !e && markersFor(id3) === 1)
  }

  console.log('\n— Production uniqueness: user_songs UNIQUE (user_id, song_title)')
  // R1. Another writer creates the song's row while the save is in progress.
  for (const [label, fn] of [['revision 1', 'zz_rev1_record_performance_catalog'], ['revision 2', 'record_performance_catalog']]) {
    reset(); const id = show(owner, ['Race Song'])
    const h = hold(`begin; insert into user_songs (user_id, song_title, confirmed_count) values ('${owner.id}', 'Race Song', 1); select pg_sleep(3); commit;`)
    await sleep(800)
    const e = SQLerr(`select ${fn}('${id}');`)
    await new Promise(r => h.on('exit', r))
    if (label === 'revision 1') ok(`[race, ${label}] the concurrent row makes revision 1 fail: ${e}`, !!e && /duplicate key value violates unique constraint "user_songs_user_id_song_title_key"/.test(e), e || 'no error')
    else ok(`[race, ${label}] the upsert waits for the other writer, then counts onto its row: no error; Race Song ${count(owner, 'Race Song')} (total/rows)`, !e && count(owner, 'Race Song') === '2/1', e || count(owner, 'Race Song'))
  }
  { reset(); const id = show(owner, ['Race Song'])
    const h = hold(`begin; insert into user_songs (user_id, song_title, confirmed_count) values ('${owner.id}', 'Race Song', 1); select pg_sleep(3); commit;`)
    await sleep(800)
    const e = SQLerr(`update performances set status = 'complete' where id = '${id}';`)
    await new Promise(r => h.on('exit', r))
    ok(`[race, through the trigger] the final write completes the show: ${e || 'no error'}; status ${SQL(`select status from performances where id = '${id}'`)}; Race Song ${count(owner, 'Race Song')}`, !e && count(owner, 'Race Song') === '2/1')
  }
  SQL(`drop function zz_rev1_record_performance_catalog(uuid);`)

  // R2/R3. The unlocked writers (main's review loop, live page, identify, uploads) run
  // marker → read → write as separate requests. Replayed here step by step, as those
  // writers do, through PostgREST with the artist's session, interleaved with a trigger completion.
  { reset(); const showM = show(owner, ['Race Song']), showC = show(owner, ['Race Song'])
    await owner.c.from('user_song_performances').insert({ user_id: owner.id, performance_id: showM, normalized_title: 'race song' })
    const { data: before } = await owner.c.from('user_songs').select('id, confirmed_count').eq('user_id', owner.id).eq('song_title', 'Race Song').maybeSingle()
    complete(showC)                                      // the trigger creates the row in between
    const { error } = await owner.c.from('user_songs').insert({ user_id: owner.id, song_title: 'Race Song', canonical_artist: 'Northern Lights', confirmed_count: 1, last_confirmed_at: new Date().toISOString() })
    finding(`[R2 lost count, not a split row] an unlocked writer that read "no row" and inserts after the trigger created it gets ${error && error.code} (main ignores it):`,
      `two shows marked, Race Song ${count(owner, 'Race Song')} (total/rows) — one show's count is lost; no second row can exist`)
    ok('[R2] production uniqueness: never two rows for the song; the unlocked writer\'s show is under-counted', !before && error && error.code === '23505' && count(owner, 'Race Song') === '1/1' && +SQL(`select count(*) from user_song_performances where normalized_title = 'race song'`) === 2)
  }
  { reset(); const showM = show(owner, ['Known Song']), showC = show(owner, ['Known Song'])
    SQL(`insert into user_songs (user_id, song_title, confirmed_count) values ('${owner.id}', 'Known Song', 5);`)
    await owner.c.from('user_song_performances').insert({ user_id: owner.id, performance_id: showM, normalized_title: 'known song' })
    const { data: existing } = await owner.c.from('user_songs').select('id, confirmed_count').eq('user_id', owner.id).eq('song_title', 'Known Song').single()
    complete(showC)                                      // trigger: 5 → 6, atomically
    await owner.c.from('user_songs').update({ confirmed_count: existing.confirmed_count + 1 }).eq('id', existing.id)   // writes 6 from its stale read
    finding('[R3 lost update] an unlocked writer that read 5, then wrote 5+1 after the trigger\'s atomic +1:', `Known Song ${count(owner, 'Known Song')} after two shows (should be 7/1)`)
    ok('[R3] the trigger\'s own increment is atomic; the unlocked writer\'s absolute write overwrites it', count(owner, 'Known Song') === '6/1')
  }

  console.log('\n— Concurrency: saves of the same artist sharing songs (trigger only)')
  { reset(); let errors = [], ids = []
    for (let i = 0; i < 12; i++) ids.push([show(owner, ['Shared A', 'Shared B', 'Own ' + i]), show(owner, ['Shared B', 'Shared A', 'Other ' + i])])
    for (const [a, b] of ids) {
      const ps = [a, b].map(id => new Promise(r => { const p = hold(`update performances set status = 'complete' where id = '${id}';`); let err = ''; p.stderr.on('data', d => err += d); p.on('exit', c => r(c ? err : null)) }))
      errors.push(...(await Promise.all(ps)).filter(Boolean))
    }
    ok(`[deadlock-free] 12 rounds of two simultaneous completions sharing two songs in opposite positions: ${errors.length} errors; Shared A ${count(owner, 'Shared A')}, Shared B ${count(owner, 'Shared B')}`, errors.length === 0 && count(owner, 'Shared A') === '24/1' && count(owner, 'Shared B') === '24/1', errors.slice(0, 2).join(' | '))
  }

  console.log('\n— Notion webhook trigger (production\'s notion_show_count, pointed at a closed local port)')
  { reset(); const queued = () => +SQL(`select (select count(*) from net.http_request_queue) + (select count(*) from net._http_response)`)
    const id = show(owner, ['Polar Night']); const q0 = queued(); complete(id); await sleep(300); const q1 = queued()
    ok(`[notion] a successful completion still queues its webhook (${q1 - q0}) and records the catalogue`, q1 - q0 === 1 && markersFor(id) === 1)
    const id2 = show(owner, ['Will Fail']); SQL(`alter table user_songs add constraint zz_fail check (song_title <> 'Will Fail');`)
    const q2 = queued(); const e = SQLerr(`update performances set status = 'complete' where id = '${id2}';`); await sleep(300); const q3 = queued()
    SQL(`alter table user_songs drop constraint zz_fail;`)
    ok(`[notion] a rejected completion queues no webhook (${q3 - q2}): the webhook and the catalogue roll back together (${e && e.slice(0, 60)}…)`, !!e && q3 - q2 === 0 && SQL(`select status from performances where id = '${id2}'`) === 'review')
  }

  console.log('\n— Function permissions')
  { const id = show(owner, ['Polar Night'])
    const { error } = await owner.c.rpc('record_performance_catalog', { p_performance_id: id })
    ok(`[permissions] a signed-in user can't call the catalogue function directly (${error && error.code})`, !!error && ['42501', 'PGRST202'].includes(error.code), JSON.stringify(error))
    const { error: e2 } = await anon.rpc('performances_record_catalog')
    ok(`[permissions] nor the trigger function (${e2 && e2.code})`, !!e2)
    const acl = SQL(`select string_agg(p.proname || ':' || coalesce(array_to_string(p.proacl, ' '), 'default'), ' | ') from pg_proc p where p.proname in ('record_performance_catalog', 'performances_record_catalog')`)
    ok(`[permissions] EXECUTE revoked from anon and authenticated (${acl})`, !/anon=X|authenticated=X/.test(acl) && !/default/.test(acl))
  }

  console.log('\n— Catalogue table access under production\'s policies (ALL USING can_act_for) — reported separately')
  reset(); SQL(`insert into user_songs (user_id, song_title, confirmed_count) values ('${owner.id}', 'Artist Song', 3);`)
  for (const [label, who] of [['Manager', manager], ['Viewer', viewer], ['Unrelated signed-in user', stranger], ['Signed-out (anon)', { c: anon }]]) {
    const r = {}
    const sel = await who.c.from('user_songs').select('id').eq('user_id', owner.id); r.read = sel.error ? sel.error.code : (sel.data.length ? 'yes' : 'no rows')
    const ins = await who.c.from('user_songs').insert({ user_id: owner.id, song_title: label + ' Insert', confirmed_count: 99 }); r.insert = ins.error ? ins.error.code : 'yes'
    const upd = await who.c.from('user_songs').update({ confirmed_count: 1000 }).eq('user_id', owner.id).eq('song_title', 'Artist Song').select('id'); r.update = upd.error ? upd.error.code : (upd.data.length ? 'yes' : 'no rows')
    const pid = show(owner, ['Suppressed Song'])
    const mk = await who.c.from('user_song_performances').insert({ user_id: owner.id, performance_id: pid, normalized_title: 'suppressed song' }); r.marker = mk.error ? mk.error.code : 'yes'
    const del = await who.c.from('user_songs').delete().eq('user_id', owner.id).eq('song_title', label + ' Insert').select('id'); r.delete = del.error ? del.error.code : (del.data.length ? 'yes' : 'no rows')
    complete(pid); r.suppressed = count(owner, 'Suppressed Song') === '0/0' ? 'song NOT counted at completion' : 'counted'
    SQL(`update user_songs set confirmed_count = 3 where user_id = '${owner.id}' and song_title = 'Artist Song'; delete from user_songs where song_title = 'Suppressed Song';`)
    finding(`[access] ${label} on the artist's catalogue:`, `read ${r.read}; insert ${r.insert}; update ${r.update}; delete ${r.delete}; pre-insert a show marker ${r.marker}${r.marker === 'yes' ? ' → ' + r.suppressed : ''}`)
    if (label === 'Viewer') ok('[access] (demonstrated permission issue) a Viewer can write the artist\'s catalogue and pre-insert markers that stop songs being counted', r.insert === 'yes' && r.update === 'yes' && r.marker === 'yes' && /NOT counted/.test(r.suppressed))
    if (label.startsWith('Unrelated') || label.startsWith('Signed-out')) ok(`[access] ${label}: no read, no write`, r.read !== 'yes' && r.insert !== 'yes' && r.update !== 'yes' && r.marker !== 'yes')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error('ERROR', e); process.exit(1) })
