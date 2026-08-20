# API Auth Audit

Read-only audit of every route handler under `app/api/`. Reports what the code does — no fixes proposed.

**Standing fact, load-bearing for this entire audit:** `middleware.ts`'s matcher is `['/', '/app/:path*', '/auth/login', '/beta']`. It covers **zero** `/api/*` paths. Nothing below can be assumed to be protected by middleware — every route's auth state is whatever that route's own code does, and nothing else.

**Confirmation:** `app/api/team/invite/route.ts` was patched in commit `cc0a102` ("Add authorization to POST /api/team/invite"). Verified in this audit: it now shows **AUTHENTICATED: yes, AUTHORIZED: yes**. The fix is in place and correct — it checks `user.id === artist_id` or an accepted `artist_delegates` row before trusting `artist_id` for anything, matching the `context-data/route.ts` reference pattern.

38 route files found under `app/api/` (recursive, including nested dynamic segments).

## Full route table

| Path | Methods | AUTHENTICATED | AUTHORIZED | SERVICE ROLE | SIDE EFFECTS |
|---|---|---|---|---|---|
| `account/delete` | POST | yes — `auth.getUser()`, 401 if none | yes — all ops scoped to `userId = user.id` | yes (`createAdminSupabaseClient()`) | Storage deletes (`show-recordings`, `performance-proofs`, `avatars`); cascading DB deletes (performances, audio_captures, capture_sessions, songs, artists, detection_events, manual_song_events); nulls `performances.captured_by` where it equals the deleting user; cleans up `artist_delegates.invited_by` |
| `admin/assign-delegate` | POST | yes | `ADMIN_EMAILS.includes(user.email ?? '')` | yes | Writes `artist_delegates` (insert/update) |
| `admin/beta-invite` | POST, DELETE | yes | `ADMIN_EMAILS` (cookie-based client) | yes | Resend email; `beta_invites` insert/delete |
| `admin/delete-show` | DELETE, PATCH | yes | `ADMIN_EMAILS` (cookie-based client) | yes | Cascading destructive deletes (detection_events, performance_songs, capture_sessions, setlist_items, setlists, performances, shows); PATCH force-completes a live show. `performance_id` trusted from body but gated by admin-only access |
| `admin/preload-setlist` | POST | yes | `ADMIN_EMAILS` | yes | `user_songs` insert for an arbitrary `user_id` from body (admin-only, acceptable) |
| `admin/run-reconciliation` | POST | yes | `ADMIN_EMAILS` | not directly (delegates to `lib/reconciliation/engine.ts` / `db.ts`) | Writes `reconciliation_runs`, `reconciliation_conclusions` |
| `admin/spotify-import` | POST | yes | `ADMIN_EMAILS` | yes | Spotify API (paid/metered); `user_songs` writes for arbitrary `user_id` |
| `auth/callback` | POST | **no** — zero auth code | n/a — no DB access at all in this file | no | Paid ACRCloud API call. **Misleadingly named**: not an OAuth callback — a duplicate ACRCloud audio-identify proxy |
| `bandsintown/upcoming` | GET | no | n/a | no | None — public event-lookup proxy, cached. Intentional-public candidate |
| `email-sync` | POST | shared-secret Bearer (`DIGEST_WEBHOOK_SECRET`) — machine-to-machine, not session auth | n/a (webhook) | no | Anthropic Claude (paid); Notion API writes |
| `enrich-song` | POST | no | n/a | no | MusicBrainz (free), no DB writes. Intentional-public / fire-and-forget by design (explicit comment in file) |
| `identify` | POST | **no** — only an optional, non-blocking Authorization-header parse used solely for enrichment; never required to proceed | **TRUSTS INPUT** — `performance_id`, `show_id`, `setlist_id`, `artist_id` all read directly from `formData` with zero ownership verification | yes | Paid ACRCloud call + MusicBrainz enrichment; writes `audio_captures`, `recognition_jobs`, `detection_events`, `user_songs`. Hardcoded ACRCloud credentials inline. **CLAUDE.md-flagged do-not-touch file** |
| `lastfm` | GET | no | n/a | no | Last.fm (free), no DB. Intentional-public |
| `notion-sync` | POST | shared-secret Bearer (`SUPABASE_WEBHOOK_SECRET`) | n/a (webhook) | yes (`auth.admin.getUserById`) | Notion API writes |
| `og/[id]` | GET | no | TRUSTS INPUT (`params.id`) but read-only | yes / anon-fallback | None — generates OG share image. Intentional-public candidate |
| `og/card` | GET | no | n/a | no | None — stub, returns `{ status: 'coming_soon' }` |
| `og/setlist/[id]` | GET | no | TRUSTS INPUT (`params.id`) but read-only | yes (module-level service role) | None — generates share image. Intentional-public candidate |
| `parse-setlist` | POST | yes — 401 if no user | yes — `userId` used for catalog match and storage path `setlists/${userId}/...` | yes | Anthropic Claude vision (paid); `sharp` HEIC/EXIF processing; `performance-photos` storage upload |
| `performance-songs` | GET | **no** — zero auth code | **TRUSTS INPUT** — `searchParams.get('performanceId')` used directly in service-role queries | yes | Read-only, but exposes a performance's full song list (title/artist/ISRC/composer/publisher) to any caller who knows/guesses a `performanceId` — **and** backfills ISRC/composer/publisher from every *other* performance owned by that same user, so one leaked/guessed id exposes a user's entire catalog history metadata |
| `publisher/artist-search` | GET | yes | `ADMIN_EMAILS` (explicit TODO: "no real publisher auth model exists yet") | yes | Ticketmaster API (paid-tier). Contains hardcoded `UMPG_DEMO_SEED` — ~23 real celebrity artist names mapped to fabricated royalty estimates (demo data, not a vuln, but worth noting) |
| `publisher/dashboard` | GET | yes | `ADMIN_EMAILS` (same TODO) | yes | Reads `publisher_accounts`/`publisher_roster`/`performances`/`performance_songs` for a `publisher_id` query param. TRUSTS INPUT in principle, moot while admin-only |
| `publisher/invite` | POST | **no** — zero auth code | **TRUSTS INPUT** — `publisher_id`, `publisher_name`, `artist_name`, `artist_email` all read straight from body | yes | Resend email; `publisher_roster_invites` insert |
| `publisher/roster/add` | POST | yes | `ADMIN_EMAILS` | yes | `publisher_roster` insert |
| `rd-log` | GET, POST | yes (cookie-based client + `getCallerEmail()`) | `ADMIN_EMAILS` | yes | None destructive; GET supports CSV export of the royalty distribution log |
| `rd-log/structure` | POST | **no** — zero auth code, pure Anthropic passthrough | n/a — no DB access at all | no | Paid Anthropic Claude call — unauthenticated cost-abuse vector. No data exposure |
| `recent-songs` | GET | yes | yes — all queries `.eq('user_id', user.id)` incl. venue-boost subquery | no (session client) | None |
| `setlistfm` | GET, POST | **partial** — GET: no; POST: yes, 401 if no user | GET: n/a (public lookup); POST: yes — writes scoped to `user.id` | not directly confirmed / session client | GET: none, public setlist.fm proxy (intentional-public). POST: writes/updates the caller's own performances |
| `song-debuts` | GET | yes | yes — same accepted-delegation check as `context-data` (`.eq('artist_id', userIdParam).eq('delegate_id', user.id).not('accepted_at','is',null).maybeSingle()`), triggered only when `userIdParam !== user.id` | yes (used only after authorization passes) | None, read-only |
| `spotify-import` | POST | yes — 401 if no user | yes — all writes scoped to `user.id` | no (session client) | Spotify API (paid/metered); `user_songs` delete+insert scoped to own user; `profiles.avatar_url` update scoped to own user |
| `spotify-search` | GET | no | n/a | no | Spotify API call (paid/metered) — public proxy, no visible per-caller rate limit |
| `team/accept` | GET, POST | GET: no (intentional — returns `is_intended_recipient` for anonymous invite-landing view); POST: yes, 401 if no user | GET: n/a; POST: yes — `if (invite.delegate_id !== user.id) return 403` | yes | POST: `artist_delegates` update (accept) |
| `team/context-data` | GET | yes | yes — full accepted-delegation check before any data read. **Reference-quality example** used to verify other routes in this audit | yes | None, read-only |
| `team/delegates` | GET, DELETE | yes | yes — `user.id !== artistId → 403` (verifies caller IS the artist) | yes | DELETE removes a delegate row |
| `team/invite` | POST | **yes** (fixed in `cc0a102`) | **yes** — `user.id === artist_id` OR an accepted `artist_delegates` row, checked before `artist_id` is trusted for anything | yes | Resend email; `artist_delegates` insert |
| `team/managed-artists` | GET | yes — 401 if no user | yes / inherently safe — `.eq('delegate_id', user.id)`, no externally-supplied id to attack | yes | None |
| `ticketmaster/upcoming` | GET | no | n/a | no | Ticketmaster API (paid-tier), no DB. Intentional-public, cached 1hr |
| `transcript-sync` | POST | shared-secret Bearer (`DIGEST_WEBHOOK_SECRET`) | n/a (webhook, trusted caller pushes an arbitrary Google Docs `fileId`) | no Supabase involved | Google Docs API read; Anthropic Claude (paid); Notion API writes — one Notion page created per parsed action item, unbounded |
| `weekly-digest` | POST | shared-secret Bearer (`DIGEST_WEBHOOK_SECRET`) | n/a (webhook) | no Supabase involved | Notion reads (3 databases); Anthropic Claude (paid); Resend email to hardcoded `jesse@setlistr.ai` |

