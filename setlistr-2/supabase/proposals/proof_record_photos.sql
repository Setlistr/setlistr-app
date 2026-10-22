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

BEGIN;

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

COMMIT;
