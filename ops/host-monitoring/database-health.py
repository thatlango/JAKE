#!/usr/bin/env python3
import json, subprocess, pathlib, datetime, os, sys
ROOT=pathlib.Path('/opt/tuku')
OUT=ROOT/'platform/monitoring/database-health.json'

def envfile(path):
    d={}
    for raw in pathlib.Path(path).read_text(errors='ignore').splitlines():
        s=raw.strip()
        if not s or s.startswith('#') or '=' not in s:
            continue
        k,v=s.split('=',1)
        d[k]=v.strip().strip('"').strip("'")
    return d

def container_env(container):
    r=subprocess.run(['docker','inspect','-f','{{range .Config.Env}}{{println .}}{{end}}',container],text=True,capture_output=True)
    d={}
    if r.returncode==0:
        for s in r.stdout.splitlines():
            if '=' in s:
                k,v=s.split('=',1); d[k]=v
    return d

core=envfile(ROOT/'secrets/tuku-core-db.env')
iq=envfile(ROOT/'secrets/tukuiq-db.env')
def db_from_container(label, container, database=None):
    env=container_env(container)
    user=env.get('POSTGRES_USER') or env.get('RADAR_DB_USER') or ''
    password=env.get('POSTGRES_PASSWORD') or env.get('RADAR_DB_PASSWORD') or env.get('KELA_DB_PASSWORD') or ''
    db=database or env.get('POSTGRES_DB') or env.get('RADAR_DB_NAME') or ''
    return (label,container,user,password,db)

platform=container_env('tuku-platform-postgres')
DBS=[
 ('tuku-core','tuku-platform-postgres',core.get('TUKU_CORE_DB_USER',''),core.get('TUKU_CORE_DB_PASSWORD',''),core.get('TUKU_CORE_DB_NAME','')),
 ('tukuiq','tuku-platform-postgres',iq.get('TUKUIQ_DB_USER',''),iq.get('TUKUIQ_DB_PASSWORD',''),iq.get('TUKUIQ_DB_NAME','')),
 ('impactos','tuku-platform-postgres',platform.get('POSTGRES_USER',''),platform.get('POSTGRES_PASSWORD',''),'impactos'),
 db_from_container('ecitaa','ecitaa-postgis'),
 db_from_container('traffiq','traffiq-iq-backend-postgres-1'),
 db_from_container('units','units-postgres'),
 db_from_container('synced','synced-postgres'),
 db_from_container('radar','radar-db'),
 db_from_container('steady','steady-steady-db-1'),
 db_from_container('nena','nena-postgres'),
 db_from_container('tukupay','tukupay-db'),
 db_from_container('jakeos','jakeos-db'),
 db_from_container('kela','kela-db'),
 db_from_container('lendflow','lendflow-db'),
 db_from_container('prediq','prediq-db'),
 db_from_container('bcp','bcp-vps-db'),
 db_from_container('tukutuku-site','tukutuku-site-postgres'),
]
SQL="""
WITH a AS (
 SELECT count(*) FILTER (WHERE pid<>pg_backend_pid())::int connections,
        count(*) FILTER (WHERE pid<>pg_backend_pid() AND state='active')::int active,
        count(*) FILTER (WHERE pid<>pg_backend_pid() AND state='idle in transaction' AND xact_start < now()-interval '5 minutes')::int idle_tx_5m,
        count(*) FILTER (WHERE pid<>pg_backend_pid() AND state='active' AND query_start < now()-interval '5 minutes')::int long_active_5m,
        count(*) FILTER (WHERE pid<>pg_backend_pid() AND wait_event_type='Lock')::int lock_waiters
 FROM pg_stat_activity WHERE datname=current_database()
), d AS (
 SELECT xact_commit,xact_rollback,blks_read,blks_hit,temp_files,temp_bytes,deadlocks,blk_read_time,blk_write_time
 FROM pg_stat_database WHERE datname=current_database()
), t AS (
 SELECT coalesce(sum(n_live_tup),0)::bigint live_tuples,
        coalesce(sum(n_dead_tup),0)::bigint dead_tuples,
        coalesce(max(CASE WHEN n_live_tup+n_dead_tup>1000 THEN n_dead_tup::numeric/nullif(n_live_tup+n_dead_tup,0) ELSE 0 END),0) max_dead_ratio
 FROM pg_stat_user_tables
)
SELECT json_build_object(
 'database',current_database(),
 'size_bytes',pg_database_size(current_database()),
 'connections',a.connections,'active',a.active,
 'max_connections',current_setting('max_connections')::int,
 'connection_percent',round(100.0*a.connections/nullif(current_setting('max_connections')::numeric,0),1),
 'idle_in_transaction_over_5m',a.idle_tx_5m,
 'active_over_5m',a.long_active_5m,
 'lock_waiters',a.lock_waiters,
 'commits',d.xact_commit,'rollbacks',d.xact_rollback,
 'cache_hit_percent',round(100.0*d.blks_hit/nullif(d.blks_hit+d.blks_read,0),2),
 'temp_files',d.temp_files,'temp_bytes',d.temp_bytes,'deadlocks',d.deadlocks,
 'block_read_ms',round(d.blk_read_time::numeric,2),'block_write_ms',round(d.blk_write_time::numeric,2),
 'live_tuples',t.live_tuples,'dead_tuples',t.dead_tuples,'max_table_dead_ratio',round(t.max_dead_ratio,4),
 'track_io_timing',current_setting('track_io_timing'),
 'log_lock_waits',current_setting('log_lock_waits')
) FROM a,d,t;
"""

