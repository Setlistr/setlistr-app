# `POST /api/rd-log/structure`: admin-only

**Problem** (docs/api-auth-audit.md, item 5): the route called Anthropic for any caller, signed in or not. It exposed no data, but anyone could run up paid model usage.

**Legitimate caller:** one. The **Structure** button in the R&D Log (`app/app/admin/rd-log/RdLogView.tsx`). That page is admin-only (`ADMIN_EMAILS`), and so are its sibling routes (`GET/POST /api/rd-log`). No other code, script or webhook calls it.

**Fix:** the same rule as the page and its siblings:
- the server checks a signed-in session whose email is in `ADMIN_EMAILS`;
- the check runs **before** the body is read and before any Anthropic call;
- signed out → 401; signed in but not an admin → 403.

There's no per-resource check, because the route reads and writes no data. Its output only reaches an admin's own form until they save it through `POST /api/rd-log`, which is already admin-only.

## Test (disposable stack, Anthropic replaced by a local mock that counts calls)

`rdlog-auth.js` with `mock_anthropic.py`; results in `rdlog-auth-results.json`. The app is run with `ANTHROPIC_BASE_URL` pointing at the mock, so no real provider call is possible.

| Caller | `main` (577dd3d) | This branch |
|---|---|---|
| Signed out | 200, **1 provider call** | **401, 0 calls** |
| Signed in, not an admin | 200, **1 provider call** | **403, 0 calls** |
| Admin (the R&D Log user) | 200, 1 call | 200, 1 call |
| Admin opens `/app/admin/rd-log` | loads | loads |

The admin account was a temporary local account, deleted afterwards. `npx tsc --noEmit` passes.

## Release recommendation

- Release on its own, independent of the team-invite work: one file, no SQL, no environment change.
- Low risk:
  - the only caller already requires an admin session to see the button;
  - admins see no change;
  - rollback is a revert of the one commit.
- After release, a read-only smoke check: `POST` while signed out returns 401. It must not be run signed in as an admin, which would make a real paid call.
