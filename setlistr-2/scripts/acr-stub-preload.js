// Test-process-only network interception for /api/identify's and
// /api/upload-identify's recognition provider calls. Loaded via
// `node --require` when starting the dev server for authorization testing
// — NOT part of the app bundle, NOT reachable in production, and does not
// modify either route's scoring, thresholds, or any recognition logic. It
// substitutes the RAW HTTP RESPONSE from the upstream ACRCloud/MusicBrainz
// hosts during a local test run only.
//
// ALLOWLIST MODEL — no "unknown host passes through" default:
//   - PROVIDER_HOSTS: stubbed unconditionally, always, never a real call.
//   - LOCAL_HOSTS: passed through to the real fetch (the local Supabase
//     stack this test run itself talks to).
//   - Anything else: REJECTED — the fetch itself throws, rather than
//     silently reaching a real, unexpected outbound destination. A test
//     run that unintentionally tries to call something else entirely
//     fails loudly instead of quietly succeeding against a real host.
//
// ABORTS STARTUP (not a silent no-op) if ACR_STUB_STATE_FILE or
// ACR_STUB_CALL_LOG_FILE isn't set — loading this preload without telling
// it what to do is itself a misconfiguration worth failing on immediately,
// not falling back to "everything passes through unstubbed."
//
// OPTIONAL: ACR_STUB_CAPTURE_ID_LOG_FILE. When set, every LOCAL_HOSTS
// passthrough response is inspected (via response.clone(), so the app's
// own response is never altered) and, for requests that match ALL of:
// exact origin === process.env.NEXT_PUBLIC_SUPABASE_URL's origin, exact
// pathname === '/rest/v1/audio_captures', method POST, and a successful
// (2xx) status — any inserted row id(s) found in the JSON body are
// appended to CAPTURE_ID_LOG_FILE. This exists so a test harness can
// recover the EXACT database-confirmed id a specific request's insert
// produced, without relying on timestamps or a global before/after
// row-count diff for cleanup targeting — see
// scripts/test-upload-identify-authorization.ts, whose route writes
// audio_captures with show_id/artist_id always null by design, leaving
// no other column to scope a delete by.
//
// VERIFIABLE, NOT SILENT: a matched request with no id in its response, a
// response body that fails to parse as JSON, or a failure writing the
// success line itself, is NEVER dropped silently — each is both
// console.error'd AND appended to a sibling `${CAPTURE_ID_LOG_FILE}.errors`
// file (best-effort; if that write also fails, the console.error is the
// only remaining trace). A test harness reading the capture-id log is
// expected to also check for this errors file and fail loudly if it's
// non-empty, rather than treating "no id logged" as merely "no capture
// happened." Origin is read from process.env.NEXT_PUBLIC_SUPABASE_URL
// lazily, per request (not at module load) — `node --require` runs this
// file before Next.js's own .env.local bootstrap, so that var is not yet
// populated at module-load time but is reliably populated by the time any
// request is actually being served. Purely additive/observational when
// CAPTURE_ID_LOG_FILE is unset: zero behavior change from before.

const fs = require('fs')

const STATE_FILE = process.env.ACR_STUB_STATE_FILE
const CALL_LOG_FILE = process.env.ACR_STUB_CALL_LOG_FILE
const CAPTURE_ID_LOG_FILE = process.env.ACR_STUB_CAPTURE_ID_LOG_FILE || null
const CAPTURE_ID_ERROR_LOG_FILE = CAPTURE_ID_LOG_FILE ? `${CAPTURE_ID_LOG_FILE}.errors` : null

if (!STATE_FILE || !CALL_LOG_FILE) {
  console.error('[acr-stub-preload] ABORTING: ACR_STUB_STATE_FILE and ACR_STUB_CALL_LOG_FILE must both be set.')
  console.error('[acr-stub-preload] Loading this preload with no stub configuration is a misconfiguration, not a no-op.')
  process.exit(1)
}

const PROVIDER_HOSTS = ['identify-us-west-2.acrcloud.com', 'musicbrainz.org']
const LOCAL_HOSTS = ['127.0.0.1', 'localhost']

// Correctly resolves a hostname out of every input shape global fetch()
// actually accepts: a plain string, a URL instance, or a Request instance
// (or anything duck-typed like one, via .url). Previously only handled
// string | { url } — a real URL instance has no .url property (.href
// instead) and would have fallen through to the empty-string branch,
// silently NOT matching any host check.
function hostnameOf(input) {
  try {
    if (typeof input === 'string') return new URL(input).hostname
    if (input instanceof URL) return input.hostname
    if (typeof Request !== 'undefined' && input instanceof Request) return new URL(input.url).hostname
    if (input && typeof input.url === 'string') return new URL(input.url).hostname
  } catch { /* unparseable -> falls through to '' below, which matches no host */ }
  return ''
}
function urlStringOf(input) {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  if (input && typeof input.url === 'string') return input.url
  return String(input)
}
function methodOf(input, init) {
  if (init && typeof init.method === 'string') return init.method.toUpperCase()
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method.toUpperCase()
  return 'GET'
}

