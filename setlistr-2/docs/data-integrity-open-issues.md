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
