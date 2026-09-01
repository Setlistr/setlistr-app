-- Geolocation verification for live captures.
--
-- Two coordinate pairs per performance:
--   venue_latitude / venue_longitude — copied off the venues row when the
--     show is created, i.e. where the artist SAYS they played.
--   latitude / longitude — the device's own reading taken when capture
--     starts, i.e. where the artist ACTUALLY was.
--
-- latitude/longitude already existed but were unused: written at creation
-- from a Mapbox geocode, then overwritten at review-save with a city
-- centroid, and never read anywhere. They are repurposed here as the device
-- reading, and the review-save overwrite has been removed in application code.

ALTER TABLE performances
  ADD COLUMN IF NOT EXISTS venue_latitude               DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS venue_longitude              DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_distance_from_venue DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_verified            BOOLEAN;

COMMENT ON COLUMN performances.venue_latitude IS
  'Venue latitude, copied from venues.latitude at show creation.';
COMMENT ON COLUMN performances.venue_longitude IS
  'Venue longitude, copied from venues.longitude at show creation.';
COMMENT ON COLUMN performances.latitude IS
  'Device latitude recorded when capture started.';
COMMENT ON COLUMN performances.longitude IS
  'Device longitude recorded when capture started.';
COMMENT ON COLUMN performances.location_distance_from_venue IS
  'Great-circle distance in KILOMETRES between the venue and the device '
  'reading at capture start.';
COMMENT ON COLUMN performances.location_verified IS
  'TRUE if within 0.5 km, FALSE if beyond, NULL if either coordinate is missing. '
  'NULL is deliberate: a denied permission prompt is not evidence of absence.';

-- performances_visible was created directly in Supabase rather than in a
-- migration, so its definition is not tracked here. If it enumerates columns
-- rather than SELECT *, it must be recreated for these four to surface —
-- app/app/live/[id]/page.tsx reads venue_latitude through that view.
-- Check with:
--   SELECT pg_get_viewdef('performances_visible'::regclass, true);
