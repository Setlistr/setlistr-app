# Proposal: record the song catalogue inside the review save

**Status:** proposal for review, 2026-10-17; verification added the same day. **Nothing here is applied.** No migration, SQL, backfill or permission change is authorized. Fixes [data-integrity issues 1 and 3](data-integrity-open-issues.md); release blocker for `design/record-finish`.

## Final review package

See [proposals/catalog-on-complete/REVIEW.md](proposals/catalog-on-complete/REVIEW.md) (final SQL, app candidate 0d5dd82, preflight, rollout and rollback, results, risks). The sections below record how the proposal was developed.

## Review package (earlier)

- **SQL, exactly as proposed:** [proposals/catalog-on-complete/proposed-migration.sql](proposals/catalog-on-complete/proposed-migration.sql). Not applied anywhere.
- **Application diff, exactly as proposed:** [proposals/catalog-on-complete/app.patch](proposals/catalog-on-complete/app.patch), against `design/share-cards` @ 0c9a567. The page stops writing the catalogue, and a planned song marked played is stored as played. The two must ship together.
- **Tests and their output:** [proposals/catalog-on-complete/tests/](proposals/catalog-on-complete/tests/README.md).
- **Integrated test (approved, disposable stack only):** the real patched save against the proposed migration with RLS on: [proposals/catalog-on-complete/integrated/](proposals/catalog-on-complete/integrated/README.md). 15/15, save-stages 94/94; results and remaining limitations there.

## The problem, measured

After a confirmed review save, the page writes each kept song to the artist's catalogue as separate requests: insert a per-show marker in `user_song_performances`, then increment or create the `user_songs` row.

- **Closing or reloading the page** mid-way stops it. Measured locally (18 songs, 150ms per request): a reload 0.8s after the summary left 2/18 songs processed, one with its marker but no count.
- **A marker without its count is permanent.** Every later save sees the marker and skips the song. The song is then missing from Career counts and search ranking, and, if it was never in the catalogue, from capture's matching for future shows.
- **Re-saving recovers only unmarked songs,** and nothing prompts it.
- **The window grew with fd60200:** the summary now appears before this work finishes.

## Smallest reliable repair

Make the catalogue part of the save's **final required write** (the one that sets `complete`), in that write's transaction.

**The save as a whole is not atomic, and this doesn't make it so.** The page sends the save as a sequence of separate requests (song edits, added songs, removals, detection results, the "reviewed" flags, the linked show), each committed on its own, followed by the final write. Only the final write and the catalogue are atomic together.

1. **One database function** counts a performance's kept songs once each. The per-show marker and the count are written together, so neither can exist without the other, and running it again changes nothing.
2. **A trigger on the save's final write** runs it. The review save is the only writer of `performances.status = 'complete'`. An `AFTER UPDATE OF status … WHEN (NEW.status = 'complete')` trigger records the catalogue inside that statement:
   - A **confirmed save** (the app already requires that update to return its row) always has its catalogue.
   - **Closing the page** after confirmation can't interrupt it: the transaction has already committed.
   - **A catalogue failure fails the final write**, with no partial catalogue. Everything the earlier requests saved stays saved (see "If the final write fails" below). The app already reports a failed final write, and Try again is safe: songs saved by the failed attempt are updated, not re-inserted.
   - **A re-save** runs it again; only songs not yet counted for this show are added.
3. **One change to the required save, so the database knows which songs were kept.** Today, marking a planned song "Played" changes it only in the page; the save writes just its position, and the row still says `source = 'planned'`. The database can't tell it from a planned song never marked played. The save's song update for a kept song whose loaded source is `planned` must also write `source = 'manual'`, the value the page already uses. Without this, played planned songs would stop being counted.
4. **Remove the page's catalogue loop** (`writeUserSongFromReview`). Tonight's moments can then treat the catalogue as complete whenever the save is confirmed.

### Draft SQL (for review only)

The key function reproduces `normalizeSongKey()` exactly (26/26 tricky titles identical, including brackets, dashes, accents, Turkish İ and punctuation), so songs already counted by the current app code are recognised and never counted twice.

