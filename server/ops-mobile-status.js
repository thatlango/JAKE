'use strict';
const crypto=require('crypto');
const db=require('./db');

async function upsertCard(ref,title,summary,metadata={}){
  const existing=(await db.query(`SELECT id FROM attention_signals WHERE source='ops_status' AND source_ref=$1 AND resolved=false ORDER BY created_at DESC LIMIT 1`,[ref])).rows[0];
  if(existing){
    await db.query(`UPDATE attention_signals SET title=$2,summary=$3,severity='low',signal_type='infrastructure_status',action_url='/?module=operations',due_at=NULL,metadata=$4::jsonb,updated_at=NOW() WHERE id=$1`,[existing.id,title,summary,JSON.stringify(metadata)]);
    return existing.id;
  }
  const id=`ops_status_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  await db.query(`INSERT INTO attention_signals(id,signal_type,title,summary,severity,source,source_ref,action_url,metadata) VALUES($1,'infrastructure_status',$2,$3,'low','ops_status',$4,'/?module=operations',$5::jsonb)`,[id,title,summary,ref,JSON.stringify(metadata)]);
  return id;
}

const pct=v=>Number.isFinite(Number(v))?`${Number(v).toFixed(0)}%`:'—';
const days=v=>v?Math.ceil((new Date(v)-Date.now())/86400000):null;

async function syncOpsStatusCards(){
  const host=(await db.query(`SELECT h.id,h.label,h.hostname,m.captured_at,m.cpu_percent,m.memory_percent,m.disk_percent,m.uptime_seconds,m.metadata FROM ops_hosts h LEFT JOIN LATERAL(SELECT * FROM ops_host_metrics WHERE host_id=h.id ORDER BY captured_at DESC LIMIT 1)m ON true ORDER BY h.last_seen_at DESC NULLS LAST LIMIT 1`)).rows[0];
  if(host){
    const containers=Array.isArray(host.metadata?.containers)?host.metadata.containers:[];
    const running=containers.filter(c=>c.running!==false&&!String(c.status||'').toLowerCase().includes('exited')).length;
    await upsertCard('vps',`VPS · ${host.label||host.hostname||'Tuku production'}`,`CPU ${pct(host.cpu_percent)} · memory ${pct(host.memory_percent)} · disk ${pct(host.disk_percent)}${containers.length?` · ${running}/${containers.length} containers running`:''}.`,{hostId:host.id,capturedAt:host.captured_at,cpuPercent:host.cpu_percent,memoryPercent:host.memory_percent,diskPercent:host.disk_percent,containers:{running,total:containers.length}});
  }

  const roots=(await db.query(`SELECT DISTINCT ON(root_domain) root_domain,registrar,expires_at,tls_expires_at,status,last_checked_at FROM ops_domains WHERE kind='registrable' ORDER BY root_domain,last_checked_at DESC NULLS LAST`)).rows;
  if(roots.length){
    const summary=roots.map(d=>{const registration=days(d.expires_at),tls=days(d.tls_expires_at);return `${d.root_domain}: ${registration==null?'registration pending':`${registration}d registration`}${tls==null?'':` · ${tls}d TLS`}`;}).join(' | ');
    await upsertCard('domains','Domains & certificates',summary,{domains:roots.map(d=>({rootDomain:d.root_domain,registrar:d.registrar,expiresAt:d.expires_at,tlsExpiresAt:d.tls_expires_at,status:d.status,lastCheckedAt:d.last_checked_at}))});
  }

  const services=(await db.query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE consecutive_failures=0 AND last_status>=200 AND last_status<500)::int AS healthy FROM ops_services WHERE enabled=true`)).rows[0];
  if(services?.total)await upsertCard('services','Tuku services',`${services.healthy}/${services.total} production endpoints responding.`,{healthy:services.healthy,total:services.total});
  return{host:!!host,domains:roots.length,services:services?.total||0};
}

module.exports={syncOpsStatusCards};
