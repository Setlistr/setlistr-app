# Proof of Performance: implementation plan

Approved direction: revision 3 (claude.ai/artifact/QqD9g6WCmBVTqsCMw2TUNw, version 3).

This plan authorizes a **Preview candidate only**. There is no production merge, deployment, SQL, environment change or real-data write. The branch is `feature/proof-of-performance`, cut from production `3e955c2`. The claim-sheet candidate `fix/claim-sheet-content` stays separate.

## 1. Affected components

| Area | Change |
|---|---|
| `lib/proof/summary.ts` (new) | Pure rules: record states, setlist method, confirmation, counts, period, places, country normalisation, name sizing. No I/O. Unit tested. |
| `lib/proof/map.ts` (new) | Pure Web Mercator framing: the Static Images centre, zoom and dot positions for each view. It also decides when a city lookup counts as unambiguous. |
| `lib/proof/load.ts` (new) | Server loader: authorises the caller, reads with the service role, builds the summary. The page now and the PDF later both use it, so their figures can't drift. |
| `app/api/proof/summary/route.ts` (new) | `GET ?artist_id=` returns the summary as JSON, for the page. |
| `app/app/proof/page.tsx` | Replaced with the approved layout: phone and desktop, the photo and no-photo states, the map or places set in type, the evidence disclosures, the register, and Awaiting confirmation and Imported history. Loading and error states included. |
| `app/app/stats/page.tsx` | One string: the Career entry's “Your verified career record” becomes “Your live performance record”. |
| Unchanged | `lib/performance-status.ts` (counting rules), the Dashboard and Career counts, capture and recognition, schema, and environment. |

There are no new dependencies in this candidate. Export stays unavailable; the old print button is removed rather than left looking as if it works.

## 2. Rules the summary implements

**Counts** (existing rules, unchanged):
- **Live record** = `isCapturedShow`, as on the Dashboard.
- **Confirmed** = `isCapturedShow` ∧ `isCompleteStage`.
- **Awaiting confirmation** = live record minus confirmed.
- **Imported** = `data_source = 'setlistfm_imported'`, real venue only. Listed separately and never counted.

**Song performances:** rows in `performance_songs_visible` (which excludes songs removed in review) for confirmed shows. One per kept song per show. It isn't a catalogue total.

