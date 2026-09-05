'use strict';
const crypto=require('crypto');
const tls=require('tls');
const express=require('express');
const db=require('./db');
const {momentumAuth}=require('./momentum-auth');

const ROOT_DOMAINS=['tukutuku.org','getprediq.site'];
const SERVICE_SEED=[
  ['jakeos','JakeOS','JakeOS','https://jakeos.tukutuku.org/health',true],
  ['momentum','Momentum API','Momentum','https://momentum.tukutuku.org/health',true],
  ['core','Tuku Core','Tuku Core','https://core.tukutuku.org/health',true],
  ['units','Units','Units','https://units.tukutuku.org',true],
  ['kela','Kela','Kela','https://kela.tukutuku.org',true],
  ['kela-api','Kela API','Kela','https://api.kela.tukutuku.org',true],
  ['lendflow','LendFlow','LendFlow','https://lendflow.tukutuku.org',true],
  ['tukuiq','TukuIQ','TukuIQ','https://tukuiq.tukutuku.org',true],
  ['ecitaa','ECITAA','ECITAA','https://ecitaa.tukutuku.org',true],
  ['ecitaa-api','ECITAA API','ECITAA','https://ecitaaapi.tukutuku.org',true],
  ['nena','NENA','NENA','https://nena.tukutuku.org',false],
  ['radar','Radar','Radar','https://radar.tukutuku.org',false],
  ['synced-api','Synced API','Synced','https://api.synced.tukutuku.org',true],
  ['traffiq','Traffiq','Traffiq','https://traffiq.tukutuku.org',false],
  ['traffiq-api','Traffiq API','Traffiq','https://api.traffiq.tukutuku.org',false],
  ['bcp','BCP','BCP','https://bcp-next.tukutuku.org',false],
  ['prediq','PredIQ','PredIQ','https://getprediq.site',true],
  ['prediq-api','PredIQ API','PredIQ','https://api.getprediq.site',true],
  ['site-api','Tuku Site API','Tukutuku','https://site-api.tukutuku.org/health',false],
  ['steady','Steady / BCP API','BCP','https://steady.tukutuku.org',false]
];

const nowIso=()=>new Date().toISOString();
const idSafe=value=>String(value||'').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,100);
const pct=value=>Number.isFinite(Number(value))?Math.max(0,Math.min(100,Number(value))):null;
function secureEqual(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y);}

async function ensureOpsSeed(){
  if(!db.isReady())return;
  for(const [id,name,product,url,critical] of SERVICE_SEED){
    await db.query(`INSERT INTO ops_services(id,name,product,url,kind,critical,enabled,metadata)
      VALUES($1,$2,$3,$4,'http',$5,true,'{}'::jsonb)
      ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,product=EXCLUDED.product,url=EXCLUDED.url,critical=EXCLUDED.critical,enabled=true`,[id,name,product,url,critical]);
    const host=new URL(url).hostname;
    const root=ROOT_DOMAINS.find(d=>host===d||host.endsWith(`.${d}`))||host;
    const kind=host===root?'registrable':'subdomain';
    await db.query(`INSERT INTO ops_domains(id,host,root_domain,kind,product,status,metadata)
      VALUES($1,$2,$3,$4,$5,'unknown','{}'::jsonb)
      ON CONFLICT(id) DO UPDATE SET host=EXCLUDED.host,root_domain=EXCLUDED.root_domain,kind=EXCLUDED.kind,product=EXCLUDED.product`,[`domain-${idSafe(host)}`,host,root,kind,product]);
  }
}

