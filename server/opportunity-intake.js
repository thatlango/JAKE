'use strict';
const crypto=require('crypto');
const db=require('./db');
const {createData,patchData,duplicateFor}=require('./opportunities-connector');

const MAX_ATTEMPTS=Math.max(1,Number(process.env.OPPORTUNITY_INTAKE_MAX_ATTEMPTS||5));
const BATCH_SIZE=Math.max(1,Math.min(Number(process.env.OPPORTUNITY_INTAKE_BATCH_SIZE||25),100));
const WORKER_ID=`${process.env.HOSTNAME||'jakeos'}:${process.pid}`;
const text=(v,max=2000)=>String(v??'').trim().slice(0,max);
const makeId=()=>`oint_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const stableKey=payload=>{
  const explicit=text(payload.idempotency_key||payload.idempotencyKey,200);
  if(explicit)return explicit;
  const url=text(payload.source_url||payload.sourceUrl,2000).toLowerCase();
  if(url)return crypto.createHash('sha256').update('url:'+url).digest('hex');
  const title=text(payload.title,500).toLowerCase();
  const org=text(payload.org||payload.organisation||payload.organization,500).toLowerCase();
  return title&&org?crypto.createHash('sha256').update(`title:${title}|org:${org}`).digest('hex'):null;
};

async function enqueueOpportunity(payload,{source='external',idempotencyKey=null}={}){
  if(!payload||typeof payload!=='object'||Array.isArray(payload)){
    const error=new Error('Opportunity payload must be an object');error.status=422;throw error;
  }
  // Validate canonical minimum fields now; worker performs canonical normalization later.
  createData(payload);
  const key=text(idempotencyKey,200)||stableKey(payload);
  const id=makeId();
  const result=await db.query(`
    INSERT INTO opportunity_intake(id,payload,source,idempotency_key)
    VALUES($1,$2::jsonb,$3,$4)
    ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL
    DO UPDATE SET updated_at=NOW()
    RETURNING *
  `,[id,JSON.stringify(payload),text(source,120)||'external',key]);
  const row=result.rows[0];
  return {intake:row,replayed:row.id!==id};
}

async function claimBatch(limit=BATCH_SIZE){
  return db.withTransaction(async client=>{
    const rows=(await client.query(`
      SELECT * FROM opportunity_intake
      WHERE state IN ('pending','failed') AND available_at<=NOW() AND attempts<$1
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED LIMIT $2
    `,[MAX_ATTEMPTS,limit])).rows;
    if(!rows.length)return[];
    const ids=rows.map(r=>r.id);
    return (await client.query(`
      UPDATE opportunity_intake SET state='processing',attempts=attempts+1,locked_at=NOW(),locked_by=$2,updated_at=NOW()
      WHERE id=ANY($1::text[]) RETURNING *
    `,[ids,WORKER_ID])).rows;
  });
}

async function processItem(item){
  try{
    const payload=item.payload||{};
    const duplicate=await duplicateFor(payload);
    let opportunity,action;
    if(duplicate){
      await db.update('opportunities',duplicate.id,patchData(payload,duplicate));
      opportunity=await db.get('opportunities',{eq:{id:duplicate.id}});
      action='updated';
    }else{
      opportunity=await db.insert('opportunities',createData(payload),false);
      if(!opportunity)throw new Error('Canonical opportunity insert failed');
      action='created';
    }
    await db.query(`
      UPDATE opportunity_intake SET state=$2,opportunity_id=$3,result=$4::jsonb,last_error=NULL,
      locked_at=NULL,locked_by=NULL,completed_at=NOW(),updated_at=NOW() WHERE id=$1
    `,[item.id,duplicate?'duplicate':'completed',opportunity.id,JSON.stringify({action,opportunity_id:opportunity.id})]);
    return {id:item.id,action,opportunity_id:opportunity.id};
  }catch(error){
    const dead=Number(item.attempts)>=MAX_ATTEMPTS;
    const delay=Math.min(3600,Math.pow(2,Math.max(0,Number(item.attempts)-1))*60);
    await db.query(`
      UPDATE opportunity_intake SET state=$2,last_error=$3,locked_at=NULL,locked_by=NULL,
      available_at=CASE WHEN $2='failed' THEN NOW()+($4 * INTERVAL '1 second') ELSE available_at END,updated_at=NOW()
      WHERE id=$1
    `,[item.id,dead?'dead_letter':'failed',text(error.message,4000),delay]);
    return {id:item.id,action:dead?'dead_letter':'retry',error:error.message};
  }
}

async function processOpportunityIntake({limit=BATCH_SIZE}={}){
  const claimed=await claimBatch(limit);
  const results=[];
  for(const item of claimed)results.push(await processItem(item));
  return {claimed:claimed.length,results};
}

async function recoverStaleClaims(){
  const minutes=Math.max(2,Number(process.env.OPPORTUNITY_INTAKE_STALE_MINUTES||10));
  const result=await db.query(`
    UPDATE opportunity_intake SET state='failed',locked_at=NULL,locked_by=NULL,last_error='Recovered stale worker claim',
    available_at=NOW(),updated_at=NOW()
    WHERE state='processing' AND locked_at<NOW()-($1 * INTERVAL '1 minute') RETURNING id
  `,[minutes]);
  return result.rowCount;
}

module.exports={enqueueOpportunity,processOpportunityIntake,recoverStaleClaims,stableKey};
