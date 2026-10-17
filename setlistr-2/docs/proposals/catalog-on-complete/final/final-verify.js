// Integrated test: the real patched review save (design/share-cards e47c879 + app.patch)
// against the proposed migration, on a DISPOSABLE Supabase stack with RLS on.
// node int-verify.js <repo>
const path = require('path'), fs = require('fs')
const REPO = process.argv[2]
const req = m => require(path.join(REPO, 'node_modules', m))
const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, 'app.env'), 'utf8').split('\n').filter(Boolean).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL
if (SUPA !== 'http://127.0.0.1:54621') { console.error('REFUSING: not the disposable stack', SUPA); process.exit(1) }
const { createClient } = req('@supabase/supabase-js')
const { chromium } = require('/Users/jesseslack/.npm/_npx/e41f203b7505f1fb/node_modules/playwright')
const svc = createClient(SUPA, env.SUPABASE_SERVICE_ROLE_KEY)
const APPS = { cand: 'http://127.0.0.1:3105', main: 'http://127.0.0.1:3106', old: 'http://127.0.0.1:3107' }
let base = APPS.cand
const { execSync } = require('child_process')
const SQL = q => execSync(`docker exec -i supabase_db_setlistr-catalog-disposable psql -U postgres -At -v ON_ERROR_STOP=1`, { input: q }).toString().trim()
let pass = 0, fail = 0
const ok = (n, c, d = '') => { c ? pass++ : fail++; console.log(c ? '  ok  ' : '  FAIL', n, c ? '' : d) }
const DAY = 86400000

async function persona(label, artistName = null) {
  const email = `int-${label}@example.test`, password = 'Pw-int-' + label + '-Aa1x9'
  await svc.from('beta_invites').insert({ email, invited_role: 'artist', added_by: 'int-verify' })
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true }); if (error) throw error
  await svc.from('profiles').upsert({ id: data.user.id, full_name: label, email, artist_name: artistName, pro_affiliation: artistName ? 'SOCAN' : null }, { onConflict: 'id' })
  return { email, password, id: data.user.id }
}
let showSeq = 0
async function makeShow(owner, songs, { status = 'review', daysAgo = 1, dataSource = 'captured' } = {}) {
  const t = new Date(Date.now() - daysAgo * DAY - (showSeq++) * 60000).toISOString()
  const { data: p, error } = await svc.from('performances').insert({ user_id: owner.id, artist_name: 'Northern Lights', venue_name: 'The Horseshoe Tavern', city: 'Toronto', country: 'Canada', status, data_source: dataSource, started_at: t, ended_at: t, created_at: t, performance_date: t.slice(0, 10) }).select('id').single()
  if (error) throw error
  if (songs.length) {
    const { error: e2 } = await svc.from('performance_songs').insert(songs.map((s, i) => ({ performance_id: p.id, title: s.title, artist: 'Northern Lights', position: i + 1, source: s.source || 'recognized', was_planned: !!s.planned, inclusion_reason: s.planned ? 'planned setlist - not detected' : null, confusion_matrix_result: 'TBD' })))
    if (e2) throw e2
  }
  return p.id
}
// Keys sorted, so comparisons don't depend on the order the database returns them in.
const catalogue = () => { const o = JSON.parse(SQL(`select coalesce(json_object_agg(song_title, confirmed_count), '{}') from (select song_title, sum(confirmed_count) confirmed_count from user_songs group by song_title) x`)); return Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]])) }
const rows = () => +SQL(`select count(*) from user_songs`)
const markers = id => +SQL(`select count(*) from user_song_performances where performance_id = '${id}'`)
const status = id => SQL(`select status from performances where id = '${id}'`)
const resetCatalogue = () => SQL(`delete from user_song_performances; delete from user_songs;`)

