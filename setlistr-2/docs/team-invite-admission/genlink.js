const fs = require('fs'), { execSync } = require('child_process')
const { createClient } = require('/Users/jesseslack/setlistr-manager-workspace/setlistr-2/node_modules/@supabase/supabase-js')
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
if (!/^http:\/\/127\.0\.0\.1:54621/.test(env.NEXT_PUBLIC_SUPABASE_URL)) process.exit(1)
const o = { auth: { persistSession: false } }, f = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, o), admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, o)
const SQL = q => execSync('docker exec -i supabase_db_setlistr-catalog-disposable psql -U postgres -At', { input: q }).toString().trim()
const MP = 'http://127.0.0.1:54625/api/v1'
;(async () => {
  await fetch(`${MP}/messages`, { method: 'DELETE' })
  const E = `gen-${Date.now().toString(36)}@example.test`, N = `gennone-${Date.now().toString(36)}@example.test`
  const su = await f().auth.signUp({ email: E, password: 'Pw-gen-Aa1x9' })
  const g = await admin.auth.admin.generateLink({ type: 'magiclink', email: E })
  const otp = g.data?.properties?.email_otp
  await new Promise(r => setTimeout(r, 1500))
  const sent = (await (await fetch(`${MP}/search?query=to:${encodeURIComponent(E)}`)).json()).messages?.length || 0
  console.log('generateLink: code returned to server =', /^\d{6}$/.test(otp || ''), '| emails sent by Supabase =', sent)
  const v = await f().auth.verifyOtp({ email: E, token: otp, type: 'email' })
  console.log('verify that code (type email):', v.error ? `rejected ${v.error.status} ${v.error.message}` : `valid, same user=${v.data.user.id === su.data.user.id}`)
  const before = SQL(`select count(*) from auth.users where email = '${N}'`)
  const gn = await admin.auth.admin.generateLink({ type: 'magiclink', email: N })
  console.log('generateLink for an address with no account:', gn.error ? `refused (${gn.error.status})` : 'returned a link', '| account created =', SQL(`select count(*) from auth.users where email = '${N}'`) !== before)
})()