async function upsertSignal({ref,title,summary,severity='medium',dueAt=null,metadata={}}){
  const existing=(await db.query(`SELECT id FROM attention_signals WHERE source='ops' AND source_ref=$1 AND resolved=false ORDER BY created_at DESC LIMIT 1`,[ref])).rows[0];
  if(existing){
    await db.query(`UPDATE attention_signals SET title=$2,summary=$3,severity=$4,due_at=$5,metadata=$6::jsonb,updated_at=NOW() WHERE id=$1`,[existing.id,title,summary,severity,dueAt,JSON.stringify(metadata)]);
    return{created:false,id:existing.id};
  }
  const id=`ops_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  await db.query(`INSERT INTO attention_signals(id,signal_type,title,summary,severity,source,source_ref,action_url,due_at,metadata)
    VALUES($1,'infrastructure',$2,$3,$4,'ops',$5,'/?module=operations',$6,$7::jsonb)`,[id,title,summary,severity,ref,dueAt,JSON.stringify(metadata)]);
  return{created:true,id};
}
async function resolveSignal(ref){await db.query(`UPDATE attention_signals SET resolved=true,resolved_at=NOW(),updated_at=NOW() WHERE source='ops' AND source_ref=$1 AND resolved=false`,[ref]);}

async function recordHostSnapshot(payload={}){
  const h=payload.host||payload;
  const hostId=idSafe(h.id||h.hostname||h.label||'tuku-prod-ovh')||'tuku-prod-ovh';
  const metadata={...payload,containers:Array.isArray(payload.containers)?payload.containers.slice(0,250):[]};
  await db.query(`INSERT INTO ops_hosts(id,label,hostname,provider,region,status,last_seen_at,metadata)
    VALUES($1,$2,$3,$4,$5,'online',NOW(),$6::jsonb)
    ON CONFLICT(id) DO UPDATE SET label=EXCLUDED.label,hostname=EXCLUDED.hostname,provider=EXCLUDED.provider,region=EXCLUDED.region,status='online',last_seen_at=NOW(),metadata=EXCLUDED.metadata`,[
      hostId,String(h.label||'Tuku production VPS').slice(0,120),String(h.hostname||hostId).slice(0,255),String(h.provider||'OVH').slice(0,80),String(h.region||'').slice(0,80),JSON.stringify({kernel:h.kernel||null,arch:h.arch||null})
    ]);
  const row={cpu:pct(h.cpu_percent??h.cpuPercent),memory:pct(h.memory_percent??h.memoryPercent),disk:pct(h.disk_percent??h.diskPercent)};
  await db.query(`INSERT INTO ops_host_metrics(host_id,captured_at,cpu_percent,memory_percent,disk_percent,load1,load5,load15,uptime_seconds,metadata)
    VALUES($1,NOW(),$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,[hostId,row.cpu,row.memory,row.disk,Number(h.load1||0),Number(h.load5||0),Number(h.load15||0),Number(h.uptime_seconds??h.uptimeSeconds??0),JSON.stringify(metadata)]);
  if(row.disk!=null&&row.disk>=90)await upsertSignal({ref:`host:${hostId}:disk`,title:'VPS disk critically high',summary:`Disk utilisation is ${row.disk.toFixed(1)}%. Free capacity should be recovered immediately.`,severity:'critical',metadata:{hostId,diskPercent:row.disk}});
  else if(row.disk!=null&&row.disk>=80)await upsertSignal({ref:`host:${hostId}:disk`,title:'VPS disk capacity needs attention',summary:`Disk utilisation is ${row.disk.toFixed(1)}%.`,severity:'high',metadata:{hostId,diskPercent:row.disk}});
  else await resolveSignal(`host:${hostId}:disk`);
  if(row.memory!=null&&row.memory>=95)await upsertSignal({ref:`host:${hostId}:memory`,title:'VPS memory pressure is high',summary:`Memory utilisation is ${row.memory.toFixed(1)}%.`,severity:'high',metadata:{hostId,memoryPercent:row.memory}});else await resolveSignal(`host:${hostId}:memory`);
  return{hostId};
}

function tlsExpiry(host){
  return new Promise(resolve=>{
    const socket=tls.connect({host,port:443,serverName:host,rejectUnauthorized:false,timeout:7000},()=>{
      const cert=socket.getPeerCertificate();socket.end();
      resolve(cert?.valid_to?new Date(cert.valid_to).toISOString():null);
    });
    socket.once('timeout',()=>{socket.destroy();resolve(null);});
    socket.once('error',()=>resolve(null));
  });
}

