-- Catalogue repair · PRODUCTION PREFLIGHT for the Supabase SQL Editor · RUN 2 · READ-ONLY
-- The plan for the revised function's per-show work, in one statement: the show's songs, the
-- per-show marker lookup and the catalogue row lookup (the two unique keys its inserts use).
-- EXPLAIN without ANALYZE: planned only, nothing executed. The ids are placeholders, not users.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

EXPLAIN
SELECT ps.title, m.id AS marker, us.id AS catalogue_row
FROM public.performance_songs ps
LEFT JOIN public.user_song_performances m
  ON m.user_id = '00000000-0000-0000-0000-000000000000'
 AND m.performance_id = ps.performance_id::text
 AND m.normalized_title = lower(ps.title)
LEFT JOIN public.user_songs us
  ON us.user_id = '00000000-0000-0000-0000-000000000000'
 AND us.song_title = ps.title
WHERE ps.performance_id = '00000000-0000-0000-0000-000000000000';

ROLLBACK;
