# Team invitation and admission: technical validation

*Run 2026-10-26 on the disposable stack, against the production app code (`577dd3d`, built from the identical `f63229d` tree) and Supabase Auth v2.197.0.* No production implementation, SQL, deployment or email to real people.

## Approved product direction (owner, 2026-10-26)

- Owners and managers may invite someone into that artist's workspace **without separate beta approval**.
- This creates **no general beta admission**.
- Invitations **expire after 14 days**. Resending refreshes the invitation **and invalidates its previous link**.
- Expiry never removes an **already-accepted** membership.

**Test harnesses** (in [team-invite-admission/](team-invite-admission/)):
- `otp-spike.js`, `otp-replace.js` and `genlink.js`: inbox proof;
- `boundaries.js`: access boundaries and invitations.

**Disposable setup:** a local mail catcher (Mailpit). The disposable auth container was recreated with SMTP pointed at it, and a code-only email template was served locally. All of this is local, and nothing else changed.

## 1. Inbox proof

| Check | Result |
|---|---|
| With "Confirm email" off (as in production), sign-up signs in immediately and **stamps `email_confirmed_at` without sending any email** | Confirmed. **`email_confirmed_at` is not proof of inbox ownership.** |
| `signInWithOtp({ shouldCreateUser: false })` to an address with no account | Refused (422 "Signups not allowed for otp"). **No account created, no email sent.** |
| Code sent to an existing account | Arrives. 6 digits, as configured. |
| **Supabase's default sign-in template contains only a link, no code** | Confirmed. A code-only template had to be served to test the code path. Clicking a link would use up the code and land on the Site URL, losing the invite page. **The production template must be code-only.** |
| A second request within 60 seconds | 429, "only request this after 59 seconds" |
| A wrong code, another account's code, a reused code, or a code past expiry | All rejected (403) |
| An earlier code after a newer one was sent | Rejected: a new code cancels the old one |
| A correct code, verified **by the auth server** | Valid for the same account id. The email address is unchanged and no identity was added. |
| The session that verification creates | Revocable straight away (`admin.signOut(…, 'local')`); its refresh then fails. The person's own session is unaffected. |
| Claims (`getClaims`, signature-checked against the stack's ES256 keys) | `amr` shows `otp` after code sign-in and `password` after password sign-in. **`amr` keeps the original method through token refreshes**, so it describes how a session *started*, not a fresh check. |
| `admin.generateLink({ type: 'magiclink' })` | Returns a 6-digit code to the server **without sending email**, and the code verifies. **For an address with no account it creates one,** so it must only ever be called for the signed-in account's own address. |

**Decision: the server verifies the code itself, during the accept request.**
- `POST /api/team/accept` takes `{ token, code }` and calls Supabase's `verifyOtp({ email, token: code, type: 'email' })` from the server, using a client that keeps no session.
- `email` comes from the server-verified session (`auth.getUser()`), never from the request.
- Acceptance proceeds only if the auth server accepts the code **and** the account it returns is the caller's own.
- The temporary session the check creates is revoked at once.
- **Freshness** comes from the auth server: the code's expiry window, single use, and cancellation by any newer code.
- Nothing relies on client state, a decoded JWT, or `amr`.

**No exemptions.** Production has no reliable record that an account's email ownership was ever verified:
- `email_confirmed_at` is set without proof;
- `amr` describes only how the current session started;
- Setlistr stores no verification of its own.

So **every acceptance needs a fresh code**: existing accounts and new ones, admitted or not, and invites to an existing account or to an address. A later option would record Setlistr's own "inbox verified at" after a successful code, which would allow future exemptions. It needs a migration and isn't proposed now.

**What the code flow can't do:**
- **Create accounts:** sending uses `shouldCreateUser: false`, and `generateLink` is never called for anything but the session's own address.
- **Change the invited address:** a code is sent only when the session's email equals the invite's `invited_email`.
- **Lose the destination:** the code is typed on the accept page itself, the email has no link, and the token stays in the URL.

## 2. Access boundaries

**API inventory** (55 route files on `main`). Middleware covers pages only; **only `POST /api/team/accept` checks beta admission.** So today every API route is equally available to *any* signed-in account, admitted or not. A team-only account would have exactly the API reach an unadmitted account already has. The only difference is that its accepted membership opens the invited artist's data, as intended.

| Group | Routes | Authorisation (checked live on each request) |
|---|---|---|
| Admin and publisher | `admin/*`, `publisher/*`, `rd-log` (GET/POST) | `ADMIN_EMAILS` → 403 (tested) |
| Workspace data | `shows/timeline`, `shows/schedule*`, `shows/import*`, `proof/*`, `song-debuts`, `performance-songs`, `performances/[id]/delete*`, `team/context-data`, `team/managed-artists` | `authoriseProof`, `can_act_for`/`can_write_for`, or role checks on the server |
| Capture and upload | `upload-performance`, `upload-recognize`, `upload-reconcile`, `upload-identify`, `identify` | Ownership or write-role checks on the server |
| Team | `team/invite` (owner or manager), `team/delegates` (owner), `team/respond`, `team/accept` | Identity and role checks |
| Own account | `profile/update` (self only), `team/request` (any signed-in account), `account/delete` (self), `recent-songs`, `parse-setlist`, `spotify-import`, `setlistfm` | Session only |
| Webhooks | `notion-sync`, `weekly-digest`, `email-sync`, `transcript-sync` | Shared secret |
| Public lookups | `bandsintown`, `ticketmaster`, `lastfm`, `spotify-search`, `enrich-song` | None (read-only third-party lookups) |
| **Unauthenticated, costly** | **`rd-log/structure`** | **None: it calls Anthropic for any caller.** An existing exposure outside this slice, needing its own decision. |

**Direct requests, as a team-only tour manager and as a plain unadmitted account** (all `ok` unless noted):

| Request | Team-only | Plain | Meaning |
|---|---|---|---|
| Any `/app` page | `/beta` | `/beta` | Today's only beta gate |
| **Artist setup:** `POST /api/profile/update {artist_name}` (self) | 200 | 200 | **Existing gap:** any account can create an artist identity through the API. It's also possible straight through the database API (`profiles_self` allows all on one's own row). |
| **Request to manage another artist:** `POST /api/team/request` | 200 (request created) | 200 | **Existing gap:** no admission check |
| Another artist's data: timeline, proof, the database API, upload, `start_scheduled_show` | 403 / 0 rows / 403 / NOT_AUTHORIZED | same | Enforced |
| Another artist's `GET /api/shows/schedule` | 200 with 0 shows | same | No leak: row-level security returns nothing. A 403 would be more consistent, but that's not needed here. |
| Admin, publisher, R&D log; inviting as a tour manager; removing a member | 403 | 403 | Enforced |
| Assigned role (tour manager for Lena): timeline, schedule, upload | 200 | n/a | Role kept |
| **Revocation**, same session, no reload: timeline, the database API, upload, `start_scheduled_show`, accept GET and POST | 403 / 0 rows / 403 / NOT_AUTHORIZED / 404 / 404 | n/a | **Takes effect on the very next request.** No API-level cache exists. |

