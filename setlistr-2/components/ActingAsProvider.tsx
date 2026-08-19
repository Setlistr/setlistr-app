'use client'
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'

const ACTING_AS_KEY = 'setlistr_acting_as'

type ActingAs = { artist_id: string; artist_name: string } | null
type ManagedArtist = { artist_id: string; artist_name: string; role: string; avatar_url?: string | null }

type ActingAsContextValue = {
  actingAs: ActingAs
  actingAsArtistId: string | null
  setActingAs: (ctx: ActingAs) => void
  resolved: boolean
}

const ActingAsContext = createContext<ActingAsContextValue | undefined>(undefined)

export function ActingAsProvider({ children }: { children: ReactNode }) {
  const [actingAs, setActingAsState] = useState<ActingAs>(null)
  const [resolved, setResolved] = useState(false)

  // Single writer for the stored key: updates React state and localStorage
  // together so no caller can drift the two out of sync.
  const setActingAs = useCallback((ctx: ActingAs) => {
    setActingAsState(ctx)
    if (ctx) {
      localStorage.setItem(ACTING_AS_KEY, JSON.stringify(ctx))
    } else {
      localStorage.removeItem(ACTING_AS_KEY)
    }
  }, [])

  // Validates the stored value on mount, mirroring app/app/dashboard/page.tsx's
  // original logic exactly, including its one quirk: if the managed-artists
  // fetch comes back empty, this block is skipped entirely — a stored value
  // is neither restored nor cleared in that case, same as before.
  //
  // `resolved` is set in the finally block specifically so every path —
  // no stored value, an empty/failed managed-artists fetch, a malformed
  // stored value — still flips it to true exactly once. Consumers gate
  // their own fetches on `resolved` rather than on `actingAs` itself, so
  // they never act on a not-yet-validated (or momentarily stale) value.
  useEffect(() => {
    async function validate() {
      try {
        const savedActingAs = localStorage.getItem(ACTING_AS_KEY)
        if (!savedActingAs) return

        const managedRes = await fetch('/api/team/managed-artists')
        const managedData = await managedRes.json()
        const managed: ManagedArtist[] = managedData.managed || []

        if (savedActingAs && managed.length > 0) {
          try {
            const parsed = JSON.parse(savedActingAs)
            const stillManages = managed.find(m => m.artist_id === parsed.artist_id)
            if (stillManages) {
              setActingAsState(parsed)
            } else {
              localStorage.removeItem(ACTING_AS_KEY)
            }
          } catch {
            localStorage.removeItem(ACTING_AS_KEY)
          }
        }
      } catch {
        // Network failure on the managed-artists fetch — leave the stored
        // value untouched (same silence as the original code had no
        // handling for this case either) and fall through to resolve
        // below so consumers aren't stuck waiting forever.
      } finally {
        setResolved(true)
      }
    }
    validate()
  }, [])

  return (
    <ActingAsContext.Provider
      value={{ actingAs, actingAsArtistId: actingAs?.artist_id ?? null, setActingAs, resolved }}
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
