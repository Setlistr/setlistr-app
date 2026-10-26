#!/usr/bin/env python3
# Undo's reference helper (import_show_use_reason) and its preview
# (show_import_usage). DISPOSABLE STACK ONLY; every case rolls back.
import sys
sys.argv = sys.argv[:1]
exec(open('0028_show_imports.test.py').read().split('results = []')[0])
results = []
def case(name, sql, expect_ok=True, err=None, check=None):
    code, so, se = psql('BEGIN;\n' + sql + '\nROLLBACK;\n')
    ok = (code == 0) if expect_ok else (code != 0 and (err is None or err in se))
    if ok and check: ok = bool(check(so))
    results.append((name, ok, (se or so)[-300:]))
lines = lambda s: [l for l in s.splitlines() if l.strip()]

case('anon and authenticated cannot execute the reference helper',
     "SELECT has_function_privilege('anon', 'public.import_show_use_reason(uuid)', 'EXECUTE') || '|' || has_function_privilege('authenticated', 'public.import_show_use_reason(uuid)', 'EXECUTE') || '|' || has_function_privilege('authenticated', 'public.show_import_usage(uuid)', 'EXECUTE') || '|' || has_function_privilege('anon', 'public.show_import_usage(uuid)', 'EXECUTE');",
     check=lambda s: lines(s)[-1] == 'false|false|true|false')
case('a signed-in user calling the helper directly is refused', as_user(A) + "SELECT public.import_show_use_reason(gen_random_uuid());", expect_ok=False, err='permission denied')
sql, b = imp(A)
case('the preview refuses an unrelated user', sql + "RESET ROLE;\n" + as_user(U) + f"SELECT * FROM public.show_import_usage('{b['id']}');", expect_ok=False, err='NOT_AUTHORIZED')
case('the preview gives the same answer for an unknown batch (no existence leak)', as_user(U) + "SELECT * FROM public.show_import_usage(gen_random_uuid());", expect_ok=False, err='NOT_AUTHORIZED')
case('the preview returns only show ids and reason codes',
     "SELECT pg_get_function_result('public.show_import_usage(uuid)'::regprocedure);",
     check=lambda s: lines(s)[-1] == 'TABLE(show_id uuid, reason text)')
L5 = f"(SELECT id FROM shows WHERE import_batch_id = '{b['id']}' AND source_row = 5)"
odd = ('RESET ROLE;\nCREATE SCHEMA "zz Other; Schema";\n'
       'CREATE TABLE "zz Other; Schema"."Odd ""Ref"" Table" ("Show ID; DROP TABLE x" uuid REFERENCES public.shows(id) ON DELETE CASCADE);\n'
       f'INSERT INTO "zz Other; Schema"."Odd ""Ref"" Table" SELECT {L5};\n')
case('Undo finds a reference from a table outside public, with quoted names, and keeps the show',
     sql + odd + as_user(A) + f"SELECT (public.undo_show_import('{b['id']}'))->'kept';\nRESET ROLE;\nSELECT count(*) FROM shows WHERE import_batch_id = '{b['id']}';\nSELECT count(*) FROM \"zz Other; Schema\".\"Odd \"\"Ref\"\" Table\";",
     check=lambda s: '"reason": "linked_record"' in s and '"source_row": 5' in s and lines(s)[-2] == '1' and lines(s)[-1] == '1')
case('the preview reports the same reference', sql + odd + as_user(A) + f"SELECT reason FROM public.show_import_usage('{b['id']}') WHERE show_id = {L5};", check=lambda s: lines(s)[-1] == 'linked_record')
case('revoked between import and Undo: Undo refused, nothing removed',
     sql + f"RESET ROLE;\nUPDATE artist_delegates SET revoked_at = now() WHERE artist_id = '{A}' AND delegate_id = '{M}';\n" + as_user(M) + f"SELECT public.undo_show_import('{b['id']}');", expect_ok=False, err='NOT_AUTHORIZED')
for n, okk, d in results: print(('PASS ' if okk else 'FAIL ') + n + ('' if okk else f'  -- {d}'))
print(f"\n{sum(1 for r in results if r[1])}/{len(results)} passed"); sys.exit(0 if all(r[1] for r in results) else 1)
