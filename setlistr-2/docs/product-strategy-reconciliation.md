# Product evolution strategy: reconciliation with what's shipped

*Prepared 2026-10-28.* The strategy document ("Setlistr Product Evolution Strategy", 2026-10-28) is **proposed strategy, not authorisation**. This document reconciles it with the repository at production `main` `039871eef497280ca880e04b48b0182ac21d5963` (confirmed locally and on `origin`), the canonical [overhaul-roadmap](overhaul-roadmap.md) and the release handoffs. It authorises nothing: no implementation, SQL, production reads or writes, settings changes, outreach, scraping or account connections.

**Evidence labels used below:**
- **[repo]:** read in the code at `039871e`.
- **[prod-reported]:** recorded in release handoffs or confirmed by the owner earlier.
- **[unverified]:** assumed or unknown. No production data was read for this document.

**Direction (owner):** Setlistr is live-performance data infrastructure with a premium, intuitive experience. Artists get rewarding personal value, managers get useful decisions, crew get effortless capture. Keep the existing identity, architecture and reliable functionality.

## 1. Reconciliation matrix

| Strategy item | Existing implementation | Actual gap | Call | Dependency / risk |
|---|---|---|---|---|
| **P0 Protect capture, review, reconciliation, exports** | Live capture with ACRCloud, wake lock and auto-end [repo]; upload reconciliation engine (`lib/reconciliation/*`) [repo]; Review rev 2 and celebration [prod-reported]; Prepare → Submit and claim sheet [prod-reported]; Proof record and PDF [prod-reported] | Locked-phone and background capture in the installed iOS app is **[unverified]**. Catalogue counts can be lost on review save (open). Notion-sync duplicates (open). | **Reuse; keep the open tracks visible** | Capture changes stay fragile (`api/identify` is never touched without instruction). The locked-phone production test is not authorised. |
| **Onboarding funnel instrumentation** (invited → … → repeat) | `product_events`: `show_created`, `capture_started`/`ended`, `review_opened`/`action`/`completed`, `export_generated` [repo]. Invite timestamps on `artist_delegates`; `performances.started_by` marks a Schedule start; `captured_by` marks a delegate capture [repo]. | No event for invitation, onboarding steps, app return visits or which entry started a capture. Nothing records who reviewed or submitted (P2; migration not authorised). | **Modify** (a small, named set; see section 6) | Without attribution (P2) some "who" questions stay unanswerable. Telemetry must never block a user action (existing rule). |
| **Diagnose non-adoption through interviews** | Matt Woodson's feedback (2026-10-26) [prod-reported]; pilot is proposal-only | No interviews held; no usage evidence read | **New, owner-led** | Outreach needs the owner's instruction. Read-only usage queries need separate approval. |
| **First-run onboarding, empty states, walkthrough** | Three-step onboarding (names/PRO → setlist.fm history → Spotify catalogue) ending on New show [repo]; Dashboard empty state "Your record starts with your first show…" [repo] | Onboarding ends on "Where tonight?" even on a night off (minor). No walkthrough. | **Defer** (onboarding-destination change explicitly not bundled now) | Low risk, low pilot value. |
| **Artist Home** (count, cities, venues, song frequency, repertoire, last show, upcoming, outstanding reviews) | **Dashboard:** live-record count, cities, years, next milestone, live/review/tonight rows, Coming up, filing and royalty estimates [repo]. **Career:** map, last show, most-played songs, shows per month, song debuts, top venues [repo]. **Proof** record [prod-reported]. | The screens largely exist across Dashboard and Career. **Whether they motivate artists to keep capturing is unvalidated** (an open question, section 3). Possible gaps: completeness labelling where history is imported, and reaching the artist after a show (no notification channel; P4). | **Reuse. No competing destination.** Any change lands on Dashboard or Career. | A parallel "Home" would duplicate statistics and split attention. |
| **Manager Tour Pulse** (roster shows, coverage, reporting status, upcoming, exceptions, next actions) | Manager Overview: Roster, Recorded, Awaiting review, Not submitted (by range), recent activity [repo]; roster list; per-artist pages; Schedule across artists (`UpcomingShows` per artist); Analytics [repo]. Schedule timeline per artist: "No capture linked", possible duplicates [repo]. | **No roster-level "No linked capture" view.** Linkage is visible only per artist, in Schedule's Earlier list. Captures made through New show aren't linked, so a missing link is **not** a missed capture (see section 2). | **Modify existing Overview** with one decision (section 3), after the Now slice | Links become dependable only for bookings started through a linked entry. Historical unlinked captures remain, so no coverage percentage is claimed. |
| **Reuse spreadsheet/tour ingestion for history** | Spreadsheet import (shipped `577dd3d`): future rows become **bookings** (`status 'scheduled'`, timed or date-only); past rows become **listings** (`status 'listed'`, never startable, never counted as performed); captures are **performances** [repo]. setlist.fm history is a performance with `data_source 'setlistfm_imported'` labelled "Imported" [repo]. | The first real import with an owner file is still to come [prod-reported]. | **Reuse unchanged.** Bookings, listings and captured/reviewed performances stay distinct. | Never present listings or setlist.fm imports as performed or confirmed. |
| **Read-only architecture audit** | Audits exist: RLS coverage, API auth, invite route, delegation [repo docs] | No single current inventory of the show lifecycle and imports | **Defer** (bounded, on request) | Not a full security audit now. |
| **Map logical entities before migrations** (canonical event, evidence source/item, song observation, verification decision, external connection, fan contribution, derived insight) | Show identity is `shows` (scheduled/live/completed/cancelled/listed) ↔ `performances` (`show_id`), with duplicate candidates in `lib/shows/timeline` [repo]. Evidence of method: Proof's `setlistMethod` (recognised / manual / upload / live) [repo]. Song observations: `detection_events`, `recognition_*` [repo]. | No evidence staging, external connection or fan contribution tables, and none needed for Now or Next. | **Keep the current model. No canonical-event schema.** Map entities to existing tables only when an approved experiment needs it. | A new schema would duplicate show identity and reconciliation, with real migration risk. |
| **Scheduled ≠ occurred; planned setlist ≠ performed** | Already true: a booking is "No capture linked" until captured [repo]; `planned_setlists` are separate from `performance_songs` [repo] | None | **Reuse** | — |
| **Artist approval vs reporting readiness vs verification** | Review "Save & Complete" is team confirmation; "Mark as submitted" is the user's own statement that the setlist was filed [repo]; Proof labels method and data limits [repo] | **No independent verification exists**, and none is claimed | **Keep separate.** Never call "submitted" verified; never treat external evidence as confirmed. | Wording drift is the main risk. |
| **Discovery benchmark** (10 historical shows) | setlist.fm import, Bandsintown/Ticketmaster upcoming lookups [repo] | Rights, terms and matching quality unknown | **Later, desk experiment only** (section 4) | Public availability ≠ processing or resale rights. |
| **Fan contribution pilot** | Setlist photo parsing (`api/parse-setlist`), public `/s/[id]` share page [repo] | No unauthenticated intake, quarantine, consent, moderation | **Later** (section 4) | Abuse, privacy, rights, moderation cost. |
| **Instagram/YouTube connections; touring software** | Share cards (Night, Milestone, Song debut, Royalty moment) [repo]; none connected | OAuth, platform app review, token storage, revocation, retention | **Later / research** (section 4) | Platform terms and review; scope creep. |
| **Audience reaction; attendance** | Not built [repo] | — | **Research only** | Loudness ≠ engagement; check-ins ≠ attendance. |
| **North star: weekly accounts receiving demonstrable value** | Not implemented [repo] | No value event defined | **Hypothesis**; define per-role value events (section 6) before measuring | Vanity-metric risk. |
| **30/60/90-day plan** | — | Capacity-dependent | **Provisional.** At most one or two experiments at a time | Parallel sprawl. |

