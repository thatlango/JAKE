'use strict';
const crypto=require('crypto');
const express=require('express');
const db=require('./db');
const {momentumAuth}=require('./tuku-auth');
const {commandCenterOverview}=require('./overview');
const {fetchEstateSnapshot,fetchProductSnapshot,compactEstate}=require('./estate');
const {overview:opsOverview}=require('./ops');
const {rankItems,buildReason}=require('./priority');
const {interpretJakeCommand,status:aiStatus}=require('./ai');

const router=express.Router();
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
const safeText=(value,max=4000)=>String(value??'').trim().slice(0,max);
const safePriority=value=>['low','medium','high','critical'].includes(String(value||'').toLowerCase())?String(value).toLowerCase():'medium';

async function actionableWork(limit=7){
  const rows=(await db.query(`SELECT wi.*,p.name AS project_name,p.emoji AS project_emoji
    FROM work_items wi LEFT JOIN projects p ON p.id=wi.project_id
    WHERE wi.status NOT IN('done','cancelled','waiting') AND wi.blocked=FALSE
      AND (wi.deferred_until IS NULL OR wi.deferred_until<=NOW())
    ORDER BY wi.updated_at DESC LIMIT 250`)).rows;
  return rankItems(rows,{limit:clamp(limit,1,20)||7}).map(item=>({...item,why_now:buildReason(item)}));
}

async function nextCommitment(){
  return (await db.query(`SELECT id,title,project,starts_at,ends_at,all_day,source
    FROM calendar_events WHERE starts_at IS NOT NULL AND starts_at>=NOW()
    ORDER BY starts_at ASC LIMIT 1`)).rows[0]||null;
}

function mobileHomeShape(command,ops,today,next){
  const estate=command.estate||{};
  const totals=estate.totals||{};
  const signals=Array.isArray(command.attention_signals)?command.attention_signals:[];
  const critical=signals.filter(s=>String(s.severity).toLowerCase()==='critical');
  const high=signals.filter(s=>String(s.severity).toLowerCase()==='high');
  const attentionCount=signals.length;
  const severity=critical.length?'critical':high.length?'high':attentionCount?'attention':'healthy';
  const title=attentionCount?`${attentionCount} ${attentionCount===1?'thing needs':'things need'} your attention`:'No urgent exceptions right now';
  const detail=[critical.length?`${critical.length} critical`:null,high.length?`${high.length} high priority`:null,Number(command.tasks?.overdue||0)?`${command.tasks.overdue} overdue`:null].filter(Boolean).join(' · ');
  const estateAvailable=estate.available!==false&&Object.keys(totals).length>0;
  const realized=estateAvailable&&Number.isFinite(Number(totals.realizedRevenueUGX))?Number(totals.realizedRevenueUGX):null;
  return{
    generatedAt:command.generated_at||new Date().toISOString(),
    commandSummary:{severity,title,detail,count:attentionCount},
    kpis:[
      {key:'products',label:'Estate',value:estateAvailable?Number(totals.products||estate.products?.length||0):null,unit:'products',status:estateAvailable?'available':'unavailable'},
      {key:'users7d',label:'Active users',value:estateAvailable?Number(totals.activeUsers7d||0):null,unit:'7d',status:estate.stale?'stale':estateAvailable?'available':'unavailable'},
      {key:'revenue',label:'Realized revenue',value:realized,unit:'UGX',status:realized==null?'unavailable':'available'},
      {key:'infrastructure',label:'Infrastructure',value:Number.isFinite(Number(ops?.score))?Number(ops.score):null,unit:'health',status:ops?.status||'unavailable'}
    ],
    attention:signals.slice(0,8).map(s=>({id:s.id,severity:s.severity,title:s.title,summary:s.summary,source:s.source,sourceRef:s.source_ref,dueAt:s.due_at,actionUrl:s.action_url})),
    nextCommitment:next,
    nextWork:today.slice(0,5),
    work:{open:Number(command.tasks?.open||0),doing:Number(command.tasks?.doing||0),overdue:Number(command.tasks?.overdue||0),blocked:Number(command.tasks?.blocked||0)},
    estate:{available:estate.available!==false,stale:!!estate.stale,lastSuccessfulAt:estate.lastSuccessfulAt||null,error:estate.error||null,totals,products:(estate.products||[]).slice(0,8),commerce:(estate.commerce||[]).slice(0,8)},
    watch:{score:ops?.score??null,status:ops?.status||'unavailable',summary:ops?.summary||{}}
  };
}

