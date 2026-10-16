// Supabase database-webhook payloads for app/api/notion-sync.
export type DbWebhookPayload = {
  type?: string
  table?: string
  record?: Record<string, any> | null
  old_record?: Record<string, any> | null
}

// A performance counts toward Notion's "Shows Captured" only on the update
// that moves it INTO 'complete' (performances.status's finished value).
// Later edits to a complete performance (submission, photo, delete/undo,
// re-save) arrive as UPDATEs with status still 'complete' and must not count
// again. With no previous row there is no evidence of a transition, so it
// doesn't count. This does not make delivery exactly-once: the same event
// delivered twice still passes both times.
export function isPerformanceCompletion(payload: DbWebhookPayload): boolean {
  if (payload.table !== 'performances' || payload.type !== 'UPDATE') return false
  if (payload.record?.status !== 'complete') return false
  const old = payload.old_record
  if (!old || typeof old.status !== 'string') return false
  return old.status !== 'complete'
}
