-- Release checks · READ-ONLY · run in the Supabase SQL Editor after each step (and before C, as the snapshot).
BEGIN TRANSACTION READ ONLY;
SELECT jsonb_pretty(jsonb_build_object(
  'read_only', current_setting('transaction_read_only'),
  'table_acls', (SELECT jsonb_object_agg(relname, relacl::text) FROM pg_class
                 WHERE oid IN ('public.user_songs'::regclass, 'public.user_song_performances'::regclass, 'public.performance_songs'::regclass, 'public.performances'::regclass)),
  'C_client_admin_privileges', (SELECT jsonb_object_agg(t || ' → ' || r, (SELECT jsonb_agg(p ORDER BY p) FROM unnest(array['TRUNCATE','TRIGGER','REFERENCES','MAINTAIN']) p WHERE has_table_privilege(r, ('public.' || t)::regclass, p)))
                 FROM (VALUES ('anon'), ('authenticated')) a(r), (VALUES ('user_songs'), ('user_song_performances'), ('performance_songs')) b(t)),
  'B_catalogue_policies', (SELECT jsonb_agg(tablename || '.' || policyname || ' ' || cmd ORDER BY tablename, policyname) FROM pg_policies WHERE tablename IN ('user_songs', 'user_song_performances')),
  'B_owner_locks', (SELECT coalesce(jsonb_agg(tgname ORDER BY tgname), '[]'::jsonb) FROM pg_trigger WHERE tgname IN ('user_songs_lock_owner', 'user_song_performances_lock_owner')),
  'A_functions', (SELECT coalesce(jsonb_agg(p.proname || ' ' || coalesce(array_to_string(p.proacl, ' '), 'default') ORDER BY p.proname), '[]'::jsonb) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname IN ('song_catalog_key', 'record_performance_catalog', 'performances_record_catalog')),
  'A_trigger', (SELECT coalesce(jsonb_agg(pg_get_triggerdef(oid)), '[]'::jsonb) FROM pg_trigger WHERE tgname = 'performances_record_catalog')
)) AS release_check;
ROLLBACK;
