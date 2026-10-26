#!/usr/bin/env python3
# Undo racing with start, edit and cancel; permission rechecked at Undo.
# DISPOSABLE STACK ONLY. Two real sessions per case; each case commits its own
# import and cleans up after itself.
import json, subprocess, threading, time, uuid, sys
sys.argv = sys.argv[:1]
exec(open('0028_show_imports.test.py').read().split('results = []')[0])   # helpers, users A/M/V, ROWS, batch(), imp()

def commit_import():
    b = batch()
    code, out, err = psql('BEGIN;\n' + imp(A, b)[0] + 'COMMIT;')
    assert code == 0, err
    ids = dict(l.split('|') for l in psql(f"SELECT source_row || ':' || local_date, id FROM shows WHERE import_batch_id = '{b['id']}';")[1].splitlines())
    return b['id'], ids
def bg(sql, box, k): box[k] = psql(sql, timeout=120)
def race(first, second, hold=3):
    box = {}
    t1 = threading.Thread(target=bg, args=('BEGIN;\n' + first + f"SELECT pg_sleep({hold});\nCOMMIT;", box, 'a'))
    t2 = threading.Thread(target=bg, args=('BEGIN;\n' + second + 'COMMIT;', box, 'b'))
    t1.start(); time.sleep(1); t2.start(); t1.join(); t2.join(); return box['a'], box['b']
def cleanup(bid):
    psql(f"BEGIN; SET LOCAL session_replication_role = replica; DELETE FROM performances WHERE show_id IN (SELECT id FROM shows WHERE import_batch_id = '{bid}'); DELETE FROM shows WHERE import_batch_id = '{bid}'; DELETE FROM show_import_batches WHERE id = '{bid}'; COMMIT;")
res = []
def check(name, cond, detail=''): res.append((name, bool(cond), detail))
UNDO = lambda bid, who=A: as_user(who) + f"SELECT public.undo_show_import('{bid}');\n"
START = lambda sid, who=A: as_user(who) + f"SELECT performance_id FROM public.start_scheduled_show('{sid}');\n"
PATCH = lambda sid, who=A: as_user(who) + f"SELECT public.patch_scheduled_show_with_venue('{sid}', (SELECT updated_at FROM shows WHERE id = '{sid}'), NULL, NULL, NULL, NULL, '{{\"name\": \"Raced edit\"}}'::jsonb);\n"
CANCEL = lambda sid, who=A: as_user(who) + f"UPDATE shows SET status = 'cancelled' WHERE id = '{sid}' RETURNING status;\n"

for label, act, reason in [('start', START, 'capture_linked'), ('edit', PATCH, 'edited'), ('cancel', CANCEL, 'cancelled')]:
    # The teammate's action commits first; Undo waits on the row lock, then keeps the show.
    bid, ids = commit_import(); sid = ids['13:2027-10-31']
    a, b = race(act(sid, M), UNDO(bid))
    kept = psql(f"SELECT undo_result FROM show_import_batches WHERE id = '{bid}';")[1]
    check(f'{label} commits first, Undo waits and keeps the show ({reason})', a[0] == 0 and b[0] == 0 and f'"reason": "{reason}"' in kept and psql(f"SELECT count(*) FROM shows WHERE id = '{sid}';")[1] == '1', (a[2] or b[2] or kept)[-300:])
    cleanup(bid)
    # Undo commits first; the teammate's action then finds no show and nothing is half-done.
    bid, ids = commit_import(); sid = ids['13:2027-10-31']
    a, b = race(UNDO(bid), act(sid, M))
    gone = psql(f"SELECT count(*) FROM shows WHERE id = '{sid}';")[1] == '0'
    orphan = psql(f"SELECT count(*) FROM performances WHERE show_id = '{sid}';")[1]
    ok_b = (b[0] != 0) if label != 'cancel' else ('UPDATE 0' in b[1] or b[1].strip().endswith('') and 'cancelled' not in b[1])
    check(f'Undo commits first, then {label} finds nothing to act on (no orphan, nothing recreated)', a[0] == 0 and gone and orphan == '0' and ok_b, (b[2] or b[1])[-300:])
    cleanup(bid)

# Permission is checked when Undo runs, not when the import was made.
bid, ids = commit_import()
psql(f"UPDATE artist_delegates SET revoked_at = now() WHERE artist_id = '{A}' AND delegate_id = '{M}';")
code, out, err = psql('BEGIN;\n' + UNDO(bid, M) + 'COMMIT;')
check('a teammate revoked after the import can’t Undo it', code != 0 and 'NOT_AUTHORIZED' in err and psql(f"SELECT count(*) FROM shows WHERE import_batch_id = '{bid}';")[1] == '7', err[-200:])
code, out, err = psql('BEGIN;\n' + imp(M, batch())[0] + 'COMMIT;')
check('…or import', code != 0 and 'NOT_AUTHORIZED' in err, err[-200:])
psql(f"UPDATE artist_delegates SET revoked_at = NULL WHERE artist_id = '{A}' AND delegate_id = '{M}';")
cleanup(bid)

for n, okk, d in res: print(('PASS ' if okk else 'FAIL ') + n + ('' if okk else f'  -- {d}'))
print(f"\n{sum(1 for r in res if r[1])}/{len(res)} passed"); sys.exit(0 if all(r[1] for r in res) else 1)
