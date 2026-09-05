'use strict';
const crypto=require('crypto');
const express=require('express');
const db=require('./db');
const {recordHostSnapshot}=require('./ops');

function secureEqual(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function requireOpsIngest(req,res,next){
  const expected=process.env.OPS_INGEST_TOKEN||process.env.JAKEOS_INGEST_TOKEN||process.env.TUKU_ESTATE_INSIGHTS_SECRET||'';
  const provided=req.get('x-jakeos-ingest-token')||String(req.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!expected||!secureEqual(expected,provided))return res.status(401).json({error:'Invalid ops ingest token'});
  next();
}
function daysUntil(value){return value?Math.ceil((new Date(value)-Date.now())/86400000):null;}
async function resolveSignal(ref){await db.query(`UPDATE attention_signals SET resolved=true,resolved_at=NOW(),updated_at=NOW() WHERE source='ops' AND source_ref=$1 AND resolved=false`,[ref]);}
async function upsertSignal(ref,title,summary,severity,dueAt,metadata={}){
  const current=(await db.query(`SELECT id FROM attention_signals WHERE source='ops' AND source_ref=$1 AND resolved=false ORDER BY created_at DESC LIMIT 1`,[ref])).rows[0];
  if(current){await db.query(`UPDATE attention_signals SET title=$2,summary=$3,severity=$4,due_at=$5,metadata=$6::jsonb,updated_at=NOW() WHERE id=$1`,[current.id,title,summary,severity,dueAt,JSON.stringify(metadata)]);return current.id;}
  const id=`ops_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  await db.query(`INSERT INTO attention_signals(id,signal_type,title,summary,severity,source,source_ref,action_url,due_at,metadata) VALUES($1,'infrastructure',$2,$3,$4,'ops',$5,'/?module=operations',$6,$7::jsonb)`,[id,title,summary,severity,ref,dueAt,JSON.stringify(metadata)]);
  return id;
}

async function processCertificates(certificates){
  const list=Array.isArray(certificates)?certificates.slice(0,150):[];
  if(!list.length)return 0;
  const services=await db.all('ops_services',{eq:{enabled:true},limit:200});
  let updated=0;
  for(const cert of list){
    const host=String(cert.host||'').trim().toLowerCase().slice(0,253);
    const expiresAt=cert.expiresAt||cert.expires_at||null;
    if(!host||!expiresAt||Number.isNaN(new Date(expiresAt).getTime()))continue;
    const days=daysUntil(expiresAt);
    const rows=(await db.query(`SELECT id,expires_at FROM ops_domains WHERE host=$1`,[host])).rows;
    for(const row of rows){
      const registrationDays=daysUntil(row.expires_at);
      let status='healthy';
      if(days<=14||(registrationDays!=null&&registrationDays<=30))status='critical';
      else if(days<=30||(registrationDays!=null&&registrationDays<=60))status='attention';
      await db.query(`UPDATE ops_domains SET tls_expires_at=$2,last_checked_at=NOW(),status=$3,metadata=COALESCE(metadata,'{}'::jsonb)||$4::jsonb WHERE id=$1`,[row.id,expiresAt,status,JSON.stringify({tlsSource:'vps-agent'})]);
      updated++;
    }
    for(const service of services){
      try{if(new URL(service.url).hostname===host)await db.query(`UPDATE ops_services SET tls_expires_at=$2 WHERE id=$1`,[service.id,expiresAt]);}catch{}
    }
    const ref=`tls:${host}`;
    if(days<=14)await upsertSignal(ref,`TLS certificate expires soon: ${host}`,`The live certificate expires in ${days} days.`,'critical',expiresAt,{host,expiresAt,source:'vps-agent'});
    else if(days<=30)await upsertSignal(ref,`TLS renewal approaching: ${host}`,`The live certificate expires in ${days} days.`,'high',expiresAt,{host,expiresAt,source:'vps-agent'});
    else await resolveSignal(ref);
  }
  return updated;
}

const opsIngestRouter=express.Router();
opsIngestRouter.use(requireOpsIngest);
opsIngestRouter.post('/snapshot',async(req,res)=>{try{const snapshot=await recordHostSnapshot(req.body||{}),certificates=await processCertificates(req.body?.certificates);res.status(202).json({ok:true,...snapshot,certificates});}catch(e){res.status(500).json({ok:false,error:e.message});}});
opsIngestRouter.post('/backup',async(req,res)=>{try{const p=req.body||{},id=String(p.id||p.name||`backup-${Date.now()}`).toLowerCase().replace(/[^a-z0-9_-]+/g,'-').slice(0,100);await db.query(`INSERT INTO ops_backups(id,name,target,status,size_bytes,completed_at,checked_at,metadata) VALUES($1,$2,$3,$4,$5,$6,NOW(),$7::jsonb) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,target=EXCLUDED.target,status=EXCLUDED.status,size_bytes=EXCLUDED.size_bytes,completed_at=EXCLUDED.completed_at,checked_at=NOW(),metadata=EXCLUDED.metadata`,[id,String(p.name||id).slice(0,120),String(p.target||'').slice(0,255),String(p.status||'unknown').slice(0,30),Number(p.sizeBytes||p.size_bytes||0),p.completedAt||p.completed_at||null,JSON.stringify(p.metadata||{})]);res.status(202).json({ok:true,id});}catch(e){res.status(500).json({ok:false,error:e.message});}});

module.exports={opsIngestRouter,processCertificates};
