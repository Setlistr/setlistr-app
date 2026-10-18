# Mixed writers: what's guaranteed and what isn't (revision 2, corrected 2026-10-18)

**Corrections to earlier statements (including the 2026-10-17 report):**
1. *"Another writer can never make the trigger lose a count"* was **wrong.** The trigger's increment is atomic only against other atomic writers. An older read-then-write writer can **overwrite the trigger's committed count later**, with a value computed from a read taken before the trigger ran (O1).
2. *"They never add one"* was **wrong.** When the value discarded is a delete's decrement, the stale write leaves the count **too high** (O2).

The *split-row* correction from 2026-10-17 still stands: production's `UNIQUE (user_id, song_title)` makes a second row for the same title impossible.

All results are from the disposable stack in production's shape:
- `final2/db-verify.log`: R1–R3;
- `final3/policy-verify.log`: O1–O3, run with both proposed migrations applied;
- `final3/prod-verify-policy.log`: B1–B5, the browser runs.

## Who writes the catalogue

| Writer | How it changes `confirmed_count` | Atomic? |
|---|---|---|
| **The trigger** (revision 2) | `INSERT … ON CONFLICT (user_id, song_title) DO UPDATE SET confirmed_count = confirmed_count + 1` | **yes**: computed from the committed value under a row lock |
| Old review loop (`main`, older builds), live capture page | reads the row, then writes the absolute value `existing + 1` (or inserts 1) | no |
| `api/identify`, `api/upload-identify`, `api/upload-reconcile` (service role) | the same read, then absolute write | no |
| Delete route / undo route (service role) | reads, then writes `existing − 1` / `existing + 1` | no |

## The guarantee, precisely

For **every** mix of writers:
- **G1 · at most one count per song per show.** A song is counted for a show only by the writer whose insert of the unique marker `(artist, show, normalized title)` succeeds. Every writer uses the same key. (The delete route deliberately reverses a show by deleting its markers.)
- **G2 · at most one catalogue row per artist and title.** Production's unique key enforces it.
- **G3 · the trigger never fails because of another writer.** If another writer creates or locks the row, the trigger waits and then applies +1 to the value committed at that moment (R1).

For **atomic writers only** (the trigger with the trigger):
- **G4 · exact.** Every increment is kept: O3, and the 12-round concurrency test, both songs at exactly 24.

**Not guaranteed when a read-then-write writer overlaps any other writer on the same artist and title:**
- the read-then-write writer replaces `confirmed_count` with its **stale read ± 1**;
- that **discards every change committed between its read and its write**, including the trigger's.

So **the count can drift from the number of counted shows in either direction:**

| Interleaving | Demonstrated | Result |
|---|---|---|
| **O1** · old writer reads 5 → trigger commits 6 → old writer writes 5+1 | yes | **6** after two counted shows (true 7): the trigger's committed increment is overwritten |
| **O2** · old writer reads 5 → delete route commits 4 → old writer writes 5+1 | yes | **6** (true 5): the decrement is discarded, an **over-count** |
| **R2** · old writer reads "no row" → trigger creates it → old writer's insert gets `23505` | yes | 1 after two counted shows (true 2); `main` ignores the error |
| **R3** · old writer reads 5 → another writer makes it 6 → old writer writes 6 | yes | 6 (true 7) |

**Size of the error:** the drift from each race equals the net of the changes it discards, usually one. The per-show markers stay correct, so the counts can be recomputed from them later. That's a backfill-type operation and not part of this change.

**Effect on lookups:**
- the count, and so ranking in My Songs, Career and search, can be off by the drift;
- a song whose count drops to 1 can look like a "first appearance", and one pushed above its true value won't;
- catalogue membership, and with it capture's song matching, is unaffected.

## Exposure

| Overlapping writers | Exposed? |
|---|---|
| Trigger + trigger (candidate saves) | no (G4) |
| Trigger + old review loop (deployed `main`, old tabs) | yes, until no session runs that code |
| Trigger or anyone + live capture, identify, uploads, delete/undo | **yes, permanently, until those paths use an atomic increment or the same function: open, out of scope** |
| Two read-then-write writers | yes, as today, independent of this change |

## Browser evidence

**B4** (deployed `main` + candidate at once): the candidate completes, 2 markers, always one row; the total is 2, or less if `main`'s loop loses the race.
