#!/usr/bin/env python3
# Tests for supabase/proposals/0028_show_imports.sql. DISPOSABLE STACK ONLY.
# Each case runs in its own transaction and ends in ROLLBACK, except the
# concurrency cases, which commit and then clean up through undo_show_import.
import json, subprocess, sys, uuid, threading, time

DB = 'supabase_db_setlistr-catalog-disposable'
out = subprocess.run(['docker', 'exec', DB, 'psql', '-U', 'postgres', '-At', '-c', "select current_setting('port'), inet_server_addr()"], capture_output=True, text=True)
assert out.returncode == 0, out.stderr

A = '16525cd0-a878-4450-bc79-2061bc247895'   # owner
M = 'fa8ceb5d-d512-47fd-b74a-a50beaf21956'   # accepted manager
V = 'cab791d2-e524-4781-b72f-ff885fb6b7a9'   # accepted viewer
R = '4e63cb34-e837-4036-88ec-3aaf35d414a1'   # revoked manager
P = '43a07bc9-dab4-49ba-aa1a-f4e3ce0a6393'   # pending manager
U = 'ee9ac5ab-57de-41c7-bdfa-dd4b1b072d24'   # unrelated

def psql(sql, timeout=60):
    p = subprocess.run(['docker', 'exec', '-i', DB, 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-q'], input=sql, capture_output=True, text=True, timeout=timeout)
    return p.returncode, p.stdout.strip(), p.stderr.strip()

def as_user(uid):
    return f"SELECT set_config('request.jwt.claims', json_build_object('sub', '{uid}', 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', '{uid}', true) \\g /dev/null\nSET LOCAL ROLE authenticated;\n"

def q(v): return "'" + json.dumps(v).replace("'", "''") + "'::jsonb"

def batch(bid=None, **kw):
    b = {'id': bid or str(uuid.uuid4()), 'artist_id': A, 'file_name': 'tour.xlsx', 'sheet_name': 'Tour', 'file_sha256': 'a' * 64,
         'date_order': 'DMY', 'row_count': 9, 'skipped_rows': [{'row': 17, 'reason': 'no_date'}, {'row': 9, 'reason': 'unresolved_dates'}]}
    b.update(kw); return b

ROWS = [
    # past, timed, known zone -> listed with instant
    {'source_row': 4, 'local_date': '2024-02-14', 'local_time': '21:30', 'timezone': 'America/Toronto', 'scheduled_at': '2024-02-15T02:30:00Z', 'expect': 'listed', 'venue_name': 'Test Palace', 'venue_city': 'Toronto', 'venue_country': 'Canada'},
    # past, date only, no zone -> listed, no instant, no time
    {'source_row': 5, 'local_date': '2024-02-15', 'expect': 'listed', 'venue_name': 'Test Tavern', 'venue_city': 'Toronto', 'venue_country': 'Canada'},
    # past, time kept without a zone
    {'source_row': 12, 'local_date': '2024-09-10', 'local_time': '20:00', 'expect': 'listed', 'venue_name': 'Test Basement', 'venue_city': 'Nashville', 'venue_country': 'USA'},
    # future, timed
    {'source_row': 13, 'local_date': '2027-10-31', 'local_time': '19:30', 'timezone': 'Europe/London', 'scheduled_at': '2027-10-31T19:30:00Z', 'expect': 'scheduled', 'venue_name': 'Test Chapel', 'venue_city': 'London', 'venue_country': 'UK'},
    # future, date only, zone known
    {'source_row': 16, 'local_date': '2027-11-21', 'timezone': 'America/Chicago', 'expect': 'scheduled', 'venue_name': 'Test Hall', 'venue_city': 'Chicago', 'venue_country': 'USA', 'name': 'Late add'},
    # festival range: two explicitly chosen days from one row
    {'source_row': 9, 'local_date': '2024-07-18', 'expect': 'listed', 'venue_name': 'Test Island Stage', 'venue_city': 'Guelph', 'venue_country': 'Canada'},
    {'source_row': 9, 'local_date': '2024-07-20', 'expect': 'listed', 'venue_name': 'Test Island Stage', 'venue_city': 'Guelph', 'venue_country': 'Canada'},
]

def imp(user, b=None, rows=None, fp=None):
    b = b or batch(); rows = rows if rows is not None else ROWS
    fpx = f"'{fp}'" if fp else f"public.show_records_fingerprint('{A}')"
    return as_user(user) + f"SELECT public.import_shows({q(b)}, {q(rows)}, {fpx});\n", b

results = []
def case(name, sql, expect_ok=True, err=None, check=None):
    code, so, se = psql('BEGIN;\n' + sql + '\nROLLBACK;\n')
    ok = (code == 0) if expect_ok else (code != 0 and (err is None or err in se))
    detail = ''
    if ok and check:
        try: ok = bool(check(so)); detail = '' if ok else so[-300:]
        except Exception as e: ok = False; detail = f'{e}: {so[-300:]}'
    if not ok and not detail: detail = (se or so)[-300:]
    results.append((name, ok, detail))

lines = lambda s: [l for l in s.splitlines() if l.strip()]

# ── Permissions ──
for who, uid in [('owner', A), ('manager', M)]:
    sql, b = imp(uid)
    case(f'{who} can import', sql + "RESET ROLE;\nSELECT status || ':' || count(*) FROM shows WHERE import_batch_id = '" + b['id'] + "' GROUP BY status ORDER BY 1;",
         check=lambda s: 'listed:5' in s and 'scheduled:2' in s)
for who, uid in [('viewer', V), ('revoked manager', R), ('pending manager', P), ('unrelated user', U)]:
    sql, _ = imp(uid, fp='x')
    case(f'{who} is refused at commit', sql, expect_ok=False, err='NOT_AUTHORIZED')
case('anon cannot call import_shows', "SET LOCAL ROLE anon;\nSELECT public.import_shows('{}'::jsonb, '[]'::jsonb, 'x');", expect_ok=False, err='permission denied')
case('viewer cannot read the fingerprint', as_user(V) + f"SELECT public.show_records_fingerprint('{A}');", expect_ok=False, err='NOT_AUTHORIZED')
case('batches are not writable directly', as_user(A) + f"INSERT INTO show_import_batches (id, artist_id, imported_by, file_name, file_sha256, date_order, row_count, imported_count, request_hash) VALUES (gen_random_uuid(), '{A}', '{A}', 'x', '{'a'*64}', 'DMY', 1, 1, 'x');", expect_ok=False, err='permission denied')

# ── Stored values ──
sql, b = imp(A)
case('values stored as booked', sql + "RESET ROLE;\nSELECT source_row || '|' || local_date || '|' || coalesce(local_time::text, '-') || '|' || coalesce(to_char(scheduled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI'), '-') || '|' || timezone || '|' || status FROM shows WHERE import_batch_id = '" + b['id'] + "' ORDER BY source_row, local_date;",
     check=lambda s: lines(s)[-7:] == ['4|2024-02-14|21:30:00|2024-02-15 02:30|America/Toronto|listed', '5|2024-02-15|-|-|UTC|listed', '9|2024-07-18|-|-|UTC|listed', '9|2024-07-20|-|-|UTC|listed',
                                  '12|2024-09-10|20:00:00|-|UTC|listed', '13|2027-10-31|19:30:00|2027-10-31 19:30|Europe/London|scheduled', '16|2027-11-21|-|-|America/Chicago|scheduled'])
case('batch keeps skipped rows, counts and who imported', sql + "RESET ROLE;\nSELECT imported_count || '|' || skipped_rows::text || '|' || imported_by || '|' || status FROM show_import_batches WHERE id = '" + b['id'] + "';",
     check=lambda s: lines(s)[-1].startswith('7|[{"row": 17, "reason": "no_date"}, {"row": 9, "reason": "unresolved_dates"}]|' + A + '|imported'))
case('scheduled_by is the importer', imp(M)[0].replace('SELECT public.import_shows', 'SELECT 1; SELECT public.import_shows') + "RESET ROLE;\nSELECT DISTINCT scheduled_by FROM shows WHERE scheduled_by_name IS NOT DISTINCT FROM (SELECT coalesce(nullif(trim(artist_name),''), full_name) FROM profiles WHERE id = '" + M + "') AND import_batch_id IS NOT NULL;",
     check=lambda s: M in s)
bad = batch(skipped_rows=[{'row': 3, 'reason': 'no_date', 'value': 'Fee 1,500'}])
case('skipped rows cannot carry cell values', imp(A, bad)[0], expect_ok=False, err='BAD_SKIPPED_ROWS')
bad = batch(skipped_rows=[{'row': 3, 'reason': 'because'}])
case('skipped reasons are a fixed list', imp(A, bad)[0], expect_ok=False, err='BAD_SKIPPED_ROWS')

# ── Idempotency and staleness ──
b = batch()
s1, _ = imp(A, b)
case('retry with the same batch returns the first result', s1 + f"SELECT (public.import_shows({q(b)}, {q(ROWS)}, 'stale-fingerprint-ignored-on-retry'))->>'result';\nRESET ROLE;\nSELECT count(*) FROM shows WHERE import_batch_id = '{b['id']}';",
     check=lambda s: lines(s)[-2] == 'already_imported' and lines(s)[-1] == '7')
case('same batch id with a different request is refused', s1 + f"SELECT public.import_shows({q(b)}, {q(ROWS[:1])}, public.show_records_fingerprint('{A}'));", expect_ok=False, err='BATCH_ID_CONFLICT')
case('same batch id from another person is refused', s1 + "RESET ROLE;\n" + as_user(M) + f"SELECT public.import_shows({q(b)}, {q(ROWS)}, public.show_records_fingerprint('{A}'));", expect_ok=False, err='BATCH_ID_CONFLICT')
case('a change since review is refused (stale)', as_user(A) + f"SELECT set_config('t.fp', public.show_records_fingerprint('{A}'), true) \\g /dev/null\nRESET ROLE;\nINSERT INTO shows (created_by, status, venue_id, scheduled_at, timezone) VALUES ('{A}', 'scheduled', (SELECT id FROM venues LIMIT 1), '2027-01-01T20:00Z', 'America/Toronto');\n" + as_user(A) + f"SELECT public.import_shows({q(batch())}, {q(ROWS)}, current_setting('t.fp'));",
     expect_ok=False, err='IMPORT_STALE')
case('a row whose date passed since review is refused', imp(A, rows=[dict(ROWS[3], expect='listed')])[0], expect_ok=False, err='ROW_CHANGED_SINCE_REVIEW')

# ── Dates, times, zones ──
case('upcoming row without a zone is refused', imp(A, rows=[{'source_row': 2, 'local_date': '2027-05-01', 'expect': 'scheduled', 'venue_name': 'X'}])[0], expect_ok=False, err='ROW_NEEDS_TIME_ZONE')
case('row dated today with no zone needs one', imp(A, rows=[{'source_row': 2, 'local_date': time.strftime('%Y-%m-%d', time.gmtime()), 'expect': 'listed', 'venue_name': 'X'}])[0], expect_ok=False, err='ROW_NEEDS_TIME_ZONE')
for z in ['EST', 'UTC', 'Etc/GMT+5', 'Mars/Olympus']:
    case(f'zone {z} is refused', imp(A, rows=[{'source_row': 2, 'local_date': '2024-05-01', 'timezone': z, 'expect': 'listed', 'venue_name': 'X'}])[0], expect_ok=False, err='ROW_BAD_TIME_ZONE')
case('time + zone without the instant is refused', imp(A, rows=[{'source_row': 2, 'local_date': '2024-05-01', 'local_time': '20:00', 'timezone': 'America/Toronto', 'expect': 'listed', 'venue_name': 'X'}])[0], expect_ok=False, err='ROW_INSTANT_MISMATCH')
case('an instant that is not the booked time is refused', imp(A, rows=[{'source_row': 2, 'local_date': '2024-05-01', 'local_time': '20:00', 'timezone': 'America/Toronto', 'scheduled_at': '2024-05-01T20:00Z', 'expect': 'listed', 'venue_name': 'X'}])[0], expect_ok=False, err='SHOW_LOCAL_FIELDS_INCONSISTENT')
for label, at in [('first', '2026-11-01T05:30:00Z'), ('second', '2026-11-01T06:30:00Z')]:
    case(f'repeated 1:30 AM accepts the {label} instant', imp(A, rows=[{'source_row': 13, 'local_date': '2026-11-01', 'local_time': '01:30', 'timezone': 'America/New_York', 'scheduled_at': at, 'expect': 'scheduled', 'venue_name': 'X'}])[0])
for at in ['2026-03-08T07:30:00Z', '2026-03-08T06:30:00Z']:
    case(f'skipped 2:30 AM refuses {at}', imp(A, rows=[{'source_row': 14, 'local_date': '2026-03-08', 'local_time': '02:30', 'timezone': 'America/New_York', 'scheduled_at': at, 'expect': 'listed', 'venue_name': 'X'}])[0], expect_ok=False, err='SHOW_LOCAL_FIELDS_INCONSISTENT')
case('a venue from outside the artist records is refused', imp(A, rows=[dict(ROWS[1], venue_id=str(uuid.uuid4()))])[0], expect_ok=False, err='VENUE_NOT_IN_RECORDS')
case('the same new venue is created once per import', imp(A)[0] + "RESET ROLE;\nSELECT count(DISTINCT venue_id) FROM shows WHERE source_row = 9 AND import_batch_id IS NOT NULL;", check=lambda s: lines(s)[-1] == '1')

# ── Listings are excluded everywhere a show is used ──
sql, b = imp(A)
L = f"(SELECT id FROM shows WHERE import_batch_id = '{b['id']}' AND source_row = 5)"
S = f"(SELECT id FROM shows WHERE import_batch_id = '{b['id']}' AND source_row = 13)"
D = f"(SELECT id FROM shows WHERE import_batch_id = '{b['id']}' AND source_row = 16)"
counts = f"SELECT (SELECT count(*) FROM performances WHERE user_id = '{A}') || '|' || (SELECT count(*) FROM performances_visible WHERE user_id = '{A}') || '|' || (SELECT count(*) FROM user_songs WHERE user_id = '{A}') || '|' || (SELECT count(*) FROM user_song_performances WHERE user_id = '{A}') || '|' || (SELECT count(*) FROM setlists WHERE show_id IN (SELECT id FROM shows WHERE created_by = '{A}'));\n"
case('no performances, catalogue rows or setlists are created', "RESET ROLE;\n" + counts + sql + "RESET ROLE;\n" + counts, check=lambda s: len(set(lines(s)[::max(1, len(lines(s)) - 1)])) == 1 and lines(s)[0] == lines(s)[-1])
case('upcoming list (status=scheduled) has only the future rows', sql + f"SELECT count(*) FROM shows WHERE created_by = '{A}' AND status = 'scheduled' AND import_batch_id = '{b['id']}';", check=lambda s: lines(s)[-1] == '2')
case('a listing cannot be started', sql + f"SELECT * FROM public.start_scheduled_show({L});", expect_ok=False, err='SHOW_NOT_STARTABLE')
for st in ['scheduled', 'live', 'completed', 'cancelled']:
    case(f'a listing cannot become {st}', sql + f"UPDATE shows SET status = '{st}' WHERE id = {L};", expect_ok=False, err='LISTED_STATUS_LOCKED')
case('a scheduled show cannot become a listing', sql + f"UPDATE shows SET status = 'listed' WHERE id = {S};", expect_ok=False, err='LISTED_STATUS_LOCKED')
case('a listing’s date cannot be edited', sql + f"UPDATE shows SET local_date = '2024-02-16' WHERE id = {L};", expect_ok=False, err='SCHEDULE_LOCKED')
case('a listing cannot be deleted directly', sql + f"DELETE FROM shows WHERE id = {L};", expect_ok=False, err='USE_CANCEL_NOT_DELETE')
case('a capture cannot be attached to a listing', sql + f"INSERT INTO performances (user_id, show_id, venue_name, status, performance_date) VALUES ('{A}', {L}, 'X', 'live', '2024-02-15');", expect_ok=False, err='PERFORMANCE_FOR_LISTED_SHOW')
case('the patch RPC refuses a listing', sql + f"SELECT public.patch_scheduled_show_with_venue({L}, (SELECT updated_at FROM shows WHERE id = {L}), NULL, NULL, NULL, NULL, '{{\"name\": \"x\"}}'::jsonb);", expect_ok=False)
case('import fields cannot be inserted directly', as_user(A) + f"INSERT INTO shows (created_by, status, local_date) VALUES ('{A}', 'scheduled', '2027-01-01');", expect_ok=False, err='IMPORT_FIELDS_RESERVED')
case('a listing cannot be inserted directly', as_user(A) + f"INSERT INTO shows (created_by, status) VALUES ('{A}', 'listed');", expect_ok=False)
case('provenance cannot be changed', sql + f"UPDATE shows SET source_row = 99 WHERE id = {S};", expect_ok=False, err='IMPORT_PROVENANCE_IMMUTABLE')

# ── Start and edit of imported upcoming shows ──
case('a date-only booking can’t be started until it has a start time', sql + f"SELECT * FROM public.start_scheduled_show({D});", expect_ok=False, err='SHOW_NEEDS_START_TIME')
case('after a start time is added (edit), start uses the booked date', sql + f"SELECT public.patch_scheduled_show_with_venue({D}, (SELECT updated_at FROM shows WHERE id = {D}), NULL, NULL, NULL, NULL, '{{\"scheduled_at\": \"2027-11-22T02:00:00Z\", \"timezone\": \"America/Chicago\"}}'::jsonb) \\g /dev/null\nSELECT performance_id FROM public.start_scheduled_show({D}) \\g /dev/null\nRESET ROLE;\nSELECT (SELECT local_date || ' ' || local_time FROM shows WHERE id = {D}) || '|' || performance_date::date FROM performances WHERE show_id = {D};", check=lambda s: lines(s)[-1] == '2027-11-21 20:00:00|2027-11-21')
case('start uses the booked date for a timed show', sql + f"SELECT performance_id FROM public.start_scheduled_show({S}) \\g /dev/null\nRESET ROLE;\nSELECT performance_date::date FROM performances WHERE show_id = {S};", check=lambda s: lines(s)[-1] == '2027-10-31')
case('editing the time through the patch RPC moves local fields with it', sql + f"SELECT public.patch_scheduled_show_with_venue({S}, (SELECT updated_at FROM shows WHERE id = {S}), NULL, NULL, NULL, NULL, '{{\"scheduled_at\": \"2027-10-31T20:15:00Z\", \"timezone\": \"Europe/London\"}}'::jsonb) \\g /dev/null\nRESET ROLE;\nSELECT local_date || ' ' || local_time FROM shows WHERE id = {S};",
     check=lambda s: lines(s)[-1] == '2027-10-31 20:15:00')

# ── Undo ──
case('undo removes an untouched import', sql + f"SELECT (public.undo_show_import('{b['id']}'))->>'status';\nRESET ROLE;\nSELECT count(*) FROM shows WHERE import_batch_id = '{b['id']}';\nSELECT status FROM show_import_batches WHERE id = '{b['id']}';",
     check=lambda s: lines(s)[-3:] == ['undone', '0', 'undone'])
case('undo twice returns the first result', sql + f"SELECT 1 FROM public.undo_show_import('{b['id']}') \\g /dev/null\nSELECT (public.undo_show_import('{b['id']}'))->>'result';", check=lambda s: lines(s)[-1] == 'already_undone')
partly = (sql
  + f"SELECT public.patch_scheduled_show_with_venue({S}, (SELECT updated_at FROM shows WHERE id = {S}), NULL, NULL, NULL, NULL, '{{\"name\": \"Renamed\"}}'::jsonb) \\g /dev/null\n"
  + f"SELECT public.patch_scheduled_show_with_venue({D}, (SELECT updated_at FROM shows WHERE id = {D}), NULL, NULL, NULL, NULL, '{{\"scheduled_at\": \"2027-11-22T02:00:00Z\", \"timezone\": \"America/Chicago\"}}'::jsonb) \\g /dev/null\n"
  + f"SELECT performance_id FROM public.start_scheduled_show({D}) \\g /dev/null\n"
  + f"RESET ROLE;\nINSERT INTO artists (user_id) VALUES ('16525cd0-a878-4450-bc79-2061bc247895') RETURNING id \\gset art_\nINSERT INTO setlists (show_id, artist_id) SELECT id, :'art_id' FROM shows WHERE import_batch_id = '{b['id']}' AND source_row = 4;\n" + as_user(A)
  + f"SELECT jsonb_pretty(public.undo_show_import('{b['id']}'));\nRESET ROLE;\n"
  + f"SELECT 'left:' || string_agg(source_row::text, ',' ORDER BY source_row) FROM shows WHERE import_batch_id = '{b['id']}';\n"
  + f"SELECT 'perf_link:' || count(*) FROM performances WHERE show_id = {D};\n")
case('undo keeps edited, started and setlist rows and says why', partly,
     check=lambda s: '"status": "partly_undone"' in s and '"reason": "edited"' in s and '"reason": "capture_linked"' in s and '"reason": "setlist_attached"' in s and 'left:4,13,16' in s and 'perf_link:1' in s)
case('viewer cannot undo', sql + "RESET ROLE;\n" + as_user(V) + f"SELECT public.undo_show_import('{b['id']}');", expect_ok=False, err='NOT_AUTHORIZED')

# ── Production parity (preflight 2026-10-26) ──
case('status check allows listed (production shows_status_check extended)', "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.shows'::regclass AND conname = 'shows_status_check';",
     check=lambda s: 'listed' in s and 'scheduled' in s and 'cancelled' in s)
case('status check still refuses an unknown status', reg_sql := (as_user(A) + f"INSERT INTO shows (created_by, status, venue_id, scheduled_at, timezone) VALUES ('{A}', 'bogus', (SELECT id FROM venues LIMIT 1), '2027-01-01T20:00Z', 'Europe/London');"), expect_ok=False, err='shows_status_check')
sql, b = imp(A)
L5 = f"(SELECT id FROM shows WHERE import_batch_id = '{b['id']}' AND source_row = 5)"
case('Undo keeps a show referenced by any other table (catalogue-driven check)', sql + f"RESET ROLE;\nCREATE TABLE public.zz_ref_probe (show_id uuid REFERENCES public.shows(id) ON DELETE CASCADE);\nINSERT INTO public.zz_ref_probe SELECT {L5};\n" + as_user(A) + f"SELECT (public.undo_show_import('{b['id']}'))->'kept';",
     check=lambda s: '"reason": "linked_record"' in s and '"source_row": 5' in s)
case('Undo preview (show_import_usage) matches Undo', sql + f"RESET ROLE;\nCREATE TABLE public.zz_ref_probe (show_id uuid REFERENCES public.shows(id) ON DELETE SET NULL);\nINSERT INTO public.zz_ref_probe SELECT {L5};\n" + as_user(A) + f"SELECT string_agg(coalesce(reason,'-'), ',' ORDER BY reason) FROM public.show_import_usage('{b['id']}');\nSELECT string_agg(k->>'reason', ',' ORDER BY k->>'reason') FROM jsonb_array_elements((public.undo_show_import('{b['id']}'))->'kept') k;",
     check=lambda s: lines(s)[-2].replace('-,', '').replace(',-', '').strip('-') == lines(s)[-1])
case('Undo preview: Viewer may read it', sql + "RESET ROLE;\n" + as_user(V) + f"SELECT count(*) FROM public.show_import_usage('{b['id']}');", check=lambda s: lines(s)[-1] == '7')
case('Undo preview: unrelated user refused', sql + "RESET ROLE;\n" + as_user(U) + f"SELECT count(*) FROM public.show_import_usage('{b['id']}');", expect_ok=False, err='NOT_AUTHORIZED')

# ── Existing behaviour unchanged ──
reg = as_user(A) + f"INSERT INTO shows (created_by, status, venue_id, scheduled_at, timezone, scheduled_by) VALUES ('{A}', 'scheduled', (SELECT id FROM venues WHERE name IS NOT NULL LIMIT 1), '2027-03-01T01:00:00Z', 'America/Toronto', '{A}') RETURNING id \\gset\n"
case('existing: Add a show insert still works', reg + "SELECT :'id' IS NOT NULL;", check=lambda s: lines(s)[-1] == 't')
case('existing: start keeps the scheduled date', reg + "SELECT performance_id FROM public.start_scheduled_show(:'id') \\g /dev/null\nRESET ROLE;\nSELECT performance_date::date FROM performances WHERE show_id = :'id';", check=lambda s: lines(s)[-1] == '2027-02-28')
case('existing: a scheduled show still cannot be deleted', reg + "DELETE FROM shows WHERE id = :'id';", expect_ok=False, err='USE_CANCEL_NOT_DELETE')
case('existing: cancel still works', reg + "UPDATE shows SET status = 'cancelled' WHERE id = :'id' RETURNING status;", check=lambda s: lines(s)[-1] == 'cancelled')
case('existing: patch RPC still edits a normal show', reg + "SELECT public.patch_scheduled_show_with_venue(:'id', (SELECT updated_at FROM shows WHERE id = :'id'), NULL, NULL, NULL, NULL, '{\"name\": \"x\"}'::jsonb) \\g /dev/null\nSELECT name FROM shows WHERE id = :'id';", check=lambda s: lines(s)[-1] == 'x')
case('existing: raw performance insert for a scheduled show still refused', reg + f"INSERT INTO performances (user_id, show_id, venue_name, status) VALUES ('{A}', :'id', 'X', 'live');", expect_ok=False, err='PERFORMANCE_INSERT_BYPASSES_SCHEDULE_START')
case('existing: completed shows untouched', "SELECT count(*) FROM shows WHERE local_date IS NOT NULL OR import_batch_id IS NOT NULL;", check=lambda s: lines(s)[-1] == '0')

# ── Concurrency (commits, then cleans up) ──
def run_bg(sql, box, key):
    box[key] = psql(sql, timeout=120)
fp = psql('BEGIN;\n' + as_user(A) + f"SELECT public.show_records_fingerprint('{A}');\nCOMMIT;")[1].splitlines()[-1]
b1, b2 = batch(), batch()
box = {}
t1 = threading.Thread(target=run_bg, args=('BEGIN;\n' + imp(A, b1, fp=fp)[0] + "SELECT pg_sleep(3);\nCOMMIT;\n", box, 'a'))
t2 = threading.Thread(target=run_bg, args=('BEGIN;\n' + imp(M, b2, fp=fp)[0] + "COMMIT;\n", box, 'b'))
t1.start(); time.sleep(1); t2.start(); t1.join(); t2.join()
results.append(('concurrent imports: first wins, second is sent back as stale', box['a'][0] == 0 and box['b'][0] != 0 and 'IMPORT_STALE' in box['b'][2], (box['b'][2] or box['a'][2])[-200:]))
b3 = batch(); fp = psql('BEGIN;\n' + as_user(A) + f"SELECT public.show_records_fingerprint('{A}');\nCOMMIT;")[1].splitlines()[-1]
box = {}
t1 = threading.Thread(target=run_bg, args=('BEGIN;\n' + imp(A, b3, fp=fp)[0] + "SELECT pg_sleep(3);\nCOMMIT;\n", box, 'a'))
t2 = threading.Thread(target=run_bg, args=('BEGIN;\n' + imp(A, b3, fp=fp)[0] + "COMMIT;\n", box, 'b'))
t1.start(); time.sleep(1); t2.start(); t1.join(); t2.join()
n = psql(f"SELECT count(*) FROM shows WHERE import_batch_id = '{b3['id']}';")[1]
results.append(('double tap during a slow commit: one import, second returns it', box['a'][0] == 0 and box['b'][0] == 0 and '"already_imported"' in box['b'][1] and n == '7', f"n={n} {box['b'][1][-200:]} {box['b'][2][-200:]}"))
for bid in [b1['id'], b3['id']]:
    psql('BEGIN;\n' + as_user(A) + f"SELECT public.undo_show_import('{bid}');\nCOMMIT;")
psql(f"DELETE FROM show_import_batches WHERE id IN ('{b1['id']}', '{b3['id']}', '{b2['id']}');")
left = psql("SELECT count(*) FROM shows WHERE import_batch_id IS NOT NULL OR local_date IS NOT NULL;")[1]
results.append(('cleanup: no imported rows left', left == '0', left))

fails = [r for r in results if not r[1]]
for name, ok, d in results: print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  -- {d}'))
print(f'\n{len(results) - len(fails)}/{len(results)} passed')
sys.exit(1 if fails else 0)
