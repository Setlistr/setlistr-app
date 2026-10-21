# Prepare → Submit — handoff

Branch `refine/prepare-submit`, cut from the approved, unmerged candidate **`32cefdb`** (`refine/record-review-submissions`). Production `main` is **`1aee35b`**. This branch therefore contains both:
- the candidate's Review, Submissions, Dashboard/History, dates and Career work, already approved;
- the Prepare → Submit work below.

Proposal: revision 2 (claude.ai/artifact/6TTmuXhmhDaSHa5X1ULpFj), with the corrections given on 2026-10-20.

**Status: released 2026-10-20.** `main` was fast-forwarded (no force) from `1aee35b` to **`8f6c47e`** after the owner's approval. The approval covered both batches: `32cefdb` and the Prepare → Submit work. A narrow claim-sheet download fix followed as **`3e955c2`** (see "Claim-sheet download fix"). Release details are below. Neither SQL, the environment nor native code changed, and there was no backfill. Every write test ran on the disposable local stack.

## Commits

| Commit | Change |
|---|---|
| `4b1e8a0` | Correctness:<br>• failed show, profile, team-context and songs loads are errors with Try again;<br>• recording waits for the songs;<br>• stale responses are dropped;<br>• the start time defaults from the show's own zone;<br>• "Copied" follows only a confirmed clipboard write;<br>• the confirmation opens at its top. |
| `875190b` | Persistence and recording (`lib/claim-progress.ts`):<br>• per-account storage;<br>• copy marks that follow the value;<br>• one write at a time;<br>• the write is conditional and checked by read-back;<br>• `writerSubmits` on each PRO rule. |
| `ec31183` | Layout and actions: see below. |

## What the page does now

**Status and deadline.**
- The status describes only information completeness: Ready to submit, N details needed, Details complete (when the reporting route is in question), Needs review, or No PRO set.
- The deadline line follows its basis:
  - "Due … · N days left" only for official deadlines (ASCAP, BMI);
  - "Working window to …" for Setlistr's 12-month default (SOCAN, PRS, APRA);
  - "Reminder …" for SESAC and GMR.
- The basis is the label of a disclosure that holds the rule, its source and BMI's early cutoff. The basis is "From X's published rule", "Setlistr default, not a published deadline", or "No published deadline".
- No calculation changed.

**Official wording, checked 2026-10-20.**
- ASCAP's OnStage page (ascap.com/music-creators/ascap-onstage) matches the code:
  - Jan–Mar → Jun 30; Apr–Jun → Sep 30; Jul–Sep → Dec 31; Oct–Dec → Mar 31;
  - "All OnStage claims must be submitted by writers of the performed works";
  - direct deposit is required.
  - `scripts/test-claim-progress.ts` asserts the table.
- bmi.com refuses automated fetches (HTTP 403). Search excerpts of BMI's own pages were checked on 2026-10-20; this is not a direct read of the pages:
  - They are **consistent** with `lib/pro-rules.ts`. Each quarter has an earlier deadline with a sooner payment, and a later one (for example 1Q26: June 30, then September 30). Entry is allowed up to two quarters back. Only the performing songwriter enters shows, not a manager or publisher, and direct deposit is required.
  - **Conflict, unresolved:** BMI's pages disagree on the December 2027 cutoff. One says Dec 21, another Dec 31. The code uses Dec 21 for every December, which is never later than either. That is the conservative choice, **not a verified date**. No rule was changed. Someone should read bmi.com/creators/bmi-live by hand and confirm the date in a BMI Live account.

**Details.**
- When complete, details fold to their values (for example "Start time 9:00 PM · Ticket price 25 · Promoter …") with Edit.
- Missing ones are open, labelled "required" and `aria-invalid`.
- Details that started incomplete stay open until Done, so finishing the last one doesn't fold the field away mid-typing.

