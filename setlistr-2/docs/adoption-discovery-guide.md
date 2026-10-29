# Adoption discovery: why the operator doesn't use Setlistr, and a one-show pilot

*Prepared 2026-10-28, with production at `21d2b63`.* This is a guide for the owner, **not authorisation**: no outreach, production queries, instrumentation or implementation. Contacting Matt Woodson, his artist or crew is the owner's decision and the owner's action. New feature work is paused.

**The question:** the people who would actually operate Setlistr on show night aren't using it. Why? And what result from one real show would make doing it again worthwhile?

**Evidence labels:**
- **[repo]:** read in the code at `21d2b63`.
- **[reported]:** Matt Woodson, 2026-10-26.
- **[unknown]:** to find out. No production data was read for this guide.

## 1. What we know, and what we don't

**Known:**
- **Matt's feedback [reported]:**
  - Managers want decision-useful information.
  - Artists need personal value that motivates consistent capture.
  - FOH and crew need near-zero friction; **a manager asking is not enough motivation.**
- **How capture works today [repo]:**
  - Someone with the artist's workspace on a phone in the room starts capture: with the release of `21d2b63`, from tonight's booking in one or two taps plus a confirmation.
  - The live page keeps the screen awake and sends a short audio sample about every 20 seconds for song recognition. The recognition route doesn't write audio to storage.
  - Capture ends itself 60 minutes after the last detected song, or after 4 hours.
- **After the show [repo]:**
  - Someone reviews the setlist (Review), then prepares the PRO claim sheet. "Mark as submitted" is the user's own record; Setlistr never confirms a PRO's receipt.
  - **Nothing contacts anyone** before or after a show; Setlistr's only emails are team invitations.
- **Setup [repo]:** a manager can import the tour from a spreadsheet, and invited crew join with an emailed code, with no separate beta approval.
- **Unverified [repo]:** capture with the phone locked, or the app in the background, in the installed iOS app. Also the installed app's start confirmation (owner check pending).

**Unknown (the point of discovery):**
- **Who actually operates on show night** for Matt's artist: the artist, tour manager, FOH, merch, or nobody.
- **Whether they've ever tried Setlistr**, and if so where it stopped.
- **How live performances are reported to the PRO today:** by whom, from what record, how long it takes, and whether they're reported at all.
- **What the artist would count as worth it,** and when they'd need to see it.

## 2. Hypotheses for non-use

Each is to confirm or rule out; none is a finding.

| # | Hypothesis | What would confirm it | What would rule it out |
|---|---|---|---|
| H1 | **No owner:** capture is nobody's job; the manager's request isn't enough (Matt said as much) | Nobody can name who would press start; "I assumed someone else would" | A named person who'd do it, given a reason |
| H2 | **Show-night friction:** setup, phone placement, battery, signal, starting at the right time, or the phone locking during the set | They tried and stopped at a specific step; the phone was in a pocket or locked | They never got as far as show night |
| H3 | **Value too distant or doubtful:** royalties arrive months later, if ever; estimates don't feel real | "I don't know what we'd get"; "we already get paid" | A concrete, near-term thing they want from it |
| H4 | **Already handled elsewhere:** a written setlist, a tour tool, or someone files from memory or a spreadsheet | An existing routine they're satisfied with | No current routine; live performances simply aren't reported |
| H5 | **Trust in the result:** misses, especially original or unreleased songs; review feels like work | Past captures with many corrections; scepticism about recognition | Good recognition on their material |
| H6 | **Access and accounts:** couldn't get in, wrong account, or the beta wall (team access is easier since `039871e`) | Stuck at sign-up, invite or approval | Got in without trouble |
| H7 | **Forgetting:** nothing prompts on show night or the morning after | "Didn't think of it until afterwards" | They remembered and chose not to |
| H8 | **Permission and comfort:** venue or band unease about a phone listening | A stated concern from venue, artist or crew | No concern raised |

## 3. Discovery conversations (owner-led)

- **Who:** the person who'd operate on show night (start with Matt's view of who that is), the artist, and Matt. Separately where possible; 20–30 minutes each.
- **How:**
  - Ask about **the last real show**, not hypotheticals.
  - Don't demo or pitch until the end. Don't promise royalty amounts.
  - Take notes; don't record unless they agree.
  - Store no personal data beyond what's needed to follow up.

### Questions

**Everyone**
1. Walk me through your last show, from arriving at the venue to the next morning. Where were you during the set?
2. Who decided the setlist? Where is that setlist now?
3. Have you opened Setlistr in the last month? What happened the last time you did? Where did you stop?

**Operator (TM/FOH/crew)**
4. During the set, what are your hands and attention on? When, if at all, is there a free 10 seconds?
5. Where would a phone sit during the set? Charged? Locked?
6. If capturing took two taps on the booked show, what would still stop you? What would make it automatic for you, not a favour?

