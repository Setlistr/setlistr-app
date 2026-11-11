// Test-process-only stubs for the privacy candidate tests (load AFTER scripts/acr-stub-preload.js).
// Intercepts, in the Next server process:
//   - Supabase Storage on the local stack (/storage/v1/object/...): in-memory objects from STUB_STATE.objects,
//     with failRemove (remove call returns 500) and keepAfterRemove (remove "succeeds" but the object stays)
//   - api.resend.com: logged; STUB_STATE.resendFail makes it return 500
// Everything else falls through to the previous fetch (the ACR stub, which passes local hosts and rejects others).
// Anthropic is answered by a separate local server (ANTHROPIC_BASE_URL), since the SDK may not use global fetch.
const fs = require('fs')
const STATE = process.env.SVC_STUB_STATE_FILE, LOG = process.env.SVC_STUB_LOG_FILE
if (!STATE || !LOG) { console.error('[svc-stub] ABORT: SVC_STUB_STATE_FILE and SVC_STUB_LOG_FILE required'); process.exit(1) }
const read = () => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')) } catch { return { objects: {} } } }
const write = s => fs.writeFileSync(STATE, JSON.stringify(s, null, 1))
const log = e => fs.appendFileSync(LOG, JSON.stringify({ ...e, at: new Date().toISOString() }) + '\n')
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const prev = global.fetch

global.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const method = (init.method || (input && input.method) || 'GET').toUpperCase()
  let u; try { u = new URL(url) } catch { return prev(input, init) }

  if (u.hostname === 'api.resend.com') {
    const s = read(); const body = init.body ? JSON.parse(init.body) : null
    log({ svc: 'resend', to: body && body.to, subject: body && body.subject, text: body && body.text, ok: !s.resendFail })
    return s.resendFail ? json({ message: 'stubbed failure' }, 500) : json({ id: 'stub-email' })
  }

  const m = u.pathname.match(/^\/storage\/v1\/object\/(list\/)?([^/]+)\/?(.*)$/)
  if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost') && m) {
    const s = read(); s.objects = s.objects || {}
    const isList = !!m[1], bucket = m[2], rest = decodeURIComponent(m[3] || '')
    const body = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : null
    if (isList && method === 'POST') {
      const prefix = (body.prefix || '').replace(/\/$/, ''), search = body.search || ''
      const base = prefix ? `${bucket}/${prefix}/` : `${bucket}/`
      const names = Object.keys(s.objects).filter(k => k.startsWith(base) && !k.slice(base.length).includes('/')).map(k => k.slice(base.length))
        .filter(n => !search || n.includes(search))
      const offset = body.offset || 0, limit = body.limit || 100
      log({ svc: 'storage', op: 'list', bucket, prefix, search, count: names.length })
      return json(names.slice(offset, offset + limit).map(n => ({ name: n, id: `id-${n}`, metadata: {} })))
    }
    if (!isList && method === 'DELETE' && !rest) {
      const paths = body.prefixes || []
      log({ svc: 'storage', op: 'remove', bucket, paths })
      if (paths.some(p => (s.failRemove || []).includes(`${bucket}/${p}`))) return json({ statusCode: '500', error: 'stub', message: 'stubbed remove failure' }, 500)
      const removed = []
      for (const p of paths) { const k = `${bucket}/${p}`; if (s.objects[k] && !(s.keepAfterRemove || []).includes(k)) { delete s.objects[k]; removed.push({ name: p }) } }
      write(s); return json(removed)
    }
    if (!isList && (method === 'POST' || method === 'PUT') && rest) {
      s.objects[`${bucket}/${rest}`] = { size: 1 }; write(s); log({ svc: 'storage', op: 'upload', bucket, path: rest })
      return json({ Key: `${bucket}/${rest}`, Id: 'stub' })
    }
  }
  return prev(input, init)
}
console.log('[svc-stub] active: local Supabase Storage and api.resend.com stubbed')
