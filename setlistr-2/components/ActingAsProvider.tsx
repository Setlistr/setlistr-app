'use client'
import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

// Legacy, unscoped key from before workspace selection was namespaced per
// authenticated user — a device-wide value that could carry between two
// different accounts signed into the same browser. Read once, on every
// mount, purely to delete it; never read for its value again.
const LEGACY_ACTING_AS_KEY = 'setlistr_acting_as'

function storageKeyFor(userId: string) {
  return `setlistr_acting_as:${userId}`
}

type ManagedArtistRef = { artist_id: string; artist_name: string }
type ManagedArtist = ManagedArtistRef & { role: string; avatar_url?: string | null }

// Explicit states — no boolean/"has it resolved yet" flag standing in for
// what actually happened. A saved managed-workspace selection is a REQUEST
// to view that workspace, not authorization to see it; it is only trusted
// after a live server round trip confirms the delegation is still accepted
// and non-revoked. Every failure mode gets its own state rather than
// collapsing into "just show my own stuff" — that silent collapse is
// exactly the bug this replaces (a device-wide, unnamespaced localStorage
// key whose restore silently no-op'd on any network hiccup, leaving every
// consuming page believing "resolved" while actually looking at the
// viewer's own data under the managed artist's context).
export type WorkspaceState =
  | { status: 'resolving' }
  | { status: 'own_workspace' }
  | { status: 'managed_workspace'; artistId: string; artistName: string }
  | { status: 'verification_failed' }
  | { status: 'unauthorized' }

type ActingAs = ManagedArtistRef | null

type ActingAsContextValue = {
  state: WorkspaceState

  // `workspaceOwnerId` is non-null ONLY in managed_workspace. It is
  // deliberately NOT populated in resolving/verification_failed/unauthorized
  // — those are exactly the states where a caller must not fall back to
  // the viewer's own id, so there is nothing here to fall back to.
  workspaceOwnerId: string | null

  // True for resolving/verification_failed/unauthorized. Consuming pages
  // should gate their data fetch AND render a blocking recovery surface
  // on this flag rather than inferring "safe to proceed" from a non-null
  // id — own_workspace and managed_workspace are the only two states where
  // isBlocked is false.
  isBlocked: boolean

  selectManagedArtist: (artist: ManagedArtistRef) => void
  returnToOwnWorkspace: () => void
  retry: () => void

  // ── Back-compat surface for call sites this pass deliberately does not
  // touch (app/app/live/[id]/page.tsx — protected capture code). Semantics
  // preserved exactly: null unless a managed workspace is the current,
  // already-resolved state; never populated speculatively while resolving
  // or failed, which is strictly safer than the previous implementation,
  // never less safe. setActingAs(ctx) is a thin compatibility wrapper over
  // selectManagedArtist/returnToOwnWorkspace so app/app/dashboard/page.tsx's
  // existing switchToArtist()/switchToOwn() need no changes to keep
  // working. `resolved` is true in every state except 'resolving'. ────────
  actingAs: ActingAs
  actingAsArtistId: string | null
  resolved: boolean
  setActingAs: (ctx: ActingAs) => void
}

const ActingAsContext = createContext<ActingAsContextValue | undefined>(undefined)

export function ActingAsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState>({ status: 'resolving' })
  const viewerIdRef = useRef<string | null>(null)

  const verify = useCallback(async () => {
    setState({ status: 'resolving' })

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // No session at all — every page already redirects to /auth/login off
    // its own auth.getUser() check; nothing here needs to duplicate that.
    // own_workspace is a safe, inert resting state for that brief window.
    if (!user) {
      viewerIdRef.current = null
      setState({ status: 'own_workspace' })
      return
    }
    viewerIdRef.current = user.id

    // One-time retirement of the old device-wide key — never read for its
    // value, only removed, so a value written by a different account that
    // was previously signed into this browser can never be picked up here.
    try { localStorage.removeItem(LEGACY_ACTING_AS_KEY) } catch { /* storage unavailable */ }

    let saved: ActingAs = null
    try {
      const raw = localStorage.getItem(storageKeyFor(user.id))
      if (raw) saved = JSON.parse(raw) as ActingAsContextValue['actingAs']
    } catch {
      saved = null
    }

    if (!saved) {
      setState({ status: 'own_workspace' })
      return
    }

    // A stored selection is a REQUEST, never authorization on its own —
    // verify server-side against the same accepted/non-revoked delegation
    // check every other consumer of /api/team/managed-artists relies on.
    try {
      const res = await fetch('/api/team/managed-artists')
      if (!res.ok) { setState({ status: 'verification_failed' }); return }
      const data = await res.json()
      const managed: ManagedArtist[] = data.managed || []
      const stillManages = managed.find(m => m.artist_id === saved!.artist_id)
      if (stillManages) {
        setState({ status: 'managed_workspace', artistId: stillManages.artist_id, artistName: stillManages.artist_name })
      } else {
        // Server proved the delegation no longer exists (revoked, or never
        // valid) — this is a positive, confirmed answer, not a failure to
        // reach the server. Clear the stale selection and tell the truth.
        try { localStorage.removeItem(storageKeyFor(user.id)) } catch { /* storage unavailable */ }
        setState({ status: 'unauthorized' })
      }
    } catch {
      // Network/JSON/anything-else failure — explicitly NOT the same as a
      // confirmed "no longer authorized" outcome, and never silently
      // treated as own_workspace. The stored selection is left untouched
      // so retry() can re-attempt without the user having to reselect.
      setState({ status: 'verification_failed' })
    }
  }, [])

  useEffect(() => { verify() }, [verify])

  const selectManagedArtist = useCallback((artist: ManagedArtistRef) => {
    const uid = viewerIdRef.current
    if (uid) {
      try { localStorage.setItem(storageKeyFor(uid), JSON.stringify(artist)) } catch { /* storage unavailable */ }
    }
    setState({ status: 'managed_workspace', artistId: artist.artist_id, artistName: artist.artist_name })
  }, [])

  const returnToOwnWorkspace = useCallback(() => {
    const uid = viewerIdRef.current
    if (uid) {
      try { localStorage.removeItem(storageKeyFor(uid)) } catch { /* storage unavailable */ }
    }
    setState({ status: 'own_workspace' })
  }, [])

  const setActingAs = useCallback((ctx: ActingAs) => {
    if (ctx) selectManagedArtist(ctx)
    else returnToOwnWorkspace()
  }, [selectManagedArtist, returnToOwnWorkspace])

  const workspaceOwnerId = state.status === 'managed_workspace' ? state.artistId : null
  const isBlocked = state.status === 'resolving' || state.status === 'verification_failed' || state.status === 'unauthorized'
  const actingAs: ActingAs = state.status === 'managed_workspace' ? { artist_id: state.artistId, artist_name: state.artistName } : null

  return (
    <ActingAsContext.Provider
      value={{
        state,
        workspaceOwnerId,
        isBlocked,
        selectManagedArtist,
        returnToOwnWorkspace,
        retry: verify,
        actingAs,
        actingAsArtistId: workspaceOwnerId,
        resolved: state.status !== 'resolving',
        setActingAs,
      }}
    >
      {children}
    </ActingAsContext.Provider>
  )
}

export function useActingAs(): ActingAsContextValue {
  const ctx = useContext(ActingAsContext)
  if (!ctx) throw new Error('useActingAs must be used within an ActingAsProvider')
  return ctx
}
