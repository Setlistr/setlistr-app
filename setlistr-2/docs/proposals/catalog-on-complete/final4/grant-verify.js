// Verifies the proposed revoke of administrative table privileges (TRUNCATE, TRIGGER, REFERENCES,
// MAINTAIN) from anon/authenticated on the DISPOSABLE stack: privileges before and after, each
// operation refused after, service_role and DML unchanged, the client path unchanged, and the rollback.
// node grant-verify.js <repo>
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
const MIG = path.join(__dirname, '..', 'catalog')
const TABLES = ['user_songs', 'user_song_performances', 'performance_songs']
const ADMIN = ['TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN'], DML = ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
const privs = (roles, tables, list) => SQL(`select string_agg(r || ':' || t || ':' || p || '=' || has_table_privilege(r, ('public.' || t)::regclass, p), ' ' order by r, t, p)
  from unnest(array[${roles.map(r => `'${r}'`)}]) r, unnest(array[${tables.map(t => `'${t}'`)}]) t, unnest(array[${list.map(p => `'${p}'`)}]) p`).split(' ')
const all = (arr, v) => arr.length > 0 && arr.every(x => x.endsWith('=' + (v === 't' ? 'true' : 'false')))
// Each operation as a client role, inside a transaction that is always rolled back.
const asClient = (role, q) => SQLerr(`begin; set local role ${role}; ${q}; rollback;`)

;(async () => {
  console.log('\n— Before the revoke (production state, preflight Run 3)')
  ok('[before] anon and authenticated hold TRUNCATE, TRIGGER, REFERENCES and MAINTAIN on the three tables', all(privs(['anon', 'authenticated'], TABLES, ADMIN), 't'))
  ok('[before] …and none of them on performances (0010)', all(privs(['anon', 'authenticated'], ['performances'], ADMIN), 'f'))

  const ACL0 = SQL(`select string_agg(relname || '=' || relacl::text, ' ' order by relname) from pg_class where oid in ('public.user_songs'::regclass, 'public.user_song_performances'::regclass, 'public.performance_songs'::regclass, 'public.performances'::regclass)`)
  SQL(fs.readFileSync(path.join(MIG, 'admin-privileges-migration.sql'), 'utf8'))
  console.log('\n— After the revoke')
  ok('[after] anon and authenticated hold none of the four administrative privileges on the three tables', all(privs(['anon', 'authenticated'], TABLES, ADMIN), 'f'))
  ok('[after] their SELECT/INSERT/UPDATE/DELETE are unchanged (still governed by RLS)', all(privs(['anon', 'authenticated'], TABLES, DML), 't'))
  ok('[after] service_role keeps every privilege', all(privs(['service_role'], TABLES, [...DML, ...ADMIN]), 't'))
  for (const t of TABLES) {
    const r = { truncate: asClient('authenticated', `truncate public.${t}`), trigger: asClient('authenticated', `create trigger zz_check before insert on public.${t} for each row execute function public.reject_performance_owner_change()`), maintain: asClient('authenticated', `analyze public.${t}`) }
    ok(`[after] authenticated is refused on ${t}: TRUNCATE (${r.truncate}), CREATE TRIGGER (${r.trigger})`, /permission denied/.test(r.truncate || '') && /permission denied|must be owner/.test(r.trigger || ''))
  }
  ok('[after] service_role can still TRUNCATE (rolled back)', asClient('service_role', 'truncate public.user_songs') === null)

  console.log('\n— The client path is unchanged')
  { const email = 'gv-owner@example.test', password = 'Pw-gv-owner-Aa1x9'
    const { data } = await svc.auth.admin.createUser({ email, password, email_confirm: true })
    const c = createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }); await c.auth.signInWithPassword({ email, password })
    const i = await c.from('user_songs').insert({ user_id: data.user.id, song_title: 'Grant Check', confirmed_count: 1 }).select('id').single()
    const u = await c.from('user_songs').update({ confirmed_count: 2 }).eq('id', i.data && i.data.id).select('id')
    const s = await c.from('user_songs').select('id').eq('user_id', data.user.id)
    const d = await c.from('user_songs').delete().eq('id', i.data && i.data.id).select('id')
    ok('[client] a signed-in artist\'s own insert, update, read and delete through PostgREST still work', !i.error && !u.error && u.data.length === 1 && !s.error && !d.error && d.data.length === 1, JSON.stringify([i.error, u.error, s.error, d.error]))
  }

  console.log('\n— Rollback')
  SQL(fs.readFileSync(path.join(MIG, 'admin-privileges-rollback.sql'), 'utf8'))
  // Production before the change (Runs 3 + 4): all four administrative privileges plus DML on the three tables; none on performances.
  ok('[rollback] TRUNCATE, TRIGGER, REFERENCES and MAINTAIN are restored on the three tables, as Runs 3 and 4 found them', all(privs(['anon', 'authenticated'], TABLES, ADMIN), 't'))
  ok('[rollback] DML unchanged; performances still has none of the four (as Run 4 found)', all(privs(['anon', 'authenticated'], TABLES, DML), 't') && all(privs(['anon', 'authenticated'], ['performances'], ADMIN), 'f'))
  ok('[rollback] the full table ACLs equal the pre-change snapshot exactly', SQL(`select string_agg(relname || '=' || relacl::text, ' ' order by relname) from pg_class where oid in ('public.user_songs'::regclass, 'public.user_song_performances'::regclass, 'public.performance_songs'::regclass, 'public.performances'::regclass)`) === ACL0)
  SQL(fs.readFileSync(path.join(MIG, 'admin-privileges-migration.sql'), 'utf8'))
  ok('[re-apply] the revoke applies cleanly again', all(privs(['anon', 'authenticated'], TABLES, ADMIN), 'f'))

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error('ERROR', e); process.exit(1) })