async function createTaskFromAction(action,user){
  const title=safeText(action.title,240);
  if(!title)throw new Error('AI task title is empty');
  let projectId=null,projectName=null;
  if(action.project_name){
    const project=(await db.query(`SELECT id,name FROM projects WHERE lower(name)=lower($1) LIMIT 1`,[safeText(action.project_name,160)])).rows[0];
    if(project){projectId=project.id;projectName=project.name;}
  }
  const id=`work_${crypto.randomUUID()}`;
  const estimated=Math.max(5,Math.min(480,Number(action.estimated_minutes)||30));
  const priority=safePriority(action.priority);
  const dueAt=action.due_at||null,scheduledStart=action.scheduled_start||null,scheduledEnd=action.scheduled_end||null;
  const tags=Array.isArray(action.tags)?action.tags.map(v=>safeText(v,80)).filter(Boolean).slice(0,12):[];
  await db.query(`INSERT INTO work_items(id,project_id,title,description,status,priority,estimated_minutes,due_at,scheduled_start,scheduled_end,source,source_ref,tags,metadata)
    VALUES($1,$2,$3,$4,'inbox',$5,$6,$7,$8,$9,'jakeos-mobile',$10,$11::jsonb,$12::jsonb)`,[
      id,projectId,title,safeText(action.description,4000),priority,estimated,dueAt,scheduledStart,scheduledEnd,
      `ai:${crypto.randomUUID()}`,JSON.stringify(tags),JSON.stringify({createdBy:'jake-ai-mobile',coreUserId:user?.coreUserId||null})
    ]);
  await db.query(`INSERT INTO work_item_events(work_item_id,event_type,payload) VALUES($1,'created',$2::jsonb)`,[id,JSON.stringify({source:'jake-ai-mobile'})]);
  return{id,title,projectId,projectName,priority,estimatedMinutes:estimated,dueAt,scheduledStart,scheduledEnd,status:'inbox'};
}

router.get('/health',async(_,res)=>res.json({status:'ok',app:'JakeOS Mobile API',version:'1.0',db:await db.ping(),time:new Date().toISOString()}));
router.use(momentumAuth());
router.get('/me',(req,res)=>res.set('Cache-Control','no-store').json({authenticated:true,user:req.momentumUser,ai:aiStatus()}));

router.get('/home',async(req,res)=>{
  try{
    const[command,ops,today,next]=await Promise.all([commandCenterOverview(),opsOverview(),actionableWork(7),nextCommitment()]);
    res.set('Cache-Control','no-store').json(mobileHomeShape(command,ops,today,next));
  }catch(error){res.status(500).json({error:'JakeOS home is unavailable',detail:process.env.NODE_ENV==='development'?error.message:undefined});}
});

router.get('/work/today',async(req,res)=>{
  try{const[tasks,next]=await Promise.all([actionableWork(req.query.limit||7),nextCommitment()]);res.json({generatedAt:new Date().toISOString(),nextCommitment:next,tasks});}
  catch(error){res.status(500).json({error:'Today view is unavailable'});}
});

router.get('/work/projects',async(_,res)=>{
  try{
    const rows=(await db.query(`SELECT p.id,p.name,p.emoji,p.description,p.status,p.priority,p.progress,
      COUNT(wi.id) FILTER(WHERE wi.status NOT IN('done','cancelled'))::int AS open_tasks,
      COUNT(wi.id) FILTER(WHERE wi.status='doing')::int AS doing_tasks,
      COUNT(wi.id) FILTER(WHERE wi.status NOT IN('done','cancelled') AND wi.blocked=TRUE)::int AS blocked_tasks,
      MIN(wi.due_at) FILTER(WHERE wi.status NOT IN('done','cancelled') AND wi.due_at IS NOT NULL) AS next_due_at
      FROM projects p LEFT JOIN work_items wi ON wi.project_id=p.id GROUP BY p.id ORDER BY p.priority,p.name`)).rows;
    res.json({projects:rows});
  }catch{res.status(500).json({error:'Projects are unavailable'});}
});

router.get('/work/projects/:id',async(req,res)=>{
  try{
    const project=(await db.query(`SELECT * FROM projects WHERE id=$1 LIMIT 1`,[safeText(req.params.id,120)])).rows[0];
    if(!project)return res.status(404).json({error:'Project not found'});
    const tasks=(await db.query(`SELECT * FROM work_items WHERE project_id=$1 ORDER BY CASE status WHEN 'doing' THEN 0 WHEN 'inbox' THEN 1 WHEN 'todo' THEN 2 WHEN 'waiting' THEN 3 ELSE 4 END,due_at NULLS LAST,updated_at DESC LIMIT 250`,[project.id])).rows;
    res.json({project,tasks});
  }catch{res.status(500).json({error:'Project is unavailable'});}
});

router.post('/work/tasks',async(req,res)=>{
  try{
    const action={title:req.body?.title,description:req.body?.description,priority:req.body?.priority,estimated_minutes:req.body?.estimatedMinutes||req.body?.estimated_minutes,due_at:req.body?.dueAt||req.body?.due_at,scheduled_start:req.body?.scheduledStart||req.body?.scheduled_start,scheduled_end:req.body?.scheduledEnd||req.body?.scheduled_end,project_name:req.body?.projectName||req.body?.project_name,tags:req.body?.tags};
    const task=await createTaskFromAction(action,req.momentumUser);res.status(201).json({task});
  }catch(error){res.status(422).json({error:error.message||'Task could not be created'});}
});

