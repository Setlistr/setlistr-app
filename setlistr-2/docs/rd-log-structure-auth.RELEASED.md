# Release record: R&D Log admin check (PR #5)

- **Released:** 2026-10-27, approved by the owner.
- **Preconditions, checked immediately before the merge:**
  - `main` was `577dd3dfb35cc26064121666a7a026804e155cb4`; the PR head was `7269a661067b63aaeeaceafcba4616f3adb8d034`.
  - No active capture (read-only counts at 14:50 UTC):
    - live or pending shows in the last 6 hours: 0;
    - open capture sessions in the last 6 hours: 0;
    - detections in the last 15 minutes: 0;
    - last detection: 2026-10-17.
- **Merge commit:** `a40fc56c33204267449a321c8d2245346130ccd1`. Its parents are `577dd3d` and `7269a66`. The merge was pinned to the approved head.
- **Deployment:** GitHub → Vercel Production, deployment 7361760533, "Deployment has completed". https://vercel.com/jesse-slacks-projects/setlistr-app/8cE7Z7fu6e9bV4oMvNaDnD1cPUo8
- **Smoke check:** a signed-out `POST /api/rd-log/structure` with an empty body returned **401** on both `setlistr.ai` and `www.setlistr.ai`.
  - No Anthropic call was possible: the old code also refused an empty body (400) before calling Anthropic.
  - `/auth/login` returns 200.
- **No SQL, no environment change.**

## Rollback

```
git checkout -b revert/rd-log-structure-auth origin/main
git revert -m 1 a40fc56c33204267449a321c8d2245346130ccd1
git push -u origin revert/rd-log-structure-auth
```

Then open a PR and merge it. Reverting restores the unauthenticated, paid-call route, so roll back only if admins lose the Structure button.
