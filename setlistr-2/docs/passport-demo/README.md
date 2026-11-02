# "Your Passport, already started": local demonstration

*2026-11-02. Example artist: Jesse Slack. Artifact: https://claude.ai/artifact/EwVAyKjY2LMuhXtPUVHo2d (private).*

**What was not done or used:**
- no production reads or writes;
- no keys;
- no paid calls;
- no contact with anyone.

Retrieval is automated (`assemble.js`) and the page is generated from its output (`build.js`).

## Source access, checked in official documentation the same day

| Source | Rule found | Used? |
|---|---|---|
| MusicBrainz web service | No key. A meaningful User-Agent is required, at about 1 request per second per IP ([rate limiting](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting)). Core data is CC0; supplementary data is CC BY-NC-SA ([data licence](https://musicbrainz.org/doc/About/Data_License)). Whether commercial use of the *live API* needs a MetaBrainz supporter agreement isn't stated on the pages read. **Check before any product use.** | Yes (demo only) |
| Wikidata | Main-namespace data is CC0 ([licensing](https://www.wikidata.org/wiki/Wikidata:Licensing)) | Yes |
| Bandsintown | The [API page](https://help.artists.bandsintown.com/en/articles/9186477-api-documentation) needs an `app_id`, but says nothing about who may hold one or what usage terms apply. **The per-artist-key belief is not verified.** | No |
| Ticketmaster Discovery | Needs an API key; terms not reviewed | No |
| Spotify Web API | Needs client credentials; production credentials not used | No |
| setlist.fm | Needs a key; API use is non-commercial without permission (per the earlier feasibility review) | No |
| Apple iTunes Search API | No key, but promo content may be used "only to promote store content" ([Search API](https://performance-partners.apple.com/search-api)) | No |
| Deezer API | Use "strictly limited for a non-commercial purpose" ([terms](https://developers.deezer.com/termsofuse)) | No |
| Discogs API | Terms page returned 403, so not verified | No |

## Result

**10 requests, 11 s.**

| Item | Result |
|---|---|
| Identity | 1 exact MusicBrainz artist: "Jesse Slack", Person, Canada. **Not confirmed as the owner.** Wikidata has no item. |
| Events | 0 linked; 0 by name search |
| Release groups | 0 |
| Recordings | 1: "Full Throttle", credited to Jeremy Macklin & Jesse Slack, released 2020-07-09, 2:47, no ISRC listed |
| Compositions | 0: no work is linked, so no writers or ISWC |

**Manual effort:**
- the access checks;
- two fixes to the script's queries (3 automated runs in total);
- one added name-search step.

0 records were written by hand. Total wall-clock was about 5 minutes after the access checks began.
