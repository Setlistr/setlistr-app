# Automated performance-record workflow: feasibility, with public discovery

*Proposal, 2026-10-29; production `21d2b63`.* It replaces the stopped concierge plan, since routine staff processing isn't the business model. It authorises nothing:
- no implementation, SQL, production changes or external connections;
- no accounts, provider contact or paid usage.

Source terms were read from the providers' public documentation on 2026-10-29.

**Evidence labels:**
- **[repo]:** read in the code at `21d2b63`.
- **[docs]:** the provider's own published documentation.
- **[unmeasured]:** an estimate to be replaced by the benchmark.
- **[unverified]:** not checked.

**Standing rules:**
- A listing or booking is not proof a show happened.
- An expected, planned or repeated setlist is not a performed setlist.
- AI never decides either; an authorised person confirms.
- Confirmation is not independent verification.
- Prepared is not filed, received or paid.
- No automatic PRO filing.
- No unrestricted web discovery.
- No royalty figures in any draft or confirmation screen.

## 1. Recommendation in brief

**The one automation slice: "the setlist the band already used → draft → one confirmation".**
1. After a show, an authorised team member photographs the stage setlist (printed or handwritten, with any marks), **from that show's booking** in Setlistr.
2. Setlistr stores the photo privately, extracts the songs and marks, matches them to the artist's repertoire, and builds a **draft that lives outside the performance tables**.
3. The confirmer answers one question, *did this show happen?*, then resolves only the flagged items and confirms.
4. Only then does Setlistr create the performance, linked to the booking. It feeds the existing record, catalogue, Proof and claim sheet exactly as Review completion does today.
5. **Live capture stays a supported source.** When a capture exists, the photo becomes supporting evidence for it, not a second show.

**Why this input:**
- **Least effort:** one photo at load-out, of something that already exists.
- **Most reliable evidence available without operating a tool:** a written setlist, often marked during the show.
- **No guessing about which booking:** the photo is attached to the booking it was taken from.

**Assumption to validate:** most target teams produce a stage setlist for most shows. That's unknown; the experiment asks it first.

**Public discovery: a bounded, mostly licensed problem.**
- **Find shows:** use the team's own itinerary (shipped import), plus the artist's own authorised Bandsintown key for past events, as *booking candidates*.
- **Identify compositions:** MusicBrainz.
- **Third-party setlists:** only after a commercial licence (setlist.fm, or JamBase as a licensed alternative).
- **Public video metadata:** weak corroboration only, with no media processing.
- **Social platforms:** only through an artist-authorised professional account after Meta App Review. Later, not now.
- **Don't build web crawling.**

## 2. Components that already exist [repo]

| Component | What it does today | Reuse | Gap |
|---|---|---|---|
| **Itinerary import** (`api/shows/import*`, 0028) | CSV/XLSX → bookings (`scheduled`, timed or date-only) and past listings (`listed`); review, atomic import, Undo | **As is**, to supply bookings | — |
| **Setlist photo/PDF/text extraction** (`api/parse-setlist`) | Claude vision (`claude-sonnet-4-5`), HEIC conversion, ≤ 10 MB; ordered titles. Catalogue fuzzy match (word overlap, threshold 0.65) **silently replaces the title with the catalogue's**. Stores the photo in `performance-photos` with a **public URL**. | **Extraction core**, moved into a shared function | **No confidence, no marks** (crossed out, added). Silent catalogue substitution must become a *suggestion*. **The photo must go to private storage.** Only used inside New show today. |
| **Recording recognition** (`upload-recognize`, `upload-reconcile`, `lib/reconciliation/*`) | Chunked recognition, plus reconciliation into a setlist | Later, as a second source | Not part of the first slice |
| **Live capture** (`/app/live`, Tonight one-tap) | Recognition every ~20 s; linked to the booking when started from it | **Kept**; becomes the primary record when present | — |
| **Repertoire** (`user_songs`, `lib/song-utils`) | The artist's confirmed songs, normalised titles | Match target | Needs match scores kept and shown |
| **Composition data** (`api/enrich-song`, MusicBrainz) | Best-effort ISRC, composer and publisher | For claim prep, after confirmation | Recording-level, not work-level (ISWC and splits incomplete) |
| **Review / Save & Complete** | Confirm, edit and complete; catalogue trigger (0027) | Pattern and UI reused for the confirm screen | Works only on a `performances` row, which counts immediately |
| **Start operation** (`start_scheduled_show`) | Atomic, permission-checked, one starter | **The model for a new `confirm_show_draft`** | — |
| **Outputs** (Dashboard record, Career, Proof PDF, Prepare → Submit claim sheet) | Read confirmed performances | **As is** | — |
| **Duplicate candidates** (`lib/shows/timeline`) | Pairs records by venue and time | Backstop check | — |

