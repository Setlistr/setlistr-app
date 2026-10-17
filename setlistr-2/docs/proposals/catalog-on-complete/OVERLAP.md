# Mixed writers: what's guaranteed and what isn't (revision 2, corrected for production)

**Corrected 2026-10-17.** The earlier version of this page was written against the local schema. Production has `UNIQUE (user_id, song_title)` on `user_songs`, which the local schema lacked. So:
- **split rows can't happen in production;**
- **the race instead loses a count;**
- the earlier claim that the trigger "takes a per-artist lock" no longer applies, because revision 2 uses the unique key instead.

All results below are from the disposable stack in production's shape (`final2/db-verify.log`, `final2/prod-verify.log`).

## Who writes the catalogue

| Writer | How it counts a song for a show |
|---|---|
| **The trigger** (revision 2) | inserts the per-show marker; if new, **one atomic upsert**, `INSERT … ON CONFLICT (user_id, song_title) DO UPDATE SET confirmed_count = confirmed_count + 1`, in the same transaction |
| Review page in `main` and earlier builds (page-side loop) | inserts the marker; if new, **reads** the row, then **writes `existing + 1`**, or inserts a new row; separate requests |
| Live capture page, `api/identify`, `api/upload-identify`, `api/upload-reconcile` | the same marker → read → write sequence |
| Delete / undo routes | read the row, then write a recomputed count |

## Guaranteed

1. **No song is counted twice for the same show, by any mix of writers.** Every writer first inserts the unique marker `(user, performance, normalized title)`, and only the writer whose insert succeeds counts the song. All writers use the same key, `normalizeSongKey`, which has been unchanged since markers were introduced (checked in git history) and is reproduced exactly in SQL.
2. **Never two catalogue rows for the same artist and title.** Production's unique key enforces it.
3. **The trigger never fails, and never loses a count, because of another writer.** If another writer creates the song's row mid-save, the upsert waits and then counts onto that row (db-verify R1). For comparison, revision 1 failed there with `23505`, which the page would have shown as permanent.
4. **Trigger with trigger is exact.** 12 rounds of two simultaneous completions sharing two songs in opposite positions: 0 errors, 0 deadlocks, both songs at exactly 24.

## Not guaranteed: two races, both losing a count, never adding one

Both need **the same artist and the same song** written for two different shows at overlapping moments, where at least one writer is an **unlocked page or route writer**.

| Race | Sequence (replayed step by step through PostgREST, as those writers run it) | Effect on counts | Effect on catalogue lookups |
|---|---|---|---|
| **R2 · lost count** | the unlocked writer reads "no row"; another writer creates the row; the unlocked writer's insert gets `23505`. `main` ignores the error; the old candidate tab reports it. | one show's play of a **new** song is never counted (1 instead of 2). Its marker exists, so nothing later recounts it. | one row, one play too few; a song left at 1 can look like a "first appearance" on its second show |
| **R3 · lost update** | the unlocked writer reads N; another writer makes it N+1; the unlocked writer writes its stale N+1 | one play too few (6 instead of 7 in the test) | the count, ranking and "first appearance" can be off by one |

**The earlier "split row" race doesn't exist in production.** It was an artifact of the local schema lacking the unique key. Preflight check 12 confirms production has 0 duplicate sets.

**Which mixes are exposed:**

| Writers | Exposed? |
|---|---|
| Trigger + trigger (candidate + candidate) | no |
| Trigger + old page loop (old tabs, deployed `main`) | yes, R2/R3, the old writer's count is the one lost, until those tabs are gone |
| Trigger + capture, uploads, delete/undo | **yes, permanently, until those paths are repaired (open, out of scope)** |
| Two unlocked writers | yes, as today, independent of this change |

**Browser evidence (B4, deployed `main` + candidate at once):** the candidate completes; markers 2; always one row; the total is 2, or 1 when `main`'s loop loses the race.

## What would close them (not part of this change; needs approval)

Move the remaining writers onto the same database function, or make them use an atomic increment. That's the open live-capture/upload catalogue repair. The unique key already prevents duplicate rows, so no de-duplication or new index is needed.
