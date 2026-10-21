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

**How each setlist was recorded.** Recognised songs have a kept song source of `fingerprint`, `humming`, `recognized` or `combined`.
- **No songs on file:** no kept songs.
- **Entered by hand:** no recognised songs.
- **From a recording:** positive upload evidence. That is the canonical `show_created` event with `flow_source = 'upload'`, a recognition event with a `chunk_index`, or a stored `recording_path`.
- **Recognised live:** positive live evidence. That is `show_created` with `flow_source = 'live'`, or a capture-start location reading (only live capture writes `latitude`).
- **Method not recorded:** both kinds of evidence, or neither. A recognition event without a `chunk_index` is ambiguous, because uploads before `chunk_index` existed look the same. It never implies live.

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

## 8. Proposal: record photo persistence (not authorised, no SQL)

- **Table** `public.proof_record_photos`:
  - `artist_id` (primary key, references `profiles`);
  - `mode` (`profile` | `record` | `none`);
  - `object_path`;
  - `focal_x` and `focal_y` (0–1);
  - `width` and `height`;
  - `updated_by` and `updated_at`.
- **RLS:** select through `can_act_for(artist_id)`; writes only through the server route.
- **Storage:** a **private** `proof-photos` bucket, at `<artist_id>/<uuid>.jpg`. No public URLs. Reads are server-authorised: the page gets a short-lived signed URL (5 minutes) after the access check, and the PDF route reads the object directly.
- **Writes:** `POST`/`PATCH`/`DELETE /api/proof/photo` checks owner or `isWriteCapableRole`. The server then:
  - accepts JPEG, PNG, HEIC or WebP up to 12 MB;
  - converts and resizes to 2000 px on the long edge;
  - strips EXIF data, including GPS;
  - writes the object;
  - updates the row.

  Uploading a new photo or choosing No photo deletes the previous object.
- **Focal point:** chosen with a drag-to-position preview at 4:5. The same `object-position` is used on the page and in the PDF crop.
- **Cleanup:**
  - removal deletes the object;
  - account deletion sweeps `proof-photos/<artist_id>` (added to `/api/account/delete`);
  - a revoked team member has no access.
- **Dependency:** image processing needs `sharp`, which Next already uses on Vercel.

## 9. Proposal: PDF library (approval needed before adding)

**Recommendation: `@react-pdf/renderer` (v4, MIT).**

- **Deployment:**
  - It runs in a Node route handler on Vercel.
  - It needs `experimental.serverComponentsExternalPackages: ['@react-pdf/renderer']` in `next.config`, a config change that needs approval.
  - It works with React 18.
- **Layout:** flexbox, text wrapping, a fixed header and footer on each page, `wrap`/`break` control, and page numbers. These cover long names, the register across pages, and small records with their shows on the cover.
- **Fonts:** it embeds TrueType fonts. Bebas Neue, DM Sans and DM Mono are under the SIL Open Font License, which permits embedding. Their font files would ship with the route.
- **Cost:** about 10–15 MB in `node_modules` (pdfkit, fontkit and yoga), used on the server only, so nothing reaches the client bundle.
- **Alternatives:**
  - `pdf-lib` (MIT) is smaller, but has no layout engine: wrapping and pagination would be hand-written, which is a larger risk.
  - Headless Chromium is too heavy for serverless.
- **Delivery:**
  - The same summary loader, plus the Static Images map and the artist image fetched on the server.
  - `GET /api/proof/pdf?artist_id=` checks access again and returns the PDF as an attachment, with `Cache-Control: private, no-store`.
  - The client fetches it and hands it off as the claim sheet does: a download in browsers, the share sheet in the installed app, and a visible error otherwise.
  - There's no public file and no credential in any URL.
