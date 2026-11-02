# Setlist matcher: assessment before any further work

*2026-11-02, from code and migration text only. No production queries. Branch `fix/setlist-title-matcher` is **on hold**, not to be activated.*

**Two things are kept apart throughout:**
- **Song-performance counts:** how often a title was played (`user_songs.confirmed_count`, Career's most-played songs).
- **Composition identity:** which work, and so which writers, a performed song is. That comes from `performance_songs.composer`, `isrc` and `recording_id`, which is what Prepare uses.

## 1. What correcting the query newly enables
In production, the catalogue query fails, so nothing is matched and titles reach the show as written. The held branch corrects the query, so for the first time:
- **Title replacement:** parsed titles are compared with the artist's catalogue. A clear match **replaces the written title and artist** with the catalogue's `song_title` and `canonical_artist`; "Wildfire" becomes "Wildfire Season".
- **Inherited artist errors:** that artist is the catalogue's last-written value (see 3), so it can be wrong.
- **Medley splitting:** lines are split into separate songs. This works without the catalogue too.
- **Review prompts:** ambiguous lines get prompts on the planning screen.
- **New read:** `profiles.artist_name` is read.

## 2. How an unresolved identity travels today (and on the held branch)
| Stage | What happens to "Dreams (FM)" |
|---|---|
| **Planning** (show/new, new) | Today: shown as written, with no prompt. Branch: shown with a question and the candidates; if left unanswered, it's saved as written. |
| **Saving the plan** | `planned_setlist_songs(title, artist, position)` and `performance_songs` (`source 'planned'`, `inclusion_reason 'planned setlist - not detected'`). **Any uncertainty is dropped here**; nothing records it. |
| **Live capture or upload** | Recognition admits **any** recording whose title key is `dreams`, at score ≥ 1, with that recording's artist, ISRC and MusicBrainz writers (backlog item 7). This creates a separate detected row, so composition identity comes from the recording, not the person. |
| **Review** | The planned row appears under "On your setlist · did you play these?". **✓ Played** keeps the written title, with no composer. **Assign** copies a catalogue song's composer, or for a new song looks it up on MusicBrainz by title and artist; both are explicit actions. Nothing marks the row as uncertain. |
| **Completion** | The catalogue trigger merges and overwrites (see 3). |
| **Prepare** | Uses `performance_songs.composer`. An unresolved row has no writer, so the claim sheet shows it as missing rather than inventing one. |

## 3. How completion combines same-title songs (backlog item 6)
`record_performance_catalog` keys each kept song by a title key that ignores case, punctuation and anything in brackets. It upserts `user_songs` on the exact `(user_id, song_title)`, overwriting `canonical_artist` every time.

**Examples:**
- **Original and cover sharing a title.** The artist plays their own "Dreams" and a Fleetwood Mac "Dreams" saved under the same title. Effects:
  - the show is counted once for `dreams`;
  - a later show with only the cover adds to the original's count and sets `canonical_artist` to Fleetwood Mac;
  - the next photo match would then give the artist's own "Dreams" Fleetwood Mac as artist.

  These are count errors that turn into identity errors downstream.
- **Unresolved artist hint "Dreams (FM)".** It's saved as "Dreams (FM)", a separate `song_title`, but it shares the key `dreams` for the per-show marker. If the show also had the original "Dreams", one of them goes uncounted.
- **Ambiguous medley components** ("Home Agn > Dreams (FM)"):
  - **Today:** one combined row; one key, `home agn dreams`.
  - **Held branch:** two rows, both unresolved. "Home Agn" becomes its own catalogue song (a misspelled duplicate of Home or Home Again); "Dreams (FM)" behaves as above.

## 4. Existing structures that could hold uncertainty (no new column needed)
| Structure | Fit |
|---|---|
| `performance_songs.inclusion_reason` (text) | **Best fit.** Already says why a row exists; show/new writes it. A value such as `planned setlist - identity unresolved` could mark the row. Review's save compares this field to `planned setlist - not detected`, so that comparison would need to accept both. |
| `performance_songs.notes` (text) | Can hold what was written and the candidates (Review already writes `was …` notes here). Free text, so it's for display, not logic. |
| `performance_songs.source = 'unidentified'` | Review already treats these as "needs a name" and opens the assign sheet. Wrong fit: it means *no title*, it doesn't keep planned-song semantics, and the catalogue trigger counts it. |
| `recordings`, `works`, `recording_works` with `candidate` or `confirmed` and `user_confirmed` scope (0007), plus `performance_songs.recording_id` | The intended home for **composition identity**: "this recording is that work", with confirmation recorded. No app code uses it, and planned rows have no recording. Whether 0007 is applied in production is unknown: locally, `recording_id` exists but the tables don't. |
| Review's `reviewState` | Client-only; it can display uncertainty but not keep it. |

## 5. Recommended smallest complete fix (for review, not started)
1. **Suggest, don't replace.** Correct the query, but never change a written title automatically except for case and spacing on a single exact match. Every other catalogue match becomes a one-tap suggestion on the planning row. This keeps today's behaviour of titles as written, without silent substitutions. Medley lines split, and each part keeps the line.
2. **Keep the uncertainty, without a new column.** show/new writes unresolved rows with `inclusion_reason = 'planned setlist - identity unresolved'` and `notes = written as "…"; candidates: …`.
3. **Review.** Such rows show the existing needs-review styling and the question. **✓ Played** opens the existing assign sheet (choose a catalogue song or keep as written) instead of silently marking the row played. The save treats a resolved row like any played planned row.
4. **Migration, proposed and not applied:** a change to `record_performance_catalog` only:
   - don't overwrite a non-empty `canonical_artist` with a different artist;
   - don't count rows still marked `identity unresolved`;
   - key the per-show marker on the exact title rather than the bracket-stripped key, so "Dreams (FM)" and "Dreams" are counted separately.

   No table or unique-key change. Recording an original and a cover with an identical title as two songs would need `user_songs` keyed by artist, a larger change better handled through `recordings` and `works` later.
5. **Recognition (needs your explicit go-ahead; `api/identify` is protected).** Exclude rows marked `identity unresolved` from the planned-title prior, so an unresolved planned title can't admit a recording at score 1. Without this, step 3 still holds: the detected row arrives separately and is visible in Review, but its writers come from the recording.

**Not in scope:** historical repair; turning on automatic substitution; work-level matching. The held branch's prompt, tests and merge helpers are reusable for steps 1 to 3.
