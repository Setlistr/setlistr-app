# Catalogue repair: rollout and rollback (revised)

Nothing here has been run against production. Every step needs explicit approval.

## The rule: once applied, the SQL stays

An app rollback doesn't retire the candidate code that's already loaded. Browser tabs and the iOS app's web view keep running it until they reload, and that can take any length of time. Candidate code doesn't write the catalogue itself, so any session still running it needs the trigger.

**So the trigger is never removed as part of a rollback.** Removing it while candidate code can still complete shows silently loses catalogue data (demonstrated: `final/suite-B-overlap-rollback.log`, B5).

The SQL can stay safely, because it is compatible with every version that could be running (demonstrated):

| Running code | With the SQL in place | Evidence |
|---|---|---|
| Deployed `main` (0bd17c4) | writes `'completed'`, which `performances_status_check` rejects (ignored, as today), so the trigger doesn't fire; main's own page-side loop records the catalogue as today | B1 |
| Builds with the page-side loop that write `'complete'` (e.g. e47c879, the share-cards and record-finish Previews) | the trigger records it in the final write; the loop then finds every marker and adds nothing | B2, B3 |
| The candidate (0d5dd82) | the trigger records it | suite A |

## Rollout

1. **Read-only preflight** ([PREFLIGHT.md](PREFLIGHT.md)). Stop on any unexpected result.
2. **Apply `proposed-migration.sql`.** Every running version stays correct (table above).
3. **Read-only smoke check:** a show completed after step 2 has one marker per kept song.
4. **Deploy the app candidate,** with or after `design/share-cards`, which it's built on.
5. **Monitor** for `record the song catalogue · <code>` references, and for review saves left in `review`.

Don't publish a Preview of the candidate before step 2. Previews appear to use the production database. The one that was published has been deleted (404 `DEPLOYMENT_NOT_FOUND`), and its remote branch removed.

## Rollback

### An app problem

**Revert the app deployment only. The SQL stays as it is.** Reverted builds and still-open candidate tabs both keep recording correctly (table above). No database change is needed.

### A defect in the SQL itself

Examples: the trigger rejects completions it shouldn't, or counts wrongly.

**Fix forward. Don't remove.** Ship a reviewed `CREATE OR REPLACE FUNCTION public.record_performance_catalog(...)` with the trigger left in place, tested on a disposable stack like this migration.

Until the fix lands:
- **Candidate sessions** get the tagged error. A permanent one doesn't offer Try again; their edits are kept, and the show completes once the fix is in.
- **Deployed `main`** is unaffected: it never fires the trigger.
- **Page-side-loop builds that write `'complete'`** would also be rejected.

### Removing the SQL

**Not planned.** It would only be safe once no session could be running candidate code, which can't be guaranteed for open tabs.

If removal is ever required, it needs a guard built and tested first. The proposal, **not built or tested**:
- The candidate marks its final write with a request header (e.g. `x-setlistr-catalogue: database`).
- A "paused" mode in the trigger function then rejects that marked write, tagged and temporary, while letting page-side-loop builds through to record the catalogue themselves.
- Candidate tabs would then refuse to complete, rather than completing without a catalogue.

It's a separate change for approval.
