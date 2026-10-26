# 0028_show_imports: applied to production

- **Project:** lelimetbogycrdnfxjok ("Setlistr's Project")
- **Applied:** 2026-10-26 17:57:35 UTC, as `postgres`, through the Supabase Management API query endpoint. It ran as one `BEGIN … COMMIT` transaction, which committed.
- **File:** `0028_show_imports.sql`, SHA-256 `b21d2ec42f787f54ee3bbb90fd11ad091b508f48ca40f9810536cf481407faed`, byte-identical to the tested proposal.
- **Before applying (read-only):**
  - no scheduled show without `scheduled_at` (0);
  - the seven expected function hashes matched;
  - no 0028 object present.
- **After applying (read-only):**
  - all 15 related functions are identical to the tested ones (source, security, owner);
  - the table, columns, constraints, index, triggers, status check and permissions are as tested;
  - no imported or listed rows;
  - show counts by status unchanged;
  - the deployed app's Schedule queries return 200.
- **Do not run again.** Production has no `supabase_migrations` history table, so this file is the record. Running it a second time would stop at its own precondition ("shows already has an import column").
- **Down migration:** `supabase/proposals/0028_show_imports.down.sql`. It refuses while imported rows exist.
