# Team invitation and admission: implementation candidate

Branch `feature/team-invite-admission`, from production `577dd3d`. Implements the approved scope in `docs/team-invite-admission-validation.md` §5 (branch `docs/overhaul-roadmap`).

**Changes:**
- **No SQL, migration or environment change.**
- Not released.
- Tested only on the disposable stack: Supabase Auth with a local mail catcher (Mailpit) and local mocks. **No email went to anyone real, and nothing ran against production.**

## What changed

| Area | Change |
|---|---|
| `POST /api/team/accept/code` (new) | Emails a one-time code to the signed-in account's **own** address. Production issues **8 digits** (`INVITE_CODE_LENGTH` in `lib/teamInviteExpiry.ts`, which must match Supabase's Email OTP length). It sends only when that address is the invite's address and the invite is pending, unexpired and addressed to this account. `shouldCreateUser: false`. |
| `POST /api/team/accept` | Order of checks: (1) identity; (2) accepted by this caller → success with no code; (3) expired; (4) the code is verified by Supabase Auth for the session email and must return the caller's own account; (5) one guarded write. **The beta-approval precondition is removed.** |
| `GET /api/team/accept` | Adds `expired`, `email_mismatch`, and the masked address (recipient only). |
| `POST /api/team/invite` | Resending rotates the token and sets `invited_at = now()` (the old link stops working). Inviting into **one's own** workspace now also needs full admission. |
| `POST /api/team/request` | Requires full admission. |
| `POST /api/profile/update` | Setting a non-empty `artist_name` requires full admission. Other fields, and clearing it, are unchanged. |
| `middleware.ts`, `lib/teamAdmission.ts` | Any signed-in user may open `/app/accept-invite`. An accepted, unrevoked membership gives a **live, uncached, fail-closed** workspace-only state with a page allowlist. Anything else goes to `/app/manager`; `/beta` and `/` go to the app. An older pending-invite cookie still resumes the accept page once. |
| Accept screen | One "Confirm it's you" step ("We'll email an 8-digit code to j•••@domain"): Send code → 8-digit field → Accept. Code errors appear inline. Separate screens for "Invitation expired" and "Different email address". |
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

## Test results (disposable stack, production code plus this branch, **8-digit codes as in production**)

The disposable auth server was reconfigured to production's code length (`GOTRUE_MAILER_OTP_LENGTH=8`) and 3600 s expiry.

| Suite | Result |
|---|---|
| `invite-accept.js`: inbox code (including a 6-digit code refused before an attempt is counted), sessions, repeat acceptance, allowlist, full-admission actions, no exemptions, identity before "accepted", expiry and resend, races, attempt bounds, revocation, screens, logs | **66/66** |
| `race-timing.js`: resend, revoke and expiry each committed while an accept waited on the row lock | refused (410 superseded / 404 / 410 expired); nothing accepted |
| `burst.js`: 15 concurrent wrong codes on fresh accounts (several runs) | 4–10 checked, never more than 10 |
| `preview-lock.js`: the same build with the Preview lock on | invite, resend, code and accept all 403; **0 emails**; no row changed |
| `scripts/test-team-lifecycle.ts` | **127 passed, 0 failed** |
| `scripts/test-invite-http-integration.ts` | **47 passed, 0 failed** |
| `scripts/test-team-route-revocation-parity.ts` | **61 passed, 0 failed** |
| `npx tsc --noEmit` | passes |

**Correction to the earlier record:** some refusals in the concurrent burst were attributed to Supabase's per-IP verification limit. That was wrong: the disposable auth server had no per-IP limiting then, and every refusal came from the app's own limit. Under a simultaneous burst, insert-then-count can refuse **more** than strictly necessary, never fewer: at most 10 are checked. Sequentially the bound is exact; the 11th is refused.

**Test-environment notes:**
- **Mac sleep and Docker clock drift:** the Mac's idle sleep paused the Docker VM (a 341 s gap was measured) and left its clock about 29 s behind the host. Mail is therefore matched by message ID, not timestamp, and runs use `caffeinate`.
- **Race-test lock:** it's held over a direct database connection instead of `docker exec`, which could stall.

