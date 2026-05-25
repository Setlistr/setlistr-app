# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working rules

- **Read every file fully before editing it.** Never assume content from filenames or partial reads.
- **Make surgical edits.** Change only what the task requires — no opportunistic cleanup or refactoring.
- **Do not touch `app/api/identify` or any audio detection logic** unless explicitly instructed. This is ACRCloud fingerprinting with fragile threshold tuning (confidence thresholds, flap detection, memory bias — all interdependent).
- **PRO integrations must be globally agnostic.** All submission and royalty logic must support SOCAN, ASCAP, BMI, PRS, APRA, SESAC, and GMR equally. Never build a feature for a single PRO.
- **Inline styles only — never Tailwind classes.** The design system is implemented via inline `style={{}}` props throughout. Tailwind config exists only for custom color/font tokens.
- **All deploys go through GitHub → Vercel.** Never run `vercel deploy` or any direct deployment command from the terminal.
- **Stack:** Next.js 14.2.5 / TypeScript / Supabase / Vercel.
- **Project root:** code lives in `setlistr-2/` — confirm paths relative to that directory.

## Commands

```bash
npm run dev       # Start development server
npm run build     # Production build
npm run start     # Run production server
```

No lint or test scripts are configured — type-check with `npx tsc --noEmit`.

## Architecture Overview

**Setlistr** is a Next.js 14 App Router application for musicians to capture live performance setlists and submit them to Performing Rights Organizations (PROs) for royalty collection.

### Route structure

**Public/marketing** (unauthenticated):
- `/` — Landing page
- `/start`, `/get-paid`, `/get-paid-for-live-shows`, `/submit-setlists-pro` — Feature/marketing pages
- `/unclaimed-music-royalties`, `/what-is-live-performance-royalty` — SEO content
- `/publisher` — Publisher portal landing
- `/beta` — Shown to users who are logged in but not yet approved
- `/auth/login` — Supabase email/password auth

**Protected app** (`/app/*`, wrapped in `AppShell`):
- `/app/dashboard` — Home: performance stats, unclaimed earnings, account switcher (for delegates)
- `/app/show/new` — Create a new performance
- `/app/live/[id]` — Live capture: real-time ACRCloud audio fingerprinting + manual add
- `/app/review/[id]` — Post-show review: confirm/edit detected songs
- `/app/submit/[id]` — Final review before PRO royalty submission
- `/app/history` — All past performances by status
- `/app/stats` — Career analytics
- `/app/onboarding` — First-time artist setup
- `/app/settings` — User settings
- `/app/proof` — Verified performance record for PRO submission
- `/app/artist/[id]` — View a managed artist (delegation)
- `/app/accept-invite` — Accept delegation invite via token
- `/app/admin`, `/app/admin/rd-log` — Internal admin only
- `/s/[id]` — Public shareable setlist link

`middleware.ts` gates `/app/*`: checks Supabase session, verifies `beta_invites.accepted_at`, redirects accordingly. Three hardcoded admin emails bypass the beta check.

### Auth & database

Supabase handles both auth and the Postgres database (no ORM — direct Supabase client calls throughout).

- `lib/supabase/client.ts` — browser client (`createBrowserClient`) for `'use client'` components
- `lib/supabase/server.ts` — server client (`createServerClient` with cookies) for server components and API routes
- **Service role:** API routes that write trusted data (detection, admin) instantiate `createClient(URL, SUPABASE_SERVICE_ROLE_KEY)` directly — this bypasses RLS

All tables use Row Level Security scoped to `auth.uid()`. A trigger auto-creates a `profiles` row on signup. Full schema in `supabase-schema.sql`.

### Core data model

`performances` → `performance_songs` is the central relationship.

Performance status flow: `draft → live → processing → review → complete`

Key tables:

| Table | Purpose |
|---|---|
| `profiles` | User accounts: `artist_name`, `role` (artist\|admin), `pro_affiliation`, `bandsintown_artist_name` |
| `performances` | A live show: venue, date, status, `submission_status` |
| `performance_songs` | Songs in a performance: ISRC, composer, publisher, `duration_seconds`, `position` |
| `venues` | Venue master list with `capacity` |
| `capture_sessions` | Live audio sessions: `started_at`, `ended_at`, status |
| `user_songs` | Personal song catalog (memory bias): `confirmed_count`, `canonical_artist`, `last_confirmed_at` |
| `user_song_performances` | Guard table preventing duplicate song counts per performance |
| `artist_delegates` | Delegation: `artist_id`, `delegate_id`, `invite_token`, `accepted_at` |
| `beta_invites` | Invite-only access control |
| `detection_events`, `recognition_jobs`, `recognition_results`, `recognition_logs` | ACRCloud detection forensics |
| `setlists`, `setlist_items` | **Legacy** — used as fallback when `performance_songs` unavailable |
| `publisher_accounts`, `publisher_roster` | Publisher portal |