## 2. Material conflicts and decisions

1. **One canonical record is already the design; no new schema.** Each show is one `shows` row, and captures link to it. The real problem is that **the most-used capture entry doesn't link**: the gold button and the Bandsintown Tonight row create a new show [repo]. **Decision:** fix the entry point (Now), not the data model.
2. **"Artist Home" and "Tour Pulse" names.** Use them as goals, not new destinations. Artist value lives in Dashboard and Career; manager decisions start in the Manager Overview.
3. **Linking first, and no coverage claims.** A missing link isn't a missed capture: New show captures and all historical captures are unlinked. So the order is **Now** (link captures started from bookings), then **Next** (a "No linked capture" follow-up that prompts a check). Neither presents a coverage percentage.
4. **Confirmation ≠ verification ≠ reporting readiness.** Today the product records team confirmation (review) and a self-reported submission. Any external evidence stays quarantined in a future design and never edits reviewed records.
5. **Interviews and pilots need the owner.** The strategy's interviews and pilots are owner decisions; nothing here contacts anyone.

## 3. Recommended sequence

### Now: "Tonight's show, one tap" (scheduled-show capture entry)
Plan: [tonight-show-one-tap-plan](tonight-show-one-tap-plan.md). Prototype (real app shell, mocked shows): https://claude.ai/artifact/Ea9tFbasQMdb96xaTvSsur.

