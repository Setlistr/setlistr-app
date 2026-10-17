-- Catalogue repair · PRODUCTION PREFLIGHT for the Supabase SQL Editor · RUN 2 of 2 · READ-ONLY
-- The plan for the per-song lookup the migration's function makes. EXPLAIN without
-- ANALYZE: planned only, nothing executed. The id below is a placeholder, not a user.
SET default_transaction_read_only = on;
SET statement_timeout = '30s';

EXPLAIN SELECT id FROM public.user_songs
WHERE user_id = '00000000-0000-0000-0000-000000000000' AND song_title = 'x'
ORDER BY confirmed_count DESC NULLS LAST, id LIMIT 1;
