'use strict';
const crypto=require('crypto');
const db=require('./db');

function daysUntil(value){return value?Math.ceil((new Date(value)-Date.now())/86400000):null;}

async function upsertSignal(ref,title,summary,severity,dueAt,metadata={}){
  const current=(await db.query(`SELECT id FROM attention_signals WHERE source='ops' AND source_ref=$1 AND resolved=false ORDER BY created_at DESC LIMIT 1`,[ref])).rows[0];
  if(current){
    await db.query(`UPDATE attention_signals SET title=$2,summary=$3,severity=$4,due_at=$5,metadata=$6::jsonb,updated_at=NOW() WHERE id=$1`,[current.id,title,summary,severity,dueAt,JSON.stringify(metadata)]);
    return current.id;
  }
  const id=`ops_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  await db.query(`INSERT INTO attention_signals(id,signal_type,title,summary,severity,source,source_ref,action_url,due_at,metadata) VALUES($1,'infrastructure',$2,$3,$4,'ops',$5,'/?module=operations',$6,$7::jsonb)`,[id,title,summary,severity,ref,dueAt,JSON.stringify(metadata)]);
  return id;
}
async function resolveSignal(ref){await db.query(`UPDATE attention_signals SET resolved=true,resolved_at=NOW(),updated_at=NOW() WHERE source='ops' AND source_ref=$1 AND resolved=false`,[ref]);}

async function refreshRootDomains(){
  const roots=(await db.query(`SELECT * FROM ops_domains WHERE kind='registrable' ORDER BY root_domain`)).rows;
  const results=[];
  for(const row of roots){
    let expiresAt=null,registrar=null,error=null;
    try{
      const response=await fetch(`https://rdap.org/domain/${encodeURIComponent(row.root_domain)}`,{
        headers:{accept:'application/rdap+json,application/json','user-agent':'JakeOS-Ops/1.0 (+https://jakeos.tukutuku.org)'},
        redirect:'follow',signal:AbortSignal.timeout(12000)
      });
      if(!response.ok)throw new Error(`RDAP HTTP ${response.status}`);
      const data=await response.json();
      const expiry=(data.events||[]).find(event=>String(event.eventAction||'').toLowerCase()==='expiration');
      expiresAt=expiry?.eventDate||null;
      const registrarEntity=(data.entities||[]).find(entity=>(entity.roles||[]).includes('registrar'));
      registrar=registrarEntity?.vcardArray?.[1]?.find(item=>item?.[0]==='fn')?.[3]||null;
    }catch(e){error=e.message;}
    const registrationDays=daysUntil(expiresAt||row.expires_at),tlsDays=daysUntil(row.tls_expires_at);
    let status='healthy';
    if((registrationDays!=null&&registrationDays<=30)||(tlsDays!=null&&tlsDays<=14))status='critical';
    else if((registrationDays!=null&&registrationDays<=60)||(tlsDays!=null&&tlsDays<=30))status='attention';
    await db.query(`UPDATE ops_domains SET registrar=COALESCE($2,registrar),expires_at=COALESCE($3,expires_at),last_checked_at=NOW(),status=$4,metadata=COALESCE(metadata,'{}'::jsonb)||$5::jsonb WHERE id=$1`,[row.id,registrar,expiresAt,status,JSON.stringify({rdapError:error})]);
    const effectiveExpiry=expiresAt||row.expires_at,ref=`domain:${row.root_domain}`;
    if(registrationDays!=null&&registrationDays<=30)await upsertSignal(ref,`Domain expires soon: ${row.root_domain}`,`Registration expires in ${registrationDays} days. Renew now to protect production services.`,'critical',effectiveExpiry,{domain:row.root_domain,expiresAt:effectiveExpiry,registrar});
    else if(registrationDays!=null&&registrationDays<=60)await upsertSignal(ref,`Domain renewal approaching: ${row.root_domain}`,`Registration expires in ${registrationDays} days.`,'high',effectiveExpiry,{domain:row.root_domain,expiresAt:effectiveExpiry,registrar});
    else if(registrationDays!=null)await resolveSignal(ref);
    results.push({domain:row.root_domain,expiresAt:effectiveExpiry,registrar,status,error});
  }
  return results;
}

module.exports={refreshRootDomains};
