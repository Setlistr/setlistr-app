# Setlist matcher: assessment before any further work

*2026-11-02, from code and migration text only; revised the same day (sections 4–8). No production queries. Branch `fix/setlist-title-matcher` is **on hold**, not to be activated.*

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

## 4. Audit: `inclusion_reason` and `notes` (song level)
**`performance_songs.inclusion_reason` records why a row exists, meaning how it was detected or added. Code depends on its exact values.**

| Consumer | Use |
|---|---|
| Recognition: `api/identify`, `upload-identify`, `upload-reconcile`, and the live page's save | Writes values such as `planned setlist - detected`, `uploaded setlist - detected`, `artist catalogue`, `added mid-show - detected/not detected`, plus threshold and score. |
| Planning: show/new, new | Writes `planned setlist - not detected`. |
| Upload: `show/upload`, `upload-performance` | Copies the value from recognition. |
| Review save | Exact matches drive three behaviours: a kept `planned setlist - not detected` row counts as played (`playedPlanned`); a removed undetected row becomes TN, otherwise FP; kept undetected rows become FN, everything else TP. Rows added after the show become `manually added post-show`. |
| Views | `performance_songs_visible` (0005) exposes it. |

**`performance_songs.notes`** is written only by Review, as a correction log (`was <artist>-<title>`), and is exposed through the same view; nothing reads it for logic. The `notes` field on the **show** (`performances.notes`) is a different column (setlist.fm import text and the performance page).

**Not used by either field:**
- **Proof provenance:** reads `source` (recognised versus entered by the team).
- **Claim-sheet export:** title, artist, composer, ISRC, publisher.
- **Copied setlists:** "Use a past setlist" and "Load that set" copy title, artist and position only.
- **The completion trigger:** reads title, artist, `source` and removal.

**Conclusion:** neither field should carry identity. Using `inclusion_reason` would break Review's played and FN/TP logic and the detection analytics. `notes` is free text that nothing reads for logic. Both keep their current meanings.

## 5. Three separate facts
| Fact | Where it lives | Unresolved row |
|---|---|---|
| **Was it played?** | A kept, confirmed `performance_songs` row: not removed, not still `planned`. | Yes: confirmed like any row. |
| **Which composition?** | Writers and ISWC: `composer` on the row; later, `recording_id` → `recording_works` → `works` (0007, with candidate or confirmed states). | Unknown: no writer, no work link. Nothing is inferred. |
| **Which catalogue entry?** | Today **implicit by title**: there is no ID link from a performance row to `user_songs`. | None. |

**How each count behaves under the proposal:**
- **Show song count, Proof counts and "songs played live":** every confirmed row, resolved or not. Unchanged.
- **Catalogue entry count** (`user_songs.confirmed_count`, Career's most-played songs): only rows linked to that entry, once per show per entry. Unresolved rows count toward no entry. Career can say "2 plays not matched to a song".
- **Composition** (claim sheet): writer only from a chosen entry or a confirmed work link. An unresolved row is listed as performed, with its writer missing.

**Catalogue writes today:** counts are written in **five** places, all keyed by title, and all overwrite `canonical_artist`:
- the live page's `writeUserSong`;
- `api/identify`, `upload-identify` and `upload-reconcile`, at detection time, **before anyone confirms**;
- the completion trigger.

## 6. Two distinct compositions sharing a title
**Constraints inspected:**
- `user_songs` has `id` and `UNIQUE (user_id, song_title)`.
- `user_song_performances` has `UNIQUE (user_id, performance_id, normalized_title)`, keyed on a bracket-stripped title.
- `performance_songs` has no catalogue link; it has a nullable `recording_id`. Locally the recordings and works tables are missing, and whether 0007 is applied in production is unknown.

So an original and a cover both called "Dreams" can't be two entries today, and nothing can say which entry a row means.

**Proposal: an explicit link, no invented identity.** Proposed migration, not applied:
1. **Add `performance_songs.user_song_id`:** nullable, `REFERENCES user_songs(id) ON DELETE SET NULL`. It's set only by a person's choice, or by a single exact, unambiguous match. **NULL means the identity is unresolved**, which needs no extra flag.
2. **Add `user_song_performances.user_song_id`**, with `UNIQUE (performance_id, user_song_id)`. The completion trigger counts linked rows by entry and stops overwriting a non-empty `canonical_artist`. Legacy title markers remain for old rows. No historical repair.
3. **Two entries with one title:** replace `UNIQUE (user_id, song_title)` with `UNIQUE (user_id, song_title, canonical_artist)`, where empty means the artist's own. **This only works once the other title-keyed writers select by ID or by title plus artist.** Those are the live page, the three recognition routes, admin preload, both Spotify imports, MySongs, and performance delete and undo. `api/identify` is protected and needs your explicit go-ahead. Until that's done, steps 1 and 2 still stop merges and invented identity; a same-title cover simply stays unresolved, or is chosen as the existing entry only if the person decides it is.

## 7. Review interaction (existing assign sheet, extended)
A confirmed row with no catalogue link shows "Which song is this?" and the original text ("Written as …"). Tapping it opens the existing assign sheet (`CatalogSearch`):
- **Choose a known song:** links the entry, uses its title and artist, and copies its writer (existing behaviour).
- **Correct or add a song:** type a title. "Add as a new song" creates an entry for it and links it. Today this also triggers a MusicBrainz writer lookup (`enrich-song`). Proposed: show the result as a suggestion to accept, never applied silently.
- **Played, song not identified:** a new option. The row stays confirmed as played, with no link and no writer; it shows "Played · song not identified" and can be resolved later.
- **Planned rows:** "✓ Played" works as today, marking the song played, but leaves the link empty when the title isn't an exact, single catalogue match.

## 8. Revised recommendation
1. **Keep the branch on hold.** Don't turn substitution on. When matching ships, it suggests only (section 1 of the held work), plus medley splitting with the line preserved.
2. **Approve the link migration** (section 6, steps 1–2) and the Review options (section 7), so a played song can stay unidentified without a forced catalogue choice and without being merged by title.
3. **Defer the uniqueness change** (step 3) until the title-keyed writers are converted.

**Decisions needed:**
- **The migration:** approve steps 1–2, applied first on the local disposable stack.
- **Catalogue writes during recognition:** whether recognition routes should keep writing catalogue counts at detection time, before confirmation. Changing `api/identify` needs explicit instruction.
- **New-song writers:** whether the MusicBrainz lookup for new songs becomes suggestion-only.
- **Same-title entries:** whether to pursue step 3 (artist-keyed uniqueness) or rely on the work layer (0007) later.
- **Turning the query on:** when to correct the catalogue query in production, once suggestions replace substitution.

No historical repair is proposed. The website candidate is separate and can go to release review on its own.
