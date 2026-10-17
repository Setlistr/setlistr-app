# Mixed writers: what's guaranteed and what isn't

## Who writes the catalogue

| Writer | How it counts a song for a show |
|---|---|
| **The trigger** (this migration) | inserts the per-show marker; if new, increments or creates the catalogue row **in the same transaction, under a per-artist lock**, with an atomic `confirmed_count = confirmed_count + 1` |
| Review page in `main` and earlier builds (page-side loop) | inserts the marker; if new, **reads** the row, then **writes `existing + 1`** or inserts a new row; separate requests, no lock |
| Live capture page, `api/identify`, `api/upload-identify`, `api/upload-reconcile` | the same read-then-write pattern, no lock |
| Delete / undo routes | read the row, then write a recomputed count, no lock |

## Guaranteed: no song is counted twice for the same show

Every writer must first insert the marker `(user, performance, normalized title)`, which is unique. Only the writer whose insert succeeds counts that song for that show, and all writers use the same key (`normalizeSongKey`, reproduced exactly in SQL).

This holds for every combination of writers. It was demonstrated with:
- old tab, then candidate (B2);
- old tab and candidate at once (B3);
- `main` and candidate at once (B4);
- capture markers, then review (suite A);
- re-saves.

## Not guaranteed: two mixed-writer races remain

Both need **the same artist and the same song** written by two different shows at overlapping moments (within roughly one round trip), where at least one writer is not the trigger.

| Race | When | Effect on counts | Effect on catalogue lookups |
|---|---|---|---|
| **Lost update (under-count)** | an unlocked writer reads N; the trigger, or another writer, raises it to N+1; the unlocked writer then writes its stale N+1 | the song ends 1 lower than it should; never higher | My Songs and Career show one fewer play; search ranks it slightly lower; a song left at 1 can look like a "first appearance" |
| **Split row** | no row exists yet; an unlocked writer and the trigger (or two unlocked writers) each insert one | the total is correct, but spread over two rows (e.g. 1 + 1) | My Songs lists the song twice with partial counts; search ranks each row lower; "first appearance" (`confirmed_count = 1`) can be claimed wrongly; later trigger increments go to the higher-count row; the delete route may decrement either row. Capture matching (catalogue membership) is unaffected. |

**What the tests show:**
- **Trigger with trigger:** neither race can happen, because the lock serializes them. B3 found one row counted twice, and the race-free result reappears only with the lock in place.
- **`main` with the candidate (B4):** no double count, and one row in that run. **That doesn't prove the races can't happen.** They were not reproduced deterministically; they follow from the code (table above).

**How long the exposure lasts:**
- **Old page-side loop:** until no session runs it, so after the candidate ships and old tabs reload.
- **Capture and upload writers and delete/undo:** **permanently, until those paths are repaired.** That's out of scope here and remains open.
- **Two unlocked writers racing each other:** a separate, existing exposure today, already possible between two `main` tabs.

**Preflight check 12** reports how many split rows already exist in production.

**Remedies (not part of this change, need approval):**
- move the remaining writers onto the same locked function;
- after de-duplicating existing rows, add a unique index on `user_songs (user_id, song_title)`. That prevents new split rows, and also gives the lookup an index.
