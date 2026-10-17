#!/bin/bash
P() { docker exec -i sl-catalog-test psql -U postgres -At -q -v ON_ERROR_STOP=1 "$@"; }
OWNER=11111111-1111-4111-8111-111111111111; MGR=22222222-2222-4222-8222-222222222222
AS() { local uid=$1; shift; printf "set request.jwt.claims = '{\"sub\":\"%s\",\"role\":\"authenticated\"}';\nset request.jwt.claim.sub = '%s';\nset role authenticated;\n%s\n" "$uid" "$uid" "$*" | docker exec -i sl-catalog-test psql -U postgres -At -q 2>&1 | sed 's/^/    /'; }
CAT() { P -c "select coalesce(string_agg(song_title||'='||confirmed_count, ', ' order by song_title),'(none)') from user_songs" | sed 's/^/    catalogue: /'; }
clean() { P -c "delete from user_song_performances; delete from user_songs; delete from performance_songs; delete from performances;" >/dev/null; }
show() { P -c "insert into performances (id, user_id, artist_name, venue_name, status, data_source) values ('$1','$OWNER','NL','Room','${2:-review}','${3:-captured}')" >/dev/null; }
song() { P -c "insert into performance_songs (performance_id, title, artist, position, source) values ('$1','$2','NL',${3:-1},'${4:-recognized}')" >/dev/null; }
A=aaaaaaaa-0000-4000-8000-00000000000a; B=bbbbbbbb-0000-4000-8000-00000000000b

concurrent() { clean; show $A; show $B; song $A 'Brand New Song'; song $B 'Brand New Song'
  ( printf "set request.jwt.claims = '{\"sub\":\"$OWNER\"}';\nset request.jwt.claim.sub = '$OWNER';\nset role authenticated;\nbegin;\nupdate performances set status='complete' where id='$A';\nselect pg_sleep(2);\ncommit;\n" | docker exec -i sl-catalog-test psql -U postgres -q >/dev/null 2>&1 ) &
  sleep 0.6
  ( printf "set request.jwt.claims = '{\"sub\":\"$MGR\"}';\nset request.jwt.claim.sub = '$MGR';\nset role authenticated;\nupdate performances set status='complete' where id='$B';\n" | docker exec -i sl-catalog-test psql -U postgres -q >/dev/null 2>&1 ) &
  wait; P -c "select count(*)||' row(s), counts '||coalesce(string_agg(confirmed_count::text, '+'),'') from user_songs where song_title='Brand New Song'" | sed 's/^/    Brand New Song: /'; }

echo "== Concurrency: two shows of the same artist saved at the same moment (owner + manager), both introduce the same new song"
concurrent
echo "   ...same race with the advisory lock removed from the function (to show the lock is what prevents it):"
P -c "select pg_get_functiondef('public.record_performance_catalog(uuid)'::regprocedure)" > /tmp/fn.sql
docker exec sl-catalog-test psql -U postgres -At -c "select pg_get_functiondef('public.record_performance_catalog(uuid)'::regprocedure)" | sed 's/  PERFORM pg_advisory_xact_lock.*$/  -- lock removed for this test/' | docker exec -i sl-catalog-test psql -U postgres -q >/dev/null
P -c "select prosrc like '%pg_advisory_xact_lock%' from pg_proc where proname='record_performance_catalog'" | sed 's/^/    lock present: /'
concurrent
docker exec sl-catalog-test psql -U postgres -q -f /tmp/repair.sql >/dev/null 2>&1
P -c "select prosrc like '%pg_advisory_xact_lock%' from pg_proc where proname='record_performance_catalog'" | sed 's/^/    lock restored: /'

echo "== Re-saves"
clean; show $A; song $A 'Polar Night' 1; song $A 'Low Tide' 2
AS $OWNER "update performances set status='complete' where id='$A';"; CAT
AS $OWNER "update performances set status='complete' where id='$A';"; echo "    (re-save)"; CAT
song $A 'Copper Sky' 3; AS $MGR "update performances set status='complete' where id='$A';"; echo "    (manager re-saves after adding Copper Sky)"; CAT
AS $OWNER "update performances set submission_status='submitted' where id='$A';"; echo "    (marked submitted: no status in SET)"; CAT

echo "== Songs already counted during live capture (marker written by capture) are not counted again at review"
clean; show $A; song $A 'Polar Night' 1; song $A 'Low Tide' 2
P -c "insert into user_song_performances (user_id, performance_id, normalized_title) values ('$OWNER','$A','polar night'); insert into user_songs (user_id, song_title, confirmed_count) values ('$OWNER','Polar Night',5)" >/dev/null
AS $OWNER "update performances set status='complete' where id='$A';"; CAT

echo "== Imports"
clean; P -c "insert into user_songs (user_id, song_title, confirmed_count) values ('$OWNER','Polar Night',2)" >/dev/null
AS $OWNER "insert into performances (id, user_id, artist_name, venue_name, status, data_source) values ('$B','$OWNER','NL','Imported Room','complete','setlistfm_imported');"
echo "    setlist.fm import inserts a complete show (no songs today; an INSERT doesn't fire the trigger):"; CAT
song $B 'Polar Night' 1
AS $OWNER "update performances set status='complete' where id='$B';"
echo "    the same imported show later saved from Review (counted, as the page does today):"; CAT

echo "== The final write fails: what stays saved"
clean; show $A; song $A 'Polar Night' 1; song $A 'Low Tide' 2
P -c "alter table user_songs add constraint zz_fail check (song_title <> 'Low Tide')" >/dev/null
echo "    earlier save requests, each its own transaction (as the page sends them):"
AS $OWNER "update performance_songs set title='Polar Night (Acoustic)' where performance_id='$A' and position=1;"
AS $OWNER "insert into performance_songs (performance_id, title, artist, position, source) values ('$A','Added In Review','NL',3,'manual');"
AS $OWNER "update performance_songs set artist_save_complete = true where performance_id='$A';"
echo "    final write (status -> complete) with a forced catalogue failure:"
AS $OWNER "update performances set status='complete' where id='$A';" | head -1
P -c "select 'status='||status from performances where id='$A'" | sed 's/^/    /'
P -c "select string_agg(title||(case when artist_save_complete then ' [reviewed]' else '' end), ', ' order by position) from performance_songs where performance_id='$A'" | sed 's/^/    songs persisted: /'
P -c "select count(*) from user_song_performances" | sed 's/^/    markers: /'; CAT
P -c "alter table user_songs drop constraint zz_fail" >/dev/null
AS $OWNER "update performances set status='complete' where id='$A';"; echo "    Try again after the cause is gone:"; P -c "select 'status='||status from performances where id='$A'" | sed 's/^/    /'; CAT
