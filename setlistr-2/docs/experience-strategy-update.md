# Strategy update: research inputs, product experience, and one next step

*Planning brief, 2026-10-30; production last reported at `21d2b63`.* This addendum is to [product-strategy-reconciliation](product-strategy-reconciliation.md) and the canonical [overhaul-roadmap](overhaul-roadmap.md). It authorises nothing:
- no implementation, SQL, production queries or changes;
- no outreach, paid access, new integrations or deployment.

It links these existing assessments rather than repeating them:
- [performance-record-automation-feasibility](performance-record-automation-feasibility.md): the input slice, the source matrix and the benchmarks;
- [show-setup-onboarding-assessment](show-setup-onboarding-assessment.md), [team-journey-assessment](team-journey-assessment.md) and [adoption-discovery-guide](adoption-discovery-guide.md).

**About the input:** the "Explore Crowd Data Scraping" conversation wasn't available here as a file. This brief records only the eight findings and the conflicts as the owner stated them on 2026-10-30. **No claim from that conversation has been checked.**

**Labels:**
- **[repo]:** read in the code.
- **[docs]:** a provider's own documentation, as cited in the feasibility doc.
- **[founder]:** the owner's observation or decision.
- **[claim]:** a source or research claim, not reverified.
- **[hypothesis]:** to be tested.
- **[unmeasured]:** an estimate.

## 1. Preserved

- **Mission:** *The trusted, evidence-backed record of what actually happened onstage.*
- **Live Passport** is the preferred artist-facing concept. It names the experience that already exists across:
  - **Career** (`/app/stats`: map, shows, cities, hours, Most played, Dormant songs, Top venues, Song debuts, My Songs with last played);
  - **Proof** (the record page and PDF);
  - **the celebration** after Review;
  - **the share cards** (`components/share-cards`: Night and Milestone record cards, Song debut, Royalty moment) [repo].

  **Live Passport is a framing and a quality bar for those surfaces, not a new destination.**

## 2. Research inputs, kept separate

### 2a. Source and research claims (reverify before use)

| # | Claim | Status |
|---|---|---|
| C1 | Muzooka and Encord are relevant comparators | **[claim].** Neither has been examined here. What each offers, and whether either is a competitor, supplier or analogue, is unverified. Record them as a research task, not a fact. |
| C2 | Licensed event suppliers can supply past events and setlists | **[claim]** for JamBase's historical setlist coverage (vendor statement). Terms aren't public. See the feasibility doc, section 3. |
| C3 | Provider terms: setlist.fm non-commercial and short caching; Bandsintown per-artist keys; YouTube metadata only, 30-day storage, no derived data; Meta App Review | **[docs]**, read 2026-10-29 (feasibility doc, section 3) |

### 2b. Founder observations

| # | Observation |
|---|---|
| F1 | **Mobile is the effortless artist and show-day companion; desktop is for deeper professional work.** One underlying system; essential tasks stay available on mobile. |
| F2 | **Manual processing can't be staffed** and isn't the business model (concierge stopped 2026-10-29). |
| F3 | **Setlistr must be exciting and rewarding to use**, not only efficient and trustworthy. Administrative efficiency alone is insufficient (section 4). |
| F4 | **The paying customer is unresolved.** |
| F5 | Earlier: Matt Woodson's feedback (crew effort; artist motivation; useful manager decisions), 2026-10-26, in the roadmap's section 6 |

### 2c. Product hypotheses and research tasks

| # | Item | Type | Existing basis [repo] |
|---|---|---|---|
| H1 | **The Morning After:** a personal post-show outcome from existing records and components | Hypothesis | Celebration, Night card, Song debuts, Proof |
| H2 | **Before-show value:** the last set in this city, recent changes, openers and closers, songs not played recently | Hypothesis | `performance_songs` with positions; `user_songs.last_confirmed_at`; Dormant songs (45 days); Song debuts API |
| H3 | **Authorised production-system observations** (playback, show-control or console logs supplied by the team) as an input alongside capture, uploads, photos and public discovery | Hypothesis, **desk only** | None. A cue firing is **not** proof that a song was performed (section 3). |
| H4 | **Compare licensed event suppliers with permitted public discovery and existing imports.** Event discovery ("which shows") and performed-song reconstruction ("which songs") are **separate problems** with different sources and accuracy. | Research | Feasibility doc, section 3 |
| H5 | **Audit public website claims** against shipped verification, reporting and submission behaviour | Research task (read-only) | Seeds in section 8 |
| H6 | **Distinguish user, operator, beneficiary and buyer** | Research | Section 9 |

