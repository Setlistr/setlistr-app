import type { createClient } from './supabase/client'
import type { FilingProfileFields } from './filing-status'

export interface FilingProfileContext {
  profile: FilingProfileFields
  isDelegate: boolean
  artistName: string | null
  // Only populated in delegate mode — /api/team/context-data returns
  // performances + song counts in the same call it uses to verify the
  // delegation and build the profile, so a caller in delegate mode should
  // use these rather than re-querying. Owner-mode callers always run their
  // own performances_visible query (each screen needs slightly different
  // columns) and get null here.
  delegatePerformances: any[] | null
  delegateSongCountMap: Record<string, number> | null
}

// Fetches exactly the profile fields computeFilingStatus() needs —
// pro_affiliation always, legal_name/ipi_number only for the account
// owner. A delegate's identity fields are never fetched here at all, not
// merely withheld after the fact: /api/team/context-data (the same route
// app/app/submit/[id]/page.tsx uses) never returns them for a delegate.
// Shared by every screen that computes filing readiness — dashboard,
// history ("Your Record"), and the Filing Queue — so they all enforce
// this privacy boundary identically rather than each re-deriving it.
export async function loadFilingProfile(
  supabase: ReturnType<typeof createClient>,
  actingAs: { artist_id: string; artist_name: string } | null,
): Promise<FilingProfileContext> {
  if (actingAs) {
    const res = await fetch(`/api/team/context-data?artist_id=${actingAs.artist_id}`)
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    return {
      profile: { pro_affiliation: data.pro_affiliation ?? null, legal_name: null, ipi_number: null },
      isDelegate: true,
      artistName: data.artist_name || null,
      delegatePerformances: data.performances || [],
      delegateSongCountMap: data.songCountMap || {},
    }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')
  const { data: profile } = await supabase
    .from('profiles')
    .select('pro_affiliation, legal_name, ipi_number')
    .eq('id', user.id).single()

  return {
    profile: {
      pro_affiliation: profile?.pro_affiliation ?? null,
      legal_name: profile?.legal_name ?? null,
      ipi_number: profile?.ipi_number ?? null,
    },
    isDelegate: false,
    artistName: null,
    delegatePerformances: null,
    delegateSongCountMap: null,
  }
}
