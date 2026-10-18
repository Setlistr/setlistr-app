# Separate finding and repair: administrative table grants held by client roles

**Status:** the repair is tested on the disposable production-shaped stack only. **NOT APPLIED; no production change.** It's independent of the catalogue repair and the write-access repair.

## Finding (preflight Run 3, 2026-10-18)

`anon` and `authenticated` hold **TRUNCATE, TRIGGER and REFERENCES** on `user_songs`, `user_song_performances` and `performance_songs`. On PostgreSQL 17 they also hold **MAINTAIN**; `information_schema` doesn't list it, so Run 4 reports it for production. `performances` already lacks all of them: repo migration `0010_delegation_containment.sql` removed them as "never intentionally granted".

These grants are separate from row policies:
- **RLS governs only SELECT, INSERT, UPDATE and DELETE.** TRUNCATE ignores RLS entirely.
- **TRIGGER** lets the holder attach a trigger, using a function they may execute, that then runs inside other users' writes.
- **REFERENCES** lets the holder create a foreign key into the table.
- **MAINTAIN** allows VACUUM, ANALYZE, REINDEX, CLUSTER and LOCK TABLE.

## Reachability through existing client-accessible paths

| Path | Can it issue TRUNCATE / CREATE TRIGGER / foreign keys / MAINTAIN commands? |
|---|---|
| **PostgREST** (the app's `supabase-js` calls, anon or signed-in) | **No.** PostgREST only maps requests to SELECT, INSERT, UPDATE, DELETE and RPC calls of existing functions. |
| **GraphQL** (`pg_graphql`, if enabled; Run 4) | **No.** Its mutations are insert, update and delete, under RLS. |
| **RPC functions** callable by anon/authenticated | Only if one runs dynamic SQL. The app calls three (`increment_acr_usage`, `patch_scheduled_show_with_venue`, `start_scheduled_show`); none does. Run 4 lists any plpgsql function in `public` / `graphql_public` that's client-callable and runs dynamic SQL. |
| **A direct database login** as these roles | **No:** both are NOLOGIN. Only the server-side `authenticator` and `postgres` credentials can switch into them. |
| **Creating objects** (needed to use REFERENCES, or to write a new trigger function) | No CREATE on any schema for these roles in the disposable stack; Run 4 reports production. |

**Conclusion:** through the app's existing client paths, none of these privileges is reachable today. The remaining check is Run 4 confirming no client-callable dynamic-SQL function exists. They're a latent risk: any future SQL-executing path, such as a careless RPC, would expose an RLS-free table wipe and cross-user triggers.

## Minimum change

[`proposed-catalogue-admin-privileges.sql`](proposed-catalogue-admin-privileges.sql) applies **0010's rule, unchanged**, to the three tables:
- revokes TRUNCATE, TRIGGER, REFERENCES, and MAINTAIN on PostgreSQL 17+, from PUBLIC, anon and authenticated;
- **leaves SELECT, INSERT, UPDATE and DELETE untouched**, so RLS still governs them;
- never names `service_role`.

No app code uses any of these privileges.

**Not changed, by design:** `LOCK TABLE` remains possible for any holder of UPDATE or DELETE. Those privileges are needed for normal writes, and LOCK isn't reachable through PostgREST.

## Verification (disposable stack; privilege checks and refusals only)

`final4/grant-verify.log`: **13/13.**

| Stage | Checks |
|---|---|
| Before | production's Run 3 state reproduced exactly: the privileges present on the three tables, absent on `performances` |
| After | none of the four privileges remains for anon/authenticated; their DML is unchanged; `service_role` keeps everything |
| Refusals | TRUNCATE and CREATE TRIGGER as `authenticated` are refused with *permission denied* on each table, inside rolled-back transactions; `service_role` TRUNCATE still allowed (rolled back) |
| Client path | a signed-in artist's own insert, update, read and delete through PostgREST work |
| Rollback | [`proposed-catalogue-admin-privileges.rollback.sql`](proposed-catalogue-admin-privileges.rollback.sql) restores TRUNCATE, TRIGGER and REFERENCES exactly as Run 3 found them. Its MAINTAIN line is enabled only if Run 4 shows MAINTAIN granted today. Re-applying the revoke works. |
| Full app suites | all pass with all three proposals applied: browser 34/34, policy 31/31, save-stages, fix-verify |

**Verification limit:** exploit chains were deliberately not built. The checks above show the privileges exist, then are removed and refused. They don't demonstrate misuse.
