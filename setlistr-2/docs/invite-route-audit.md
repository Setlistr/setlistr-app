# Invite Route Audit

Follow-up to `docs/delegation-audit.md`, focused on `app/api/team/invite/route.ts`
and its surrounding auth surface. Read-only, `setlistr-2/`, from `main`
(confirmed up to date with `origin/main` at time of audit).

---

## 1. `app/api/team/invite/route.ts` — full contents

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://setlistr.ai'
const RESEND_API_KEY = process.env.RESEND_API_KEY

async function sendInviteEmail({
  to, artistName, inviteUrl, delegateFound,
}: {
  to: string
  artistName: string
  inviteUrl: string
  delegateFound: boolean
}) {
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email send')
    return
  }

  const subject = `${artistName} added you to their Setlistr account`

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; background: #0a0908; color: #f0ece3; padding: 40px 32px; border-radius: 16px;">
      <p style="font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #c9a84c; margin: 0 0 24px;">Setlistr</p>
      <h1 style="font-size: 24px; font-weight: 800; color: #f0ece3; margin: 0 0 12px; letter-spacing: -0.025em; line-height: 1.2;">
        ${artistName} invited you to their team
      </h1>
      <p style="font-size: 14px; color: #b8a888; margin: 0 0 24px; line-height: 1.6;">
        ${delegateFound
          ? `You've been added as a team member on ${artistName}'s Setlistr account. Accept to start managing their shows and royalty submissions.`
          : `${artistName} is using Setlistr to track live performance royalties. They'd like you to manage their account — capturing shows, reviewing setlists, and submitting to their PRO on their behalf.`
        }
      </p>
      <a href="${inviteUrl}" style="display: inline-block; background: #c9a84c; color: #0a0908; font-size: 14px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; text-decoration: none; padding: 16px 32px; border-radius: 12px; margin-bottom: 24px;">
        Accept Invite
      </a>
      <p style="font-size: 12px; color: #8a7a68; margin: 0 0 24px; line-height: 1.6;">
        Or copy this link: <span style="color: #b8a888;">${inviteUrl}</span>
      </p>
      <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.07); margin: 24px 0;" />
      <p style="font-size: 11px; color: #8a7a68; margin: 0;">
        Setlistr · Live performance royalty tracking · <a href="https://setlistr.ai" style="color: #c9a84c;">setlistr.ai</a>
      </p>
    </div>
  `

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Setlistr <invites@setlistr.ai>',
        to,
        subject,
        html,
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error('Resend error:', err)
    }
  } catch (err) {
    console.error('Email send failed:', err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { artist_id, delegate_email, role = 'manager' } = await req.json()

    if (!artist_id || !delegate_email) {
      return NextResponse.json({ error: 'artist_id and delegate_email required' }, { status: 400 })
    }

    const { data: artist } = await supabase
      .from('profiles')
      .select('artist_name, full_name')
      .eq('id', artist_id)
      .single()

    if (!artist) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 })
    }

    const artistDisplayName = artist.artist_name || artist.full_name || 'An artist'

    const { data: delegateUser } = await supabase
      .from('profiles')
      .select('id, artist_name, full_name')
      .eq('email', delegate_email.toLowerCase().trim())
      .maybeSingle()

    if (delegateUser) {
      const { data: existing } = await supabase
        .from('artist_delegates')
        .select('id, accepted_at, invite_token')
        .eq('artist_id', artist_id)
        .eq('delegate_id', delegateUser.id)
        .maybeSingle()

      if (existing?.accepted_at) {
        return NextResponse.json({ error: 'This person already has access to your account' }, { status: 409 })
      }

      if (existing) {
        const inviteUrl = `${BASE_URL}/app/accept-invite?token=${existing.invite_token}`
        await sendInviteEmail({ to: delegate_email, artistName: artistDisplayName, inviteUrl, delegateFound: true })
        return NextResponse.json({
          success: true,
          email_sent: !!RESEND_API_KEY,
          delegate_found: true,
          delegate_name: delegateUser.artist_name || delegateUser.full_name,
          invite_url: inviteUrl,
          already_exists: true,
        })
      }
    }

    const { data: delegate, error } = await supabase
      .from('artist_delegates')
      .insert(delegateUser ? {
        artist_id, delegate_id: delegateUser.id, role, invited_by: artist_id,
      } : {
        artist_id, delegate_id: artist_id, role, invited_by: artist_id,
      })
      .select('id, invite_token')
      .single()

    if (error || !delegate) {
      console.error('Delegate insert error:', error)
      return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
    }

    const inviteUrl = `${BASE_URL}/app/accept-invite?token=${delegate.invite_token}`

    await sendInviteEmail({
      to: delegate_email,
      artistName: artistDisplayName,
      inviteUrl,
      delegateFound: !!delegateUser,
    })

    return NextResponse.json({
      success: true,
      email_sent: !!RESEND_API_KEY,
      delegate_found: !!delegateUser,
      delegate_name: delegateUser?.artist_name || delegateUser?.full_name || null,
      invite_url: inviteUrl,
      invite_token: delegate.invite_token,
      invite_message: `${artistDisplayName} has invited you to their Setlistr account. Accept here: ${inviteUrl}`,
    })
  } catch (err) {
    console.error('Team invite error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
```

