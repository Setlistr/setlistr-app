-- Catalogue repair · PRODUCTION PREFLIGHT for the Supabase SQL Editor · RUN 1 of 2 · READ-ONLY
-- Same checks as preflight.sql, shaped for the SQL Editor (which shows only the last
-- statement's result): the session is made read-only, then ONE SELECT returns every
-- check as a single JSON document of definitions and counts. No personal row data.
-- Any write in this session would fail with "cannot execute ... in a read-only transaction".
SET default_transaction_read_only = on;
SET statement_timeout = '30s';

SELECT jsonb_pretty(jsonb_build_object(
  'ran_at', now(),
  'read_only', current_setting('default_transaction_read_only'),
  'database', current_database(),
  'role', jsonb_build_object('name', current_user, 'bypass_rls', (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user)),

  '01_columns', (SELECT jsonb_agg(jsonb_build_object('t', table_name, 'c', column_name, 'type', data_type, 'null', is_nullable) ORDER BY table_name, column_name)
                 FROM information_schema.columns
                 WHERE table_schema = 'public' AND (
                   (table_name = 'performances' AND column_name IN ('id','user_id','status','data_source','venue_name'))
                   OR (table_name = 'performance_songs' AND column_name IN ('performance_id','title','artist','position','source','artist_removed','was_planned','inclusion_reason'))
                   OR table_name IN ('user_songs', 'user_song_performances'))),

  '02_constraints', (SELECT jsonb_agg(jsonb_build_object('t', conrelid::regclass::text, 'name', conname, 'def', pg_get_constraintdef(oid)) ORDER BY conrelid::regclass::text, conname)
                     FROM pg_constraint
                     WHERE conrelid IN (to_regclass('public.performances'), to_regclass('public.user_songs'), to_regclass('public.user_song_performances')) AND contype IN ('c','u','p')),

  '03_rls', (SELECT jsonb_agg(jsonb_build_object('t', relname, 'rls', relrowsecurity, 'forced', relforcerowsecurity) ORDER BY relname)
             FROM pg_class WHERE oid IN (to_regclass('public.performances'), to_regclass('public.performance_songs'), to_regclass('public.user_songs'), to_regclass('public.user_song_performances'))),

  '04_policies', (SELECT jsonb_agg(jsonb_build_object('t', tablename, 'name', policyname, 'cmd', cmd, 'roles', roles, 'using', qual, 'check', with_check) ORDER BY tablename, policyname)
                  FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('performances','performance_songs','user_songs','user_song_performances')),

  '05_access_functions', (SELECT jsonb_agg(jsonb_build_object('name', p.proname, 'security_definer', p.prosecdef, 'def', pg_get_functiondef(p.oid)) ORDER BY p.proname)
                          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                          WHERE n.nspname = 'public' AND p.proname IN ('can_write_for','can_act_for')),

  '06a_name_clashes', (SELECT coalesce(jsonb_agg(p.proname), '[]'::jsonb) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                       WHERE n.nspname = 'public' AND p.proname IN ('song_catalog_key','record_performance_catalog','performances_record_catalog')),
  '06b_triggers', (SELECT jsonb_agg(jsonb_build_object('t', tgrelid::regclass::text, 'name', tgname, 'def', pg_get_triggerdef(oid)) ORDER BY tgrelid::regclass::text, tgname)
                   FROM pg_trigger WHERE tgrelid IN (to_regclass('public.performances'), to_regclass('public.user_songs'), to_regclass('public.user_song_performances')) AND NOT tgisinternal),

  '07_default_function_acl', (SELECT jsonb_agg(jsonb_build_object('owner', pg_get_userbyid(defaclrole), 'acl', defaclacl::text))
                              FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace WHERE n.nspname = 'public' AND defaclobjtype = 'f'),

  '09_indexes', (SELECT jsonb_agg(jsonb_build_object('t', tablename, 'name', indexname, 'def', indexdef) ORDER BY tablename, indexname)
                 FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('user_songs','user_song_performances','performance_songs')),

  '10_sizes', (SELECT jsonb_object_agg(relname, jsonb_build_object('rows_est', n_live_tup, 'size', pg_size_pretty(pg_total_relation_size(relid))))
               FROM pg_stat_user_tables WHERE schemaname = 'public' AND relname IN ('user_songs','user_song_performances','performance_songs','performances')),

  '12_duplicate_catalogue_rows', (SELECT jsonb_build_object('duplicate_sets', count(*), 'rows_in_them', coalesce(sum(n), 0), 'largest_set', coalesce(max(n), 0))
                                  FROM (SELECT user_id, song_title, count(*) AS n FROM public.user_songs GROUP BY 1, 2 HAVING count(*) > 1) d),

  '13_marker_key_equivalence', (WITH k AS (
                                  SELECT ps.performance_id, btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
                                           btrim(lower(ps.title)), '\(.*?\)', '', 'g'), '\[.*?\]', '', 'g'), '[-–—]', ' ', 'g'), '[^a-z0-9 ]', '', 'g'), '\s+', ' ', 'g')) AS key
                                  FROM public.performance_songs ps WHERE ps.title IS NOT NULL)
                                SELECT jsonb_build_object('markers', count(*),
                                  'matched', count(*) FILTER (WHERE EXISTS (SELECT 1 FROM k WHERE k.performance_id = m.performance_id AND k.key = m.normalized_title)))
                                FROM public.user_song_performances m),

  '14_planned_rows_on_complete_shows', (SELECT count(*) FROM public.performance_songs ps JOIN public.performances p ON p.id = ps.performance_id
                                        WHERE p.status = 'complete' AND ps.source = 'planned' AND NOT coalesce(ps.artist_removed, false)),

  '15_catalogue_rows_per_artist', (SELECT jsonb_build_object('artists', count(*), 'max_rows', coalesce(max(n), 0), 'p95_rows', coalesce(percentile_disc(0.95) WITHIN GROUP (ORDER BY n), 0))
                                   FROM (SELECT user_id, count(*) AS n FROM public.user_songs GROUP BY 1) a)
)) AS preflight;
