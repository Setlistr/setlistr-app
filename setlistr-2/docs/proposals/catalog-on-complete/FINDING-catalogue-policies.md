# Separate finding and repair: catalogue tables were writable by every delegate, including Viewers

**Status:**
- the finding is demonstrated;
- the repair, [`proposed-catalogue-write-access.sql`](proposed-catalogue-write-access.sql), is **tested on the disposable production-shaped stack only; NOT APPLIED; no production policy change;**
- it's independent of the catalogue repair and can be approved, applied or rolled back on its own.

## The finding (production, preflight Run 1)

```
user_songs_self              FOR ALL  TO public  USING (can_act_for(user_id))   -- no WITH CHECK
user_song_performances_self  FOR ALL  TO public  USING (can_act_for(user_id))   -- no WITH CHECK
```

`can_act_for` admits every accepted, unrevoked delegate, Viewers included. Without WITH CHECK, the same test governs writes. Demonstrated through PostgREST with a Viewer's own session (`final2/db-verify.log`): a Viewer could:
- insert, change and delete the artist's catalogue rows;
- insert a show marker ahead of time, which **stopped that song being counted** when the show completed.

## The repair

- **Reads unchanged:** SELECT `can_act_for(user_id)`, for the artist and every current delegate, Viewers included.
- **Writes:** INSERT, UPDATE and DELETE on **both** tables require `can_write_for(user_id)`: the artist, and accepted, unrevoked managers, tour managers and band members. That's the same rule as `performances` and `performance_songs`.
- **Ownership locked:** `user_songs_lock_owner` and `user_song_performances_lock_owner` reject any change of `user_id` (23514), the same pattern as `performances_lock_owner`.
- **Precondition:** it aborts, changing nothing, unless each table has exactly the one `_self` policy found in production.

## Who writes these tables, and why each keeps working

| Writer | Client | After the repair |
|---|---|---|
| Live capture page; old review loop (`main`) | user session | artist, Manager, Tour Manager and band member still write; Viewer refused (as its review save already is) |
| My Songs (add, edit, delete) | user session | artist and writing delegates; Viewer refused |
| Spotify import route | the artist's own session | unchanged |
| `api/identify`, `api/upload-identify`, `api/upload-reconcile`, delete, undo, admin routes | service role (RLS bypassed) | unaffected; none changes `user_id` |
| The catalogue repair's trigger | SECURITY DEFINER, `postgres` | unaffected |

## Tests (`final3/policy-verify.log`: 31/31; browser `final3/prod-verify-policy.log`)

| User | Read rows and markers | Insert / update / delete rows | Insert / update / delete markers |
|---|---|---|---|
| Artist, Manager, Tour Manager, band member | yes | yes | yes |
| Viewer | **yes** | **no** | **no** |
| Revoked Manager, pending (unaccepted) Manager | no | no | no |
| Unrelated signed-in user, signed out | no | no | no |

**Ownership attempts, all refused:**
- a Manager of two artists moving a row or a marker between them (23514);
- the artist giving a row away or clearing its owner (23514);
- a Viewer taking a row (no rows);
- a Tour Manager inserting a row for an artist they don't manage (42501);
- the service role moving a row (23514).

**Writer paths:**
- the capture page's exact calls (artist, Manager; Tour Manager on an already-counted show gets "already counted");
- My Songs add, edit and delete;
- the Spotify import's delete and re-insert;
- the service-role identify, upload, delete and undo sequences;
- a Manager's completion recorded by the trigger;
- a Viewer can no longer plant a marker.

**Rollback:** restore the two `_self` policies and drop the two lock triggers. It's a pure permission change with no data change.
