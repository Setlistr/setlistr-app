[01-architecture.md](https://github.com/user-attachments/files/26331813/01-architecture.md)
# Setlistr Architecture

## Trigger
Apply this skill for ANY task involving Setlistr code, database, deployment, or infrastructure.

---

## Product
Setlistr is a live performance setlist tracking platform for working musicians.
- Live at: https://setlistr.ai
- GitHub: github.com/Setlistr/setlistr-app
- All app files live in the `setlistr-2/` subfolder of the repo

## Stack
| Layer | Technology |
|---|---|
| Framework | Next.js 14.2.5 (App Router) |
| Language | TypeScript |
| Database | Supabase (Postgres) |
| Auth | Supabase SSR via middleware |
| Hosting | Vercel |
| AI / Detection | ACRCloud + OpenAI fallback |
| Queue | BullMQ (planned) |

## Supabase
- Project ID: `lelimetbogycrdnfxjok`
- Auth is handled at the edge via Next.js middleware — never use client-side session checks as the primary auth gate
- A Supabase trigger auto-creates user profiles on signup
- SSR auth bug history: the correct pattern uses middleware with cookie handling; do not revert to legacy client patterns

## Key Database Tables
- `shows` — top-level performance record
- `show_artists` — join table linking artists to shows (multi-artist support)
- `setlists` — per-artist setlist within a show
- `capture_sessions` — live capture session tied to a setlist
- `performance_songs` — individual song detections, includes enriched columns: ISRC, composer credits, publisher
- `detection_events` — event log for the detection pipeline (activating this logging is a current priority)

## App Router Structure
All routes use the Next.js 14 App Router pattern. Pages live in `app/` with layouts, loading, and error boundaries as needed. Key routes:
- `/app/artist/[id]` — artist profile: show stats, royalty estimates, top venues/cities, song catalog
- Live capture page — the core product experience, mobile-first

## Environment Variables (Vercel)
- `OPENAI_API_KEY` — rotated; current key is live in Vercel
- ACRCloud credentials — in Vercel env

## Coding Rules
- Full file replacements preferred over partial diffs
- Always provide clear file path and context before any code block
- TypeScript strict mode — no `any` shortcuts
- No new dependencies without explicit discussion