**Claim sheet.**
- Field order, per-field copy, Copy all titles and downloads are unchanged.
- The aggregate "N of 6 copied" is removed.
- A check means that exact value was copied in this tab. Editing a value clears its check.
- A failed copy says "Didn't copy", with a way forward.

**Actions.** One card; anything to resolve sits directly above the action.
- The route warning keeps the amber treatment.
- Prerequisites are a compact list with one optional checkbox per item, and "Why these matter" folded. A tick is the user's own note, not a verification.
- Primary action:
  - Owner, self-serve PRO: the portal, once details are complete and the route isn't in question.
  - GMR: the download for the rep.
  - Team member, where the PRO says the songwriter enters the show (ASCAP, BMI): "Copy a link for <artist>". The portal stays available as a link.
  - Team member, other PROs: the portal, with the link secondary. The copy says Setlistr never asks for portal logins.
- At the handoff: "Nothing is sent automatically. The link opens this sheet in <artist>'s account; details typed on this device don't go with it. The downloaded sheet includes them."

**Recording.**
- Always available: secondary until the portal has been opened, then primary.
- A team member confirms in the page.
- Viewers see who can record; there is no control.

**Confirmation.**
- MARKED SUBMITTED (green, filled gold dot), venue, show and PRO.
- One sentence: recorded on <date>; Setlistr can't confirm the PRO received or accepted it.
- Back to Submissions in the show's own workspace: it switches a team member to the artist's workspace, or returns the artist to their own.
- View claim sheet; "What happens next" folded.

## Storage (all per device)

| What | Where | Key |
|---|---|---|
| Show details | localStorage | `setlistr:claim:<viewer>:<show>` |
| Prerequisite acknowledgements | localStorage | `setlistr:preflight:<viewer>:<artist>:<PRO>` |
| Copied marks, portal opened | sessionStorage | `setlistr:claim-progress:<viewer>:<show>:<PRO>` |
| Scroll position | sessionStorage | `setlistr:claim-scroll:<viewer>:<show>` |

How older data and other accounts are handled:
- The released account-less details key (`setlistr:claim:<show>`) moves under the account that next opens the sheet. Submissions and History read the per-account key and fall back to the released one until then.
- The released acknowledgement key (`setlistr:preflight:<artist>:<PRO>`) is honoured only for the artist's own account.
- Copied marks store a fingerprint, never the value, so legal names and IPI numbers aren't written to storage.
- Signing in as another account reloads an open sheet for that account.

## Recording a submission

The database is the record. The write is:

`update performances set submission_status='submitted', submitted_at=now where id=… and (submission_status is null or submission_status <> 'submitted')`, returning ids.

If the answer is exactly one row, it's recorded. Otherwise the show's status is read back:
- Recorded: confirmation. This covers a write whose response was lost, and a show someone else already recorded; the stored time is kept.
- Not recorded: "This wasn't recorded … Try again".
- Read-back failed too: "The connection dropped before Setlistr could confirm this was recorded … Check again". Check again only reads.

A second tap while a write is in flight does nothing, and a repeat write can't move `submitted_at`.

## Verification (disposable stack `127.0.0.1:54621` and the branch on `:3105`, never Preview)

- `npx tsc --noEmit`: pass. `next build`: pass.
- Unit and invariant suites:

  | Suite | Result |
  |---|---|
  | claim-progress (new) | 56/0 |
  | filing-status | 39/0 |
  | mobile-layout-invariants | 147/0 |
  | record-summary | 31/0 |
  | filing-deadline-label | 21/0 |
  | date-format | 16/0 |
  | ceremony-display | 16/0 |
  | submissions-nav-counts | 22/0 |
  | appearance | 75/0 |
  | show-date (Toronto, Tokyo) | 13/0 each |

