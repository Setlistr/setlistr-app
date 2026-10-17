# Proposal: record the song catalogue inside the review save

**Status:** proposal for review, 2026-10-17. **Nothing here is applied.** No migration, SQL, backfill or permission change is authorized. Fixes [data-integrity issues 1 and 3](data-integrity-open-issues.md); release blocker for `design/record-finish`.

## The problem, measured

After a confirmed review save, the page writes each kept song to the artist's catalogue as separate requests: insert a per-show marker in `user_song_performances`, then increment or create the `user_songs` row.

- **Closing or reloading the page** mid-way stops it. Measured locally (18 songs, 150ms per request): a reload 0.8s after the summary left 2/18 songs processed, one with its marker but no count.
- **A marker without its count is permanent.** Every later save sees the marker and skips the song. The song is then missing from Career counts and search ranking, and, if it was never in the catalogue, from capture's matching for future shows.
- **Re-saving recovers only unmarked songs,** and nothing prompts it.
- **The window grew with fd60200:** the summary now appears before this work finishes.

## Smallest reliable repair

Make the catalogue part of the save's final required write, in one database transaction.

1. **One database function** counts a performance's kept songs once each. The per-show marker and the count are written together, so neither can exist without the other, and running it again changes nothing.
2. **A trigger on the save's final write** runs it. The review save is the only writer of `performances.status = 'complete'`. An `AFTER UPDATE OF status … WHEN (NEW.status = 'complete')` trigger records the catalogue inside that statement:
   - A **confirmed save** (the app already requires that update to return its row) always has its catalogue.
   - **Closing the page** after confirmation can't interrupt it: the transaction has already committed.
   - **A catalogue failure fails the save statement**, with nothing partial. The app already reports a failed final write, and Try again is safe; songs saved by the failed attempt are updated, not re-inserted.
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
REVOKE EXECUTE ON FUNCTION public.record_performance_catalog(uuid) FROM PUBLIC;

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
REVOKE EXECUTE ON FUNCTION public.performances_record_catalog() FROM PUBLIC;

DROP TRIGGER IF EXISTS performances_record_catalog ON public.performances;
CREATE TRIGGER performances_record_catalog
  AFTER UPDATE OF status ON public.performances
  FOR EACH ROW WHEN (NEW.status = 'complete')
  EXECUTE FUNCTION public.performances_record_catalog();
```

### Verified so far (local, inside a transaction that was rolled back)

| Case | Result |
|---|---|
| Save, review → complete | each kept song counted once; played planned counts; pending planned, removed and duplicate titles don't |
| Song already counted by today's app code (marker present) | not counted again |
| Re-save, complete → complete | no change |
| Re-save after adding a song | only the new song counts |
| Failure inside the catalogue step | the whole save statement fails; no marker left behind |
| Other updates (e.g. marking submitted) | catalogue untouched |
| After rollback | none of the functions remain |

Not yet verified: the app changes (items 3 and 4), production RLS, a manager's save, and production performance.

## Decisions needed

- **Managers' saves would start updating the artist's catalogue.** Production policies on `user_songs` and `user_song_performances` allow writes only where `user_id = auth.uid()`, and the page writes under the artist's id. So a manager's review save very likely has its catalogue writes refused today (unverified; local RLS is off on these tables). The trigger function is `SECURITY DEFINER` and acts only after an update the caller was already allowed to make; Viewers can't make it (0016). That is a behaviour change and needs explicit approval.
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