**Matt Woodson's feedback, attached:** the manager prepares once, by scheduling or import. The crew uses that preparation with minimal effort: two taps from the Dashboard, three from the gold button. Capture coverage becomes trustworthy because every capture started this way is linked to its booking. No schema, migration, API or permission change.

### Next: one value experiment, the manager's "No linked capture" follow-up
- **Who:** the manager (Matt) or tour manager, the morning after shows.
- **Decision/action:** for each past booking with **no linked capture**, check what happened and resolve it the same week:
  - link or recover the capture (upload the recording, add the photographed setlist, enter it by hand);
  - or confirm the booking didn't happen, and cancel it.
- **Shortfall today:** the Overview counts recorded, awaiting-review and not-submitted shows. Nothing lists bookings without a linked capture across the roster; that's visible only per artist, in Schedule's Earlier list.
- **What a "No linked capture" item means:** only that no capture is linked to the booking. It is **not** a confirmed missed capture.
  - Captures made through New show (or "A different show"), and all captures before the Now slice, aren't linked. They may exist as separate shows; Schedule flags some as possible duplicates.
  - Date-only bookings and many records lack time zones.
  - Listings (`listed`) are not performances.
  - So the list is a prompt to check, **never a coverage percentage or a count of missed shows.**
- **Data:**
  - **Reliable:** bookings (`shows`: scheduled, cancelled or started, with zone-local dates) [repo]; links (`show_id`, `started_by`) [repo]; the timeline's "No capture linked" and its duplicate candidates [repo].
  - **Incomplete:** the historical unlinked captures above.
- **Shape:** one short list on the existing Manager Overview, reusing the timeline route's per-artist data. **Not** another stat card, and no percentage. Any historical item with a possible-duplicate capture is shown as "possibly captured, not linked", not as missing.
- **Measurement:**
  - the share of items the manager resolves (links, recovers or confirms not played) within 7 days;
  - median time to resolution;
  - from bookings made after the Now slice: the share started through a linked entry (`scheduled_start` events and `started_by`), which is an adoption measure, not coverage;
  - whether the manager returns to the list weekly (owner-observed in the pilot).
  - **Stop** if after four tour weeks it doesn't change resolution or goes unused.

