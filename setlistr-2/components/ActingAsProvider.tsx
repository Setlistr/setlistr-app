'use client'
import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  resolveWorkspaceState, deriveWorkspaceOwnerId, deriveResolved, deriveIsBlocked,
  storageKeyFor, LEGACY_ACTING_AS_KEY, parseSavedSelection, isStaleResponse,
  type WorkspaceState, type ManagedArtistRef,
} from '@/lib/workspaceStateLogic'

export type { WorkspaceState }

type ManagedArtist = ManagedArtistRef & { role: string; avatar_url?: string | null }

type ActingAs = ManagedArtistRef | null

type ActingAsContextValue = {
  state: WorkspaceState

  // The one canonical subject id — see lib/workspaceStateLogic.ts's own
  // doc comment. Null in resolving/verification_failed/unauthorized by
  // construction (deriveWorkspaceOwnerId), never a value a caller should
  // ever combine with `|| user.id`.
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

  // ── Back-compat surface for any consumer not yet migrated to
  // workspaceOwnerId/isBlocked directly. `resolved` is now CORRECTED to
  // only be true in own_workspace/managed_workspace (see
  // lib/workspaceStateLogic.ts's deriveResolved) — previously it was true
  // in verification_failed/unauthorized too, which is exactly what let a
  // legacy `actingAsArtistId || user.id` consumer execute against the
  // viewer's own data while still displaying the artist's context. This
  // correction is a second, independent fail-closed layer beneath the
  // central WorkspaceGate: even a consumer this pass never touches (e.g.
  // protected app/app/live/[id]/page.tsx, which reads only
  // actingAsArtistId, not resolved) is unaffected by this change and was
  // already null-safe; any *other* legacy consumer gating on `resolved`
  // is now correctly blocked too. `actingAsArtistId` remains null in every
  // state except managed_workspace, unchanged from before this pass. ─────
  actingAs: ActingAs
  actingAsArtistId: string | null
  resolved: boolean
  setActingAs: (ctx: ActingAs) => void
}

const ActingAsContext = createContext<ActingAsContextValue | undefined>(undefined)

