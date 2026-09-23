'use strict';

const crypto=require('crypto');
const db=require('./db');
const {sendAlert}=require('./alerts');

const makeId=()=>`notify_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const configuredChannels=()=>{
  const out=[];
  if(process.env.RESEND_API_KEY&&process.env.ALERT_TO_EMAIL)out.push('email');
  if(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_CHAT_ID)out.push('telegram');
  if(process.env.WHATSAPP_PHONE&&process.env.WHATSAPP_APIKEY)out.push('whatsapp');
  return out;
};

async function notifyErrand({dispatchId=null,runId=null,eventType,title,message,dedupeKey=null,channels=null}){
  const key=dedupeKey||crypto.createHash('sha256').update([dispatchId,runId,eventType,title,message].join('|')).digest('hex');
  const existing=(await db.query('SELECT * FROM agent_notifications WHERE dedupe_key=$1 LIMIT 1',[key])).rows[0];
  if(existing)return existing;
  const selected=Array.isArray(channels)?channels:configuredChannels();
  const row=(await db.query(`INSERT INTO agent_notifications(id,dispatch_id,run_id,event_type,title,message,status,channels,dedupe_key)
    VALUES($1,$2,$3,$4,$5,$6,'pending',$7::jsonb,$8) RETURNING *`,[
      makeId(),dispatchId,runId,String(eventType||'errand').slice(0,80),String(title||'JakeOS Errand').slice(0,300),
      String(message||'').slice(0,4000),JSON.stringify(selected),key
    ])).rows[0];
  try{
    const signalId='errand_'+crypto.createHash('sha256').update(key).digest('hex').slice(0,24);
    const severity=eventType==='failed'||eventType==='budget_blocked'?'high':eventType==='approval_required'?'high':'medium';
    await db.query(`INSERT INTO attention_signals(id,signal_type,title,summary,severity,source,source_ref,action_url,metadata,resolved,created_at,updated_at)
      VALUES($1,'errand',$2,$3,$4,'JakeOS Errands',$5,'/?module=agents',$6::jsonb,FALSE,NOW(),NOW())
      ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,summary=EXCLUDED.summary,severity=EXCLUDED.severity,metadata=EXCLUDED.metadata,resolved=FALSE,updated_at=NOW()`,[
        signalId,row.title,row.message,severity,dispatchId||runId||row.id,JSON.stringify({dispatch_id:dispatchId,run_id:runId,event_type:eventType,notification_id:row.id})
      ]);
  }catch(error){console.warn('[ErrandNotification] attention signal:',error.message);}
  if(!selected.length){
    await db.update('agent_notifications',row.id,{status:'stored',delivery:{reason:'no-external-channel-configured'}});
    return await db.get('agent_notifications',{eq:{id:row.id}});
  }
  try{
    const delivery=await sendAlert({message:row.message,subject:row.title,channels:selected});
    await db.update('agent_notifications',row.id,{status:'sent',delivery,sent_at:new Date().toISOString()});
  }catch(error){
    await db.update('agent_notifications',row.id,{status:'failed',delivery:{error:String(error.message||error).slice(0,1000)}});
  }
  return await db.get('agent_notifications',{eq:{id:row.id}});
}

module.exports={configuredChannels,notifyErrand};
