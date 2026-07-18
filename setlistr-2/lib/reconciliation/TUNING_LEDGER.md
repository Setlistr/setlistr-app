# Reconciliation engine — tuning ledger

Tracks config constants (`lib/reconciliation/config.ts`) that the harness has
shown produce a real tradeoff, pending a data-driven decision rather than
intuition. Each entry: symptom, root cause, proposed experiment, status.

Do not resolve an entry by adjusting the constant "until the number looks
right" — resolve it by running the benchmark set at each candidate value and
recording the actual before/after table.

---

## Entry 1 — UNKNOWN_SONG_SUPPRESSION vs. single-observation true positives

**Status:** CLOSED 2026-07-18 — root cause was not suppression. Sweep not run; proven unnecessary by arithmetic. See below.
**Logged:** 2026-07-18, during Phase 1 harness build.

**Original symptom:** on the Scotiabank Arena smoke-test performance
(`9301a409-7866-4564-9050-3434cefb6f7e`), the engine regressed relative to
live detection alone — baseline caught 9/10 confirmed songs, the engine
(CONFIRMED+LIKELY) caught only 8/10. "Dammit" was the dropped song.

**Corrected root cause (the initial diagnosis below was wrong — logged here
for the record, not because it was right):** the first write-up of this
entry claimed "Dammit" was a single isolated observation scoring 0.75 that
`UNKNOWN_SONG_SUPPRESSION` (0.5×) pushed below the LIKELY floor. That was a
hand-derivation, never checked against the actual slot data. Once
`resolve.ts` was extended to expose losing-group score breakdowns (see
`GroupScoreBreakdown` in `resolve.ts`), the real mechanism turned out to be
a CLUSTER bug, not a RESOLVE/suppression issue: the "Old Apartment" anchor
in slot 7 had a long nominal ACR duration (214000ms), and CLUSTER's
1.5x-duration absorption cap swallowed the *entire* remainder of that
window — including two independent, real "Dammit" observations (tier-b
score 95, tier-a score 75) — into the same slot as "Old Apartment." RESOLVE
correctly picks one winner per slot; "Old Apartment" won (it was the
anchor, plus matched `artist_catalogue_membership`), so "Dammit" never won
*any* slot and never surfaced as a conclusion at all, regardless of
`UNKNOWN_SONG_SUPPRESSION`'s value. It was also not suppressed in the
"zero-prior-match" sense — it later turned out to be in the artist's
catalogue too.

**Fix:** `cluster.ts` now detects contradicting evidence past 1.0x of the
anchor's nominal duration — if >=2 independent rank-1 observations agree on
the same non-anchor title, the slot closes at the first such observation
and a new slot anchors on that title. Verified end-to-end: Scotiabank now
scores 9/10 (CONFIRMED+LIKELY), "Dammit" wins its own slot (score 1.0,
tier CONFIRMED), and all other 8 conclusions are unchanged. Re-ran the full
golden set in dry-run afterward — zero regressions on any of the other 9
shows. Persisted as engine run `e7c16f3f-532c-482a-b0ab-fe0ef55cf7be`
under `ENGINE_VERSION: 'phase1-v2'`.

**Why the originally-proposed suppression sweep is dead, not just
deprioritized:** with the real slot data now visible, hand-checked the
sweep's premise directly. For the "Old Apartment" vs. "Dammit" competition
specifically:
- "Old Apartment": bestScore 0.80 + consistency 0.08 + anchor 0.97 +
  catalogue prior 0.12 = 1.97 → clamps to 1.0 regardless of any suppression
  value (it has real prior matches, suppression never applies to it).
- "Dammit" (pre-fix, still merged into the same slot): bestScore 0.95 +
  consistency 0.08 + anchor 0 + priors 0 = 1.03, then × suppression. At
  0.5× → 0.515, at 0.65× → 0.6695, at 0.8× → 0.824, and even at **no
  suppression at all (1.0×)** → clamps to 1.0, a dead tie broken toward
  whichever group the resolver encounters first (chronologically "Old
  Apartment"). "Dammit" could not have won this slot at any tested
  suppression value, or with no suppression applied at all — the one-
  winner-per-slot design was the binding constraint, not the multiplier.
  Running the sweep as originally scoped would have produced a flat,
  non-diagnostic 8/10 line at every value, for a reason unrelated to what
  the sweep was built to test.

**Standing decision:** the suppression sweep stays dead. It is not
scheduled and should not be run reflexively if a future show looks similar
— check the new `out_competed_in_slot` classification first (see
`scoreConclusions` in `score.ts`) to see whether the missed title actually
lost on suppression grounds (a real candidate for the sweep) or lost to a
CLUSTER/one-winner-per-slot mechanism (not a suppression question at all,
per this entry). Only re-open this entry if `out_competed_in_slot` data
shows a title that would flip to LIKELY/CONFIRMED under a higher
suppression value *without* being blocked by a same-slot competitor at any
suppression setting.

---

## Entry 2 — Ranchman's (b6a90dd4): "old dirt roads" lost to a same-slot competitor

**Status:** open, not investigated. Surfaced by the golden-set regression
check after Entry 1's fix; explicitly out of scope for that fix.
**Logged:** 2026-07-18.

**Symptom:** performance `b6a90dd4-526d-496c-a669-457bc38d7ea7` scores 4/5
at both CONFIRMED and CONFIRMED+LIKELY, missing "old dirt roads." This was
first flagged in the original Phase 1 diagnosis alongside the Scotiabank
"Dammit" regression, but was a distinct issue and was never separately
investigated — Entry 1's fix did not change this show's score (confirmed
via golden-set dry-run, before and after are identical).

**What the new instrumentation shows:** the `out_competed_in_slot`
classifier (new in this session, see `score.ts`) reports: `"old dirt
roads" — lost slot 5 to "In My Head Again" (its own score=1.000,
suppressionMultiplier=1)`. This is a clean, unsuppressed, full-score win by
a real competitor within the same slot — architecturally similar in shape
to Entry 1 (one winner per slot, two real candidates) but the specific
absorption/split mechanism fixed in Entry 1 may not apply here (unclear
whether "old dirt roads" ever had 2 independent rank-1 observations past
nominal duration, which is what the split rule requires — this has not
been checked).

**Not investigated further per explicit scope instruction during Entry 1's
fix** ("Do NOT touch any other detection logic..."). Logged here so it
isn't lost. Next step, when picked up: dump slot 5's observations/losing
groups for this performance (same method as Entry 1) before proposing any
fix.
