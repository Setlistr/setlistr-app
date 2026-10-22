# Proof of Performance: data audit proposal (read-only, not run)

**Status: proposal.** Nothing here has been run against Preview or production data. No record is deleted, merged, reclassified or backfilled. The queries below only read. Each result needs the artist's or team's judgement before anything changes, and any change would be a separate, approved task.

**Prompt:** the exported register for a real artist lists five confirmed shows on April 7 (Chicago, Austin, Nashville, Vancouver, Toronto), plus repeated venue/date pairs elsewhere.

## 1. What could produce those rows (from the code, not the data)

- **Test or practice captures.** Live capture sets `performance_date` to the scheduled date or, without one, the moment the show was created (`app/app/show/new/page.tsx`). Several capture sessions started on one day, with different venues typed in, would all carry that day's date. Five cities in one day suggests this, but it isn't established.
- **Duplicates.** A show started twice, or an upload made for a show that was also captured, gives two rows with the same venue and date.
- **Legitimate separate shows.** Two sets at one venue on one date (early and late), or a festival day with several stages, are real and must stay.

## 2. Read-only queries (per artist; `:artist` is the artist's profile id)

**A. Dates with more than one confirmed show**

```sql
select performance_date::date as day, count(*) as shows,
       array_agg(distinct coalesce(city, '—')) as cities,
       array_agg(distinct venue_name) as venues
from performances
where user_id = :artist and deleted_at is null and data_source <> 'setlistfm_imported'
  and status in ('complete', 'completed', 'exported')
group by 1 having count(*) > 1 order by 1 desc;
```

**B. Evidence for each row on those dates.** Run for the days returned by A.

```sql
select p.id, p.venue_name, p.city, p.status, p.data_source, p.created_at, p.started_at, p.ended_at,
       p.show_id, (p.recording_path is not null) as has_recording, (p.latitude is not null) as has_capture_location,
       (select count(*) from performance_songs_visible s where s.performance_id = p.id) as kept_songs,
       (select count(*) from capture_sessions c where c.performance_id = p.id) as capture_sessions,
       (select count(*) from detection_events d where d.performance_id = p.id) as detections,
       (select max(flow_source) from product_events e where e.performance_id = p.id and e.event_name = 'show_created') as created_via
from performances p
where p.user_id = :artist and p.deleted_at is null and p.performance_date::date = :day
order by p.created_at;
```

`capture_sessions.performance_id` matches `supabase-schema.sql`. Confirm the live schema before running.

**C. Same venue and date more than once**

```sql
select lower(trim(venue_name)) as venue, performance_date::date as day, count(*), array_agg(id order by created_at)
from performances
where user_id = :artist and deleted_at is null and data_source <> 'setlistfm_imported'
group by 1, 2 having count(*) > 1 order by 2 desc;
```

**D. Countries as stored, with cities**

```sql
select country, city, count(*) from performances
where user_id = :artist and deleted_at is null and data_source <> 'setlistfm_imported'
group by 1, 2 order by 1, 3 desc;
```

## 3. How results would be read (for a person to decide)

| Pattern | Suggests | Still needed |
|---|---|---|
| Created minutes apart; capture sessions of a few minutes; few or no detections; cities far apart on one day | Test or practice capture | The artist confirms it wasn't a show |
| Same venue and date; overlapping songs; one captured, one uploaded | Duplicate | The artist chooses which row is the record |
| Same venue and date; different set times or distinct setlists | Two real sets | Nothing; both stay |

Proposed outcome, after approval: the artist or team removes a test show, or keeps one of a duplicate pair, through the app's existing delete-show flow, which keeps its audit trail. No bulk or automatic cleanup.

## 4. Unresolved city locations (21 in the real record)

These were investigated with local, representative examples only: `lib/proof/map.ts` `acceptGeocode`, run against live Mapbox geocoding responses with the token in a local process only, never printed. No real records were read.

| Cause | Examples | What happens now |
|---|---|---|
| **Overly restrictive matching (main cause)** | Austin, Nashville, Portland, Columbus, Kansas City, Washington, Cambridge, Athens, Richmond, Springfield (all US) | Mapbox returns the well-known city first, and a smaller namesake (Austin MN, Nashville IN) second with equal relevance. The rule rejects any second result with the same name, so the well-known city is never accepted. |
| **Region discarded** | "Austin, TX", "Portland, OR", "Washington, DC" | `cityName` keeps only the text before the comma, so a state that would disambiguate is dropped before lookup. |
| **Name form differs** | "New York City" / "NYC" (Mapbox: "New York"), "Québec City" ("Québec"), "Saint Louis" ("St. Louis"), "Brooklyn" (a borough, not a `place`) | Rejected by the exact-name check. |
| **Default country** | `supabase-schema.sql` defaults `performances.country` to `'United States'`. A show saved without a country may read as US. | A Canadian or European city is looked up in the US, so it's unresolved or, worse, matched to a US namesake. It may also inflate the country count. Query D checks this. |
| **No usable country** | Country empty, a state in the country field ("Texas") | Never looked up. |
| **Region code read as a country** | Country field "TN" (Tennessee) is read as ISO **Tunisia** | The lookup finds nothing. Worse, a code that is also a country could locate a show in the wrong country. |
| Lookup failure | none observed in the probe | Reported separately as "the place lookup was unavailable" |

**Proposed fix (needs approval).** Pass the region from the city field ("TX", "Oregon") to the lookup, and accept the top result only when its region matches. Treat a well-known city as the answer only when the region confirms it. Without a region, genuinely ambiguous names stay unresolved; no coordinates are guessed. Read two-letter country fields as ISO codes only when they aren't also a US state or Canadian province code used in the city field. Matching would change the map's coverage, but not counts, permissions or stored data.