router.post('/work/tasks/:id/complete',async(req,res)=>{
  try{
    const id=safeText(req.params.id,160);const result=await db.query(`UPDATE work_items SET status='done',completed_at=NOW(),scheduled_start=NULL,scheduled_end=NULL,version=version+1,updated_at=NOW(),last_touched_at=NOW() WHERE id=$1 RETURNING *`,[id]);
    if(!result.rows[0])return res.status(404).json({error:'Task not found'});
    await db.query(`INSERT INTO work_item_events(work_item_id,event_type,payload) VALUES($1,'completed',$2::jsonb)`,[id,JSON.stringify({source:'jakeos-mobile'})]);
    res.json({task:result.rows[0]});
  }catch{res.status(500).json({error:'Task could not be completed'});}
});

router.get('/estate',async(req,res)=>{
  const result=await fetchEstateSnapshot({force:req.query.refresh==='1'});
  res.status(result.available?200:503).json({...result,snapshot:compactEstate(result.snapshot)});
});
router.get('/estate/:code',async(req,res)=>{
  const result=await fetchProductSnapshot(req.params.code,{force:req.query.refresh==='1'});
  res.status(result.available?200:result.configured?404:503).json(result);
});

router.get('/watch',async(_,res)=>{
  try{
    const[data,subscriptions]=await Promise.all([
      opsOverview(),
      db.query(`SELECT id,name,provider,plan_name,billing_mode,billing_cycle,amount,currency,next_renewal_at,expires_at,auto_renew,status,usage_current,usage_limit,usage_unit,usage_period_end FROM ops_subscriptions WHERE status='active' ORDER BY COALESCE(expires_at,next_renewal_at) NULLS LAST,name`).then(r=>r.rows).catch(()=>[])
    ]);
    res.json({...data,subscriptions});
  }catch{res.status(500).json({error:'Infrastructure watch is unavailable'});}
});

router.get('/alerts',async(req,res)=>{
  try{
    const limit=clamp(req.query.limit||50,1,100)||50;
    const rows=(await db.query(`SELECT id,signal_type,title,summary,severity,source,source_ref,action_url,starts_at,due_at,metadata,created_at,updated_at FROM attention_signals WHERE resolved=FALSE ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,COALESCE(due_at,created_at) ASC LIMIT $1`,[limit])).rows;
    res.json({alerts:rows});
  }catch{res.status(500).json({error:'Alerts are unavailable'});}
});

router.post('/devices',async(req,res)=>{
  try{
    const token=safeText(req.body?.fcmToken||req.body?.fcm_token,4096),deviceId=safeText(req.body?.deviceId||req.body?.device_id,160),name=safeText(req.body?.name,160);
    if(!token||!deviceId)return res.status(422).json({error:'fcmToken and deviceId are required'});
    await db.query(`INSERT INTO momentum_devices(id,user_key,platform,name,fcm_token,last_seen_at,updated_at) VALUES($1,$2,'android',$3,$4,NOW(),NOW()) ON CONFLICT(id) DO UPDATE SET user_key=EXCLUDED.user_key,name=EXCLUDED.name,fcm_token=EXCLUDED.fcm_token,last_seen_at=NOW(),updated_at=NOW()`,[deviceId,req.momentumUser.coreUserId,name,token]);
    res.status(202).json({registered:true});
  }catch{res.status(500).json({error:'Device could not be registered'});}
});

router.post('/ai/command',async(req,res)=>{
  try{
    const message=safeText(req.body?.message,5000);if(!message)return res.status(422).json({error:'message is required'});
    const history=Array.isArray(req.body?.history)?req.body.history.slice(-8):[];
    const[command,ops,today]=await Promise.all([commandCenterOverview(),opsOverview(),actionableWork(7)]);
    const interpreted=await interpretJakeCommand({message,history,context:{now:new Date().toISOString(),timezone:'Africa/Kampala',home:command,watch:{score:ops.score,status:ops.status,summary:ops.summary,attention:ops.attention?.slice(0,12)},today}});
    const executed=[];
    for(const action of interpreted.actions||[]){
      if(action?.type==='create_task'){
        try{executed.push({type:'create_task',status:'executed',task:await createTaskFromAction(action,req.momentumUser)});}catch(error){executed.push({type:'create_task',status:'failed',error:error.message});}
      }
    }
    res.json({reply:interpreted.reply,model:interpreted.model,provider:interpreted.provider,actions:executed});
  }catch(error){res.status(error.status||500).json({error:error.message||'Jake AI is unavailable'});}
});

module.exports={mobileRouter:router,mobileHomeShape,actionableWork,createTaskFromAction};
