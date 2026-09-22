'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { evaluateAuthEvent, type SessionGuardState } from '@/lib/sessionGuardLogic'

export type { SessionGuardState }

// Invalidates a mounted form the instant the browser's authenticated
// identity stops being the one the form was loaded under. Token refresh
// and a fresh SIGNED_IN event for the SAME user must never trip this —
// only a real identity change (a different user id) or a sign-out does.
// The actual decision logic lives in lib/sessionGuardLogic.ts (see there
// for why it's event-name-agnostic rather than special-casing SIGNED_IN).
//
// The onAuthStateChange callback below stays synchronous and makes no
// awaited Supabase calls — calling back into the Supabase client from
// inside this callback can deadlock its internal auth lock (a documented
// SDK gotcha). It only ever compares ids and calls a state setter; any
// follow-up work (redirect, refetch, clearing other state) belongs to the
// component consuming the returned state, not to this hook.
export function useSessionGuard(loadedViewerId: string | null): SessionGuardState {
  const [state, setState] = useState<SessionGuardState>({ invalid: false })

  // Closing directly over loadedViewerId (rather than a ref) is safe here
  // specifically because the effect's dependency array is [loadedViewerId]:
  // every time that value changes, the old subscription is torn down and a
  // fresh one is created whose callback closure captures the new value.
  // There is no window where this callback can observe a stale
  // loadedViewerId once the effect has re-run.
  useEffect(() => {
    if (!loadedViewerId) return
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const next = evaluateAuthEvent(event, session?.user?.id ?? null, loadedViewerId)
      if (next) setState(next)
      // TOKEN_REFRESHED / SIGNED_IN for the same id: evaluateAuthEvent
      // returns null and the form remains valid.
    })
    return () => { subscription.unsubscribe() }
  }, [loadedViewerId])

  return state
}
