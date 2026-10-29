# Concierge pilot: a maintained live-performance record

> **STOPPED 2026-10-29 by the owner.** Manual processing can't be staffed and isn't the intended business model. Superseded by [performance-record-automation-feasibility](performance-record-automation-feasibility.md). Kept for the record only.

*Operating-model experiment, 2026-10-28; production `21d2b63`.* Not a feature build: **no code, SQL, integrations, outreach or production inspection.** It uses only the shipped product plus human work. The roadmap and released product are unchanged. Contacting artists or managers is the owner's decision and the owner's action.

**Evidence labels:**
- **[repo]:** read in the code at `21d2b63`.
- **[est]:** an estimate to replace with pilot data.
- **[unverified]:** not checked.

## The experiment in one paragraph

**Hypothesis:** artist teams value a maintained live-performance record and claim-ready preparation, but don't want to operate a tool every show.

**The test:** for **two artist teams × three shows each**, the manager sends the itinerary and the current planned setlist. Setlistr keeps the draft and reconciles it against whatever evidence exists. One authorised person confirms what happened and corrects exceptions. Then Setlistr enters the confirmed record and sends a short weekly outcome with the claim sheet.

**After three shows per team, ask one question:** would they keep this going, and pay for it?

**Stop** if confirmation doesn't come back, customer effort creeps above a few minutes a show, or nobody would pay.

## Five rules that apply throughout

1. **A booking is not a performance.** Itinerary rows become Schedule bookings (`shows`, `scheduled`) or past listings (`listed`). Neither is ever reported as played. [repo]
2. **A planned or repeated setlist is a draft.** It is never entered as performed until the confirmer confirms it.
3. **Confirmation is not independent verification.** The record says "confirmed by {name}, {date}", never "verified".
4. **Prepared or submitted is not received, accepted or paid.**
   - "Claim sheet ready" means it's prepared.
   - "Mark as submitted" is only the artist's own statement that they filed. Setlistr can't see the PRO. [repo]
5. **No payment match doesn't mean money is owed.** The pilot makes no payment-matching claims, and **shows no royalty amounts as expected income.** Setlistr's figures are estimates. [repo]

## 1. Responsibilities

| Role | Who | Does | Doesn't |
|---|---|---|---|
| **Buyer** | The manager (e.g. Matt) | Sends the itinerary and the current planned setlist; receives the weekly outcome; answers the continuation/payment question | Confirm what was played, unless the artist names them as confirmer |
| **Confirmer** | The artist, or **one person the artist authorises in writing** (e.g. the tour manager) | Answers each post-show request: "Confirmed", or corrections. Optionally sends a photo of the marked-up setlist. | Need to open Setlistr |
| **Evidence helper** (optional) | FOH or crew, if the confirmer asks | Sends a photo of the marked-up setlist, or runs live capture on the team's phone | See the record, estimates or anything financial (section 7) |
| **Operator** | Setlistr (owner or staff) | Imports bookings; keeps the drafts; reconciles; sends requests; enters only the confirmed records; prepares the claim sheet and weekly outcome | Enter anything unconfirmed; mark anything submitted unless the artist says they filed |

**Access:**
- The artist invites the operator to their workspace as **Manager**, through Team, with the emailed code (shipped).
- Nobody else from the customer side needs an account.
- If the artist has no Setlistr account yet, the owner decides whether the pilot creates one (with consent) or the artist signs up.

## 2. Steps, inputs and customer effort

| Step | Input | Who | Customer effort | What exists [repo] / what's manual |
|---|---|---|---|---|
| **0. Set up** (once per team) | Written consent and confirmer authorisation (an email is enough); the artist's PRO; the workspace invite | Artist, buyer | ~10 min once | Team invite with emailed code exists. **Manual:** consent record, PRO note. |
| **1. Bookings** (once per tour) | The itinerary spreadsheet they already have | Buyer sends; operator imports | ~2 min | **Spreadsheet import exists:** future rows → bookings; past rows → listings, never performances. Review screen; Undo. |
| **2. Draft** (each show, before it) | The current planned setlist (text, photo or file) | Buyer sends once, then only when it changes | ~1 min when it changes | **Manual:** the draft lives in the operator's pilot workbook (section 4), **not in the app**. |
| **3. Evidence** (each show, after) | Any of these: a photo of the marked-up setlist; "same as planned except…"; an authorised recording; a live capture | Confirmer or helper | 0–2 min | Live capture from tonight's booking (`21d2b63`) is optional and done by their own person. Recording upload and recognition exist. Photo → text exists in New show (`api/parse-setlist`). |
| **4. Reconcile** | Draft + evidence | Operator | 0 | **Manual:** compare and list the exceptions (added, dropped, swapped, uncertain). Recognition results are suggestions, not facts. |
| **5. Confirm** | The confirmation request (section 3) | Confirmer | **1–3 min** | **Manual:** sent by email or text from the operator. Not in the app. |
| **6. Record** (only after confirmation) | The confirmed setlist | Operator | 0 | See section 4 for the entry path. Save & Complete adds it to the record and catalogue. |
| **7. Prepare** | The confirmed record | Operator | 0 | Prepare → Submit builds the PRO claim sheet (any PRO); Proof gives the record and PDF. **Manual:** sending them. |
| **8. Weekly outcome** | — | Operator → buyer and artist | ~1 min to read | **Manual:** an email (section 3). The artist files in their own PRO portal if they choose. |

