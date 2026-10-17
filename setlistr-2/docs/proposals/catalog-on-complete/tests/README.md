# Catalogue repair: how the evidence was produced

Nothing here touches a shared or production database.

## Database (disposable container)

```bash
docker run -d --name sl-catalog-test -e POSTGRES_PASSWORD=disposable public.ecr.aws/supabase/postgres:17.6.1.167
docker cp disposable-schema.sql sl-catalog-test:/tmp/schema.sql
docker cp ../proposed-migration.sql sl-catalog-test:/tmp/repair.sql
docker exec sl-catalog-test psql -U postgres -q -f /tmp/schema.sql
docker exec sl-catalog-test psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/repair.sql
./authz.sh > authz.log   # owner / manager / tour manager / viewer / unrelated user, RLS on
./more.sh  > more.log    # concurrency (with and without the lock), re-saves, capture markers, imports, a failed final write
docker rm -f sl-catalog-test
```

`disposable-schema.sql` copies the production shapes the tests touch: `can_act_for` / `can_write_for` (0015/0016, verbatim), the 0016 performance and song policies, and the baseline catalogue policies, with RLS enabled on every table. Each request runs as its own transaction under the `authenticated` role with the caller's id, as PostgREST would. `authz.log` and `more.log` are the output against the final SQL (2026-10-17).

## Key equivalence

`key-corpus.json` holds 26 tricky titles. `normalizeSongKey()` in `lib/reconciliation/normalize.ts` and `song_catalog_key()` in the proposed SQL gave identical keys for all 26. That was checked inside a transaction that was rolled back.

## Application half

`../app.patch` applies to `design/share-cards` @ 0c9a567 and type-checks (`npx tsc --noEmit`). It was run against the local database with the SQL **not** applied:

- A planned song marked "Played" is stored as `source = manual`; one not marked stays `planned`.
- The show is saved `complete`.
- The page wrote no catalogue rows. That is why the patch and the SQL ship together, never separately.

The combined path (patched app plus trigger) was run on a disposable stack; see [../integrated/](../integrated/README.md).
