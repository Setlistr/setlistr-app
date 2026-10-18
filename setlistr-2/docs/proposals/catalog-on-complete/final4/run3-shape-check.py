import json,sys
t=open(sys.argv[1]).read(); d=json.loads(t[t.index('{'):t.rindex('}')+1])
ALL7=['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']; DML=['DELETE','INSERT','SELECT','UPDATE']
G={f'{t} → {r}':(DML if t=='performances' else ALL7) for t in ['user_songs','performances','performance_songs','user_song_performances'] for r in ['anon','authenticated']}
DEF={"user_songs.id":"gen_random_uuid()","user_songs.source":"'show'::text","user_songs.created_at":"now()","user_song_performances.id":"gen_random_uuid()","user_songs.rejected_count":"0","user_songs.confirmed_count":"1","user_songs.last_confirmed_at":"now()","user_songs.corrected_to_count":"0","user_song_performances.created_at":"now()"}
mode=sys.argv[2] if len(sys.argv)>2 else 'prod'
if mode=='revoked': G={k:DML for k in G}
bad=[]
if d['G_table_grants']!=G: bad.append(('grants',{k:v for k,v in d['G_table_grants'].items() if G.get(k)!=v}))
if d['D_column_defaults']!=DEF: bad.append(('defaults',d['D_column_defaults']))
print(('MATCHES PRODUCTION RUN 3' if mode=='prod' else 'MATCHES PRODUCTION RUN 3 WITH THE REVOKE') if not bad else 'DIFFERS', *bad, '| pg_net here', d['X_webhook_dependencies']['pg_net'], '(production 0.19.5)')
