# Release package for approval (final, 2026-10-18)

**Status:**
- **Nothing applied anywhere:** no migration, policy or grant change, production write, backfill, deployment or merge.
- Production preflight Runs 1–3 are complete and read-only.
- Run 4 is optional, and affects only proposal C's rollback detail.

## Compatibility verdict

**Compatible.** The catalogue repair's every production dependency matches what was tested. That's checked against Runs 1–3, and the disposable stack was verified equal to production on both runs (`final2/shape-check.out`, `final4/run3-shape-check.out`). No migration change is needed. See [PREFLIGHT.md](PREFLIGHT.md).

## For approval: three independent proposals

| | SQL (byte-identical to the tested files; SHA-256) | Rollback | What it does |
|---|---|---|---|
| **A** | [`proposed-migration.sql`](proposed-migration.sql) `58131430…2876182` | app first; the SQL stays; fix forward | records the song catalogue inside the review save's final write |
| **A** | app candidate `fix/catalog-on-complete-app` @ **0d5dd82cc4ce2854184191b7a7507e69f3c04593** (local only; on `design/share-cards` @ e47c879; [`app.patch`](app.patch)) | revert the deployment | the page stops writing the catalogue itself; failure wording |
| **B** | [`proposed-catalogue-write-access.sql`](proposed-catalogue-write-access.sql) `1efd7589…952f6a7d` | [`.rollback.sql`](proposed-catalogue-write-access.rollback.sql), tested | Viewers can still read but no longer write the catalogue; ownership locked ([finding](FINDING-catalogue-policies.md)) |
| **C** | [`proposed-catalogue-admin-privileges.sql`](proposed-catalogue-admin-privileges.sql) `f6fed18c…8295f0b` | [`.rollback.sql`](proposed-catalogue-admin-privileges.rollback.sql), tested | removes TRUNCATE, TRIGGER, REFERENCES and MAINTAIN from client roles on three tables; DML untouched ([finding](FINDING-admin-privileges.md)) |

**Order** ([ROLLOUT.md](ROLLOUT.md)): C, then B, then A's SQL, then A's app.

**Intended behaviour (A):**
- authorized Managers and Tour Managers update the artist's catalogue;
- a catalogue failure prevents final completion while keeping edits;
- Try again is offered only for temporary failures.

## Final test results (disposable stack, production's shape)

| Suite | Configuration | Result |
|---|---|---|
| Database level: types, unique-key races, deadlocks, Notion webhook, function permissions | A, with Run 3 defaults | 17/17 (`final4/db-verify.log`) |
| Grants: before / after / refusals / client path / rollback | A + C | 13/13 (`final4/grant-verify.log`) |
| Policy access matrix, ownership, writer paths, stale-write interleavings | A + B + C | 31/31 (`final4/policy-verify.log`) |
| Browser: roles, played planned, capture, re-save, concurrency, failure boundary 5a–5d, overlap B1–B5, lost response, close at success, imports | A + B + C | 34/34 (`final4/prod-verify-all-three.log`) |
| save-stages · fix-verify | A + B + C | 94/94 · 54/54 |
| Earlier runs | A alone; A + B | browser 34/34 each; policy 31/31 |
| Production-size timing | A | 1.2–1.6 ms per 18-song completion |

## Remaining risks and limits

- **Stale writes:** a read-then-write writer can overwrite any committed count, the trigger's included, so a count can drift either way ([OVERLAP.md](OVERLAP.md)). It holds until old tabs reload, and for capture, uploads and delete/undo until those paths are repaired. Each song is still counted at most once per show, with one row per title.
- **U6 markers** (636; 599 on shows still in review): when those shows complete, edited titles are counted alongside the capture-time count. That's today's behaviour, unchanged; it belongs to the historical audit.
- **Completion now depends on the catalogue:** fixed forward if the SQL ever misbehaves.
- **Previews use the production database:** don't publish a candidate Preview before A's SQL.
- **Version difference:** `pg_net` is 0.19.5 in production and 0.20.4 in the test.
- **Not tested:** native iOS sharing.
- **Grant verification limit:** it checks privileges and refusals only. No misuse was demonstrated (by design).

**Explicitly NOT repaired (open):**
- historical backfill;
- the live-capture and upload catalogue writes;
- Notion webhook deduplication;
- the historical review audit.

No historical marker was altered and no count was backfilled.
