// Spreadsheet import on Vercel Preview deployments (docs/spreadsheet-import-plan.md).
// Preview runs against production data, so import and Undo are refused
// there on the server, whatever the schema; the review checks files against
// labelled sample records instead of real ones. Production and local runs
// are unaffected. SETLISTR_IMPORT_PREVIEW=1 turns the same mode on locally,
// for testing it.
export function importPreviewMode(): boolean {
  return process.env.VERCEL_ENV === 'preview' || process.env.SETLISTR_IMPORT_PREVIEW === '1'
}
export const PREVIEW_DISABLED_MESSAGE = 'Importing is turned off on Preview deployments. Nothing was saved.'