def query(container,user,password,db):
    if not all([container,user,password,db]):
        return None,'missing database credentials'
    r=subprocess.run(['docker','exec','-e',f'PGPASSWORD={password}',container,'psql','-XAtq','-v','ON_ERROR_STOP=1','-U',user,'-d',db,'-c',SQL],text=True,capture_output=True,timeout=20)
    if r.returncode:
        return None,r.stderr.strip()[-500:]
    try:
        return json.loads(r.stdout.strip()),None
    except Exception as e:
        return None,f'parse error: {e}'

results=[]; severity='ok'; reasons=[]
for label,c,u,pw,db in DBS:
    m,err=query(c,u,pw,db)
    item={'label':label,'container':c,'ok':m is not None}
    if err:
        item['error']=err; severity='warning'; reasons.append(f'{label}_query_failed')
    else:
        item['metrics']=m
        cp=float(m.get('connection_percent') or 0)
        lock=int(m.get('lock_waiters') or 0)
        idle=int(m.get('idle_in_transaction_over_5m') or 0)
        longq=int(m.get('active_over_5m') or 0)
        dead=float(m.get('max_table_dead_ratio') or 0)
        if cp>=90:
            severity='critical'; reasons.append(f'{label}_connections_over_90pct')
        elif cp>=80 and severity!='critical':
            severity='warning'; reasons.append(f'{label}_connections_over_80pct')
        if lock>0 and severity!='critical': severity='warning'; reasons.append(f'{label}_lock_waiters')
        if idle>0 and severity!='critical': severity='warning'; reasons.append(f'{label}_idle_transaction_over_5m')
        if longq>0 and severity!='critical': severity='warning'; reasons.append(f'{label}_active_query_over_5m')
        if dead>=0.20 and severity!='critical': severity='warning'; reasons.append(f'{label}_table_dead_tuple_ratio_high')
    results.append(item)
obj={'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z'),'severity':severity,'reasons':reasons,'databases':results}
OUT.parent.mkdir(parents=True,exist_ok=True)
tmp=OUT.with_suffix('.tmp')
tmp.write_text(json.dumps(obj,indent=2)+'\n')
os.chmod(tmp,0o640)
tmp.replace(OUT)
print(json.dumps(obj,indent=2))
sys.exit(0)
