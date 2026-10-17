import json,sys
t=open(sys.argv[1]).read(); d=json.loads(t[t.index('{'):t.rindex('}')+1])
# Production Run 1 (2026-10-17T18:47Z), the parts the migration and tests depend on.
P_cols={('performance_songs','performance_id'):'uuid',('performance_songs','title'):'text',('performance_songs','position'):'integer',('performance_songs','artist_removed'):'boolean',('performance_songs','source'):'text',
 ('performances','id'):'uuid',('performances','user_id'):'uuid',('performances','status'):'text',
 ('user_song_performances','performance_id'):'text',('user_song_performances','user_id'):'uuid',('user_song_performances','normalized_title'):'text',('user_song_performances','id'):'uuid',('user_song_performances','created_at'):'timestamp with time zone',
 ('user_songs','user_id'):'uuid',('user_songs','song_title'):'text',('user_songs','confirmed_count'):'integer',('user_songs','canonical_artist'):'text',('user_songs','last_confirmed_at'):'timestamp with time zone',
 ('user_songs','composer'):'text',('user_songs','corrected_to_count'):'integer',('user_songs','created_at'):'timestamp with time zone',('user_songs','isrc'):'text',('user_songs','publisher'):'text',('user_songs','rejected_count'):'integer',('user_songs','source'):'text',('user_songs','id'):'uuid'}
P_null={('user_song_performances','user_id'):'YES',('user_songs','user_id'):'YES',('user_song_performances','performance_id'):'NO',('performance_songs','performance_id'):'NO'}
P_cons={("performances","performances_status_check"):"CHECK ((status = ANY (ARRAY['draft'::text, 'live'::text, 'processing'::text, 'review'::text, 'complete'::text])))",
 ("user_song_performances","user_song_performances_user_id_performance_id_normalized_ti_key"):"UNIQUE (user_id, performance_id, normalized_title)",
 ("user_songs","user_songs_user_id_song_title_key"):"UNIQUE (user_id, song_title)"}
P_pol={('user_songs','user_songs_self'):('ALL','can_act_for(user_id)',None),('user_song_performances','user_song_performances_self'):('ALL','can_act_for(user_id)',None),
 ('performances','performances_write'):('UPDATE','can_write_for(user_id)','can_write_for(user_id)'),('performances','performances_read'):('SELECT','can_act_for(user_id)',None)}
P_idx={'idx_usp_lookup','user_song_performances_user_id_performance_id_normalized_ti_key','user_songs_user_id_song_title_key','performance_songs_pkey','performance_songs_recording_id_idx','user_song_performances_pkey','user_songs_pkey'}
P_trg={'notion_show_count','performances_lock_links','performances_lock_owner','performances_reject_scheduled_bypass','performances_require_authorized_creation'}
bad=[]
cols={(c['t'],c['c']):c for c in d['01_columns']}
for k,v in P_cols.items():
    if k not in cols or cols[k]['type']!=v: bad.append(('column',k,v,cols.get(k,{}).get('type')))
for k,v in P_null.items():
    if cols.get(k,{}).get('null')!=v: bad.append(('nullable',k,v,cols.get(k,{}).get('null')))
extra=[k for k in cols if k[0] in('user_songs','user_song_performances') and k not in P_cols]
if extra: bad.append(('extra catalogue columns',extra))
cons={(c['t'],c['name']):c['def'] for c in d['02_constraints']}
for k,v in P_cons.items():
    if cons.get(k)!=v: bad.append(('constraint',k,cons.get(k)))
pol={(p['t'],p['name']):(p['cmd'],p['using'],p['check']) for p in d['04_policies']}
for k,v in P_pol.items():
    if pol.get(k)!=v: bad.append(('policy',k,pol.get(k)))
cat_pols=sorted(k for k in pol if k[0] in('user_songs','user_song_performances'))
if cat_pols!=sorted(k for k in P_pol if k[0] in('user_songs','user_song_performances')): bad.append(('catalogue policy set',cat_pols))
rls={r['t']:r['rls'] for r in d['03_rls']}
if not all(rls.values()): bad.append(('rls',rls))
idx={i['name'] for i in d['09_indexes']}
if idx!=P_idx: bad.append(('indexes', sorted(idx-P_idx), sorted(P_idx-idx)))
trg={t['name'] for t in d['06b_triggers']}
if trg-{'performances_record_catalog'}!=P_trg: bad.append(('triggers',sorted(trg)))
acc={f['name']:f['def'] for f in d['05_access_functions']}
if "role in ('manager', 'tour_manager', 'band_member')" not in acc.get('can_write_for',''): bad.append(('can_write_for',))
if 'role in' in acc.get('can_act_for',''): bad.append(('can_act_for has a role filter',))
print('MATCHES PRODUCTION' if not bad else 'DIFFERS:'); [print(' ',b) for b in bad]
print('extra here (expected: the migration):', sorted(trg - P_trg))
