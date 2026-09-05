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

const opsIngestRouter=express.Router();
opsIngestRouter.use(requireOpsIngest);
opsIngestRouter.post('/snapshot',async(req,res)=>{try{res.status(202).json({ok:true,...await recordHostSnapshot(req.body||{})});}catch(e){res.status(500).json({ok:false,error:e.message});}});
opsIngestRouter.post('/backup',async(req,res)=>{try{const p=req.body||{},id=String(p.id||p.name||`backup-${Date.now()}`).toLowerCase().replace(/[^a-z0-9_-]+/g,'-').slice(0,100);await db.query(`INSERT INTO ops_backups(id,name,target,status,size_bytes,completed_at,checked_at,metadata) VALUES($1,$2,$3,$4,$5,$6,NOW(),$7::jsonb) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,target=EXCLUDED.target,status=EXCLUDED.status,size_bytes=EXCLUDED.size_bytes,completed_at=EXCLUDED.completed_at,checked_at=NOW(),metadata=EXCLUDED.metadata`,[id,String(p.name||id).slice(0,120),String(p.target||'').slice(0,255),String(p.status||'unknown').slice(0,30),Number(p.sizeBytes||p.size_bytes||0),p.completedAt||p.completed_at||null,JSON.stringify(p.metadata||{})]);res.status(202).json({ok:true,id});}catch(e){res.status(500).json({ok:false,error:e.message});}});

module.exports={opsIngestRouter};
