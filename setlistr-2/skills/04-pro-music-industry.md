[04-pro-music-industry.md](https://github.com/user-attachments/files/26331831/04-pro-music-industry.md)
# Setlistr — PRO Reporting & Music Industry Context

## Trigger
Apply this skill for any work involving PRO exports, royalty reporting, ISRC, composer data, or music licensing.

---

## Domain Context
Setlistr serves working musicians who need to report live performances to Performing Rights Organizations (PROs) to collect royalties. Accurate setlist tracking directly translates to money for artists. This is the core value proposition.

## Performing Rights Organizations (PROs)
| PRO | Territory | Notes |
|---|---|---|
| SOCAN | Canada | |
| ASCAP | USA | |
| BMI | USA | |

Each PRO has its own CSV export format. All three are supported.

## CSV Export Requirements
PRO exports must include enriched song data:
- Song title
- Composer credits (from MusicBrainz)
- Publisher (from MusicBrainz)
- ISRC (from MusicBrainz)
- Performance date
- Venue
- Duration (where available)

Exports were fixed to correctly include enriched data — do not revert to unenriched exports.

## ISRC
International Standard Recording Code — unique identifier for a specific recording. Fetched from MusicBrainz after confident match. Stored in `performance_songs`. Required for accurate PRO reporting.

## Royalty Estimates
The artist profile page (`/app/artist/[id]`) displays royalty estimates based on performance history. These are estimates only — actual royalty calculations vary by PRO and are not guaranteed.

## Key Industry Realities
- Musicians report performances after the show, not in real time — end-of-show output quality is critical
- Setlists are often not planned in advance; real-time capture is the differentiator
- Touring artists play the same songs repeatedly — historical setlist data has compounding value
- PRO reporting is tedious; automation is the pain point being solved

## Multi-Artist Shows
- A show can have multiple performing artists
- Each artist has their own setlist within a show
- DB writes go to: `shows` → `show_artists` → `setlists` → `capture_sessions`
- Show type selector determines single vs multi-artist context
