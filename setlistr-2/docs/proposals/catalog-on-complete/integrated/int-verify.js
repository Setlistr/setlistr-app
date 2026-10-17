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
const base = 'http://127.0.0.1:3105'
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
  async function session(user, { latency = 0 } = {}) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
    await ctx.addInitScript(([uid, ownerId, acting]) => { try { if (acting) localStorage.setItem('setlistr_acting_as:' + uid, JSON.stringify({ artist_id: ownerId, artist_name: 'Northern Lights' })) } catch {} }, [user.id, owner.id, user.id !== owner.id])
    if (latency) await ctx.route(u => u.toString().startsWith(SUPA), async r => { await new Promise(res => setTimeout(res, latency)); return r.fallback() })
    const pg = await ctx.newPage()
    // The sign-in page re-renders on the client after a pre-existing hydration warning; sign in once it's interactive.
    for (let attempt = 0; attempt < 3; attempt++) {
      await pg.goto(base + '/auth/login'); await pg.waitForLoadState('networkidle').catch(() => {}); await pg.waitForTimeout(2500)
      await pg.fill('#auth-email', user.email); await pg.fill('#auth-password', user.password); await pg.press('#auth-password', 'Enter')
      if (await pg.waitForURL(x => !x.pathname.startsWith('/auth'), { timeout: 30000 }).then(() => true, () => false)) break
    }
    if (new URL(pg.url()).pathname.startsWith('/auth')) throw new Error('sign-in did not complete for ' + user.email)
    return { ctx, pg }
  }
  async function openReview(pg, id) { await pg.goto(base + `/app/review/${id}?source=live`); await pg.waitForFunction(() => /save & complete/i.test(document.body.innerText), null, { timeout: 90000 }); await pg.waitForTimeout(500) }
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

    // 5. The catalogue fails: completion is rejected, earlier edits stay, a retry completes it.
    resetCatalogue()
    { const id = await makeShow(owner, SET)
      SQL(`alter table user_songs add constraint zz_fail check (song_title <> 'Low Tide');`)
      const { ctx, pg } = await session(owner); await openReview(pg, id)
      await pg.getByText('Paper Boats', { exact: true }).click(); await pg.getByPlaceholder('Song title').fill('Paper Boats (Edited)'); await pg.getByPlaceholder('Song title').press('Enter'); await pg.waitForTimeout(300)
      await clickSave(pg)
      await pg.waitForFunction(() => /Reference: /.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {})
      const t = await pg.locator('body').innerText(), ref = (t.match(/Reference: [^\n]+/) || [''])[0]
      const titles = SQL(`select string_agg(title, ', ' order by position) from performance_songs where performance_id = '${id}'`)
      ok(`[catalogue failure] completion rejected with a clear error (${ref}); show still in review; no partial catalogue`, /mark the show complete · 23514/.test(ref) && status(id) === 'review' && markers(id) === 0 && rows() === 0, JSON.stringify({ ref, s: status(id), m: markers(id) }))
      ok('[catalogue failure] the earlier edit is saved (Paper Boats (Edited))', /Paper Boats \(Edited\)/.test(titles), titles)
      SQL(`alter table user_songs drop constraint zz_fail;`)
      await clickSave(pg); const c = await celebrated(pg); await pg.waitForTimeout(800)
      const n = +SQL(`select count(*) from performance_songs where performance_id = '${id}'`)
      ok('[retry] saving again completes it; catalogue recorded once; no duplicate songs', c && status(id) === 'complete' && markers(id) === 3 && rows() === 3 && n === 3, JSON.stringify({ c, s: status(id), m: markers(id), r: rows(), n }))
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