---

## A. Unauthenticated routes

Sorted worst-first. Severity multipliers used: email-sending, service-role use (RLS bypass), destructive/cross-user writes, and real per-call cost on a paid external API.

1. **`api/identify` (POST)** — no auth at all (the only auth-shaped code is an optional header parse that's never enforced). Uses the service-role client, so RLS provides no backstop. Trusts `performance_id`, `show_id`, `setlist_id`, and `artist_id` straight from form data with zero ownership check, and writes to four tables. Also burns a real per-call cost against ACRCloud. This is the most severe finding in the audit — unauthenticated + RLS-bypassing + input-trusting + paid-API + multi-table writes, all at once. (Per CLAUDE.md and standing instruction, this route's logic must not be edited.)

2. **`api/performance-songs` (GET)** — no auth, service-role client, `performanceId` trusted directly from a query param. Read-only, but the exposure is severe: a single guessed/leaked id doesn't just return that one performance's song list — it triggers a backfill step that pulls ISRC/composer/publisher metadata from *every other performance* owned by that performance's user, exposing a user's entire catalog/royalty metadata history from one id.

3. **`api/publisher/invite` (POST)** — no auth, service-role client, `publisher_id`/`artist_email`/etc. trusted directly from the request body. Sends a real transactional email via Resend and inserts into `publisher_roster_invites` for an arbitrary caller-supplied `publisher_id`. An anonymous caller can trigger emails to arbitrary addresses and pollute the roster-invite table at will.

