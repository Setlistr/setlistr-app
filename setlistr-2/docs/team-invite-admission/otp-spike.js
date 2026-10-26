// Inbox-proof spike against the DISPOSABLE auth server only. Prints no keys, tokens or codes.
const path = require('path'), fs = require('fs'), { execSync } = require('child_process')
const REPO = '/Users/jesseslack/setlistr-manager-workspace/setlistr-2'
const { createClient } = require(path.join(REPO, 'node_modules/@supabase/supabase-js'))
const env = Object.fromEntries(fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const URL = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
if (!/^http:\/\/127\.0\.0\.1:54621/.test(URL)) { console.error('REFUSING: not the disposable stack'); process.exit(1) }
const SQL = q => execSync('docker exec -i supabase_db_setlistr-catalog-disposable psql -U postgres -At -v ON_ERROR_STOP=1', { input: q }).toString().trim()
const MP = 'http://127.0.0.1:54625/api/v1'
const fresh = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } })
const R = []; const rec = (k, ok, note) => { R.push({ k, ok, note }); console.log(ok ? '  ok  ' : '  NOTE', k, note ? '— ' + note : '') }
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function mail(to) { for (let i = 0; i < 20; i++) { const m = await (await fetch(`${MP}/search?query=to:${encodeURIComponent(to)}`)).json(); if (m.messages?.length) { const id = m.messages[0].ID; const full = await (await fetch(`${MP}/message/${id}`)).json(); return { count: m.messages.length, subject: full.Subject, text: full.Text || '', html: full.HTML || '' } } await sleep(300) } return null }
const codeIn = t => (t.match(/\b(\d{6})\b/) || [])[1]
;(async () => {
  await fetch(`${MP}/messages`, { method: 'DELETE' })
  const T = Date.now().toString(36), X = `proof-${T}@example.test`, Y = `other-${T}@example.test`, U = `nobody-${T}@example.test`, PW = 'Pw-proof-Aa1x9-spike'

  console.log('— A. Sign-up with "confirm email" off')
  const cx = fresh(); const su = await cx.auth.signUp({ email: X, password: PW })
  const xId = su.data.user.id
  rec('signUp signs in immediately and stamps email_confirmed_at with no email sent', !!su.data.session && !!su.data.user.email_confirmed_at && !(await mail(X)), 'so email_confirmed_at is NOT inbox proof')
  const cy = fresh(); await cy.auth.signUp({ email: Y, password: PW })

  console.log('— B. No account creation')
  const before = SQL(`select count(*) from auth.users where email = '${U}'`)
  const b = await fresh().auth.signInWithOtp({ email: U, options: { shouldCreateUser: false } })
  rec('shouldCreateUser:false refuses an unknown address, creates nothing, sends nothing', !!b.error && SQL(`select count(*) from auth.users where email = '${U}'`) === before && !(await mail(U)), `error="${b.error?.message}" status=${b.error?.status}`)

  console.log('— C. Code sent to an existing account')
  const idsBefore = SQL(`select count(*) from auth.identities where user_id = '${xId}'`)
  const s1 = await fresh().auth.signInWithOtp({ email: X, options: { shouldCreateUser: false } })
  const m1 = await mail(X); const code1 = m1 && codeIn(m1.text)
  rec('code email arrives for the existing account', !s1.error && !!code1, `subject="${m1?.subject}"`)
  const hasLink = /https?:\/\/\S+verify\S*/.test(m1?.text || '') || /href="[^"]*verify/.test(m1?.html || '')
  rec('default template ALSO contains a sign-in link', hasLink, hasLink ? 'clicking it would consume the code and land on SITE_URL: production template must be code-only' : 'code only')
  const again = await fresh().auth.signInWithOtp({ email: X, options: { shouldCreateUser: false } })
  rec('an immediate second request is throttled', !!again.error, `error="${again.error?.message}" status=${again.error?.status}`)

  console.log('— D. Server-side verification')
  const bad = await fresh().auth.verifyOtp({ email: X, token: code1 === '000000' ? '111111' : '000000', type: 'email' })
  rec('wrong code rejected', !!bad.error, `status=${bad.error?.status} "${bad.error?.message}"`)
  const v = fresh(); const ok = await v.auth.verifyOtp({ email: X, token: code1, type: 'email' })
  rec('correct code verified by the auth server for that account', !ok.error && ok.data.user?.id === xId && ok.data.user?.email === X, `same id=${ok.data.user?.id === xId} email unchanged=${ok.data.user?.email === X}`)
  rec('verification created no account and changed no identity', SQL(`select count(*) from auth.identities where user_id = '${xId}'`) === idsBefore && SQL(`select email from auth.users where id = '${xId}'`) === X)
  const claims = await v.auth.getClaims()
  const amr = claims.data?.claims?.amr
  rec('server-verifiable claims (getClaims, JWKS-checked) show amr', Array.isArray(amr), `amr=${JSON.stringify((amr || []).map(a => a.method))} alg=${claims.data?.header?.alg} session_id present=${!!claims.data?.claims?.session_id}`)
  const reuse = await fresh().auth.verifyOtp({ email: X, token: code1, type: 'email' })
  rec('a used code cannot be used again', !!reuse.error, `status=${reuse.error?.status}`)

  console.log('— E. Cross-account and freshness')
  await sleep(61000)
  await fresh().auth.signInWithOtp({ email: Y, options: { shouldCreateUser: false } }); const codeY = codeIn((await mail(Y))?.text || '')
  const cross = await fresh().auth.verifyOtp({ email: X, token: codeY, type: 'email' })
  rec("another account's code does not verify this account", !!cross.error, `status=${cross.error?.status}`)
  await fetch(`${MP}/messages`, { method: 'DELETE' })
  await fresh().auth.signInWithOtp({ email: X, options: { shouldCreateUser: false } }); const code2 = codeIn((await mail(X))?.text || '')
  SQL(`update auth.users set recovery_sent_at = now() - interval '2 hours', confirmation_sent_at = now() - interval '2 hours' where id = '${xId}'; update auth.one_time_tokens set created_at = now() - interval '2 hours' where user_id = '${xId}'`)
  const old = await fresh().auth.verifyOtp({ email: X, token: code2, type: 'email' })
  rec('a code older than the OTP expiry is rejected', !!old.error, `status=${old.error?.status} "${old.error?.message}" (expiry here = GOTRUE_MAILER_OTP_EXP 3600s)`)

  console.log('— F. Discarding the verification session')
  const sess = ok.data.session; if (!sess) throw new Error('no verification session')
  const so = await admin.auth.admin.signOut(sess.access_token, 'local')
  const refresh = await fresh().auth.refreshSession({ refresh_token: sess.refresh_token })
  rec("the session created by verification can be revoked at once (admin signOut 'local')", !so.error && !!refresh.error, `refresh after revoke: ${refresh.error?.status}`)
  const orig = await cx.auth.getUser()
  rec("the user's original password session is unaffected", !orig.error && orig.data.user.id === xId)
  const pwClaims = await cx.auth.getClaims()
  rec('a password session reports amr=password (so amr distinguishes them)', JSON.stringify((pwClaims.data?.claims?.amr || []).map(a => a.method)) === '["password"]', `amr=${JSON.stringify((pwClaims.data?.claims?.amr || []).map(a => a.method))}`)

  fs.writeFileSync(path.join(path.dirname(process.argv[1]), 'otp-spike-results.json'), JSON.stringify(R, null, 1))
})().catch(e => { console.error('ERROR', e.message); process.exit(1) })
