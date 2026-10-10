import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

export type ReopenResult =
  | { outcome: 'reopened'; token: string }
  | { outcome: 'reused_concurrent'; token: string }
  | { outcome: 'already_has_access' }
  | { outcome: 'declined' }
  | { outcome: 'error' }

// Reopens a revoked (never declined) artist_delegates row as a genuinely
// fresh pending invite/request — never a restoration of the old grant.
// Shared by app/api/team/invite (both the up-front existing-row path and
// the 23505-conflict race-recovery path) and app/api/team/request, so the
// concurrency guard only has to be gotten right once.
//
// Concurrency-safe: the UPDATE's WHERE clause re-verifies revoked_at IS
// NOT NULL AND declined_at IS NULL at WRITE time — not just at an earlier
// SELECT the caller already did. Two concurrent re-invites/re-requests for
// the same row therefore can't both "win": the first commit flips
// revoked_at to null, so the second's WHERE clause matches zero rows
// instead of silently overwriting the first's freshly-issued token (which
// may already have gone out as a real link/email by the time the second
// write would otherwise have landed). The loser re-reads the row's actual
// current state and reuses whichever token actually won, exactly like
// app/api/team/accept/route.ts's own atomic-guard-miss recovery pattern.
//
// Never guards on accepted_at: a revoked row from an accepted-then-removed
// connection still has accepted_at SET (revoking only ever sets
// revoked_at, never clears the original acceptance) — requiring it null
// would incorrectly refuse to reopen the exact row this function exists
// for.
export async function reopenRevokedDelegation(
  supabase: SupabaseClient,
  rowId: string,
  fields: { role: string; invitedBy: string }
): Promise<ReopenResult> {
  const newToken = randomUUID()
  const { data: reopened, error } = await supabase
    .from('artist_delegates')
    .update({
      role: fields.role, invited_by: fields.invitedBy, invited_at: new Date().toISOString(),
      invite_token: newToken, accepted_at: null, declined_at: null, revoked_at: null,
    })
    .eq('id', rowId)
    .not('revoked_at', 'is', null)
    .is('declined_at', null)
    .select('invite_token')
    .maybeSingle()

  if (error) {
    console.error('Reopen revoked delegation error:', error)
    return { outcome: 'error' }
  }
  if (reopened) return { outcome: 'reopened', token: reopened.invite_token }

  // Guard matched zero rows — a concurrent request already changed this
  // exact row between our caller's SELECT and this UPDATE. Re-read its
  // actual current state rather than guessing which guard failed.
  const { data: current, error: reReadError } = await supabase
    .from('artist_delegates')
    .select('accepted_at, declined_at, revoked_at, invite_token')
    .eq('id', rowId)
    .maybeSingle()

  if (reReadError || !current) return { outcome: 'error' }
  if (current.declined_at) return { outcome: 'declined' }
  if (current.accepted_at && !current.revoked_at) return { outcome: 'already_has_access' }
  if (!current.revoked_at && current.invite_token) {
    // A concurrent reopen already won this exact race — reuse ITS token
    // rather than erroring or silently discarding it.
    return { outcome: 'reused_concurrent', token: current.invite_token }
  }
  return { outcome: 'error' }
}