```sql
-- DRAFT for review — not applied anywhere. Catalogue update made part of the
-- review save's final write, in the same transaction.

-- Same key as lib/reconciliation/normalize.ts normalizeSongKey() (checked on a corpus).
CREATE OR REPLACE FUNCTION public.song_catalog_key(title text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    btrim(lower(title)), '\(.*?\)', '', 'g'), '\[.*?\]', '', 'g'), '[-–—]', ' ', 'g'), '[^a-z0-9 ]', '', 'g'), '\s+', ' ', 'g'))
$$;

-- Counts each kept song of one performance into the artist's catalogue once.
-- Idempotent: the per-show marker decides; marker and count are written in
-- the same transaction, so neither can exist without the other.
CREATE OR REPLACE FUNCTION public.record_performance_catalog(p_performance_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid;
  r record;
  v_added integer := 0;
BEGIN
  SELECT user_id INTO v_user FROM performances WHERE id = p_performance_id;
  IF v_user IS NULL THEN RETURN 0; END IF;
  -- One catalogue writer per artist at a time (user_songs has no unique key).
  PERFORM pg_advisory_xact_lock(hashtextextended('user_songs:' || v_user::text, 0));
  FOR r IN
    SELECT DISTINCT ON (song_catalog_key(ps.title))
           song_catalog_key(ps.title) AS k, ps.title AS title, nullif(btrim(ps.artist), '') AS artist
    FROM performance_songs ps
    WHERE ps.performance_id = p_performance_id
      AND NOT coalesce(ps.artist_removed, false)
      AND coalesce(ps.source, '') <> 'planned'          -- planned, never marked played
      AND nullif(btrim(ps.title), '') IS NOT NULL
    ORDER BY song_catalog_key(ps.title), ps.position
  LOOP
    CONTINUE WHEN r.k = '';
    INSERT INTO user_song_performances (user_id, performance_id, normalized_title)
    VALUES (v_user, p_performance_id, r.k)
    ON CONFLICT (user_id, performance_id, normalized_title) DO NOTHING;
    CONTINUE WHEN NOT FOUND;                            -- already counted for this show
    UPDATE user_songs SET confirmed_count = coalesce(confirmed_count, 0) + 1,
                          canonical_artist = r.artist, last_confirmed_at = now()
    WHERE id = (SELECT id FROM user_songs WHERE user_id = v_user AND song_title = r.title
                ORDER BY confirmed_count DESC NULLS LAST, id LIMIT 1);
    IF NOT FOUND THEN
      INSERT INTO user_songs (user_id, song_title, canonical_artist, confirmed_count, last_confirmed_at)
      VALUES (v_user, r.title, r.artist, 1, now());
    END IF;
    v_added := v_added + 1;
  END LOOP;
  RETURN v_added;
END $$;
-- Supabase grants EXECUTE on new public functions to anon and authenticated by
-- default, so revoking from PUBLIC alone is not enough. Only the trigger may run this.
REVOKE EXECUTE ON FUNCTION public.record_performance_catalog(uuid) FROM PUBLIC, anon, authenticated;

-- The review save's final required write sets status = 'complete' (the only
-- writer of that value). The catalogue is recorded inside that statement, so
-- a confirmed save always has its catalogue, and any failure fails the save
-- (which the app already reports, and retry is safe).
CREATE OR REPLACE FUNCTION public.performances_record_catalog()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM record_performance_catalog(NEW.id);
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.performances_record_catalog() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS performances_record_catalog ON public.performances;
CREATE TRIGGER performances_record_catalog
  AFTER UPDATE OF status ON public.performances
  FOR EACH ROW WHEN (NEW.status = 'complete')
  EXECUTE FUNCTION public.performances_record_catalog();
```

### Verified

**1. Rolled-back transaction on the shared local database (2026-10-17):** the key function matches `normalizeSongKey()` on 26/26 titles; the save logic behaves as described. Nothing persisted.

