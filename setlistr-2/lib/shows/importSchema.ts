// Reads that include the spreadsheet-import columns (supabase/proposals/0028)
// fall back to the columns every deployed schema has, so Schedule keeps
// working where 0028 isn't applied (Preview against production, or the app
// reaching a database before the migration). Writes never fall back.
export function isMissingImportSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  // 42703: undefined column; PGRST200/204: unknown relationship or column in the API schema cache.
  return error.code === '42703' || error.code === 'PGRST200' || error.code === 'PGRST204' || /show_import_batches|local_date|local_time|import_batch_id|source_row/.test(error.message || '')
}
