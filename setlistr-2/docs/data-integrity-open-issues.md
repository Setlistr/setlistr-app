# Data-integrity open issues

Known problems that need separate work. **No SQL, migration or backfill is authorized for any of them.**

**Update 2026-10-18:** the review save path of issues 1 and 3 is repaired in production by commit 1aee35b and migration 0027 (see [`catalog-release-handoff.md`](catalog-release-handoff.md)). Everything else here remains open.

## 1. Song catalogue counts can be lost permanently (review save)

**Status:** **review save repaired 2026-10-18** (1aee35b + 0027). The review page no longer writes the catalogue; the database records it inside the save's final write, marker and count together. **Still open:** the same marker → read → write pattern in live capture (`app/app/live/[id]/page.tsx`), `api/identify`, `api/upload-identify` and `api/upload-reconcile`. Counts already lost are not recomputed.

**Where (before the repair):** `writeUserSongFromReview` in `app/app/review/[id]/page.tsx`. It runs after a confirmed review save, once per kept song, as separate client requests:

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

**Status:** **repaired for the review save 2026-10-18** (1aee35b + 0027): the catalogue is recorded with the final write, so closing the page can no longer interrupt it (tested: 18/18 songs recorded when the page closed the moment the summary appeared). The description below is the pre-repair measurement, kept for the record.

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

## 5. Read-then-write writers can overwrite catalogue counts with stale values

**Status:** open, demonstrated 2026-10-18 on a disposable copy of production's schema (`docs/proposals/catalog-on-complete/OVERLAP.md`).

Live capture, `api/identify`, the upload routes and delete/undo read `confirmed_count` and later write back an absolute value. A concurrent change to the same artist's same song committed in between is discarded, including the review save's atomic increment. Counts can therefore drift **in either direction**: under, when an increment is discarded; over, when a delete's decrement is discarded.

Each song is still counted at most once per show (the per-show marker), and there's one catalogue row per title (production's unique key). The fix is for these writers to use an atomic increment or the same database function: the open capture/upload repair. No counts are recomputed.

## 6. Historical per-show markers that no longer match their show

**Status:** informational, measured read-only in production 2026-10-18 (preflight Run 3). **No marker altered, no count changed.**

Of 2,103 markers:
- 1,096 match a song still in the show;
- 636 name a title no longer in the show but still in the catalogue (599 of them on shows still in `review`);
- 243 belong to shows with no saved songs (live, draft or review);
- 121 belong to shows that no longer exist;
- 7 are in neither show nor catalogue.

**Effect:** when one of the 599 review shows is completed, titles edited at review are counted under their new title alongside the capture-time count. That's the same as before the release. Any correction belongs with issue 4's audit and needs its own approval.

