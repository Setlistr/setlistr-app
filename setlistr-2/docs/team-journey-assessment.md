# Team journey assessment

*Prepared 2026-10-26 from the code on `main` at `577dd3d`, which is in production.* No production data was read, and nothing here is approved for building. **Findings** describe what the code does today. **Proposals** (section 7) are options for the owner to decide on. This document doesn't propose a new role or a dashboard redesign, and no shipped capability is removed.

## 1. Permissions today (finding)

There are two database checks:
- **`can_act_for`** (read): the artist, plus any accepted delegate whose access hasn't been revoked, in any role.
- **`can_write_for`** (write): the artist, plus delegates with the manager, tour manager or band member role.

The app mirrors these with `useWorkspaceRole().canWrite` and `WRITE_CAPABLE_ROLES`.

| Action | Owner | Manager | Tour manager | Band member | Viewer | Enforced by |
|---|---|---|---|---|---|---|
| See Dashboard, Schedule, History, Review, Proof | ✓ | ✓ | ✓ | ✓ | ✓ | `can_act_for` (row-level security) |
| Add, edit or cancel a scheduled show; import a spreadsheet; Undo an import | ✓ | ✓ | ✓ | ✓ | – | `can_write_for`; Schedule `canManage` |
| Start capture (New show, or Start on Schedule) | ✓ | ✓ | ✓ | ✓ | – | row-level security; `start_scheduled_show` checks `can_write_for` |
| Upload a recording | ✓ | ✓ | ✓ | ✓ | – | `upload-performance` checks for a write-capable role on the server |
| Review → Save & Complete | ✓ | ✓ | ✓ | ✓ | – | row-level security on `performances` and `performance_songs` |
| Prepare for a PRO and record a submission ("Mark as submitted") | ✓ | ✓ | ✓ | ✓ | – | row-level security; the Submit page's `canWriteSubmission` |
| Invite a team member (any role, including manager) | ✓ | ✓ | – | – | – | `canCreateInvite` |
| Remove a member, resend an invite, answer a manager's request | ✓ | – | – | – | – | `teamViewCapabilities` |

**Known gap (open):** opening the live-capture page directly by its URL has no read-only mode for Viewers. It's tracked in [release-review-combined](release-review-combined.md).

**What this means:** every role that can capture can also review the show and mark it submitted. **No role can capture without also having submission authority.**

## 2. Who does each step, and what's recorded (finding)

| Step | Who can do it today | What Setlistr records about who did it |
|---|---|---|
| **Prepare** (schedule, import) | Any write-capable member | `shows.scheduled_by` and `scheduled_by_name`, shown as "Added by". An import records its batch and file. |
| **Capture live** | Any write-capable member, on their own phone, signed in as themselves, with the artist's workspace selected | A delegate gets `captured_by` and `captured_by_name` (New show and Schedule start). Schedule start also sets `started_by`. When the owner captures, these stay empty by convention. |
| **Capture missed → recover** | Any write-capable member: upload a recording, a setlist photo, or enter songs by hand | **An upload records nothing about who did it.** |
| **Review** | Whoever opens the show and taps Save & Complete | **Nothing records who reviewed it.** |
| **Record submission** | Any write-capable member | Only `performances.submission_status = 'submitted'` and `submitted_at`. **Nothing records who marked it.** |

**What a recorded submission means:** it's the user's own statement that the setlist was filed. The filing itself happens in the PRO's own portal. Setlistr never confirms that a PRO received or accepted anything.

## 3. Before and after a show (finding)

- **Before:** nothing is required. A scheduled show is optional. Starting it from Schedule needs a start time (a date-only show asks for one first), and **Start is offered only on the next upcoming show.** Anyone can also capture without a scheduled show, through New show.
- **During:**
  - The live page asks the screen to stay awake (Wake Lock, where the device supports it).
  - Capture ends itself 60 minutes after the last detected song, or after 4 hours.
  - **Unverified:** how this behaves in the installed iOS app when the phone locks or the app goes to the background.
- **If nobody captures:**
  - The scheduled show later appears under Earlier as "No capture linked."
  - **Nobody is prompted:** there's no reminder before or during the show.
  - Recovery is by upload, photo or manual entry, after someone notices.
