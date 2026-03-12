import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const BETA_EMAILS = [
  'darylscottsongs@gmail.com',
  'jesse.slack.music@gmail.com',
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

  const isAppRoute = request.nextUrl.pathname.startsWith('/app')
  const isAuthRoute = request.nextUrl.pathname.startsWith('/auth')
  const isBetaPage = request.nextUrl.pathname === '/beta'

  // Not logged in trying to access app
  if (isAppRoute && !user) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  // Logged in but not on allowlist
  if (isAppRoute && user && !BETA_EMAILS.includes(user.email ?? '')) {
    return NextResponse.redirect(new URL('/beta', request.url))
  }

  // Logged in and on allowlist — skip beta page
  if (isBetaPage && user && BETA_EMAILS.includes(user.email ?? '')) {
    return NextResponse.redirect(new URL('/app/dashboard', request.url))
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
