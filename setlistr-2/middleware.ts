import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { ADMIN_EMAILS } from '@/lib/admin-config'

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

  // Not logged in trying to access app — no invite check needed either way
  if (isAppRoute && !user) {
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

  // ── Root route: if logged in with access, skip marketing and go straight to app
  if (isRootRoute && user) {
    if (isAdmin || isInvited) {
      return withInviteCookie(NextResponse.redirect(new URL('/app/dashboard', request.url)), inviteToken)
    }
    // Not a beta user — let them see the landing page
    return withInviteCookie(supabaseResponse, inviteToken)
  }

  // Logged in — check access
  if (isAppRoute && user) {
    if (isAdmin || isInvited) {
      return withInviteCookie(supabaseResponse, inviteToken)
    }
    return withInviteCookie(NextResponse.redirect(new URL('/beta', request.url)), inviteToken)
  }

  // Logged in and has access — skip beta page
  if (isBetaPage && user) {
    if (isAdmin || isInvited) {
      return withInviteCookie(NextResponse.redirect(new URL('/app/dashboard', request.url)), inviteToken)
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
