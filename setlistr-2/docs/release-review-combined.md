# Combined release review: Schedule, Dashboard Viewer link, claim-sheet content

**Status: RELEASED (2026-10-23).**
- The owner explicitly approved candidate `bc33f1306d9d0479bf2847d0b07b95157013b9b8`, with no show being captured, and accepted the documented limitations.
- **Pre-merge checks:**
  - remote `main` was `a10b5456e3f54df01345a3b1acd91ae5e7797468`;
  - the head was exactly `bc33f13`;
  - the app code was identical to the reviewed Preview `7ba1ae5`.
- **Merged:** PR #3, as merge commit `3ce48335d65fa75ca2792498cb47d060b6f65dbb` (parents `a10b545` and `bc33f13`; tree identical to `bc33f13`). The merge was guarded with `--match-head-commit`. GitHub → Vercel triggers the production deployment.
- **Production deployment: live.**
  - One status lookup confirmed Production for commit `3ce4833`: success, at `setlistr-53p5i1izc-jesse-slacks-projects.vercel.app`, created 2026-10-23 16:53 UTC.
  - `main` had no later commits.
- **Signed-out smoke checks (GET only, run once):**
  - `/api/shows/timeline` (history and active), `/api/shows/schedule`, `/api/proof/summary` and `/api/proof/pdf` returned 401 JSON. The Schedule timeline route is new, so its 401 instead of 404 shows the new code is serving.
  - `/app/schedule`, `/app/proof`, `/app/dashboard` and `/app/submit/<id>` redirected to sign-in.
