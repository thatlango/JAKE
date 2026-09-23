'use strict';
const express=require('express');
const rateLimit=require('express-rate-limit');
const crypto=require('crypto');
const db=require('./db');
const {momentumAuth,ingestAuth}=require('./momentum-auth');
const {rankItems,buildReason,daySlots,allocatePlan}=require('./priority');
const localAi=require('./ai');
const gcal=require('./gcal');
const {fetchEstateSnapshot}=require('./estate');
const {overview:opsOverview}=require('./ops');
const {subscriptionSnapshot}=require('./ops-subscriptions');
const router=express.Router(),integrations=express.Router();
function id(prefix='wi'){return `${prefix}_${crypto.randomUUID()}`;}
function cleanString(value,max=1000){return String(value??'').trim().slice(0,max);}
function asInt(value,fallback,min,max){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n))):fallback;}
function validDate(value){if(!value)return null;const d=new Date(value);return Number.isNaN(d.getTime())?null:d.toISOString();}
function bool(value){return value===true||value===1||value==='1'||String(value).toLowerCase()==='true';}
function array(value,max=20){return Array.isArray(value)?value.slice(0,max):[];}
function object(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
function clockMinutes(value,fallback){const match=String(value||'').match(/^([01]\\d|2[0-3]):([0-5]\\d)$/);return match?(Number(match[1])*60+Number(match[2])):fallback;}
const MOMENTUM_CONTRACT={
  api:'momentum',
  api_major:1,
  contract_version:'2026-09-23.1',
  identity_authority:'tuku-core',
  authentication:'bearer-tuku-access-token',
  timezone:'Africa/Kampala',
  workday:{starts_at:'07:30',ends_at:'18:30'},
  routes:{
    contract:'GET /contract',day:'GET /day',today:'GET /today',inbox:'GET /inbox',
    task:'GET /tasks/:id',create_task:'POST /tasks',update_task:'PATCH /tasks/:id',
    complete_task:'POST /tasks/:id/complete',defer_task:'POST /tasks/:id/defer',
    capture:'POST /capture',projects:'GET /projects',project:'GET /projects/:id',
    schedule:'GET /schedule',schedule_item:'POST /schedule/items',plan_day:'POST /plan-day',
    pulse:'GET /pulse',estate:'GET /estate',estate_product:'GET /estate/products/:productCode',
    ai_status:'GET /ai/status',chat_history:'GET /chat/history',chat:'POST /chat',devices:'POST /devices'
  },
  semantics:{
    today_order:'server_rank_order',
    capture_idempotency:'request.id',
    task_versioning:'optimistic-version-on-patch',
    offline_authority:'jakeos-postgresql',
    offline_durable_mutations:['capture'],
    cached_reads:['day','today','inbox','pulse','estate'],
    day_activity_kinds:['task','event','block'],
    statuses:['inbox','ready','doing','waiting','done','cancelled'],
    priorities:['low','medium','high','critical']
  }
};
function localDateInTimeZone(date=new Date(),timeZone='Africa/Kampala'){const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date),map={};for(const part of parts)if(part.type!=='literal')map[part.type]=part.value;return `${map.year}-${map.month}-${map.day}`;}
function minutesUntil(end,now){if(!end)return null;const value=Math.ceil((new Date(end)-now)/60000);return Number.isFinite(value)?Math.max(0,value):null;}
function asDayActivity(row,kind,now,blockTitle=null){if(!row)return null;const start=row.scheduled_start||row.starts_at||null,end=row.scheduled_end||row.ends_at||null;return{kind,id:row.id,title:row.title,subtitle:row.project_name||row.project||row.why_now||null,starts_at:start,ends_at:end,type:row.type||null,source:row.source||null,task_id:kind==='task'?row.id:null,block_title:blockTitle,minutes_remaining:end&&new Date(start)<=now&&new Date(end)>now?minutesUntil(end,now):null};}
async function daySnapshot(now=new Date()){
  const timezone=process.env.JOBS_TIMEZONE||'Africa/Kampala',date=localDateInTimeZone(now,timezone),nowIso=now.toISOString();
  const[eventsResult,tasksResult]=await Promise.all([
    db.query(`SELECT id,title,date,project,type,done,notes,starts_at,ends_at,all_day,source FROM calendar_events WHERE done=FALSE AND starts_at IS NOT NULL AND ends_at IS NOT NULL AND (starts_at AT TIME ZONE $2)::date=$1::date ORDER BY starts_at,CASE WHEN source='jakeos-day-planner' THEN 1 ELSE 0 END`,[date,timezone]),
    db.query(`SELECT wi.*,p.name AS project_name,COALESCE(wi.metadata->'day_plan'->>'reason','') AS why_now FROM work_items wi LEFT JOIN projects p ON p.id=wi.project_id WHERE wi.status NOT IN ('done','cancelled') AND wi.scheduled_start IS NOT NULL AND wi.scheduled_end IS NOT NULL AND (wi.scheduled_start AT TIME ZONE $2)::date=$1::date ORDER BY wi.scheduled_start`,[date,timezone])
  ]);
  const events=eventsResult.rows,tasks=tasksResult.rows;
  const activeEvents=events.filter(x=>new Date(x.starts_at)<=now&&new Date(x.ends_at)>now);
  const currentExternal=activeEvents.find(x=>x.source!=='jakeos-day-planner')||null;
  const currentAnchor=activeEvents.find(x=>x.source==='jakeos-day-planner')||null;
  const currentTask=tasks.find(x=>new Date(x.scheduled_start)<=now&&new Date(x.scheduled_end)>now)||null;
  let doNow=null;
  if(currentTask)doNow=asDayActivity(currentTask,'task',now,currentAnchor?.title||currentExternal?.title||null);
  else if(currentExternal)doNow=asDayActivity(currentExternal,'event',now,currentAnchor?.title||null);
  else if(currentAnchor)doNow=asDayActivity(currentAnchor,'block',now,null);

  const futureTasks=tasks.filter(x=>new Date(x.scheduled_start)>now);
  const futureEvents=events.filter(x=>new Date(x.starts_at)>now);
  const nextTask=futureTasks[0]||null,nextExternal=futureEvents.find(x=>x.source!=='jakeos-day-planner')||null,nextAnchor=futureEvents.find(x=>x.source==='jakeos-day-planner')||null;
  const nextTaskAnchor=nextTask?events.find(e=>e.source==='jakeos-day-planner'&&new Date(e.starts_at)<=new Date(nextTask.scheduled_start)&&new Date(e.ends_at)>=new Date(nextTask.scheduled_end)):null;
  const candidates=[
    nextTask?asDayActivity(nextTask,'task',now,nextTaskAnchor?.title||null):null,
    nextExternal?asDayActivity(nextExternal,'event',now,null):null,
    nextAnchor?asDayActivity(nextAnchor,'block',now,null):null
  ].filter(Boolean).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)||({task:0,event:1,block:2}[a.kind]-({task:0,event:1,block:2}[b.kind])));
  const upNext=candidates[0]||null;

  const timeline=[
    ...events.map(x=>asDayActivity(x,x.source==='jakeos-day-planner'?'block':'event',now,null)),
    ...tasks.map(x=>asDayActivity(x,'task',now,events.find(e=>e.source==='jakeos-day-planner'&&new Date(e.starts_at)<=new Date(x.scheduled_start)&&new Date(e.ends_at)>=new Date(x.scheduled_end))?.title||null))
  ].sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)||({task:0,event:1,block:2}[a.kind]-({task:0,event:1,block:2}[b.kind])));

  return{generated_at:nowIso,timezone,date,workday:{starts_at:'07:30',ends_at:'18:30'},do_now:doNow,up_next:upNext,current_block:currentAnchor?asDayActivity(currentAnchor,'block',now,null):null,current_event:currentExternal?asDayActivity(currentExternal,'event',now,currentAnchor?.title||null):null,current_task:currentTask?asDayActivity(currentTask,'task',now,currentAnchor?.title||null):null,timeline};
}

