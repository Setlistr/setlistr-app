-- Catalogue repair · PRODUCTION PREFLIGHT for the Supabase SQL Editor · RUN 2 · READ-ONLY
-- The plan for revision 2's lookups, in one statement, with the function's exact expressions:
--   v  = SELECT user_id FROM performances WHERE id = p_performance_id
--   s  = the loop query (same filters, same key expression as song_catalog_key, same DISTINCT ON / ORDER BY)
--   m  = the per-show marker probe on UNIQUE (user_id, performance_id, normalized_title), id as text
--   us = the catalogue probe on UNIQUE (user_id, song_title), exact title
-- EXPLAIN without ANALYZE: planned only, nothing executed. The zero id is a placeholder, not a user.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

EXPLAIN
WITH v AS (
  SELECT user_id FROM public.performances WHERE id = '00000000-0000-0000-0000-000000000000'
), s AS (
  SELECT DISTINCT ON (x.k) x.k, ps.title
  FROM public.performance_songs ps
  CROSS JOIN LATERAL (SELECT btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
           btrim(lower(ps.title)), '\(.*?\)', '', 'g'), '\[.*?\]', '', 'g'), '[-–—]', ' ', 'g'), '[^a-z0-9 ]', '', 'g'), '\s+', ' ', 'g')) AS k) x
  WHERE ps.performance_id = '00000000-0000-0000-0000-000000000000'
    AND NOT coalesce(ps.artist_removed, false)
    AND coalesce(ps.source, '') <> 'planned'
    AND nullif(btrim(ps.title), '') IS NOT NULL
  ORDER BY x.k, ps.position
)
SELECT s.k, m.id AS marker, us.id AS catalogue_row
FROM s CROSS JOIN v
LEFT JOIN public.user_song_performances m
  ON m.user_id = v.user_id AND m.performance_id = '00000000-0000-0000-0000-000000000000' AND m.normalized_title = s.k
LEFT JOIN public.user_songs us
  ON us.user_id = v.user_id AND us.song_title = s.title;

ROLLBACK;
