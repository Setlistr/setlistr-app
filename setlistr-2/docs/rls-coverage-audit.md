# RLS Coverage Audit

Read-only audit. Reports what exists in the repo — no fixes proposed, no SQL written.

## Method

**(a) Tables defined in the repo:** every `CREATE TABLE` across `supabase-schema.sql`, `supabase/migrations/rd_log.sql`, `supabase/migrations/rd_log_daryl.sql` (inserts only, table created in `rd_log.sql`), and `lib/reconciliation/migration.sql` (the only other `.sql` file in the repo besides the three above — no `schema.sql` file exists; `supabase-schema.sql` at the repo root is the actual schema file).

**(b) Tables referenced in code:** every distinct `.from('<table>')` string across `.ts`/`.tsx` files, filtered to exclude non-Supabase `.from(...)` calls (e.g. `Array.from`, test-fixture noise) and Supabase Storage bucket calls (`.storage.from('<bucket>')` — a different namespace from `.from('<table>')`; `avatars` is a storage bucket, not a table, and is excluded from the table list below on that basis).

**9 tables are defined in the repo. 22 tables are referenced in code with no definition anywhere in the repo.** That's a much larger gap than the two known cases (`artist_delegates`, `publisher_roster_invites`) — the full list of undefined tables is below.

**Tables that would need a live database query to determine their real RLS state** (i.e. everything not defined in the repo): `artist_delegates`, `artists`, `audio_captures`, `beta_invites`, `catalogue_fallback`, `detection_events`, `manual_song_events`, `planned_setlists`, `planned_setlist_songs`, `publisher_accounts`, `publisher_roster`, `publisher_roster_invites`, `recognition_jobs`, `recognition_logs`, `recognition_results`, `setlist_items`, `setlists`, `shows`, `songs`, `user_song_performances`, `user_songs`, `waitlist`. For all of these, "RLS ENABLED" and "POLICIES" below are reported as `unknown-not-in-repo` — this is not the same finding as "RLS is off." It means the repo cannot answer the question either way.

---

## Tables defined in the repo (9)

### `profiles`
- **DEFINED IN REPO:** yes (`supabase-schema.sql`)
- **RLS ENABLED:** yes
- **POLICIES:** `profiles_self` — `FOR ALL USING (auth.uid() = id)`; `profiles_insert_self` — `FOR INSERT WITH CHECK (auth.uid() = id)`
- **ACCESS PATTERN:** Authenticated client, widely, always scoped to `.eq('id', user.id)` or equivalent (settings, show/new, live/[id], review/[id], etc.). Service-role client in admin/team/publisher routes, always after an app-level auth check. Consistent with the policy.

### `venues`
- **DEFINED IN REPO:** yes
- **RLS ENABLED:** yes
- **POLICIES:** `venues_read` — `FOR SELECT USING (true)` (fully public read, by design — shared venue directory); `venues_insert` — `FOR INSERT WITH CHECK (auth.uid() IS NOT NULL)`
- **ACCESS PATTERN:** Authenticated client only — `app/app/show/new/page.tsx` (`handleClone`) inserts a venue row. No service-role access found.

### `performances`
- **DEFINED IN REPO:** yes
- **RLS ENABLED:** yes
- **POLICIES:** `performances_own` — `FOR ALL USING (auth.uid() = user_id)`
- **ACCESS PATTERN:** Both. Authenticated client: `show/new`, `new`, `live/[id]`, `review/[id]` — inserts always set `user_id: user.id` explicitly; updates scoped by `.eq('id', performance.id)`, relying on the policy for ownership. Service role: `api/identify` (reads/writes `performance_id` supplied by an unauthenticated caller — see below), `api/admin/delete-show` (admin-gated), `api/account/delete` (self-scoped), `api/publisher/dashboard` / `api/publisher/artist-search` (admin-gated, roster-scoped `.in('user_id', artistIds)` / `.eq('user_id', match.id)`), `api/recent-songs` and `api/song-debuts` (self/delegation-scoped).

