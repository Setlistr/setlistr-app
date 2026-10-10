import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { ADMIN_EMAILS } from '@/lib/admin-config'
import { sanitizeNextPath } from '@/lib/nextPathGuard'

// ── Hardcoded admin safety net ────────────────────────────────────────────────
// Admins always have access regardless of DB state — protects against being
// locked out if the beta_invites table is empty or broken. Same list now
// gates both admin-panel/API access and this beta-gate bypass, so every
// admin automatically skips the beta gate too.

// ── Invite cache cookie ──────────────────────────────────────────────────────
// Caches the single fact "this email is invited" across all three branches
// below (root, /app/*, /beta) that otherwise each ran their own beta_invites
// SELECT — this was hitting MIDDLEWARE_INVOCATION_TIMEOUT under load. Signed
// with HMAC-SHA256 via Web Crypto (Node's `crypto` module isn't available on
// the Edge runtime middleware runs on) so it can't be forged — a client can
// set any cookie value it wants, but can't produce a signature without
// MIDDLEWARE_COOKIE_SECRET, which never leaves the server. If that env var
// isn't set, signing/verifying both no-op to "no cached decision" and every
// request falls back to the real DB check — never errors, never locks
// anyone out.
const INVITE_COOKIE      = 'sl_beta_ok'
const INVITE_TTL_SECONDS = 60 * 60 // 1 hour — revocation latency matters more than round trips during soft launch

function base64UrlEncode(bytes: Uint8Array): string {
  let str = ''
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i])
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + (4 - (str.length % 4)) % 4, '=')
  const bin = atob(padded)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function getHmacKey(): Promise<CryptoKey | null> {
  const secret = process.env.MIDDLEWARE_COOKIE_SECRET
  if (!secret) return null
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

// Signs { email, exp } into an opaque, tamper-evident cookie value. Returns
// null (no cookie to set) if MIDDLEWARE_COOKIE_SECRET isn't configured.
async function signInviteToken(email: string): Promise<string | null> {
  const key = await getHmacKey()
  if (!key) return null

  const payload   = JSON.stringify({ email, exp: Date.now() + INVITE_TTL_SECONDS * 1000 })
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(payload))
  const signature  = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64))
  const sigB64      = base64UrlEncode(new Uint8Array(signature))

  return `${payloadB64}.${sigB64}`
}

// Verifies the cookie's signature, expiry, and that its email matches the
// CURRENT session's user.email — a cookie issued for one account must not
// grant access after a logout/login as a different account on the same
// browser. Returns false (treat as cache miss) for anything invalid,
// expired, mismatched, or if no secret is configured.
async function verifyInviteToken(request: NextRequest, email: string): Promise<boolean> {
  const key = await getHmacKey()
  if (!key) return false

  const raw = request.cookies.get(INVITE_COOKIE)?.value
  if (!raw) return false

  const [payloadB64, sigB64] = raw.split('.')
  if (!payloadB64 || !sigB64) return false

  let signatureBytes: Uint8Array
  try {
    signatureBytes = base64UrlDecode(sigB64)
  } catch {
    return false
  }

  const valid = await crypto.subtle.verify(
    'HMAC', key, signatureBytes as BufferSource, new TextEncoder().encode(payloadB64)
  )
  if (!valid) return false

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64))) as { email?: string; exp?: number }
    if (payload.email !== email) return false
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return false
    return true
  } catch {
    return false
  }
}

// Attaches a freshly-signed invite cookie to whatever response is actually
// being returned — redirects create a new NextResponse distinct from
// supabaseResponse, so this has to run at every return point, not just
// once on supabaseResponse, or a redirecting request would resolve the
// invite check but never actually deliver the cookie to the browser.
function withInviteCookie(response: NextResponse, inviteToken: string | null): NextResponse {
  if (inviteToken) {
    response.cookies.set(INVITE_COOKIE, inviteToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: INVITE_TTL_SECONDS,
      path: '/',
    })
  }
  return response
}

// ── Pending team-invite cookie ────────────────────────────────────────────
// Not to be confused with INVITE_COOKIE above (the beta-gate cache) — this
// holds a Setlistr team-invite token (artist_delegates.invite_token) for a
// user who followed a real invite link but isn't beta-admitted yet. Without
// this, hitting /app/accept-invite while un-admitted falls straight into
// the generic /beta redirect below and the token is gone for good — a dead
// end for a legitimate invite, not a security boundary being enforced (beta
// admission itself is never bypassed; only WHERE to resume afterward is
// preserved). Only ever set FROM /app/accept-invite and only ever consumed
// to redirect back TO it — never trusted for anything else.
const PENDING_INVITE_COOKIE = 'sl_pending_team_invite'
const PENDING_INVITE_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days — generous; this only ever gates where a now-admitted user lands next, not access itself
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getPendingInviteToken(request: NextRequest): string | null {
  const raw = request.cookies.get(PENDING_INVITE_COOKIE)?.value
  return raw && UUID_RE.test(raw) ? raw : null
}

