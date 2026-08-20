# Attribution Audit — INSERTs on ownership columns vs. acting-as context

Read-only. Scope: every `INSERT` touching `performances`, `shows`, `setlists`, `setlist_items`, `planned_setlists`, `planned_setlist_songs`, `user_songs`, `user_song_performances`, `user_song_rejections`, `manual_song_events`, plus every read of `localStorage['setlistr_acting_as']` anywhere in the codebase.

## Summary

Of the 10 tables in scope, only **6** have any INSERT that sets an ownership column at all. Of those 6, **every single INSERT sets the ownership column from the session user (`user.id`/`auth.getUser()`), never from acting-as context** — with exactly one exception: `MySongsTab.tsx`'s insert into `user_songs`, which receives an already-resolved `userId` prop from its one caller (`stats/page.tsx`), and that caller *does* correctly resolve it from acting-as context first. That makes it the only ownership-column write in this codebase that is delegate-aware, and it's indirect — the component itself never reads `localStorage`.

3 of the 10 tables have no qualifying data at all: `setlist_items` and `planned_setlist_songs` have INSERTs but no ownership column is ever set on them (ownership is purely transitive through a parent row); `setlists`, `user_song_rejections`, and `manual_song_events` have no INSERT anywhere in this codebase.

---

## A. `performances` — ownership column: `user_id`

| # | File / function | Line | Acting-as read in this file? | Used for `user_id`? |
|---|---|---|---|---|
| 1 | `app/app/show/new/page.tsx`, `handleSubmit` | `515: started_at: new Date().toISOString(), user_id: user.id,` | Yes, line 505 | **No** — only `captured_by`/`captured_by_name` (lines 516-517) |
| 2 | `app/app/show/new/page.tsx`, `handleClone` | `563: user_id: user.id,` | Yes, line 552 | **No** — only `captured_by`/`captured_by_name` (lines 564-565) |
| 3 | `app/app/show/upload/page.tsx`, `handleSubmit` | `137: user_id: user.id,` | **Never reads it** — no acting-as handling anywhere in this file, not even for `captured_by` | n/a |
| 4 | `app/app/new/page.tsx`, `handleSubmit` | `363: started_at: new Date().toISOString(), user_id: user.id,` | Yes, line 353 | **No** — only `captured_by`/`captured_by_name` (lines 364-365) |
| 5 | `app/app/new/page.tsx`, `handleClone` | `410: user_id: user.id,` | Yes, line 399 | **No** — only `captured_by`/`captured_by_name` (lines 411-412) |
| 6 | `app/api/setlistfm/route.ts`, `POST` (bulk import) | `114: user_id: user.id,` | Can't — server route, no `localStorage`. No `artist_id`/acting-as parameter is even accepted in the request body (`{ shows, artistName, totalShows, careerStartYear }`) | n/a |

## B. `shows` — ownership column: `created_by`

| # | File / function | Line | Acting-as read in this file? | Used for `created_by`? |
|---|---|---|---|---|
| 1 | `app/app/show/new/page.tsx`, `handleSubmit` | `502: started_at: new Date().toISOString(), status: 'live', created_by: user.id,` | Yes, line 505 (read *after* this insert) | **No** |
| 2 | `app/app/show/new/page.tsx`, `handleClone` | `549: started_at: new Date().toISOString(), status: 'completed', created_by: user.id` | Yes, line 552 (read *after* this insert) | **No** |
| 3 | `app/app/show/upload/page.tsx`, `handleSubmit` | `122: created_by: user.id,` | Never reads it | n/a |
| 4 | `app/app/new/page.tsx`, `handleSubmit` | `350: started_at: new Date().toISOString(), status: 'live', created_by: user.id,` | Yes, line 353 (read *after*) | **No** |
| 5 | `app/app/new/page.tsx`, `handleClone` | `396: started_at: new Date().toISOString(), status: 'completed', created_by: user.id` | Yes, line 399 (read *after*) | **No** |

Worth noting the ordering in all 4 acting-as-reading cases: the `shows` insert happens *before* `localStorage.getItem('setlistr_acting_as')` is even called in the function. The acting-as value couldn't have influenced `created_by` even if the code wanted it to — it isn't read yet at that point.

## C. `setlists` — no INSERT found

Zero `INSERT` into `setlists` anywhere in this codebase — only `UPDATE` (`review/[id]/page.tsx:798`, `live/[id]/page.tsx:562`), `DELETE` (`api/admin/delete-show/route.ts:54`), and `SELECT` (`api/performance-songs/route.ts:47`). Whatever creates `setlists` rows isn't in this repo. (This echoes the same pattern found for `artists`/`songs`/`manual_song_events` in the earlier RLS coverage audit — tables this codebase only ever reads/updates/deletes, never creates.)

## D. `setlist_items` — INSERTs exist, but no ownership column is ever set

