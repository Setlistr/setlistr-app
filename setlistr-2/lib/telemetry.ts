// Minimal, best-effort product-event logger for post-show friction
// instrumentation. See supabase/migrations/0006_product_events.sql.
//
// logProductEvent() starts the insert and returns immediately with a
// Promise that NEVER rejects — a telemetry failure must never throw into
// or block the caller. For non-navigation-adjacent events (capture_started,
// review_opened, review_action) call it and ignore the returned promise
// (fire-and-forget). For navigation/background-sensitive events
// (show_created, capture_ended, review_completed, export_generated), hold
// the returned promise, let it run concurrently with whatever product DB
// work already happens next, then `await awaitWithTimeout(promise)`
// immediately before navigating or returning — this overlaps the
// telemetry network time with work that was already happening instead of
// serially adding to it, while still giving the insert a real chance to
// land before the page/function goes away, bounded so a stalled request
// can never hang product completion.
//
// Works with either the browser client (lib/supabase/client.ts) or a
// server-side service-role client, since both are SupabaseClient
// instances. On the server specifically, awaiting (rather than truly
// fire-and-forget) matters even more than on the client: a serverless
// function's execution context is not guaranteed to keep running
// unawaited work after its response is sent.

import type { SupabaseClient } from '@supabase/supabase-js'

export type FlowSource = 'live' | 'upload'
export type ActorType = 'owner' | 'delegate'
export type ReviewActionType = 'confirm_song' | 'remove_song' | 'add_song' | 'reorder_song' | 'edit_song'
// show_locked is intentionally not a separate emitted event today — see
// review_completed's call site. Reporting derives show_locked_at as
// review_completed.occurred_at until a genuinely distinct lock boundary
// (e.g. PRO submission) exists to justify its own event.
export type ProductEventName =
  | 'show_created' | 'capture_started' | 'capture_ended'
  | 'review_opened' | 'review_action' | 'review_completed'
  | 'export_generated'

// Postgres unique_violation — expected, not a fault, when a partial unique
// index (0006_product_events.sql) rejects a legitimate idempotency-guarded
// retry of a single-fire event (show_created, capture_ended,
// review_completed). Swallowed silently rather than warned.
const UNIQUE_VIOLATION = '23505'

// show_created/capture_ended/review_completed are meant to be at most one
// row per performance_id (see the partial unique indexes in
// 0006_product_events.sql) — but that index only constrains NON-NULL
// performance_id values; Postgres treats NULLs as distinct from each other,
// so a bug that logged one of these with a missing performance_id would be
// completely invisible to the DB-level guard and could insert unbounded
// duplicate, unattributable rows. Verified (2026-09-04) that 4 of the 5
// call sites have a structural null-check on `performance` before this can
// ever run (show/new's post-insert throw, Live's handleEnd/Review's
// handleSave early-return guards, Upload's POST route's error guard) — the
// one exception is Upload's capture_ended, which reads performanceIdRef.current
// (a ref, not guarded at the read site) inside finalizeIfDone. This app-level
// guard is the real backstop for that one site, and a defensive floor for
// the other four against a future refactor removing their guard.
const SINGLE_FIRE_EVENTS: ReadonlySet<ProductEventName> = new Set<ProductEventName>(['show_created', 'capture_ended', 'review_completed'])

export interface ProductEventInput {
  event_name: ProductEventName
  user_id: string | null
  performance_id: string | null
  show_id?: string | null
  // Cheaply-known local hint only (e.g. from Review's ?source= query
  // param) — NOT authoritative. Reporting/metrics must derive flow_source
  // by joining back to this performance's canonical show_created row, per
  // the durable-flow-source decision (query params and later-event values
  // aren't trusted for segmentation).
  flow_source?: FlowSource | null
  actor_type?: ActorType | null
  action_type?: ReviewActionType | null
  song_count_current?: number | null
  song_count_detected?: number | null
  song_count_planned?: number | null
  // Pass explicitly wherever a derived metric will diff this event's
  // timestamp against another event's — pins occurred_at to the exact
  // moment the lifecycle transition happened, instead of whenever this
  // insert happens to land.
  occurred_at?: string
}

export function logProductEvent(supabase: SupabaseClient, event: ProductEventInput): Promise<void> {
  if (SINGLE_FIRE_EVENTS.has(event.event_name) && !event.performance_id) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[ProductEvent] skipped ${event.event_name} — performance_id missing; single-fire events require it (see SINGLE_FIRE_EVENTS comment)`)
    }
    return Promise.resolve()
  }
  return (async () => {
    try {
      const { error } = await supabase.from('product_events').insert({
        event_name: event.event_name,
        occurred_at: event.occurred_at,
        user_id: event.user_id,
        performance_id: event.performance_id,
        show_id: event.show_id ?? null,
        flow_source: event.flow_source ?? null,
        actor_type: event.actor_type ?? null,
        action_type: event.action_type ?? null,
        song_count_current: event.song_count_current ?? null,
        song_count_detected: event.song_count_detected ?? null,
        song_count_planned: event.song_count_planned ?? null,
      })
      if (error && error.code !== UNIQUE_VIOLATION) {
        console.warn('[ProductEvent] insert failed (non-blocking):', error.message)
      }
    } catch (err) {
      console.warn('[ProductEvent] log failed (non-blocking):', err)
    }
  })()
}

// Bounds how long a caller will wait for an outstanding logProductEvent
// promise right before navigating away / returning. logProductEvent itself
// never rejects, so this only ever resolves — it exists purely to cap the
// wait, not to handle errors.
export function awaitWithTimeout(promise: Promise<void>, timeoutMs = 1200): Promise<void> {
  return Promise.race([promise, new Promise<void>(resolve => setTimeout(resolve, timeoutMs))])
}

// owner vs delegate, matching the acting-as pattern already used throughout
// (e.g. writeUserSong(actingAsArtistId || user.id, ...)) — a delegate is
// anyone acting as an artist_id different from their own auth user id.
export function actorTypeFor(actingAsArtistId: string | null, authUserId: string | null): ActorType {
  return actingAsArtistId && actingAsArtistId !== authUserId ? 'delegate' : 'owner'
}