### `capture_sessions`
- **DEFINED IN REPO:** yes — but with a caveat (see below)
- **RLS ENABLED:** yes
- **POLICIES:** `capture_sessions_own` — `FOR ALL USING (EXISTS (SELECT 1 FROM performances WHERE id = performance_id AND user_id = auth.uid()))`
- **ACCESS PATTERN:** Authenticated client: `live/[id]/page.tsx` updates by `.eq('performance_id', performance.id)`. Service role: `api/admin/delete-show` (by `performance_id`, admin-gated), `api/account/delete` (by `.in('artist_id', idChunk)`).
- **Schema drift flag:** `supabase-schema.sql`'s `CREATE TABLE capture_sessions` has no `artist_id` column — only `performance_id`. `api/account/delete/route.ts` filters a delete on `capture_sessions` by `artist_id`. Either the production table has a column the repo's schema file doesn't reflect, or that delete call is targeting a column that doesn't exist. This audit can't resolve which from the repo alone — flagging it as a mismatch between the repo's schema file and what the app code assumes exists.
- **No `INSERT` into `capture_sessions` found anywhere in the repo** — rows are only ever updated or deleted by app code. Nothing in this codebase creates them.

### `performance_songs`
- **DEFINED IN REPO:** yes
- **RLS ENABLED:** yes
- **POLICIES:** `songs_own` — `FOR ALL USING (EXISTS (SELECT 1 FROM performances WHERE id = performance_id AND user_id = auth.uid()))`
- **ACCESS PATTERN:** Both, extensively. Authenticated client: `review/[id]/page.tsx` (`handleSave` — inserts/updates scoped by `.eq('id', s.id)` or `.eq('performance_id', ...)`, relying on the policy), `show/new`/`new` (inserts tied to a performance just created by the same user). Service role: `api/identify` and `api/performance-songs` — both already established (prior audit) as reachable with **no authentication at all**, using the service-role client, which bypasses this table's RLS policy entirely for those two paths. See Section C.

### `attachments`
- **DEFINED IN REPO:** yes
- **RLS ENABLED:** yes
- **POLICIES:** `attachments_own` — `FOR ALL USING (EXISTS (SELECT 1 FROM performances WHERE id = performance_id AND user_id = auth.uid()))`
- **ACCESS PATTERN:** Service role only — `api/account/delete/route.ts` reads `url` for a chunked list of the deleting user's own `performance_id`s. No authenticated-client access found anywhere in current code (this table may be a holdover from an earlier upload flow that's since been replaced).

### `rd_log`
- **DEFINED IN REPO:** yes (`supabase/migrations/rd_log.sql`)
- **RLS ENABLED:** yes
- **POLICIES:** `rd_log_superadmin_all` — `USING`/`WITH CHECK (auth.jwt() ->> 'email' IN ('jesse.slack.music@gmail.com', 'darylscottsongs@gmail.com'))`
- **ACCESS PATTERN:** Service role, via `api/rd-log/route.ts`, gated at the app level by `ADMIN_EMAILS` from `lib/admin-config.ts` (4 emails: the 2 in the SQL policy, plus `srclarke7@gmail.com` and `kode.roberts@gmail.com`).
- **Mismatch:** the app-level gate (4 emails) is broader than the SQL policy (2 emails). Currently masked because the route uses the service-role client, which bypasses the policy entirely — but the policy itself would reject 2 of the 4 admins the app considers authorized, if this table were ever queried through the authenticated client instead. Flagged for Section C.

