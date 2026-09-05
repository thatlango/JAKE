'use strict';
const crypto=require('crypto');
const express=require('express');
const db=require('./db');
const {momentumAuth}=require('./momentum-auth');

const SEED=[
  {
    id:'ovh-vps-production',name:'OVHcloud VPS',provider:'OVHcloud',category:'infrastructure',product:'Tuku estate',plan_name:'Production VPS',billing_mode:'recurring',billing_cycle:'unknown',amount:14.50,currency:'USD',purchased_at:'2026-08-29T12:42:10Z',next_renewal_at:null,expires_at:null,auto_renew:null,status:'active',usage_current:null,usage_limit:null,usage_unit:'',usage_period_end:null,source:'gmail',source_ref:'OVH invoice WE4458838',notes:'Purchased 29 Aug 2026. Exact renewal frequency/date is not present in the invoice email and must be confirmed from OVHcloud Manager.',metadata:{invoice:'WE4458838',order:'22464306',renewalDateConfirmed:false}
  },
  {
    id:'resend',name:'Resend',provider:'Resend',category:'email',product:'Tuku estate',plan_name:'Free / unconfirmed',billing_mode:'quota',billing_cycle:'monthly',amount:0,currency:'USD',purchased_at:'2026-03-20T19:20:46Z',next_renewal_at:null,expires_at:null,auto_renew:null,status:'active',usage_current:null,usage_limit:3000,usage_unit:'emails/month',usage_period_end:null,source:'gmail+public-pricing',source_ref:'Resend welcome 20 Mar 2026',notes:'No billing receipt was found in Gmail. Current Resend Free pricing is 3,000 emails/month with a 100/day limit; confirm plan if upgraded.',metadata:{dailyLimit:100,planConfirmed:false,noExpiry:true}
  }
];

const daysUntil=value=>value?Math.ceil((new Date(value)-Date.now())/86400000):null;
function safeId(value){return String(value||'').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,100);}

async function ensureSubscriptionSeed(){
  if(!db.isReady())return;
  for(const item of SEED){
    await db.query(`INSERT INTO ops_subscriptions(id,name,provider,category,product,plan_name,billing_mode,billing_cycle,amount,currency,purchased_at,next_renewal_at,expires_at,auto_renew,status,usage_current,usage_limit,usage_unit,usage_period_end,source,source_ref,notes,metadata)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb)
      ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,provider=EXCLUDED.provider,category=EXCLUDED.category,product=EXCLUDED.product,
        plan_name=CASE WHEN ops_subscriptions.source='manual' THEN ops_subscriptions.plan_name ELSE EXCLUDED.plan_name END,
        amount=COALESCE(ops_subscriptions.amount,EXCLUDED.amount),currency=COALESCE(NULLIF(ops_subscriptions.currency,''),EXCLUDED.currency),
        purchased_at=COALESCE(ops_subscriptions.purchased_at,EXCLUDED.purchased_at),usage_limit=COALESCE(ops_subscriptions.usage_limit,EXCLUDED.usage_limit),
        usage_unit=COALESCE(NULLIF(ops_subscriptions.usage_unit,''),EXCLUDED.usage_unit),notes=CASE WHEN ops_subscriptions.notes<>'' THEN ops_subscriptions.notes ELSE EXCLUDED.notes END,
        metadata=ops_subscriptions.metadata||EXCLUDED.metadata,updated_at=NOW()`,[
      item.id,item.name,item.provider,item.category,item.product,item.plan_name,item.billing_mode,item.billing_cycle,item.amount,item.currency,item.purchased_at,item.next_renewal_at,item.expires_at,item.auto_renew,item.status,item.usage_current,item.usage_limit,item.usage_unit||'',item.usage_period_end,item.source,item.source_ref,item.notes,JSON.stringify(item.metadata||{})
    ]);
  }
}