**2. Disposable Postgres container (Supabase's own image), with RLS enabled on all five tables** using the production `can_act_for`/`can_write_for` functions, the 0016 performance and song policies, and the baseline catalogue policies. Each request ran as its own transaction under the real `authenticated` role. The container was deleted afterwards.

| Who | Today: page writes the artist's catalogue | Proposal: the save's final write | Calling the function directly |
|---|---|---|---|
| Owner | allowed | allowed; catalogue recorded | refused |
| Manager | **refused by RLS** | allowed; catalogue recorded | refused |
| Tour Manager | **refused by RLS** | allowed; catalogue recorded | refused |
| Viewer | refused | refused (0 rows); nothing recorded | refused |
| Unrelated user | refused | refused (0 rows); nothing recorded | refused |

Managers' and Tour Managers' review saves therefore skip the catalogue today. The proposal records it for any role that is already allowed to complete the show, and for no one else.

**A hole found and fixed in the first draft:** Supabase grants `EXECUTE` on new public functions to `anon` and `authenticated` by default, so `REVOKE … FROM PUBLIC` alone left the catalogue function callable. A Viewer and an unrelated user could write catalogue rows for someone else's show. The SQL above revokes from `anon` and `authenticated` too, and the test confirms "permission denied" for every client role.

| Case | Result |
|---|---|
| Two shows of one artist saved at the same moment (owner + manager), both introducing the same new song | one catalogue row, count 2 |
| Same race with the advisory lock removed | **two rows, count 1 each**: the lock is what prevents duplicates |
| Re-save | no change |
| Manager re-saves after adding a song | only that song counts |
| Marking a show submitted | catalogue untouched |
| Song already counted during live capture | not counted again at review |
| setlist.fm import (inserts a complete show) | nothing counted (an insert doesn't fire the trigger), as today |
| That imported show later saved from Review | counted, as the page does today |

#### If the final write fails

Measured with a forced catalogue failure after the page's earlier requests had succeeded:

- **Persisted:** the edited song title, the song added in review, and the "reviewed" (`artist_save_complete`) flags on every song. Removals, detection results and the linked show's `completed` status, when present, are earlier requests too and also persist.
- **Not persisted:** `performances.status` stays `review`; no markers; no catalogue change.
- **Try again** after the cause is gone completes the save and records the catalogue for the show as it now stands.

So a failed save leaves the setlist edits saved but the show unfinished and uncounted, which the app reports with Try again. It never leaves a show marked complete without its catalogue.

#### Other writers of the catalogue (unchanged by this proposal)

Live capture (`app/api/identify`, the live page) and uploads (`upload-identify`, `upload-reconcile`) count songs during capture with the same per-show marker. Deleting a show removes its markers and reduces counts; undo restores them. The Spotify and admin imports write counts directly, with no marker. All markers use `normalizeSongKey()`, which the SQL reproduces exactly.

Two existing inconsistencies to note, not fixed here:
- Capture writes its marker and count as separate requests, the same pattern as issue 1, so it can lose a count the same way.
- The delete route finds the catalogue row by normalized key; review and capture match on the exact title.

Not yet verified: the app changes (items 3 and 4), and the save's final write at 25 and 60 songs.

## Decisions needed

- **Managers' and Tour Managers' saves would start updating the artist's catalogue.** With production RLS, their saves skip it today (verified above). The trigger acts only after an update the caller was already allowed to make, so Viewers and others gain nothing. This is a behaviour change and needs explicit approval.
- **A catalogue failure becomes a save failure.** The alternative, catching errors inside the trigger, keeps saves succeeding but can silently skip the catalogue again. Recommended: fail the save.
- **Existing damage is not repaired.** See the read-only queries below; any repair is a separate, approved backfill.

## Read-only queries to size existing damage (not run)

```sql
-- Markers whose song has no catalogue row at all (lost first appearances)
SELECT m.user_id, count(*) AS songs
FROM user_song_performances m
WHERE NOT EXISTS (
  SELECT 1 FROM user_songs u
  WHERE u.user_id = m.user_id
    AND btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
          btrim(lower(u.song_title)), '\(.*?\)', '', 'g'), '\[.*?\]', '', 'g'), '[-–—]', ' ', 'g'), '[^a-z0-9 ]', '', 'g'), '\s+', ' ', 'g')) = m.normalized_title)
GROUP BY m.user_id;

-- Complete shows with kept songs never marked (interrupted before the marker)
SELECT p.user_id, p.id AS performance_id, count(*) AS unmarked_songs
FROM performances p
JOIN performance_songs ps ON ps.performance_id = p.id
WHERE p.status = 'complete'
  AND NOT coalesce(ps.artist_removed, false) AND coalesce(ps.source, '') <> 'planned'
  AND nullif(btrim(ps.title), '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM user_song_performances m
                  WHERE m.user_id = p.user_id AND m.performance_id = p.id)
GROUP BY p.user_id, p.id;
```

A lost increment on a song that does have a catalogue row can't be detected from the data.

## Test plan before release

- Run the draft migration on a disposable database. Re-run the existing save suites (save repair 56, save stages 94, optional failures 10, celebration 40) and the record-finish checks (133).
- Add:
  - a reload in the middle of the old window (no loss);
  - a manager save, with RLS enabled as in production;
  - a Viewer save (still refused);
  - a planned song marked played;
  - a re-save;
  - a forced catalogue failure (save reports it, Try again succeeds).
- Measure the save's final write at 25 and 60 songs.