**Artist**
7. How do you report live performances to your PRO today? Who does it, how often, and how long does it take? When was the last time?
8. After a show, what do you look at? What would you want to see about last night, and how soon?
9. What would make you ask your team to capture every show?

**Manager (Matt)**
10. What question about your artist's shows do you wish you could answer today?
11. Who on the team would you trust to run capture, and what would they need from you?
12. What would make you say, after one show, "do this every night"?

**Note for each answer:**
- the hypothesis it supports or rules out;
- the exact words for any blocker;
- what they'd do next, unprompted.

## 4. One-show pilot (outline; nothing scheduled)

**Purpose:** with the real operator at one real show, learn whether capture → review → claim preparation is achievable with acceptable effort, and whether the result is worth repeating to the artist and Matt.

**Preconditions (owner decisions):**
- Matt and the artist agree to it; the operator is named; the venue has no objection to a phone listening.
- **The show:** one headline or support set with a known start time, in the artist's own workspace.
- **Accounts:** the artist's account exists; the operator joins through a team invite (emailed code). The manager books the show, by schedule or import.
- **Device:** the installed-app confirmation check (pending) is done first, or the operator uses the browser. **The phone stays unlocked, on power, with the screen awake.** The locked-phone case is unverified and isn't being tested here.
- **No new features during the pilot.** Any problem is noted, not fixed mid-pilot.

**Roles and timeline:**

| When | Who | What |
|---|---|---|
| A week before | Owner, with Matt | Confirm consent, operator, show and PRO. Matt books the show (or imports the tour). The operator accepts the invite. |
| Show day | Operator | Phone on power and unlocked. At set start: Dashboard "Scheduled · Today" → Start → OK. Leave it running; don't intervene unless the app asks. |
| Show night | Owner (observing, if present) | Note setup time, the start moment, any interruption, and where the phone was |
| Next morning | Artist or operator | Review the setlist: confirm or fix songs; note the minutes taken and the corrections |
| Within a week | Artist (or whoever files) | Prepare the claim sheet for their PRO; file it in the PRO's portal if they choose. Note whether they did, and why or why not. |
| Two weeks after | Owner, Matt, artist, operator | 20-minute debrief: the decision below |

**What to note** (by observation and in the app; no new instrumentation or queries):
- **Operator effort:**
  - minutes of setup;
  - taps to start;
  - whether it started on time;
  - any intervention during the set;
  - their rating: "would do it again without being asked" (yes/no).
- **Result quality:**
  - songs performed versus songs on the reviewed setlist;
  - corrections made in review;
  - minutes to review;
  - whether the capture is linked to the booking (visible on Schedule).
- **Value:**
  - whether a claim sheet was prepared, and filed (their statement);
  - what the artist did with the record (shared, looked again, ignored);
  - the one thing Matt could answer that he couldn't before.

### What would make repeating it worthwhile

Agree these thresholds with Matt **before** the show:

| Outcome | Threshold |
|---|---|
| **Operator** | Total effort ≤ 2 minutes at the show; no intervention during the set; says they'd do it again unprompted |
| **Accuracy** | Review takes ≤ 10 minutes and ends with a setlist the artist confirms is right |
| **Value** | Within a week, the artist or Matt does **one concrete thing** with it that they wouldn't otherwise have done: prepares or files the PRO claim for that show, shares the record, or answers a question they care about |

**Decision after the debrief:**

| Result | Decision |
|---|---|
| All three met | **Repeat** for a short run (3–5 shows) with the same operator, then decide on the tour |
| Operator and accuracy met, value not | **Don't repeat yet.** The artist post-show value question (open on the roadmap) comes first: find what result they'd act on |
| Value is there, but one specific blocker (e.g. the phone locked, the start was missed) | **Fix that one thing**, then repeat one show |
| No operator would do it, or no value they'd act on | **Stop** for this artist. Record why, and revisit the hypotheses. |

**Guardrails:**
- Setlistr's royalty figures are estimates. Say so, and promise no amount.
- Filing happens in the artist's own PRO portal, under that PRO's rules. Any PRO is treated the same.
- Tell the operator plainly what capture does: short audio samples are sent for recognition, and Setlistr doesn't keep the audio (from the code).
- Leave a Setlistr-side contact for problems on the night.

## 5. Owner decisions before anything moves

1. Whether, when and how to approach Matt. Nothing is sent from here.
2. Who the operator is, from Matt's answer.
3. Which show, and that the artist and venue consent.
4. Whether to do the installed-app confirmation check first. This is recommended; otherwise the pilot uses the browser.
5. The success thresholds above, agreed with Matt in advance.
