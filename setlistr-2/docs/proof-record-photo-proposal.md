# Proof of Performance: record photo (proposal, not implemented)

**Status: proposal only.**
- No SQL has been applied and no route exists.
- No control is shown in the app.
- The page and PDF use the artist workspace's profile image, or the photo-free layout, and both remain fully usable.
- The migration (`supabase/proposals/proof_record_photos.sql`) passed 18/0 inside a rolled-back transaction on a local stack (`proof_record_photos.test.sql`).

**What that test does not establish.** It checks the migration's constraints and access rules only. It doesn't show that the upload → page → PDF workflow works: no upload route, image processing, streaming route, page control or PDF embedding has been built or tested. That needs the end-to-end checks in §6 after the SQL is approved.

## 1. Migration

`supabase/proposals/proof_record_photos.sql`, unchanged and summarised:

- **Table `public.proof_record_photos`:**
  - `artist_id` is the primary key, referencing `profiles` with `ON DELETE CASCADE`;
  - `mode` is `profile` | `record` | `none` (default `profile`);
  - `object_path`; `focal_x` and `focal_y` (0–1; defaults 0.5 and 0.3); `width`, `height`, `updated_by`, `updated_at`.
- **Checks:**
  - `mode = 'record'` if and only if `object_path` is set;
  - `object_path` matches `^<artist_id>/<uuid>\.jpg$`.
- **RLS:** select only, via `can_act_for(artist_id)`. There are no client insert, update or delete grants.
- **Bucket `proof-photos`:** private, `image/jpeg` only, 4 MB. There are **no `storage.objects` policies** for it, so only the service role can read or write.

## 2. Routes (to be added after SQL approval)

All routes run on the Node runtime with `Cache-Control: private, no-store`, and check access on every request with the same delegation query as `authoriseProof`. They return no URLs to storage.

### `GET /api/proof/photo?artist_id=`: stream the record photo

1. **Auth:** signed in (else 401); caller is the owner or an accepted, non-revoked delegate of any role (else 403).
2. **No photo:** read the row with the service role. If there's no row, or `mode` isn't `record`, return 404, and the page falls back to the profile image or the photo-free layout.
3. **Serve:** download the object with the service role, then return `image/jpeg` with `Cache-Control: private, max-age=300` and `X-Content-Type-Options: nosniff`.
4. **Failure:** if the download fails, return 502. The page treats any non-200 as "no record photo" and uses the profile image, then the photo-free layout.

### `POST /api/proof/photo?artist_id=`: upload or replace

`multipart/form-data` with fields `file`, `focal_x` and `focal_y`.

1. **Access:** signed in; the owner, or a delegate with `isWriteCapableRole(role)`. Viewers, revoked, pending and unrelated users get 403. Checked on every request.
2. **Limits:** `Content-Length` and the file size must be ≤ 12 MB (else 413). At most 5 uploads per artist per 10 minutes, counted from `updated_at` and an in-memory window (else 429).
3. **Type, by magic bytes only:**
   - JPEG `FF D8 FF`;
   - PNG `89 50 4E 47`;
   - WebP `RIFF....WEBP`;
   - HEIC/HEIF `ftyp` with brand `heic|heix|hevc|mif1|msf1`.

   Anything else gets 415. The file name and declared type are ignored.
4. **Decode:** use `sharp` (already a dependency; `/api/parse-setlist` already converts iPhone HEIC with it), with `limitInputPixels: 50_000_000`. Each side must be 600–8000 px (else 422). A decode failure gets 422 ("This image couldn't be read").
5. **Process:**
   - `.rotate()` applies the EXIF orientation;
   - `.resize({ width/height: 2000, fit: 'inside', withoutEnlargement: true })`;
   - `.jpeg({ quality: 82, mozjpeg: true })`;
   - no `withMetadata()`, so **all EXIF, GPS and ICC metadata is dropped**.

   The result must be ≤ 4 MB.