function withPendingInviteCookie(response: NextResponse, token: string | null): NextResponse {
  if (token && UUID_RE.test(token)) {
    response.cookies.set(PENDING_INVITE_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: PENDING_INVITE_TTL_SECONDS,
      path: '/',
    })
  }
  return response
}

function clearPendingInviteCookie(response: NextResponse): NextResponse {
  response.cookies.set(PENDING_INVITE_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 0, path: '/' })
  return response
}

// ── Recovering a pending invite without a token in the URL ─────────────────
// The cookie above is seeded ONLY by an actual visit to
// /app/accept-invite?token=... — it has no way to help a recipient who
// logs in ordinarily (no `next`, no invite link in this browser session at
// all). Demonstrated locally: an account with a genuinely pending invite,
// logging in via a bare /auth/login with no prior cookie, lands on /beta
// showing the generic copy — not because anything is broken, but because
// nothing ever looks past the cookie.
//
// This is the narrow fix: when the session is authenticated, not yet
// admitted, and carries no pending-invite cookie, fall back to a direct
// lookup by the session's own verified email — never trusted from the
// request, same identity-equality discipline as every other write path in
// this codebase. Requires the service-role client: artist_delegates' RLS
// select policy is auth.uid() IN (artist_id, delegate_id), and a still-
// pending invite's delegate_id is NULL (or the legacy artist_id
// placeholder) — never yet equal to the recipient's own uid — so the
// anon-key client `supabase` above, bound to THIS session, cannot see it
// at all. This only ever feeds the SAME existing cookie-based display/
// resume mechanism (withPendingInviteCookie above) — it does not accept
// anything, grant access, or touch beta admission. Approval still
// happens exactly as before, and app/api/team/accept/route.ts still
// independently re-validates the recipient's email before allowing
// acceptance, unchanged.
async function findPendingInviteTokenByEmail(email: string): Promise<string | null> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return null
  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
  const { data } = await service
    .from('artist_delegates')
    .select('invite_token')
    .eq('invited_email', email.toLowerCase())
    .is('accepted_at', null)
    .is('declined_at', null)
    .is('revoked_at', null)
    .order('invited_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.invite_token ?? null
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isRootRoute = request.nextUrl.pathname === '/'
  const isAppRoute  = request.nextUrl.pathname.startsWith('/app')
  const isAuthRoute = request.nextUrl.pathname.startsWith('/auth')
  const isBetaPage  = request.nextUrl.pathname === '/beta'

  // Not logged in trying to access app — no invite check needed either way.
  //
  // This redirect runs on the very FIRST hop for a cold click on the
  // original team-invite email link (https://.../app/accept-invite?token=
  // ...) when the recipient has no session yet — i.e. the common case, not
  // an edge case. Without the narrow exception below, the Setlistr invite
  // token in the URL is discarded right here, before accept-invite's own
  // client-side "preserve it through login" logic (app/app/accept-invite/
  // page.tsx) ever gets a chance to run — that page never even renders,
  // since this is a server-side redirect. Scoped to exactly
  // /app/accept-invite, not a general "preserve any /app/* destination"
  // change: every other /app/* route keeps the exact same bare redirect
  // as before, and this still requires full authentication either way —
  // only WHERE to land afterward is preserved, nothing about whether auth
  // is required.
  if (isAppRoute && !user) {
    if (request.nextUrl.pathname === '/app/accept-invite') {
      const destination = sanitizeNextPath(request.nextUrl.pathname + request.nextUrl.search)
      if (destination) {
        const loginUrl = new URL('/auth/login', request.url)
        loginUrl.searchParams.set('next', destination)
        return NextResponse.redirect(loginUrl)
      }
    }
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  // ── Resolve admin + invited status once, shared across root/app/beta ─────
  // Only computed when one of the three branches that need it will actually
  // run — no point checking on /auth/login.
  let isAdmin      = false
  let isInvited    = false
  let inviteToken: string | null = null

  if (user && (isRootRoute || isAppRoute || isBetaPage)) {
    const email = user.email ?? ''
    isAdmin = ADMIN_EMAILS.includes(email)

    if (!isAdmin) {
      isInvited = await verifyInviteToken(request, email)

      if (!isInvited) {
        // Cache miss — this is the only place the beta_invites SELECT (and,
        // conditionally, the accepted_at UPDATE) still runs.
        const { data: invite } = await supabase
          .from('beta_invites')
          .select('id, accepted_at')
          .eq('email', email)
          .single()

        if (invite) {
          isInvited = true

          // accepted_at now only gets written on a cache miss that actually
          // finds a row — previously ran unconditionally on every request.
          if (!invite.accepted_at) {
            await supabase
              .from('beta_invites')
              .update({ accepted_at: new Date().toISOString() })
              .eq('email', email)
              .is('accepted_at', null)
          }

          inviteToken = await signInviteToken(email)
        }
      }
    }
  }

  // Only matters once we know the user is NOT yet admitted — an admitted
  // user never needs this, and the lookup is skipped entirely if a
  // pending-invite cookie is already present (the common case: the
  // recipient actually followed the invite link in this browser session,
  // which already seeds the cookie below, same as always).
  let fallbackPendingToken: string | null = null
  if (user && !isAdmin && !isInvited && (isAppRoute || isBetaPage) && !getPendingInviteToken(request)) {
    fallbackPendingToken = await findPendingInviteTokenByEmail(user.email ?? '')
  }

  // ── Root route: if logged in with access, skip marketing and go straight to app
  if (isRootRoute && user) {
    if (isAdmin || isInvited) {
      const pending = getPendingInviteToken(request)
      const dest = pending ? `/app/accept-invite?token=${pending}` : '/app/dashboard'
      const res = NextResponse.redirect(new URL(dest, request.url))
      return withInviteCookie(pending ? clearPendingInviteCookie(res) : res, inviteToken)
    }
    // Not a beta user — let them see the landing page
    return withInviteCookie(supabaseResponse, inviteToken)
  }

  // Logged in — check access
  if (isAppRoute && user) {
    if (isAdmin || isInvited) {
      // Clear the pending-invite cookie the moment accept-invite is actually
      // reached, however the user got here (direct nav, not only the /beta
      // resume path below) — otherwise a stale cookie from an invite that's
      // since been accepted or revoked would resurrect it on a later visit
      // to / or /beta, since those branches blindly redirect to it whenever
      // the cookie is present. Reaching accept-invite at all means the
      // cookie's one job (not losing the invite) is done.
      const res = request.nextUrl.pathname === '/app/accept-invite' && getPendingInviteToken(request)
        ? clearPendingInviteCookie(supabaseResponse)
        : supabaseResponse
      return withInviteCookie(res, inviteToken)
    }
    const betaRedirect = NextResponse.redirect(new URL('/beta', request.url))
    // The token in the URL (only meaningful on /app/accept-invite itself)
    // takes priority when present; otherwise fall back to the email
    // lookup above — covers an ordinary login landing on ANY /app/* route
    // (e.g. /app/dashboard), not just a direct hit on accept-invite.
    const urlToken = request.nextUrl.pathname === '/app/accept-invite' ? request.nextUrl.searchParams.get('token') : null
    const tokenToPersist = urlToken || fallbackPendingToken
    const withBeta = tokenToPersist ? withPendingInviteCookie(betaRedirect, tokenToPersist) : betaRedirect
    return withInviteCookie(withBeta, inviteToken)
  }

  // Logged in and has access — skip beta page, resuming a pending team
  // invite if that's what sent them to /beta in the first place.
  if (isBetaPage && user) {
    if (isAdmin || isInvited) {
      const pending = getPendingInviteToken(request)
      const dest = pending ? `/app/accept-invite?token=${pending}` : '/app/dashboard'
      const res = NextResponse.redirect(new URL(dest, request.url))
      return withInviteCookie(pending ? clearPendingInviteCookie(res) : res, inviteToken)
    }
    // Not admitted, landed on /beta directly (not via the redirect above)
    // — e.g. a bookmark, or returning here after an earlier visit. A
    // cookie set on THIS response can't retroactively change what this
    // same render already decided, so if the email lookup just found a
    // pending invite that the cookie hadn't captured yet, redirect to
    // this exact page again with the cookie attached — one extra hop,
    // but the very next render (this time carrying the cookie) shows the
    // invitation-aware copy correctly instead of waiting for some later,
    // unrelated visit to happen to set it first.
    if (fallbackPendingToken) {
      const res = NextResponse.redirect(new URL('/beta', request.url))
      return withInviteCookie(withPendingInviteCookie(res, fallbackPendingToken), inviteToken)
    }
  }

  // Logged in hitting auth pages — go to dashboard
  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/app/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  // Added '/' so middleware runs on the root route for beta user redirect.
  // Only '/auth/login' (not all of '/auth/:path*') gets the "redirect logged-in
  // users away" treatment — otherwise a logged-in user opening a password
  // recovery link at /auth/reset-password would get bounced to the dashboard
  // before they could set a new password.
  matcher: ['/', '/app/:path*', '/auth/login', '/beta'],
}