## 3. Conflicts, reconciled explicitly

| Proposal or temptation | Decision | Why |
|---|---|---|
| Manual concierge processing as an ongoing model | **Rejected** (F2) | Any experience must run on automated or self-serve input |
| A new Artist Home, recap system or manager dashboard | **Rejected.** Changes land on Dashboard, Career, Review/celebration, Proof or Manager Overview. | Those are shipped. Duplicates split attention, as already decided in the reconciliation. |
| Treating a booking as occurred, a planned song as played, or a playback cue as performance | **Rejected** | An authorised person confirms. Observations and listings are draft evidence. |
| Audience preference from song frequency or recording loudness | **Rejected** | Frequency is the artist's choice; loudness isn't engagement. Copy describes what was played, never what fans liked. |
| "Verified" status, or royalty entitlement, from AI confidence | **Rejected** | Confidence only decides what to flag for the confirmer. Confirmation ≠ verification ≠ filed ≠ paid. |
| Research rankings, and November–December timing | **Provisional** | Not engineering commitments. At most one or two experiments at a time. |

## 4. Product-experience requirement

**Requirement (F3):** every proposed experience must be **effortless, trustworthy and rewarding**. Each must state:
- the motivation it serves;
- its immediate reward;
- the natural reason to return;
- how its value grows;
- how repeat value would be observed.

**Principles, translated** (principles from excellent products, not copied interfaces or gamification):

| Principle | In Setlistr | Guardrail |
|---|---|---|
| Effort becomes a personal story | A confirmed night joins a visible life record: the map, the tour, the song's own history | Only confirmed performances tell the story; imported history is labelled |
| Surprising, accurate personal discoveries | "First time playing *Neon Lights* in Chicago **on your record**"; "*Old Favourite* returned after 14 shows" | Qualified with "on your record" and its coverage; never "ever", never "fans love" |
| Visible, meaningful progression | Cities, songs played live, the repertoire's spread, the tour's route | Real accomplishments, not points, streaks or invented levels |
| Clear next actions | One next step per moment: confirm last night; open tonight's context | Never more than one prompt per moment |
| Satisfying completion, restrained motion | The existing celebration and record finish (shipped) | Reuse its motion language; no new animation system |
| Collaboration improves a shared record | The crew captures, the artist confirms, the manager sees it complete, and each confirmation enriches everyone's view | Attribution limits (P2) stated |

**Rewards and frequency by role.** Daily use isn't the goal for anyone.

| Role | Reward | Natural frequency | Success looks like |
|---|---|---|---|
| Crew / TM / FOH | Least effort: the job's done and they can forget it | Show nights only | Fewer taps and minutes; *low* time in app |
| Artist | Story and discovery: the night counted; they learn something true about their own live life | After shows; before shows in a new or returning city | Returns at those moments across a run |
| Manager | Confidence: knowing what happened across the roster and what's left to do | Weekly, or after a run of shows | Fewer open items; faster answers |
| Publisher | Accomplishment: works performed and territories, with what's still unknown stated | Monthly or quarterly, at reporting deadlines | Fewer unknowns at each deadline. **Filing eligibility, completeness and authority are each PRO's rules and the rights holder's, not Setlistr's to assert.** |

## 5. Three experience hypotheses (beyond cards and dashboards)

**Mechanics studied** (design references from general product knowledge, not verified research):

| Mechanic | Seen in | What makes it work | Setlistr analogue |
|---|---|---|---|
| Exploration of a revealed map | Strategy games' fog of war; Strava's personal heatmap | The territory is *yours*, earned by having been there | The Career map, where tapping a city opens its nights |
| Collections with real provenance | Museum collections in *Animal Crossing*; Letterboxd's diary | Each item has a story of how you got it | A song's live life: debut, plays, cities, positions |
| Progression and mastery | Skill trees; running PRs | Visible growth in something you care about | Repertoire range and rotation, without scores |
| Creative play | Sandboxes; playlist making | You make something, then use it | Drafting a set against your own history |
| Cooperation | Co-op games; shared albums | Others' contributions make yours richer | The crew's capture plus the artist's confirmation make one record |
| Anticipation | A season's "next chapter"; travel apps before a trip | Looking forward to something personal | Tonight's city, and what you played there last |
| Attachment | Tamagotchi care; a well-worn notebook | It's uniquely yours and accumulates | The tour as a book that grows each night |

