# Release record: Tonight's show, one tap (PR #7)

This file: `setlistr-2/docs/tonight-show-one-tap.RELEASED.md`, on branch `docs/overhaul-roadmap`.

- **Released:** 2026-10-28 (2026-10-29 UTC), approved by the owner.
- **Preconditions, checked immediately before the merge:**
  - `main` was `039871eef497280ca880e04b48b0182ac21d5963`.
  - The candidate head was `e4b324743058a6739f902ecc58bb96d0987ad4ab`, as approved.
  - No active capture (read-only counts at 00:13 UTC): live or pending shows in the last 6 hours: 0; open capture sessions: 0; detections in the last 15 minutes: 0.
- **Merge commit:** `21d2b63b3caedf1b95fa963796e97a13a2dabaac`.
  - Parents: `039871e` and `e4b3247`.
  - Pinned to the approved head; its tree is identical to `e4b3247`.
- **Deployment:** GitHub → Vercel Production, deployment 7400562522, "Deployment has completed". https://vercel.com/jesse-slacks-projects/setlistr-app/5XXf8R6TUMvFrf1X7zcWLHaUZnWV
- **Signed-out smoke checks:**
  - `POST /api/shows/schedule/<id>/start` returns **401** on `setlistr.ai` and `www.setlistr.ai`. That's a 401, not the Preview lock's 403, so the production hosts aren't locked.
  - `/auth/login` returns 200; `/` returns 200.
- **No SQL, environment change, production fixtures or test captures.**
- **Installed-app confirmation:** pending the owner's device check (below).

## Rollback

```
git checkout -b revert/tonight-show-one-tap origin/main
git revert -m 1 21d2b63b3caedf1b95fa963796e97a13a2dabaac
git push -u origin revert/tonight-show-one-tap
```

Then open and merge a PR.

**What persists:**
- captures started through the new entries stay correctly linked to their bookings;
- the `scheduled_start` telemetry rows stay and are harmless.

A revert also restores Schedule's Start on Preview hosts, which this release locked.

## Installed-app check (owner)

1. Open the installed app in a workspace with a show booked for today. The Dashboard shows "Scheduled · Today" with the venue, and Coming up doesn't repeat it.
2. Tap the row. The system confirmation names the artist, venue, date, time and zone. Tap **Cancel**: nothing happens.
3. Tap the gold button. The same show leads. Tap **A different show**: today's screen opens. Go back without starting.

Start capture only for an actual performance.
