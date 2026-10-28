# Release record: team invitations and admission (PR #6)

- **Released:** 2026-10-28, approved by the owner.
- **Preconditions, checked immediately before the merge:**
  - `main` was `a40fc56c33204267449a321c8d2245346130ccd1`.
  - The PR head was `fbcf76a3c2aa5bc7f5c76302ad20f8bf4f8b6f84`, as approved.
  - No active capture (read-only counts at 14:15 UTC): live or pending shows in the last 6 hours: 0; open capture sessions in the last 6 hours: 0; detections in the last 15 minutes: 0.
- **Pending invitations older than 14 days:** **3** (one read-only count). They show as expired from this release on. Their expiry is accepted by the owner, and nothing was resent.
- **Merge commit:** `039871eef497280ca880e04b48b0182ac21d5963`.
  - Parents: `a40fc56` and `fbcf76a`.
  - The merge was pinned to the approved head, and its tree is identical to `fbcf76a`.
  - It includes the R&D Log admin check (`a40fc56`) unchanged.
- **Deployment:** GitHub → Vercel Production, deployment 7387861399, "Deployment has completed". https://vercel.com/jesse-slacks-projects/setlistr-app/7yDSitaaPMe496dqXGKMVJtGUVDd
- **Signed-out smoke checks (setlistr.ai):**

  | Check | Result |
  |---|---|
  | `POST /api/team/accept/code` | 401 (new route live) |
  | `POST /api/team/accept` | 401 |
  | `POST /api/team/request` | 401 |
  | `POST /api/rd-log/structure` (empty body) | 401 |
  | `/app/accept-invite?token=…` | 307 to `/auth/login?next=…` with the destination kept |
  | `/auth/login` | 200 |
  | `/` | 200 |
- **No SQL or settings change.** The code-only Magic Link template applied on 2026-10-28 is unchanged.
- **Verified:** delivery and visuals of the code email (owner, 2026-10-28).
- **Not yet verified:** SPF/DKIM/DMARC headers, and a real acceptance (the controlled check below needs a second address the owner chooses).

## Rollback

```
git checkout -b revert/team-invite-admission origin/main
git revert -m 1 039871eef497280ca880e04b48b0182ac21d5963
git push -u origin revert/team-invite-admission
```

Then open and merge a PR.

A rollback keeps:
- memberships accepted under the new flow (people without beta approval would see `/beta`);
- links issued by Resend, which stay valid, while old links stay invalid;
- the `product_events` attempt rows, which are harmless.

The code-only template can stay, or be restored exactly from the secure backup on separate approval. Reverting also keeps the R&D Log fix, because it's in `a40fc56`, which the revert doesn't touch.
