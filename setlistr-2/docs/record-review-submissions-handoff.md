# Record, Review and Submissions refinement — release handoff

Branch `refine/record-review-submissions`, cut from production `main` at **`1aee35b`**.

**Visual direction approved** by the product owner on 2026-10-19, after reviewing the Preview of `d889b75`. No further redesign or concept variations. The commits after `d889b75` are the scope labels, one date line and this document; they make no visual-direction change.

**Status: production held.** No merge, production deployment, SQL, environment change or backfill. The Preview shares the production database, so every write test ran on the disposable local stack. Review the Preview read-only.

## Commits

| Commit | Change |
|---|---|
| `71b1a89` | Review: a failed show load is an error, never an empty show. Saving is unavailable until the songs load. A failed photo upload is reported. |
| `60a63f4` | Show dates: `lib/show-date.ts` `showDay()` — see Dates below. |
| `d39bff1` | Celebration: the source line's parts add up. No song states change. |
| `bf436ae` | Review revision 2. The verification wording follows stored evidence: "Matched setlist" (recognition source), "Played from setlist" (`manual`), otherwise the common "On your setlist". |
| `8b30037` | Submissions: venue-first rows; one next step; quiet chevrons; shared profile blockers said once; the ready group's estimate and disclaimer. |
| `2ff9844` | Dashboard and History composition:<br>• information button (44px, `aria-expanded`/`aria-controls`, Escape);<br>• the "not yet submitted" subset named in accessible text;<br>• History search, Filters and toolbar;<br>• loading geometry held. |
| `ef4da35` | Career's headline counts the live record (`isCapturedShow`). |
| `d889b75` | Layout invariants follow the approved design. |
| `af3cc28` | Career: one explanation for the figures that include imported shows — see Career scope. |
| `32b42aa` | Review: the pre-celebration sequence shows the show's own day. It had used the UTC date part of `started_at`. |

## Career scope (checked against each query)

| Figure | Source | Includes imported shows |
|---|---|---|
| Shows played, map count | live record (`isCapturedShow`) | no; "+ N imported" shown beneath |
| Song performances, cities, hours on stage, lifetime estimate | Career's show list (`CAREER_SHOW_STATUSES`) and its songs | yes |
| Shows per month | the same show list, by `started_at` month | yes |
| Most played live, Most played songs | `performance_songs_visible` for that list | yes |
| Top venues | the same show list | yes |
| Song debuts | `/api/song-debuts`: every setlist of the artist's, any status | yes, and also drafts and shows still being captured |
| Dormant songs | `user_songs` (catalogue) | no. Imports never write the catalogue: the complete-status trigger fires on update, and setlist.fm import inserts directly. |

One sentence beneath the statistics covers the broader figures: "Shows played is your live record. Song performances, cities, hours, the estimate, the monthly chart, and the song, venue and debut lists also include N imported shows." When the difference isn't only imports, it names "N shows outside the live record".

No data scope, query, catalogue count or record changed.

## Dates: which paths are authoritative

`performances.performance_date` is a timestamptz:
- uploads, and starts of scheduled shows, store a **date** (UTC midnight);
- unscheduled live captures store an **instant**.

`shows.timezone` is a real IANA zone for scheduled shows; `'UTC'` is the default placeholder and is not treated as evidence.

`showDay()` resolves a show's day in this order:
1. A date-only value: that calendar day. **Authoritative.**
2. An instant whose linked show has a real zone: the day in that zone. **Authoritative.**
3. An instant with no real zone: the day in the **viewer's** zone. **Not authoritative.** A show viewed from another zone can read as the neighbouring day near midnight.

**Unscheduled captures are not fully corrected.** They store no venue timezone, so they take step 3. Fixing that needs the venue's zone recorded at capture: a schema or capture change, which is out of scope. No zone is guessed.

### Paths using `showDay()` (steps 1–3)

- Review:
  - the editing header;
  - the celebration date;
  - the pre-celebration sequence (`32b42aa`);
  - the CSV date and filename.
- Filing Queue: the row date and the deadline.
- History rows.
- Submit (claim sheet): the show date, in both places.
- Dashboard: Recent shows.
- Scheduled shows (`UpcomingShows`): shown in the show's own zone.

### Paths still using the viewer's zone, or the server's