async function checkService(service){
  const started=Date.now();let status=null,error=null;
  try{
    const r=await fetch(service.url,{method:'GET',redirect:'manual',headers:{'user-agent':'JakeOS-Ops/1.0','accept':'text/html,application/json;q=0.9,*/*;q=0.8'},signal:AbortSignal.timeout(9000)});
    status=r.status;
    try{r.body?.cancel();}catch{}
  }catch(e){error=e.message||'request failed';}
  const latency=Date.now()-started,ok=status!=null&&status>=200&&status<500;
  const previous=Number(service.consecutive_failures||0),failures=ok?0:previous+1;
  const host=new URL(service.url).hostname;
  const cert=await tlsExpiry(host);
  await db.query(`UPDATE ops_services SET last_status=$2,last_latency_ms=$3,last_checked_at=NOW(),last_ok_at=CASE WHEN $4 THEN NOW() ELSE last_ok_at END,consecutive_failures=$5,tls_expires_at=$6,metadata=COALESCE(metadata,'{}'::jsonb)||$7::jsonb WHERE id=$1`,[service.id,status,latency,ok,failures,cert,JSON.stringify({lastError:error})]);
  await db.query(`INSERT INTO ops_service_checks(service_id,checked_at,status_code,latency_ms,ok,error) VALUES($1,NOW(),$2,$3,$4,$5)`,[service.id,status,latency,ok,error]);
  const ref=`service:${service.id}`;
  if(failures>=3)await upsertSignal({ref,title:`${service.name} is not responding`,summary:`${failures} consecutive checks failed${error?`: ${error}`:''}.`,severity:service.critical?'critical':'high',metadata:{serviceId:service.id,url:service.url,status,latency,failures}});else if(ok)await resolveSignal(ref);
  if(cert){const days=Math.ceil((new Date(cert)-Date.now())/86400000),tlsRef=`tls:${host}`;if(days<=14)await upsertSignal({ref:tlsRef,title:`TLS certificate expires soon: ${host}`,summary:`Certificate expires in ${days} days.`,severity:'critical',dueAt:cert,metadata:{host,expiresAt:cert}});else if(days<=30)await upsertSignal({ref:tlsRef,title:`TLS renewal approaching: ${host}`,summary:`Certificate expires in ${days} days.`,severity:'high',dueAt:cert,metadata:{host,expiresAt:cert}});else await resolveSignal(tlsRef);}
  return{serviceId:service.id,ok,status,latencyMs:latency};
}

async function refreshDomain(host,root,kind){
  const cert=await tlsExpiry(host);let expiresAt=null,registrar=null,rdapError=null;
  if(kind==='registrable'){
    try{
      const r=await fetch(`https://rdap.org/domain/${encodeURIComponent(root)}`,{headers:{accept:'application/rdap+json,application/json'},signal:AbortSignal.timeout(10000)});
      if(r.ok){const data=await r.json();const event=(data.events||[]).find(x=>['expiration','expiry'].includes(String(x.eventAction||'').toLowerCase()));expiresAt=event?.eventDate||null;registrar=(data.entities||[]).map(e=>e.vcardArray?.[1]?.find(v=>v?.[0]==='fn')?.[3]).find(Boolean)||null;}else rdapError=`HTTP ${r.status}`;
    }catch(e){rdapError=e.message;}
  }
  let status='healthy';
  const due=expiresAt?Math.ceil((new Date(expiresAt)-Date.now())/86400000):null;
  const tlsDays=cert?Math.ceil((new Date(cert)-Date.now())/86400000):null;
  if((due!=null&&due<=30)||(tlsDays!=null&&tlsDays<=14))status='critical';else if((due!=null&&due<=60)||(tlsDays!=null&&tlsDays<=30))status='attention';
  await db.query(`UPDATE ops_domains SET registrar=COALESCE($2,registrar),expires_at=COALESCE($3,expires_at),tls_expires_at=$4,last_checked_at=NOW(),status=$5,metadata=COALESCE(metadata,'{}'::jsonb)||$6::jsonb WHERE host=$1`,[host,registrar,expiresAt,cert,status,JSON.stringify({rdapError})]);
  if(due!=null){const ref=`domain:${root}`;if(due<=30)await upsertSignal({ref,title:`Domain expires soon: ${root}`,summary:`Registration expires in ${due} days.`,severity:'critical',dueAt:expiresAt,metadata:{domain:root,expiresAt,registrar}});else if(due<=60)await upsertSignal({ref,title:`Domain renewal approaching: ${root}`,summary:`Registration expires in ${due} days.`,severity:'high',dueAt:expiresAt,metadata:{domain:root,expiresAt,registrar}});else await resolveSignal(ref);}
}