### `reconciliation_runs`
- **DEFINED IN REPO:** yes (`lib/reconciliation/migration.sql`)
- **RLS ENABLED:** yes
- **POLICIES:** NONE — the migration file's own comment states this is deliberate: *"RLS enabled, no policies — anon/authenticated clients get zero access. Only the service-role key... can read/write these tables."*
- **ACCESS PATTERN:** Service role only. `lib/reconciliation/db.ts` (CLI script, per its own comment never reachable from a browser or an authenticated route), `app/app/admin/page.tsx` (admin-gated), `api/admin/run-reconciliation` (admin-gated). No authenticated-client access found — matches the documented design.

### `reconciliation_conclusions`
- **DEFINED IN REPO:** yes (same file)
- **RLS ENABLED:** yes
- **POLICIES:** NONE (same stated design as above)
- **ACCESS PATTERN:** Same as `reconciliation_runs` — service role only, matches documented design.

---

## Tables referenced in code but NOT defined anywhere in the repo (22)

### `artist_delegates` *(known case)*
- **DEFINED IN REPO:** no
- **RLS ENABLED:** unknown-not-in-repo
- **POLICIES:** unknown-not-in-repo (none can be quoted — no `CREATE TABLE` or `CREATE POLICY` for it exists)
- **ACCESS PATTERN:** Service role only — `api/team/accept`, `api/team/invite`, `api/team/managed-artists`, `api/team/delegates`, `api/team/context-data`, `api/admin/assign-delegate`, `api/song-debuts`, `api/account/delete` (cleanup). Every one of these routes performs its own delegation-row check in application code before touching this table. No authenticated-client (browser) access found.

### `artists`
- **DEFINED IN REPO:** no
- **RLS ENABLED:** unknown-not-in-repo
- **POLICIES:** unknown-not-in-repo
- **ACCESS PATTERN:** Service role only — `api/account/delete/route.ts`, self-scoped (`.eq('user_id', userId)` then `.in('id', artistIds)` derived from that same lookup). **No `INSERT` into `artists` found anywhere in the repo** — the table is only ever selected from and deleted from here. Whatever populates it is not in this codebase.

### `audio_captures`
- **DEFINED IN REPO:** no
- **RLS ENABLED:** unknown-not-in-repo
- **POLICIES:** unknown-not-in-repo
- **ACCESS PATTERN:** Service role only. `api/identify/route.ts` — INSERT, part of the same unauthenticated write path already flagged in the prior API-auth audit (no session check at all on that route). `lib/reconciliation/db.ts` — read, CLI-only. `api/account/delete/route.ts` — self-scoped select/delete via the user's own `artist_id`s.

### `beta_invites`
- **DEFINED IN REPO:** no
- **RLS ENABLED:** unknown-not-in-repo
- **POLICIES:** unknown-not-in-repo
- **ACCESS PATTERN:** `middleware.ts` — authenticated (anon-key, session-cookie) client, but every query is scoped to `.eq('email', email)` where `email` comes from the caller's own session, not from any caller-supplied value — a session-identity-scoped pattern, not an id-trusting one. `app/app/admin/page.tsx` and `api/admin/beta-invite/route.ts` — service role, both admin-gated. No browser access outside middleware.

### `catalogue_fallback`
- **DEFINED IN REPO:** no
- **RLS ENABLED:** unknown-not-in-repo
- **POLICIES:** unknown-not-in-repo
- **ACCESS PATTERN:** Service role only, `api/identify/route.ts`, read-only, keyed by `normalized_title` — appears to be a shared reference table (not per-user data), so an unauthenticated read here doesn't expose user data. Low severity given what it holds, but the access itself is still unauthenticated.

### `detection_events`
- **DEFINED IN REPO:** no
- **RLS ENABLED:** unknown-not-in-repo
- **POLICIES:** unknown-not-in-repo
- **ACCESS PATTERN:** Both. **Authenticated client:** `live/[id]/page.tsx` and `review/[id]/page.tsx` — SELECT scoped only by `.eq('performance_id', performance.id)`, with no `user_id`/ownership check in the query itself; relies entirely on RLS (state unknown) to stop one user from reading another's detection events by performance id. **Service role:** `api/identify/route.ts` (INSERT, no auth at all — established finding), `app/app/admin/page.tsx` (admin-gated), `api/admin/delete-show` (admin-gated), `api/account/delete` (self-scoped).

