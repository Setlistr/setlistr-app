# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working rules

- **Read every file fully before editing it.** Never assume content from filenames or partial reads.
- **Make surgical edits.** Change only what the task requires — no opportunistic cleanup or refactoring.
- **Do not touch `app/api/identify` or any audio detection logic** unless explicitly instructed. This is ACRCloud fingerprinting with fragile threshold tuning.
- **PRO integrations must be globally agnostic.** All submission and royalty logic must support SOCAN, ASCAP, BMI, PRS, APRA, SESAC, and GMR equally. Never build a feature for a single PRO.
- **Inline styles only — never Tailwind classes.** The design system is implemented via inline `style={{}}` props throughout.
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

The app uses two distinct Next.js route trees:

- `/` and public marketing routes — unauthenticated, landing page + SEO content
- `/app/*` — all protected app functionality, wrapped in an `AppShell` layout
- `/auth/login` — Supabase email/password auth
- `/api/*` — server-side API routes

`middleware.ts` gates all `/app/*` routes: checks Supabase session, verifies the user has an accepted row in the `beta_invites` table (invite-only beta), and redirects accordingly. Admin emails bypass the beta check.

### Auth & database

Supabase handles both auth and the Postgres database (no ORM — direct Supabase client calls throughout).

- `lib/supabase/client.ts` — browser client (`createBrowserClient`)
- `lib/supabase/server.ts` — server client (`createServerClient` with cookies)

All tables use Row Level Security. The schema is in `supabase-schema.sql`. A trigger auto-creates a `profiles` row on signup. Server-side AI/admin routes use the service role key (`SUPABASE_SERVICE_ROLE_KEY`).

### Core data model

`performances` → `performance_songs` is the central relationship. A performance moves through statuses: `draft → live → processing → review → complete`. Songs carry ISRC, composer, publisher, and duration used for royalty estimation.

### Key API routes

| Route | Purpose |
|---|---|
| `api/identify` | ACRCloud audio fingerprinting — detects songs from live mic input |
| `api/parse-setlist` | Claude vision API — parses a setlist photo into structured song data |
| `api/enrich-song` | MusicBrainz lookup — fetches ISRC, composer, publisher for a song |
| `api/spotify-search` / `api/spotify-import` | Spotify artist search and setlist import |
| `api/performance-songs` | CRUD for songs within a performance |

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

Fonts: DM Sans (body/UI), DM Mono (code/data). Loaded via `globals.css` — no next/font setup.

## Environment variables

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin operations |
| `NEXT_PUBLIC_APP_URL` | Canonical URL (e.g. https://setlistr.ai) |
| `ANTHROPIC_API_KEY` | Claude vision for setlist parsing |
| `ACRCLOUD_*` | Audio fingerprinting credentials |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Spotify API |
| `MUSICBRAINZ_*` | Song metadata enrichment |

## Key utilities

- `lib/royalty-estimate.ts` — heuristic royalty calculator; factors in venue capacity, show type, and territory multipliers
- `lib/song-utils.ts` — normalizes song titles (strips "live", "acoustic", "remix" suffixes for deduplication)