async function refreshOperations({domains=false}={}){
  await ensureOpsSeed();
  const services=await db.all('ops_services',{eq:{enabled:true},order:{col:'critical',asc:false},limit:100});
  const results=[];
  for(const service of services){try{results.push(await checkService(service));}catch(e){results.push({serviceId:service.id,ok:false,error:e.message});}}
  if(domains){const rows=await db.all('ops_domains',{order:{col:'host'},limit:200});for(const row of rows)try{await refreshDomain(row.host,row.root_domain,row.kind);}catch(e){console.warn('[Ops] domain check failed',row.host,e.message);}}
  return{checked:results.length,results};
}

async function overview(){
  await ensureOpsSeed();
  const [hosts,services,domains,signals,backups]=await Promise.all([
    db.query(`SELECT h.*,m.captured_at,m.cpu_percent,m.memory_percent,m.disk_percent,m.load1,m.load5,m.load15,m.uptime_seconds,m.metadata AS snapshot FROM ops_hosts h LEFT JOIN LATERAL(SELECT * FROM ops_host_metrics WHERE host_id=h.id ORDER BY captured_at DESC LIMIT 1)m ON true ORDER BY h.label`),
    db.query(`SELECT * FROM ops_services WHERE enabled=true ORDER BY critical DESC,name`),
    db.query(`SELECT * FROM ops_domains ORDER BY CASE status WHEN 'critical' THEN 0 WHEN 'attention' THEN 1 ELSE 2 END,host`),
    db.query(`SELECT * FROM attention_signals WHERE source='ops' AND resolved=false ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,due_at NULLS LAST,created_at DESC LIMIT 50`),
    db.query(`SELECT * FROM ops_backups ORDER BY checked_at DESC LIMIT 30`)
  ]);
  const svc=services.rows,healthy=svc.filter(s=>Number(s.consecutive_failures||0)===0&&Number(s.last_status||0)>=200&&Number(s.last_status||0)<500).length;
  const critical=signals.rows.filter(s=>s.severity==='critical').length,high=signals.rows.filter(s=>s.severity==='high').length;
  const score=Math.max(0,100-critical*15-high*6-Math.max(0,svc.length-healthy)*3);
  return{generatedAt:nowIso(),score,status:critical?'critical':high||healthy<svc.length?'attention':'healthy',summary:{servicesTotal:svc.length,servicesHealthy:healthy,domainsTotal:domains.rows.length,domainsAttention:domains.rows.filter(d=>d.status!=='healthy').length,criticalSignals:critical,highSignals:high},hosts:hosts.rows,services:svc,domains:domains.rows,backups:backups.rows,attention:signals.rows};
}

function requireIngest(req,res,next){const expected=process.env.OPS_INGEST_TOKEN||process.env.JAKEOS_INGEST_TOKEN||'',provided=req.get('x-jakeos-ingest-token')||String(req.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!expected||!secureEqual(expected,provided))return res.status(401).json({error:'Invalid ops ingest token'});next();}

