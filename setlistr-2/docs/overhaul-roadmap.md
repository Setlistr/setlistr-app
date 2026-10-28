# Setlistr overhaul roadmap (canonical index)

**This is the canonical index of the overhaul.** It links the detailed plans and handoffs rather than repeating them; when they disagree, the linked document and the repository win. It was created on 2026-10-26, after one search of `docs/` and the release-handoff branches found no existing roadmap. (`skills/SETLISTR-SKILLS-ROADMAP.md` is about Claude skills, not the product.)

**Status words:**
- **Shipped:** on `main` and deployed to production. *Device verification pending* means the owner's installed-app check hasn't been recorded yet.
- **Implemented, awaiting release:** built and tested on the disposable stack, not merged.
- **Proposal:** written, not approved for building.
- **Research:** not committed to.
- **Unverified:** recorded in working notes but not confirmed in the repository, so neither approved nor known to be missing.

Production is `039871eef497280ca880e04b48b0182ac21d5963` (2026-10-28). Nothing here authorises implementation, production SQL, merges, deployments or outreach.

## 1. Shipped

| Area | What's in production | Detail |
|---|---|---|
| Dashboard, History, Submissions | Direction B dashboard; Submissions rows, desktop composition, loading and errors; Filing Queue and History | [submissions-refinement-handoff](submissions-refinement-handoff.md), [record-review-submissions-handoff](record-review-submissions-handoff.md) |
| UI standard | Shared page frame, header, switcher, skeleton and error patterns; adoption checklist | [ui-standard](ui-standard.md), [ui-standard-career-handoff](ui-standard-career-handoff.md) |
| Career | Overview and map; headline counts the live record | [ui-standard-career-handoff](ui-standard-career-handoff.md) |
| Review and celebration | Review revision 2; the post-save celebration and record finish; share cards (Night and Milestone) | [record-review-submissions-handoff](record-review-submissions-handoff.md) |
| Song catalogue on completion | Migrations 0025–0027: the catalogue is recorded with the final review write | [data-integrity-open-issues](data-integrity-open-issues.md) |
| Prepare → Submit | Per-PRO preparation, claim sheet, recording a submission, deadline wording; claim-sheet download in the installed app | [prepare-submit-handoff](prepare-submit-handoff.md) |
| Proof of Performance | Record page and PDF export | [proof-of-performance-plan](proof-of-performance-plan.md) |
| Schedule | Timeline (next show, upcoming, Earlier with possible duplicates); the Dashboard's Viewer live-band fix; claim-sheet content | [schedule-timeline-plan](schedule-timeline-plan.md), [release-review-combined](release-review-combined.md) |
| Schedule phone fix | Past-year dates wrap on phones; 44px controls (`5104622`). **Shipped 2026-10-26 in `577dd3d`; device verification pending** | `docs/spreadsheet-import-plan.md` (branch `docs/spreadsheet-import-plan`) |
| Spreadsheet import | CSV/XLSX import with review, atomic import and Undo; date-only and imported shows on Schedule and History. Migration 0028 applied 2026-10-26 17:57 UTC (SHA-256 `b21d2ec4…07faed`; do not run again). **Shipped 2026-10-26 in `577dd3d` (PR #4); device verification pending; the first real import is still to come** | `docs/spreadsheet-import-plan.md` (release record and rollback, branch `docs/spreadsheet-import-plan`) |
| Team and delegation | Invites, roles (manager, tour manager, band member, viewer), workspace switching, viewer write containment | [team-invite-identity](team-invite-identity.md), [delegation-audit](delegation-audit.md) |
| R&D Log admin check | `POST /api/rd-log/structure` requires an admin session before any Anthropic call. **Shipped 2026-10-27 in `a40fc56` (PR #5)**; a signed-out request returns 401 | `docs/rd-log-structure-auth.RELEASED.md` (branch `docs/overhaul-roadmap`) |
| Team invitation and admission | Invited people accept with an emailed 8-digit code and get **workspace-only** access, with no general beta admission. Pending invites expire after 14 days, and Resend issues a new link. Full admission is required for requests, invites into one's own workspace, and artist setup. Production Magic Link template is code-only. **Shipped 2026-10-28 in `039871e` (PR #6). Complete:** the owner's manual production check (private browser) passed 2026-10-28. Email authentication headers not checked | `docs/team-invite-admission.RELEASED.md`, [team-invite-admission-implementation](team-invite-admission-implementation.md) (branch `feature/team-invite-admission`) |

None of these is to be rebuilt. Changes to them go through their own plans.

## 2. Implemented, awaiting release

Nothing at present. The Schedule phone fix and spreadsheet import moved to section 1 on 2026-10-26.

## 3. Proposals awaiting decision

- **Proof record photo:** [proof-record-photo-proposal](proof-record-photo-proposal.md). SQL not authorised.
- **Proof data audit** (read-only queries, not run): [proof-data-audit-proposal](proof-data-audit-proposal.md).
- **Unverified (working notes only; confirm before acting):**
  - a mobile UX direction proposal;
  - a design-foundation brief;
  - a paused reconciliation-engine phase 1;
  - a Career refinement held after review.

## 4. Open follow-ups by track

Each track keeps its own record; these are pointers, not new commitments.

- **Reliability and data integrity** ([data-integrity-open-issues](data-integrity-open-issues.md)):
  - catalogue counts can be lost on review save;
  - duplicate notion-sync deliveries;
  - background catalogue work stops if the page closes.
- **Historical data:** shows possibly left in `review`; this needs a read-only audit first, and no backfill is authorised ([data-integrity-open-issues](data-integrity-open-issues.md) §4, [proof-data-audit-proposal](proof-data-audit-proposal.md)).
- **Dates and time zones:** the paths still using the viewer's or server's zone ([record-review-submissions-handoff](record-review-submissions-handoff.md)); the schedule timeline's limits ([schedule-timeline-plan](schedule-timeline-plan.md)).
- **Permissions and security:**
  - the direct-URL capture page has no read-only mode for Viewers ([release-review-combined](release-review-combined.md));
  - the invite-link bearer decision R2 is **resolved** by inbox-code acceptance (shipped `039871e`);
  - the audits: [rls-coverage-audit](rls-coverage-audit.md), [api-auth-audit](api-auth-audit.md), [invite-route-audit](invite-route-audit.md), [delegation-audit](delegation-audit.md).
  - Unverified: an email-change single-confirmation risk.
- **Native app:** live capture owns its own safe areas ([ui-standard](ui-standard.md)).
  - Unverified: the iPhone verification of the sign-in work, and autofill styling.
- **UI standard adoption:** the route checklist in [ui-standard](ui-standard.md), plus:
  - Submit doesn't yet use `components/ui/controls.ts`;
  - the Manager pages' older card buttons are under 44px.

## 5. Core artist/team journey (remaining show-setup and onboarding work)

**What exists** ([prepare-submit-handoff](prepare-submit-handoff.md), "What exists today"):
- **Setup paths:** `/app/show/new` (capture, setlist photo or file, quick add), `/app/upload/new` (recording upload) and Schedule.
- **Onboarding:** imports setlist.fm history once.
- **Missed capture:** recovered by recording upload, setlist photo or manual entry.
- **Unlinked routes:** `/app/new` and `/app/show/upload` have no links to them; cleanup is still open.

**Next planning step: a short assessment of the existing team journey.** Prepared 2026-10-26: [team-journey-assessment](team-journey-assessment.md). No implementation; a new crew role is **not** a commitment. The assessment answers:
1. **Who does what, today:** who prepares a show, who captures, who reviews, and who records a submission.
2. **Permissions** each action currently requires.
   - From code (to confirm in the assessment): owner, manager, tour manager and band member can all capture, review and record a submission; Viewer is read-only; only the owner and managers invite.
3. **What "Mark as submitted" records, versus filing with a PRO:**
   - Setlistr records `submission_status = 'submitted'` and `submitted_at` on the performance (the capture record), not on the show. It doesn't record who marked it. A delegate confirms that the artist submitted it.
   - Setlistr can't see the artist's PRO account, so it never confirms that the PRO received or accepted anything.
   - Filing happens in the PRO's own portal, under that PRO's rules.
4. **The smallest change to support crew-assisted capture safely:**
   - Capture responsibility is separated from submission authority.
   - **Product permission decisions** (what a Setlistr role may do) are recorded separately from **PRO-specific filing restrictions** (who a PRO lets file). These differ by PRO and are unverified until checked against each PRO's own rules.
   - Existing team capabilities stay unless an approved proposal removes them.
5. **What happens before and after a show:** what must be done beforehand, what happens if nobody captures, and who reviews afterwards.

## 6. Discovery priorities (from manager feedback, 2026-10-26)

A manager (Matt Woodson) plans to bring an artist onto Setlistr ahead of touring in early 2027. **These are discovery questions, not development commitments.**

- **A. Effortless capture for FOH and crew:** near-zero friction during show duties. A manager asking isn't enough motivation. This follows from section 5's assessment.
- **B. Rewarding artist post-show value:** first assess what the shipped celebration, recap, Career and Proof already give; then name the smallest meaningful gap that would motivate consistent capture.
- **C. Useful manager decisions:** establish the questions managers need answered before proposing any dashboard addition. Avoid another busy dashboard.
  - **Hypotheses:** capture coverage, shows awaiting review, reporting readiness, song frequency, places played.
  - **Data limits to state with any answer:**
    - imported history (setlist.fm, spreadsheet listings) isn't performed or confirmed;
    - many records have no time zone;
    - possible duplicates;
    - unresolved cities;
    - historical shows possibly left in `review`.

## 7. Proposed pilot (early 2027): proposal only

- **Who:** Matt's artist, their tour manager and FOH.
- **Validates:**
  - capture completion per show;
  - effort required, for crew and the artist;
  - whether the artist comes back after shows;
  - whether the manager can answer useful questions from Setlistr.
- **Not decided:** no contact, schedule or commitments without the owner's instruction.

## 8. Research only

- **Integrations:** Master Tour, Daysheets, Atom and calendars. Establish integration access and user value before promising any build. Bandsintown and Ticketmaster are used read-only on the Dashboard today.
- **Audience intelligence:** crowd reaction is distinct from attendance, ticket sales and demographics. **Loudness alone is never presented as validated engagement.**

## 9. Sequence

1. **Spreadsheet import release:** done 2026-10-26. 0028 applied, then one app release (`577dd3d`) that included the UI fix. Still to come: the installed-app check, then the first real import with a file the owner chooses.
2. **Team journey assessment** (section 5): written, [team-journey-assessment](team-journey-assessment.md). Awaiting the owner's review.
   - **Team invitation and admission:** shipped `039871e` and **complete** (2026-10-28).
   - **Next:** the show-setup and onboarding assessment, [show-setup-onboarding-assessment](show-setup-onboarding-assessment.md).
   - **Kept separate:**
     - P2 attribution: no migration authorised;
     - P3 recording a submission versus filing with a PRO;
     - P4 reminder groundwork: no channel chosen.
   - **Locked-phone capture:** unverified, not broken; a real-device check is proposed.
3. **Discovery A–C** (section 6), informed by the assessment. A proposal follows only if a clear smallest change emerges.
4. **The pilot** (section 7), when the owner decides.

Existing reliability, permission, historical-data and native tracks (section 4) continue alongside, each on its own record.