### `manual_song_events`
- **DEFINED IN REPO:** no
- **RLS ENABLED:** unknown-not-in-repo
- **POLICIES:** unknown-not-in-repo
- **ACCESS PATTERN:** Service role only — `api/account/delete/route.ts`, self-scoped delete (`.in('performance_id', idChunk)` and `.eq('user_id', userId)`). **No `INSERT` found anywhere in the repo** — same pattern as `artists`: something writes to this table that isn't in this codebase.

### `planned_setlists`
- **DEFINED IN REPO:** no
- **RLS ENABLED:** unknown-not-in-repo
- **POLICIES:** unknown-not-in-repo
- **ACCESS PATTERN:** Authenticated client: `show/new`/`new` (INSERT with explicit `user_id: userId`); `live/[id]/page.tsx` and `components/PlannedVsPlayed.tsx` (SELECT scoped only by `.eq('performance_id', performanceId)`, no ownership check in-query). Service role: `api/identify/route.ts` (read), `lib/reconciliation/db.ts` (read, CLI-only).

### `planned_setlist_songs`
- **DEFINED IN REPO:** no
- **RLS ENABLED:** unknown-not-in-repo
- **POLICIES:** unknown-not-in-repo
- **ACCESS PATTERN:** Same shape as `planned_setlists` — authenticated client INSERT (`show/new`/`new`) and unscoped-by-owner SELECT (`live/[id]`, `PlannedVsPlayed.tsx`, both filtered only by `.eq('planned_setlist_id', ...)`); service role read in `api/identify` and `lib/reconciliation/db.ts`.

### `publisher_accounts`
- **DEFINED IN REPO:** no
- **RLS ENABLED:** unknown-not-in-repo
- **POLICIES:** unknown-not-in-repo
- **ACCESS PATTERN:** Service role only, `api/publisher/dashboard/route.ts`, admin-gated, read by a caller-supplied `publisher_id` query param — trusts input in principle, moot while the route is admin-only.

### `publisher_roster`
- **DEFINED IN REPO:** no
- **RLS ENABLED:** unknown-not-in-repo
- **POLICIES:** unknown-not-in-repo
- **ACCESS PATTERN:** Service role only, all three call sites admin-gated: `api/publisher/dashboard`, `api/publisher/roster/add`, `api/publisher/artist-search`.

### `publisher_roster_invites` *(known case)*
- **DEFINED IN REPO:** no
- **RLS ENABLED:** unknown-not-in-repo
- **POLICIES:** unknown-not-in-repo
- **ACCESS PATTERN:** Service role only — `api/publisher/invite/route.ts` (now admin-gated as of the most recent merge to `main`) and `api/publisher/artist-search/route.ts` (read, admin-gated).

### `recognition_jobs`
- **DEFINED IN REPO:** no
- **RLS ENABLED:** unknown-not-in-repo
- **POLICIES:** unknown-not-in-repo
- **ACCESS PATTERN:** Service role only — `api/identify/route.ts` (insert/update, same unauthenticated-route context as its sibling writes there), `lib/reconciliation/db.ts` (read, CLI-only).

### `recognition_logs`
- **DEFINED IN REPO:** no
- **RLS ENABLED:** unknown-not-in-repo
- **POLICIES:** unknown-not-in-repo
- **ACCESS PATTERN:** Service role only — `api/identify/route.ts` (insert), `lib/reconciliation/db.ts` (read, CLI-only).

### `recognition_results`
- **DEFINED IN REPO:** no
- **RLS ENABLED:** unknown-not-in-repo
- **POLICIES:** unknown-not-in-repo
- **ACCESS PATTERN:** Service role only — `api/identify/route.ts` (insert). No other reference anywhere in the repo; nothing reads this table in current code.

