# Show setup and onboarding: from entering a workspace to the first capture

*Prepared 2026-10-28 from the code on `main` at `039871e`, which is in production.* **Findings** describe what the code does today. **Recommendation** (section 4) is a proposal only: no implementation, no SQL, and no production change is authorised. Nothing already shipped is removed or rebuilt. This builds on [team-journey-assessment](team-journey-assessment.md) and doesn't repeat it.

## 1. The path today (finding)

### A team member (manager, tour manager, band member, or crew in one of those roles)
1. **Invite → accept** (shipped `039871e`): a code from their inbox, then "You're in". **Go to Dashboard** opens the artist's workspace already selected, and the selection is remembered on that device.
2. **Dashboard, before any show:**
   - It says "The record starts with {artist}'s first show. Tap the gold button when the set starts. Played already? You can upload a recording."
   - **Coming up** shows the next scheduled show as a **link to Schedule**, with no Start.
3. **Show night**, three ways in:

| Way in | Steps | Result |
|---|---|---|
| **Gold capture button** (always in the bottom bar; the most visible) | New show → **"Where tonight?"**: type or choose the venue (and city if it's new) → Start Live Capture → "Load your set" (photo, file, quick add, or skip) → Start | Live capture. **Creates a new show. A show already scheduled for tonight is ignored:** it later appears under Earlier as "No capture linked" next to a possible duplicate. |
| **Dashboard "Tonight" row** | Appears **only for a Bandsintown/Ticketmaster listing** → opens New show with the venue filled in → same steps as above | Same as above: unlinked from any scheduled show |
| **Schedule → Start Capture** | Dashboard → Coming up → Schedule → **Start Capture** (or "Start early") on the next show → confirm dialog | Live capture **linked to the scheduled show**, through `start_scheduled_show`. It's atomic, re-checks permission, is safe to retry and refuses a second starter, and records who started it. **This is the only path that uses the manager's preparation**, and it's three screens away. |

4. **Live:** the microphone prompt (first time), the screen kept awake, auto-ending, manual add.

### A new artist (owner)
1. Beta approval (unchanged), then **onboarding**:
   - names and PRO;
   - setlist.fm history (imported once);
   - the Spotify catalogue.
2. **Onboarding ends on New show ("Where tonight?")**, whether or not they're playing that night. They can leave via Dashboard.
3. From there, the same three ways in as above.

## 2. Frictions against Matt Woodson's needs (finding)

| Need | Friction in the code today |
|---|---|
| **Crew/FOH: near-zero friction on show night** | The obvious button asks crew to identify the venue the manager already scheduled. Typing a venue during show duties is exactly the effort to remove. The one-tap linked Start sits three screens away on Schedule. |
| **Manager: prep that pays off, and useful answers** | Spreadsheet import and scheduling (shipped) prepare the tour, but **the main capture path doesn't use that preparation.** Each night captured through the gold button leaves the scheduled show "No capture linked" plus a possible duplicate. That undermines the coverage question managers ask first ("which shows were captured?"), discovery C. |
| **Artist: consistent capture** | The same: a scheduled show doesn't become "tonight" anywhere they look. A new artist is dropped into "Where tonight?" at the end of onboarding, even on a night off. That's minor; there's a way out. |

**Out of scope here:**
- reminders and notifications (P4: no channel chosen);
- separating capture from submission authority (P3);
- recording who reviewed or submitted (P2: migration not authorised);
- the Viewer direct-URL live page (an open follow-up);
- locked-phone capture in the installed app (unverified).

## 3. What was **not** measured

- **How often this happens in production.** No production data was read. A read-only count could size it if authorised: scheduled shows with "No capture linked" that have a same-day capture at the same venue.
- The installed iOS app's behaviour with the confirm dialog, and with the phone locked.

## 4. Recommendation: one small slice (proposal)

### "Tonight's show, one tap": bring the existing linked Start to where people already tap

**When the selected workspace has a Setlistr-scheduled show tonight with a start time:**
1. **Dashboard:** the existing "Tonight" row shows **that scheduled show**, ahead of any Bandsintown listing.
   - Tapping it runs the **existing** Schedule Start (`useShowActions` → `POST /api/shows/schedule/[id]/start` → live, autostart), confirm dialog included.
   - A Viewer sees the row as status only, as today.
2. **New show (the gold button):** the first screen leads with **"Start capture: {venue}, tonight {time}"**, plus **"A different show"**, which opens today's form unchanged.

**Why this slice:**
- It turns the manager's preparation, now possible through import, into the crew's one-tap start.
- It stops each captured night leaving an unlinked scheduled show behind, which makes the manager's coverage data trustworthy.
- It's small: two existing screens, reusing a shipped, permission-checked server path.

**What it doesn't need:** no schema, migration, API or permission change; no reminders; no new role.

**Rules to keep:**
- **"Tonight" means the next scheduled show**, in the show's own time zone; it's the same show Schedule would offer Start for. Its time must fall from 6 hours before now (the Dashboard's existing live window) to 12 hours after; the exact window is to be confirmed in the plan.
- **Date-only shows** keep today's message to add a start time first. **Imported past listings** stay unstartable.
- **Everything already shipped behaves exactly as now:** a show already live keeps "Show in progress / Tap to continue"; the Bandsintown row appears when no scheduled show is tonight; New show's form, setlist loading, upload and past-setlist reuse are unchanged.
- **No Start is offered** to a Viewer, or before the team role is known (the existing `canCapture` rule).

**Acceptance criteria (for a later plan; disposable stack only):**
- A tour manager with a show scheduled tonight starts a linked capture from the Dashboard row, and from New show, in **one tap plus the confirm**.
  - The capture appears on Schedule linked to that show.
  - No duplicate is created.
  - `captured_by` and `started_by` are recorded as today.
- A second team member starting the same show gets the existing "just started by someone else".
- "A different show" still creates an unlinked show exactly as today.
- A Viewer sees no Start. Date-only and imported past shows behave as today.
- Phone width (390 px) and the installed-app shell: the row and buttons are at least 44 px.

**Second candidate (not recommended first):** end onboarding on the Dashboard, not on "Where tonight?". It's lower value for Matt's pilot (artists are onboarded once), but trivial. It could be bundled only if the owner wants.

**Before building:** optionally, the read-only count in section 3 to confirm how often this happens. Then a short plan with screenshots of the two states.
