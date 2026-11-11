# Privacy candidate tests (local)

- `privacy-prodschema-e2e.js` runs against a separate local Supabase stack loaded with production's `public` schema
  (definitions, constraints and triggers from a schema-only dump; no data; the two webhook triggers removed so nothing
  calls out). 32/32 in `results.privacy-prodschema.txt`:
  - C1–C8: setlist-photo AI permission (server refusal without permission, every entry point, decline, remember, withdraw).
  - D0: account with protected bookings (scheduled for another artist; own scheduled booking) → request accepted in-app,
    sign-in closed, data and files deleted, bookings untouched; the emailed manual step, run as the dashboard's
    non-superuser `postgres` role, then completes the deletion.
  - D1a–D4: first file fails (nothing changed), partial file failure (some deleted, said so), file still present after
    removal, internal request failure, successful retry; deletion across production tables; other artist's records kept.
- `results.tracker-lifecycle.txt`: tracker exclusion regression, 24/24 on the earlier candidate build (disposable stack).
- External services are local stubs: `service-stub-preload.js` (Supabase Storage, Resend) after `scripts/acr-stub-preload.js`;
  `anthropic-stub.js` via `ANTHROPIC_BASE_URL`. No external calls.