### `setlist_items`
- **DEFINED IN REPO:** no
- **RLS ENABLED:** unknown-not-in-repo
- **POLICIES:** unknown-not-in-repo
- **ACCESS PATTERN:** Both, and the highest-severity item in this "undefined" group. **Authenticated client:** `review/[id]/page.tsx` (SELECT/DELETE/INSERT, scoped only by `.eq('setlist_id', setlistId)`, no ownership check in-query) and `live/[id]/page.tsx` (same pattern). **Service role:** `api/identify/route.ts` (INSERT/SELECT — no auth at all, established finding) and `api/performance-songs/route.ts` (SELECT — no auth at all, established finding), plus `api/admin/delete-show` (admin-gated delete).

### `setlists`
- **DEFINED IN REPO:** no
- **RLS ENABLED:** unknown-not-in-repo
- **POLICIES:** unknown-not-in-repo
- **ACCESS PATTERN:** Authenticated client: `review/[id]/page.tsx` and `live/[id]/page.tsx` — UPDATE scoped only by `.eq('id', setlistId)`, no ownership check in-query. Service role: `api/performance-songs/route.ts` (SELECT — no auth at all), `api/admin/delete-show` (admin-gated delete).

### `shows`
- **DEFINED IN REPO:** no
- **RLS ENABLED:** unknown-not-in-repo
- **POLICIES:** unknown-not-in-repo
- **ACCESS PATTERN:** Authenticated client: `show/new`, `new`, `show/upload` (INSERT with `created_by: user.id`); `review/[id]/page.tsx` and `live/[id]/page.tsx` (UPDATE status, scoped only by `.eq('id', performance.show_id)` / `.eq('id', showId)`, no ownership check in-query). Service role: `api/admin/delete-show` (admin-gated delete/force-complete).
- Same shape as `setlists`/`setlist_items`: the update-by-bare-id pattern from the browser depends entirely on an RLS policy this audit cannot confirm exists.

### `songs`
- **DEFINED IN REPO:** no
- **RLS ENABLED:** unknown-not-in-repo
- **POLICIES:** unknown-not-in-repo
- **ACCESS PATTERN:** Service role only, `api/account/delete/route.ts`, self-scoped delete via `.in('artist_id', idChunk)` derived from the deleting user's own artist ids. Same "nothing inserts into this table anywhere in the repo" pattern as `artists` and `manual_song_events`.

### `user_song_performances`
- **DEFINED IN REPO:** no
- **RLS ENABLED:** unknown-not-in-repo
- **POLICIES:** unknown-not-in-repo
- **ACCESS PATTERN:** Authenticated client only — `live/[id]/page.tsx` and `review/[id]/page.tsx`, INSERT-only, with an explicit `user_id: userId` field set client-side and a unique-constraint dedup guard (error code `23505` is caught and swallowed). No SELECT/UPDATE/DELETE found anywhere. Low blast radius even if RLS is absent — worst case is a spurious dedup-guard row, not exposure of real data.

### `user_songs`
- **DEFINED IN REPO:** no
- **RLS ENABLED:** unknown-not-in-repo
- **POLICIES:** unknown-not-in-repo
- **ACCESS PATTERN:** Both, extensively — this is the largest access surface of any undefined table. **Authenticated client:** `settings`, `review/[id]`, `live/[id]`, `stats`, `proof`, `CatalogSearch.tsx` are all scoped by `.eq('user_id', userId)` on their SELECT/INSERT calls. **`components/MySongsTab.tsx` is the exception:** `saveEdit()` does `UPDATE ... .eq('id', editingSong.id)` and `deleteSong()` does `DELETE ... .eq('id', song.id)` — **neither includes a `user_id` filter in the query itself.** Both rely entirely on RLS (state unknown) to stop a session from editing or deleting another user's catalog row (song title, ISRC, composer, publisher) by id. **Service role:** `api/identify` and `api/parse-setlist` (self-scoped by a session-derived `userId`), `api/recent-songs` (self-scoped), `api/spotify-import` (self-scoped, uses the session client, not service role), `api/admin/spotify-import` and `api/admin/preload-setlist` (admin-gated, arbitrary `user_id` — acceptable since admin-only), `lib/reconciliation/db.ts` (read, CLI-only).

