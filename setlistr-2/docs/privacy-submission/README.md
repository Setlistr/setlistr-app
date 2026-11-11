# Privacy candidate tests (local, disposable stack)

- `privacy-e2e.js`: setlist-photo AI permission (C1–C8) and account deletion (D0–D4). 27/27 in `results.privacy.txt`.
- `results.tracker-lifecycle.txt`: tracker exclusion regression on the same build, 24/24.
- External services are local stubs: `service-stub-preload.js` (Supabase Storage, Resend) loaded after `scripts/acr-stub-preload.js`; `anthropic-stub.js` via `ANTHROPIC_BASE_URL`. No external calls.
- The disposable schema lacks some production tables the delete route uses; the run added test-only stand-ins there:
  `attachments`, `songs`, `manual_song_events`, `capture_sessions`, `audio_captures.storage_path`, `detection_events.user_id`,
  and `profiles.id → auth.users ON DELETE CASCADE` (NOT VALID), which production has.