4. **`api/auth/callback` (POST)** — no auth, no DB access, but proxies a real per-call-cost ACRCloud request. Pure cost-abuse vector. Notable because the path name (`/auth/callback`) suggests it's an OAuth callback handler when it's actually a duplicate audio-identify endpoint — worth knowing so it isn't mistaken for something session-related.

5. **`api/rd-log/structure` (POST)** — no auth, no DB access, but proxies a real per-call-cost Anthropic Claude request. Pure cost-abuse vector, no data exposure.

6. **`api/spotify-search` (GET)** — no auth, proxies a metered Spotify API call, no DB. Cost-abuse vector; no visible per-caller rate limiting.

7. **`api/ticketmaster/upcoming` (GET)** — no auth, proxies a paid-tier Ticketmaster API call, no DB. Some mitigation via 1-hour response caching.

8. **`api/enrich-song`, `api/lastfm`, `api/bandsintown/upcoming` (GET/POST)** — no auth, but the external APIs behind them (MusicBrainz, Last.fm, Bandsintown) are free/unmetered, and none write to the DB. Lowest-severity unauthenticated routes; plausibly intentional-public by design.

9. **`api/og/[id]`, `api/og/setlist/[id]` (GET)** — no auth, service-role reads keyed off a caller-supplied id, but the data returned (an OG share card for a performance) is the same data the app's own `/s/[id]` public share pages are designed to expose. Intentional-public candidates.