**Target customer effort:**
- **confirmer:** ≤ 3 minutes a show;
- **buyer:** ≤ 5 minutes a week, plus one-off setup.

## 3. Samples

**Post-show confirmation request** (to the confirmer only; no figures):

> **Subject: Last night at Mohawk (Austin): 2 things to check**
>
> Hi Sam, here's our draft of last night's set (Wed Oct 28, Mohawk, Austin), from the planned setlist and the photo Jo sent:
>
> 1. Opening Song · 2. Second Song · 3. *New Song (not on the planned list; we heard it in the recording)* · 4. Fourth Song · … · 14. Closer
>
> **Please check:**
> - Was **New Song** played? If so, is that its title?
> - The planned list had **Old Favourite** at 9; we have no sign it was played. Dropped?
>
> Reply **"Confirmed"** if the list is right, or just tell us what to change. We'll only add the show to your record once you confirm.

**Weekly outcome** (to the buyer and artist):

> **Week of Oct 26: 3 shows**
>
> | Show | Status |
> |---|---|
> | Wed Oct 28 · Mohawk, Austin | **Confirmed by Sam Oct 29** · 14 songs · claim sheet ready (SOCAN) |
> | Fri Oct 30 · Cactus Cafe, Austin | Waiting for confirmation (sent Oct 31) |
> | Sat Oct 31 · Hotel Vegas, Austin | Not yet played |
>
> **Ready for you:** the claim sheet for Oct 28 (attached) to file in your SOCAN portal, if you choose. We can't see the PRO, so "ready" doesn't mean filed, received or paid.
>
> **Record so far:** 1 confirmed show this tour. Bookings aren't counted until confirmed.

## 4. Where drafts live

**Recommendation: outside the customer's workspace, in an operator-owned pilot workbook** (one sheet per team), until confirmation.

**Why not in the app** [repo]:
- **Any performance counts at once.** The Dashboard's live record, Submissions and Proof count every performance except setlist.fm imports, **whatever its status**. Career counts `review` and complete shows.
- **Every performance update calls the Notion-sync webhook** (`notion_show_count`, defined only in the production schema). That's an external side effect.
- **Save & Complete writes the song catalogue** (`confirmed_count`, migration 0027).
- **New show's "Load your set" makes a live performance before the show**, with the planned songs stored as `planned`. That is a counted performance.

**What is safe in the app before confirmation:** **bookings only**. Imported or scheduled shows are `shows` rows, never counted as performed. Schedule shows them as "No capture linked", which is accurate.

**Workbook columns:**
- booking (date, venue, local time zone);
- planned setlist version;
- evidence received (type, from whom, link);
- draft setlist;
- exceptions;
- request sent / reply / confirmer and date;
- entered in app (yes / no) and entry method;
- claim sheet sent;
- the artist's "filed" statement (if any);
- minutes spent.

**Entering a confirmed show** (existing paths, chosen by evidence):

| Evidence | Path | Result |
|---|---|---|
| **Live capture already happened** (their phone, from the booking) | Open that show's Review, correct it to the confirmed list, Save & Complete | Linked to the booking |
| **Authorised recording** | Upload a Recording → Review → correct → Save & Complete | Method shows as upload |
| **Neither** | New show → "Use a past setlist" with **Set show date** → Review → edit to the confirmed list → Save & Complete. Needs one earlier show in the workspace; for the very first, use the recording or live path, or this path after one exists. | — |

**The date is read in the operator's device time zone:** enter the venue-local date at midday so it can't shift to the next or previous day.

**Known gap, kept manual:**
- Recording or past-setlist entries create a **new** show, not linked to the booking. The booking stays "No capture linked", and Schedule may pair the two as a possible duplicate.
- **Don't cancel the booking:** cancelled means it didn't happen.
- Note the pairing in the workbook.

## 5. Internal minutes and direct costs per show [est]

| Work | Minutes |
|---|---|
| Intake: itinerary and planned-setlist changes, spread over the tour | 5 |
| Draft prep in the workbook | 5 |
| Evidence chase | 5 |
| Reconcile: photo → text, compare, list exceptions | 15 |
| Confirmation exchange | 5 |
| Enter the confirmed record and complete Review | 10 |
| Claim sheet, plus this show's share of the weekly outcome | 10 |
| **Steady state** | **≈ 55** |
| **First show per team** (setup, workspace, learning) | **+30–45** |

**Pilot total:** about 6 × 55 + 2 × 40 ≈ **7 hours**, plus two debriefs.

