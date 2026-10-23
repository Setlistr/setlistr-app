# Combined release review: Schedule, Dashboard Viewer link, claim-sheet content

**Status:** prepared for release review only. This is not production approval. Production is `a10b545`.

The branch `release/combined-review` comes from `main` `a10b545`, with one `--no-ff` merge per candidate. The original branches are preserved and unchanged.

| Candidate | Source | What it changes |
|---|---|---|
| Claim-sheet content | `96aa36a` (`release/claim-sheet-content` = `24fe8c1` + `main`) | One writer credit per MusicBrainz artist (`lib/writer-credits.ts` in enrich-song, upload-identify, upload-reconcile, and the approved identify writer-credit line). The claim sheet's export dates use the page's Due / Working window / Reminder wording (`lib/deadline-wording.ts`). Handoff: `docs/prepare-submit-handoff.md`. |
| Schedule timeline | `c1fea9f` (`feature/schedule-timeline`) | Read-only timeline on `/app/schedule`: capture in progress, next show, upcoming, then history with possible duplicates (`lib/shows/*`, `/api/shows/timeline`, `ScheduleTimeline`). `UpcomingShows` is refactored without behaviour change. Visual design approved at `c1fea9f`. Plan: `docs/schedule-timeline-plan.md`. |
| Dashboard Viewer live link | `6a478bf` (`fix/dashboard-viewer-live-link`) | The Dashboard's "show in progress" band opens live capture only when the role can write; Viewers see plain status. |

No two candidates touch the same file. Each file in the combination is identical to its candidate. The released Proof page, the PDF, `next.config.mjs` and the dependencies are unchanged from `main`.

There's no SQL, migration, environment or dependency change. Capture, recognition, upload and the save handlers are unchanged, apart from the writer-credit assembly approved earlier.

## What this release doesn't do

- **The Schedule timeline** improves navigation and surfaces possible duplicates. It doesn't repair historical records, prevent duplicate ingestion, or change Dashboard, Career, History or Proof counts.
- **The Dashboard fix** hides a link. It doesn't change who may write.

## Known limitations, documented separately

1. **Direct-URL capture page for Viewers.** `/app/live/[id]` has no read-only mode. A Viewer who opens a capture URL directly still sees capture controls.
   - **Disposable-database checks with a real Viewer session:** every capture-page write was refused or matched nothing (performances, performance_songs insert and delete, shows, user_songs insert and update, user_song_performances, setlists, setlist_items), and `/api/identify` returned 403 with no writes.
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

## Rollback

- **Code:** `git revert -m 1 <merge-sha>`, then push to `main`. GitHub → Vercel redeploys `a10b545`'s code. To restore immediately, the owner can promote the previous production deployment in the Vercel dashboard.
- **Data:** nothing to undo. This release changes no schema, no environment and no stored data. Scheduling writes made by users after release (Add, Edit, Cancel, Start) use the routes and database functions already in production.