### Comparison

| | **1. Explore and build your live career** | **2. Understand and experiment with your repertoire** | **3. A tour as an evolving personal story** |
|---|---|---|---|
| **Interaction** | On the Career map, tap a city, and its nights unfold as a stack: dates, venues, each night's setlist, "first night here". A timeline scrubber replays the career across the map, year by year. | **Set lab:** each song is a card with its live life (debut, plays, last played, cities, usual position as opener or closer, **only where performed order is reliable**). For an upcoming show, "Before tonight: Chicago" shows the last set there, what's changed since, and songs not played in a while. Then drag together a draft set and see, per song, "last played here 2024" or "new to this city on your record". | Each tour is a chapter: the route draws night by night; a strip shows how the set evolved (songs in and out, closer changes); firsts are marked. At the end it closes into a tour book that is also Proof-ready. |
| **Curiosity and satisfaction** | Seeing your own territory; rediscovering nights | Surprising but true facts about your own songs; making a set that's informed rather than guessed | Watching something grow; closure at the end |
| **Useful outcome** | Locate any past night fast (support for Proof and claims) | **A better set for tonight; a planned setlist** (existing `planned_setlists`, which stay separate from performed) | A tour record from which filings can be prepared (PRO-agnostic), and Proof |
| **Why return** | Occasional nostalgia; a new city appears | **[hypothesis]** the set decision on a show day, and the morning after. Whether artists actually return then is untested. | Every night of a tour; then dormant between tours |
| **Data and limits** | Confirmed performances with cities. Unresolved cities and imported history (labelled) leave holes, so the map shows them as unknown, never as empty. | Confirmed `performance_songs` positions and `user_songs`. It needs about 10 or more confirmed shows to say anything. Cold start is solved only by automated input (photos of past setlists). Frequency never implies preference. | Every night needs evidence, or it shows as a **visible gap** ("no setlist on record for this night"). Gaps are never hidden, smoothed or filled with the planned set, so the story is the most exposed to missing input. Tours aren't a field today; they would be inferred from bookings or imports. |
| **Overlap** | High: the Career map, Top venues and cities already exist. Mostly an interaction upgrade of Career. | Medium: My Songs (last played), Dormant songs, Song debuts, Most played already exist as lists. New: per-city history, positions, the set draft. | Medium: Night cards, Milestone, Proof. New: grouping by tour, the evolution strip. |
| **Smallest prototype** | A static click-through of a city stack, on local fixture data | **A local prototype:** two screens (Before tonight; the set lab for one show) from one artist's confirmed fixtures | A static tour chapter for one past run, from fixtures |
| **Automated-input risk** | Low (works from existing records) | **Medium**: grows with each confirmed show; backfill by photo | **High**: each missing night is a visible gap in the story |

**Managers and publishers: discovery and accomplishment without a game.** The same confirmed record answers professional questions in plain language:
- **Manager:**
  - "Across the run: 18 of 20 bookings confirmed; 2 to resolve";
  - "*Neon Lights* is now in every set; it isn't yet registered with the artist's PRO".
- **Publisher:**
  - "Works performed live this quarter, by territory, with what's missing for each" (for example writers unknown, not in the work list). **Never "ready to file":** eligibility, completeness and filing authority aren't established by Setlistr;
  - "First live performances of new works".

These use Prepare → Submit, the claim sheet and Proof for the action; they don't add another dashboard. The accomplishment is **a deadline approached with known gaps resolved or stated**.

**Recommendation: prototype hypothesis 2 first, starting with "Before tonight".** It is a prototype to test, **not the chosen adoption solution.**
- **[hypothesis]** It may give a natural reason to return on show days. Whether artists actually return then is untested.
- It turns the record into something the artist *uses*, not only admires.
- Its value compounds with each confirmed show.
- Its input is exactly what the automation slice produces: confirmed setlists, backfilled from photos of past setlists.
- It feeds the professional view (repertoire across the run).

