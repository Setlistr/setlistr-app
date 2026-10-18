# Production preflight (read-only, Supabase SQL Editor)

**Method:** each run is `BEGIN TRANSACTION READ ONLY; SET LOCAL statement_timeout = '30s'; … ROLLBACK;`, pasted into the Supabase SQL Editor of project `lelimetbogycrdnfxjok`. That's the project the setlistr.ai production bundle uses (verified) and the only project in the account. No credentials are handled. Each result reports `transaction_read_only`. Every script was validated first on a disposable database, including that a write inside the same transaction is refused.

| Run | Script | Status |
|---|---|---|
| 1 | [`preflight-run1-amended.sql`](preflight-run1-amended.sql): schema, constraints, RLS, policies, access functions, triggers, default ACL, indexes, sizes, duplicates, marker-key match | **run 2026-10-17 18:47Z, `read_only: on`** |
| 2 | [`preflight-run2-plan.sql`](preflight-run2-plan.sql): the plan for revision 2's lookups, with the function's exact expressions (EXPLAIN only) | prepared and validated at production size (38 ms); not yet run |
| 3 | [`preflight-run3-categories.sql`](preflight-run3-categories.sql): table grants, column defaults, webhook dependencies, unmatched markers by category (counts only) | prepared; each of 9 planted markers classified correctly; 60 ms at production size; not yet run |

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
| Marker-key match | **1,096 of 2,103** markers match a current song of their show (Run 1's simple check; Run 3 also separates soft-deleted shows and wrong owners) | 1,007 unmatched: not interpreted until Run 3 categorizes them; not treated as lost counts; no backfill |
| Planned rows on complete shows | 4 | informational |
| CLI login role | `cli_login_postgres` exists, can log in, valid until **18:44:09Z** (already expired at the run) | the earlier CLI query did create or refresh it; managed by Supabase; not changed |

## Run 2: what it represents, and what it can and can't establish

**It mirrors revision 2's lookups exactly.** It's a single statement because the editor shows one result:

| Function step | Run 2 |
|---|---|
| `SELECT user_id FROM performances WHERE id = p_performance_id` | `v`, the same predicate |
| the loop query | `s`, the same filters (`artist_removed`, `source <> 'planned'`, non-blank title), the **same normalization expression** as `song_catalog_key` (inlined, because the function doesn't exist in production yet), and the same `DISTINCT ON (key) … ORDER BY key, position` |
| the marker insert's conflict check | `m`, an equality probe on `(user_id, performance_id, normalized_title)` with the show id **as text**, as the function writes it, and the normalized key |
| the catalogue upsert's conflict check | `us`, an equality probe on `(user_id, song_title)` with the exact title |

The two INSERTs themselves aren't in Run 2. An `INSERT … ON CONFLICT` always checks conflicts by probing its **arbiter unique index**; that's how PostgreSQL implements ON CONFLICT, not a planner choice. On the disposable stack, EXPLAIN of the two INSERTs names `user_song_performances_user_id_performance_id_normalized_ti_key` and `user_songs_user_id_song_title_key` (`final3/run2-on-disposable.log`). Both are confirmed present in production by Run 1, and the migration's precondition checks them.

**What a zero-id plan can establish**, using production's real table statistics:
- which access path the planner picks for each predicate: an index scan on each unique key, and the primary key for the show;
- that the catalogue tables are **not** scanned in full;
- that the show's songs are read with a sequential scan, because production has no index on `performance_songs.performance_id`, and the estimated cost of that scan.

None of that depends on the id. A sequential scan reads the whole table whatever the id; the index probes are equality lookups on unique keys.

**What it can't prove:**
- **Runtime:** EXPLAIN without ANALYZE executes nothing, so there's no measured time, no buffer or cache behaviour, and no actual row counts. The zero id matches no rows, so row estimates come from statistics, not a real show.
- **The plan PL/pgSQL actually uses:** the function runs these queries as prepared statements with parameters. PostgreSQL may switch to a generic plan after five executions. For equality on a unique key that's normally the same index probe, but Run 2 doesn't show it.
- **Contention:** lock waits on a song row another writer holds, statement timeouts (8 s for `authenticated`), and the Notion webhook trigger's cost in the same transaction.
- **The largest artist's case, and network/PostgREST overhead.**

**Runtime evidence is from the disposable stack only:** 1.2–1.6 ms of trigger time per 18-song completion at production sizes (`final2/perf-production-size.log`), with the same plan shape as Run 2 on that data (`final3/run2-on-disposable.log`).

## Run 3: unmatched-marker categories

Each marker falls in exactly one category, checked in this order: structural checks first, then whether the song is still in the show. The order is verified: one planted marker per category is classified correctly (`final3/run3-fixture-check.log`).

| Category | Meaning |
|---|---|
| `U1_marker_id_not_a_performance_id` | the marker's id isn't uuid-shaped |
| `U2_show_no_longer_exists` | no performance with that id |
| `U3_show_soft_deleted` | the show has `deleted_at` (the delete route removes markers, so any left are anomalies) |
| `U4_marker_user_is_not_show_owner` | the marker belongs to someone other than the show's artist |
| `M1_matched_kept_song` | the show has a kept song with this key |
| `M2_matched_song_now_removed_by_artist` | the only songs with this key were later marked removed |
| `U5_show_has_no_song_rows` | the show has no `performance_songs` at all (e.g. a legacy setlist) |
| `U6_song_not_in_show_but_in_artists_catalogue` | renamed or removed since; the title is still in the catalogue |
| `U7_song_not_in_show_nor_catalogue` | neither |

Each category is also broken down by show status, data source and the month written.

**None of these categories means "a count was lost".** A marker records that a song was counted for a show at the time. These categories describe where that song is now, and they don't authorize a backfill.
