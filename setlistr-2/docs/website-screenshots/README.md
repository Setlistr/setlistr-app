# Website screenshots: how the three replacements were made

*2026-11-02, for the website candidate `fix/website-claims-copy` (commit `0cea0a8`, local only).*

**Source:** the **current app**, run locally (`next dev`), signed in as a **fictional** artist on the **local disposable Supabase stack** `setlistr-catalog-disposable`. No production data and no schema changes were involved.

**The fictional data:**
- the artist is Ryder Vance, with invented venues;
- the account is `website-screens@example.test`, with profile name "SAMPLE DATA (website screenshots)", which is why the avatar shows "SD";
- the screenshots' alt text says "sample data".

**How to reproduce:**
1. `node mkenv.js` writes `local-stack.env` (URL and local keys for that stack; nothing is printed).
2. With that file's variables exported:
   - `node seed.js <repo>` creates or replaces the sample artist;
   - start the app with `next dev -p 3123`;
   - `node capture.js` takes the screens at 380×823, 2×.
3. Convert each capture to WebP at 760×1647.

**Notes:**
- `.env.local` points at a different local stack (`setlistr-security-test`, port 54321). Its older schema lacks `profiles.legal_name` and `performance_songs_visible.source`, so Submissions fails there.
- During live capture, the page's `/api/identify` requests were answered locally with "no match". No recognition request left the machine.
- The live screen was captured with recognised songs that are **not** on a planned setlist, because the app labels plan matches "Verified ✓" (see the in-app wording notes in `../website-claims-correction.md`).
- `how-step*.png`: the replaced steps as rendered on the local How-it-works page.
