# Before-tonight photo benchmark (paused, preserved)

**Status, 2026-11-02:** stopped by the owner. Photo parsing already exists in Setlistr, so re-measuring it isn't a prerequisite for strategy or prototype review. **Nothing here is scheduled to run again.**

**Paid calls:** 1 attempted, 0 completed and 85 never attempted.
- The single call (dev split, f00, production prompt) on pinned `claude-sonnet-4-5-20250929` returned HTTP 400 after 123 ms, and the run stopped.
- **The cause is unknown.** The harness recorded only the status at the time, and the diagnostic added afterwards was never exercised.
- **Spend:**
  - $0 in reported token usage;
  - $0.03 reserved in `ledger.json` against the $4.50 harness cap, because errors are counted at worst case.
- The key was deleted when the run loaded it, and was never logged.

## What's here

| Path | What |
|---|---|
| `make_fixtures.py`, `render.js`, `fixtures/truth.json`, `fixtures/visibility.json` | The synthetic artist "Lena Hart", 40 setlists and 3 retakes. The images aren't committed; `render.js` regenerates them. |
| `lib.js` | The production title matcher, copied verbatim, and a candidate matcher. **The candidate is development evidence only**: it was designed knowing the generator. |
| `score.js`, `results-oracle.json` | The layered scorer (transcription, identification, event association, confirmation effort), run free from ground truth. |
| `run.js`, `out/freeze.json`, `ledger.json`, `run.log` | The paid harness: pinned model, bounded tokens and retries, a worst-case reservation per call. `freeze.json` records the original fingerprints and the owner-approved diagnostic revision. |
| `matcher-repro.js` | Offline reproduction of the matcher defects (see `../parse-setlist-matcher-finding.md`). |
| `discovery/` | The MusicBrainz probe (19 requests, 2026-10-30) and its outputs. |
| `proto/` | The "Before tonight" prototype. `before-tonight.html` shows **placeholder readings from ground truth, not model output**. |

## Findings worth keeping

1. **Production matcher defects:** ambiguous titles and medleys. Recorded in `../parse-setlist-matcher-finding.md` and backlog item 5 of `../data-integrity-open-issues.md`. No fix authorised.
2. **Event association, run free from ground truth:**
   - With a photo time near the show and a header, the right booking was the top candidate in 14 of 15 dev and 14 of 22 held-out cases.
   - Held-out photos with no usable time had **no candidate at all** (6 of 22).
   - The synthetic data includes same-city next-day and cancelled bookings, which shows they need to be in the data. It doesn't measure how often they happen in real touring.
3. **MusicBrainz:** a source for composition identity, not for performance.
   - Of the 561 events with setlists, 553 were Phish; four of the seven probed artists had none.
   - The setlist links are **work** (composition) IDs, not recording IDs.
   - Only 293 of 341 song lines were linked, across a 23-event sample.

**Not established:** real-world OCR accuracy on authorised real photos. None exist, and the synthetic fonts aren't handwriting.
