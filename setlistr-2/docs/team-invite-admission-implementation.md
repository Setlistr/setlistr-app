# Team invitation and admission: implementation candidate

Branch `feature/team-invite-admission`, from production `577dd3d`. Implements the approved scope in `docs/team-invite-admission-validation.md` §5 (branch `docs/overhaul-roadmap`).

**Changes:**
- **No SQL, migration or environment change.**
- Not released.
- Tested only on the disposable stack: Supabase Auth with a local mail catcher (Mailpit) and local mocks. **No email went to anyone real, and nothing ran against production.**

## What changed

| Area | Change |
|---|---|
| `POST /api/team/accept/code` (new) | Emails a 6-digit code to the signed-in account's **own** address. It sends only when that address is the invite's address and the invite is pending, unexpired and addressed to this account. `shouldCreateUser: false`. |
| `POST /api/team/accept` | Order of checks: (1) identity; (2) accepted by this caller → success with no code; (3) expired; (4) the code is verified by Supabase Auth for the session email and must return the caller's own account; (5) one guarded write. **The beta-approval precondition is removed.** |
| `GET /api/team/accept` | Adds `expired`, `email_mismatch`, and the masked address (recipient only). |
| `POST /api/team/invite` | Resending rotates the token and sets `invited_at = now()` (the old link stops working). Inviting into **one's own** workspace now also needs full admission. |
| `POST /api/team/request` | Requires full admission. |
| `POST /api/profile/update` | Setting a non-empty `artist_name` requires full admission. Other fields, and clearing it, are unchanged. |
| `middleware.ts`, `lib/teamAdmission.ts` | Any signed-in user may open `/app/accept-invite`. An accepted, unrevoked membership gives a **live, uncached, fail-closed** workspace-only state with a page allowlist. Anything else goes to `/app/manager`; `/beta` and `/` go to the app. An older pending-invite cookie still resumes the accept page once. |
| Accept screen | One "Confirm it's you" step: Send code → code field → Accept. Code errors appear inline. Separate screens for "Invitation expired" and "Different email address". |
| Team page | A pending invite older than 14 days reads **Expired**; Resend reloads the list, so Copy Link gives the new link. |
| Preview lock | On Preview deployments, which run against production data, invite/resend, code emails and acceptance writes all return 403 `preview_disabled`. It fails closed by host, like spreadsheet import. |
| `scripts/test-team-lifecycle.ts`, `scripts/test-invite-http-integration.ts` | Updated to the inbox-code flow, reading codes from the local mail catcher. |

## The four implementation details

1. **Temporary session cleanup.**
   - Verification runs on a client that keeps no session.
   - Its session is revoked at once with `admin.signOut(<that session's access token>, 'local')`, which ends that one session only. Global sign-out is never used.
   - **Shown:** the account's session count was the same before and after acceptance (2 → 2), and three other sessions kept working:

     | Session | Still signed in after acceptance |
     |---|---|
     | The caller's browser session | Its next API call returned 200 |
     | A separate "other device" session | `getUser` and refresh both succeeded |
     | A new password sign-in | Worked |
2. **Throttling and bounded attempts.** Supabase Auth's 60-second resend throttle is kept and passed through as "Wait a minute". Supabase can't bound wrong guesses per account here, because every check comes from the app server's IP, so the app adds its own bounds:
   - **5 sends and 10 code checks per account per rolling hour.**
   - The count is insert-then-count in the existing `product_events` table, so concurrent requests can't all slip under the limit.
   - Codes and tokens are never logged; the server log was searched for every token and code used in the run, with none found.
3. **Re-checks inside the write.**
   - The accepting `UPDATE` matches `id`, the presented `invite_token`, `invited_email`, the recipient binding, pending, not declined, not revoked, and `invited_at` within 14 days.
   - **Shown with a real row lock:** a resend, revoke or expiry committed while an accept was in flight was refused, and the invite was not accepted.
