'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, Send, TrendingUp, Calendar, ArrowLeft } from 'lucide-react'
import Image from 'next/image'
import type { Profile } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { tapNav, tapRecord } from '@/lib/haptics'
import { useActingAs } from '@/components/ActingAsProvider'
import { WorkspaceGate } from '@/components/WorkspaceGate'
import { ManagerShell } from '@/components/layout/ManagerShell'
import { AccountMenu } from '@/components/layout/AccountMenu'
import { APP_HEADER_HEIGHT, APP_HEADER_PADDING_TOP } from '@/components/layout/appHeaderInsets'
import { WorkspaceRoleProvider, useWorkspaceRoleState } from '@/components/layout/WorkspaceRole'
import { useState, useEffect } from 'react'

// Set by app/app/manager/artists/[artistId]/page.tsx right before it
// selects a managed workspace and navigates into an existing artist-facing
// flow (history/file/review/submit) — namespaced to the specific artistId
// it applies to so it can never resurface a stale "Back to Manager" pill
// after the ordinary dashboard switcher (unrelated to Manager) later acts
// as a DIFFERENT managed artist. Exported so that page and this one agree
// on the exact key without a copy-pasted string literal.
export const MANAGER_RETURN_KEY = 'setlistr_manager_return_artist_id'

const FULLSCREEN_ROUTES = ['/app/live/']

const GRAIN_URI = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E")`

// Tab geometry shared by both sides of the capture disc: 65px tall,
// sentence-case 11px labels (Apple's minimum) in a colour that clears 4.5:1.
const TAB_STYLE: React.CSSProperties = {
  flex: 1, height: 65, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
  fontSize: 11, letterSpacing: '0.02em', textDecoration: 'none', position: 'relative', WebkitTapHighlightColor: 'transparent',
}
// Under heavy zoom a label wider than its fifth of the bar truncates
// rather than running into its neighbour; it never shrinks below 11px.
const TAB_LABEL: React.CSSProperties = { lineHeight: 1, maxWidth: '100%', padding: '0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const TAB_INDICATOR: React.CSSProperties = { position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', width: 22, height: 2, borderRadius: 1, background: 'var(--sl-gold-text)' }

// Desktop (900px and wider): a 248px sidebar (ManagerShell's width) holds
// the logo, the capture control and the four destinations; the same single
// header becomes the 72px top bar holding identity. One header and one
// AccountMenu at every width — so "open the account menu" always means the
// visible one. Below 900px nothing here applies and the mobile frame is
// exactly as reviewed.
export const DESKTOP_MIN_WIDTH = 900
const SIDEBAR_WIDTH = 248
const SIDE_ITEM: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, padding: '0 12px', borderRadius: 10,
  fontSize: 15, textDecoration: 'none', position: 'relative',
}