| # | File / function | Line |
|---|---|---|
| 1 | `app/app/review/[id]/page.tsx`, `handleSave` | `794: await supabase.from('setlist_items').insert(kept.map((s, i) => { ... }))` |
| 2 | `app/app/live/[id]/page.tsx`, `handleEnd` | `560: await supabase.from('setlist_items').insert(manualSongs.map((song, i) => ({ setlist_id: setlistId, title: song.title, artist_name: song.artist || performance.artist_name, position: startPosition + i, source: 'manual' })))` |
| 3 | `app/api/identify/route.ts`, `POST` | `494: const { data: newItem } = await supabase.from('setlist_items').insert({ setlist_id: setlistId, title, artist_name: artist, position: (lastItem?.position || 0) + 1, source, }).select().single()` |

None of the three set `user_id`, `created_by`, or `artist_id` — the only fields are `setlist_id`, `title`, `artist_name`, `position`, `source`, and (site 1 only) `recognition_decision_id`. Ownership is entirely transitive, via `setlist_id → setlists.show_id → shows.created_by` (per the `setlist_items_self` policy in `supabase/migrations/0001_baseline.sql`). There's no ownership column here for acting-as context to reach even in principle.

## E. `planned_setlists` — ownership column: `user_id`

| # | File / function | Line | Acting-as read? |
|---|---|---|---|
| 1 | `app/app/show/new/page.tsx`, `savePlannedSetlist(performanceId, userId, resolvedVenueId)` | `463: user_id: userId, performance_id: performanceId,` | This function doesn't read `localStorage` itself — it receives `userId` as a parameter. Its one call site, `handleSubmit` at line 521, calls `savePlannedSetlist(performance.id, user.id, resolvedVenueId)` — passing the session user's id, not `actingAsCtx`, even though `actingAsCtx` was already parsed earlier in the same function (line 506) and was available. |
| 2 | `app/app/new/page.tsx`, `savePlannedSetlist(performanceId, userId, resolvedVenueId)` | `311: user_id: userId, performance_id: performanceId,` | Same shape — called from `handleSubmit` at line 368 as `savePlannedSetlist(performance.id, user.id, resolvedVenueId)`, session user again, `actingAsCtx` (parsed at line 354) unused for this call. |

## F. `planned_setlist_songs` — no ownership column set

| # | File / function | Line |
|---|---|---|
| 1 | `app/app/show/new/page.tsx`, `savePlannedSetlist` | `468-470: await supabase.from('planned_setlist_songs').insert(plannedSongs.map((s, i) => ({ planned_setlist_id: ps.id, title: s.title, artist: s.artist, position: i })))` |
| 2 | `app/app/new/page.tsx`, `savePlannedSetlist` | `316-318`, identical shape |

Only `planned_setlist_id`, `title`, `artist`, `position` — no direct ownership column, same transitive-only pattern as `setlist_items` (via `planned_setlist_id → planned_setlists.user_id`).

## G. `user_songs` — ownership column: `user_id`

| # | File / function | Line | Acting-as read in this file? | Used for `user_id`? |
|---|---|---|---|---|
| 1 | `app/app/review/[id]/page.tsx`, `writeUserSongFromReview(supabase, title, artist, userId, performanceId)` | `130-133: await supabase.from('user_songs').insert({ user_id: userId, ... })` | File never reads it. Call site (`review/[id]/page.tsx:894`) passes `user.id` (session), not any acting-as value. | No |
| 2 | `app/app/live/[id]/page.tsx`, `writeUserSong(supabase, title, artist, userId, performanceId)` | `120: await supabase.from('user_songs').insert({ user_id: userId, ... })` | File never reads it. Call site (`live/[id]/page.tsx:379`) passes `user.id` (session). | No |
| 3 | `app/api/identify/route.ts`, `writeToUserSongs(title, artist, userId, performanceId)` | `200-206: await supabase.from('user_songs').insert({ user_id: userId, ... })` | Server route; `userId` here is either an optional caller-supplied header value or resolved from the performance row's own `user_id` — not acting-as context (this route has no concept of it). | n/a |
| 4 | `app/api/admin/preload-setlist/route.ts`, `POST` | `50: const { error } = await supabase.from('user_songs').insert(toInsert)` | Admin tool. `user_id` comes from an admin-supplied `user_id` field in the request body — an explicit arbitrary target, not session, not acting-as. Different category from the rest of this table. |
| 5 | `app/api/admin/spotify-import/route.ts`, `POST` | `111: const { error } = await adminSupa.from('user_songs').insert({ ... })` | Same — admin tool, explicit `user_id` from request body. |
| 6 | `app/api/spotify-import/route.ts`, `POST` | `168-169: .from('user_songs').insert(rows)` (each row carries `user_id: user.id`, set earlier in the same function) | Self-service route, session-scoped only; no acting-as parameter accepted. |
| 7 | `components/MySongsTab.tsx`, `addSong` | `454-463: const { data, error } = await supabase.from('user_songs').insert({ user_id: userId, ... })` | **The one exception.** `MySongsTab.tsx` never reads `localStorage` itself — `userId` is a prop. Its only caller, `app/app/stats/page.tsx`, resolves it at lines 75-85: reads `ACTING_AS_KEY` from `localStorage`, and sets `const targetUserId = actingAsArtistId \|\| user.id` — **acting-as context wins when present.** This is the only ownership-column INSERT in the whole audit that ends up delegate-aware, and it's one level removed from the actual insert call. |