const ALLOWED_STATUS=new Set(['inbox','ready','doing','waiting','done','cancelled']),ALLOWED_PRIORITY=new Set(['low','medium','high','critical']);
function normalizeWorkItem(body,{existing=null,source='momentum'}={}){const status=cleanString(body.status??existing?.status??'inbox',20).toLowerCase(),priority=cleanString(body.priority??existing?.priority??'medium',20).toLowerCase();return{id:cleanString(body.id||existing?.id||id('wi'),100),project_id:cleanString(body.project_id??body.projectId??existing?.project_id??'',120)||null,parent_id:cleanString(body.parent_id??body.parentId??existing?.parent_id??'',120)||null,title:cleanString(body.title??body.text??existing?.title??'',500),description:cleanString(body.description??existing?.description??'',5000),status:ALLOWED_STATUS.has(status)?status:'inbox',priority:ALLOWED_PRIORITY.has(priority)?priority:'medium',impact:asInt(body.impact??existing?.impact,3,1,5),strategic_weight:asInt(body.strategic_weight??body.strategicWeight??existing?.strategic_weight,3,1,5),estimated_minutes:asInt(body.estimated_minutes??body.estimatedMinutes??existing?.estimated_minutes,30,5,480),due_at:validDate(body.due_at??body.dueAt??existing?.due_at),scheduled_start:validDate(body.scheduled_start??body.scheduledStart??existing?.scheduled_start),scheduled_end:validDate(body.scheduled_end??body.scheduledEnd??existing?.scheduled_end),deferred_until:validDate(body.deferred_until??body.deferredUntil??existing?.deferred_until),blocked:bool(body.blocked??existing?.blocked??false),blocked_reason:cleanString(body.blocked_reason??body.blockedReason??existing?.blocked_reason??'',1000),pinned:bool(body.pinned??existing?.pinned??false),context_url:cleanString(body.context_url??body.contextUrl??existing?.context_url??'',2000),source:cleanString(body.source??existing?.source??source,100)||source,source_ref:cleanString(body.source_ref??body.sourceRef??existing?.source_ref??'',300)||null,tags:array(body.tags??existing?.tags,30).map(v=>cleanString(v,80)).filter(Boolean),metadata:object(body.metadata??existing?.metadata)};}
async function upsertWorkItem(item,eventType='upsert',eventPayload={}){const sql=`INSERT INTO work_items(id,project_id,parent_id,title,description,status,priority,impact,strategic_weight,estimated_minutes,due_at,scheduled_start,scheduled_end,deferred_until,blocked,blocked_reason,pinned,context_url,source,source_ref,tags,metadata,completed_at,updated_at,last_touched_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb,$22::jsonb,CASE WHEN $6='done' THEN NOW() ELSE NULL END,NOW(),NOW()) ON CONFLICT(id) DO UPDATE SET project_id=EXCLUDED.project_id,parent_id=EXCLUDED.parent_id,title=EXCLUDED.title,description=EXCLUDED.description,status=EXCLUDED.status,priority=EXCLUDED.priority,impact=EXCLUDED.impact,strategic_weight=EXCLUDED.strategic_weight,estimated_minutes=EXCLUDED.estimated_minutes,due_at=EXCLUDED.due_at,scheduled_start=EXCLUDED.scheduled_start,scheduled_end=EXCLUDED.scheduled_end,deferred_until=EXCLUDED.deferred_until,blocked=EXCLUDED.blocked,blocked_reason=EXCLUDED.blocked_reason,pinned=EXCLUDED.pinned,context_url=EXCLUDED.context_url,source=EXCLUDED.source,source_ref=EXCLUDED.source_ref,tags=EXCLUDED.tags,metadata=EXCLUDED.metadata,completed_at=CASE WHEN EXCLUDED.status='done' THEN COALESCE(work_items.completed_at,NOW()) ELSE NULL END,updated_at=NOW(),last_touched_at=NOW(),version=work_items.version+1 RETURNING *`;const values=[item.id,item.project_id,item.parent_id,item.title,item.description,item.status,item.priority,item.impact,item.strategic_weight,item.estimated_minutes,item.due_at,item.scheduled_start,item.scheduled_end,item.deferred_until,item.blocked,item.blocked_reason,item.pinned,item.context_url,item.source,item.source_ref,JSON.stringify(item.tags),JSON.stringify(item.metadata)];const saved=(await db.query(sql,values)).rows[0];await db.query('INSERT INTO work_item_events(work_item_id,event_type,payload) VALUES($1,$2,$3::jsonb)',[saved.id,eventType,JSON.stringify(eventPayload)]);return saved;}
async function getWorkItem(taskId){return(await db.query('SELECT * FROM work_items WHERE id=$1',[cleanString(taskId,100)])).rows[0]||null;}
async function candidateItems(now=new Date()){return(await db.query(`SELECT wi.*,p.name AS project_name,p.emoji AS project_emoji FROM work_items wi LEFT JOIN projects p ON p.id=wi.project_id WHERE wi.status NOT IN ('done','cancelled') AND (wi.deferred_until IS NULL OR wi.deferred_until<=$1) ORDER BY wi.pinned DESC,wi.due_at NULLS LAST,wi.updated_at ASC LIMIT 500`,[now.toISOString()])).rows;}
async function nextAvailableMinutes(now=new Date()){const end=new Date(now.getTime()+8*3600000);const result=await db.query(`SELECT COALESCE(starts_at,CASE WHEN date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' THEN date::timestamptz ELSE NULL END) AS starts_at FROM calendar_events WHERE COALESCE(starts_at,CASE WHEN date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' THEN date::timestamptz ELSE NULL END)>$1 AND COALESCE(starts_at,CASE WHEN date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' THEN date::timestamptz ELSE NULL END)<$2 ORDER BY starts_at ASC LIMIT 1`,[now.toISOString(),end.toISOString()]);const next=result.rows[0]?.starts_at?new Date(result.rows[0].starts_at):end;return Math.max(15,Math.min(240,Math.round((next-now)/60000)));}

