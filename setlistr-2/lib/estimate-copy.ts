// One wording for royalty estimates everywhere (docs/ui-standard.md →
// Estimates). The dashboard's shipped wording is the reference.
export const ESTIMATE_DISCLAIMER = 'Estimates only, not guaranteed. Payouts vary by PRO.'
// "~$320" — always approximate; pair with ESTIMATE_UNIT where space allows.
export const formatEstimate = (n: number) => `~$${Math.round(n).toLocaleString()}`
export const ESTIMATE_UNIT = 'est.'