- **After:**
  - The Dashboard's morning-after band says "Give the setlist a quick look." Once the show is reviewed, it says "Ready to mark submitted." This appears only for someone who opens the app on that workspace.
  - **No email or push notification goes to the artist or team about shows.** Setlistr's only emails to users are about team invites, manager requests and approvals.
  - **Correction to earlier notes:** the "weekly digest" (`/api/weekly-digest`) is an internal email to the Setlistr team, not a notification to artists or managers.

## 4. Getting crew onto the team (finding)

To capture for an artist, a crew member must:
1. Have a Setlistr account.
2. **Be admitted to the beta separately.** A team invite doesn't admit anyone; an admin has to add a `beta_invites` row. Until then, middleware keeps the invite pending and sends the person to `/beta`.
3. Accept the invite. It can only be sent by the owner or a manager.
4. Get a write-capable role. The least-privileged one that can capture is band member or tour manager, and both also carry review and submission authority (section 1).
5. Select the artist's workspace on show night, then use New show or Schedule → Start.

**Related open decision:** whether an invite link should work for anyone who holds it ("R2", in [team-invite-identity](team-invite-identity.md)).

## 5. Matt Woodson's feedback, set against these findings

| Need (manager feedback, 2026-10-26) | What exists | Gap (finding) |
|---|---|---|
| **FOH and crew need near-zero-friction capture.** A manager asking isn't enough motivation. | One-tap Start on the next scheduled show. The screen stays awake. Capture ends itself. Manual add during the show. | Joining takes five steps, including an admin beta step. Nothing prompts anyone on show night. Starting capture means taking on review and submission authority too. |
| **Artists need personal value** that motivates consistent capture. | Post-save celebration, share cards, Career, Proof. | Not assessed here; this is discovery B. Nothing prompts the artist after a show, by any channel. |
| **Managers want decision-useful information.** | Dashboard, Submissions, Schedule's possible duplicates and "No capture linked". | Not assessed here; this is discovery C. Nothing records who reviewed or who marked a show submitted, which limits answers to "who's doing what". |

## 6. Frictions, smallest to largest (finding)

1. **Beta admission is a separate admin step for each team member.** An accepted team invite doesn't admit the person.
2. **Review and submission leave no trace of who did them**, and uploads don't record who uploaded. Small, data-only gaps.
3. **Nothing prompts anyone:** no show-night or morning-after reminder outside the app.
4. **Capture authority implies submission authority.** This can't be separated without changing permissions.
5. **Viewers can reach the live page by direct URL** without a read-only mode (open follow-up).

## 7. Proposals for discussion (not approved)

Each is independent and needs the owner's decision first. None removes an existing capability.

- **P1. Admission through an accepted team invite.** An invite accepted from an owner or manager would also count as beta admission.
  - **Decide together with R2.** If invite links work for whoever holds them, P1 would extend that risk to beta access.
  - **Alternative:** keep the admin step, and show the inviter that the person still needs admission.
- **P2. Record who reviewed and who marked a show submitted** (and who uploaded).
  - Attribution only: additive columns written by the existing actions. No permission changes.
  - Needs a migration and SQL approval.
  - This is the smallest step that makes later manager questions answerable.
- **P3. Separate capturing from submitting:** not proposed for building now.
  - The options, for a later approved proposal: a narrower capture-only permission, or keeping today's roles and relying on P2's attribution.
  - **Two separate kinds of question:**
    - **Product permissions** (what a Setlistr role may do) are Setlistr's to decide.
    - **PRO filing restrictions** (who a given PRO lets file for an artist) differ by PRO and are unverified until checked against each PRO's own rules. Any proposal must treat all supported PROs equally.
- **P4. Reminders:** a show-night "start capture" prompt and a morning-after "review" prompt.
  - First needs a channel decision: email, or native push (neither is set up for shows today).
  - Also needs to decide who receives them: the person who scheduled the show, or the whole team.
  - This is discovery work before any build.

## 8. Not verified

- Live capture in the installed iOS app with the phone locked or the app in the background.
- How many teams and delegates use Setlistr in production, and in which roles. No production data was read.
- Each PRO's rules on who may file for an artist.
