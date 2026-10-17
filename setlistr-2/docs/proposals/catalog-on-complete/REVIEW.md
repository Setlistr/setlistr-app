# Catalogue repair: final review package

**Status:** prepared for approval. **Not applied anywhere.** No production check, write, backfill or deployment has been made. Merge held.

## What to approve

| Item | Where |
|---|---|
| SQL, exact | `proposed-migration.sql` (statement-for-statement the SQL tested on the disposable stack) |
| App candidate | `fix/catalog-on-complete-app` @ **0d5dd82cc4ce2854184191b7a7507e69f3c04593** (on `design/share-cards` @ e47c879); diff in `app.patch` |
| Preflight (read-only) | `preflight.sql` |
| Rollout / rollback | `ROLLOUT.md` |

## Behaviour after release

- **Recorded with the save:** a review save records the artist's song catalogue inside its final write. A confirmed save always has its catalogue, including when the page closes the moment the summary appears.
- **Manager and Tour Manager** saves update the artist's catalogue. Viewers remain refused.
- **A catalogue failure rejects completion.** The page says the songs and edits are saved and the show couldn't be completed.
  - **Permanent rejections** (constraint, data, permission) don't offer Try again and give a reference: `record the song catalogue · <code> · <constraint>`.
  - **Temporary failures** (serialization failure, deadlock, lock or statement timeout, busy server) offer Try again, which completes without adding anything twice.
- **Played planned songs:** a planned song marked "Played" is stored as played and counted; a planned song not marked isn't.

## Test results (disposable stack, RLS on, real patched page)

| Suite | Result |
|---|---|
| A · candidate: roles, played planned, capture, re-save, concurrency, lost response, close-at-success, imports, failure boundary, optional failures | 23/23 (`final/suite-A-candidate.log`) |
| B · overlap with deployed `main` and old tabs; rollback order | 10/10 (`final/suite-B-overlap-rollback.log`) |
| save-stages (a lost response and a retry at every stage) | 94/94 |
| fix-verify (scenario 5 replaced by the boundary tests) | 54/54 |
| Layout invariants · record summary | 146/146 · 31/31 |
| Type-check · production build | pass |

The suites ran against the commit's code; save-stages and fix-verify also ran with the wording change in place.

**The failure boundary (rewrites of fix-verify #5 and opt-fail's catalogue case).** Each injection is confirmed by the final write's own response:

| Case | Response | Result |
|---|---|---|
| Permanent catalogue rejection | 23514, tagged | the original safety assertions hold: no celebration, show not complete, no partial catalogue, no first-appearance claim; edits and the linked show's finish kept. A retry, once the cause is gone, completes, and the first-appearance claims match the catalogue exactly. |
| Temporary catalogue failure | 40001, tagged | Try again offered and completes |
| Real lock contention | 57014, untagged (statement timeout) | treated as temporary; Try again completes |
| Telemetry and intelligence failures | fired 2 and 1 times | the save still completes; the page sent 0 catalogue writes |

## Remaining risks

- **Production differs from the test schema.** The disposable schema was the local app schema plus the production objects this depends on (catalogue RLS, the status constraint). Other production-only objects weren't present. The preflight checks for them.
- **No index on `user_songs (user_id, song_title)`.** The function scans per song: about 1–3 ms per save here, unmeasured at production size (preflight checks 10–11). Adding an index is a separate schema change.
- **Completion now depends on the catalogue.** A persistent catalogue error would stop shows completing. Mitigation: the reference line names it, and rollback is app-first.
- **Statement timeouts** reach the page untagged (PL/pgSQL can't catch them). They're still classified as temporary.
- **`main` and the candidate saving at once** could split a brand-new song's count across two rows (B4 note). It's not a double count, and the same race exists between page-side loops today.
- **Previews** appear to use the production database (see ROLLOUT.md).
- **Native iOS** is not tested.

## Explicitly NOT repaired by this change (remain open)

- **Historical backfill:** counts already lost stay lost. Needs a separately approved backfill.
- **Live capture and uploads:** `app/api/identify`, the live page, `upload-identify` and `upload-reconcile` still write the catalogue in two steps and can lose a count the same way.
- **Notion webhook deduplication:** a repeated delivery is still counted twice.
- **Historical shows left in `review`:** needs a separate read-only audit.