10. **`api/og/card` (GET)** — no auth, but the handler is a no-op stub (`{ status: 'coming_soon' }`). No real surface here.

**Not counted above but worth flagging as a distinct bucket:** `email-sync`, `notion-sync`, `transcript-sync`, `weekly-digest` are not session-authenticated, but they aren't wide-open either — each checks `req.headers.get('authorization') === 'Bearer ' + <a specific secret env var>` before doing anything. That's a real gate (anyone without the secret is rejected), but it's also an all-or-nothing shared secret, not per-caller auth, and each of these routes has real side effects if that secret ever leaks: `transcript-sync` and `weekly-digest` both call paid Anthropic Claude and write to Notion; `weekly-digest` additionally sends email via Resend to a hardcoded address; `transcript-sync` creates one Notion page per parsed item with no upper bound.

## B. Authenticated but unauthorized

No routes were found where a route requires a session but then trusts a caller-supplied resource id belonging to a *different* user without checking it. This is a structural observation worth stating plainly: every "trusts input" problem found in this codebase (`identify`, `performance-songs`, `publisher/invite`) takes the form of **skipping authentication entirely**, not "authenticated user A can reach authenticated user B's data by supplying B's id." All routes that do require a session (`account/delete`, `parse-setlist`, `recent-songs`, `spotify-import`, `song-debuts`, `setlistfm` POST, and all five `team/*` routes) correctly scope every query/write to either `user.id` directly or a verified `artist_delegates` accepted-row check.

One soft, adjacent concern worth naming even though it isn't literally "authenticated but unauthorized" in the id-trusting sense: every admin route (`admin/*`, `publisher/artist-search`, `publisher/dashboard`, `publisher/roster/add`, `rd-log`) authorizes purely via `ADMIN_EMAILS.includes(user.email ?? '')` — a hardcoded email allowlist, not a database-verified role. Any of the listed admin accounts reaching any of these routes gets full access with no further per-resource check (by design, since admin routes are meant to touch arbitrary users' data) — but it means the entire admin surface's authorization reduces to "is this one of N hardcoded email strings," with no role table backing it up.

## C. Service role inventory

Every route using a service-role (RLS-bypassing) client, and whether it authenticates the caller *before* using it:

| Route | Authenticates first? |
|---|---|
| `account/delete` | yes — self-scoped after auth |
| `admin/assign-delegate` | yes — admin gate |
| `admin/beta-invite` | yes — admin gate |
| `admin/delete-show` | yes — admin gate |
| `admin/preload-setlist` | yes — admin gate |
| `admin/spotify-import` | yes — admin gate |
| `identify` | **no** — service role used with no enforced auth at all |
| `notion-sync` | yes — shared-secret gate before use |
| `og/[id]` | no — but read-only, intentional-public |
| `og/setlist/[id]` | no — but read-only, intentional-public |
| `parse-setlist` | yes |
| `performance-songs` | **no** — service role used with no auth at all |
| `publisher/artist-search` | yes — admin gate |
| `publisher/dashboard` | yes — admin gate |
| `publisher/invite` | **no** — service role used with no auth at all |
| `publisher/roster/add` | yes — admin gate |
| `rd-log` | yes — admin gate |
| `song-debuts` | yes — delegation check, service role only used after passing |
| `team/accept` | GET: no (intentional-public); POST: yes |
| `team/context-data` | yes |
| `team/delegates` | yes |
| `team/invite` | yes (fixed in `cc0a102`) |
| `team/managed-artists` | yes |

Three routes use a service-role client with **no authentication gate at all**: `identify`, `performance-songs`, `publisher/invite`. These are the same three routes flagged at the top of Section A — the service-role bypass of RLS is precisely what makes their missing auth consequential, since there's no RLS backstop catching what the missing auth check would otherwise have caught.