;(async () => {
  const owner = await persona('owner', 'Northern Lights')
  const manager = await persona('manager'), tm = await persona('tourmanager'), viewer = await persona('viewer')
  await svc.from('artist_delegates').insert([
    { artist_id: owner.id, delegate_id: manager.id, role: 'manager', accepted_at: new Date().toISOString() },
    { artist_id: owner.id, delegate_id: tm.id, role: 'tour_manager', accepted_at: new Date().toISOString() },
    { artist_id: owner.id, delegate_id: viewer.id, role: 'viewer', accepted_at: new Date().toISOString() },
  ])
  const b = await chromium.launch()
  async function session(user, { latency = 0, app = 'cand' } = {}) {
    const B = APPS[app]
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
    await ctx.addInitScript(([uid, ownerId, acting]) => { try { if (acting) localStorage.setItem('setlistr_acting_as:' + uid, JSON.stringify({ artist_id: ownerId, artist_name: 'Northern Lights' })) } catch {} }, [user.id, owner.id, user.id !== owner.id])
    if (latency) await ctx.route(u => u.toString().startsWith(SUPA), async r => { await new Promise(res => setTimeout(res, latency)); return r.fallback() })
    const pg = await ctx.newPage()
    // The sign-in page re-renders on the client after a pre-existing hydration warning; sign in once it's interactive.
    for (let attempt = 0; attempt < 3; attempt++) {
      await pg.goto(B + '/auth/login'); await pg.waitForLoadState('networkidle').catch(() => {}); await pg.waitForTimeout(2500)
      await pg.fill('#auth-email', user.email); await pg.fill('#auth-password', user.password); await pg.press('#auth-password', 'Enter')
      if (await pg.waitForURL(x => !x.pathname.startsWith('/auth'), { timeout: 30000 }).then(() => true, () => false)) break
    }
    if (new URL(pg.url()).pathname.startsWith('/auth')) throw new Error('sign-in did not complete for ' + user.email)
    pg.__base = B
    return { ctx, pg }
  }
  async function openReview(pg, id) { await pg.goto(pg.__base + `/app/review/${id}?source=live`); await pg.waitForFunction(() => /save & complete/i.test(document.body.innerText), null, { timeout: 90000 }); await pg.waitForTimeout(500) }
  const clickSave = pg => pg.getByRole('button', { name: /Save & Complete|Try again/i }).click()
  const celebrated = pg => pg.waitForSelector('.cer', { timeout: 60000 }).then(() => true, () => false)
  const SET = [{ title: 'Polar Night' }, { title: 'Paper Boats' }, { title: 'Low Tide' }]

  try {
    // 1. Roles, RLS on: each saves a fresh show of the owner's through the real page.
    for (const [label, user] of [['Owner', owner], ['Manager', manager], ['Tour Manager', tm], ['Viewer', viewer]]) {
      resetCatalogue(); const id = await makeShow(owner, SET)
      const { ctx, pg } = await session(user); await openReview(pg, id); await clickSave(pg)
      if (label === 'Viewer') {
        await pg.waitForFunction(() => /can’t save changes/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {})
        const t = await pg.locator('body').innerText()
        ok(`[${label}] save refused with a clear message; show stays in review; nothing in the catalogue`, /can’t save changes/.test(t) && status(id) === 'review' && rows() === 0 && markers(id) === 0, JSON.stringify({ s: status(id), r: rows() }))
      } else {
        const c = await celebrated(pg); await pg.waitForTimeout(800)
        ok(`[${label}] save completes and the artist's catalogue is recorded with it (3 songs, 1 each)`, c && status(id) === 'complete' && JSON.stringify(catalogue()) === '{"Low Tide":1,"Paper Boats":1,"Polar Night":1}' && markers(id) === 3, JSON.stringify({ c, s: status(id), cat: catalogue(), m: markers(id) }))
      }
      await ctx.close()
    }

    // 2. Played planned songs.
    resetCatalogue()
    { const id = await makeShow(owner, [...SET, { title: 'Planned And Played', source: 'planned', planned: true }, { title: 'Planned Not Played', source: 'planned', planned: true }])
      const { ctx, pg } = await session(owner); await openReview(pg, id)
      await pg.locator('div', { hasText: /^Planned And Played/ }).filter({ has: pg.getByRole('button', { name: /Played/ }) }).last().getByRole('button', { name: /Played/ }).click(); await pg.waitForTimeout(300)
      await clickSave(pg); const c = await celebrated(pg); await pg.waitForTimeout(800)
      const cat = catalogue()
      ok('[played planned] the planned song marked played is counted; the one not marked is not', c && cat['Planned And Played'] === 1 && cat['Planned Not Played'] === undefined && markers(id) === 4, JSON.stringify(cat))
      await ctx.close() }

    // 3. Re-save of a completed show: nothing counted again. Song already counted during capture: not counted twice.
    resetCatalogue()
    { const id = await makeShow(owner, SET)
      SQL(`insert into user_song_performances (user_id, performance_id, normalized_title) values ('${owner.id}', '${id}', 'polar night'); insert into user_songs (user_id, song_title, confirmed_count) values ('${owner.id}', 'Polar Night', 5);`)
      const { ctx, pg } = await session(owner); await openReview(pg, id); await clickSave(pg); await celebrated(pg); await pg.waitForTimeout(800)
      const first = catalogue()
      ok('[capture] a song already counted during capture is not counted again at review', first['Polar Night'] === 5 && first['Low Tide'] === 1, JSON.stringify(first))
      await openReview(pg, id); await clickSave(pg); await celebrated(pg); await pg.waitForTimeout(800)
      ok('[re-save] saving the completed show again changes nothing', JSON.stringify(catalogue()) === JSON.stringify(first) && rows() === 3, JSON.stringify(catalogue()))
      await ctx.close() }

    // 4. Concurrent saves: owner and manager save two shows at the same moment, both introducing the same new song.
    resetCatalogue()
    { const a = await makeShow(owner, [{ title: 'Brand New Song' }, { title: 'Song A' }]), c2 = await makeShow(owner, [{ title: 'Brand New Song' }, { title: 'Song B' }])
      const s1 = await session(owner, { latency: 120 }), s2 = await session(manager, { latency: 120 })
      await openReview(s1.pg, a); await openReview(s2.pg, c2)
      await Promise.all([clickSave(s1.pg), clickSave(s2.pg)])
      const done = await Promise.all([celebrated(s1.pg), celebrated(s2.pg)]); await s1.pg.waitForTimeout(1000)
      const n = SQL(`select count(*)||':'||coalesce(sum(confirmed_count),0) from user_songs where song_title = 'Brand New Song'`)
      ok(`[concurrent] both saves complete; one catalogue row for the shared new song, counted twice (${n})`, done.every(Boolean) && n === '1:2', n)
      await s1.ctx.close(); await s2.ctx.close() }

    // 5. FAILURE BOUNDARY (rewrites fix-verify #5 and opt-fail's catalogue case).
    // Each injection is confirmed to have fired by the final write's own response.
    const watchFinal = ctx => { const seen = []; ctx.on('response', async r => { if (r.request().method() === 'PATCH' && /\/rest\/v1\/performances\?/.test(r.url())) { let body = null; try { body = await r.json() } catch {} seen.push({ status: r.status(), code: body && body.code, hint: body && body.hint }) } }); return seen }
    // Next.js's route announcer is also role="alert"; the save error is the one carrying a reference.
    const alertText = pg => pg.locator('[role="alert"]', { hasText: 'Reference:' }).first().innerText().catch(() => '')
    const saveLabel = pg => pg.locator('button', { hasText: /Save & Complete|Try again|Saving/i }).first().innerText().catch(() => '')
    async function linkedShow(id) { const { data: sh } = await svc.from('shows').insert({ created_by: owner.id, status: 'live', name: 'Linked' }).select('id').single(); SQL(`set session_replication_role = replica; update performances set show_id = '${sh.id}' where id = '${id}';`); return sh.id }

    // 5a. Permanent catalogue rejection (a constraint): rejected, no Try again, edits and linked show kept.
    resetCatalogue()
    { const id = await makeShow(owner, [{ title: 'Polar Night' }, { title: 'Paper Boats' }, { title: 'Brand New Debut' }]); const showId = await linkedShow(id)
      SQL(`alter table user_songs add constraint zz_fail check (song_title <> 'Paper Boats (Edited)');`)
      const { ctx, pg } = await session(owner); const seen = watchFinal(ctx); await openReview(pg, id)
      await pg.getByText('Paper Boats', { exact: true }).click(); await pg.getByPlaceholder('Song title').fill('Paper Boats (Edited)'); await pg.getByPlaceholder('Song title').press('Enter'); await pg.waitForTimeout(300)
      await clickSave(pg); await pg.waitForFunction(() => /Reference: /.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {}); await pg.waitForTimeout(500)
      const fired = seen.find(x => x.hint === 'setlistr:song-catalogue')
      ok(`[5a permanent] injection fired: the final write returned ${fired && fired.status} ${fired && fired.code} tagged song-catalogue`, !!fired && fired.code === '23514')
      const msg = await alertText(pg), label = await saveLabel(pg)
      ok('[5a permanent] message: edits saved, show not completed, catalogue named, retry not offered as the fix', /Your songs and edits are saved/.test(msg) && /couldn’t be added to your song catalogue/.test(msg) && /Trying again won’t fix this/.test(msg) && /Reference: record the song catalogue · 23514 · zz_fail/.test(msg) && !/try again/i.test(label), JSON.stringify({ msg, label }))
      const titles = SQL(`select string_agg(title, ', ' order by position) from performance_songs where performance_id = '${id}'`)
      ok('[5a permanent] (original safety) no celebration; show not complete; no partial catalogue; no first-appearance claim', !(await pg.locator('.cer').count()) && status(id) === 'review' && markers(id) === 0 && rows() === 0)
      ok('[5a permanent] (original safety) the edit and the linked show’s finish are kept', /Paper Boats \(Edited\)/.test(titles) && SQL(`select status from shows where id = '${showId}'`) === 'completed', titles)
      SQL(`alter table user_songs drop constraint zz_fail;`)
      await clickSave(pg); const c = await celebrated(pg); await pg.waitForFunction(() => !/Reading the night/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {}); await pg.waitForTimeout(800)
      const mom = await pg.locator('.cer-moments').innerText().catch(() => '')
      const debuts = SQL(`select string_agg(song_title, ', ' order by song_title) from user_songs where confirmed_count = 1`)
      ok('[5a retry] once the cause is gone, saving again completes; catalogue once; no duplicate songs', c && status(id) === 'complete' && markers(id) === 3 && rows() === 3 && +SQL(`select count(*) from performance_songs where performance_id='${id}'`) === 3)
      ok(`[5a retry] (original safety) first-appearance claims match the catalogue exactly (${debuts})`, debuts.split(', ').every(t => mom.includes(t)) && /First appearance on your record/.test(mom), mom)
      await ctx.close() }

    // 5b. Temporary catalogue failure (a serialization failure inside the catalogue step): tagged, Try again offered and works.
    resetCatalogue()
    { const id = await makeShow(owner, SET)
      SQL(`create function pg_temp_inject() returns trigger language plpgsql as $$ begin raise exception using errcode = '40001', message = 'injected serialization failure'; end $$; create trigger zz_inject before insert on user_songs for each row execute function pg_temp_inject();`)
      const { ctx, pg } = await session(owner); const seen = watchFinal(ctx); await openReview(pg, id); await clickSave(pg)
      await pg.waitForFunction(() => /Reference: /.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {}); await pg.waitForTimeout(500)
      const fired = seen.find(x => x.hint === 'setlistr:song-catalogue'), msg = await alertText(pg), label = await saveLabel(pg)
      ok(`[5b temporary] injection fired: final write returned ${fired && fired.code} tagged song-catalogue`, !!fired && fired.code === '40001')
      ok('[5b temporary] message: edits saved, not completed just now, Try again offered', /Your songs and edits are saved/.test(msg) && /just now/.test(msg) && /Try again; nothing will be added twice/.test(msg) && /try again/i.test(label) && status(id) === 'review' && markers(id) === 0, JSON.stringify({ msg, label }))
      SQL(`drop trigger zz_inject on user_songs; drop function pg_temp_inject();`)
      await clickSave(pg); const c = await celebrated(pg); await pg.waitForTimeout(800)
      ok('[5b retry] Try again completes; catalogue once', c && status(id) === 'complete' && markers(id) === 3 && rows() === 3)
      await ctx.close() }

    // 5c. Real contention: another session holds the artist's catalogue lock past the timeouts (8s).
    resetCatalogue()
    { const id = await makeShow(owner, SET)
      const { spawn } = require('child_process')
      const { ctx, pg } = await session(owner); const seen = watchFinal(ctx); await openReview(pg, id)
      // Take the artist's catalogue lock just before Save and hold it well past the 8s timeouts.
      const holder = spawn('docker', ['exec', '-i', 'supabase_db_setlistr-catalog-disposable', 'psql', '-U', 'postgres', '-q', '-c', `select pg_advisory_lock(hashtextextended('user_songs:${owner.id}', 0)); select pg_sleep(25);`])
      for (let i = 0; i < 50 && SQL(`select count(*) from pg_locks where locktype = 'advisory' and granted`) === '0'; i++) await new Promise(r => setTimeout(r, 200))
      ok('[5c contention] another session holds the artist’s catalogue lock', SQL(`select count(*) from pg_locks where locktype = 'advisory' and granted`) !== '0')
      await clickSave(pg)
      await pg.waitForFunction(() => /Reference: /.test(document.body.innerText), null, { timeout: 40000 }).catch(() => {}); await pg.waitForTimeout(500)
      const f = seen[seen.length - 1] || {}, msg = await alertText(pg), label = await saveLabel(pg)
      ok(`[5c contention] injection fired: final write returned ${f.status} ${f.code}${f.hint ? ' tagged' : ' untagged'}`, ['55P03', '57014'].includes(f.code))
      ok('[5c contention] treated as temporary: edits saved, Try again offered; show not complete', /Your songs and edits are saved/.test(msg) && /just now/.test(msg) && /try again/i.test(label) && status(id) === 'review' && markers(id) === 0, JSON.stringify({ msg, label }))
      await new Promise(r => holder.on('exit', r))
      await clickSave(pg); const c = await celebrated(pg); await pg.waitForTimeout(800)
      ok('[5c retry] after the lock is released, Try again completes; catalogue once', c && status(id) === 'complete' && markers(id) === 3 && rows() === 3)
      await ctx.close() }

    // 5d. Optional work still never blocks (rewrites opt-fail): telemetry and intelligence fail; the page sends no catalogue writes.
    resetCatalogue()
    { const id = await makeShow(owner, SET)
      const { ctx, pg } = await session(owner)
      const hits = { telemetry: 0, intelligence: 0, catalogueWrites: 0 }
      await ctx.route(u => /\/rest\/v1\/product_events/.test(u.toString()), r => { hits.telemetry++; return r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"simulated"}' }) })
      await ctx.route(u => /\/rest\/v1\/(user_songs|performances_visible)\?.*(confirmed_count|count=exact|select=%2A)/.test(u.toString()) && !/status%2C+submission_status|id%2Cvenue_name%2Cstatus/.test(u.toString()), r => { if (r.request().method() === 'GET' || r.request().method() === 'HEAD') { hits.intelligence++; return r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"simulated"}' }) } return r.fallback() })
      pg.on('request', r => { if (/\/rest\/v1\/(user_songs|user_song_performances)(\?|$)/.test(r.url()) && r.method() !== 'GET' && r.method() !== 'HEAD') hits.catalogueWrites++ })
      await openReview(pg, id); await clickSave(pg); const c = await celebrated(pg); await pg.waitForTimeout(3000)
      ok(`[5d optional] injections fired (telemetry ${hits.telemetry}, intelligence ${hits.intelligence}); the save still celebrates and completes`, hits.telemetry > 0 && hits.intelligence > 0 && c && status(id) === 'complete')
      ok(`[5d optional] the page sends no catalogue writes (${hits.catalogueWrites}); the database recorded all 3 songs`, hits.catalogueWrites === 0 && markers(id) === 3 && rows() === 3)
      await ctx.close() }

    // ── B. OVERLAP AND ROLLBACK: the migration applied while other app versions are in use.
    // B1. The deployed main (writes 'completed', ignores errors, then its own page-side catalogue loop).
    resetCatalogue()
    { const id = await makeShow(owner, SET)
      const { ctx, pg } = await session(owner, { app: 'main' }); await openReview(pg, id); await clickSave(pg); await pg.waitForTimeout(6000)
      ok(`[B1 deployed main] same as today: its 'completed' is rejected so the trigger never fires; its own loop counts each song once (status ${status(id)}, markers ${markers(id)}, rows ${rows()})`, status(id) === 'review' && markers(id) === 3 && JSON.stringify(Object.values(catalogue())) === '[1,1,1]')
      await ctx.close() }
    // B2. An old tab of the pre-patch candidate: trigger at the final write, then its loop finds the markers.
    resetCatalogue()
    { const id = await makeShow(owner, SET)
      const { ctx, pg } = await session(owner, { app: 'old' }); await openReview(pg, id); await clickSave(pg); await celebrated(pg); await pg.waitForTimeout(5000)
      ok(`[B2 old tab] trigger and old page loop together: each song counted once (${JSON.stringify(catalogue())}, markers ${markers(id)})`, status(id) === 'complete' && markers(id) === 3 && JSON.stringify(Object.values(catalogue())) === '[1,1,1]')
      // ...and a re-save of that show from the new candidate changes nothing.
      const s2 = await session(owner); await openReview(s2.pg, id); await clickSave(s2.pg); await celebrated(s2.pg); await s2.pg.waitForTimeout(800)
      ok('[B2 old tab → re-saved in the candidate] no change', JSON.stringify(Object.values(catalogue())) === '[1,1,1]' && rows() === 3)
      await ctx.close(); await s2.ctx.close() }
    // B3. Old tab and candidate save two shows at once, sharing a new song.
    resetCatalogue()
    { const a1 = await makeShow(owner, [{ title: 'Overlap Song' }, { title: 'Old Only' }]), a2 = await makeShow(owner, [{ title: 'Overlap Song' }, { title: 'New Only' }])
      const o = await session(owner, { app: 'old', latency: 120 }), n = await session(manager, { latency: 120 })
      await openReview(o.pg, a1); await openReview(n.pg, a2); await Promise.all([clickSave(o.pg), clickSave(n.pg)]); await Promise.all([celebrated(o.pg), celebrated(n.pg)]); await o.pg.waitForTimeout(5000)
      const r = SQL(`select count(*)||':'||sum(confirmed_count) from user_songs where song_title = 'Overlap Song'`)
      ok(`[B3 old tab + candidate at once] the shared song: one row, counted twice (${r})`, r === '1:2', r)
      await o.ctx.close(); await n.ctx.close() }
    // B4. Deployed main and candidate at once, sharing a new song (main's loop doesn't take the lock).
    resetCatalogue()
    { const a1 = await makeShow(owner, [{ title: 'Race Song' }, { title: 'Main Only' }]), a2 = await makeShow(owner, [{ title: 'Race Song' }, { title: 'Cand Only' }])
      const m = await session(owner, { app: 'main', latency: 120 }), n = await session(owner, { latency: 120 })
      await openReview(m.pg, a1); await openReview(n.pg, a2); await Promise.all([clickSave(m.pg), clickSave(n.pg)]); await n.pg.waitForTimeout(8000)
      const r = SQL(`select count(*)||':'||sum(confirmed_count) from user_songs where song_title = 'Race Song'`)
      const perShow = SQL(`select count(*) from user_song_performances where normalized_title = 'race song'`)
      ok(`[B4 main + candidate at once] no show counted twice (markers for the song: ${perShow}); total for the song: ${r.split(':')[1]} over ${r.split(':')[0]} row(s)`, perShow === '2' && r.split(':')[1] === '2', r)
      await m.ctx.close(); await n.ctx.close() }
    // B5. Wrong rollback order: the trigger removed while the candidate is still deployed loses the catalogue.
    resetCatalogue()
    { const id = await makeShow(owner, SET)
      SQL(`drop trigger performances_record_catalog on public.performances;`)
      const { ctx, pg } = await session(owner); await openReview(pg, id); await clickSave(pg); await celebrated(pg); await pg.waitForTimeout(2000)
      ok(`[B5 wrong rollback order] trigger dropped while the candidate is deployed: the show completes with NO catalogue (markers ${markers(id)}) — so the app must be rolled back first`, status(id) === 'complete' && markers(id) === 0 && rows() === 0)
      SQL(`create trigger performances_record_catalog after update of status on public.performances for each row when (new.status = 'complete') execute function public.performances_record_catalog();`)
      await ctx.close() }

    // 6. Lost response: the final write commits but its response never arrives.
    resetCatalogue()
    { const id = await makeShow(owner, SET)
      const { ctx, pg } = await session(owner)
      let lost = 0
      await ctx.route(u => /\/rest\/v1\/performances\?/.test(u.toString()), async r => { if (r.request().method() === 'PATCH' && !lost) { lost++; await r.fetch(); return r.abort('failed') } return r.fallback() })
      await openReview(pg, id); await clickSave(pg); const c = await celebrated(pg); await pg.waitForTimeout(800)
      ok(`[lost response] the page confirms by reading back and celebrates; catalogue recorded exactly once`, lost === 1 && c && status(id) === 'complete' && markers(id) === 3 && rows() === 3, JSON.stringify({ lost, c, m: markers(id) }))
      await ctx.close() }

    // 7. Closing the page the moment success is confirmed (18 songs, 150ms per request).
    resetCatalogue()
    { const id = await makeShow(owner, Array.from({ length: 18 }, (_, i) => ({ title: 'Closing Song ' + (i + 1) })))
      const { ctx, pg } = await session(owner, { latency: 150 }); await openReview(pg, id); await clickSave(pg)
      await celebrated(pg); await pg.close(); await new Promise(r => setTimeout(r, 2500))
      ok(`[close at success] the page closed the moment the summary appeared: all 18 songs are in the catalogue (${markers(id)} markers, ${rows()} rows)`, markers(id) === 18 && rows() === 18)
      await ctx.close() }

    // 8. Imports: the setlist.fm import inserts complete shows (as the route does, with the user's session): nothing counted.
    resetCatalogue()
    { const anon = createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY); await anon.auth.signInWithPassword({ email: owner.email, password: owner.password })
      const { data: imp, error } = await anon.from('performances').insert({ user_id: owner.id, artist_name: 'Northern Lights', venue_name: 'Imported Hall', city: 'Toronto', status: 'complete', data_source: 'setlistfm_imported', started_at: new Date(Date.now() - 400 * DAY).toISOString() }).select('id').single()
      ok('[import] an imported complete show is inserted and nothing is counted (an insert doesn\'t fire the trigger)', !error && rows() === 0 && markers(imp.id) === 0, error && error.message)
      // That imported show later opened and saved from Review: counted, as the page does today.
      await svc.from('performance_songs').insert(SET.map((s, i) => ({ performance_id: imp.id, title: s.title, artist: 'Northern Lights', position: i + 1, source: 'manual', confusion_matrix_result: 'TBD' })))
      const { ctx, pg } = await session(owner); await openReview(pg, imp.id); await clickSave(pg); const c = await celebrated(pg); await pg.waitForTimeout(800)
      ok('[import] the imported show saved later from Review is counted (as today)', c && markers(imp.id) === 3, JSON.stringify(catalogue()))
      await ctx.close() }
  } finally { await b.close() }
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error('ERROR', e); process.exit(1) })
