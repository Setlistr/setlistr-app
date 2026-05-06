-- R&D Activity Log
-- Purpose: Structured records for Section 41, IRAP, NSF SBIR, and patent documentation.
-- Access: superadmin only (service role bypasses RLS; anon/auth key is blocked by policy).

create table if not exists rd_log (
  id                    uuid         primary key default gen_random_uuid(),
  created_at            timestamptz  not null    default now(),
  entry_date            date         not null,
  team_member           text         not null,
  role                  text         not null,
  workstream            text         not null,
  technical_problem     text,
  hypothesis            text,
  work_performed        text,
  hours                 numeric(4,1),
  outcome               text,
  remaining_uncertainty text,
  related_file          text,
  evidence_link         text,
  funding_relevance     text[],
  is_retroactive        boolean      not null    default false,
  notes                 text
);

alter table rd_log enable row level security;

-- Single policy covering all operations — only the two superadmin emails
create policy "rd_log_superadmin_all" on rd_log
  using (
    auth.jwt() ->> 'email' in (
      'jesse.slack.music@gmail.com',
      'darylscottsongs@gmail.com'
    )
  )
  with check (
    auth.jwt() ->> 'email' in (
      'jesse.slack.music@gmail.com',
      'darylscottsongs@gmail.com'
    )
  );

-- ── Retroactive entries ──────────────────────────────────────────────────────

insert into rd_log (
  entry_date, team_member, role, workstream,
  technical_problem, work_performed, hours,
  outcome, remaining_uncertainty, related_file,
  funding_relevance, is_retroactive
) values

('2026-03-01', 'Jesse', 'Founder / Lead Dev', 'Vendor-Agnostic Recognition Architecture',
 'How to architect ACRCloud so it can be replaced without rewriting the platform',
 'Designed adapter pattern with abstract interface. Defined recognition engine ABC. Documented Postgres schema for songs, performances, recognition jobs. Outlined A/B testing strategy using shadow mode and gold standard corpus.',
 15,
 'Architecture documented. ACRCloud implemented as primary adapter with clear interface contract.',
 'What confidence thresholds perform best across venue types and genres? How should multiple engine results be ranked?',
 'Architecture docs / lib/recognition',
 ARRAY['Section 41', 'IRAP', 'Patent'],
 true),

('2026-03-01', 'Jesse', 'Founder / Lead Dev', 'Live Capture Page — Core Loop',
 'Build a live capture screen with real-time audio recognition that feels like Shazam.',
 'Rewrote app/app/live/[id]/page.tsx. Implemented central pulse button with radial gradient, outer ping rings during listening, catch flash animation on detection, pending card with confirm/swap/dismiss flow. Manual add toggle, confirmed songs list, End Performance button.',
 30,
 'Live capture page shipped. Full Shazam-feel interaction model working end-to-end.',
 'Background audio capture not solved — app stops listening when phone is locked.',
 'app/app/live/[id]/page.tsx',
 ARRAY['Section 41', 'IRAP'],
 true),

('2026-03-01', 'Jesse', 'Founder / Lead Dev', 'Score Normalization — Humming vs Fingerprint',
 'Garbage songs auto-confirming. Root cause: ACRCloud humming scores are 0-1 floats, fingerprint scores are 0-100 integers. Math.max(0.25, 85) = 85, auto-confirming every humming result regardless of quality.',
 'Fixed by multiplying humming score by 100 before threshold comparison. Raised humming boost minimum to 70 normalized.',
 20,
 'Garbage auto-confirms eliminated. Artist''s own songs now detect correctly at normalized score 80.',
 'Optimal threshold values for humming vs fingerprint across different genres still require empirical testing.',
 'app/api/identify/route.ts',
 ARRAY['Section 41', 'IRAP', 'NSF SBIR', 'Patent'],
 true),

