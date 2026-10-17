# Data-integrity open issues

Known problems that need separate work. Nothing here is fixed. **No SQL, migration or backfill is authorized for any of them yet.**

## 1. Song catalogue counts can be lost permanently (review save)

**Status:** open, recorded 2026-10-16. Needs separate database work.

**Where:** `writeUserSongFromReview` in `app/app/review/[id]/page.tsx`. It runs after a confirmed review save, once per kept song, as separate client requests:

1. Insert a per-show marker in `user_song_performances` (unique per user, performance and normalized title).
2. Read the song's `user_songs` row.
3. Increment `confirmed_count`, or insert the row with count 1.

**Failure:** step 1 succeeds, then step 2 or 3 fails (connection, timeout, rejection). The marker now exists, so every later save of that show gets 23505 at step 1 and skips the count. **That show's count for that song is lost for good**, and nothing in the app can detect or repair it. `main` has the same code.

The reverse order (count first, marker second) would trade lost counts for double counts on retry. Neither order is safe as separate requests.

**Effects of a missing count:**

- **Career → My Songs:** song play counts and ordering.
- **Career overview:** song statistics read from `user_songs`.
- **Tonight's moments ("First appearance on your record"):** reads `confirmed_count = 1`, so a returning song whose increment was lost can look like a first appearance.
- **Live capture catalogue** (`app/api/identify`): uses *membership* in `user_songs`, not the count. So a lost increment doesn't affect it, but a song whose first `user_songs` insert failed is missing from the artist's catalogue for future capture matching.
- **Song search** (`components/CatalogSearch.tsx`): ranks by `confirmed_count`.

**Mitigation in place (not a repair):** the review save tracks whether every catalogue write landed. If any failed, Tonight's moments makes no first-appearance claims for that save. Missing counts stay missing.

**Repair needed (separate, needs approval):** one atomic database function, called once per song, that inserts the marker and increments or creates the `user_songs` row in a single transaction, and does nothing if the marker already exists. A retry is then safe in both directions. Recounting existing data would be a separate, explicitly approved backfill; none is authorized.

## 2. notion-sync can count a duplicated webhook delivery twice

**Status:** open, recorded 2026-10-16.

`app/api/notion-sync/route.ts` now counts a performance only on the update that moves it into `'complete'` (`lib/notion-sync-events.ts`). Later edits no longer count: re-save, submission, photo, delete and undo. A payload with no previous status doesn't count either.

**Still open:** if the same completion event is delivered twice (a webhook retry), it is counted twice. The handler keeps no record of what it has already counted, and the Notion counter is read-then-written, so two concurrent deliveries can also race. Exactly-once counting is **not** claimed. A fix needs a stored processed-event or processed-performance marker (database work) or a Notion-side check.

**Also not verified from the repo:** the webhook is configured in the Supabase dashboard, so whether it is active, and which events it sends, isn't visible here.

**Existing counter values** are not corrected (no backfill).

## 3. Background catalogue work stops if the page is closed or reloaded

**Status:** open, measured 2026-10-17 (local, 18-song show, 150ms added latency per request). Not fixed.

Since the celebration appears as soon as the required save is confirmed (commit fd60200), the catalogue writes from issue 1, the show-intelligence reads and the show number run **after** the summary is on screen, in the page itself.

- **In-app navigation** (e.g. "Back to your record" the moment the summary appears): the work keeps running and completes. Measured: 1/18 songs done when the artist left, 18/18 25s later.
- **Closing or reloading the page:** the work stops where it is. Measured: reload after 0.8s left 2/18 songs processed, and one of them had its per-show marker but no `user_songs` row — issue 1's lost count, triggered by an ordinary reload. The show itself was already saved `complete`.
- **Recovery:** only if the artist reopens the show and saves again. That catches up every song with no marker (16/16 measured), but a song left with a marker and no count stays missing for good — from Career counts, search ranking and capture's catalogue for future shows. Nothing prompts the re-save.

fd60200 makes this more likely: before it, "Saving…" stayed up until the catalogue work finished, so the page looked unfinished during that window.

**Repair needed (separate, needs approval):** issue 1's atomic database function, plus running the catalogue update where a page close can't interrupt it (a server route, or the database function called once for the whole setlist). Keeping "Saving…" up until the catalogue finishes would narrow the window again but bring back the long wait.

## 4. Historical shows may have been left in `review`

**Status:** open, recorded 2026-10-17. Needs a separately scoped, read-only audit first. **No backfill is authorized.**

Until commit 909338b, the review save wrote `performances.status = 'completed'`, which the documented `performances_status_check` constraint rejects, and `main` ignored the error. Shows reviewed on `main` since 2758118 (2026-03-09) therefore probably stayed in `review` even though their songs were saved.

**Effects:** they still count on the record (the dashboard counts `review`), but they appear as "Needs review" (History, the app shell's needs-review badge) and are excluded wherever `complete` is required.

**Not verified:** the production data hasn't been checked. An audit would count `review` shows whose `performance_songs` are all `artist_save_complete`, for the user to decide on. Changing any status is a separate decision.
