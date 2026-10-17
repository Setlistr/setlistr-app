# Separate finding: catalogue tables are writable by every delegate, including Viewers

**Demonstrated on the disposable stack in production's shape. Not fixed; no production change proposed or made.** Reported separately from the catalogue repair, which neither depends on it nor changes it.

## Production's policies (preflight Run 1)

```
user_songs_self              FOR ALL  TO public  USING (can_act_for(user_id))   -- no WITH CHECK
user_song_performances_self  FOR ALL  TO public  USING (can_act_for(user_id))   -- no WITH CHECK
```

- **`can_act_for`** admits the artist and **every accepted, unrevoked delegate of any role**, Viewers included. Only `can_write_for` filters by role (manager, tour_manager, band_member).
- **The missing WITH CHECK:** a policy without WITH CHECK uses its USING expression for writes, so the same test governs both.
- **Grants:** anon and authenticated have INSERT, UPDATE and DELETE on both tables, assuming Supabase's default grants. Preflight Run 3 confirms the production grants.

## Demonstrated (PostgREST with each user's own session; `final2/db-verify.log`)

| User | Read the artist's catalogue | Insert | Update counts | Delete | Insert a show marker |
|---|---|---|---|---|---|
| Manager | yes | yes | yes | yes | yes |
| **Viewer** | yes | **yes** | **yes** | **yes** | **yes** |
| Unrelated signed-in user | no rows | refused (42501) | no rows | no rows | refused (42501) |
| Signed out | no rows | refused (42501) | no rows | no rows | refused (42501) |

**Effect on counting:** a marker inserted ahead of time for a show makes that song **not counted** when the show completes. This applies to both the trigger and the page loops, since the marker is what says "already counted". Demonstrated for the Manager and Viewer rows.

## Why it matters, and what it doesn't affect

- A Viewer is meant to be read-only. Through the API, any Viewer can change the artist's song counts, delete catalogue rows, or suppress future counting. The app's UI doesn't offer this; it needs direct API calls with the Viewer's own session.
- **The catalogue repair doesn't rely on these policies.** Its function is SECURITY DEFINER, owned by `postgres` (bypass RLS), and runs only inside a status update that `performances_write` (`can_write_for`) has already authorized. Viewers' saves are still refused (browser test, Viewer row).
- **The old page loops do rely on them:** `main` and live capture write as the signed-in user. So tightening these policies to `can_write_for` would keep Managers, Tour Managers and band members working, while blocking Viewers.

## Possible remedy (needs its own review and approval; not drafted as SQL here)

Split each `FOR ALL` policy into SELECT USING `can_act_for` and INSERT/UPDATE/DELETE using `can_write_for`. Before proposing it, check every writer of these tables (capture, uploads, delete/undo, imports, the service-role admin routes).
