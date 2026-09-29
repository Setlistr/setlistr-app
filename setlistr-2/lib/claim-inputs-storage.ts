import type { FilingClaimInputs } from './filing-status'

// Reads the same per-device claim-detail inputs app/app/submit/[id]/page.tsx
// saves to localStorage (promoter, ticket price, attendance, start time,
// city) while a user fills in that show's "Show details" section. Shared
// by every screen that needs to know whether a show's PRO-required fields
// are actually filled in, not just guessed at — see lib/filing-status.ts's
// computeFilingStatus(). Browser-only; callers only ever run this
// client-side.
export function readClaimInputs(performanceId: string): FilingClaimInputs {
  try {
    const raw = window.localStorage.getItem(`setlistr:claim:${performanceId}`)
    return raw ? (JSON.parse(raw) as FilingClaimInputs) : {}
  } catch { return {} }
}