const opsRouter=express.Router();
opsRouter.get('/overview',async(_,res)=>{try{res.json(await overview());}catch(e){res.status(500).json({error:'Operations overview failed',detail:process.env.NODE_ENV==='development'?e.message:undefined});}});
opsRouter.get('/services',async(_,res)=>res.json({services:await db.all('ops_services',{eq:{enabled:true},order:{col:'name'},limit:200})}));
opsRouter.get('/domains',async(_,res)=>res.json({domains:await db.all('ops_domains',{order:{col:'host'},limit:300})}));
opsRouter.get('/history/:hostId',async(req,res)=>{const rows=(await db.query(`SELECT captured_at,cpu_percent,memory_percent,disk_percent,load1,load5,load15,uptime_seconds FROM ops_host_metrics WHERE host_id=$1 AND captured_at>NOW()-INTERVAL '7 days' ORDER BY captured_at`,[idSafe(req.params.hostId)])).rows;res.json({metrics:rows});});
opsRouter.post('/refresh',async(req,res)=>{try{res.json({ok:true,...await refreshOperations({domains:req.query.domains==='1'||req.body?.domains===true})});}catch(e){res.status(500).json({ok:false,error:e.message});}});

const momentumOpsRouter=express.Router();
momentumOpsRouter.use(momentumAuth());
momentumOpsRouter.get('/',async(_,res)=>{try{const data=await overview();res.json({generatedAt:data.generatedAt,score:data.score,status:data.status,summary:data.summary,hosts:data.hosts.map(h=>({id:h.id,label:h.label,status:h.status,cpuPercent:h.cpu_percent,memoryPercent:h.memory_percent,diskPercent:h.disk_percent,uptimeSeconds:h.uptime_seconds,capturedAt:h.captured_at,containers:Array.isArray(h.snapshot?.containers)?h.snapshot.containers:[]})),services:data.services.map(s=>({id:s.id,name:s.name,product:s.product,status:s.last_status,latencyMs:s.last_latency_ms,failures:s.consecutive_failures,lastCheckedAt:s.last_checked_at,tlsExpiresAt:s.tls_expires_at})),domains:data.domains.map(d=>({host:d.host,rootDomain:d.root_domain,kind:d.kind,status:d.status,expiresAt:d.expires_at,tlsExpiresAt:d.tls_expires_at})),attention:data.attention.map(a=>({severity:a.severity,title:a.title,summary:a.summary,dueAt:a.due_at,sourceRef:a.source_ref}))});}catch(e){res.status(500).json({error:'Operations unavailable'});}});

const opsIngestRouter=express.Router();
opsIngestRouter.use(requireIngest);
opsIngestRouter.post('/snapshot',async(req,res)=>{try{res.status(202).json({ok:true,...await recordHostSnapshot(req.body||{})});}catch(e){res.status(500).json({ok:false,error:e.message});}});
opsIngestRouter.post('/backup',async(req,res)=>{try{const p=req.body||{},id=idSafe(p.id||p.name||`backup-${Date.now()}`);await db.query(`INSERT INTO ops_backups(id,name,target,status,size_bytes,completed_at,checked_at,metadata) VALUES($1,$2,$3,$4,$5,$6,NOW(),$7::jsonb) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,target=EXCLUDED.target,status=EXCLUDED.status,size_bytes=EXCLUDED.size_bytes,completed_at=EXCLUDED.completed_at,checked_at=NOW(),metadata=EXCLUDED.metadata`,[id,String(p.name||id).slice(0,120),String(p.target||'').slice(0,255),String(p.status||'unknown').slice(0,30),Number(p.sizeBytes||p.size_bytes||0),p.completedAt||p.completed_at||null,JSON.stringify(p.metadata||{})]);res.status(202).json({ok:true,id});}catch(e){res.status(500).json({ok:false,error:e.message});}});

module.exports={opsRouter,momentumOpsRouter,opsIngestRouter,ensureOpsSeed,recordHostSnapshot,refreshOperations,overview};