| Path | How | Effect |
|---|---|---|
| Dashboard record: ordering, Last show "N days ago", years on stage | `record-summary` `showDate()`: date-only is exact, an instant is viewer-local | at most a day near midnight |
| Career: Shows per month, first-show label, days since last show | `new Date(started_at)` | month buckets can shift for shows near midnight on the 1st |
| Venue page: first-show year | `new Date(started_at)` | only at New Year |
| **Submit: default start time** | `defaultStartTime()` reads viewer-local hours of `started_at` | prefilled start time is in the viewer's zone, not the venue's. **Matters for filing.** Address in Prepare → Submit. |
| Proof page; publisher portal rows; admin CSV | `new Date(started_at)` | viewer-local day |
| Legacy `/app/performances/[id]` | `new Date(performance_date)` | a date-only value parsed as UTC reads as the previous day in the Americas |
| Public setlist `/s/[id]`; share images `/api/og/*` | `new Date(started_at)` formatted on the **server** (UTC on Vercel) | an evening show in the Americas shows the next day |

These were documented, not changed. None needs a schema change except the capture-time zone.

## Overlap with older app versions (preserved evidence)

Old browser tabs can keep running a previous build after deployment.

- The catalogue release (`1aee35b`) proved what holds when an old tab's review loop runs beside the database trigger. The evidence is in `docs/proposals/catalog-on-complete/OVERLAP.md` on `origin/fix/catalog-on-complete`, from browser runs B1–B5 and database runs R1–R3 and O1–O3.
- **What still holds:**
  - at most one count per song per show (G1);
  - one catalogue row per artist and title (G2);
  - the trigger never fails because of another writer (G3).
- **What doesn't:** a read-then-write writer can still overwrite a committed count. That writer can be an old tab's review loop, live capture, identify, uploads, or delete/undo. This is tracked in `docs/data-integrity-open-issues.md`.
- **Why nothing was rerun:**
  - this branch changes no write path: no catalogue, status or save-sequence code;
  - the only write-adjacent change is that the photo update now checks its result (`71b1a89`);
  - an old tab from `1aee35b` and this branch therefore write identically.
- The save-path suites still pass on this branch (below).

## Verification (disposable local stack only, never Preview)

- `npx tsc --noEmit` (app tsconfig) and `next build`: pass at `32b42aa`.
- Unit tests:

  | Suite | Result |
  |---|---|
  | record-summary | 31/0 |
  | show-date | 13/0 in Toronto, Los Angeles and Tokyo |
  | filing-status | 39/0 |
  | deadline-label | 21/0 |
  | date-format | 16/0 |
  | ceremony | 16/0 |
  | layout invariants | 147/0 |

- Save and permission suites, run on the code of `d889b75` and unaffected since:

  | Suite | Result |
  |---|---|
  | save-stages | 94/0 |
  | fix-verify | 54/0 |
  | policy-verify | 31/0, in production's policy shape |
  | grant-verify | 14/0 |
  | prod-verify, section A (owner, Manager, Tour Manager, Viewer saves; failures; retry; contention) | 23/0 |

  prod-verify section B is the release-overlap replay. It needs pre-release builds and was not rerun; see above.
- Browser checks:
  - 202/0 on the final Dashboard, History and Submissions code;
  - 100/0 after today's changes. That run covered Career and Review at every width, and History, Submissions, permissions, loading geometry, failures and workspace switching.
  - Coverage:
    - widths 320, 375, 390, 1024, 1280 and 1440, in Dark and Light;
    - larger text, approximated with CSS zoom 1.3;
    - no horizontal overflow; last rows above the bottom navigation;
    - keyboard use;
    - filters open, closed and active, date ranges, Clear and no results;
    - Viewer and Manager restrictions;
    - loading-to-ready positions;
    - failed loads with retry, and the Review save lock;
    - rapid workspace switching with delayed responses.
- Review sequence date: a show stored at `2026-10-11 01:00Z` (9 pm Toronto, `performance_date` 2026-10-10) shows Oct 10 in the header, the sequence and the celebration, in both Toronto and Tokyo.
- All of this is browser simulation. Real-device checking is the owner's.

## Remaining limitations

1. **Submissions:** on a phone, the ready group sits after every needs-action show (1.6 screens down with 11 such shows). Not reordered, and no panel added.
2. **Dashboard desktop:** the record column is shorter than the filing-and-activity column, leaving space under Last show.
3. **Career:** Song debuts also count drafts and shows still being captured. That's existing scope, unchanged.
4. **Career, 320px:** when the map image fails to load, its placeholder overlaps the caption. Pre-existing; the layout is unchanged.
5. **Viewers:** a Viewer's queue shows a shared line only for a missing PRO. The artist's legal name and IPI number are never sent to delegates.
6. **Dates:** see above. Unscheduled captures and the listed paths still use the viewer's or server's zone, and Submit's default start time is viewer-local.
7. **Still open, untouched:**
   - historical backfill;
   - the live-capture and upload catalogue repair;
   - Notion webhook dedup;
   - catalogue count integrity (`docs/data-integrity-open-issues.md`).