('2026-03-01', 'Jesse', 'Founder / Lead Dev', 'CatalogSearch — Mobile Safari RLS Fix',
 'CatalogSearch failing on mobile Safari — user catalog not appearing when manually adding songs during review. Client-side Supabase auth not passing session correctly in Safari.',
 'Architectural fix: rewrote CatalogSearch to call /api/recent-songs server-side route instead of querying Supabase directly. Added q search parameter with ilike filtering.',
 12,
 'Fix confirmed working. Pattern established: always use server-side API routes for DB queries on iOS Safari.',
 'Are there other client-side Supabase queries that will fail on Safari? Full audit needed.',
 'components/CatalogSearch.tsx, app/api/recent-songs/route.ts',
 ARRAY['Section 41'],
 true),

('2026-03-01', 'Jesse', 'Founder / Lead Dev', 'Weighted Recent Songs API',
 'Songs in quick-add chips need to be ordered by relevance — artists play the same songs repeatedly so recency and play count should surface likely candidates first.',
 'Built recency decay scoring: score = playCount x recencyWeight where recencyWeight decreases exponentially with days since last performance.',
 15,
 'Songs ordered by play-count-weighted recency. Most recently and frequently played songs surface first.',
 'Optimal decay rate for recency weighting untested across artists with different show frequencies.',
 'app/api/recent-songs/route.ts',
 ARRAY['Section 41', 'IRAP'],
 true),

('2026-03-01', 'Jesse', 'Founder / Lead Dev', 'Multi-Artist Show Taxonomy',
 'Writers Rounds are a Nashville-specific format where multiple songwriters each perform their own songs. Standard setlist model doesn''t support per-song artist attribution.',
 'Built show type selector: Solo/Band, Writers Round, Multi-Artist. Each added artist gets their own setlist. Database writes to shows, show_artists, setlists, capture_sessions. SQL migration to add show_id and artist_id to capture_sessions.',
 30,
 'Writers Round format fully supported. Per-artist setlist attribution working end-to-end.',
 'How should royalty splits be calculated for Writers Rounds where a song has multiple writers performing it?',
 'app/app/performances/new/page.tsx',
 ARRAY['Section 41', 'Patent'],
 true),

('2026-04-01', 'Jesse', 'Founder / Lead Dev', 'Setlist-Constrained Verification',
 'When artist pre-loads planned setlist, detected songs were being inserted at show start AND end, causing duplicates on review screen.',
 'Diagnosed React stale closure: handleEnd captured songs state at mount, not current value. Fixed by using confirmedSongsRef.current in handleEnd. Added delete-before-insert pattern. Planned vs detected reconciliation uses normalized title matching.',
 8,
 'Duplicate songs on review screen eliminated. Planned setlist constraint working correctly.',
 'Normalization is imperfect — abbreviations and alternate spellings still cause mismatches in edge cases.',
 'app/app/live/[id]/page.tsx',
 ARRAY['Section 41', 'Patent'],
 true),

('2026-04-01', 'Jesse', 'Founder / Lead Dev', 'Setlist Photo OCR — Samsung MIME/EXIF Fix',
 'Samsung camera sending image/jpg instead of image/jpeg (rejected by strict MIME check) and EXIF rotation metadata causing misoriented images.',
 'Added image/jpg to ALLOWED_TYPES. Built normaliseMime() function. Added Sharp .rotate() for EXIF-based rotation correction before processing.',
 12,
 'Photo capture working on Samsung devices. Images properly oriented before OCR.',
 'Other Android OEM-specific MIME types not yet tested — Xiaomi, OnePlus behavior unknown.',
 'app/api/parse-setlist/route.ts',
 ARRAY['Section 41', 'IRAP'],
 true),

('2026-04-01', 'Jesse', 'Founder / Lead Dev', 'Spotify Token Caching Bug',
 'Vercel caching stale Spotify OAuth token causing search failures across deploys.',
 'Added cache: ''no-store'' to both token fetch and search fetch in /api/spotify-search/route.ts. Diagnosed and removed dead client-side token fetch in settings page that was intercepting the real API call.',
 8,
 'Spotify search working correctly across all deploys. No more stale token serving.',
 'Spotify API rate limits in high-volume onboarding scenario not yet stress-tested.',
 'app/api/spotify-search/route.ts',
 ARRAY['Section 41'],
 true),

