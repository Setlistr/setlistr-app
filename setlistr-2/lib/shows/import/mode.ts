// Spreadsheet import on Vercel Preview deployments (docs/spreadsheet-import-plan.md).
// Preview runs against production data, so import and Undo are refused there
// on the server, whatever the schema, and the review checks files against
// labelled sample records instead of real ones.
//
// Fail-closed: writes are allowed only on the production domain or a local
// host. Any other host (every *.vercel.app deployment URL, Preview or not) is
// treated as Preview even if Vercel's system environment variables aren't
// exposed to the function. VERCEL_ENV=preview and SETLISTR_IMPORT_PREVIEW=1
// (for testing this mode locally) also turn it on.
const WRITE_HOSTS = ['setlistr.ai', 'www.setlistr.ai']
export function importPreviewMode(host: string | null | undefined): boolean {
  if (process.env.SETLISTR_IMPORT_PREVIEW === '1' || process.env.VERCEL_ENV === 'preview') return true
  const h = (host || '').toLowerCase().replace(/:\d+$/, '')
  if (!h) return true
  return !(WRITE_HOSTS.includes(h) || h === 'localhost' || h === '127.0.0.1')
}
export const PREVIEW_DISABLED_MESSAGE = 'Importing is turned off on Preview deployments. Nothing was saved.'