// Lazy (per-call, not module-load) — see header comment for why.
function expectedSupabaseOrigin() {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').origin
  } catch {
    return null
  }
}

function recordCaptureIdError(entry) {
  console.error('[acr-stub-preload] capture-id logging problem (not silently dropped):', entry)
  try {
    fs.appendFileSync(CAPTURE_ID_ERROR_LOG_FILE, JSON.stringify(entry) + '\n')
  } catch (writeErr) {
    console.error('[acr-stub-preload] ALSO failed writing to the capture-id errors file — only this console line records it:', writeErr)
  }
}
function recordCaptureIdSuccess(entry) {
  try {
    fs.appendFileSync(CAPTURE_ID_LOG_FILE, JSON.stringify(entry) + '\n')
  } catch (writeErr) {
    recordCaptureIdError({ reason: 'log_write_failed', detail: String(writeErr), attemptedEntry: entry, at: new Date().toISOString() })
  }
}

const realFetch = global.fetch

global.fetch = async (input, init) => {
  const hostname = hostnameOf(input)
  const url = urlStringOf(input)

  if (PROVIDER_HOSTS.includes(hostname)) {
    fs.appendFileSync(CALL_LOG_FILE, JSON.stringify({ url, hostname, at: new Date().toISOString() }) + '\n')

    if (hostname === 'musicbrainz.org') {
      // Non-blocking enrichment lookup — always "nothing found," never a
      // real external call during tests. enrichFromMusicBrainz() already
      // handles an empty/no-match response gracefully (its own || defaults).
      return new Response(JSON.stringify({ recordings: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }

    // ACRCloud. NO REAL-PROVIDER FALLBACK: even if the state file is
    // missing, unreadable, or malformed, this returns a safe stubbed
    // "no result" response — it never falls through to realFetch for a
    // provider host under any circumstance.
    let stubbed = { status: { code: 1001, msg: 'No result' } }
    try {
      const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
      if (state && state.response) stubbed = state.response
    } catch { /* state file missing/invalid -> safe default above, still stubbed, never real */ }
    return new Response(JSON.stringify(stubbed), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  if (LOCAL_HOSTS.includes(hostname)) {
    const response = await realFetch(input, init)
    if (CAPTURE_ID_LOG_FILE && methodOf(input, init) === 'POST' && response.status >= 200 && response.status < 300) {
      let parsedUrl = null
      try { parsedUrl = new URL(url) } catch { /* unparseable -> not a candidate path either */ }
      // Path-scoped first, independent of origin verifiability, so an
      // unrelated local POST (auth, profiles, whatever else) never
      // generates origin-config noise — only a request that's ALREADY
      // targeting this exact endpoint gets held to the origin check.
      if (parsedUrl && parsedUrl.pathname === '/rest/v1/audio_captures') {
        const expectedOrigin = expectedSupabaseOrigin()
        if (!expectedOrigin) {
          recordCaptureIdError({ reason: 'missing_supabase_origin_config', url, at: new Date().toISOString() })
        } else if (parsedUrl.origin !== expectedOrigin) {
          recordCaptureIdError({ reason: 'origin_mismatch', url, expectedOrigin, at: new Date().toISOString() })
        } else {
          try {
            const rows = await response.clone().json()
            const list = Array.isArray(rows) ? rows : [rows]
            if (list.length === 0) {
              recordCaptureIdError({ reason: 'empty_response_body', url, at: new Date().toISOString() })
            }
            for (const row of list) {
              if (row && typeof row.id === 'string' && row.id) {
                recordCaptureIdSuccess({ id: row.id, at: new Date().toISOString() })
              } else {
                recordCaptureIdError({ reason: 'missing_id', row, url, at: new Date().toISOString() })
              }
            }
          } catch (parseErr) {
            recordCaptureIdError({ reason: 'parse_error', detail: String(parseErr), url, at: new Date().toISOString() })
          }
        }
      }
    }
    return response
  }

  // Anything else is an unexpected outbound destination during a
  // controlled test run — reject rather than silently allow it through.
  throw new Error(`[acr-stub-preload] REJECTED unexpected outbound fetch to "${hostname || '(unparseable)'}" (${url}). Only ${PROVIDER_HOSTS.join(', ')} (stubbed) and ${LOCAL_HOSTS.join(', ')} (passed through) are permitted during a stub-interception test run.`)
}

console.log(`[acr-stub-preload] active — provider hosts stubbed: ${PROVIDER_HOSTS.join(', ')}; local hosts passed through: ${LOCAL_HOSTS.join(', ')}; everything else rejected (state: ${STATE_FILE}, log: ${CALL_LOG_FILE}${CAPTURE_ID_LOG_FILE ? `, capture id log: ${CAPTURE_ID_LOG_FILE}, capture id errors: ${CAPTURE_ID_ERROR_LOG_FILE}` : ''})`)