**Existing compliance risks** (found in this review, not changed):
- **setlist.fm:**
  - the onboarding import calls its API from a commercial app;
  - the imported setlists are stored permanently as performances (`data_source 'setlistfm_imported'`);
  - setlist.fm's terms allow the API "solely for non-commercial purposes" without permission, and copies only "for short periods" [docs].
- **Bandsintown:** keys are tied to a single artist, for that artist or people working on their behalf [docs]. The app uses one `app_id` to look up any artist.
- **Evidence photos:** they get **public URLs**.

**These need an owner decision regardless of this proposal.**

## 3. Source feasibility for public discovery

Reading metadata and processing media are kept separate. No logins, paywalls, CAPTCHAs or access restrictions are bypassed.

| Source | Fields | Likely coverage | Access route | Commercial and processing terms | Limits and cost | Evidence it supports |
|---|---|---|---|---|---|---|
| **The team's itinerary** (spreadsheet, shipped import) | Date, venue, city, time or date-only, notes | High for teams that keep one; the team's own data | Existing import | Customer-supplied | None | **Booking**, not occurrence |
| **Bandsintown API** | Date and time, venue and location, lineup, title, event URL; upcoming, past, all or a date range [docs] | Good for active touring artists who keep Bandsintown current | `app_id`. **API access is for artists and people working on their behalf; each key is linked to a single artist** [docs] | Display-oriented; other uses need Bandsintown's approval [docs]. Terms text not reviewed [unverified]. | Rate limits not published [unverified]; free | **Listing** (announced; not occurred) |
| **Ticketmaster Discovery API** | Dates (with status: on sale, cancelled, postponed, rescheduled), venue with zone and coordinates, attractions [docs] | Ticketed shows on Ticketmaster; past-event retention not stated [unverified] | API key | General terms and branding guide govern use [docs], not reviewed [unverified] | 5,000 calls/day, 5/second [docs]; free | **Listing**, including cancellations; useful for *not* happened |
| **setlist.fm API** | Setlists by artist (MusicBrainz id) or search; sets, songs, venue, tour [docs] | Strong for popular and touring artists; thin for emerging ones [unverified] | API key, `x-api-key` [docs] | **Non-commercial only without permission; attribution and links required; only short-term caching; no bots or scraping of the website** [docs] | Free for non-commercial; commercial by agreement | **Fan-reported** performed setlist: a third-party report, still needing confirmation |
| **JamBase** (licensed data) | Past events, "song-level setlist information for past shows" (vendor claim) | 25+ years claimed (vendor) [unverified] | Commercial licence or API | B2B licence (terms not public) | Paid; free trial mentioned [unverified] | Licensed listing and setlist report |
| **MusicBrainz** | Artists, recordings, works (sometimes ISWC), relationships; events sparse | Good for released recordings | Public API | Core data CC0 (licence page not re-read) [unverified] | 1 request/second per IP, identifying User-Agent [docs]; free | **Composition and recording identity**, not occurrence |
| **YouTube Data API** (metadata only) | Title, description, publish date, channel | Fan and official clips; uneven | API key | **No downloading, storing or separating audio or video; stored data deleted or refreshed within 30 days; no derived datasets or metrics** [docs] | 10,000 units/day default, with search separately capped (100/day) [docs]; free | **Weak corroboration**: a clip titled with the date and venue suggests occurrence and maybe songs. Never processed as audio. |
| **Instagram API** (artist-authorised) | The authorising account's own media: captions, timestamps | Artist-posted show content | **Professional account, OAuth; Advanced Access for accounts you don't manage needs App Review and Business Verification** [docs] | Data limited to what the user granted; public hashtag access is a separate reviewed feature [docs] | Platform rate limits [docs] | Artist's own post: **artist-stated** occurrence, possibly songs |
| **TikTok and others** | — | — | Research or partner programmes [unverified] | — | — | Not in scope |
| **Official artist, venue and festival websites** | Event pages; some carry schema.org `Event` data | Per-site, inconsistent | Only where robots.txt and the site's terms permit; no logins or bypassing | Per site [unverified] | Per site | **Listing** or lineup; rarely setlists. **Not recommended as a platform.** |

**Strongest feasible combination:**

| Purpose | Sources |
|---|---|
| Bookings and past-show candidates | Team itinerary + the artist's own Bandsintown key |
| Cancellations | Ticketmaster |
| Composition identity | MusicBrainz |
| Performed setlist | **The team's own artifact** (photo, live capture, recording) |
| Third-party setlist reports | Only with a commercial licence (setlist.fm permission, or JamBase) |
| Occasional corroboration | YouTube **metadata** |

**Instagram:** later, only if artists want it and App Review is approved.

## 4. End-to-end example (the recommended slice)

Lena's manager imported the fall tour (shipped). Wed Oct 28 is a booking at Mohawk, Austin, 8:00 PM CDT. Nobody ran live capture.

