# Proof of Performance: release handoff

## Release (2026-10-22)

- **Approved candidate:** `cb836d7efd99cebfc64d003971c6e1512c8d26fa` (`feature/proof-of-performance`), released with the owner's explicit approval while no show was running.
- **Before the merge:**
  - `main` was `3e955c29fdb7f22556002b26e7ef16e2c443142e` (unchanged) and the candidate SHA was unchanged.
  - The claim-sheet candidate `fix/claim-sheet-content` at `24fe8c1` stays separate and unmerged.
- **Merged:** PR #2, as merge commit `a10b5456e3f54df01345a3b1acd91ae5e7797468` (parents `3e955c2` and `cb836d7`). Its tree is identical to `cb836d7`, so production runs exactly the approved code.
- **Deployment:** GitHub → Vercel production, triggered by the merge. No direct deploy.
- **Not included:**
  - no production SQL; the proposal SQL under `supabase/proposals/` stays unapplied;
  - no environment or credential changes;
  - no photo storage, historical cleanup, or changes to identify, capture or save.

## What shipped

- `/app/proof`: the approved record page.
- `/api/proof/summary`: one authorised summary for the page and the PDF.
- `/api/proof/pdf`: the approved PDF.
  - Server-only `@react-pdf/renderer` 4.9.0.
  - The fonts (Open Font License), the logo and pdfkit's built-in font data are traced with the route.
  - Export needs edit permission for the workspace; Viewers can only view.
- **Provenance:**
  - "Entered by hand" needs every kept song to be recorded as `manual`.
  - Unresolved `planned` rows are on the plan only and are excluded from every count; planned songs marked played (stored `manual`) count.
  - **Copied (`cloned`) songs retained in a confirmed review still count as song performances, but establish no provenance**: they read as "method not recorded". This corrects the pre-release summary, which wrongly said copied setlists were excluded from counts; the code was always as described here.
- **Photo:**
  - Only the artist's own uploads are embedded. WebP, AVIF, GIF and TIFF are converted to JPEG; HEIC is reported as unsupported because the installed sharp can't decode it.
  - The reason a photo is omitted is shown in the app under Export, never in the PDF.
- **Places:** evidence-based matching in `lib/proof/place.ts`, used by Proof only.
  - Stated states and provinces are used.
  - Ambiguous two-letter codes (CA, TN…) are settled only by lookup evidence.
  - Conflicts and missing context stay unresolved; stored data is never overridden.
  - Explicit countries, states and coordinates count the same when lookups fail. A bare ambiguous code's country waits for a lookup.

## Rollback

1. Revert the merge commit on `main`, then push. GitHub → Vercel redeploys the previous code:
   ```
   git fetch origin && git switch main && git pull --ff-only
   git revert -m 1 a10b5456e3f54df01345a3b1acd91ae5e7797468
   git push origin main
   ```
2. There's nothing else to undo: no migrations, no stored-data changes, no environment changes. The new routes simply disappear with the revert.
3. To restore immediately while the revert builds, use Vercel's dashboard to promote the previous production deployment (`3e955c2`) again. This is a dashboard action by the owner, not a terminal deploy.

## After release

- **Production confirmed live (2026-10-22).**
  - The production deployment for `a10b545` succeeded.
  - Signed out, `/api/proof/summary` and `/api/proof/pdf` return 401 on setlistr.ai; before the merge they returned 404.
  - `main` had no later commits.
- **Owner's installed-app confirmation (2026-10-22):** "The installed-app Proof export works."
  - This is recorded exactly as stated.
  - It doesn't establish a separate test of dismissing the share sheet, of Save to Files specifically, or of the fallback paths ("can't save", share failure). Those remain covered only by the Chromium and WebKit simulations.
- **Known limitations:**
  - iPhone HEIC profile images aren't included in the PDF; the app says so after export.
  - Shows whose city lacks a state, or whose country is missing or conflicting, stay unmapped and are counted in the coverage line.
- **Separate, not started:**
  - custom record-photo storage (`docs/proof-record-photo-proposal.md`; SQL unapplied);
  - the historical data audit (`docs/proof-data-audit-proposal.md`; read-only, not run).