('2026-04-01', 'Jesse', 'Founder / Lead Dev', 'Royalty Estimation Engine',
 'Need a unified estimation model covering SOCAN (CA), ASCAP/BMI (US), PRS (UK) royalty rates across different venue capacity tiers and show types.',
 'Built pure function royalty-estimate.ts. Maps venue capacity to PRO tier (small <200, medium 200-500, large 500-2000, major 2000+). Applies territory-specific rate cards. Returns per-show and per-song estimates.',
 25,
 'Royalty estimates showing on dashboard, review completion, and submit pages. Multi-PRO rate structure documented.',
 'Actual PRO rate cards not fully public — estimates are approximations. Exact rates require PRO partnership agreements.',
 'lib/royalty-estimate.ts',
 ARRAY['Section 41', 'IRAP', 'NSF SBIR'],
 true),

('2026-04-01', 'Jesse', 'Founder / Lead Dev', 'Public Share Page + OG Image Generator',
 'Build a shareable post-show card that renders in iMessage, Twitter, Instagram without requiring the app.',
 'Built server-side rendered public page at /s/[id] (no auth required). Built dynamic OG image generator at /api/og/setlist/[id] using next/og edge runtime. Output: 1080x1920 portrait card. iOS native file sharing via Web Share API.',
 20,
 'Share cards generating and rendering correctly in social previews. Confirmed in iMessage and Twitter.',
 'OG image rendering in Facebook preview has caching delays. Not yet resolved.',
 'app/s/[id]/page.tsx, app/api/og/setlist/[id]/route.tsx',
 ARRAY['Section 41'],
 true),

('2026-04-01', 'Jesse', 'Founder / Lead Dev', 'Stability — Consecutive Hit Requirement',
 'Songs triggering on partial detection: first hit auto-confirming before the song has played through enough to verify. Creates false positives in noisy live environments.',
 'Implemented consecutive-hit requirement: all songs except first of show require 2 consecutive detection hits before confirming. Songs in cooldown window (<30s since last confirm) go to pending and wait for second hit.',
 25,
 'False positive rate significantly reduced in real-show testing.',
 'Optimal hit count for different genres and tempos not yet empirically validated.',
 'app/app/live/[id]/page.tsx',
 ARRAY['Section 41', 'Patent', 'NSF SBIR'],
 true),

('2026-04-01', 'Jesse', 'Founder / Lead Dev', 'Memory Bias — User History Upgrade System',
 'Songs the artist frequently plays should get higher confidence from the recognition system — it should learn from their performance history.',
 'Built memory bias layer: if song scores 40-79 (suggest range) AND user_songs has confirmed_count >= 2 AND score >= 60, upgrade to auto confidence automatically. Normalized title matching for history lookup.',
 15,
 'Artists'' own frequently-played songs detect with higher confidence automatically over time.',
 'Cold start problem: new users have no history so memory bias doesn''t help for first several shows.',
 'app/api/identify/route.ts, user_songs table',
 ARRAY['Section 41', 'Patent', 'NSF SBIR'],
 true),

('2026-05-01', 'Jesse', 'Founder / Lead Dev', 'Native App / Capacitor Wrapper — Planning',
 'PWA cannot capture audio when phone is locked or backgrounded on iOS. This is the core missing capability.',
 'Researched Capacitor as wrapper approach. Validated it wraps existing Next.js app without rebuild. Unlocks background audio capture via native plugin, push notifications, camera, geolocation. Confirmed approach with Sean O''Toole (Doug Merritt advisor). Spencer assigned as native reliability spike.',
 8,
 'Capacitor chosen as agreed path. Architecture defined. Spencer assigned Build 10.',
 'Background audio capture in Capacitor + Next.js has no published reference implementation. Genuinely novel territory.',
 'capacitor.config.ts (planned)',
 ARRAY['Section 41', 'IRAP', 'Patent', 'NSF SBIR'],
 true);