**Artist post-show motivation stays open.** Having the celebration, share cards, Career and Proof doesn't show they give artists enough reason to keep capturing.
- **To validate before any new artist UI** (with the owner's approval for any contact or data read): do artists open their record after shows, share, or export? Those signals are partly un-instrumented today (share and Proof views).
- **Possible gap:** reach (nothing contacts the artist after a show; P4). That's a hypothesis, not a finding.

### Later: externally sourced evidence and selective integrations
These are desk-scoped first (section 4); none is built.

### Kept visible alongside (unchanged tracks)
- **Capture reliability:** locked-phone and background behaviour in the installed iOS app [unverified]; the Viewer direct-URL live page.
- **Catalogue integrity:** count loss on review save.
- **Historical audit:** shows possibly left in `review` (read-only audit proposed, not run).
- **Permissions:** P2 attribution (no migration authorised); P3 capture vs submission authority.
- **Native limitations:** live capture safe areas; the confirmation dialog inside the installed app.

## 4. External opportunities (scoping only)

**Rules for all three:** no scraping, account connections, content acquisition or user contact. Public availability doesn't grant processing or resale rights; each source's terms, copyright and privacy are evaluated separately before any use.

| | Automated performance discovery | Fan contributions | Social integrations (Instagram/YouTube) |
|---|---|---|---|
| **Hypothesis / value** | Past performances can be found from permitted sources, filling history without capture (artist value; fewer missed royalties) | Fans at a show can add evidence (setlist photo, song IDs) that raises verified coverage | Performance-linked content trends make shows more rewarding for artists |
| **Reuse** | setlist.fm import; Bandsintown/Ticketmaster upcoming lookups; spreadsheet import; timeline duplicate matching; Proof's method labels | Setlist photo parsing (`api/parse-setlist`); public share page `/s/[id]`; Review | Share cards; show identity and dates for matching |
| **Missing technical** | Evidence staging separate from reviewed records; source provenance; event matching with confidence; a review queue | Unauthenticated intake; spam/abuse limits; quarantine; consent for photos/clips; moderation tooling | OAuth connections; token storage and revocation; per-platform adapters with scopes and rate limits; retention rules |
| **Missing operational** | Rights review per source; human review time | Moderation staff time; privacy notice | Platform app review; support for revocation |
| **Source/API feasibility** | **Unverified:** setlist.fm API terms (commercial use, storage); Bandsintown and Ticketmaster terms for historical data; YouTube Data API allows metadata under quota, not content download | Rights in fan-supplied photos and clips need explicit consent terms | Instagram requires professional accounts and Meta app review; YouTube needs OAuth scopes and quota |
| **Smallest experiment** | **Desk benchmark:** 10 of the owner's own past shows, matched by hand against already-integrated sources, with no new integration. Record match rate, false matches and review minutes per show. | **Design only** until the owner approves a pilot: a written intake and quarantine flow and consent text, reviewed for rights | **Desk review** of API scopes and app-review requirements, plus one owner conversation with a pilot artist about willingness to connect, only if the owner chooses |
| **Stop / continue** | Continue if ≥70% of shows match correctly with ≤1 false match and terms permit storage. Otherwise stop. | Continue only if a pilot would yield usable evidence for most shows at acceptable review time | Continue only if app review is feasible **and** a pilot artist wants it |

Audience reaction and attendance remain **separate, unvalidated research** (loudness is not engagement; fan check-ins are not total attendance).

## 5. Measurement

**Existing inventory [repo]:**
- **`product_events`:** `show_created` (with `flow_source`), `capture_started` (`show_id`, `flow_source 'live'`, actor type), `capture_ended`, `review_opened`, `review_action`, `review_completed`, `export_generated`, and the invitation-code attempt counters.
- **Data you can derive:**
  - a Schedule start: `performances.started_by` is set only by the start operation;
  - a delegate capture: `captured_by`;
  - booking linkage: `show_id`;
  - invite sent and accepted: `artist_delegates.invited_at` / `accepted_at`;
  - submission self-report: `submission_status`.
- Google Analytics page views only (no join key).

**Recommended measures (small, actionable):**

| Stage | Measure | Source |
|---|---|---|
| Setup | Artists with at least one upcoming booking; invite acceptance rate and median time | `shows`; `artist_delegates` (no new events) |
| Capture | **Linked-capture rate:** past bookings with a linked capture ÷ past bookings | `shows` + `performances.show_id` |
| Capture | Entry used to start a booked show: Dashboard row / gold button / Schedule | **One new event**, proposed inside the Now slice (owner's choice): `show_started_from_schedule` with `action_type` = entry |
| Review | Captures reviewed within 48 hours | `capture_ended` → `review_completed` |
| Return | Weekly users with any product event, by role | `product_events.actor_type` (owner vs delegate); finer roles need P2 attribution |

**Observable value events by role (hypotheses, not implemented metrics):**

| Role | Value event |
|---|---|
| **Crew/TM/FOH** | A capture started on a booked show and ended with a setlist, in a week they were scheduled |
| **Manager** | A booked show without a capture recovered or resolved within 7 days |
| **Artist** | A completed show reviewed, plus an export, share or Proof view within 7 days. Share and Proof views are not instrumented today. |

"Weekly accounts receiving demonstrable value" stays a **hypothesis** until these events are agreed and measured.

## 6. Unresolved questions that affect the next decision

1. **Confirmation:** keep the existing system dialog for both entries (consistent with Schedule; proven in production on Schedule, but **unverified** inside the installed iOS app for this flow), or replace it with an in-app sheet later?
2. **Windows:** accept 6 hours past and 12 hours ahead for "tonight"?
3. **Teammate's live capture:** after "just started by someone else", should the in-progress row still offer "Tap to continue capture" to a second phone? (That's today's behaviour; two devices could capture one show.)
4. **Entry event:** include the one `show_started_from_schedule` event in the Now slice?
5. **Wording:** "Scheduled · Today" (as prototyped, precise and zone-correct), or "Tonight"?

## 7. Update 2026-10-30: product-experience requirement and research inputs

**Requirement:** Setlistr must be exciting and rewarding to use, as well as effortless and trustworthy. Administrative efficiency alone is insufficient.

Each proposed experience states:
- the motivation it serves;
- its immediate reward;
- the natural reason to return;
- how its value grows;
- how repeat value is observed.

Rewards and frequency differ by role, and daily use isn't the goal for everyone.

The details live in [experience-strategy-update](experience-strategy-update.md):
- research inputs, with source claims, founder observations and hypotheses kept separate;
- conflicts reconciled;
- Live Passport as a framing for shipped Career, Proof, celebration and share;
- three experience hypotheses;
- one consolidated next step: a photo-to-record benchmark, paired with a "Before tonight" and Morning After sample.

Nothing here changes the Now/Next sequence, or authorises work.