## H. `user_song_performances` — ownership column: `user_id`

| # | File / function | Line | Acting-as read? |
|---|---|---|---|
| 1 | `app/app/review/[id]/page.tsx`, `writeUserSongFromReview` | `116-118: await supabase.from('user_song_performances').insert({ user_id: userId, performance_id: performanceId, normalized_title: normalizedTitle })` | Same as its sibling `user_songs` insert in the same function — `userId` param is `user.id` from the call site, not acting-as. |
| 2 | `app/app/live/[id]/page.tsx`, `writeUserSong` | `114: const { error: guardError } = await supabase.from('user_song_performances').insert({ user_id: userId, ... })` | Same — session user via call site, not acting-as. |
| 3 | `app/api/identify/route.ts`, `writeToUserSongs` | `176-178: .from('user_song_performances').insert({ user_id: userId, performance_id: performanceId, normalized_title: normalizedTitle })` | Server route, same `userId` resolution as its `user_songs` insert above (site G-3) — not acting-as. |

## I. `user_song_rejections` — no reference anywhere

Zero matches for `user_song_rejections` anywhere in the codebase — not just no INSERT, no read/update/delete either. It only appears in `supabase/migrations/0001_baseline.sql` (one RLS policy, `user_song_rejections_self`) and in this session's earlier `docs/rls-coverage-audit.md`. Whatever populates or reads this table isn't in this repo at all.

## J. `manual_song_events` — no INSERT found

The only references anywhere in the codebase are in `app/api/account/delete/route.ts` (two `DELETE` calls, cleanup on account deletion, by `performance_id` and by `user_id`). No `INSERT`/`UPDATE`/`SELECT` exists anywhere. Same "this repo only tears these rows down, never builds them" pattern as `setlists`, `artists`, and `songs`.

---

## K. Every read of `localStorage['setlistr_acting_as']`

| # | Path | Line | What it does with the value |
|---|---|---|---|
| 1 | `app/app/show/new/page.tsx` | 505 (`handleSubmit`) | Parses it into `actingAsCtx`; used only to set `captured_by`/`captured_by_name` on the `performances` insert (lines 516-517) — never `user_id`. |
| 2 | `app/app/show/new/page.tsx` | 552 (`handleClone`) | Same, into `actingAsCtx2`, same `captured_by`/`captured_by_name`-only usage (lines 564-565). |
| 3 | `app/app/new/page.tsx` | 353 (`handleSubmit`) | Same pattern as #1. |
| 4 | `app/app/new/page.tsx` | 399 (`handleClone`) | Same pattern as #2. |
| 5 | `app/app/dashboard/page.tsx` | 169 (page-load effect) | Restores a previously-saved acting-as context on load: parses it, checks the saved `artist_id` is still in the user's `managed` list (from `/api/team/managed-artists`), and if so calls `setActingAs(parsed)` + `loadDelegateContext(...)`. If the saved artist is no longer managed, or parsing fails, calls `localStorage.removeItem(ACTING_AS_KEY)` (lines 178-179). This is also the **only writer**: `switchToArtist` (line 296) does `localStorage.setItem(ACTING_AS_KEY, JSON.stringify({ artist_id, artist_name }))`, and `switchToOwn` (line 303) does `localStorage.removeItem(ACTING_AS_KEY)`. |
| 6 | `app/app/career-map/page.tsx` | 47 (`loadLocations` effect) | Parses it, extracts `artist_id` into `actingAsArtistId`, and if present fetches `/api/team/context-data?artist_id=${actingAsArtistId}` instead of querying the user's own performances directly. Read-only use, no insert anywhere in this file. |
| 7 | `app/app/stats/page.tsx` | 77 (page-load effect) | Parses it, extracts `artist_id` into `actingAsArtistId`. Used three ways: (a) `const targetUserId = actingAsArtistId \|\| user.id` → passed as the `userId` prop into `<MySongsTab userId={userId} />` (line 687) — the one case in this whole audit where acting-as context reaches an INSERT's ownership column; (b) drives which branch fetches performance/song data — `/api/team/context-data` + `/api/song-debuts?userId=${actingAsArtistId}` when acting as someone, direct `.eq('user_id', user.id)` queries otherwise; (c) no direct INSERT in this file itself. |

No other file in the codebase reads or writes this key.

No files other than this one (`docs/attribution-audit.md`) were created or modified.