export function AppShell({ children, profile }: { children: React.ReactNode; profile: Profile }) {
  const pathname = usePathname()
  const router = useRouter()
  const { actingAsArtistId, resolved, isBlocked, returnToOwnWorkspace } = useActingAs()
  const [needsReviewCount, setNeedsReviewCount] = useState(0)
  const [managerReturnArtistId, setManagerReturnArtistId] = useState<string | null>(null)

  // No real workspace to act within — see the fuller note where the nav is
  // built below. Computed up here so the role state can load before any
  // early return.
  const hasWorkspace = !!profile.artist_name?.trim() || !!actingAsArtistId
  const workspaceRole = useWorkspaceRoleState(actingAsArtistId ?? null, hasWorkspace)
  // Capture is offered only where the signed-in person can actually record
  // into this workspace: own workspace, or a known write-capable team role.
  // A Viewer — or anyone whose role hasn't loaded yet — gets no capture
  // control at any width (the database refuses their writes regardless).
  const canCapture = workspaceRole.canWrite

  const isFullscreen = FULLSCREEN_ROUTES.some(r => pathname.startsWith(r))
  const isManagerRoute = pathname.startsWith('/app/manager')

  // sessionStorage read is client-only — guarded to a mount-time effect so
  // this never runs during server rendering. Re-checked on every navigation
  // (pathname change) so the pill appears the instant a manager-originated
  // flow link lands, without waiting for an unrelated re-render.
  useEffect(() => {
    try { setManagerReturnArtistId(sessionStorage.getItem(MANAGER_RETURN_KEY)) } catch { setManagerReturnArtistId(null) }
  }, [pathname])

  function backToManager() {
    try { sessionStorage.removeItem(MANAGER_RETURN_KEY) } catch {}
    returnToOwnWorkspace()
    router.push('/app/manager/artists')
  }

  useEffect(() => {
    if (!profile?.id || !resolved) return
    const supabase = createClient()
    async function fetchCount() {
      try {
        // 'review' is the real status value (draft → live → processing →
        // review → complete) — 'needs_review' never occurs as a stored
        // status, so this count silently returned 0 always. Now that the
        // Submissions tab lands on the Filing Queue, a badge that never
        // lights up defeats the point of pointing it there.
        const { count } = await supabase
          .from('performances_visible')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', actingAsArtistId || profile.id)
          .eq('status', 'review')
        setNeedsReviewCount(count ?? 0)
      } catch {
        setNeedsReviewCount(0)
      }
    }
    fetchCount()
  }, [pathname, profile?.id, actingAsArtistId, resolved])

  // Manager routes are checked BEFORE the acting-as isBlocked gate below —
  // Manager Overview/Artists operate across MULTIPLE authorized artists at
  // once via RLS directly (see lib/managerFetch.ts) and never depend on, or
  // set, a single acting-as artist selection. A stale/failed single-artist
  // selection left over from an earlier session must never block entry
  // into Manager mode, which has nothing to do with it. (Artist Detail,
  // app/app/manager/artists/[artistId]/page.tsx, is the one manager page
  // that DOES eventually call selectManagedArtist() — only at the moment
  // it hands off into an existing artist-facing flow, never for its own
  // rendering.)
  if (isManagerRoute) return <ManagerShell profile={profile}>{children}</ManagerShell>

  // Central workspace boundary — deliberately checked BEFORE the fullscreen
  // branch below, so it covers every route rendered through this shell,
  // including /app/live/ (protected capture code, never itself modified —
  // this is the "proven parent boundary" that fails it closed without
  // touching app/app/live/[id]/page.tsx: that page only mounts as
  // `children` here, so it simply never mounts while isBlocked is true).
  // WorkspaceGate itself renders the resolving spinner AND the
  // verification_failed/unauthorized recovery card, branching internally
  // on `state.status` — nothing else in this component needs to know which
  // of the three blocked states it is.
  if (isBlocked) return <WorkspaceGate />

  if (isFullscreen) return <>{children}</>

  const initials = (profile.full_name || profile.email)
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  // No real workspace to act within: neither a real artist identity
  // (profile.artist_name set) nor an actively selected managed artist
  // (actingAsArtistId). Submissions/Career/Schedule and the record button
  // all imply "for this workspace" — showing them here previously let a
  // user with no artist identity and no connections (e.g. a team-only
  // delegate whose last connection was removed, or a brand-new user before
  // completing onboarding) tap record and silently create a real,
  // ownerless performance under their bare account (RLS allows it — see
  // this repo's own performances_own policy, user_id = auth.uid() is
  // always permitted; not a privilege-escalation gap, just a capability
  // that implies a workspace which doesn't exist). A real delegate with an
  // active connection is never caught by this: they're routed to
  // /app/manager (a different shell entirely, isManagerRoute above) the
  // moment they land without a selection, and once they DO select a
  // managed artist, actingAsArtistId is set and the full nav returns.

  // Submissions previously landed on /app/history (Your Record — the full
  // searchable log, submitted shows included), while carrying a
  // needsReviewCount badge that only makes sense for a to-do surface. That
  // mismatch is exactly what /app/file (Filing Queue) is for: unfinished,
  // actionable shows only, same badge concept, and it links back to Your
  // Record for anyone who wants the full history. Your Record itself is
  // unchanged and still reachable from there.
  // activePaths beyond the tab's own href: Submissions now covers both
  // /app/file (Filing Queue, where it lands) and /app/history (Full
  // History, one tap away via the switcher at the top of either page) —
  // the tab must stay lit on both, not just the one it navigates to.
  const LEFT_NAV = [
    { href: '/app/dashboard', icon: LayoutDashboard, label: 'Home',        badge: 0, activePaths: ['/app/dashboard'] },
    ...(hasWorkspace ? [{ href: '/app/file', icon: Send, label: 'Submissions', badge: needsReviewCount, activePaths: ['/app/file', '/app/history'] }] : []),
  ]
  // Exactly 5 bottom-bar positions total: Home, Submissions, [capture],
  // Career, Schedule — Profile moved to the account menu in the header
  // (AccountMenu below). Keeping this at 2 items restores the original
  // 2-2 symmetry the absolutely-positioned center capture button assumes;
  // a 3rd item here is what caused it to visually collide.
  const RIGHT_NAV = hasWorkspace ? [
    { href: '/app/stats',    icon: TrendingUp, label: 'Career',   badge: 0 },
    { href: '/app/schedule', icon: Calendar,   label: 'Schedule', badge: 0 },
  ] : []

  const isNavActive = (href: string, activePaths?: string[]) =>
    (activePaths || [href]).some(p => pathname === p || (p !== '/app/dashboard' && pathname.startsWith(p)))
  const SIDE_NAV = [...LEFT_NAV, ...RIGHT_NAV.map(t => ({ ...t, activePaths: [t.href] }))]

  return (
    <WorkspaceRoleProvider value={workspaceRole}>
    <div className="sl-shell" style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column', background: 'var(--sl-bg)' }}>

      {/* ── Desktop sidebar (hidden below DESKTOP_MIN_WIDTH) ── */}
      <aside className="sl-sidebar" aria-label="Main" style={{
        display: 'none', position: 'fixed', top: 0, bottom: 0, left: 0, width: SIDEBAR_WIDTH, zIndex: 45,
        flexDirection: 'column', gap: 22, overflowY: 'auto',
        padding: 'calc(28px + env(safe-area-inset-top, 0px)) 16px calc(20px + env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px))',
        background: 'var(--sl-sidebar-bg)', borderRight: '1px solid var(--sl-line)',
      }}>
        <Link href="/app/dashboard" aria-label="Setlistr home" style={{ display: 'flex', alignItems: 'center', minHeight: 44, alignSelf: 'flex-start', padding: '0 8px', textDecoration: 'none' }}>
          <Image className="sl-logo-for-dark" src="/logo-white-tight.png" alt="Setlistr" width={100} height={19} style={{ height: 19, width: 100 }} />
          <Image className="sl-logo-for-light" src="/logo-dark-tight.png" alt="Setlistr" width={100} height={19} style={{ height: 19, width: 100 }} />
        </Link>

        {/* The same gold disc and round dot as the phone's capture button,
            same destination and action — just labelled, since a laptop is
            rarely where a set gets captured. */}
        {canCapture && (
          <Link href="/app/show/new" onClick={tapRecord} className="sl-hoverable" aria-label="Capture a show"
            style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 64, padding: '6px', borderRadius: 16, textDecoration: 'none' }}>
            <span aria-hidden="true" style={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid var(--sl-sidebar-bg)', background: 'linear-gradient(180deg, #d4b45c 0%, #b8963e 100%)', boxShadow: 'var(--sl-disc-shadow)' }}>
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#0a0908' }} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: 'var(--sl-text)' }}>Capture a show</span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--sl-text-3)', marginTop: 1 }}>Usually from your phone</span>
            </span>
          </Link>
        )}

        <nav aria-label="Sections" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {SIDE_NAV.map(item => {
            const active = isNavActive(item.href, item.activePaths)
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={active ? undefined : 'sl-hoverable'}
                style={{ ...SIDE_ITEM, background: active ? 'var(--sl-nav-active)' : 'transparent', color: active ? 'var(--sl-gold-text)' : 'var(--sl-text-2)', fontWeight: active ? 700 : 500 }}>
                <Icon size={20} strokeWidth={active ? 2.3 : 1.8} style={{ flexShrink: 0 }} />
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                {item.badge > 0 && <span aria-label="Needs review" style={{ marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%', background: 'var(--sl-gold)', flexShrink: 0 }} />}
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* ── Header — logo, plus a Back to Manager pill when this acting-as
           session was entered from Manager mode ── */}
      {/* Compact 56px wherever the top safe-area inset is 0 (Safari,
          landscape); with a top inset, controls sit in a 44px row below it —
          see appHeaderInsets.ts for why the band beside the cutout isn't used.
          Side insets: landscape clearance, 0 in Safari. */}
      {/* Identity lives here, on every page: the workspace name, the
          signed-in team member's role there, and the avatar — all one
          button that opens the existing AccountMenu. */}
      <header className="sl-header" style={{
        height: APP_HEADER_HEIGHT,
        padding: `${APP_HEADER_PADDING_TOP} max(8px, env(safe-area-inset-right, 0px)) 0 max(20px, env(safe-area-inset-left, 0px))`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        position: 'sticky', top: 0, zIndex: 40,
        background: 'var(--sl-header-bg)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        flexShrink: 0,
      }}>
        {/* The tight wordmark files (no transparent padding), so the 44px
            link is the tap target and nothing invisible overhangs content. */}
        <Link href="/app/dashboard" aria-label="Setlistr home" className="sl-header-logo" style={{ display: 'flex', alignItems: 'center', height: 44, flexShrink: 0, textDecoration: 'none' }}>
          <Image className="sl-logo-for-dark" src="/logo-white-tight.png" alt="Setlistr" width={85} height={16} priority style={{ height: 16, width: 85 }} />
          <Image className="sl-logo-for-light" src="/logo-dark-tight.png" alt="Setlistr" width={85} height={16} style={{ height: 16, width: 85 }} />
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flex: 1, minWidth: 0 }}>
          {/* Only ever true for a user who (a) manages at least one artist,
              (b) opened this exact artist's flow from Artist Detail, and (c)
              is still acting as that same artist — invisible to every other
              user and every other existing flow, including a plain dashboard-
              switcher session acting as a different artist. */}
          {actingAsArtistId && managerReturnArtistId === actingAsArtistId && (
            <button onClick={backToManager} style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, minHeight: 44, background: 'none', border: 'none', borderRadius: 20, padding: '0 6px', color: 'var(--sl-gold-text)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>
              <ArrowLeft size={14} /> Manager
            </button>
          )}
          <AccountMenu profile={profile} hasWorkspace={hasWorkspace} />
        </div>
      </header>

      {/* Grain layer — fixed noise texture over all shell surfaces, excluded from fullscreen routes */}
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 100, pointerEvents: 'none', backgroundImage: GRAIN_URI, backgroundRepeat: 'repeat', opacity: 'var(--sl-grain-opacity)' as unknown as number }} />

      {/* ── Main content ── */}
      {/* The fixed bottom nav's own real height is minHeight:64 + its
         internal padding + env(safe-area-inset-bottom) — on any iPhone
         with a home-indicator safe area (effectively all current models),
         that total can exceed a flat 96px, so the last ~10-40px of a
         page's own content sits behind the nav rather than above it. This
         is what made Upload Performance's "Continue to Review" button (and
         potentially any other page's trailing content) end up covered.
         Matching the nav's own safe-area term here, instead of a flat
         number, is what actually clears it on every device. */}
      {/* Side insets: 0 in Safari; in the native iOS app (landscape) they keep
          page content clear of the sensor housing — pages keep their own gutters. */}
      {/* --sl-page-min-height: the space between the header and the bottom
          nav's clearance. Pages that want to fill the screen (centred
          loaders, empty states) use it instead of 100svh — 100svh inside
          this padded column always overflowed by the header plus the nav
          clearance, so every short page scrolled for no reason. */}
      <main className="sl-main" style={{
        flex: 1, paddingBottom: 'calc(96px + env(safe-area-inset-bottom))', paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)',
        ['--sl-page-min-height' as string]: `calc(100svh - ${APP_HEADER_HEIGHT} - 96px - env(safe-area-inset-bottom, 0px))`,
      } as React.CSSProperties}>{children}</main>

      {/* ── Bottom nav ── */}
      {/* 65px of tabs, then the home-indicator inset below them. */}
      <nav aria-label="Main" className="sl-tabbar" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
        background: 'var(--sl-nav-bg)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        borderTop: '1px solid var(--sl-line)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        <div style={{ position: 'relative', display: 'flex', maxWidth: 480, margin: '0 auto' }}>

          {/* Left two tabs */}
          {LEFT_NAV.map((tab) => {
            const isActive = tab.activePaths.some(p => pathname === p || (p !== '/app/dashboard' && pathname.startsWith(p)))
            const Icon = tab.icon
            return (
              <Link key={tab.href} href={tab.href} onClick={tapNav} aria-current={isActive ? 'page' : undefined} style={{ ...TAB_STYLE, color: isActive ? 'var(--sl-gold-text)' : 'var(--sl-text-3)', fontWeight: isActive ? 700 : 600 }}>
                {tab.badge > 0 && (
                  <div style={{ position: 'absolute', top: 9, right: '50%', transform: 'translateX(14px)', width: 7, height: 7, borderRadius: '50%', background: 'var(--sl-gold)', border: '1.5px solid var(--sl-bg)' }} />
                )}
                <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                <span style={TAB_LABEL}>{tab.label}</span>
                {isActive && <div style={TAB_INDICATOR} />}
              </Link>
            )
          })}

          {/* Center placeholder — reserves space for the raised button */}
          <div style={{ flex: 1 }} />

          {/* Right two tabs */}
          {RIGHT_NAV.map((tab) => {
            const isActive = pathname === tab.href || pathname.startsWith(tab.href)
            const Icon = tab.icon
            return (
              <Link key={tab.href} href={tab.href} onClick={tapNav} aria-current={isActive ? 'page' : undefined} style={{ ...TAB_STYLE, color: isActive ? 'var(--sl-gold-text)' : 'var(--sl-text-3)', fontWeight: isActive ? 700 : 600 }}>
                <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                <span style={TAB_LABEL}>{tab.label}</span>
                {isActive && <div style={TAB_INDICATOR} />}
              </Link>
            )
          })}

          {/* Raised center capture button — absolutely positioned, floats above
              nav. Never shown with no real workspace to record into (see
              hasWorkspace above) — it would otherwise silently create a real,
              ownerless performance under a bare account with no artist
              identity. */}
          {canCapture && (
            <Link
              href="/app/show/new"
              aria-label="Capture a show"
              onClick={tapRecord}
              style={{
                position: 'absolute',
                left: '50%',
                top: '-13px',
                transform: 'translateX(-50%)',
                width: 64, height: 64,
                borderRadius: '50%',
                background: 'linear-gradient(180deg, #d4b45c 0%, #b8963e 100%)',
                border: '3px solid var(--sl-bg)',
                boxShadow: 'var(--sl-disc-shadow)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                textDecoration: 'none',
                zIndex: 2,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {/* Record dot glyph */}
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#0a0908' }} />
            </Link>
          )}

        </div>
      </nav>

      <style>{`
        @keyframes fadeIn       { from{opacity:0} to{opacity:1} }
        @keyframes slideUp      { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        * { -webkit-tap-highlight-color: transparent; }
        .sl-hoverable:hover { background: var(--sl-hover) !important; }
        .sl-shell a:focus-visible, .sl-shell button:focus-visible { outline: 2px solid var(--sl-gold); outline-offset: 2px; }
        @media (min-width: ${DESKTOP_MIN_WIDTH}px) {
          .sl-shell { padding-left: ${SIDEBAR_WIDTH}px; }
          .sl-sidebar { display: flex !important; }
          .sl-tabbar { display: none !important; }
          .sl-header-logo { display: none !important; }
          .sl-header {
            height: calc(72px + env(safe-area-inset-top, 0px)) !important;
            padding: env(safe-area-inset-top, 0px) max(24px, env(safe-area-inset-right, 0px)) 0 32px !important;
            --sl-acct-h: 48px; --sl-acct-name: 16px; --sl-acct-detail: 13px; --sl-acct-ava: 36px;
          }
          .sl-main {
            padding-bottom: 0 !important;
            --sl-page-min-height: calc(100svh - 72px - env(safe-area-inset-top, 0px)) !important;
          }
        }
      `}</style>
    </div>
    </WorkspaceRoleProvider>
  )
}