| When | Customer action | What Setlistr does automatically |
|---|---|---|
| Load-out, ~11:40 PM | The tour manager opens the app and sees the Dashboard row *"Mohawk tonight: add the setlist photo"*, shown for a booking that started within the last 18 hours and has no capture. Taps it, photographs the taped-down setlist, taps **Use photo**. **~20 seconds.** | Stores the photo **privately**, attached to the booking. Runs extraction: titles, order, crossed-out lines, handwritten additions, illegible spots. Matches each title to Lena's repertoire. Saves a **draft**. If a step fails it retries automatically, up to twice. |
| Next morning | Lena (the confirmer) sees *"Mohawk: confirm last night's setlist"*. She answers **"Did this show happen?"** (yes / no / postponed), then looks at three flagged items: "Old Favourite (crossed out on the setlist): played?"; "**Neon** (handwritten): match to *Neon Lights* in your songs?"; "line 11 unreadable". Fixes them and taps **Confirm**. **~1–2 minutes** [unmeasured]. | Creates one performance **linked to the booking** (the booking becomes completed), with the confirmed songs, method "From setlist photo, confirmed by Lena", and confirmed-by and date recorded. Only now do the record count, catalogue, Notion sync, Proof and claim sheet see it. |
| Within the week | Lena opens Submissions and downloads the claim sheet for her PRO. She files in the PRO portal herself if she chooses. | Nothing is filed automatically. "Mark as submitted" stays her own statement. |

**If she says it didn't happen:** the booking is cancelled, the draft is discarded, and nothing is counted. **If nobody confirms:** the draft stays a draft, never auto-confirmed, with an in-app reminder only (Setlistr sends no show email or push today).

## 5. Matching and duplicates

- **Booking association:**
  - The photo is uploaded **from a booking**, so it's associated explicitly, with no inference.
  - A photo added without a booking (later) shows candidate bookings by the show's **local** date (±1 day) for the same artist, and the confirmer picks. **Zero automatic associations.**
  - Discovery listings (Bandsintown and others) enter only as booking candidates, and the team accepts them.
- **Duplicate prevention:**
  - **one active draft per booking** (database-enforced);
  - **re-uploading the same photo is detected** (content hash) and doesn't start a second draft;
  - confirmation **refuses to create a second performance** when the booking already has a live or captured one; it offers to attach the photo as evidence to that capture instead;
  - the existing duplicate pairing on Schedule remains a backstop.
- **Composition matching:**
  - Titles are matched to the artist's repertoire with the score kept. **No silent substitution:** a match below ~0.85, or with more than one candidate, is shown as a question.
  - Titles not in the repertoire are offered as "new song?".
  - Work-level identity (writers, ISWC) is looked up from MusicBrainz after confirmation, for claim preparation, and is **never auto-assigned**; unknowns stay blank.

## 6. The draft state, with no effect until confirmed

- **Where:** a new `show_drafts` table (with its items), keyed to the booking (`shows.id`). It holds:
  - source provenance: type, private file path, content hash, uploader, time;
  - extracted items with per-item flags;
  - status: `processing`, `ready`, `failed`, `confirmed` or `discarded`;
  - attempts and error code.
- **Why it's safe:** no row in `performances` or `performance_songs` exists until confirmation. So no record count, Career, Proof, Submissions or claim sheet sees it [repo]. No catalogue trigger fires (0027), and no Notion-sync call happens (that webhook runs on performance updates).
- **Who can see it:** the same permission as the booking (read: `can_act_for`; write: `can_write_for`).
- **Where photos go:** a **private** bucket with short signed URLs.
- **Confirmation:** a new `confirm_show_draft` database function, modelled on `start_scheduled_show`. It's atomic: it re-checks permission, requires the explicit "this show happened", is safe to retry, and creates exactly one linked performance.

## 7. Uncertainty, missing evidence, failures and retries (no staff queue)

| Situation | What happens |
|---|---|
| A title is uncertain, crossed out, added by hand, or has a weak or ambiguous repertoire match | Flagged item; the confirmer decides. Clear, strong-match items are pre-filled but still part of what's confirmed. |
| Nothing readable | Draft `failed` with "Couldn't read this photo: retake, or type the songs." Typing uses the same draft. |
| The extraction service errors or times out | Automatic retry ×2, with backoff, idempotent by draft. Then `failed`, with a **Try again** button. |
| No photo | Nothing happens. The booking stays "No capture linked"; nothing is inferred. |
| The photo's setlist differs from the planned setlist | Irrelevant: the planned setlist is never used as performed. |
| Not confirmed | Stays a draft indefinitely; in-app reminder only. |
| Support | **No human review queue.** Error codes and rates are logged; the owner checks failure rates periodically. Customers resolve their own drafts. |