4. **Artist identity grants nothing.**
   - Workspace-only admission ignores `artist_name`.
   - The restricted actions check full admission explicitly: requests to manage other artists, invites into one's own workspace, and artist setup.
   - Existing artist names are never cleared.
   - Independently authorized access is untouched: assigned roles, a team-only manager inviting into the managed artist's workspace, and existing members' accepted memberships whatever their age.

## Test results (disposable stack, production code plus this branch)

| Suite | Result |
|---|---|
| `invite-accept.js`: inbox code, sessions, repeat acceptance, allowlist, full-admission actions, no exemptions, identity before "accepted", expiry and resend, races, attempt bounds, revocation, screens, logs | **65/65** |
| `burst.js`: 15 concurrent wrong codes on a fresh account | **10 checked, 5 refused** by the app's limit |
| `preview-lock.js`: the same build with the Preview lock on | invite, resend, code and accept all 403; **0 emails**; no row changed |
| `scripts/test-team-lifecycle.ts`, updated | **127 passed, 0 failed** |
| `scripts/test-invite-http-integration.ts`, updated | **47 passed, 0 failed** (one expectation changed: a replayed accepted token now gets 403, not a false "accepted") |
| `scripts/test-team-route-revocation-parity.ts` | **61 passed, 0 failed** |
| `npx tsc --noEmit` | passes |

In the full `invite-accept.js` run, 3 of the burst's refusals came from Supabase Auth's own **per-IP verification limit** (disposable config: 30). Every check comes from the app server's IP, which is why production's limit matters (see below).

Screens (390 px):
- `1-accept-before-code.jpg`
- `2-code-sent.jpg`
- `3-wrong-code.jpg` (shows a deliberately wrong code)
- `4-accepted.jpg`
- `5-expired.jpg`
- `6-team-expired.jpg`

## Email-configuration dependency (release blocker until confirmed)

Acceptance now depends on Supabase Auth's **Magic Link** email reaching the invitee **as a code**. **Nothing was inspected or changed in production.** Reading the production auth/SMTP configuration needs the Management API's auth-config endpoint, which also returns credentials, and no existing approval covers it. **Unknown, to confirm read-only in the Supabase dashboard:**

1. **Magic Link template:** does it contain `{{ .Token }}`, and is it code-only? Supabase's default has only a link, and **with the default nobody could accept an invitation.** If it needs changing, that's a template change needing approval.
2. **SMTP:** custom SMTP on or off; host and sender (not credentials). The built-in sender is for testing only and may not reach real invitees.
3. **Rate limits:**
   - emails per hour;
   - OTP sends;
   - **token verifications per IP.** All code checks come from Vercel's server IPs.
4. **Email provider:** OTP expiry (600 s recommended) and length (6; the app expects 6 digits). "Confirm email" is off and should stay off.
5. **SPF and DKIM** for the sender domain, if custom SMTP is used.

If Supabase delivery is insufficient, the alternative (still unapproved, not built) is `generateLink` plus Resend, as described in the validation doc §4.

## Preview review

- Pushing this branch builds a Vercel Preview against **production data**.
- The Preview lock refuses inviting, resending, sending codes and accepting there, so the accept screen and Team page can be looked at but **not exercised**: "Send code" shows "Invitations are turned off on Preview deployments."
- To see the flow working, use the screenshots above. Testing goes through the disposable stack.

## Known limits and notes

- **Attempt counter can be inflated, never bypassed:** `product_events` accepts inserts from the account itself or its own delegates. Either could inflate that account's counter and lock its code entry for an hour. That gains no access.
- **Profile trigger missing on the disposable stack:** its auth schema has no signup trigger, so the profile row comes from the `/app` layout. The harness opens the accept page first, as the real flow does.
- **Existing API-wide gaps for any signed-in account are unchanged:** direct database writes to one's own `profiles.artist_name`, and own-workspace performance inserts. Neither grants pages, invites or requests any more.
- **Unreachable copy:** `/beta`'s "approval required before you can accept" invitation copy can no longer be reached and is left as is.
- **Rollback** before any membership is accepted under the new flow: revert the merge. After that, memberships accepted by unadmitted people persist, but the old middleware would send those people to `/beta`, and they couldn't use them until approved.
