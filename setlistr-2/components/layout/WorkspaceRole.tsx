'use client'
import { createContext, useContext, useEffect, useState } from 'react'

// The signed-in user's team connections and, when acting for an artist,
// their role there — loaded once by the app frame (AppShell) and shared, so
// the header's identity line, the capture controls and pages that gate
// write actions (Schedule) all read the same answer.
//
// Fail-closed for capture: while acting for an artist whose role isn't
// known yet (list still loading, or it failed), canWrite is false — a
// Viewer never sees a capture control flash up, and a Manager/Tour
// Manager/Band Member sees it as soon as the role arrives. The database
// (can_write_for / viewer write containment) remains the real boundary;
// this only keeps read-only roles from being offered dead-end controls.

export type ManagedArtist = { artist_id: string; artist_name: string; role: string; avatar_url?: string | null }

export type WorkspaceRole = {
  managed: ManagedArtist[]
  // Role in the artist workspace being acted for; null in your own workspace.
  actingRole: string | null
  roleKnown: boolean
  // May capture/schedule in the current workspace (own workspace, or a
  // known write-capable role in the managed one). Never true with no workspace.
  canWrite: boolean
}

const WorkspaceRoleContext = createContext<WorkspaceRole>({ managed: [], actingRole: null, roleKnown: false, canWrite: false })

export function useWorkspaceRole(): WorkspaceRole {
  return useContext(WorkspaceRoleContext)
}

export const WorkspaceRoleProvider = WorkspaceRoleContext.Provider

// Loaded on mount, and again whenever the selected workspace is one the
// loaded list doesn't contain yet (e.g. straight after accepting an
// invite), so the role is never missing or guessed.
export function useWorkspaceRoleState(actingArtistId: string | null, hasWorkspace: boolean): WorkspaceRole {
  const [managed, setManaged] = useState<ManagedArtist[]>([])
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    if (loadedFor !== undefined && (!actingArtistId || managed.some(a => a.artist_id === actingArtistId) || loadedFor === actingArtistId)) return
    setLoadedFor(actingArtistId)
    fetch('/api/team/managed-artists').then(r => r.ok ? r.json() : { managed: [] }).then(d => setManaged(d.managed || [])).catch(() => {})
  }, [actingArtistId, managed, loadedFor])

  const acting = actingArtistId ? managed.find(a => a.artist_id === actingArtistId) : undefined
  const actingRole = actingArtistId ? (acting?.role ?? null) : null
  const roleKnown = !actingArtistId || !!acting
  const canWrite = hasWorkspace && (!actingArtistId || (!!acting && acting.role !== 'viewer'))
  return { managed, actingRole, roleKnown, canWrite }
}
