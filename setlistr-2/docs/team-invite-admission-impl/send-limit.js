// Which limit refuses code sends, and with what error code. Direct to the disposable auth server. Prints no codes.
const path = require('path'), fs = require('fs')
const ENVF = process.argv[2]
const { createClient } = require(path.join('/Users/jesseslack/setlistr-manager-workspace/setlistr-2', 'node_modules/@supabase/supabase-js'))
const env = Object.fromEntries(fs.readFileSync(ENVF, 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
if (!/^http:\/\/127\.0\.0\.1:54621/.test(env.NEXT_PUBLIC_SUPABASE_URL)) process.exit(1)
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anon = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
;(async () => {
  const T0 = Date.now().toString(36), out = {}, emails = []
  for (let i = 0; i < 34; i++) { const e = `sendlim-${i}-${T0}@example.test`; await admin.auth.admin.createUser({ email: e, password: 'Pw-x-Aa1x9-lim', email_confirm: true }); emails.push(e) }
  const same = await anon().auth.signInWithOtp({ email: emails[0], options: { shouldCreateUser: false } })
  const again = await anon().auth.signInWithOtp({ email: emails[0], options: { shouldCreateUser: false } })
  out['same address twice'] = `${again.error?.status} ${again.error?.code}`
  const res = []
  for (const e of emails.slice(1)) { const r = await anon().auth.signInWithOtp({ email: e, options: { shouldCreateUser: false } }); res.push(r.error ? `${r.error.status} ${r.error.code}` : 'sent') }
  const g = {}; res.forEach((r, i) => { g[r] = g[r] || []; g[r].push(i + 2) })
  out['33 more distinct addresses (send # in order)'] = Object.fromEntries(Object.entries(g).map(([k, v]) => [k, `${v.length} (#${v[0]}–#${v[v.length - 1]})`]))
  console.log(JSON.stringify(out, null, 1)); fs.writeFileSync(path.join(__dirname, 'send-limit-results.json'), JSON.stringify(out, null, 1))
})()
