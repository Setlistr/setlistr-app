-- Rolled-back test of supabase/proposals/proof_record_photos.sql (local stack with Storage only).
-- Run: psql -v ON_ERROR_STOP=1 < this file. Ends in ROLLBACK; nothing persists.
BEGIN;
-- PROPOSAL — NOT APPLIED. Proof of Performance record photo.
-- docs/proof-of-performance-plan.md §8. Kept outside supabase/migrations so
-- nothing applies it by accident. Tested only inside a rolled-back
-- transaction on a local stack (scripts in the plan's verification notes).
--
-- Design:
--   * One row per artist: which photo the record uses (profile image,
--     record photo, or none), the record photo's object path and the crop's
--     focal point.
--   * Private bucket `proof-photos`, objects at <artist_id>/<uuid>.jpg. No
--     storage policies for clients at all: anon and authenticated users can
--     neither read nor write it. The server route reads and writes with the
--     service role after its own access check (owner, or an accepted,
--     non-revoked write-capable team member for writes; anyone who can act
--     for the artist for reads), and streams the image to the page and the
--     PDF. There are no public URLs and no signed URLs.
--   * The table is readable by anyone who can act for the artist; it holds
--     no image data and nothing sensitive. All writes go through the route.


CREATE TABLE IF NOT EXISTS public.proof_record_photos (
  artist_id   uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  mode        text NOT NULL DEFAULT 'profile' CHECK (mode IN ('profile', 'record', 'none')),
  object_path text,
  focal_x     real NOT NULL DEFAULT 0.5 CHECK (focal_x >= 0 AND focal_x <= 1),
  focal_y     real NOT NULL DEFAULT 0.3 CHECK (focal_y >= 0 AND focal_y <= 1),
  width       integer CHECK (width > 0),
  height      integer CHECK (height > 0),
  updated_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- A record photo always has its object; the other modes never keep one.
  CONSTRAINT proof_record_photos_object_matches_mode CHECK ((mode = 'record') = (object_path IS NOT NULL)),
  -- The object lives in the artist's own folder, under a random name.
  CONSTRAINT proof_record_photos_object_in_artist_folder CHECK (
    object_path IS NULL OR object_path ~ ('^' || artist_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')
  )
);

ALTER TABLE public.proof_record_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proof_record_photos_read ON public.proof_record_photos;
CREATE POLICY proof_record_photos_read ON public.proof_record_photos
  FOR SELECT TO authenticated
  USING (public.can_act_for(artist_id));

REVOKE ALL ON public.proof_record_photos FROM anon;
REVOKE ALL ON public.proof_record_photos FROM authenticated;
GRANT SELECT ON public.proof_record_photos TO authenticated;

-- Private bucket: processed JPEGs only, 4 MB after processing.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('proof-photos', 'proof-photos', false, 4194304, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Deliberately no storage.objects policies for this bucket: with RLS on,
-- anon and authenticated have no access; only the service role does.

CREATE TEMP TABLE r (n serial, name text, ok boolean, detail text);
GRANT ALL ON r TO authenticated, anon; GRANT ALL ON SEQUENCE r_n_seq TO authenticated, anon;
-- People (inside this transaction only)
INSERT INTO auth.users (id, email) VALUES
 ('a0000000-0000-4000-8000-000000000001','pp-art@example.test'), ('a0000000-0000-4000-8000-000000000002','pp-mgr@example.test'),
 ('a0000000-0000-4000-8000-000000000003','pp-view@example.test'), ('a0000000-0000-4000-8000-000000000004','pp-rev@example.test'),
 ('a0000000-0000-4000-8000-000000000005','pp-oth@example.test');
INSERT INTO public.profiles (id) SELECT id FROM auth.users WHERE email LIKE 'pp-%@example.test' ON CONFLICT (id) DO NOTHING;
INSERT INTO public.artist_delegates (artist_id, delegate_id, role, accepted_at, revoked_at) VALUES
 ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','manager', now(), null),
 ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000003','viewer', now(), null),
 ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000004','manager', now(), now());
-- Constraints
DO $$ DECLARE a uuid := 'a0000000-0000-4000-8000-000000000001'; BEGIN
  BEGIN INSERT INTO proof_record_photos (artist_id, mode) VALUES (a, 'record'); INSERT INTO r(name,ok) VALUES ('record without object rejected', false);
  EXCEPTION WHEN check_violation THEN INSERT INTO r(name,ok) VALUES ('record without object rejected', true); END;
  BEGIN INSERT INTO proof_record_photos (artist_id, mode, object_path) VALUES (a, 'profile', a::text || '/0b6e7f5a-1c2d-4e3f-8a9b-0c1d2e3f4a5b.jpg'); INSERT INTO r(name,ok) VALUES ('profile mode keeps no object', false);
  EXCEPTION WHEN check_violation THEN INSERT INTO r(name,ok) VALUES ('profile mode keeps no object', true); END;
  BEGIN INSERT INTO proof_record_photos (artist_id, mode, object_path) VALUES (a, 'record', 'a0000000-0000-4000-8000-000000000005/0b6e7f5a-1c2d-4e3f-8a9b-0c1d2e3f4a5b.jpg'); INSERT INTO r(name,ok) VALUES ('object outside the artist folder rejected', false);
  EXCEPTION WHEN check_violation THEN INSERT INTO r(name,ok) VALUES ('object outside the artist folder rejected', true); END;
  BEGIN INSERT INTO proof_record_photos (artist_id, mode, object_path) VALUES (a, 'record', a::text || '/../x.jpg'); INSERT INTO r(name,ok) VALUES ('path traversal rejected', false);
  EXCEPTION WHEN check_violation THEN INSERT INTO r(name,ok) VALUES ('path traversal rejected', true); END;
  BEGIN INSERT INTO proof_record_photos (artist_id, mode, focal_y) VALUES (a, 'profile', 1.5); INSERT INTO r(name,ok) VALUES ('focal point outside 0–1 rejected', false);
  EXCEPTION WHEN check_violation THEN INSERT INTO r(name,ok) VALUES ('focal point outside 0–1 rejected', true); END;
  INSERT INTO proof_record_photos (artist_id, mode, object_path, focal_x, focal_y, width, height, updated_by)
    VALUES (a, 'record', a::text || '/0b6e7f5a-1c2d-4e3f-8a9b-0c1d2e3f4a5b.jpg', 0.5, 0.3, 1600, 2000, 'a0000000-0000-4000-8000-000000000002');
  INSERT INTO r(name,ok) VALUES ('valid record photo row accepted', true);
  INSERT INTO storage.objects (bucket_id, name) VALUES ('proof-photos', a::text || '/0b6e7f5a-1c2d-4e3f-8a9b-0c1d2e3f4a5b.jpg');
END $$;
INSERT INTO r(name,ok,detail) SELECT 'bucket is private, JPEG only', public = false AND allowed_mime_types = ARRAY['image/jpeg'], public::text FROM storage.buckets WHERE id = 'proof-photos';
-- As each person (authenticated, with their JWT subject)
CREATE OR REPLACE FUNCTION pg_temp.as_user(uid uuid) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', uid::text, true) $$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.as_user('a0000000-0000-4000-8000-000000000001'); INSERT INTO r(name,ok) SELECT 'artist reads their row', count(*) = 1 FROM proof_record_photos;
SELECT pg_temp.as_user('a0000000-0000-4000-8000-000000000002'); INSERT INTO r(name,ok) SELECT 'manager reads it', count(*) = 1 FROM proof_record_photos;
SELECT pg_temp.as_user('a0000000-0000-4000-8000-000000000003'); INSERT INTO r(name,ok) SELECT 'viewer reads it (view access)', count(*) = 1 FROM proof_record_photos;
SELECT pg_temp.as_user('a0000000-0000-4000-8000-000000000004'); INSERT INTO r(name,ok) SELECT 'revoked member reads nothing', count(*) = 0 FROM proof_record_photos;
SELECT pg_temp.as_user('a0000000-0000-4000-8000-000000000005'); INSERT INTO r(name,ok) SELECT 'unrelated user reads nothing', count(*) = 0 FROM proof_record_photos;
SELECT pg_temp.as_user('a0000000-0000-4000-8000-000000000001');
INSERT INTO r(name,ok) SELECT 'artist cannot read the photo object directly', count(*) = 0 FROM storage.objects WHERE bucket_id = 'proof-photos';
DO $$ BEGIN
  BEGIN UPDATE proof_record_photos SET mode = 'none', object_path = NULL; INSERT INTO r(name,ok) VALUES ('clients cannot write the row (artist)', false);
  EXCEPTION WHEN insufficient_privilege THEN INSERT INTO r(name,ok) VALUES ('clients cannot write the row (artist)', true); END;
  BEGIN INSERT INTO storage.objects (bucket_id, name) VALUES ('proof-photos', 'a0000000-0000-4000-8000-000000000001/x.jpg'); INSERT INTO r(name,ok) VALUES ('clients cannot upload to the bucket', false);
  EXCEPTION WHEN insufficient_privilege OR others THEN INSERT INTO r(name,ok) VALUES ('clients cannot upload to the bucket', true); END;
END $$;
SELECT pg_temp.as_user('a0000000-0000-4000-8000-000000000002');
INSERT INTO r(name,ok) SELECT 'manager cannot read the photo object directly', count(*) = 0 FROM storage.objects WHERE bucket_id = 'proof-photos';
RESET ROLE;
SET LOCAL ROLE anon;
INSERT INTO r(name,ok) SELECT 'anonymous: no row', count(*) = 0 FROM (SELECT 1 FROM storage.objects WHERE bucket_id = 'proof-photos') x;
RESET ROLE;
-- Cleanup behaviour: deleting the artist removes the row (the route deletes the object).
DELETE FROM public.artist_delegates WHERE artist_id = 'a0000000-0000-4000-8000-000000000001';
DELETE FROM public.profiles WHERE id = 'a0000000-0000-4000-8000-000000000001';
INSERT INTO r(name,ok) SELECT 'artist deletion removes the row (cascade)', count(*) = 0 FROM proof_record_photos;
SELECT (CASE WHEN ok THEN '  ok   ' ELSE '  FAIL ' END) || name FROM r ORDER BY n;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' FROM r;
ROLLBACK;