- Database suites on the disposable stack:

  | Suite | Result |
  |---|---|
  | submission-status-write | 34/0: conditional write; repeat and racing taps; lost response; Viewer and revoked read-backs |
  | viewer-write-containment | 465/0 |
  | workspace-boundary | 66/0 |
  | prod-verify section A (review saves; catalogue recorded by the database) | 23/0 |

  prod-verify section B needs the pre-release builds and was not rerun, as before. This branch changes no review, catalogue or save code.
- Browser checks: 112/0, Chromium, scratch script `disp/submit-final.js`.
  - **Renders:** phone 390 and desktop 1280 in Dark and Light; 320px; text zoom 130% on phone and desktop. No horizontal overflow; controls at least 44px; the last control clears the bottom navigation.
  - **Show states:** loading skeleton; normal SOCAN show; missing detail; route warning.
  - **Each PRO:** BMI (Due, two separate acknowledgements, rule source); GMR (rep download, Reminder); ASCAP, PRS, APRA and SESAC (field order and deadline wording).
  - **Copy workflow:**
    - clipboard contents;
    - a failed copy;
    - a reload that keeps details, checks, portal state and scroll position;
    - an edit that clears a check;
    - storage keys.
  - **Recording:**
    - success; double tap (one write);
    - zero-row denial; rejected write; committed write with a lost response;
    - lost response with a failed read-back, then Check again;
    - a show already recorded elsewhere.
  - **Team:**
    - Manager's SOCAN journey: prepare, copy link, artist opens, in-page confirm, record;
    - Manager's BMI, ASCAP and GMR primary actions;
    - Back to Submissions in the artist's workspace;
    - Viewer: no control, and the export has no legal name or IPI.
  - **Failed loads:** show, team context and songs.
  - **Switching:** fast switching between shows; a second account on the same browser; a sign-in change in another tab.
  - **Keyboard:** focus order (missing field, then portal, then sheet), focus rings, disclosures.

## Limits and what remains

1. **Real devices, still pending** (owner): iPhone Safari and the installed app.
   - Where the portal opens.
   - Clipboard fidelity in the portal.
   - Returning after tab eviction.
   - Downloads: the installed-app claim-sheet action is confirmed working after `3e955c2` (see below). The other items remain pending.

   The installed app loads production, so it can't exercise this unmerged code. All of the above is Chromium simulation.
2. **Details typed by a team member stay on their device.** The link doesn't carry them; the download does. Accepted for this batch: no shared storage, endpoints or credential sharing.
3. **The route check is best effort.** Territory comes from free-text venue fields; when unsure, no warning is shown.
4. **BMI's December cutoffs.** BMI's own pages give Dec 21 and Dec 31 for December 2027. Setlistr shows Dec 21, the conservative choice, not a verified date. Rules are unchanged; a manual check is still open.
5. **Start time.** Unscheduled captures still default the start time in the device's zone, and say so. A venue zone at capture would need a capture or schema change.
6. **Still open, untouched:**
   - historical backfill;
   - live-capture and upload catalogue repair;
   - Notion webhook dedup;
   - catalogue count integrity.

## Release (2026-10-20)

- **Approval:** the owner approved `refine/prepare-submit` at `8f6c47ebd415ab676a9d363294654b3c43bb2592`, including `32cefdb`, after reviewing the combined Preview (setlistr-d9devrv3h-jesse-slacks-projects.vercel.app). That approval is visual. It doesn't verify device behaviour.
- **Before the push:**
  - `origin/main` and the candidate were unchanged (`1aee35b`, `8f6c47e`);
  - `main` was unprotected, with linear history;
  - the owner confirmed no show was live.
- **Merge:** a fast-forward push, `1aee35b..8f6c47e`, with no force. The production commit is exactly `8f6c47e`.
- **Deployment:** the GitHub → Vercel production deployment created 14:27:57Z reported success (`setlistr-3l2a1wz93-jesse-slacks-projects.vercel.app`).
- **Diff `1aee35b..8f6c47e`:** 19 files: app pages, components, `lib/`, docs and test scripts. No SQL or migrations, no native code or Capacitor config, no capture or recognition, no API routes, middleware, configuration, packages or environment files.

