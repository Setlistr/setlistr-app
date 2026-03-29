[03-detection-pipeline.md](https://github.com/user-attachments/files/26331828/03-detection-pipeline.md)
# Setlistr Detection Pipeline

## Trigger
Apply this skill for any work touching song detection, recognition, confidence scoring, or the identify route.

---

## Architecture Overview
The detection system is hybrid: ACRCloud is the primary engine, OpenAI transcription is the fallback. GPT is used only for clue extraction — never for song identification directly.

## ACRCloud
- **Humming engine is preferred** over fingerprint matching for acoustic performances
- Humming results are boosted to always hit the fast path — this was a critical fix and must not be reverted
- Fingerprint matching is less reliable in live/acoustic contexts

## Confidence States
Every detection result is assigned one of four states:

| State | Meaning |
|---|---|
| `auto` | High confidence — confirmed automatically, no user action needed |
| `suggest` | Medium confidence — surfaced to user as a suggestion to confirm or swap |
| `manual_review` | Low confidence — flagged for manual review |
| `no_result` | Nothing detected — user must add manually |

## OpenAI Fallback
- Triggered when ACRCloud returns no result or low confidence
- Used for audio transcription to extract lyric/title clues
- GPT processes clues to suggest possible matches — it does NOT make the final identification call
- Model: use the current production model specified in env/config, do not hardcode

## identify Route
- Lives in the API routes
- Handles: ACRCloud call → confidence evaluation → optional OpenAI fallback → state assignment
- ISRC and composer enrichment happens here via MusicBrainz after a confident match
- Results written to `performance_songs` with enriched columns

## MusicBrainz Enrichment
After a confident match, the identify route fetches:
- ISRC
- Composer credits
- Publisher

These are stored in `performance_songs` and used downstream for PRO exports.

## detection_events Table
- Logs each detection attempt and outcome
- **Activating this logging is a current development priority**
- Useful for debugging, demo reliability, and future A/B testing of detection engines

## Hard Rules
- Do NOT change detection confidence thresholds without explicit discussion
- Do NOT remove the humming engine boost
- Do NOT use GPT to identify songs — clue extraction only
- Do NOT add new detection engines without a phased plan and shadow mode evaluation
