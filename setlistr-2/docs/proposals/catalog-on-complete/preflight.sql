-- Catalogue repair: PRODUCTION PREFLIGHT. READ-ONLY. NOT RUN.
-- Run only with explicit authorization, as a role that can read the catalog
-- (e.g. the SQL editor's postgres role). Every statement is a SELECT or an
-- EXPLAIN without ANALYZE, inside a READ ONLY transaction that is rolled back.
-- Expected results are noted on each check; any difference blocks the rollout
-- until it's understood.

BEGIN TRANSACTION READ ONLY;

-- 1. Columns the migration and the patched save rely on.
--    Expect every row present (13 rows), with the types shown.
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND (table_name, column_name) IN (
  ('performances','id'), ('performances','user_id'), ('performances','status'), ('performances','data_source'), ('performances','venue_name'),
  ('performance_songs','performance_id'), ('performance_songs','title'), ('performance_songs','artist'), ('performance_songs','position'),
  ('performance_songs','source'), ('performance_songs','artist_removed'), ('performance_songs','was_planned'), ('performance_songs','inclusion_reason'))
UNION ALL
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('user_songs', 'user_song_performances')
ORDER BY 1, 2;
-- Expect user_songs: id, user_id, song_title, canonical_artist, confirmed_count, last_confirmed_at
--        user_song_performances: id, user_id, performance_id, normalized_title

-- 2. Constraints. Expect performances_status_check allowing 'complete' (and not 'completed'),
--    and the unique (user_id, performance_id, normalized_title) the ON CONFLICT relies on.
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN ('public.performances'::regclass, 'public.user_songs'::regclass, 'public.user_song_performances'::regclass)
  AND contype IN ('c', 'u', 'p')
ORDER BY 1, 2;

-- 3. RLS. Expect relrowsecurity = true on all four tables.
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE oid IN ('public.performances'::regclass, 'public.performance_songs'::regclass, 'public.user_songs'::regclass, 'public.user_song_performances'::regclass)
ORDER BY relname;

-- 4. Policies. Expect performances_write = UPDATE USING/CHECK can_write_for(user_id) (0016),
--    user_songs_self / user_song_performances_self = ALL USING (user_id = auth.uid()) (baseline).
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('performances', 'performance_songs', 'user_songs', 'user_song_performances')
ORDER BY tablename, policyname;

-- 5. Access functions. Expect can_write_for's role allowlist to be ('manager','tour_manager','band_member').
SELECT p.proname, p.prosecdef AS security_definer, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('can_write_for', 'can_act_for');

-- 6. Name clashes and existing triggers. Expect no rows for the three new function names and
--    no trigger named performances_record_catalog. List the existing performances triggers
--    (expect the BEFORE triggers from 0011/0013/0014/0017; none should write the catalogue).
SELECT 'function exists: ' || p.proname AS finding
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('song_catalog_key', 'record_performance_catalog', 'performances_record_catalog');
SELECT tgname, pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgrelid IN ('public.performances'::regclass, 'public.user_songs'::regclass, 'public.user_song_performances'::regclass) AND NOT tgisinternal
ORDER BY tgname;

-- 7. Default privileges on new functions in public. Expect EXECUTE granted to anon/authenticated
--    (Supabase default): that is why the migration revokes from anon and authenticated explicitly.
SELECT pg_get_userbyid(defaclrole) AS owner, defaclobjtype, defaclacl
FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE n.nspname = 'public' AND defaclobjtype = 'f';

-- 8. Who will own the new SECURITY DEFINER functions: the migration's role. Expect a role that
--    can write user_songs / user_song_performances and bypasses their RLS (postgres or supabase_admin).
SELECT current_user, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user;

-- 9. Indexes. Expect the unique index on user_song_performances; expect NO index on
--    user_songs (user_id, song_title) today (the function looks songs up that way).
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename IN ('user_songs', 'user_song_performances', 'performance_songs')
ORDER BY tablename, indexname;

-- 10. Sizes, for the cost of each per-song lookup.
SELECT relname, n_live_tup
FROM pg_stat_user_tables
WHERE relname IN ('user_songs', 'user_song_performances', 'performance_songs', 'performances');

-- 11. The lookup the function makes, planned only (no ANALYZE, nothing executed).
EXPLAIN SELECT id FROM public.user_songs
WHERE user_id = '00000000-0000-0000-0000-000000000000' AND song_title = 'x'
ORDER BY confirmed_count DESC NULLS LAST, id LIMIT 1;

-- 12. Existing duplicate catalogue rows (same artist, same exact title). The function updates
--     the highest-count row of a duplicate set; expect few or none.
SELECT count(*) AS duplicate_sets, coalesce(sum(n), 0) AS rows_in_them
FROM (SELECT user_id, song_title, count(*) AS n FROM public.user_songs GROUP BY 1, 2 HAVING count(*) > 1) d;

-- 13. Key equivalence on real data: for markers written by today's app, recompute the key from
--     the show's saved titles with the migration's expression. Expect unmatched ≈ 0 (a marker
--     whose song was later renamed or removed can legitimately be unmatched).
WITH k AS (
  SELECT ps.performance_id, btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
           btrim(lower(ps.title)), '\(.*?\)', '', 'g'), '\[.*?\]', '', 'g'), '[-–—]', ' ', 'g'), '[^a-z0-9 ]', '', 'g'), '\s+', ' ', 'g')) AS key
  FROM public.performance_songs ps WHERE ps.title IS NOT NULL
)
SELECT count(*) AS markers,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM k WHERE k.performance_id = m.performance_id AND k.key = m.normalized_title)) AS matched
FROM public.user_song_performances m;

-- 14. Planned rows the patched save will start storing as played: kept planned rows on complete
--     shows today (informational; these shows were already counted by the page).
SELECT count(*) AS planned_rows_on_complete_shows
FROM public.performance_songs ps JOIN public.performances p ON p.id = ps.performance_id
WHERE p.status = 'complete' AND ps.source = 'planned' AND NOT coalesce(ps.artist_removed, false);

ROLLBACK;
