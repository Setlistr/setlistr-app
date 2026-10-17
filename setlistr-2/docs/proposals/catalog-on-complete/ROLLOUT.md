# Catalogue repair: rollout and rollback (revision 2)

Nothing here has been run against production. Every step needs explicit approval.

## The rule: once applied, the SQL stays

An app rollback doesn't retire the candidate code that's already loaded. Browser tabs and the iOS web view keep running it until they reload. Candidate code doesn't write the catalogue itself, so any session still running it needs the trigger.

**So the trigger is never removed as part of a rollback.** Removing it while candidate code can still complete shows silently loses catalogue data (demonstrated again on the production-shaped stack: `final2/prod-verify.log`, B5).

The SQL is compatible with every version that could be running (demonstrated on the production-shaped stack):

| Running code | With the SQL in place | Evidence |
|---|---|---|
| Deployed `main` (0bd17c4), owner or Manager | writes `'completed'`, which the status check rejects, so the trigger doesn't fire; main's own page-side loop records the catalogue as today. Production's policies let delegates do this. | B1 ×2 |
| Builds with the page-side loop that write `'complete'` (e47c879) | the trigger records it in the final write; the loop then finds every marker and adds nothing | B2, B3 |
| The candidate (0d5dd82) | the trigger records it | suite A, 34/34 overall |

## Rollout

1. **Read-only preflight** ([PREFLIGHT.md](PREFLIGHT.md)). Run 1 is done; Runs 2 and 3 are still to run. Stop on any unexpected result.
2. **Apply `proposed-migration.sql` (revision 2).** It first checks production's shape and aborts, changing nothing, if anything differs:
   - `performance_id` is text;
   - both unique keys exist;
   - the status check exists.
3. **Read-only smoke check:** a show completed after step 2 has one marker per kept song.
4. **Deploy the app candidate** 0d5dd82, with or after `design/share-cards`, which it's built on.
5. **Monitor:** `record the song catalogue · <code>` references, and review saves left in `review`.

**Don't publish a Preview of the candidate before step 2:** Previews use the production database. The earlier Preview was deleted (404) and its remote branch removed.

## Rollback

- **An app problem:** revert the app deployment only. The SQL stays; reverted builds and open candidate tabs both keep recording correctly.
- **A defect in the SQL:** fix forward with a reviewed `CREATE OR REPLACE FUNCTION public.record_performance_catalog(...)`, trigger left in place, tested on a production-shaped disposable stack as this one was. Until the fix lands:
  - candidate sessions get the tagged error and keep their edits;
  - deployed `main` is unaffected;
  - page-side-loop builds that write `'complete'` would also be rejected.
- **Removing the SQL:** not planned. It would need a tested guard first, so that candidate tabs refuse completion instead of completing without a catalogue. That guard is only a proposal, not built.