### `waitlist`
- **DEFINED IN REPO:** no
- **RLS ENABLED:** unknown-not-in-repo
- **POLICIES:** unknown-not-in-repo
- **ACCESS PATTERN:** Authenticated-client-library-but-unauthenticated-caller — `components/WaitlistForm.tsx` and `app/auth/login/page.tsx`, INSERT only, no session required (this is a public marketing signup form, so that's presumably intentional). No SELECT found anywhere in the app code. Low severity for the same reason as `user_song_performances`: worst case if RLS is absent is that the anon key could also read the full waitlist (email addresses), since nothing in-app currently does that, but nothing in the repo rules it out either.

---

## A. Tables with no RLS reached by the authenticated client

None of the 9 repo-defined tables have RLS off or no policy while also being reached by the authenticated client — `reconciliation_runs`/`reconciliation_conclusions` are the only defined tables with zero policies, and both are confirmed, by their own migration comment and by every access site found, to be reached exclusively through the service-role client. So there is no case in this repo where a defined table's RLS is verifiably off or empty *and* the authenticated client reaches it.

The real exposure surface is different in shape from what this section's framing assumes, and is worth stating plainly: **13 of the 22 undefined tables are reached directly by the authenticated (anon-key) client from browser code, with query-level ownership checks that only cover part of the operation — and this repo cannot confirm whether RLS exists on any of them.** If RLS is off (or missing a policy) on any one of these, the data exposed is:

- **`detection_events`** — a performance's full detection history (song titles, confidence scores, timestamps) readable by anyone who knows/guesses a `performance_id`.
- **`setlist_items`**, **`setlists`** — a performance's setlist content, readable/writable by anyone who knows a `setlist_id`; `setlist_items` is also insertable/deletable this way.
- **`shows`** — a show's status/metadata updatable by anyone who knows a `show_id` (no ownership check in the update query).
- **`planned_setlists`**, **`planned_setlist_songs`** — a performance's pre-show planned setlist, readable by anyone who knows a `performance_id` / `planned_setlist_id`.
- **`user_songs`** (via `MySongsTab.tsx` specifically) — any catalog row (song title, ISRC, composer, publisher) editable or deletable by anyone who knows its row id, regardless of who owns it.
- **`user_song_performances`**, **`waitlist`** — lower severity (insert-only, no sensitive read path currently exists in-app), but not verifiably protected either.

The severity of all of the above hinges entirely on RLS state this audit cannot determine. That is itself the finding: this is a large surface area of "the app's only protection is a policy nobody can currently point to."

## B. Tables reached only via service role

| Table | Reason |
|---|---|
| `reconciliation_runs`, `reconciliation_conclusions` | Genuine — by explicit design (migration comment: CLI-only engine, RLS on with zero policies on purpose). |
| `artist_delegates` | Workaround-shaped but arguably necessary: no ownership model maps a session directly to this table the way `auth.uid() = user_id` does elsewhere (a caller can be *either* the artist *or* an accepted delegate), so every route re-implements the check in application code before using the service-role client. Not "no policy exists because nobody wrote one" so much as "the ownership model here isn't a single-column check RLS can express as cleanly," but the practical effect is the same: RLS plays no role, all enforcement is in TypeScript. |
| `publisher_accounts`, `publisher_roster`, `publisher_roster_invites` | Workaround, explicitly acknowledged in the code itself — three separate sibling routes carry the identical comment: *"no real publisher auth model exists yet... Gated behind admin for now."* This is application-code-only enforcement standing in for an RLS/ownership model that hasn't been built. |
| `beta_invites` | Workaround-leaning: no policy is confirmable, but the one authenticated-client access site (`middleware.ts`) scopes by session-derived email, which is a reasonable pattern even without RLS. The two service-role sites are admin-gated. Lower risk than the publisher tables, but still unconfirmed. |
| `audio_captures`, `recognition_jobs`, `recognition_logs`, `recognition_results`, `catalogue_fallback` | Mixed — CLI/backend reads (`lib/reconciliation/db.ts`) are a genuine bypass need (cross-user reconciliation aggregation, same posture as the two reconciliation tables). But the writes from `api/identify/route.ts` happen on a route with **no authentication of any kind**, so service-role use there isn't "bypassing a policy for a legitimate cross-user operation" — it's "the only thing making the writes work at all, because nothing else does." |
| `attachments` | Cross-user-adjacent but self-scoped in practice: the only access site (`account/delete`) derives the `performance_id`s it queries from that same user's own performances first. Genuine need for service role (deleting another user's data isn't the operation here — cleaning up the *current* user's storage objects is), even though the row-level check happens in application code rather than via the `attachments_own` RLS policy that exists for this exact purpose. |
| `artists`, `songs`, `manual_song_events` | Genuine, self-scoped, and narrow: only reachable from `account/delete`, and always scoped to the deleting user's own derived ids. Worth separately noting (not a security finding, but relevant to completeness): nothing in this repo ever **writes** to these three tables — only `account/delete` selects from / deletes from them. Whatever creates these rows isn't in this codebase. |
| `rd_log` | Genuine — the app-level `ADMIN_EMAILS` gate happens before the service-role client is used, consistent with how every other admin route in this repo works. Not a policy workaround; RLS here is a real, if narrower (2 vs. 4 emails), backstop that happens to never get exercised because the route never uses the authenticated client. |