async function chatContext(){
  const now=new Date(),week=new Date(now.getTime()+7*86400000).toISOString();
  const[items,events,projects,pipeline,day,estateResult,opsResult,subscriptionsResult]=await Promise.all([
    candidateItems(now),
    db.query(`SELECT title,starts_at,ends_at,all_day,source FROM calendar_events WHERE done=FALSE AND (starts_at IS NULL OR starts_at BETWEEN $1 AND $2) ORDER BY starts_at NULLS LAST LIMIT 30`,[now.toISOString(),week]),
    db.query(`SELECT id,name,status,priority,progress FROM projects ORDER BY updated_at DESC LIMIT 40`),
    db.query(`SELECT name,org,stage,deadline,value_usd FROM pipeline ORDER BY updated_at DESC LIMIT 20`),
    daySnapshot(now).catch(()=>null),
    fetchEstateSnapshot().catch(error=>({configured:true,available:false,stale:false,snapshot:null,error:error.message})),
    opsOverview().catch(error=>({unavailable:true,error:error.message})),
    subscriptionSnapshot().catch(error=>({unavailable:true,error:error.message}))
  ]);
  const ranked=rankItems(items,{now,limit:12});
  const estate=estateResult?.snapshot?{
    available:estateResult.available!==false,
    stale:!!estateResult.stale,
    lastSuccessfulAt:estateResult.lastSuccessfulAt||null,
    generatedAt:estateResult.snapshot.generatedAt||null,
    totals:estateResult.snapshot.totals||{},
    measurement:estateResult.snapshot.measurement||{},
    products:(estateResult.snapshot.products||[]).map(product=>({
      code:product.code,name:product.name,reach:product.reach,
      activeUsers24h:product.activeUsers24h,activeUsers7d:product.activeUsers7d,activeUsers30d:product.activeUsers30d,
      newUsers7d:product.newUsers7d,growth7dPercent:product.growth7dPercent,usageEvents7d:product.usageEvents7d,lastActivityAt:product.lastActivityAt
    })),
    telemetry:(estateResult.snapshot.telemetry||[]).map(item=>({
      productCode:item.productCode,productName:item.productName,coverage:item.coverage,needsAttention:item.needsAttention,
      message:item.message,lastObservedAt:item.lastObservedAt,observed:item.observed
    })),
    commerce:(estateResult.snapshot.commerce||[]).map(item=>({
      productCode:item.productCode,currency:item.currency,orders:item.orders,earnings:item.earnings,lastOrderAt:item.lastOrderAt
    }))
  }:{available:false,stale:!!estateResult?.stale,lastSuccessfulAt:estateResult?.lastSuccessfulAt||null,error:estateResult?.error||'Estate snapshot unavailable'};
  const operations=opsResult?.unavailable?opsResult:{
    generatedAt:opsResult?.generatedAt||null,status:opsResult?.status||null,score:opsResult?.score??null,summary:opsResult?.summary||{},
    attention:(opsResult?.attention||[]).slice(0,20).map(item=>({severity:item.severity,title:item.title,summary:item.summary,dueAt:item.due_at,sourceRef:item.source_ref})),
    services:(opsResult?.services||[]).map(item=>({name:item.name,product:item.product,status:item.last_status,latencyMs:item.last_latency_ms,failures:item.consecutive_failures,lastCheckedAt:item.last_checked_at}))
  };
  const subscriptions=subscriptionsResult?.unavailable?subscriptionsResult:{
    generatedAt:subscriptionsResult?.generatedAt||null,summary:subscriptionsResult?.summary||{},
    subscriptions:(subscriptionsResult?.subscriptions||[]).slice(0,50).map(item=>({
      id:item.id,name:item.name,provider:item.provider,category:item.category,product:item.product,status:item.status,
      amount:item.amount,currency:item.currency,nextRenewalAt:item.next_renewal_at,expiresAt:item.expires_at,
      dueDays:item.due_days,needsConfirmation:item.needs_confirmation,usageCurrent:item.usage_current,usageLimit:item.usage_limit,usageUnit:item.usage_unit
    }))
  };
  return{
    now:now.toISOString(),
    timezone:process.env.JOBS_TIMEZONE||'Africa/Kampala',
    estate,
    operations,
    subscriptions,
    day,
    priorities:ranked.map(x=>({id:x.id,title:x.title,priority:x.priority,due_at:x.due_at,project:x.project_name||null,status:x.status,impact:x.impact,strategic_weight:x.strategic_weight})),
    calendar:events.rows,
    projects:projects.rows,
    pipeline:pipeline.rows
  };
}

