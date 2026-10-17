# Production preflight (read-only, Supabase SQL Editor)

**Method:** each run is `BEGIN TRANSACTION READ ONLY; SET LOCAL statement_timeout = '30s'; … ROLLBACK;`, pasted into the Supabase SQL Editor of project `lelimetbogycrdnfxjok`. That's the project the setlistr.ai production bundle uses (verified) and the only project in the account. No credentials are handled. Each result reports `transaction_read_only`. Every script was validated first on a disposable database, including that a write inside the same transaction is refused.

| Run | Script | Status |
|---|---|---|
| 1 | [`preflight-run1-amended.sql`](preflight-run1-amended.sql): schema, constraints, RLS, policies, access functions, triggers, default ACL, indexes, sizes, duplicates, marker-key match | **run 2026-10-17 18:47Z, `read_only: on`** |
| 2 | [`preflight-run2-plan.sql`](preflight-run2-plan.sql): the plan for the revised function's lookups (EXPLAIN only) | prepared, not yet run |
| 3 | [`preflight-run3-categories.sql`](preflight-run3-categories.sql): table grants, column defaults, webhook dependencies, unmatched markers by category (counts only) | prepared, not yet run |

**About the Run 1 amendment (diagnosis only):** checks 13 and 14 compare performance ids as text, because production's `user_song_performances.performance_id` is `text` and the original run stopped with `42883`. It also adds `00_cli_login_roles`.

## Run 1 findings

| Area | Production | Effect on the proposal |
|---|---|---|
| Column types | `user_song_performances.performance_id` is **text** (`performance_songs.performance_id`, `performances.id` are uuid). `user_id` is nullable on both catalogue tables. `user_songs` has 7 more columns (composer, corrected_to_count, created_at, isrc, publisher, rejected_count, source). | Revision 2 writes markers as `id::text`. Revision 1 would also have worked (uuid → text is an assignment cast); only the preflight's own comparison broke. The extra columns aren't written. |
| Uniqueness | `user_songs` **UNIQUE (user_id, song_title)**; markers UNIQUE (user_id, performance_id, normalized_title) | **Revision 1 bug:** a concurrent row creation made its insert fail with `23505`, shown as permanent. Revision 2 uses an atomic upsert. Split rows can't exist ([OVERLAP.md](OVERLAP.md)). |
| Status check | `draft, live, processing, review, complete` | as expected: `main`'s `'completed'` is rejected, so the trigger doesn't fire for it |
| RLS and policies | RLS on all four tables. Catalogue tables: `FOR ALL USING can_act_for(user_id)`, no WITH CHECK. Performances and songs: read `can_act_for`, write `can_write_for`. | **Separate finding:** Viewers can write the catalogue ([FINDING-catalogue-policies.md](FINDING-catalogue-policies.md)). The repair doesn't depend on it. |
| Access functions | `can_write_for` limits roles to manager, tour_manager, band_member; `can_act_for` covers any accepted delegate | as expected |
| Triggers on performances | 4 BEFORE triggers as in the repo, plus **`notion_show_count`**: AFTER UPDATE, every row, `supabase_functions.http_request` to `/api/notion-sync` | Reproduced. Fires before the catalogue trigger; when completion is rejected, its webhook is rolled back with it (tested). Notion deduplication stays open. |
| Name clashes | none | ok |
| Default function ACL | EXECUTE to anon, authenticated, service_role | the migration revokes from anon and authenticated (tested) |
| Migration role | `postgres`, bypasses RLS | the SECURITY DEFINER functions can write the catalogue |
| Indexes | `user_songs_user_id_song_title_key`, the marker unique key, `idx_usp_lookup`; **no index on `performance_songs.performance_id`** | lookups use the unique keys; the show's songs are a sequential scan (the app already reads them that way) |
| Sizes | user_songs 1,654 (16 artists, largest 598); markers 2,103; performance_songs 3,406; performances 566 | measured at this size: **1.2–1.6 ms** per 18-song completion (`final2/perf-production-size.log`) |
| Duplicate catalogue rows | **0** | consistent with the unique key |
| Marker-key match | **1,096 of 2,103** markers match a current song of their show | 1,007 unmatched: not interpreted until Run 3 categorizes them; not treated as lost counts; no backfill |
| Planned rows on complete shows | 4 | informational |
| CLI login role | `cli_login_postgres` exists, can log in, valid until **18:44:09Z** (already expired at the run) | the earlier CLI query did create or refresh it; managed by Supabase; not changed |

## Run 3: unmatched-marker categories

Each marker falls in exactly one category, checked in this order:

| Category | Meaning |
|---|---|
| `M1_matched_kept_song` | the show has a kept song with this key |
| `M2_matched_song_now_removed_by_artist` | the only song with this key was later marked removed |
| `U1_marker_id_not_a_performance_id` | the marker's id isn't uuid-shaped |
| `U2_show_no_longer_exists` | no performance with that id |
| `U3_show_soft_deleted` | the show has `deleted_at` |
| `U4_marker_user_is_not_show_owner` | the marker belongs to someone other than the show's artist |
| `U5_show_has_no_song_rows` | the show has no `performance_songs` at all (e.g. a legacy setlist) |
| `U6_song_not_in_show_but_in_artists_catalogue` | renamed or removed since; the title is still in the catalogue |
| `U7_song_not_in_show_nor_catalogue` | neither |

Each category is also broken down by show status, data source and the month written.

**None of these categories means "a count was lost".** A marker records that a song was counted for a show at the time. These categories describe where that song is now, and they don't authorize a backfill.
