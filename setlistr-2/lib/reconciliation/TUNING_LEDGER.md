# Reconciliation engine — tuning ledger

Tracks config constants (`lib/reconciliation/config.ts`) that the harness has
shown produce a real tradeoff, pending a data-driven decision rather than
intuition. Each entry: symptom, root cause, proposed experiment, status.

Do not resolve an entry by adjusting the constant "until the number looks
right" — resolve it by running the benchmark set at each candidate value and
recording the actual before/after table.

---

## Entry 1 — UNKNOWN_SONG_SUPPRESSION vs. single-observation true positives

**Status:** open, pending post-baseline sweep.
**Logged:** 2026-07-18, during Phase 1 harness build.

**Symptom:** on the Scotiabank Arena smoke-test performance
(`9301a409-7866-4564-9050-3434cefb6f7e`), the engine regressed relative to
live detection alone — baseline caught 9/10 confirmed songs, the engine
(CONFIRMED+LIKELY) caught only 8/10. The dropped song, "Dammit," is
classified by the harness's missed-song breakdown (`scoreConclusions` in
`lib/reconciliation/score.ts`) as **suppressed**, not no-evidence: the engine
did produce a conclusion for it, at UNKNOWN tier, score ≈0.375.

**Root cause:** "Dammit" appeared as a single isolated tier-a observation
(one `recognition_logs` row, ACR score 75, humming) — never repeated in an
adjacent chunk, so CLUSTER never anchors it (no `ANCHOR_BASE_SCORE`). RESOLVE
scores it purely on base candidate score (0.75) with zero consistency boost
(one supporting observation) and zero prior matches — it's not on the
planned setlist, not in the artist's `user_songs` catalogue, and never
appeared in a prior confirmed setlist. Zero prior matches trigger
`UNKNOWN_SONG_SUPPRESSION` (currently 0.5×): `0.75 × 0.5 = 0.375`, below the
0.6 LIKELY floor.

**The tradeoff:** `UNKNOWN_SONG_SUPPRESSION` is what correctly killed several
genuine false positives elsewhere in the golden set (7 of 10 shows had
baseline precision < 1.00, all recovered to 1.00 by the engine — spurious
secondary ACR guesses that individually passed live detection's per-chunk
threshold but don't survive the broader priors). The same mechanism
suppresses a legitimate first-time cover: any song an artist plays that
isn't yet planned or catalogued currently cannot reach LIKELY on a single
strong (≥0.6 raw) detection alone. Loosening the constant to fix Scotiabank
risks re-admitting the noise it was added to suppress elsewhere.

**Proposed experiment (not yet run):** re-run the full golden set (`--mode
engine`) at `UNKNOWN_SONG_SUPPRESSION` = 0.5 (current), 0.65, and 0.8 (or
similar spread), holding every other constant fixed. For each value, record
per-show CONFIRMED and CONFIRMED+LIKELY precision/recall, with specific
attention to whether "Dammit"-style suppressed songs flip to LIKELY without
reintroducing any of the 7 false positives the current value correctly
suppresses. This is a post-baseline exercise — do not run until the first
baseline-only scoring pass is recorded and reviewed.