**The minimum extra enforcement needed**, so that team admission can't become general access:
1. **Middleware's "team" state is checked live on every page request**, by account id:
   - an accepted, unrevoked membership exists, **and**
   - the account has **no artist identity of its own** (`profiles.artist_name` empty).

   An account that gives itself an artist name through the API (an existing gap) therefore loses team admission and falls back to `/beta`. Artist setup can't be used to escape the scope, however it's done. The check fails closed, and there's no cache.
2. **A page allowlist** for team-admitted accounts. Anything else, including `/app/onboarding`, redirects to `/app/manager`.
3. **`POST /api/team/request` requires full admission** (`checkBetaAdmission`, as accept uses today). Requests create rows that other artists see, and the database API can't insert team rows (privileges were revoked in 0010), so this route is the only way in.
4. **`POST /api/team/accept` checks identity before the "already accepted" response.** Today *any* admitted account holding the token of an already-accepted invite gets `200 { already_accepted: true }`. Tested: it grants no access (403 on the workspace), but it falsely reports success. **Fix:** "already accepted" only for the bound account with an unrevoked membership; everyone else gets "different account."

Everything else (the other artists' data, admin and privileged routes, role limits, revocation) is already enforced on every request and needs no change. The existing API-wide gaps (artist setup and own-workspace capture through the API, `team/request`, `rd-log/structure`) predate this feature and affect every signed-in account. Apart from items 1 and 3, they're listed for a separate decision, not fixed here.

## 3. Invitations

| Case | Today (tested) | Required by the approved direction |
|---|---|---|
| **Resending a pending invite** | **Reuses the same token**; the old link keeps working | Rotate to a new token and set `invited_at = now()`, in one guarded update on the pending row. Tested by rotating directly: the old token gets 404 and the new one works. |
| **Expiry** | None | Accept and send-code refuse pending invites older than 14 days. This is checked inside the guarded update itself (`invited_at > now() - 14 days`), not just read beforehand. |
| **An accepted membership whose invite is 30 days old** | Still works (200) | Unchanged: expiry is only checked on *pending* invites. `can_act_for`/`can_write_for` never look at `invited_at`. |
| **Revoked** | GET and POST return 404 "no longer valid," even for an admitted account | Unchanged |
| **Three concurrent accepts** by the recipient | All 200, one row, accepted once | Unchanged. The guarded update **also matches `invite_token`**, so a resend racing an accept can't be accepted through the superseded link. |
| **Repeat acceptance** by the recipient | 200 `already_accepted` | Returns the existing membership only if it's bound to the caller and unrevoked (needs no new code) |
| **Someone else, with the token of an accepted invite** | **200 `already_accepted` (wrong)**; grants nothing | "Different account" (section 2, item 4) |
| A manager's request | Never acceptable here | Unchanged |

Invite tokens are already unique-indexed, and `invited_at` already exists, so **no SQL is needed.**

## 4. Email delivery: production settings to confirm (read-only, in the Supabase dashboard)

Don't change any of these, or any credential, without separate approval.

1. **Authentication → SMTP settings:**
   - **Is custom SMTP enabled?** Note the host and sender address, not credentials.
   - If production uses **Supabase's built-in sender**, it's meant for testing: it has a low hourly limit and may deliver only to the project team's own addresses. **That would be insufficient for real invitees.**
   - Whether password-reset emails reach non-team addresses today is a quick indicator.
2. **Authentication → Rate limits:** emails sent per hour; the OTP-send and verification limits. Codes would be verified from the server, and Vercel functions share IP addresses, so check the per-IP verification limit against expected volume (low: team invites only).
3. **Authentication → Email templates → Magic Link:**
   - whether it contains `{{ .Token }}`;
   - **it must be code-only** (no link), with a clear subject such as "Your Setlistr code".

   The app sends no magic-link emails today; password reset and confirmation use their own templates. So this template has no other users to affect.
4. **Authentication → Providers → Email:**
   - **OTP expiry** (recommended: 600 seconds);
   - **OTP length** (6);
   - **"Confirm email"**: record the value and leave it off.
5. **Sender domain authentication** (SPF and DKIM) for the custom SMTP sender, if there is one: deliverability.

**If Supabase's delivery isn't sufficient, here is the alternative, for approval; it's not introduced:**
- The server calls `admin.generateLink({ type: 'magiclink', email: <the session's own email> })`, which returns the code without Supabase sending anything.
- Setlistr emails the code through **Resend**, the provider the invite emails already use.
- Supabase still verifies the code exactly as above. **No migration.**
- **Trade-offs:**
  - Setlistr's server briefly handles the code;
  - Resend becomes part of sign-in security;
  - the function must never be called for any address but the session's own, because it would create an account.

## 5. Implementation-ready scope (awaiting approval)

No SQL, migration or environment change, apart from confirming or adjusting the email settings in section 4 under their own approval.

1. **`app/api/team/accept/code/route.ts` (new), POST `{ token }`:** the session must be the invite's recipient:
   - the invite is pending, not revoked, a real invite (not a manager request), and no more than 14 days old;
   - its recipient is the session (`delegate_id = user.id`, or a placeholder whose `lower(invited_email)` equals `lower(user.email)`);
   - **and** `lower(user.email) = lower(invited_email)`.

   It sends the code to `user.email` with `shouldCreateUser: false`. Responses: a masked address (`j•••@domain`); a 429 passed through as "Wait a minute before asking for another code"; anything else is a generic refusal.
2. **`app/api/team/accept/route.ts`:**
   - **GET** adds `expired`, and returns the masked recipient address to the intended recipient only.
   - **POST** takes `{ token, code }`:
     1. Identity first (fixes the false "already accepted").
     2. Already accepted and bound to the caller, and unrevoked → success with no code.
     3. Expired → "This invitation has expired. Ask {artist} to send it again."
     4. The server verifies the code; the returned id must equal `user.id`; the temporary session is revoked.
     5. A guarded update: id + `invite_token` + pending + not revoked + `invited_at` within 14 days. It's idempotent under concurrency, as today.
   - **The beta admission precondition is removed from acceptance;** inbox proof replaces it.
3. **`middleware.ts`:**
   - Signed-in but unadmitted users may load `/app/accept-invite`. The page and API enforce everything.
   - The live **team** state (section 2, items 1–2), with the allowlist enumerated from the real route list: Dashboard, Manager, Team, Schedule (with import), New show, Upload, Live, Review, Submit, History, Stats, Career, Proof, Artist and Settings. `/app/onboarding`, admin pages and unlinked legacy routes are excluded.
   - It's never cached; any error falls back to `/beta`.
4. **`app/api/team/request/route.ts`:** POST requires `checkBetaAdmission === 'admitted'`.
5. **`app/api/team/invite/route.ts`:** resending a pending invite (bound or placeholder, expired or not) rotates the token and refreshes `invited_at` in one guarded update, then emails the new link. Copy Invite Link then gives the new link.
6. **UI, using existing components and the existing accept screen, with one short step:**
   - **Accept screen:** under the role card, "Confirm it's you. We'll email a 6-digit code to j•••@domain." A **Send code** button, then one code field (`inputMode="numeric"`, `autoComplete="one-time-code"`), then the existing **Accept** button. Errors show inline: "That code didn't work. Check it or send a new one."
   - **Expired invite:** "This invitation has expired. Ask {artist} to send it again."
   - **Team page:** a pending invite older than 14 days reads "Expired" and offers **Resend**.
   - Nothing else changes.
7. **Tests (disposable stack, with Mailpit):**
   - extend `scripts/test-team-lifecycle.ts` and `boundaries.js` to cover the proposal's acceptance criteria plus:
     - no exemption without a code;
     - resend invalidates the old link;
     - a resend racing an accept;
     - expiry versus an accepted membership;
     - an artist name set through the API voids team admission;
     - `team/request` returns 403 for team-only accounts;
     - another account reusing an accepted invite's token sees "different account";
   - `npx tsc --noEmit`.

**Separate decisions, outside this slice:**
- the unauthenticated `rd-log/structure` route;
- `DELETE /api/team/delegates` returning 200 when no row matched;
- the existing API-wide gaps for unadmitted accounts (artist setup and own-workspace capture through the API).