- **Not verified in production:** signed-in checks (the owner's installed-app check below), and the Dashboard Viewer fix. A missing live band while nobody is capturing doesn't test the Viewer permission; that behaviour rests on the local role tests (Dashboard band 9/0).
- **Follow-up kept separate:** the direct-URL Viewer capture-controls issue, with the untested `capture_sessions` path and unconfirmed production policy parity.

Earlier status: prepared for release review only; production was `a10b545`.

The branch `release/combined-review` comes from `main` `a10b545`, with one `--no-ff` merge per candidate. The original branches are preserved and unchanged.

| Candidate | Source | What it changes |
|---|---|---|
| Claim-sheet content | `96aa36a` (`release/claim-sheet-content` = `24fe8c1` + `main`) | One writer credit per MusicBrainz artist (`lib/writer-credits.ts` in enrich-song, upload-identify, upload-reconcile, and the approved identify writer-credit line). The claim sheet's export dates use the page's Due / Working window / Reminder wording (`lib/deadline-wording.ts`). Handoff: `docs/prepare-submit-handoff.md`. |
| Schedule timeline | `c1fea9f` (`feature/schedule-timeline`) | Read-only timeline on `/app/schedule`: capture in progress, next show, upcoming, then history with possible duplicates (`lib/shows/*`, `/api/shows/timeline`, `ScheduleTimeline`). `UpcomingShows` is refactored without behaviour change. Visual design approved at `c1fea9f`. Plan: `docs/schedule-timeline-plan.md`. |
| Dashboard Viewer live link | `6a478bf` (`fix/dashboard-viewer-live-link`) | The Dashboard's "show in progress" band opens live capture only when the role can write; Viewers see plain status. |

No two candidates touch the same file. Each file in the combination is identical to its candidate. The released Proof page, the PDF, `next.config.mjs` and the dependencies are unchanged from `main`.

There's no SQL, migration, environment or dependency change. Capture, recognition, upload and the save handlers are unchanged, apart from the writer-credit assembly approved earlier.

## Verification (disposable database, production build of this branch)

- **Type-check and production build:** clean.
- **Unit tests:** writer credits 9/0, deadline wording 20/0, Proof summary 83/0, Schedule identity 47/0.
- **Schedule end-to-end:** 49/0. It includes the Manager Schedule page and the Dashboard's Next Show through the refactored `UpcomingShows`, Start and Cancel, and the Viewer rules.
- **Dashboard live band by role:** 9/0. Viewers see plain status with no capture link; owners and managers open live capture; `/api/identify` refuses a Viewer.
- **Viewer write attempts against the capture page's tables:** all tested writes were refused or changed nothing. `capture_sessions` remains untested because it isn't in the disposable schema. Parity between the disposable database's security rules and production's is unconfirmed.
- **Proof route regression:** 42/0. The Proof files are identical to `main`.
- **Claim-sheet smoke check:** 21 exports, 7 PROs × owner, manager and Viewer, with multi-writer credits; 105/0.
  - The date labels are the page's own: Working window (SOCAN, PRS, APRA), Due (BMI, ASCAP), Reminder (GMR, SESAC). No "Deadline:" label appears.
  - Multi-writer lines are intact. A stored duplicate prints as stored, as decided earlier: the exporter doesn't deduplicate names.
  - Manager and Viewer exports carry no legal name or IPI; owner exports do.
  - Every export is identical to the one reviewed for the claim-sheet candidate.
- **Claim-sheet handoff:** browser download works in Chromium and WebKit (iPhone). Simulated installed-app checks pass 15/0: share sheet, dismissal, the text fallback and Copy, failure messages, and no legal name or IPI in the Viewer's fallback. Submission status never changed.

## What this release doesn't do

- **The Schedule timeline** improves navigation and surfaces possible duplicates. It doesn't repair historical records, prevent duplicate ingestion, or change Dashboard, Career, History or Proof counts.
- **The Dashboard fix** hides a link. It doesn't change who may write.

## Known limitations, documented separately

1. **Direct-URL capture page for Viewers.** `/app/live/[id]` has no read-only mode. A Viewer who opens a capture URL directly still sees capture controls.
   - **Disposable-database checks with a real Viewer session:** all tested writes were refused or changed nothing (performances, performance_songs insert and delete, shows, user_songs insert and update, user_song_performances, setlists, setlist_items), and `/api/identify` returned 403 with no writes. That isn't proof the page is safe for Viewers; see the next bullet.
   - **Untested:** `capture_sessions` doesn't exist in the disposable schema, so that write path is untested. The disposable database's security rules aren't confirmed identical to production's.
   - **Not fixed here.** A read-only capture view, or a server-side check on that page, needs its own reviewed change.
2. **Future cancelled shows** aren't shown in Schedule until their date passes, as before. That's a later UX decision.
3. **Possible-duplicate matching** compares venue names exactly after normalisation, so a differently written name won't match. Records without a recorded time zone are compared on their stored date only.
4. **The `performance_date` column type in production is unverified.** The timeline keeps stored values. The read-only query is in `docs/schedule-timeline-plan.md`. The historical data audit stays a separate proposal.
5. **Installed app:** after release, the installed app loads production. Schedule and the Dashboard band should be checked on a device, read-only. Starting a show is a real write.

## Release (after explicit approval)

1. Confirm `main` is still `a10b545` and this branch's head is the approved SHA.
2. Open a PR from `release/combined-review` to `main` and merge it with a merge commit, only if its head is the approved SHA (`--match-head-commit`). GitHub then triggers the Vercel production deployment; there's no terminal deploy.
3. Make one deployment status check for the merge commit. Then run read-only smoke checks signed out:
   - `/api/shows/timeline?artist_id=<uuid>&section=history` returns 401;
   - `/api/proof/summary` and `/api/proof/pdf` return 401;
   - `/app/schedule` redirects to sign-in.
4. Owner device check, read-only: Schedule opens on the next show; Earlier loads; the Dashboard band behaves as expected for the owner's role.

## Post-release smoke checks (read-only)

**Signed out, on setlistr.ai, GET only:**
- `/api/shows/timeline` (history and active), `/api/shows/schedule`, `/api/proof/summary` and `/api/proof/pdf` return 401;
- `/app/schedule`, `/app/proof`, `/app/dashboard` and `/app/submit/<id>` redirect to sign-in.

**Owner on a device, read-only:**
- Schedule opens on the next show; Earlier loads.
- Proof loads, and its PDF exports.
- A submitted show's claim sheet downloads or shares with the right date wording.

Don't create, start, cancel, edit or submit a show.

## Rollback

- **Code:** `git revert -m 1 3ce48335d65fa75ca2792498cb47d060b6f65dbb`, then push to `main`. GitHub → Vercel redeploys `a10b545`'s code. To restore immediately, the owner can promote the previous production deployment in the Vercel dashboard.
- **Data:** nothing to undo. This release changes no schema, no environment and no stored data. Scheduling writes made by users after release (Add, Edit, Cancel, Start) use the routes and database functions already in production.