async function resolveSignal(ref){await db.query(`UPDATE attention_signals SET resolved=true,resolved_at=NOW(),updated_at=NOW() WHERE source='ops' AND source_ref=$1 AND resolved=false`,[ref]);}
async function upsertSignal(ref,title,summary,severity,dueAt,metadata={}){
  const current=(await db.query(`SELECT id FROM attention_signals WHERE source='ops' AND source_ref=$1 AND resolved=false ORDER BY created_at DESC LIMIT 1`,[ref])).rows[0];
  if(current){await db.query(`UPDATE attention_signals SET title=$2,summary=$3,severity=$4,due_at=$5,metadata=$6::jsonb,updated_at=NOW() WHERE id=$1`,[current.id,title,summary,severity,dueAt,JSON.stringify(metadata)]);return current.id;}
  const id=`ops_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  await db.query(`INSERT INTO attention_signals(id,signal_type,title,summary,severity,source,source_ref,action_url,due_at,metadata) VALUES($1,'service_renewal',$2,$3,$4,'ops',$5,'/?module=operations',$6,$7::jsonb)`,[id,title,summary,severity,ref,dueAt,JSON.stringify(metadata)]);
  return id;
}

async function evaluateSubscriptionSignals(){
  await ensureSubscriptionSeed();
  const rows=await db.all('ops_subscriptions',{eq:{status:'active'},order:{col:'name'},limit:300});
  let alerts=0;
  for(const row of rows){
    const due=row.expires_at||row.next_renewal_at||null;
    const dueDays=daysUntil(due),ref=`subscription:${row.id}`;
    if(dueDays!=null&&dueDays<=7){await upsertSignal(ref,`${row.name} ${row.expires_at?'expires':'renews'} soon`,`${row.name} is due in ${dueDays} day${dueDays===1?'':'s'}.`,'critical',due,{subscriptionId:row.id,provider:row.provider,due});alerts++;}
    else if(dueDays!=null&&dueDays<=30){await upsertSignal(ref,`${row.name} ${row.expires_at?'expiry':'renewal'} approaching`,`${row.name} is due in ${dueDays} days.`,'high',due,{subscriptionId:row.id,provider:row.provider,due});alerts++;}
    else if(dueDays!=null&&dueDays<=60){await upsertSignal(ref,`${row.name} ${row.expires_at?'expiry':'renewal'} approaching`,`${row.name} is due in ${dueDays} days.`,'medium',due,{subscriptionId:row.id,provider:row.provider,due});alerts++;}
    else await resolveSignal(ref);
    const current=Number(row.usage_current),limit=Number(row.usage_limit),usageRef=`subscription:${row.id}:usage`;
    if(Number.isFinite(current)&&Number.isFinite(limit)&&limit>0){const ratio=current/limit;if(ratio>=0.95){await upsertSignal(usageRef,`${row.name} quota nearly exhausted`,`${current.toLocaleString()} of ${limit.toLocaleString()} ${row.usage_unit||'units'} used.`,'critical',row.usage_period_end,{subscriptionId:row.id,current,limit});alerts++;}else if(ratio>=0.8){await upsertSignal(usageRef,`${row.name} quota above 80%`,`${current.toLocaleString()} of ${limit.toLocaleString()} ${row.usage_unit||'units'} used.`,'high',row.usage_period_end,{subscriptionId:row.id,current,limit});alerts++;}else await resolveSignal(usageRef);}else await resolveSignal(usageRef);
  }
  return{checked:rows.length,alerts};
}

async function subscriptionSnapshot(){
  await ensureSubscriptionSeed();
  await evaluateSubscriptionSignals();
  const rows=await db.all('ops_subscriptions',{order:{col:'name'},limit:300});
  const mapped=rows.map(row=>({...row,due_at:row.expires_at||row.next_renewal_at||null,due_days:daysUntil(row.expires_at||row.next_renewal_at||null),needs_confirmation:row.status==='active'&&row.billing_mode==='recurring'&&!row.expires_at&&!row.next_renewal_at}));
  return{generatedAt:new Date().toISOString(),summary:{total:mapped.length,due30:mapped.filter(x=>x.due_days!=null&&x.due_days<=30).length,needsConfirmation:mapped.filter(x=>x.needs_confirmation).length,quotaTracked:mapped.filter(x=>Number(x.usage_limit)>0).length},subscriptions:mapped};
}

function cleanPatch(body={}){
  const out={};
  for(const key of ['name','provider','category','product','plan_name','billing_mode','billing_cycle','currency','status','usage_unit','source','source_ref','notes'])if(body[key]!==undefined)out[key]=String(body[key]??'').slice(0,key==='notes'?2000:200);
  for(const key of ['purchased_at','next_renewal_at','expires_at','usage_period_end'])if(body[key]!==undefined)out[key]=body[key]?new Date(body[key]).toISOString():null;
  for(const key of ['amount','usage_current','usage_limit'])if(body[key]!==undefined)out[key]=body[key]===null||body[key]===''?null:Number(body[key]);
  if(body.auto_renew!==undefined)out.auto_renew=body.auto_renew===null?null:!!body.auto_renew;
  if(body.metadata!==undefined&&body.metadata&&typeof body.metadata==='object'&&!Array.isArray(body.metadata))out.metadata=body.metadata;
  out.updated_at=new Date().toISOString();return out;
}

const subscriptionRouter=express.Router();
subscriptionRouter.get('/',async(_req,res)=>{try{res.json(await subscriptionSnapshot());}catch(e){res.status(500).json({error:'Subscription registry unavailable',detail:process.env.NODE_ENV==='development'?e.message:undefined});}});
subscriptionRouter.patch('/:id',async(req,res)=>{try{const id=safeId(req.params.id),patch=cleanPatch(req.body||{});if(!id)return res.status(422).json({error:'Invalid subscription id'});await db.update('ops_subscriptions',id,patch);await evaluateSubscriptionSignals();const row=await db.get('ops_subscriptions',{eq:{id}});if(!row)return res.status(404).json({error:'Subscription not found'});res.json({ok:true,subscription:row});}catch(e){res.status(422).json({error:e.message||'Update failed'});}});
subscriptionRouter.post('/',async(req,res)=>{try{const id=safeId(req.body.id||req.body.name);if(!id||!req.body.name)return res.status(422).json({error:'id/name is required'});const patch=cleanPatch(req.body);await db.query(`INSERT INTO ops_subscriptions(id,name,provider,category,product,plan_name,billing_mode,billing_cycle,amount,currency,purchased_at,next_renewal_at,expires_at,auto_renew,status,usage_current,usage_limit,usage_unit,usage_period_end,source,source_ref,notes,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,provider=EXCLUDED.provider,category=EXCLUDED.category,product=EXCLUDED.product,plan_name=EXCLUDED.plan_name,billing_mode=EXCLUDED.billing_mode,billing_cycle=EXCLUDED.billing_cycle,amount=EXCLUDED.amount,currency=EXCLUDED.currency,purchased_at=EXCLUDED.purchased_at,next_renewal_at=EXCLUDED.next_renewal_at,expires_at=EXCLUDED.expires_at,auto_renew=EXCLUDED.auto_renew,status=EXCLUDED.status,usage_current=EXCLUDED.usage_current,usage_limit=EXCLUDED.usage_limit,usage_unit=EXCLUDED.usage_unit,usage_period_end=EXCLUDED.usage_period_end,source=EXCLUDED.source,source_ref=EXCLUDED.source_ref,notes=EXCLUDED.notes,metadata=EXCLUDED.metadata,updated_at=NOW()`,[id,patch.name||String(req.body.name),patch.provider||'',patch.category||'service',patch.product||'',patch.plan_name||'',patch.billing_mode||'unknown',patch.billing_cycle||'unknown',patch.amount??null,patch.currency||'USD',patch.purchased_at||null,patch.next_renewal_at||null,patch.expires_at||null,patch.auto_renew??null,patch.status||'active',patch.usage_current??null,patch.usage_limit??null,patch.usage_unit||'',patch.usage_period_end||null,patch.source||'manual',patch.source_ref||null,patch.notes||'',JSON.stringify(patch.metadata||{})]);await evaluateSubscriptionSignals();res.status(201).json({ok:true,subscription:await db.get('ops_subscriptions',{eq:{id}})});}catch(e){res.status(422).json({error:e.message||'Create failed'});}});

const momentumSubscriptionRouter=express.Router();
momentumSubscriptionRouter.use(momentumAuth());
momentumSubscriptionRouter.get('/',async(_req,res)=>{try{const data=await subscriptionSnapshot();res.json({generatedAt:data.generatedAt,summary:data.summary,subscriptions:data.subscriptions.map(x=>({id:x.id,name:x.name,provider:x.provider,category:x.category,planName:x.plan_name,billingMode:x.billing_mode,billingCycle:x.billing_cycle,amount:x.amount,currency:x.currency,nextRenewalAt:x.next_renewal_at,expiresAt:x.expires_at,autoRenew:x.auto_renew,status:x.status,usageCurrent:x.usage_current,usageLimit:x.usage_limit,usageUnit:x.usage_unit,usagePeriodEnd:x.usage_period_end,dueDays:x.due_days,needsConfirmation:x.needs_confirmation}))});}catch(e){res.status(500).json({error:'Subscription registry unavailable'});}});

module.exports={subscriptionRouter,momentumSubscriptionRouter,ensureSubscriptionSeed,evaluateSubscriptionSignals,subscriptionSnapshot};
