#!/bin/bash
# Runs inside nothing: talks to the disposable container only.
P() { docker exec -i sl-catalog-test psql -U postgres -At -q -v ON_ERROR_STOP=1 "$@"; }
OWNER=11111111-1111-4111-8111-111111111111; MGR=22222222-2222-4222-8222-222222222222; TM=33333333-3333-4333-8333-333333333333; VIEW=44444444-4444-4444-8444-444444444444; OTHER=55555555-5555-4555-8555-555555555555
P -c "insert into auth.users (id, aud, role, email) values ('$OWNER','authenticated','authenticated','owner@x.test'),('$MGR','authenticated','authenticated','mgr@x.test'),('$TM','authenticated','authenticated','tm@x.test'),('$VIEW','authenticated','authenticated','view@x.test'),('$OTHER','authenticated','authenticated','other@x.test') on conflict do nothing"
P -c "insert into artist_delegates (artist_id, delegate_id, role, accepted_at) values ('$OWNER','$MGR','manager',now()),('$OWNER','$TM','tour_manager',now()),('$OWNER','$VIEW','viewer',now())"
# Run SQL as a signed-in user (one request = one transaction, like PostgREST)
AS() { local uid=$1; shift; printf "set request.jwt.claims = '{\"sub\":\"%s\",\"role\":\"authenticated\"}';\nset request.jwt.claim.sub = '%s';\nset role authenticated;\n%s\n" "$uid" "$uid" "$*" | docker exec -i sl-catalog-test psql -U postgres -At -q 2>&1 | sed 's/^/    /'; }
fresh() { # a review-status show for the owner with: 2 detected, 1 planned marked played (stored as manual, per the proposal), 1 planned never played, 1 removed
  P -c "delete from user_song_performances; delete from user_songs; delete from performance_songs; delete from performances;" >/dev/null
  P -c "insert into performances (id, user_id, artist_name, venue_name, status) values ('aaaaaaaa-0000-4000-8000-000000000001','$OWNER','Northern Lights','Room','review')" >/dev/null
  P -c "insert into performance_songs (performance_id, title, artist, position, source, artist_removed) values ('aaaaaaaa-0000-4000-8000-000000000001','Polar Night','NL',1,'recognized',false),('aaaaaaaa-0000-4000-8000-000000000001','Paper Boats (Live)','NL',2,'recognized',false),('aaaaaaaa-0000-4000-8000-000000000001','Harbour Song','NL',3,'manual',false),('aaaaaaaa-0000-4000-8000-000000000001','Never Played','NL',4,'planned',false),('aaaaaaaa-0000-4000-8000-000000000001','Removed One','NL',5,'recognized',true)" >/dev/null
}
CAT() { P -c "select coalesce(string_agg(song_title||'='||confirmed_count, ', ' order by song_title),'(none)') from user_songs" | sed 's/^/    catalogue: /'; P -c "select count(*) from user_song_performances" | sed 's/^/    markers: /'; }
for who in OWNER MGR TM VIEW OTHER; do
  uid=${!who}; fresh
  echo "== $who"
  echo "  today's page path: write a marker for the artist directly"
  AS $uid "begin; insert into user_song_performances (user_id, performance_id, normalized_title) values ('$OWNER','aaaaaaaa-0000-4000-8000-000000000001','polar night') returning 'inserted'; rollback;"
  echo "  proposal: the save's final write (status -> complete)"
  AS $uid "update performances set status = 'complete' where id = 'aaaaaaaa-0000-4000-8000-000000000001' returning 'updated';"
  P -c "select status from performances" | sed 's/^/    show status: /'; CAT
  echo "  calling the catalogue function directly"
  AS $uid "select record_performance_catalog('aaaaaaaa-0000-4000-8000-000000000001');"
done