Hypothesis 1 is a later upgrade of Career. Hypothesis 3 waits until linked capture and photo confirmation prove reliable across a whole run.

## 6. Experiences specified (reusing shipped components)

| | Live Passport | The Morning After | Before tonight | Professional insight |
|---|---|---|---|---|
| **Motivation** | "My live life, all in one place, and it's real" | "Did last night count, and what did it add?" | "What should we play here?" | "What happened, and what's left to do?" |
| **Immediate reward** | Seeing the whole record, with honest coverage | One true discovery about last night, and the record finish | Context in seconds, for a decision made anyway | A short list resolved; a sheet ready |
| **Reason to return [hypothesis]** | Milestones; new cities | Every show | Show days | Each run's end; each filing deadline |
| **Value growth** | Grows with every confirmed show | Discoveries get richer with history | More history makes better context | Fewer gaps over time |
| **Observed by** | Career and Proof opens after new shows | Opened within 24 h of a show; confirmed | Opened before the show; a planned set made | Items resolved within 7 days; claim sheet used |
| **Reuses [repo]** | Career, Proof, share cards | Celebration, Night card, Song debut | My Songs, Dormant songs, `planned_setlists` | Manager Overview, Prepare → Submit, claim sheet |

**How discoveries stay accurate:**
- **Computed deterministically** from confirmed performances, with templated wording. No language model writes the insights, so nothing is invented.
- **Each one states its basis:** "on your record (34 confirmed shows since March 2025; imported history excluded)".
- **Each insight has its own evidence requirement** (replacing the earlier arbitrary show-count thresholds):

  | Insight | Shown only when | Otherwise |
  |---|---|---|
  | "Last set here" | At least one confirmed show whose city is resolved to this city, with its confirmed setlist | "No confirmed set here on your record" |
  | "First time playing X here, on your record" | Every confirmed show in this city has a confirmed setlist (no city show missing songs) | Not shown; "N nights here have no setlist on record" |
  | "Not played in N shows" | The last N confirmed shows all have confirmed setlists (no gaps in that run) | "Not in your last K confirmed setlists" with K the gap-free run, or nothing |
  | "Song debut" / "returned after N shows" | The same gap-free run back to the previous play | Not shown |
  | Opener / closer, "closed for the first time" | Performed order is reliable: live capture timestamps, or a confirmer-checked order. A photo's written order alone is the **planned** order, so it isn't enough unless the confirmer checks "played in this order". | Song shown without position claims |
  | "What changed since your last set here" | Both sets confirmed | Not shown |
- **No causal language and no audience claims.**

## 7. ONE consolidated next step

### A. Benchmark: "photo → confirmed record", run locally
**Test:** can Setlistr turn existing artifacts into confirmed setlists cheaply enough, with little enough correction, for the experience to rest on them?

- **Scope:** Part A of the feasibility benchmark:
  - about 30 synthetic setlist photos plus up to 10 owner-authorised real photos;
  - the existing `parse-setlist` extraction core and catalogue matching.
