import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// ── Hardcoded admin safety net ────────────────────────────────────────────────
// These emails always have access regardless of DB state.
// Protects against being locked out if the beta_invites table is empty or broken.
const ADMIN_EMAILS = [
  'jesse.slack.music@gmail.com',
  'darylscottsongs@gmail.com',
  'koderoberts@gmail.com',
]

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

  const isAppRoute  = request.nextUrl.pathname.startsWith('/app')
  const isAuthRoute = request.nextUrl.pathname.startsWith('/auth')
  const isBetaPage  = request.nextUrl.pathname === '/beta'

  // Not logged in trying to access app
  if (isAppRoute && !user) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  // Logged in — check access
  if (isAppRoute && user) {
    const email = user.email ?? ''

    // Admins always get through
    if (ADMIN_EMAILS.includes(email)) {
      return supabaseResponse
    }

    // Check beta_invites table
    const { data: invite } = await supabase
      .from('beta_invites')
      .select('id')
      .eq('email', email)
      .single()

    if (!invite) {
      // Not invited — mark accepted_at if they were just added while browsing
      return NextResponse.redirect(new URL('/beta', request.url))
    }

    // Mark accepted_at if first time through
    if (invite) {
      await supabase
        .from('beta_invites')
        .update({ accepted_at: new Date().toISOString() })
        .eq('email', email)
        .is('accepted_at', null)
    }

    return supabaseResponse
  }

  // Logged in and has access — skip beta page
  if (isBetaPage && user) {
    const email = user.email ?? ''
    if (ADMIN_EMAILS.includes(email)) {
      return NextResponse.redirect(new URL('/app/dashboard', request.url))
    }
    const { data: invite } = await supabase
      .from('beta_invites')
      .select('id')
      .eq('email', email)
      .single()
    if (invite) {
      return NextResponse.redirect(new URL('/app/dashboard', request.url))
    }
  }

  // Logged in hitting auth pages — go to dashboard
  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL('/app/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/app/:path*', '/auth/:path*', '/beta'],
}