Confirmed on `main`, matches the copy quoted in `docs/delegation-audit.md` section 6
— no auth import, no `auth.getUser()` call anywhere in this file.

---

## 2. `app/api/team/accept/route.ts` — full contents

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET — look up invite by token, return context for the accept screen.
// Returns is_intended_recipient (computed server-side against the caller's
// own session) instead of the raw delegate_id — the client no longer needs
// to see the delegate_id itself to know whether it matches them.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const authSupabase = await createServerSupabaseClient()
  const { data: { user } } = await authSupabase.auth.getUser()

  const { data: invite } = await supabase
    .from('artist_delegates')
    .select('id, artist_id, delegate_id, role, accepted_at')
    .eq('invite_token', token)
    .maybeSingle()

  if (!invite) return NextResponse.json({ error: 'Invite not found or already used.' }, { status: 404 })

  // Get artist profile
  const { data: artist } = await supabase
    .from('profiles')
    .select('artist_name, full_name, email')
    .eq('id', invite.artist_id)
    .single()

  return NextResponse.json({
    id: invite.id,
    artist_id: invite.artist_id,
    is_intended_recipient: !!user && invite.delegate_id === user.id,
    role: invite.role,
    artist_name: artist?.artist_name || artist?.full_name || 'An artist',
    artist_email: artist?.email || '',
    already_accepted: !!invite.accepted_at,
  })
}