### Rollback

1. Promote the previous production deployment (built from `1aee35b`) in the Vercel dashboard.
2. Then reconcile Git: revert `1aee35b..8f6c47e` on `main` through GitHub. No force-push.
3. The catalogue SQL (migrations 0025–0027) stays in place; both builds use it.

**Local-storage limitation.** The new build moves each show's typed details to a per-account key (`setlistr:claim:<account>:<show>`). The old build reads only `setlistr:claim:<show>`. After a rollback, details typed or moved under the new build won't appear in the old build on that browser. They are a convenience only; no record is affected.

Old tabs left open on the previous build keep writing the old key. The new build reads its own key first, so a value an old tab writes after migration is used only where no per-account value exists.

## Claim-sheet download fix (2026-10-20)

**Report.** After the `8f6c47e` release, tapping Download claim sheet in the installed app did nothing visible.

**Cause, demonstrated.**
- The download code was unchanged since `1aee35b`, apart from the show-date line, so the release didn't introduce it.
- In Chromium and WebKit with iPhone emulation, the control fires, the sheet is generated and the download completes.
- The installed app is a WKWebView run by Capacitor iOS 8.3.1, which has no download handling. A macOS WKWebView harness running Capacitor's navigation logic showed the result: the `blob:` download is treated as outside the app, handed to the system (which has no handler for `blob:`), and cancelled. The page hears nothing back.

**Fix (`3e955c2`, `lib/claim-sheet-handoff.ts`).**
- **Browsers:** the same download as before.
- **Installed app:** the sheet goes to the iOS share sheet (Web Share API with a file). Where the web view doesn't offer it, or sharing fails, the page explains why and shows the sheet's text, read-only and selectable, with "Copy the sheet".
- **Errors:** a sheet that can't be generated shows an explicit error. Dismissing the share sheet isn't an error.
- **Unchanged:** sheet content (SOCAN, BMI and GMR sheets for Owner, Manager and Viewer were byte-identical before and after); Manager and Viewer sheets carry no legal name or IPI; no path writes submission status. No plugin, native or configuration change.

**Verification before release** (disposable stack and local branch, never production data):
- `tsc` and `next build` pass.
- Handoff unit tests 12/0; simulated installed app 15/0.
- Copy failing (clipboard and fallback copy both blocked), in Chromium and WebKit, Owner and Viewer: 50/0. The text stays, can be selected in full, and status is unchanged.
- Main Submit browser checks 69/0.
- iPhone Safari download confirmed by the owner on the fix Preview (setlistr-6hxksclgb-jesse-slacks-projects.vercel.app).

**Release.**
- On the owner's approval, `main` was fast-forwarded (no force) from `8f6c47e` to **`3e955c29fdb7f22556002b26e7ef16e2c443142e`**. Three files changed: the Submit page, `lib/claim-sheet-handoff.ts` and its test. No SQL, native, environment, package or capture changes.
- The Vercel production deployment succeeded: setlistr-j602ieeiz-jesse-slacks-projects.vercel.app.

**Device confirmation.** After closing and reopening the installed app, the owner confirmed the claim-sheet action works on `3e955c2`. The report doesn't say whether the share sheet or the text fallback appeared, so which path the app's web view takes is still unknown.

**Rollback.** Promote the `8f6c47e` deployment in Vercel, then revert `3e955c2` on `main` through GitHub. No data or storage is involved.

### After release: open