6. **Store:** upload to `proof-photos/<artist_id>/<crypto.randomUUID()>.jpg` with `upsert: false`.
7. **Record:** upsert the row with `mode = 'record'`, the new `object_path`, the clamped focal point, the processed width and height, `updated_by` and `updated_at`.
   - If this fails, **delete the object just uploaded** and return 500 ("The photo wasn't saved; try again"). The previous photo stays in place.
8. **Clean up:** if the row previously pointed to another object, delete it.
   - If that delete fails, log it with the path only. The row is already correct, and the orphan is removed by the sweep (§4).
   - Return 200 `{ mode: 'record', focal_x, focal_y }`.

### `PATCH /api/proof/photo?artist_id=`: focal point or mode

The body is `{ mode?: 'profile' | 'none', focal_x?, focal_y? }`. It uses the same write-access check.

1. **Focal point only:** update `focal_x` and `focal_y` (clamped 0–1) on a `record` row.
2. **Mode `profile` or `none`:** update the row (`object_path = NULL`) **first**, then delete the old object. A delete failure is logged and left to the sweep; the visible state is already correct.
3. **Response:** return the new state.

### `DELETE /api/proof/photo?artist_id=`

The same as PATCH to `mode: 'profile'`.

## 3. Crop and focal point

- **Picking it:** the client shows a 4:5 frame over the chosen image. The person drags to position it, which sets `focal_x` and `focal_y` as the centre of interest (0–1), with no zoom in this slice.
- **Page:** `object-fit: cover; object-position: <focal_x·100>% <focal_y·100>%`.
- **PDF:** the server computes the same 4:5 crop rectangle from the processed image's size and the focal point, extracts it with `sharp().extract()`, and embeds that JPEG. The page and the document therefore show identical framing.
- **Defaults:** 0.5, 0.3 (faces usually sit high in portraits), the same as the profile image's current `50% 30%`.

## 4. Deletion and failure handling

| Event | Behaviour |
|---|---|
| Replace | New object, then the row, then the old object is deleted. A row failure deletes the new object. A failure deleting the old object is logged and swept. |
| Profile image or No photo | The row first, then the object is deleted (a failure is logged and swept). |
| Account deletion (`/api/account/delete`) | Also removes `proof-photos/<userId>/*`, as it already does for `avatars/<userId>`. The row goes by `ON DELETE CASCADE`. |
| Revoked team member | All photo routes return 403 on the next request. |
| Orphans | A weekly service-role job lists `proof-photos` and deletes objects not referenced by a row and older than 24 h. It could run as a scheduled admin route, which needs separate approval. |
| Storage unavailable | The page and PDF fall back to the profile image, then to no photo. Export never fails because of the photo. |

## 5. Interface (after approval)

- **Who sees it:** "Change record photo" appears only to the owner and write-capable roles, never to Viewers. It opens the approved sheet: Choose a photo…, Use profile image, No photo.
- **During an upload:** the existing photo stays until the server confirms.
- **On failure:** the sheet shows the server's plain message and the previous photo remains.

## 6. End-to-end checks required before release (none done yet)

1. **Formats on a local stack with Storage:** JPEG, PNG, WebP and iPhone HEIC upload, appear on the page at the chosen focal point, and appear in the exported PDF with the same crop.
2. **Metadata:** a GPS-tagged photo is processed, and the stored object carries no EXIF or GPS (checked with `exiftool`).
3. **Rejections:** oversized, wrong-type, corrupt, too-small and too-large-pixel images are refused with clear messages.
4. **Access:** owner, manager, tour manager and band member can upload. Viewer, revoked, pending, unrelated and signed-out users can't upload or stream.
5. **Failure paths:** replacing, switching mode and deleting leave no orphan objects. Each injected failure (row write, old-object delete) leaves the visible state correct.
6. **Account deletion** removes the objects.
7. **Real devices:** iPhone Safari upload, and installed-app upload after an approved release.
