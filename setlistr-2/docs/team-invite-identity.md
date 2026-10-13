# Team invitation identity — security model and open decision (R2)

Status: R1 implemented on `investigate/team-page`. **R2 is an open decision — not implemented.**

## Production configuration this assumes

Supabase Auth email/password provider enabled, **"Confirm email" OFF** (confirmed from the
dashboard). Signup does not verify inbox ownership: a session's `email` is whatever was typed at
signup, and `email_confirmed_at` is set without proof. Nothing here may treat a session email,
or `email_confirmed_at`, as proof that the user controls that inbox.

## What R1 does — restores token-possession security

R1 does **not** verify inbox ownership. It restores the invariant that an invite can only be
accepted by someone who **possesses the invite token**:

- A token reaches a browser only if that browser presented it (opened
  `/app/accept-invite?token=…`, or carries the `sl_pending_team_invite` cookie saved when it
  did), or if it was delivered to the invited inbox (the invite email, the approval email).
- No path discloses a token **or invitation details** (inviting artist, role) based on an email
  match alone. Removed: middleware's email-lookup fallback (unadmitted cookie seeding, and the
  approved `/beta` resume), and `/beta`'s email-matched "invitation saved" details.
- The pending-invite cookie is navigation context, never authorization: `/beta` re-validates it
  against the current invite state and the authenticated recipient before showing anything, and
  `POST /api/team/accept` re-validates everything.
- Cross-device recovery means reopening the inbox-delivered link. An approved user with no
  cookie lands on the dashboard, not on someone's invite.
- The approval email (`app/api/admin/beta-invite`) still finds the pending invite by email.
  That is permitted because the link is delivered **to that inbox**, not to a session.

Also (approval option A): `POST /api/team/accept` enforces Setlistr admission server-side
(`lib/betaAdmission.ts`: admins, or a `beta_invites` row; a live lookup that fails closed). Note
that approval is granted per email address, so it is **not** identity proof either.

## What the token protects, after R1

| Invite type | Acceptance requires |
|---|---|
| To an existing account (`delegate_id` bound at invite time) | That account's session + token + admission |
| To an email with no account yet (placeholder, `delegate_id = null`) | Token + a session whose (self-typed) email matches `invited_email` + admission |

**Residual risk (why R2 exists):** for a placeholder invite, anyone who obtains the link (a
forwarded email, or the owner sharing it via **Copy Invite Link**) and knows the invited address
can sign up with that address and claim the invite. The email match adds little, because it is
self-asserted. The token is effectively a bearer link, single-use (binding is atomic) and
replaced on re-invite.

Related: an account created by someone else for the invitee's address before the invite was
sent receives a bound (existing-account) invite. They still need the token to accept, and the
real owner can recover the account through a password reset to the inbox.

## R2 options — separate decision, needs a reviewed rollout

1. **Inbox proof at placeholder binding (targeted).** Before binding a placeholder, require a
   one-time code or magic link sent to `invited_email`, and bind only a session proven against
   it. This closes the residual for the one path that relies on a self-asserted email, and
   leaves existing accounts and global signup untouched. Costs: an extra step for new
   recipients, email delivery and rate limits, and implementation work.
2. **Turn on "Confirm email" globally.** A production auth setting change with a separate
   rollout. It doesn't retroactively prove accounts created while it was off, and it changes
   every signup.
3. **Accept the residual for the beta,** treating invite links as bearer links: tell owners
   that a copied link grants the invite, and prefer the emailed invite over Copy Invite Link.

Not decided. Do not enable confirmation or change production auth settings without a reviewed
rollout.

Regression coverage: `scripts/test-team-lifecycle.ts` (sections G and H).