- **Plus a desk comparison**, with no access purchased: event discovery (itinerary, the artist's own Bandsintown key, Ticketmaster) versus performed-song sources (team photos and capture; licensed suppliers named only from public terms).
- **Production-system observations (H3)** are listed as a future input with their limits. **They aren't benchmarked.**

**Measures:**
- title recall and precision;
- running order;
- crossed-out and added marks;
- catalogue-match accuracy;
- flag calibration;
- edits per show;
- cost and latency.

**Reuses [repo]:**
- the `parse-setlist` prompt and fuzzy match;
- `lib/song-utils` normalisation;
- the disposable stack.

**Cost:** about $1–2 in Claude calls [unmeasured]; **needs approval**. Nothing else is paid.

### B. Sample artist outcome: "Before tonight" plus "The Morning After"
Built from the benchmark's output, as a local prototype for one sample artist with fixture data. The owner's own history needs consent.

**The artist experience (the compelling sample).** Lena, the morning after a Chicago show:
1. **Last night:** confirmed, with the record finish (the existing celebration).
2. **One true discovery:** "*Old Favourite* came back after 14 confirmed shows (no gaps in that run)." An opener or closer claim appears only when the confirmer checked "played in this order".
3. **Before tonight, Minneapolis:**
   - "Your last set here (Apr 2025): 13 songs; 5 aren't in your current rotation";
   - "Not played in 30+ shows: *Harbour*, *June*".
4. **One action:** "Start tonight's set from your last one here" makes a *planned* setlist, clearly labelled planned.

**The professional experience.** Lena's manager, at the end of the run, opens the existing Manager Overview:
- "This run: 12 shows confirmed (8 by photo, 4 by live capture), 1 booking to resolve";
- "3 songs performed live aren't on your claim sheet's work list";
- then **Prepare** for every confirmed show, for whichever PRO the artist uses.

**Why someone wants the professional experience after the artist one:** the artist's Morning After is where confirmation happens, and confirmation is rewarding *to the artist* rather than a chore. Each confirmed night is what makes the manager's run summary complete and the claim sheet trustworthy, without anyone chasing anyone.

The manager's reason to want it isn't the screen; it's **not having to ask** "what did you play in Denver?" The artist's reason to keep confirming is that the next "Before tonight" gets better. That's one shared record improving through collaboration.

### Technical success versus customer value

| | Technical success (benchmark A) | Customer value (B, later, only with approval) |
|---|---|---|
| Question | Is the input good and cheap enough? | Do people want the output? |
| Measured by | Recall ≥95% (typed) and ≥80% (handwritten); ≥90% of errors flagged; ≤ $0.10 per show; correction ≤2 minutes [unmeasured target] | Owner review of the prototype first. Then, only if the owner chooses, one artist and their manager shown the prototype on their own fixtures: do they open "Before tonight" before a show, would they confirm to get it, does the manager drop a manual check-in? |
| Failure means | Stop, or fall back to live capture only | Keep administration only; don't build the experience |

**Cost, correction and support:**
- **Processing:** about $0.01–0.03 per photo and ≤ $0.10 per show [unmeasured]. Insights are deterministic queries over confirmed data, so close to $0.
- **Correction:** the confirmer resolves flagged items only; target ≤2 minutes per show [unmeasured].
- **Support:** no staff queue (as in the feasibility doc, section 7). Self-serve retry or typing; periodic failure-rate review by the owner.

**Not in this step:**
- hypotheses 1 and 3;
- any new destination;
- discovery integrations;
- production-system integrations;
- notifications;
- any build before the owner approves.

## 8. Website claims audit (seeds; read-only, not completed)

| Page [repo] | Claim | Shipped behaviour |
|---|---|---|
| `app/how-it-works/page.tsx`, meta description | "verifies every song, and submits royalty claims to SOCAN, ASCAP, BMI…" | Team confirmation, not verification; Setlistr prepares a claim sheet; **the artist files** in the PRO portal |
| `app/how-it-works/page.tsx` | "already a verified, timestamped record — every song, source-confirmed"; "Verified shows move to claim" | Captured songs still need Review; no verification status exists |
| `app/page.tsx` | "Verified Performance Intelligence"; "routing it through the submission pipeline" | Same gap |
| Several landing pages | "captures your setlist automatically" | True for live capture, which still needs Review |

**Proposed task:** a complete page-by-page table, then wording proposals. **No site change until approved.**

## 9. Who pays: unresolved

| Role | User | Operator | Beneficiary | Buyer? |
|---|---|---|---|---|
| Artist (songwriter) | Yes | Sometimes | **Royalties, record, story** | Possible |
| Crew / TM / FOH | Yes | **Yes** (capture) | Indirect | Unlikely |
| Manager | Yes | Yes (setup, follow-up) | Commission; less admin | Possible |
| Publisher | Yes | Rarely | **Royalties on works** | Possible |
| Label, agent, venue, festival | — | — | Varies | Unknown |

**Open:** whose budget, at what price, for which outcome. That's for the owner's discovery, with no outreach here.

## 10. Mobile and desktop (F1)

| Mobile: the companion | Desktop: deeper work |
|---|---|
| Start tonight's show | Imports |
| Add the setlist photo | Team setup |
| Confirm the Morning After | Run-level review |
| Before tonight | Prepare → Submit across shows |
| Share | Proof exports |
|  | Publisher views |

Same data and permissions. Every essential task stays possible on mobile.
