// Preview deployments run against production data. Writes that a reviewer
// could trigger from a Preview — starting a scheduled show, and the
// telemetry it records — are refused there. Fail-closed by host, exactly
// like spreadsheet import (lib/shows/import/mode.ts) and invitations
// (lib/teamInviteAcceptance.ts): allowed only on the production domain or a
// local host; any other host (every *.vercel.app URL) counts as Preview.
// SETLISTR_START_PREVIEW=1 turns the lock on locally (server side), for testing.
const LIVE_HOSTS = ['setlistr.ai', 'www.setlistr.ai']

export function previewWritesLocked(host: string | null | undefined): boolean {
  if (typeof process !== 'undefined' && (process.env.SETLISTR_START_PREVIEW === '1' || process.env.VERCEL_ENV === 'preview')) return true
  const h = (host || '').toLowerCase().replace(/:\d+$/, '')
  if (!h) return true
  return !(LIVE_HOSTS.includes(h) || h === 'localhost' || h === '127.0.0.1')
}

export const START_PREVIEW_MESSAGE = 'Starting shows is turned off on Preview deployments. Nothing was started.'
