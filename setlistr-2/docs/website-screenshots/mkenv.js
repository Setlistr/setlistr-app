// Writes local-stack.env (0600) for the catalog-disposable LOCAL stack: URL + anon/service JWTs signed
// with that stack's own local JWT secret. Nothing is printed.
const { execSync } = require('child_process'), crypto = require('crypto'), fs = require('fs')
const env = execSync('docker exec supabase_auth_setlistr-catalog-disposable env').toString()
const secret = (env.match(/^GOTRUE_JWT_SECRET=(.*)$/m) || [])[1]
if (!secret) { console.error('no secret'); process.exit(1) }
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = role => { const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ iss: 'supabase-demo', role, iat: 1700000000, exp: 2000000000 }); return `${h}.${p}.${crypto.createHmac('sha256', secret).update(h + '.' + p).digest('base64url')}` }
fs.writeFileSync(__dirname + '/local-stack.env', `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54621\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${jwt('anon')}\nSUPABASE_SERVICE_ROLE_KEY=${jwt('service_role')}\n`, { mode: 0o600 })
console.log('wrote local-stack.env')
