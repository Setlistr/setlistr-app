-- Catalogue repair · PRODUCTION PREFLIGHT for the Supabase SQL Editor · RUN 3 · READ-ONLY
-- Table grants, column defaults and the unmatched per-show markers in aggregate categories.
-- Counts only: no titles, no ids, no personal row data. Categories describe where a marker's
-- song is now; they do not say a count was lost, and they authorize nothing.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

WITH
k AS MATERIALIZED (
  SELECT DISTINCT ps.performance_id::text AS pid,
         btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
           btrim(lower(ps.title)), '\(.*?\)', '', 'g'), '\[.*?\]', '', 'g'), '[-–—]', ' ', 'g'), '[^a-z0-9 ]', '', 'g'), '\s+', ' ', 'g')) AS key
  FROM public.performance_songs ps),
kr AS MATERIALIZED (   -- the same, for songs the artist removed at review (artist_removed)
  SELECT DISTINCT ps.performance_id::text AS pid,
         btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
           btrim(lower(ps.title)), '\(.*?\)', '', 'g'), '\[.*?\]', '', 'g'), '[-–—]', ' ', 'g'), '[^a-z0-9 ]', '', 'g'), '\s+', ' ', 'g')) AS key
  FROM public.performance_songs ps WHERE coalesce(ps.artist_removed, false)),
songs AS MATERIALIZED (SELECT DISTINCT performance_id::text AS pid FROM public.performance_songs),
cat AS MATERIALIZED (
  SELECT DISTINCT us.user_id,
         btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
           btrim(lower(us.song_title)), '\(.*?\)', '', 'g'), '\[.*?\]', '', 'g'), '[-–—]', ' ', 'g'), '[^a-z0-9 ]', '', 'g'), '\s+', ' ', 'g')) AS key
  FROM public.user_songs us),
c AS (
  SELECT m.created_at, p.status, p.data_source,
    CASE
      WHEN EXISTS (SELECT 1 FROM k WHERE k.pid = m.performance_id AND k.key = m.normalized_title)
        THEN CASE WHEN EXISTS (SELECT 1 FROM kr WHERE kr.pid = m.performance_id AND kr.key = m.normalized_title)
                    AND NOT EXISTS (SELECT 1 FROM public.performance_songs ps WHERE ps.performance_id::text = m.performance_id AND NOT coalesce(ps.artist_removed, false)
                                      AND btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(btrim(lower(ps.title)), '\(.*?\)', '', 'g'), '\[.*?\]', '', 'g'), '[-–—]', ' ', 'g'), '[^a-z0-9 ]', '', 'g'), '\s+', ' ', 'g')) = m.normalized_title)
                  THEN 'M2_matched_song_now_removed_by_artist' ELSE 'M1_matched_kept_song' END
      WHEN m.performance_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN 'U1_marker_id_not_a_performance_id'
      WHEN p.id IS NULL THEN 'U2_show_no_longer_exists'
      WHEN (to_jsonb(p) ->> 'deleted_at') IS NOT NULL THEN 'U3_show_soft_deleted'
      WHEN p.user_id IS DISTINCT FROM m.user_id THEN 'U4_marker_user_is_not_show_owner'
      WHEN NOT EXISTS (SELECT 1 FROM songs WHERE songs.pid = m.performance_id) THEN 'U5_show_has_no_song_rows'
      WHEN EXISTS (SELECT 1 FROM cat WHERE cat.user_id = m.user_id AND cat.key = m.normalized_title) THEN 'U6_song_not_in_show_but_in_artists_catalogue'
      ELSE 'U7_song_not_in_show_nor_catalogue'
    END AS category
  FROM public.user_song_performances m
  LEFT JOIN public.performances p ON p.id::text = m.performance_id)
SELECT jsonb_pretty(jsonb_build_object(
  'ran_at', now(),
  'read_only', current_setting('transaction_read_only'),

  'G_table_grants', (SELECT jsonb_object_agg(t, privs) FROM (
      SELECT table_name || ' → ' || grantee AS t, jsonb_agg(privilege_type ORDER BY privilege_type) AS privs
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
        AND table_name IN ('user_songs', 'user_song_performances', 'performances', 'performance_songs')
      GROUP BY table_name, grantee) g),

  'D_column_defaults', (SELECT jsonb_object_agg(table_name || '.' || column_name, column_default)
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN ('user_songs', 'user_song_performances') AND column_default IS NOT NULL),

  'X_webhook_dependencies', jsonb_build_object(
      'pg_net', (SELECT extversion FROM pg_extension WHERE extname = 'pg_net'),
      'http_request_function', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'supabase_functions' AND p.proname = 'http_request'),
      'performances_has_deleted_at', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'performances' AND column_name = 'deleted_at')),

  'C_markers_by_category', (SELECT jsonb_object_agg(category, n) FROM (SELECT category, count(*) AS n FROM c GROUP BY 1) x),
  'C_by_category_and_show_status', (SELECT jsonb_object_agg(category, by_status) FROM (
      SELECT category, jsonb_object_agg(coalesce(status, '(no show)'), n) AS by_status
      FROM (SELECT category, status, count(*) AS n FROM c GROUP BY 1, 2) y GROUP BY 1) x),
  'C_by_category_and_data_source', (SELECT jsonb_object_agg(category, by_src) FROM (
      SELECT category, jsonb_object_agg(coalesce(data_source, '(no show)'), n) AS by_src
      FROM (SELECT category, data_source, count(*) AS n FROM c GROUP BY 1, 2) y GROUP BY 1) x),
  'C_unmatched_by_month_written', (SELECT jsonb_object_agg(month, n) FROM (
      SELECT coalesce(to_char(date_trunc('month', created_at), 'YYYY-MM'), '(no date)') AS month, count(*) AS n
      FROM c WHERE category LIKE 'U%' GROUP BY 1 ORDER BY 1) x)
)) AS preflight_run3;

ROLLBACK;