### Team & delegation

Two distinct multi-user flows:
- **Artist → Delegate:** An artist invites a team member (`artist_delegates`). The delegate sees and manages all that artist's performances via `/app/artist/[id]`. Dashboard includes an account switcher.
- **Publisher → Artist roster:** Publishers manage rosters of artists (`publisher_roster`). Publisher dashboard (`api/publisher/dashboard`) shows unsubmitted shows, unclaimed earnings, and recovery queue across the full roster.

Invite tokens are UUIDs stored as `invite_token`; `accepted_at` marks completion.

### Key API routes

| Route | Purpose |
|---|---|
| `api/identify` | ACRCloud fingerprinting. Writes detection forensics to 4 tables. **Fragile — do not touch.** |
| `api/parse-setlist` | Claude vision — parses setlist photo/PDF/text. HEIC conversion for iPhone. Fuzzy-matches against user catalog. |
| `api/enrich-song` | MusicBrainz ISRC/composer/publisher lookup. Non-blocking — failures don't block response. |
| `api/spotify-search` / `api/spotify-import` | Spotify artist search + setlist import (OAuth2 client credentials) |
| `api/performance-songs` | CRUD for songs within a performance |
| `api/recent-songs` | User's recently confirmed songs from `user_songs` |
| `api/bandsintown/upcoming` / `api/ticketmaster/upcoming` | Upcoming shows (BandsinTown with Ticketmaster fallback) |
| `api/notion-sync` | Notion data sync (admin feature) |
| `api/team/invite` / `accept` / `delegates` / `managed-artists` / `context-data` | Delegation management |
| `api/publisher/dashboard` / `invite` / `roster/add` / `artist-search` | Publisher portal |
| `api/rd-log`, `api/rd-log/structure` | Royalty distribution log viewer |
| `api/admin/*` | Beta invites, delegation assignment, show deletion, setlist preloading |

### Audio detection system (ACRCloud)

This is the most critical and fragile part of the codebase. Key parameters in `app/api/identify/route.ts`:
- `ACR_STRONG = 80`, `ACR_SUGGEST = 55` — confidence thresholds for auto-confirm vs. suggest
- **Memory bias:** if user has confirmed a song ≥2 times (via `user_songs`), auto-confirm at score ≥60
- **Flap detection:** `FLAP_MIN_COUNT = 3` — prevents rapid song switching noise
- **Humming boost:** humming detections get score ×100 multiplier with min threshold of 45

### Mobile

Capacitor wraps the Next.js app as an iOS/Android app. The iOS project lives in `ios/`. The Capacitor config (`capacitor.config.ts`) points to `https://setlistr.ai` in production and uses the `out/` static export for local builds.

## Design system

Mobile-first dark aesthetic. All styling uses **inline styles only — never Tailwind classes**.

| Token | Value | Usage |
|---|---|---|
| Background | `#0a0908` | Page/root background |
| Card surface | `#141210` | Card and panel backgrounds |
| Gold accent | `#c9a84c` | CTAs, highlights, borders |
| Cream text | `#f0ece3` | Primary text |
| Secondary text | `#b8a888` | Labels, subtitles |
| Muted text | `#5a5448` | Disabled, placeholder |

Status colors: `#4ade80` (success), `#f87171` (error), `#60a5fa` (info), `#f59e0b` (warning).

Fonts: DM Sans (body/UI), DM Mono (code/data), DM Serif Display (display headings). Loaded via `globals.css` — no next/font setup.

## Environment variables

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin operations (bypasses RLS) |
| `NEXT_PUBLIC_APP_URL` | Canonical URL (e.g. https://setlistr.ai) |
| `ANTHROPIC_API_KEY` | Claude vision for setlist parsing |
| `ACRCLOUD_*` | Audio fingerprinting credentials |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Spotify API |
| `MUSICBRAINZ_*` | Song metadata enrichment |

## Key utilities

- `lib/royalty-estimate.ts` — heuristic royalty calculator. Multiplier tables for venue capacity (0.3×–12×), show type (0.4×–1.0×), territory (CA=1.5×, US=1.0×, others 0.7–0.9×), registration status, and crowd density. Base rate $1.20/song. Variance band ±35%.
- `lib/song-utils.ts` — normalizes song titles before DB saves: strips "(Live)", "(Acoustic)", "(Remix)", feat. artists, trailing dashes. Used for deduplication keying.