function estateMetric(value,{suffix='',currency=''}={}){
  if(value===null||value===undefined||value==='')return 'not measured';
  const number=Number(value);
  if(!Number.isFinite(number))return String(value);
  const formatted=number.toLocaleString('en-US',{maximumFractionDigits:1});
  return `${currency?`${currency} `:''}${formatted}${suffix}`;
}
function estateProductMatch(message,products=[]){
  const query=String(message||'').toLowerCase();
  return products
    .map(product=>({product,keys:[product.code,product.name].map(value=>String(value||'').trim().toLowerCase()).filter(value=>value.length>=3)}))
    .filter(entry=>entry.keys.some(key=>query.includes(key)))
    .sort((a,b)=>Math.max(...b.keys.map(key=>key.length))-Math.max(...a.keys.map(key=>key.length)))[0]?.product||null;
}
function estateFastReply(message,context={}){
  const query=String(message||'').trim().toLowerCase();
  const estate=context.estate||{},products=Array.isArray(estate.products)?estate.products:[],telemetry=Array.isArray(estate.telemetry)?estate.telemetry:[],commerce=Array.isArray(estate.commerce)?estate.commerce:[];
  const operations=context.operations||{},subscriptions=context.subscriptions||{};
  const product=estateProductMatch(query,products);
  const explicitlyEstate=/\b(tuku estate|estate|tukutuku|estate-wide|across the estate|all products|our products)\b/i.test(query);
  if(!explicitlyEstate&&!product)return null;
  if(estate.available===false)return `The live estate snapshot is unavailable right now${estate.lastSuccessfulAt?`; the last successful snapshot was ${estate.lastSuccessfulAt}`:''}. I will not treat missing telemetry as zero.`;

  const freshness=estate.stale?' The estate snapshot is marked stale, so treat these as the latest known values rather than live values.':'';
  const totals=estate.totals||{};
  const attentionTelemetry=telemetry.filter(item=>item.needsAttention);
  const opsAttention=Array.isArray(operations.attention)?operations.attention:[];
  const subs=Array.isArray(subscriptions.subscriptions)?subscriptions.subscriptions:[];
  const dueSubs=subs.filter(item=>Number.isFinite(Number(item.dueDays))&&Number(item.dueDays)<=30).sort((a,b)=>Number(a.dueDays)-Number(b.dueDays));
  const serviceRows=Array.isArray(operations.services)?operations.services:[];

  if(product){
    const code=String(product.code||'').toLowerCase(),name=product.name||product.code||'Product';
    const tele=telemetry.find(item=>String(item.productCode||'').toLowerCase()===code)||null;
    const trade=commerce.filter(item=>String(item.productCode||'').toLowerCase()===code);
    const services=serviceRows.filter(item=>String(item.product||'').toLowerCase()===code||String(item.product||'').toLowerCase()===String(name).toLowerCase()||String(item.name||'').toLowerCase().includes(code));
    const healthyServices=services.filter(item=>Number(item.status)>=200&&Number(item.status)<400&&Number(item.failures||0)===0).length;
    const orderActive=trade.reduce((sum,item)=>sum+Number(item.orders?.active||0),0);
    const orderDone=trade.reduce((sum,item)=>sum+Number(item.orders?.completed||0),0);
    const realized=trade.reduce((sum,item)=>sum+Number(item.earnings?.realized||0),0);
    const pending=trade.reduce((sum,item)=>sum+Number(item.earnings?.pending||0),0);
    const lines=[
      `${name}: ${estateMetric(product.activeUsers7d)} active users / 7d, ${estateMetric(product.activeUsers24h)} / 24h, ${estateMetric(product.activeUsers30d)} / 30d, and ${estateMetric(product.growth7dPercent,{suffix:'%'})} 7-day growth.`,
      `Observed usage: ${estateMetric(product.usageEvents7d)} events / 7d; telemetry coverage is ${tele?.coverage||'not measured'}${tele?.needsAttention?' and it needs attention':''}.`
    ];
    if(tele?.message)lines.push(`Telemetry note: ${tele.message}`);
    if(services.length)lines.push(`Operations: ${healthyServices}/${services.length} tracked services are healthy.`);
    if(trade.length)lines.push(`Commerce: ${estateMetric(orderActive)} active orders, ${estateMetric(orderDone)} completed; realized ${estateMetric(realized,{currency:trade[0]?.currency||'UGX'})}, pending ${estateMetric(pending,{currency:trade[0]?.currency||'UGX'})}.`);
    if(/\b(attention|problem|issue|risk|decision|focus|next|wrong|down|health|status)\b/i.test(query)){
      const productOps=opsAttention.filter(item=>String(item.title||'').toLowerCase().includes(code)||String(item.summary||'').toLowerCase().includes(code)||String(item.title||'').toLowerCase().includes(String(name).toLowerCase()));
      if(productOps.length)lines.push(`Needs attention: ${productOps.slice(0,3).map(item=>item.title).join('; ')}.`);
      else if(!tele?.needsAttention)lines.push('No product-specific attention signal is present in the supplied live operations/telemetry data.');
    }
    return lines.join(' ')+freshness;
  }

  const topProducts=[...products].sort((a,b)=>Number(b.activeUsers7d||0)-Number(a.activeUsers7d||0)).slice(0,5);
  if(/\b(most|top|highest|largest|active users|usage|users|growth)\b/i.test(query)){
    const growth=/\bgrowth|growing|fastest\b/i.test(query);
    const rows=[...products].sort((a,b)=>growth?Number(b.growth7dPercent||0)-Number(a.growth7dPercent||0):Number(b.activeUsers7d||0)-Number(a.activeUsers7d||0)).slice(0,5);
    return `${growth?'Top 7-day growth':'Top products by 7-day active users'}: ${rows.map(item=>`${item.name||item.code} — ${growth?estateMetric(item.growth7dPercent,{suffix:'%'}):estateMetric(item.activeUsers7d)}`).join('; ')}.${freshness}`;
  }

  if(/\b(subscription|renewal|renew|expiry|expires|quota)\b/i.test(query)){
    if(!subs.length)return 'No subscription registry data is available in the current estate context.';
    const lines=[`Subscriptions: ${estateMetric(subscriptions.summary?.total)} tracked; ${estateMetric(subscriptions.summary?.due30)} due within 30 days; ${estateMetric(subscriptions.summary?.quotaTracked)} have quota tracking.`];
    if(dueSubs.length)lines.push(`Upcoming: ${dueSubs.slice(0,5).map(item=>`${item.name} in ${item.dueDays} day${Number(item.dueDays)===1?'':'s'}`).join('; ')}.`);
    return lines.join(' ')+freshness;
  }

  if(/\b(order|orders|revenue|earnings|sales|money|commerce)\b/i.test(query)){
    return `Estate commerce: ${estateMetric(totals.ordersActive)} active orders and ${estateMetric(totals.ordersCompleted)} completed. Realized revenue is ${estateMetric(totals.realizedRevenueUGX,{currency:'UGX'})}; pending revenue is ${estateMetric(totals.pendingRevenueUGX,{currency:'UGX'})}.${freshness}`;
  }

  if(/\b(operation|operations|service|services|domain|domains|infrastructure|uptime|health|down|outage)\b/i.test(query)){
    const summary=operations.summary||{};
    const lines=[`Operations status is ${operations.status||'not measured'} with score ${estateMetric(operations.score)}/100. ${estateMetric(summary.servicesHealthy)}/${estateMetric(summary.servicesTotal)} tracked services are healthy; ${estateMetric(summary.domainsAttention)} of ${estateMetric(summary.domainsTotal)} domains need attention.`];
    if(opsAttention.length)lines.push(`Current signals: ${opsAttention.slice(0,5).map(item=>`${item.severity||'attention'} — ${item.title}`).join('; ')}.`);
    return lines.join(' ')+freshness;
  }

  const lines=[
    `Tuku Estate currently has ${estateMetric(totals.products)} tracked products, ${estateMetric(totals.activeUsers7d)} active users / 7d and ${estateMetric(totals.activeUsers24h)} / 24h.`,
    `Telemetry: ${estateMetric(totals.productsWithRichTelemetry)} products have rich telemetry and ${estateMetric(totals.productsNeedingTelemetryReview)} need telemetry review.`,
    `Operations: ${operations.status||'not measured'}${operations.score!==null&&operations.score!==undefined?` (${operations.score}/100)`:''}; ${estateMetric(operations.summary?.servicesHealthy)}/${estateMetric(operations.summary?.servicesTotal)} tracked services are healthy.`,
    `Commerce: ${estateMetric(totals.ordersActive)} active orders, ${estateMetric(totals.ordersCompleted)} completed; ${estateMetric(totals.realizedRevenueUGX,{currency:'UGX'})} realized and ${estateMetric(totals.pendingRevenueUGX,{currency:'UGX'})} pending.`
  ];
  const needs=[];
  if(opsAttention.length)needs.push(...opsAttention.slice(0,3).map(item=>item.title));
  if(attentionTelemetry.length)needs.push(`telemetry review for ${attentionTelemetry.slice(0,5).map(item=>item.productName||item.productCode).join(', ')}`);
  if(dueSubs.length)needs.push(`${dueSubs.length} subscription${dueSubs.length===1?'':'s'} due within 30 days`);
  if(needs.length)lines.push(`Needs attention: ${needs.slice(0,5).join('; ')}.`);
  if(/\b(decision|decide|focus|next|priority|priorities|attention|today|doing|update|brief|summary|draft)\b/i.test(query)){
    const decisions=[];
    if(opsAttention.length)decisions.push('clear the highest-severity operations signals first');
    if(attentionTelemetry.length)decisions.push('close telemetry gaps on products currently marked for review');
    if(dueSubs.length)decisions.push('confirm the upcoming subscription renewal/expiry');
    if(!decisions.length&&topProducts.length)decisions.push(`protect delivery around the most active products: ${topProducts.slice(0,3).map(item=>item.name||item.code).join(', ')}`);
    lines.push(`Next decisions: ${decisions.slice(0,3).join('; ')}.`);
  }
  return lines.join(' ')+freshness;
}
function safePriority(value){return ALLOWED_PRIORITY.has(String(value||'').toLowerCase())?String(value).toLowerCase():'medium';}
async function projectIdByName(name){const q=cleanString(name,200);if(!q)return null;const row=(await db.query('SELECT id FROM projects WHERE lower(name)=lower($1) LIMIT 1',[q])).rows[0];return row?.id||null;}
async function executeJakeActions(actions,userKey){
  const done=[];
  for(const action of Array.isArray(actions)?actions.slice(0,3):[]){
    if(action?.type!=='create_task')continue;
    const title=cleanString(action.title,500);if(!title)continue;
    const scheduledStart=validDate(action.scheduled_start),scheduledEnd=validDate(action.scheduled_end);
    const projectId=await projectIdByName(action.project_name);
    const item=normalizeWorkItem({title,description:cleanString(action.description,4000),priority:safePriority(action.priority),estimated_minutes:asInt(action.estimated_minutes,30,5,480),due_at:validDate(action.due_at),scheduled_start:scheduledStart,scheduled_end:scheduledEnd,project_id:projectId,status:scheduledStart?'ready':'inbox',tags:array(action.tags,20),source:'ask-jake'},{source:'ask-jake'});
    const saved=await upsertWorkItem(item,'ai_created',{actor:userKey,assistant:'jake-local'});
    let calendarEvent=null;
    if(saved.scheduled_start&&saved.scheduled_end&&gcal.isConnected()){
      try{calendarEvent=await gcal.syncTask(saved);}catch(error){console.warn('[Ask Jake] Google Calendar sync failed:',error.message);}
    }
    done.push({type:'create_task',task:saved,calendar_event:calendarEvent});
  }
  return done;
}
router.use(rateLimit({windowMs:60000,limit:240,standardHeaders:'draft-7',legacyHeaders:false}));router.use(momentumAuth());
router.get('/contract',(_req,res)=>res.set('Cache-Control','no-store').json(MOMENTUM_CONTRACT));
router.get('/health',async(req,res)=>res.json({status:'ok',service:'momentum-api',user:req.momentumUser,db:await db.ping(),time:new Date().toISOString()}));
router.get('/day',async(_req,res)=>{try{res.set('Cache-Control','no-store').json(await daySnapshot());}catch(error){res.status(500).json({error:'Day plan unavailable',detail:process.env.NODE_ENV==='development'?error.message:undefined});}});
router.get('/today',async(req,res)=>{const now=new Date(),limit=asInt(req.query.limit,7,1,20),[items,availableMinutes]=await Promise.all([candidateItems(now),nextAvailableMinutes(now)]),ranked=rankItems(items,{now,limit,availableMinutes}).map(item=>({...item,why_now:buildReason(item)}));res.json({generated_at:now.toISOString(),available_minutes_before_next_commitment:availableMinutes,priorities:ranked});});
router.get('/inbox',async(req,res)=>res.json({items:(await db.query(`SELECT wi.*,p.name AS project_name FROM work_items wi LEFT JOIN projects p ON p.id=wi.project_id WHERE wi.status='inbox' ORDER BY wi.created_at DESC LIMIT $1`,[asInt(req.query.limit,100,1,300)])).rows}));
router.get('/tasks/:id',async(req,res)=>{const item=await getWorkItem(req.params.id);if(!item)return res.status(404).json({error:'Task not found'});const events=await db.query('SELECT event_type,payload,created_at FROM work_item_events WHERE work_item_id=$1 ORDER BY created_at DESC LIMIT 50',[item.id]);res.json({item,history:events.rows});});
router.post('/tasks',async(req,res)=>{const item=normalizeWorkItem(req.body,{source:'momentum'});if(!item.title)return res.status(422).json({error:'Task title is required'});res.status(201).json({item:await upsertWorkItem(item,'created',{actor:req.momentumUser.uid})});});
router.patch('/tasks/:id',async(req,res)=>{const existing=await getWorkItem(req.params.id);if(!existing)return res.status(404).json({error:'Task not found'});if(req.body.version&&Number(req.body.version)!==Number(existing.version))return res.status(409).json({error:'Task changed on another device',current:existing});const item=normalizeWorkItem({...req.body,id:existing.id},{existing,source:existing.source||'momentum'});if(!item.title)return res.status(422).json({error:'Task title is required'});res.json({item:await upsertWorkItem(item,'updated',{actor:req.momentumUser.uid,fields:Object.keys(req.body).slice(0,30)})});});
router.post('/tasks/:id/complete',async(req,res)=>{const existing=await getWorkItem(req.params.id);if(!existing)return res.status(404).json({error:'Task not found'});const result=await db.query(`UPDATE work_items SET status='done',completed_at=NOW(),scheduled_start=NULL,scheduled_end=NULL,updated_at=NOW(),last_touched_at=NOW(),version=version+1 WHERE id=$1 RETURNING *`,[existing.id]);await db.query('INSERT INTO work_item_events(work_item_id,event_type,payload) VALUES($1,$2,$3::jsonb)',[existing.id,'completed',JSON.stringify({actor:req.momentumUser.uid})]);res.json({item:result.rows[0]});});
router.post('/tasks/:id/defer',async(req,res)=>{const until=validDate(req.body.until||req.body.deferred_until||req.body.deferredUntil);if(!until)return res.status(422).json({error:'A valid defer-until time is required'});const result=await db.query(`UPDATE work_items SET deferred_until=$2,scheduled_start=NULL,scheduled_end=NULL,status=CASE WHEN status='doing' THEN 'ready' ELSE status END,updated_at=NOW(),last_touched_at=NOW(),version=version+1 WHERE id=$1 RETURNING *`,[cleanString(req.params.id,100),until]);if(!result.rows[0])return res.status(404).json({error:'Task not found'});await db.query('INSERT INTO work_item_events(work_item_id,event_type,payload) VALUES($1,$2,$3::jsonb)',[req.params.id,'deferred',JSON.stringify({actor:req.momentumUser.uid,until})]);res.json({item:result.rows[0]});});
router.post('/capture',async(req,res)=>{const title=cleanString(req.body.text||req.body.title,500);if(!title)return res.status(422).json({error:'Capture text is required'});const item=normalizeWorkItem({...req.body,title,status:req.body.status||'inbox',source:'momentum-capture'},{source:'momentum-capture'});res.status(201).json({item:await upsertWorkItem(item,'captured',{actor:req.momentumUser.uid,capture_type:cleanString(req.body.type||'task',50)})});});
router.get('/ai/status',async(_req,res)=>res.json({...localAi.status(),calendar:gcal.getStatus(),knowledge_sources:['estate','operations','subscriptions','day','work','calendar','projects','pipeline'],fast_paths:['estate'],contracts:{chat:'/api/momentum/v1/chat',history:'/api/momentum/v1/chat/history',day:'/api/momentum/v1/day',estate:'/api/momentum/v1/estate',operations:'/api/momentum/v1/ops',subscriptions:'/api/momentum/v1/ops/subscriptions'}}));
router.get('/chat/history',async(req,res)=>{const limit=asInt(req.query.limit,40,1,100),rows=(await db.query(`SELECT id,role,content,metadata,created_at FROM jake_chat_messages WHERE user_key=$1 ORDER BY created_at DESC LIMIT $2`,[req.momentumUser.uid,limit])).rows.reverse();res.json({messages:rows});});
router.post('/chat',async(req,res)=>{const message=cleanString(req.body.message||req.body.text,5000);if(!message)return res.status(422).json({error:'Message is required'});try{const history=(await db.query(`SELECT role,content FROM jake_chat_messages WHERE user_key=$1 ORDER BY created_at DESC LIMIT 8`,[req.momentumUser.uid])).rows.reverse();await db.query(`INSERT INTO jake_chat_messages(user_key,role,content,metadata) VALUES($1,'user',$2,$3::jsonb)`,[req.momentumUser.uid,message,JSON.stringify({source:'jakeos-mobile'})]);const context=await chatContext(),fastReply=estateFastReply(message,context),result=fastReply?{reply:fastReply,actions:[],provider:'jakeos-live-estate',model:'deterministic-v1'}:await localAi.interpretJakeCommand({message,history,context}),executed=await executeJakeActions(result.actions,req.momentumUser.uid);let reply=result.reply;if(executed.length){const titles=executed.map(x=>x.task.title);reply=`${reply}${reply.endsWith('.')?'':'.'} ${executed.length===1?`Added “${titles[0]}” to JakeOS.`:`Added ${executed.length} tasks to JakeOS.`}`;}const meta={provider:result.provider,model:result.model,fast_path:!!fastReply,actions:executed.map(x=>({type:x.type,task_id:x.task.id,calendar_event_id:x.calendar_event?.id||null}))};const inserted=(await db.query(`INSERT INTO jake_chat_messages(user_key,role,content,metadata) VALUES($1,'assistant',$2,$3::jsonb) RETURNING id,role,content,metadata,created_at`,[req.momentumUser.uid,reply,JSON.stringify(meta)])).rows[0];res.json({message:inserted,actions:executed,provider:result.provider,model:result.model,fast_path:!!fastReply});}catch(error){res.status(error.status||502).json({error:error.message||'Ask Jake could not complete this request'});}});
router.get('/schedule',async(req,res)=>{const date=/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date||''))?String(req.query.date):new Date(Date.now()+180*60000).toISOString().slice(0,10);const events=await db.query(`SELECT id,title,date,project,type,done,notes,starts_at,ends_at,all_day,source FROM calendar_events WHERE (starts_at::date=$1::date OR (starts_at IS NULL AND LEFT(date,10)=($1::date)::text)) ORDER BY COALESCE(starts_at,CASE WHEN date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN date::timestamptz ELSE NOW() END) ASC`,[date]);const tasks=await db.query(`SELECT * FROM work_items WHERE scheduled_start::date=$1::date AND status NOT IN ('done','cancelled') ORDER BY scheduled_start`,[date]);res.json({date,events:events.rows,tasks:tasks.rows});});
router.post('/schedule/items',async(req,res)=>{
  try{
    const title=cleanString(req.body?.title,240),date=cleanString(req.body?.date,10),notes=cleanString(req.body?.notes,4000);
    const rawType=cleanString(req.body?.type||'event',20).toLowerCase();
    const type=['event','reminder','focus'].includes(rawType)?rawType:'event';
    const start=validDate(req.body?.startsAt||req.body?.starts_at),end=validDate(req.body?.endsAt||req.body?.ends_at);
    if(!title)return res.status(422).json({error:'Title is required'});
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return res.status(422).json({error:'A valid date is required'});
    if(!start||!end||new Date(end)<=new Date(start))return res.status(422).json({error:'A valid start and end time are required'});
    let googleEvent=null,warning=null;
    if(gcal.isConnected()){
      try{googleEvent=await gcal.createEvent({title,description:notes,start,end,reminderMinutes:type==='reminder'?0:undefined});}
      catch(error){warning='Saved in JakeOS, but Google Calendar sync failed: '+(error.message||'unknown error');}
    }
    const eventId=googleEvent?.id||id('event');
    const row=await db.insert('calendar_events',{id:eventId,title,date,project:'',type,done:false,source:googleEvent?'google':'momentum',notes,starts_at:start,ends_at:end,all_day:false,external_id:googleEvent?.id?.replace(/^gcal_/,'')||null},true);
    res.status(201).json({item:row,googleSynced:!!googleEvent,warning});
  }catch(error){res.status(500).json({error:error.message||'Schedule item could not be created'});}
});
router.post('/plan-day',async(req,res)=>{const date=/^\d{4}-\d{2}-\d{2}$/.test(String(req.body.date||''))?String(req.body.date):new Date(Date.now()+180*60000).toISOString().slice(0,10),legacyStart=asInt(req.body.startHour,8,0,23)*60,legacyEnd=asInt(req.body.endHour,18,1,24)*60,startMinute=clockMinutes(req.body.startTime??req.body.start_time,req.body.startHour===undefined?450:legacyStart),endMinute=clockMinutes(req.body.endTime??req.body.end_time,req.body.endHour===undefined?1110:legacyEnd),offsetMinutes=asInt(req.body.offsetMinutes,180,-720,840);if(endMinute<=startMinute)return res.status(422).json({error:'Plan-day end time must be after start time'});const[events,existingTasks,candidates]=await Promise.all([db.query(`SELECT starts_at,ends_at FROM calendar_events WHERE starts_at::date=$1::date AND starts_at IS NOT NULL AND ends_at IS NOT NULL`,[date]),db.query(`SELECT scheduled_start AS start,scheduled_end AS end FROM work_items WHERE scheduled_start::date=$1::date AND status NOT IN ('done','cancelled') AND scheduled_end IS NOT NULL`,[date]),candidateItems(new Date())]);const busy=[...events.rows.map(e=>({start:e.starts_at,end:e.ends_at})),...existingTasks.rows],slots=daySlots({date,busy,startMinute,endMinute,offsetMinutes}),ranked=rankItems(candidates.filter(i=>!i.scheduled_start),{now:new Date(),limit:asInt(req.body.limit,12,1,30)}),plan=allocatePlan(ranked,slots);if(bool(req.body.commit))for(const row of plan){const saved=(await db.query(`UPDATE work_items SET scheduled_start=$2,scheduled_end=$3,status=CASE WHEN status='inbox' THEN 'ready' ELSE status END,updated_at=NOW(),version=version+1 WHERE id=$1 RETURNING *`,[row.task_id,row.start,row.end])).rows[0];await db.query('INSERT INTO work_item_events(work_item_id,event_type,payload) VALUES($1,$2,$3::jsonb)',[row.task_id,'scheduled',JSON.stringify({start:row.start,end:row.end,actor:req.momentumUser.uid})]);if(saved&&gcal.isConnected())try{await gcal.syncTask(saved);}catch(error){console.warn('[Momentum] Google task sync failed:',error.message);}}res.json({date,committed:bool(req.body.commit),plan,free_slots:slots.map(s=>({start:s.start.toISOString(),end:s.end.toISOString(),minutes:Math.round((s.end-s.start)/60000)}))});});
router.get('/pulse',async(req,res)=>{const now=new Date(),soon7=new Date(now.getTime()+7*86400000).toISOString(),soon14=new Date(now.getTime()+14*86400000).toISOString();const[overdue,blocked,pipeline,invoices,opportunities,grants,signals]=await Promise.all([db.query(`SELECT id,title,due_at,priority,project_id FROM work_items WHERE status NOT IN ('done','cancelled') AND due_at<$1 ORDER BY due_at LIMIT 20`,[now.toISOString()]),db.query(`SELECT id,title,blocked_reason,project_id,updated_at FROM work_items WHERE status NOT IN ('done','cancelled') AND (blocked=TRUE OR status='waiting') ORDER BY updated_at LIMIT 20`),db.query(`SELECT id,name,org,deadline,stage,value_usd FROM pipeline WHERE deadline IS NOT NULL AND deadline ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' AND deadline::timestamptz<=$1 AND deadline::timestamptz>=$2 ORDER BY deadline LIMIT 15`,[soon14,now.toISOString()]),db.query(`SELECT id,number,client_name,total,currency,due_date,status FROM invoices WHERE status IN ('Sent','Overdue') AND due_date IS NOT NULL AND due_date<>'' AND due_date::date<CURRENT_DATE ORDER BY due_date LIMIT 15`),db.query(`SELECT id,title,org,deadline,relevance_score,status FROM opportunities WHERE status NOT IN ('Dismissed','Applied') AND deadline IS NOT NULL AND deadline ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' AND deadline::timestamptz<=$1 AND deadline::timestamptz>=$2 ORDER BY deadline LIMIT 15`,[soon14,now.toISOString()]),db.query(`SELECT id,title,funder,deadline,stage,amount,currency FROM grant_items WHERE stage NOT IN ('Awarded','Rejected') AND deadline IS NOT NULL AND deadline<>'' AND deadline ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' AND deadline::timestamptz<=$1 AND deadline::timestamptz>=$2 ORDER BY deadline LIMIT 15`,[soon14,now.toISOString()]),db.query(`SELECT * FROM attention_signals WHERE resolved=FALSE AND (due_at IS NULL OR due_at<=$1) ORDER BY severity DESC,COALESCE(due_at,created_at) ASC LIMIT 30`,[soon7])]);const cards=[...overdue.rows.map(x=>({kind:'overdue_task',severity:'high',title:x.title,summary:`Overdue${x.due_at?` since ${new Date(x.due_at).toLocaleDateString('en-GB')}`:''}`,source:'work_items',source_ref:x.id})),...blocked.rows.map(x=>({kind:'blocked_task',severity:'high',title:x.title,summary:x.blocked_reason||'Waiting or blocked',source:'work_items',source_ref:x.id})),...pipeline.rows.map(x=>({kind:'pipeline_deadline',severity:'medium',title:x.name,summary:`${x.org} · ${x.stage} · deadline ${String(x.deadline).slice(0,10)}`,source:'pipeline',source_ref:x.id})),...invoices.rows.map(x=>({kind:'overdue_invoice',severity:'high',title:`Invoice ${x.number} · ${x.client_name}`,summary:`${x.currency} ${Number(x.total||0).toLocaleString()} overdue`,source:'invoices',source_ref:x.id})),...opportunities.rows.map(x=>({kind:'opportunity_deadline',severity:'medium',title:x.title,summary:`${x.org} · deadline ${String(x.deadline).slice(0,10)} · relevance ${x.relevance_score}%`,source:'opportunities',source_ref:x.id})),...grants.rows.map(x=>({kind:'grant_deadline',severity:'medium',title:x.title,summary:`${x.funder} · ${x.stage} · deadline ${String(x.deadline).slice(0,10)}${Number(x.amount||0)>0?` · ${x.currency} ${Number(x.amount).toLocaleString()}`:''}`,source:'grant_items',source_ref:x.id})),...signals.rows.map(x=>({kind:x.signal_type,severity:x.severity,title:x.title,summary:x.summary,source:x.source,source_ref:x.source_ref,action_url:x.action_url,due_at:x.due_at,metadata:x.metadata}))];res.json({generated_at:now.toISOString(),counts:{overdue:overdue.rowCount,blocked:blocked.rowCount,pipeline_deadlines:pipeline.rowCount,overdue_invoices:invoices.rowCount,opportunity_deadlines:opportunities.rowCount,grant_deadlines:grants.rowCount,signals:signals.rowCount},cards:cards.slice(0,60)});});
router.post('/devices',async(req,res)=>{const token=cleanString(req.body.fcm_token||req.body.fcmToken,4096);if(!token)return res.status(422).json({error:'FCM token is required'});const deviceId=cleanString(req.body.device_id||req.body.deviceId||id('device'),150),result=await db.query(`INSERT INTO momentum_devices(id,user_key,platform,name,fcm_token,last_seen_at) VALUES($1,$2,$3,$4,$5,NOW()) ON CONFLICT(fcm_token) DO UPDATE SET user_key=EXCLUDED.user_key,platform=EXCLUDED.platform,name=EXCLUDED.name,last_seen_at=NOW(),updated_at=NOW() RETURNING id,user_key,platform,name,last_seen_at`,[deviceId,req.momentumUser.uid,cleanString(req.body.platform||'android',30),cleanString(req.body.name||'',120),token]);res.status(201).json({device:result.rows[0]});});
integrations.use(rateLimit({windowMs:60000,limit:120,standardHeaders:'draft-7',legacyHeaders:false}));integrations.use(ingestAuth());
integrations.post('/work-items',async(req,res)=>{const source=cleanString(req.body.source,100),sourceRef=cleanString(req.body.source_ref||req.body.sourceRef,300);if(!source||!sourceRef)return res.status(422).json({error:'source and source_ref are required'});const found=await db.query('SELECT * FROM work_items WHERE source=$1 AND source_ref=$2 LIMIT 1',[source,sourceRef]),existing=found.rows[0]||null,item=normalizeWorkItem({...req.body,id:existing?.id||req.body.id||id('wi'),source,source_ref:sourceRef},{existing,source});if(!item.title)return res.status(422).json({error:'title is required'});res.status(existing?200:201).json({item:await upsertWorkItem(item,existing?'external_updated':'external_created',{source,source_ref:sourceRef})});});
integrations.post('/signals',async(req,res)=>{const source=cleanString(req.body.source,100),sourceRef=cleanString(req.body.source_ref||req.body.sourceRef,300),signalId=cleanString(req.body.id,100)||(source&&sourceRef?`sig_${crypto.createHash('sha256').update(`${source}:${sourceRef}`).digest('hex').slice(0,24)}`:id('sig')),title=cleanString(req.body.title,500);if(!title||!source)return res.status(422).json({error:'title and source are required'});const sev=cleanString(req.body.severity,20).toLowerCase(),severity=['low','medium','high','critical'].includes(sev)?sev:'medium',result=await db.query(`INSERT INTO attention_signals(id,signal_type,title,summary,severity,source,source_ref,action_url,starts_at,due_at,resolved,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb) ON CONFLICT(id) DO UPDATE SET signal_type=EXCLUDED.signal_type,title=EXCLUDED.title,summary=EXCLUDED.summary,severity=EXCLUDED.severity,source=EXCLUDED.source,source_ref=EXCLUDED.source_ref,action_url=EXCLUDED.action_url,starts_at=EXCLUDED.starts_at,due_at=EXCLUDED.due_at,resolved=EXCLUDED.resolved,metadata=EXCLUDED.metadata,updated_at=NOW() RETURNING *`,[signalId,cleanString(req.body.signal_type||req.body.type||'attention',80),title,cleanString(req.body.summary,2000),severity,source,sourceRef||null,cleanString(req.body.action_url||req.body.actionUrl,2000),validDate(req.body.starts_at||req.body.startsAt),validDate(req.body.due_at||req.body.dueAt),bool(req.body.resolved),JSON.stringify(object(req.body.metadata))]);res.status(201).json({signal:result.rows[0]});});
integrations.patch('/signals/:id/resolve',async(req,res)=>{const result=await db.query('UPDATE attention_signals SET resolved=TRUE,resolved_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING *',[cleanString(req.params.id,100)]);if(!result.rows[0])return res.status(404).json({error:'Signal not found'});res.json({signal:result.rows[0]});});
module.exports={momentumRouter:router,integrationsRouter:integrations,normalizeWorkItem,daySnapshot,estateFastReply};