Screens (390 px, 8 digits):
- `1-accept-before-code.jpg`
- `2-code-sent.jpg`
- `3-wrong-code.jpg` (a deliberately wrong code)
- `4-accepted.jpg`
- `5-expired.jpg`
- `6-team-expired.jpg`
- `7-proposed-template.jpg` (the proposed email; the code is masked)

## Production email configuration (read-only, 2026-10-27)

Read with one `GET /v1/projects/{ref}/config/auth`, authorized by the owner. It doesn't change settings, send email or touch database roles. Only the non-secret settings below were extracted; the response was neither printed nor stored.

| Setting | Production | Consequence |
|---|---|---|
| Magic Link template | Subject "Your Magic Link", **link only, no `{{ .Token }}`** | **Release blocker.** Needs the code-only template below (approval required). |
| Email OTP length | **8** | The candidate uses 8 (`INVITE_CODE_LENGTH`) |
| Email OTP expiry | 3600 s | Works. The same setting governs recovery links, so leave it alone. |
| SMTP | Custom: `smtp.resend.com:465`, `noreply@setlistr.ai` ("Setlistr"); credentials set | Resend production sender. Public DNS: Resend DKIM (`resend._domainkey`), SPF on `send.setlistr.ai`, DMARC `p=none`. |
| Send-email hook | off | Mail goes via SMTP |
| Limits | emails 30/hour (project-wide); OTP requests 30; verifications 30; resend gap 60 s | see "Shared limits" |
| Confirm email | off (auto-confirm) | unchanged |
| Captcha | off | if turned on later, server-side code sends would need a captcha token |

**Current users of the Magic Link template:**
- **Nothing in the app sends it.** On `main` there's no `signInWithOtp` or `generateLink`.
- Password reset uses the Recovery template. Signup sends nothing (auto-confirm), and nothing sends email-change or invite emails.
- `/auth/confirm` still accepts `type=magiclink` links; with a code-only template that branch is simply unused.
- **Only other possible sender:** a manual "Send magic link" from the Supabase dashboard. That would deliver a code with nowhere to enter it.
- Past sends weren't checked, because that needs a database query, which was ruled out.

## Shared limits (disposable stack set to production's values, plus per-IP limiting)

Supabase limits per IP only when a rate-limit header is configured. Hosted Supabase does key on the caller's address. The disposable stack was set up the same way (`GOTRUE_RATE_LIMIT_HEADER=X-Forwarded-For`); the app server reaches it from one address, as Vercel does.

| Test | Result |
|---|---|
| 35 direct verifications from one address | 30 checked, then 429. A forged forwarding header did not get a fresh allowance. About 1 more allowed per 10 s (a token bucket: burst 30, refilling over 5 minutes). |
| One account, 11 wrong codes in a row, through the app | 10 checked, the 11th refused by the app (exact) |
| Two accounts use 20 checks, then a third account uses 10, then a real recipient submits a correct code | 429, "Too many attempts. Wait a few minutes." **The code stays valid:** the same code was accepted 12 s later. |
| Code sends past the shared per-IP allowance (`over_request_rate_limit`) | the app now says "We can't send more codes right now. Try again in a few minutes." The 60-second per-address throttle still says "Wait a minute". |

**Not established, so not assumed sufficient:**
- **Vercel's outbound addresses:** whether all of the app's server calls share one address, or many, and whether that varies by region or invocation. One shared address is the worst case tested above.
- **Exact production behaviour:** which header hosted Supabase keys on, and the exact refill behaviour, weren't observed in production. They were inferred from the same Supabase Auth release on the disposable stack.
- **Abuse of the shared verification allowance:** three or more accounts entering wrong codes (each capped at 10 per hour by the app) can use up the server's 30 checks. That delays every acceptance by a few minutes and grants nothing. At current invite volume this is low risk, but it isn't prevented.
- **Shared email budget:** the 30 emails per hour is project-wide and shared with password-reset emails. Code sends are capped at 5 per account per hour, so a handful of accounts could use the hour's budget and delay password resets.

## Proposed Magic Link template (not applied; needs approval)

**Subject:** `Your Setlistr code`