## C. Policies that do not match access patterns

1. **`performances` / `performance_songs`** *(the known case)* — both carry a real, correctly-authored `auth.uid() = user_id` (or performance-ownership-subquery) policy. But the app's delegation model (`artist_delegates`) expects a delegate to read/act on an artist's performances too, and RLS has no knowledge of `artist_delegates` at all — a delegate hitting either table through the *authenticated* client would be blocked by the policy, which is presumably why the delegation-aware routes (`song-debuts`, `context-data`, `managed-artists`) all reach these tables via the *service-role* client instead, re-implementing the ownership check in application code rather than relying on the policy. The policy is narrower than what the product needs, and the app works around it rather than extending it.

2. **`rd_log`** — the reverse shape of the same problem: the SQL policy (`jesse.slack.music@gmail.com`, `darylscottsongs@gmail.com` — 2 emails) is *narrower* than the app-level `ADMIN_EMAILS` gate in `lib/admin-config.ts` (4 emails, adding `srclarke7@gmail.com` and `kode.roberts@gmail.com`). Currently harmless because `api/rd-log/route.ts` uses the service-role client and never exercises the policy — but if that route (or any future one) ever queried `rd_log` through the authenticated client instead, 2 of the 4 people the app considers admins would be rejected by the database despite passing the app-level check.

3. **`venues`** — not a mismatch, but worth naming as the inverse case: `venues_read` is `USING (true)`, a deliberately public policy for a shared directory. No app code needs — or gets — anything narrower here. Included for completeness since it's the one case in the repo where a fully open policy is clearly intentional rather than an oversight.

4. **The 13 undefined-but-browser-reached tables in Section A** are, structurally, all potential instances of this same category — a policy (or its absence) not matching what the app's query shape assumes — but this audit can't confirm whether a mismatch actually exists for any of them, only that the app's queries assume row-level protection the repo cannot verify is there. Listed in Section A rather than repeated here to avoid double-counting.