## 8. Cost, latency and support [unmeasured]

- **Extraction:** one Claude vision call per photo: about 1.5–2k input tokens (image and prompt) and ≤ 1k output. At list pricing that's **about $0.01–0.03 per photo** [unmeasured; pricing unverified], and ≤ $0.10 per show with retries and a second photo.
- **Storage:** negligible.
- **Latency:** **10–30 seconds** per photo [unmeasured]. The draft is ready before the confirmer looks.
- **Discovery sources:** Bandsintown (artist's own key), Ticketmaster and MusicBrainz are free within limits [docs]. setlist.fm commercial use and JamBase are **paid or by agreement**, with unknown cost.
- **Live capture (unchanged):** about one recognition request every 20 seconds, so ~270 for a 90-minute set; plan pricing unverified.
- **Ongoing support:**
  - prompt and model maintenance;
  - failure monitoring;
  - storage hygiene (photo retention policy).

  No per-show human work.

## 9. Benchmark (local fixtures; nothing in production)

**A. Photo → draft** (the slice):
- **Fixtures:**
  - 30 **synthetic** setlist images rendered locally from a known reference catalogue: typed, marker, handwriting-style, crossed-out lines, additions, encore, glare, angle, low light, partial crop;
  - plus up to 10 **owner-authorised** real photos with their true setlists;
  - all on the disposable stack.
- **Measures:**

  | Measure | Definition |
  |---|---|
  | Title recall and precision | Against the reference |
  | Order accuracy | Rank correlation with the reference order |
  | Mark detection | Crossed out / added |
  | Repertoire match accuracy | Correct / wrong / none |
  | **Flag calibration** | Share of wrong items that were flagged; share of correct items that were flagged unnecessarily |
  | Correction effort | Edits needed to reach the reference (a proxy now; timed later) |
  | Cost and latency | Tokens and seconds per photo |

- **Cost:** running it makes paid Claude calls, about $1–2 for 40 photos [unmeasured]. **Needs your approval.**

**B. 10-show discovery benchmark:**
- **The shows:** 10 past shows with known reference answers (date, venue, city, setlist). The owner's own, or an artist who consents.
- **Run each source only once it's approved and permitted:**
  - MusicBrainz (free, public);
  - Ticketmaster and YouTube metadata (keys and terms);
  - Bandsintown (the artist's own key);
  - setlist.fm (non-commercial research use, or permission; **ask before running**).
- **Measures:**

  | Measure | Definition |
  |---|---|
  | Shows found | Out of 10 |
  | Event associations | Correct, and **false matches**: a source linked to the wrong show |
  | Setlist coverage | Songs found ÷ songs performed, per source |
  | Provenance | Source, URL, retrieval time and licence recorded for every field |
  | Correction effort | Edits a confirmer would need |
  | Cost | Per source and per show |

- **Rule:** discovered items stay in local benchmark files only, never in production records.

**Go criteria for building the slice** (proposed; agree before running):
- typed photos: title recall ≥ 95%, precision ≥ 98%;
- handwritten or marked photos: recall ≥ 80%;
- ≥ 90% of wrong items flagged;
- zero automatic booking associations (by design);
- ≤ $0.10 per show.

## 10. The smallest experiment that tests both quality and demand

1. **Quality (local):** run benchmark A and the approved parts of B, then go or no-go on the thresholds above.
2. **Demand** (only after go, and after the slice is built and approved):
   - two artist teams, three shows each;
   - each team adds the stage-setlist photo from the booking and confirms;
   - **no staff processing**; the owner only observes.

   | Measure | Detail |
   |---|---|
   | Photo added | Share of shows, and how soon after the show |
   | Confirmation | Rate and time (≤ 2 minutes target) |
   | Corrections | Per show |
   | Output used within a week | Proof or claim sheet opened, downloaded or shared |
   | Price question | "Would you keep doing this at {price}?" |

   - **Ask first:** does the team produce a stage setlist? If neither does for most shows, **stop**: the input assumption failed.
   - **Stop** also if confirmation exceeds 3 minutes, corrections are routine, or nobody would pay.

## 11. Dependencies, all needing approval before any build

1. **SQL:** the `show_drafts` table and the `confirm_show_draft` function (migration 0029), with RLS and private storage.
2. **Extraction change:** keep match scores, add confidence and marks, stop silent title substitution, use private storage.
3. **UI:**
   - a Dashboard and booking "add the setlist photo" row (for a booking that started within 18 hours and has no capture);
   - the confirm screen (no royalty figures).
4. **Paid API use** for benchmark A.
5. **Decisions on the existing setlist.fm and Bandsintown usage**, and on public evidence-photo URLs.
6. **Artist consent** for photos, and for any third-party data source.
7. **No outreach** until you decide; no provider contact, accounts or paid sources without approval.