**Confirmation, checked against the repository's history:**
- `performances.status` is constrained to draft, live, processing, review and complete (`supabase-schema.sql`).
- `complete` is written only by Review save: before March 9 2026, and again since `909338b` (October 16). The setlist.fm import also writes `complete`, but import is excluded.
- `completed` was written by Review from March to October and rejected by the constraint. `exported` was written by an old Submit page on PRO submission, not on review.
- So `complete` means **Confirmed in review** (by the artist or their team; who and when aren't recorded).
- Any `completed` or `exported` row still counts under the unchanged rule, but reads **Marked complete; review not recorded**.

**How each setlist was recorded.** This is derived from positive evidence only; no stored data is changed.

*Recognised songs* are kept songs whose source means audio recognition:
- `fingerprint`, `humming`, `recognized`, `combined`;
- `detected` (live capture's source in March 2026) and `music` (early recognition).

*Kept songs* are the visible rows (`performance_songs_visible`, which already leaves out songs removed in review), excluding source `planned`.
- Live capture saves planned songs that were never detected as `planned`. Review leaves them that way unless the artist marks them played (stored as `manual` with `was_planned`) or removes them.
- An unresolved `planned` row is on the plan only, not a song performed. It counts towards no total, no recognition denominator and no provenance.
- A confirmed show whose only songs are unresolved planned ones is still a confirmed show. It shows 0 songs and "No songs on file", never "entered by hand".

*Manual songs* have source `manual`, the only source that positively records entry by the artist or team. It includes planned songs the artist marked played. Every other value is no evidence either way: null, `unidentified`, `transcript`, `cloned` (in the type list only; no version ever wrote it, so its meaning is unknown) and anything unknown.

The method:
- **No songs on file:** no kept songs.
- **Entered by hand:** no recognised songs, and **every** kept song is manual.
- **From a recording:** recognised songs, plus positive upload evidence. That is the canonical `show_created` event with `flow_source = 'upload'`, a recognition event with a `chunk_index`, or a stored `recording_path`.
- **Recognised live:** recognised songs, plus positive live evidence. That is `show_created` with `flow_source = 'live'`, or a capture-start location reading.
- **Method not recorded:** everything else. That covers recognised songs with both kinds of evidence or neither, and songs with no record of how they were entered.

Missing recognition logs never imply live, and missing manual evidence never implies "entered by hand".

*Correction, 2026-10-22.* Until `c52d678`, "entered by hand" meant only that no song had a current recognition source. Older shows whose songs carry `detected` or `music`, or no source, were therefore shown as "entered by hand". They now read as recognised (then live, recording or not recorded, by capture evidence) or as method not recorded. A follow-up in the same candidate excluded unresolved planned songs from every count. They had been counted as songs since the summary layer (`5b8a3bb`), and briefly in `991a034` as evidence of entry by hand. `cloned` no longer counts as manual evidence.

**Location:** “Phone near the venue when capture began” appears only when `location_verified = true`, meaning the stored reading was within 500 m. Otherwise nothing is shown.

**Cities and countries** among confirmed shows: a city is a distinct normalised city and country pair; a country is a distinct normalised country.

## 3. Map

- **Shows mapped:** confirmed shows only.
- **Place lookup:**
  - The position comes first from the show's stored venue coordinates (`venue_latitude`/`venue_longitude`), then the venue row.
  - Otherwise, an unambiguous city and country lookup. The country must normalise to an ISO code. The Mapbox place result must be the top match, a city-level place, in that country, and its name must match the city.
  - There is no venue-name lookup and no top-N city limit.
- **Lookups are bounded:**
  - At most 4 at a time.
  - At most 150 distinct places per summary. Any beyond that are counted in the caption as “not located yet”, not dropped silently.
  - Results are cached for one hour per URL. That's short because Mapbox's terms limit storing temporary geocoding results.
- **Drawing:** Setlistr's own Mapbox Static Images style (`dark-v11`), loaded by the browser with the public token, as Career does today. The server returns only each view's centre and zoom and the dot positions as percentages. Venue latitude and longitude never reach the client. The image is drawn without markers and the gold dots sit on top, so the page and the PDF share one framing.
- **Attribution:** Mapbox's logo and attribution stay in the image, and the caption repeats “© Mapbox © OpenStreetMap”.
- **Coverage is never shown as complete when it isn't.** Unmapped confirmed shows are counted by cause: no location on file; a city that can't be identified exactly; or the lookup unavailable (failed, refused, or over the bound).
- **When there's no map:**
  - Fewer than 3 mapped places: the places are set in type.
  - No token, a failed lookup or a failed image: the caption says the map is unavailable, and the record is unaffected.
- **Token risk:** Mapbox calls from the server send no browser Referer. If the token is restricted to URLs, server-side lookups may be refused on Preview. Shows with stored venue coordinates are unaffected; the rest show as “not located yet”. The token, its restrictions and the environment are not changed.

## 4. Photography

- **Image used:** the artist workspace's `profiles.avatar_url`, read with the service role for the authorised workspace. It is never the signed-in team member's own image.
- **Cropping:** 4:5, `object-fit: cover`, focused at 50% / 30%.
- **Failure:** if the image fails to load, the page switches to the photo-free layout.
- **No record-photo controls** in this candidate. That control comes only with approved persistence (§8).
- **Images in the PDF:**
  - Allowed: images in Setlistr's own `avatars` bucket under the artist's folder, which the artist uploaded.
  - Omitted: external images, for example the Spotify import's `i.scdn.co`, until their terms are checked. The PDF falls back to its photo-free cover.

## 5. Permissions

| Caller | Page | Export (when built) |
|---|---|---|
| Artist (owner) | Yes | Yes |
| Accepted manager, tour manager, band member | Yes | Yes |
| Accepted viewer | Yes | No. A product rule, not protection against screenshots. |
| Pending, revoked, unrelated, signed out | 401 or 403, with no data | No |

- **Enforcement:** on the server, on every request: the same delegation check as `/api/performance-songs`, plus `isWriteCapableRole` for export.
- **The response carries only summaries:** counts, dates, venue, city, song counts, the setlist method, recognised counts, a near-venue flag, the confirmation kind, map views and the artist's name and image.
- **Never returned:** recognition logs, scores, device or venue coordinates, legal name, IPI, publisher, email, or anything from the profile beyond name and image.

## 6. Edge cases

- **Record size:** none, small or large; 500+ shows (paginated reads, never truncated at 1,000 rows).
- **Data gaps:** no songs; all hand-entered; no recognition logs; legacy statuses; no city; no country; cities that need disambiguation, such as London ON and London UK.
- **Presentation:** long or one-word names; a missing or broken image.
- **Map:** no token, a failed lookup or a failed image.
- **Workspace switching** while loading: stale responses are dropped.
- **Loading** skeleton and **error** with Try again.
- **Themes and widths:** both themes; 320px phones; desktop at 900px and up.

## 7. Acceptance criteria

1. The figures match the counting rules above on seeded data, and the relation line equals the Dashboard's live record.
2. Every role in §5 gets the documented response. A revoked member gets 403 straight away. The payload contains none of the excluded fields.
3. Method, confirmation and location wording follow §2 for each seeded case, including “method not recorded”.
4. The map shows confirmed places only. The caption counts unmapped shows. A map failure doesn't block the page.
5. Photo, no-photo and broken-image states render. A team member sees the artist's image.
6. There's no horizontal overflow at 320, 390 and 1280px in either theme. Long names wrap without clipping.
7. There's no export control, and no print button.
8. `tsc`, `next build` and the existing suites pass. Browser simulation is reported separately from real-iPhone checks, which are still pending.

## 8. Record photo: proposal (SQL not authorised; tested only in a rolled-back transaction)

**Files.** `supabase/proposals/proof_record_photos.sql` (the migration) and `proof_record_photos.test.sql` (its test). They are kept outside `supabase/migrations` so nothing applies them by accident.

**Persistence: `public.proof_record_photos`, one row per artist.**
- **Columns:** `mode` (`profile` | `record` | `none`); `object_path`; `focal_x` and `focal_y` (0–1; defaults 0.5 and 0.3); `width` and `height`; `updated_by` and `updated_at`.
- **Constraints:**
  - a record photo always has an object, and other modes never keep one;
  - the object must be `<artist_id>/<uuid>.jpg`, so it can't point into another folder;
  - the focal point must lie within the image.
- **Deletion:** `ON DELETE CASCADE` from `profiles`.
- **RLS:** select via `can_act_for(artist_id)`. There are no client write grants; writes go only through the server route.

**Storage: private bucket `proof-photos`.**
- `public = false`, processed JPEG only, 4 MB.
- **No client policies at all:** artists, team members and anonymous users can neither read nor write objects directly.
- **No signed or public URLs:** the page shows the image through `GET /api/proof/photo?artist_id=`, which checks access as the summary does and streams the bytes with `Cache-Control: private`. The PDF route reads the object with the service role after its own check. This works with the installed app's existing cookie session.

**Upload validation (proposed `POST /api/proof/photo`).**
- **Who:** the owner or a write-capable team member (`isWriteCapableRole`), checked on every request; revoked access is refused.
- **Size:** at most 12 MB in.
- **Type by magic bytes, not file name:** JPEG, PNG, WebP or HEIC/HEIF.
- **Decoded with `sharp`,** which is already a dependency and already handles iPhone HEIC in `/api/parse-setlist`. Images must be 600–8000 px on the short and long edges.
- **Processing:**
  - rotated by the EXIF orientation, then **every metadata block dropped**, GPS included;
  - resized to 2000 px on the long edge;
  - written as a JPEG (quality 82) to `<artist_id>/<new uuid>.jpg`.

**Crop and focal point.** The client sends `focal_x` and `focal_y` from a drag-to-position preview at 4:5. The page uses `object-position: <x·100>% <y·100>%`, and the PDF crops the same rectangle on the server before embedding, so both show the same framing.

**Cleanup.**
- **Replacing or removing:** choosing a new photo, "Use profile image" or "No photo" deletes the previous object after the row update succeeds; a failed delete is logged and retried.
- **Account deletion:** sweeps `proof-photos/<artist_id>/`, alongside the existing `avatars/<userId>` sweep in `/api/account/delete`.
- **Orphans:** objects without a row are removed by a periodic check.

**Tested (local security-test stack, inside `BEGIN … ROLLBACK`): 18/0.**
- Constraints: missing object; object in a profile row; another folder; path traversal; focal point out of range; a valid row.
- The bucket is private and accepts JPEG only.
- **Reads:** artist, manager and viewer can read the row; revoked and unrelated users can't.
- **No direct access:** artist and manager can't read the object; no client can write the row or upload; anonymous users get nothing.
- Deleting the artist removes the row.
- After the rollback the table and bucket are absent.

## 9. PDF (approved 2026-10-21)

**Library: `@react-pdf/renderer` 4.9.0 (MIT), exact version, installed.**
- **Licences:** fonts are under the SIL Open Font License (`lib/proof/pdf/fonts/OFL-*.txt`). Bebas Neue, DM Sans (Regular, Medium, Bold, Italic) and DM Mono (Regular, Medium) are embedded.
- **Next config** (`next.config.mjs`, the minimum):
  - `serverComponentsExternalPackages: ['@react-pdf/renderer']`;
  - `outputFileTracingIncludes` for the fonts.
- **Verified against a real `next build` with a real `node_modules`:**
  - the PDF route's trace includes `@react-pdf` (42 files), fontkit, pdfkit, yoga and all 10 font files, about 5.5 MB;
  - no client bundle contains react-pdf, pdfkit, fontkit or yoga;
  - `next start` serves the PDFs.
- **Fonts per render:** react-pdf kept font state between documents in one server process, and a later document lost glyphs; this was reproduced, with Bebas's W missing. Every render now clears and re-registers the fonts, and renders run one at a time per process. Four simultaneous exports were checked.

**Route: `GET /api/proof/pdf?artist_id=&tz=`.**
- Built from the same `loadProofSummary` and `lib/proof/wording.ts` as the page.
- **Access:** export needs the owner or a write-capable role, checked on every request. Viewers, revoked, pending and unrelated users get 403 with no file; signed-out users get 401.
- **Response headers:** `Content-Type: application/pdf`; `Content-Disposition: attachment`; `Cache-Control: private, no-store, max-age=0`; `X-Content-Type-Options: nosniff`.
- Nothing is stored or published.

**Document.**
- **Cover:** the cover always fits one page, by a height budget:
  - name, period and photo, when one is embeddable;
  - the dominant figure and supporting facts;
  - the map with the coverage line and attribution, or the places set in type, with a line when the map failed;
  - on small records, the shows themselves;
  - the setlist sources and what isn't counted.
- **Register:** the running header, title and column headings repeat on every page; rows never split; a year heading is never left alone at a page foot; every row carries its full date.
- **Last page:** "How this record is made", the place coverage, the relation to the Dashboard, what's not included, and a statement that the document holds no legal names, identification numbers, contact details or location readings.
- **Page numbers:** "N of M" on every page.

**Images.**
- The artist's own upload in Setlistr storage is embedded when it's JPEG or PNG. Any other format, a failure, or an external (Spotify) image is omitted, and the photo-free cover is used.
- The map is the same Static Images view as the page, fetched on the server; on failure the places are set in type and the PDF says so.

**Handoff, reusing the claim sheet's pattern.**
- **Browser:** a download; the object URL is released after a minute.
- **Installed app:** the share sheet with the PDF file. Dismissing it is silent.
- **App with no file sharing, or a failed share:** an honest error ("Open setlistr.ai in Safari to download it"). There is no blob navigation and no HTTPS fallback, which would leave the app without a way back.
- Errors are explicit for 401, 403, server failures and non-PDF answers.

## 10. Deployed export failure (Preview `c52d678`) and fix

**Report.** On the `c52d678` Preview, desktop Chrome showed "The PDF couldn’t be created. Try again."

**Evidence available.**
- The deployment's runtime logs couldn't be read from here. The stored Vercel CLI login had expired, and the API answered 403. Refreshing it would change credentials, so it wasn't refreshed.
- The Preview is behind Vercel Authentication, so it can't be probed without signing in.

**Reproduced locally.**
- **The test:** a standalone production build traced from the repository root, as a Root Directory project is packaged, run under Node 20 from the packaged files only.
- **The failing stage:** rendering, as the PDF engine starts.
- **The error:** `Cannot find module …/node_modules/pdfkit/js/standard-fonts/Helvetica.cjs`.
- **Cause:** pdfkit initialises its built-in Helvetica for every document. It loads that font's data with a computed `require` (`#standard-fonts/*`), which Next's file tracing can't follow, so the data isn't shipped with the function.
- **Why earlier local checks missed it:** they ran against a full `node_modules`. They couldn't establish that the Vercel export works.

**Fix (narrow).**
- `next.config.mjs`: `outputFileTracingIncludes` for `/api/proof/pdf` adds `./node_modules/pdfkit/js/standard-fonts/**` (184 KB).
- **Rebuilt simulation:** exports succeed with no server errors, under Node 20 and the packaged files only. The JPEG and PNG decoders were also confirmed from the packaged modules.
- **Also confirmed:** Node 20 and Node 22 runs of the normal production build export correctly, so the runtime version wasn't the cause.

**Stage references.** If an export still fails, the response carries a short stage reference (`summary` | `images` | `render` | `respond`, plus the error class or code, e.g. `render-MODULE_NOT_FOUND`). The page shows it after "Try again", and the server log records it with a message from which identifiers are removed. It contains no artist data, tokens or document contents.

**Font fix, documented.**
- **Symptom:** react-pdf keeps loaded fonts between documents in one server process. A later document then lost glyphs from its embedded subset; Bebas's W disappeared after another artist's export.
- **Why not `Font.reset()`:** it doesn't reload, because it clears the data but keeps the cached load promise.
- **Fix:** every render runs `Font.clear()`, re-registers the default Helvetica family and Setlistr's fonts, and renders one document at a time per process (`renderQueue`).
- **Verified:** 30 exports for 5 different artists (alone, in sequence, reversed, 5 at once, 10 at once). For each artist, every run produced identical extracted text and pixel-identical pages, with no other artist's content.

**Recovery.** After a server failure, a dropped connection, a dismissed or failed share, or "this app can't save the PDF", the page stays usable: disclosures still work and the button is enabled again. A second attempt succeeds or shows the same honest message. A second tap while a PDF is being prepared starts nothing.

**Map lookups.** Failures are counted as "the place lookup was unavailable" from the actual response. The server log records the HTTP status only. No cause, including token URL restrictions, is assumed without that response. Credentials and restrictions were never changed.

**Installed app.** Unverified until an approved release; the installed app loads production. The share sheet and the "can't save" path are simulated in Chromium and WebKit only.

## 11. Candidate verification (2026-10-21)

**Environment:**
- **Database:** the disposable stack only (`127.0.0.1:54621`), with production's access rules applied locally from 0001, 0004, 0005 and 0006, and seeded sample artists and roles.
- **Server:** a real production build (`next build` + `next start`).
- **Data:** no production or Preview data was read or written by tests.
- **Record-photo SQL:** tested on the local security-test stack inside a rolled-back transaction only.

**Results:**

| Suite | Result | Covers |
|---|---|---|
| Unit (`scripts/test-proof-summary.ts`) | 48/0 | The summary rules and map framing |
| Summary route, against SQL ground truth | 42/0 | Every role, revocation, payload privacy, figures |
| PDF files (route, real files rasterised and read back) | 32/0 | See below |
| Export from the page | 14/0 | See below |
| Page, browser simulation | 58/0 | Phone 390 and 320px and desktop in both themes; long name, broken image, zero and small records; map failure; loading, error and retry; workspace switching; revocation |
| Record-photo migration (rolled back) | 18/0 | See §8 |

PDF file checks covered:
- **Access:** owner and delegated exports; Viewer, revoked, pending and unrelated users refused; signed-out users refused.
- **Response:** private, non-cacheable headers.
- **Agreement with the page:** cover figures, coverage, sources and the Dashboard relation.
- **Pagination:** the cover fits one page; the running header and column headings repeat; every confirmed show appears exactly once.
- **Content:** "phone near venue" only on qualifying shows; "N of M" page numbers; no sensitive fields.
- **Record sizes:** small, zero, a long accented name, and 320 shows (14 pages, under 1 s; all 3,830 kept songs counted).
- **Concurrency:** four simultaneous exports.

Export checks covered:
- browser download, by the owner and a manager;
- no control for a Viewer;
- simulated installed app: share sheet, dismissal, failure, and no file sharing (honest error); WebKit;
- access revoked after the page loaded;
- a server error, and a non-PDF answer.

**Covers rendered locally from the real document code:** with and without photo; map drawn or failed; long accented name; the small record. Every cover fits one page.

**Unit suites:** record-summary 31, filing-status 39, mobile-layout-invariants 147, date-format 16, show-date 13, appearance 75, submissions-nav-counts 22 and claim-sheet-handoff 12 all pass. `tsc` passes.

**Map behaviour:**
- **Coverage wording names its cause:** for example, "83 of 86 shows mapped · 2 with no location on file · 1 in a city that couldn’t be identified exactly". A refused or failed lookup reads "N not located: the place lookup was unavailable", and a map that can't be drawn is stated.
- **Why one place wasn't mapped:** Kitchener exists in both Ontario and British Columbia with equal relevance, so it stays unmapped.
- **Token and environment:** `NEXT_PUBLIC_MAPBOX_TOKEN` is fixed at build time, as Vercel builds do. Whether server-side lookups and the PDF's static map are accepted under the token's URL restrictions on Preview still needs checking there. If they aren't, the coverage line and the PDF say so; no credentials or restrictions were changed.

**Not verified here:**
- **Real iPhone checks:** Safari against the Preview, then the installed app after an approved release.
- **The existing login page** logs a React hydration warning. It is unrelated to Proof and unchanged.