export function ActingAsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WorkspaceState>({ status: 'resolving' })

  // Identity/race-safety refs. `viewerIdRef` is the last-known authenticated
  // viewer id (independent of `state`, since `state` may legitimately be
  // 'resolving'/blocked while a viewer id is already known). `generationRef`
  // is bumped by every state-transition entry point (verify, retry,
  // selectManagedArtist, returnToOwnWorkspace) so any in-flight async result
  // from a superseded call can identify itself as stale and be discarded
  // unapplied — see lib/workspaceStateLogic.ts's isStaleResponse.
  const viewerIdRef = useRef<string | null>(null)
  const generationRef = useRef(0)

  const verify = useCallback(async () => {
    const myGeneration = ++generationRef.current
    setState({ status: 'resolving' })

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // A newer call (retry, explicit selection/return, or an auth change)
    // started while this getUser() call was in flight — discard. No
    // viewerId is known yet at this point, so this is a plain generation
    // check; the fuller isStaleResponse (generation + viewerId) check below
    // applies once a viewerId exists to compare.
    if (myGeneration !== generationRef.current) return

    // No session at all — every page already redirects to /auth/login off
    // its own auth.getUser() check; nothing here needs to duplicate that.
    // Deliberately left as 'resolving' (never 'own_workspace') for this
    // sessionless edge case — 'own_workspace' now REQUIRES a real viewerId
    // by its own type (see workspaceStateLogic.ts), and staying blocked
    // during the brief pre-redirect window is strictly safer than before,
    // never worse: children still don't mount either way.
    if (!user) {
      viewerIdRef.current = null
      return
    }
    const viewerId = user.id
    viewerIdRef.current = viewerId

    // One-time retirement of the old device-wide key — never read for its
    // value, only removed, so a value written by a different account that
    // was previously signed into this browser can never be picked up here.
    try { localStorage.removeItem(LEGACY_ACTING_AS_KEY) } catch { /* storage unavailable */ }

    let raw: string | null = null
    try { raw = localStorage.getItem(storageKeyFor(viewerId)) } catch { /* storage unavailable */ }
    const saved = parseSavedSelection(raw)

    if (!saved) {
      if (isStaleResponse({
        responseGeneration: myGeneration, currentGeneration: generationRef.current,
        responseViewerId: viewerId, currentViewerId: viewerIdRef.current,
      })) return
      setState(resolveWorkspaceState({ viewerId, savedSelection: null, managedArtists: null }))
      return
    }

    // A stored selection is a REQUEST, never authorization on its own —
    // verify server-side against the same accepted/non-revoked delegation
    // check every other consumer of /api/team/managed-artists relies on.
    let managedArtists: ManagedArtistRef[] | null = null
    try {
      const res = await fetch('/api/team/managed-artists')
      if (!res.ok) {
        managedArtists = null
      } else {
        const data = await res.json()
        const managed: ManagedArtist[] = data.managed || []
        managedArtists = managed.map(m => ({ artist_id: m.artist_id, artist_name: m.artist_name }))
      }
    } catch {
      managedArtists = null
    }

    // Stale-response guard: a newer verify()/retry()/selection/return call,
    // or an auth change to a different viewer, superseded this one while
    // the fetch was in flight — discard without touching state.
    if (isStaleResponse({
      responseGeneration: myGeneration, currentGeneration: generationRef.current,
      responseViewerId: viewerId, currentViewerId: viewerIdRef.current,
    })) return

    const next = resolveWorkspaceState({ viewerId, savedSelection: saved, managedArtists })
    if (next.status === 'unauthorized') {
      // Server proved the delegation no longer exists — a positive,
      // confirmed answer, not a failure to reach the server. Clear the
      // stale selection so it isn't re-attempted forever.
      try { localStorage.removeItem(storageKeyFor(viewerId)) } catch { /* storage unavailable */ }
    }
    setState(next)
  }, [])

  // Re-verify whenever the browser's authenticated identity changes —
  // SIGNED_OUT, or a resolved user id different from the last one this
  // provider observed. Without this, a session change while
  // ActingAsProvider stays mounted (the same class of staleness the
  // session-bound-forms hotfix closed for Settings/Onboarding) would leave
  // this provider's state frozen under the PREVIOUS viewer indefinitely —
  // a response initiated for viewer A must never resolve state for viewer
  // B, and this is what makes that true even across a live account switch,
  // not just across page loads. TOKEN_REFRESHED/a fresh SIGNED_IN for the
  // SAME id must not re-trigger verification — only a real identity change.
  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const nextViewerId = session?.user?.id ?? null
      if (event === 'SIGNED_OUT' || nextViewerId !== viewerIdRef.current) {
        // Bump generation FIRST, synchronously, so any in-flight verify()
        // from the old identity is immediately unable to apply its result,
        // even before the new verify() call below has done anything.
        generationRef.current++
        viewerIdRef.current = nextViewerId
        setState({ status: 'resolving' })
        verify()
      }
    })
    return () => { subscription.unsubscribe() }
  }, [verify])

  useEffect(() => { verify() }, [verify])

  const selectManagedArtist = useCallback((artist: ManagedArtistRef) => {
    generationRef.current++ // invalidate any in-flight verify()/retry()
    const uid = viewerIdRef.current
    if (uid) {
      try { localStorage.setItem(storageKeyFor(uid), JSON.stringify(artist)) } catch { /* storage unavailable */ }
    }
    setState({ status: 'managed_workspace', artistId: artist.artist_id, artistName: artist.artist_name })
  }, [])

  // Explicit "return to my workspace." Per spec: clears the viewer's
  // namespaced storage key, clears any in-memory managed identity (implicit
  // — `state` is fully replaced, nothing else holds artist name/id), and
  // transitions directly into a freshly constructed own_workspace state
  // carrying the real viewerId — never a stale one, never the artist's.
  const returnToOwnWorkspace = useCallback(() => {
    generationRef.current++ // invalidate any in-flight verify()/retry()
    const uid = viewerIdRef.current
    if (uid) {
      try { localStorage.removeItem(storageKeyFor(uid)) } catch { /* storage unavailable */ }
      setState({ status: 'own_workspace', viewerId: uid })
    } else {
      // No known viewer id (shouldn't happen outside the brief pre-redirect
      // window) — resolving is the safe default, never a fabricated id.
      setState({ status: 'resolving' })
    }
  }, [])

  const setActingAs = useCallback((ctx: ActingAs) => {
    if (ctx) selectManagedArtist(ctx)
    else returnToOwnWorkspace()
  }, [selectManagedArtist, returnToOwnWorkspace])

  const workspaceOwnerId = deriveWorkspaceOwnerId(state)
  const isBlocked = deriveIsBlocked(state)
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
        actingAsArtistId: state.status === 'managed_workspace' ? state.artistId : null,
        resolved: deriveResolved(state),
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
