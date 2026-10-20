import type { FilingClaimInputs } from './filing-status'
import { claimInputsKey, legacyClaimInputsKey } from './claim-progress'

// Reads the same per-device claim-detail inputs app/app/submit/[id]/page.tsx
// saves to localStorage (promoter, ticket price, attendance, start time,
// city) while a user fills in that show's "Show details" section. Shared
// by every screen that needs to know whether a show's PRO-required fields
// are actually filled in, not just guessed at — see lib/filing-status.ts's
// computeFilingStatus(). Browser-only; callers only ever run this
// client-side.
//
// Saved per signed-in account (lib/claim-progress.ts). The released,
// account-less key is read only until the claim sheet moves it.
export function readClaimInputs(viewerId: string, performanceId: string): FilingClaimInputs {
  try {
    const raw = window.localStorage.getItem(claimInputsKey(viewerId, performanceId))
      ?? window.localStorage.getItem(legacyClaimInputsKey(performanceId))
    return raw ? (JSON.parse(raw) as FilingClaimInputs) : {}
  } catch { return {} }
}