// POST — accept the invite, write accepted_at. Caller identity is derived
// from the verified session, never trusted from the request body.
export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json()
    if (!token) {
      return NextResponse.json({ error: 'token required' }, { status: 400 })
    }

    const authSupabase = await createServerSupabaseClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'You must be logged in to accept an invite.' }, { status: 401 })
    }

    // Look up the invite
    const { data: invite } = await supabase
      .from('artist_delegates')
      .select('id, artist_id, delegate_id, accepted_at')
      .eq('invite_token', token)
      .maybeSingle()

    if (!invite) return NextResponse.json({ error: 'Invite not found.' }, { status: 404 })
    if (invite.accepted_at) return NextResponse.json({ success: true, already_accepted: true })

    // Verify the accepting session matches the intended delegate
    if (invite.delegate_id !== user.id) {
      return NextResponse.json({ error: 'This invite was sent to a different account.' }, { status: 403 })
    }

    // Accept it
    const { error } = await supabase
      .from('artist_delegates')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invite.id)

    if (error) {
      console.error('Accept invite error:', error)
      return NextResponse.json({ error: 'Failed to accept invite.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Accept invite route error:', err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
```

Note: GET intentionally allows an unauthenticated caller through (`user` can be
`null`; `is_intended_recipient` just evaluates to `false`) — this is by design
for the accept-invite landing page, which needs to render invite context before
the visitor has necessarily logged in. POST hard-requires a session before
writing.

---

## 3. Strongest example of correct verification

**Chosen: `app/api/team/context-data/route.ts` (GET)**

Why this one over the other candidates in the delegation-audit section 6 table:
- `managed-artists` is trivially safe (filters by `delegate_id = user.id`
  directly, no `artist_id` param exists to attack) — it doesn't demonstrate
  *verification* so much as avoid needing any.
- `delegates` (GET/DELETE) verifies caller-is-artist (`user.id === artistId`),
  which is a real check but answers a different question ("do you own this
  delegate list") than "do you have delegated access to this artist."
- `song-debuts` does the same accepted-delegation check as `context-data`, but
  only conditionally (`if (userIdParam && userIdParam !== user.id)`), and only
  gates one field among several.
- `context-data` is the cleanest, most complete instance of the actual pattern
  this audit is about: authenticate the caller, then explicitly query
  `artist_delegates` for an **accepted** row matching `(artist_id, delegate_id:
  user.id)`, and refuse to proceed without it. It's also the route both
  correctly-delegation-aware client pages (`stats`, `career-map`) actually rely
  on for real data, making it the most consequential example if it were wrong.

Full contents (re-read fresh from `main`):

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  try {
    const artistId = req.nextUrl.searchParams.get('artist_id')
    if (!artistId) return NextResponse.json({ error: 'artist_id required' }, { status: 400 })

    // Verify requesting user is an accepted delegate for this artist
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: delegation } = await service
      .from('artist_delegates')
      .select('id, role')
      .eq('artist_id', artistId)
      .eq('delegate_id', user.id)
      .not('accepted_at', 'is', null)
      .maybeSingle()

    if (!delegation) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Get artist profile
    const { data: profile } = await service
      .from('profiles')
      .select('artist_name, full_name, bandsintown_artist_name, pro_affiliation, career_total_shows, career_start_year')
      .eq('id', artistId)
      .single()

    // Get performances
    const { data: perfsRaw } = await service
      .from('performances')
      .select(`id, venue_name, artist_name, city, country, status, submission_status, started_at, ended_at, created_at, shows ( show_type ), venues ( capacity )`)
      .eq('user_id', artistId)
      .order('created_at', { ascending: false })

    const performances = (perfsRaw || []).map((p: any) => ({
      id: p.id, venue_name: p.venue_name, artist_name: p.artist_name,
      city: p.city, country: p.country, status: p.status,
      submission_status: p.submission_status || null,
      started_at: p.started_at, ended_at: p.ended_at || null,
      created_at: p.created_at,
      show_type: p.shows?.show_type || 'single',
      venue_capacity: p.venues?.capacity || null,
    }))

    // Get song counts
    const perfIds = performances.map(p => p.id)
    let songCountMap: Record<string, number> = {}
    if (perfIds.length > 0) {
      const { data: songData } = await service
        .from('performance_songs')
        .select('performance_id')
        .in('performance_id', perfIds)
      songData?.forEach((s: any) => {
        songCountMap[s.performance_id] = (songCountMap[s.performance_id] || 0) + 1
      })
    }

    return NextResponse.json({
      artist_id: artistId,
      artist_name: profile?.artist_name || profile?.full_name || 'Unknown',
      bandsintown_artist_name: profile?.bandsintown_artist_name || null,
      pro_affiliation: profile?.pro_affiliation || null,
      career_total_shows: profile?.career_total_shows || null,
      career_start_year: profile?.career_start_year || null,
      role: delegation.role,
      performances,
      songCountMap,
    })
  } catch (err) {
    console.error('Context data error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
```

---

## 4. `app/api/admin/assign-delegate/route.ts` — full contents + how it establishes admin

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ADMIN_EMAILS } from '@/lib/admin-config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const authSupabase = await createServerSupabaseClient()
  const { data: { user } } = await authSupabase.auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const { artist_id, delegate_id, role = 'manager' } = await req.json()
    if (!artist_id || !delegate_id) {
      return NextResponse.json({ error: 'artist_id and delegate_id required' }, { status: 400 })
    }

    // Check if already exists
    const { data: existing } = await supabase
      .from('artist_delegates')
      .select('id, accepted_at')
      .eq('artist_id', artist_id)
      .eq('delegate_id', delegate_id)
      .maybeSingle()

    if (existing?.accepted_at) {
      return NextResponse.json({ success: true, message: 'Already assigned' })
    }

    if (existing) {
      // Pending invite — just accept it
      await supabase
        .from('artist_delegates')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', existing.id)
      return NextResponse.json({ success: true, message: 'Existing invite accepted' })
    }

    // Create fresh — pre-accepted, no invite flow needed
    const { error } = await supabase
      .from('artist_delegates')
      .insert({
        artist_id,
        delegate_id,
        role,
        invited_by: artist_id,
        accepted_at: new Date().toISOString(), // pre-accept — superadmin bypass
      })

    if (error) {
      console.error('assign-delegate error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

**How admin status is established (lines 12-16):**
```ts
  const authSupabase = await createServerSupabaseClient()
  const { data: { user } } = await authSupabase.auth.getUser()
  if (!user || !ADMIN_EMAILS.includes(user.email ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
```
It's a session lookup (`createServerSupabaseClient` + `auth.getUser()`) followed
by a plain string-membership check against the `ADMIN_EMAILS` array imported
from `lib/admin-config.ts` — no role column, no database-side admin flag, no
Supabase custom claim. The same hardcoded allowlist pattern used everywhere
else "admin" is checked in this repo (`middleware.ts`, other `app/api/admin/*`
routes).

---

## 5. Middleware coverage of `/api/team/*`

Only one `middleware.ts` in the repo: `setlistr-2/middleware.ts`.

Full matcher config (lines 121-128):
```ts
export const config = {
  // Added '/' so middleware runs on the root route for beta user redirect.
  // Only '/auth/login' (not all of '/auth/:path*') gets the "redirect logged-in
  // users away" treatment — otherwise a logged-in user opening a password
  // recovery link at /auth/reset-password would get bounced to the dashboard
  // before they could set a new password.
  matcher: ['/', '/app/:path*', '/auth/login', '/beta'],
}
```

**`/api/team/*` (including `/api/team/invite`) falls entirely outside this
matcher.** The matcher list is exactly four entries — `/`, `/app/:path*`,
`/auth/login`, `/beta` — none of which match anything under `/api/`. This
middleware never runs on any API route in the app, so it provides zero
protection for `app/api/team/invite/route.ts` or any other `/api/*` handler.
Whatever auth a given API route has is entirely whatever that route implements
itself — which, per section 1, is nothing at all for the invite route.

No nested `middleware.ts` files exist anywhere else in the repo (confirmed via
repo-wide filename search, excluding `node_modules`).

---

## 6. Does the invite route send email?

Yes — via Resend, called from the `sendInviteEmail` helper defined in the same
file (`app/api/team/invite/route.ts`), lines 52-65:

```ts
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Setlistr <invites@setlistr.ai>',
        to,
        subject,
        html,
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error('Resend error:', err)
    }
  } catch (err) {
    console.error('Email send failed:', err)
  }
```

Guarded by an env-var presence check right above it (lines 20-23):
```ts
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email send')
    return
  }
```
`RESEND_API_KEY` itself is read once at module scope: `const RESEND_API_KEY =
process.env.RESEND_API_KEY` (line 10). `sendInviteEmail` is called twice in the
route — once for the "existing pending invite" branch (line 115) and once for
the "brand new invite" branch (lines 144-149).

---

## 7. `createServerSupabaseClient` export signature + usage example

**`lib/supabase/server.ts`** — full contents:
```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
       setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

**Exact signature:** `export async function createServerSupabaseClient()` —
no parameters, returns a `Promise` (implicitly wrapping whatever
`createServerClient(...)` returns, since the function body itself is `async`
and does `return createServerClient(...)` — a plain non-Promise value, so the
function's actual return type is `Promise<ReturnType<typeof createServerClient>>`).
Because of the `async` keyword, **callers must `await` it** even though nothing
inside the function body otherwise appears asynchronous except the
`await cookies()` call on line 5.

**Example of a route awaiting it correctly** —
`app/api/team/context-data/route.ts:16`:
```ts
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
```
Same pattern in `app/api/team/accept/route.ts:18` and `:56`, and
`app/api/admin/assign-delegate/route.ts:12`.