**Direct costs per show** (all are dwarfed by staff time at any hourly rate the owner sets):
- **Photo → text:** one Claude vision call per photo (`claude-sonnet-4-5`). Cents per photo [unverified pricing].
- **Recognition**, if there's a recording or live capture: about one request per 20 seconds of audio, so roughly 270 for a 90-minute set. The cost depends on the ACRCloud plan [unverified].
- **Email:** existing provider; negligible.
- **Hosting:** negligible.

## 6. Measures, the continuation question, and stop criteria

**Measured by the operator in the workbook** (no instrumentation):

| Measure | Target |
|---|---|
| Confirmer effort per show (their estimate) | ≤ 3 min |
| Buyer effort per week | ≤ 5 min |
| Show → confirmation request sent | ≤ 24 h |
| Request → confirmed | ≤ 72 h |
| Show → claim sheet ready | ≤ 7 days |
| Confirmation rate (shows confirmed ÷ shows played) | ≥ 5 of 6 |
| Exceptions per show (draft vs confirmed) | Recorded; shows whether the planned setlist alone would have been wrong |
| Internal minutes per show | Falling toward ≤ 45 by each team's third show |
| Did they use it? Claim filed (their statement), weekly outcome read, record shared | Recorded |

**Continuation and payment question** (after the third show, owner asks the buyer):

> "For the rest of the tour, we'd keep your live record confirmed and claim-ready, with you spending about 3 minutes a show. **Would you continue at {price the owner sets} per show (or per month)?** Who on your side would pay? If not, what would have to be different?"

Record the answer verbatim, including "yes, but…" conditions.

**Stop criteria** (any one):
- The confirmer doesn't answer for 2 of a team's 3 shows.
- Customer effort exceeds 10 minutes a show.
- Internal time stays above 90 minutes a show at the third show.
- The buyer says the outcome isn't useful, or wouldn't continue at any price.
- A privacy or consent concern arises that can't be resolved.

**Continue (a second, paid or priced round)** if both teams confirm at least 5 of 6 shows within targets, **and** at least one buyer says yes to a price.

## 7. Privacy boundaries

- **No royalty figures for FOH or crew.**
  - The app shows "Estimated royalties" to **every** team role, Viewer included, and each role's description promises estimates [repo]. So **don't invite FOH or crew to the workspace** during the pilot.
  - Evidence helpers only send photos or run capture on the team's phone, and receive figure-free messages.
- **Estimates and money go only to the artist and buyer**, labelled as estimates, with no expected-income or "you're owed" wording.
- **Recordings and photos:** only with the artist's authorisation, used only to reconcile that show.
  - Live capture sends short audio samples for recognition, and the current upload page doesn't keep the file [repo].
  - The workbook stores links, not copies, and is deleted (or handed to the artist) after the pilot.
- **Confirmer authority** is recorded in writing. Nobody else's word changes the record.
- **Minimum personal data** in the workbook: names and contact details of the confirmer and buyer only.

## 8. Kept manual until demand is shown

None of these is built for the pilot:
- intake of the itinerary or setlist by email (the operator imports and keeps drafts by hand);
- a draft or "pending confirmation" state in the app (the workbook);
- confirmation requests and replies (email or text, by hand);
- reconciling evidence into exceptions (by hand, using existing photo → text and recognition);
- linking a later-entered show to its booking (noted in the workbook);
- the weekly outcome (an email by hand);
- consent and authorisation records (an email);
- payment matching, statements or royalty tracking (**not attempted**);
- hiding royalty estimates from crew roles (handled by not inviting crew);
- billing (the payment question is asked, nothing is charged).

**When to reconsider building any of these:** only once both teams say they'd pay. Then the first candidates are a confirmed-only draft state, and linking a confirmed entry to its booking.

## Separate hypothesis: songwriter and publisher performance monitoring

**Hypothesis:** writers and publishers would pay to know where their compositions are performed live, by any artist, so that live performances can be claimed.

**Reusable [repo]:**
- the publisher portal and roster (`publisher_accounts`, `publisher_roster`);
- a dashboard of unsubmitted shows across a roster;
- per-song ISRC, composer and publisher fields with MusicBrainz enrichment;
- song debuts and frequency;
- Proof records;
- the claim-sheet output.

**Missing:**
- **Performances by artists who don't use Setlistr.** No permitted data source is integrated; external setlist sites' terms for commercial reuse are [unverified].
- **Composition identity** (ISWC, writer splits). Titles and ISRCs identify recordings, not works.
- **Consent:** an artist's record goes to a publisher only through the roster, with the artist's agreement.
- **PRO-side data:** what was already claimed or paid isn't visible to Setlistr.

**What not to do:** promise discovery or coverage. The only safe version today is **a publisher whose roster artists already use Setlistr** (or join this concierge model) seeing confirmed records for their writers' songs.

**Smallest test, if the owner wants one:** a desk conversation with one publisher about whether confirmed records from roster artists, with no discovery, would be worth anything. No build and no data access.
