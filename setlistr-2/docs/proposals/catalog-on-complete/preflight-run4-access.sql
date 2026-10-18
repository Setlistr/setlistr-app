-- Catalogue repair · PRODUCTION PREFLIGHT for the Supabase SQL Editor · RUN 4 · READ-ONLY
-- Client-role reachability of the administrative grants found in Run 3. Catalog metadata only:
-- role attributes, privileges, extension and function names. No row data.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

SELECT jsonb_pretty(jsonb_build_object(
  'ran_at', now(),
  'read_only', current_setting('transaction_read_only'),
  'server_version', current_setting('server_version'),

  'L_client_roles_can_log_in', (SELECT jsonb_object_agg(rolname, rolcanlogin) FROM pg_roles WHERE rolname IN ('anon', 'authenticated')),

  'S_schemas_client_roles_can_create_in', (SELECT coalesce(jsonb_agg(r || ' → ' || n.nspname ORDER BY r, n.nspname), '[]'::jsonb)
      FROM (VALUES ('anon'), ('authenticated')) v(r), pg_namespace n
      WHERE has_schema_privilege(r, n.oid, 'CREATE')),

  'M_maintain', CASE WHEN current_setting('server_version_num')::int >= 170000 THEN
      (SELECT jsonb_object_agg(t || ' → ' || r, has_table_privilege(r, ('public.' || t)::regclass, 'MAINTAIN'))
       FROM (VALUES ('anon'), ('authenticated')) a(r), (VALUES ('user_songs'), ('user_song_performances'), ('performance_songs'), ('performances')) b(t))
    ELSE '"not applicable before PostgreSQL 17"'::jsonb END,

  'E_extensions', (SELECT jsonb_object_agg(extname, extversion) FROM pg_extension WHERE extname IN ('pg_graphql', 'pg_net')),

  'F_client_callable_functions_with_dynamic_sql', (SELECT coalesce(jsonb_agg(n.nspname || '.' || p.proname ORDER BY 1), '[]'::jsonb)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('public', 'graphql_public')
        AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
        AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
        AND p.prosrc ~* '\mexecute\M\s+(format|''|\$|[a-z_]+\s*(\|\||;))')
)) AS preflight_run4;

ROLLBACK;