**Body:** `magic-link-template.html` in this folder:
- code-only, with `{{ .Token }}` and **no link** of any kind;
- the invite email's styling and logo image.

On the disposable stack, Supabase Auth delivered it with an 8-digit code, no `<a>`/`href`, and no confirmation URL.

**Change, once approved:** Supabase dashboard → Authentication → Email Templates → **Magic Link**. Paste the subject and body, and change nothing else. Then do a read-only check that the template contains `{{ .Token }}` and has no link.

**Rollback:** paste back the current template. It's link-only, subject "Your Magic Link" (105 characters); copy it from the dashboard before changing it.

## One controlled delivery test (plan; not done)

**Preconditions:**
- The template change above is approved and applied.
- Nobody is capturing.
- The address is one the owner controls and that already has a Setlistr account (`shouldCreateUser: false` never creates one).

**Steps:**
1. **Send one code.** Make one `signInWithOtp({ email, options: { shouldCreateUser: false } })` call with the production URL and anon key, from a local one-off script. It sends exactly one email, logs no code, and touches no invitation.
2. **Owner checks the inbox:**
   - it arrives within about a minute, not in spam;
   - from "Setlistr <noreply@setlistr.ai>", subject "Your Setlistr code";
   - one 8-digit code and no link;
   - Gmail → Show original → SPF, DKIM and DMARC all **PASS**.
3. **Don't enter the code anywhere.** It expires unused after 1 hour. Entering it would sign that address in.
4. **Record the result.** If it fails, revert the template; no other setting is involved.

**Cost:** one email out of the project's 30 per hour; one OTP request from one IP. **What it doesn't test:** acceptance itself, which needs the invitation feature released. That remains the post-release check.

## Production template change and delivery test (2026-10-28)

- **Template change, approved by the owner:** the Magic Link subject became `Your Setlistr code` and the body became `magic-link-template.html` exactly, with the trailing newline removed. Nothing else was changed.
  - The previous subject ("Your Magic Link") and its 105-character link-only body were saved first, outside the repository with owner-only permissions, for an exact rollback. Reverting means writing back exactly those two fields.
  - Read back after the change: the subject and body are exact, `{{ .Token }}` is present, and there are no link markers.
- **One test code** was sent at 14:05:31 UTC to the owner's existing account (`create_user: false`); the code wasn't printed or logged.
  - **Passed (owner):** delivery to the inbox, plus sender, subject, logo, an 8-digit code and a code-only layout.
  - **Not verified:** the SPF/DKIM/DMARC headers, and actual invitation acceptance, which needs the release.
- **Unexplained configuration difference, investigated within bounds:**
  - **What happened:** a hash of every auth setting except the two template fields differed between the read just before the write and the one after.
  - **Where it isn't:**
    - every value recorded on 2026-10-27 is unchanged: SMTP, code length and expiry, all rate limits, the hooks, notification flags, captcha, auto-confirm, site URL and redirect list;
    - the other five templates still have the same subject and size;
    - SMTP credentials are still set.
  - **Not a recurring effect:** two plain reads are identical, and re-writing the same two fields changes nothing, so it was a one-time difference caused by the first write.
  - **Why it can't be named:** the 191 remaining fields were never recorded, deliberately, because the full response contains credentials.
  - **Their current state looks like the platform defaults, with nothing unexpected on:**
    - providers: email only;
    - phone, anonymous sign-in, SAML, OAuth server, passkeys and all hooks: off;
    - MFA: TOTP enrol/verify on (a Supabase default);
    - refresh-token rotation: on;
    - minimum password length: 6.
  - **Conclusion:** most likely the platform filling in or rewriting a field on its first save. Unconfirmed, but no change to sign-in, email or security behaviour was found.
  - **Next time:** store per-field hashes, not values, before a write, so any difference can be named without keeping secrets.

## Release candidate

- **Candidate commit:** a merge of `main` `a40fc56` (the released R&D Log admin check) into this branch.
- **The R&D route is identical to `main`.**
- **Invitation code is identical to the tested `b5606c7`**, so the disposable test results above stand.
- **Needs no SQL or environment change.** The production template change above is already in place.

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