1. **Device checks on iPhone Safari and the installed app:** the installed-app claim-sheet action is confirmed (above). Still pending: where the portal opens, clipboard fidelity in the portal, and returning after tab eviction. Use real shows; never mark a show submitted or submit a claim to test.
2. **BMI's December dates:** a manual check is pending (see Limits 4).
3. **Claim-sheet content fixes** (branch `fix/claim-sheet-content`, not released).
   - **Duplicated writer names: fixed at the source (`438c085`, live capture in `c304cce`).**
     - **Cause:** MusicBrainz returns one relation per role. A songwriter credited as both composer and lyricist was joined twice: "Bohemian Rhapsody" came back as "Freddie Mercury, Freddie Mercury". This was reproduced through `/api/upload-reconcile` on the disposable stack.
     - **Fix:** `lib/writer-credits.ts` keeps one credit per MusicBrainz artist ID, in MusicBrainz's order. Different people who share a name keep a credit each. It is used in `enrich-song`, `upload-identify` and `upload-reconcile`.
     - **Live capture (`app/api/identify`), on the owner's explicit approval:** only the writer-credit line changed, to the same shared function. Its MusicBrainz enrichment is now identical to `upload-identify`'s. Recognition, thresholds, matching, attribution, permissions and capture are unchanged.
       - The released and edited enrichment functions were run side by side against real MusicBrainz: one credit per person, with the same ISRC and publisher.
       - With controlled responses, two different people both named "John Smith" stay as two credits.
       - The `identify` authorization suite passes, 128/0, with ACRCloud and MusicBrainz stubbed on the disposable stack. Its setup needed `artist_name` added in a scratch copy only; the repository test is unchanged.
     - **Existing stored duplicates remain unchanged.** Writer credits are saved with each song when it's added. Songs saved before this fix keep their repeated names in the database and in every claim sheet, exactly as stored. The fix only affects songs enriched from now on.
       - There is no backfill, and the exporter doesn't deduplicate by name: a name can't tell one person from two people with the same name.
       - Correcting older songs would need a separate, approved re-enrichment by MusicBrainz artist ID.
   - **Export date labels: fixed (`b5437ed`).**
     - The sheet now uses the page's wording from `lib/deadline-wording.ts`: "Due" (ASCAP, BMI), "Working window: to …" (SOCAN, PRS, APRA) or "Reminder" (SESAC, GMR), followed by a "Basis:" line.
     - An early cutoff is listed only while it is open.
     - Calculations are unchanged, and the page's own wording is unchanged: 5,817 show dates were compared against the released expression.
   - **Seen while tracing, not changed:**
     - MusicBrainz lookups in upload hit the 2.5-second time limit often, which leaves songs with no writer.
     - `enrich-song` falls back to the recording's artist credits when it finds no writer relations, so a performer can appear as "Writer".
4. **Unchanged and still open:**
   - Manager-typed details are device-local;
   - the route check is best effort;
   - unscheduled captures default the start time in the device's zone;
   - historical backfill;
   - catalogue repair for live capture and uploads;
   - Notion webhook dedup;
   - catalogue count integrity.

## Next workstreams (recorded 2026-10-21; nothing implemented)

**Proof of Performance:** the next dedicated workstream. A proposal and prototype come before any implementation.

**Schedule: scope.**
- Schedule covers past, present and future shows, bulk ingestion, calendars and external intelligence, not only upcoming shows.
- Each integration (Bandsintown, Ticketmaster, setlist.fm, calendars) is scoped on its own.
- **No combined timeline yet.** First establish how imported, scheduled and captured records relate, so that one show can't appear twice. Imported setlist.fm shows, scheduled `shows` rows and captured performances are separate records today.

**What exists today:**
- `/app/schedule` lists future scheduled shows only: create, edit, cancel, start, time zones and duplicate warnings.
- History holds past shows and separates setlist.fm imports.
- Setup: `/app/show/new` (capture, setlist photo or file, quick add) and `/app/upload/new` (recording upload). `/app/new` and `/app/show/upload` have no links to them.
- Onboarding imports setlist.fm history once.
- The dashboard looks up Bandsintown events by artist name, with Ticketmaster as fallback, and doesn't save them.
- There is no calendar sync and no bulk upload. `email-sync` and `transcript-sync` are internal Notion tools.
