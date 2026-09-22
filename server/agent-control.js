'use strict';
const crypto=require('crypto');
const express=require('express');
const {EventEmitter}=require('events');
const db=require('./db');

const agentBrowserRouter=express.Router();
const agentConnectorRouter=express.Router();
const bus=new EventEmitter();
bus.setMaxListeners(100);

const AGENT_REGISTRY=Object.freeze([
  ['command-orchestrator','Command Orchestrator','Command'],
  ['opportunity-watch','Opportunity Watch','Revenue'],
  ['bid-partnerships','Bid & Partnerships','Revenue'],
  ['document-knowledge','Document & Knowledge','Revenue'],
  ['assurance-reviewer','Independent Assurance','Assurance'],
  ['estate-architect','Estate Architect','Product'],
  ['product','Product Agent','Product'],
  ['software-engineering','Software Engineering','Build'],
  ['data-integration','Data & Integration','Build'],
  ['ux-ui','UX/UI','Build'],
  ['qa-simulation','QA & Simulation','Assurance'],
  ['security-production-readiness','Security & Production Readiness','Assurance'],
  ['platform-ops-sre','Platform Operations / SRE','Production'],
  ['release-manager','Release Manager','Production'],
  ['analytics-tukuiq','Analytics / TukuIQ','Intelligence'],
  ['research-intelligence','Research & Intelligence','Intelligence'],
  ['finance-commercial','Finance & Commercial','Business'],
  ['programme-impact','Programme & Impact','Delivery'],
  ['brand-content','Brand & Content','Organisation'],
  ['curriculum-learning','Curriculum & Learning Systems','Delivery'],
  ['field-delivery','Field Delivery & Logistics','Delivery'],
  ['standards-inclusion','Standards & Inclusion','Assurance'],
  ['governance-risk','Corporate Governance & Risk','Governance']
].map(([id,name,group])=>({id,name,group})));

const STATES=new Set(['working','waiting','queued','blocked','completed','failed','stale']);
const RUN_STATUSES=new Set(['queued','in_progress','verification','blocked','completed','failed']);
const DECISION_STATUSES=new Set(['open','resolved','dismissed']);
const text=(value,max=4000)=>String(value??'').trim().slice(0,max);
const json=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const list=value=>Array.isArray(value)?value.slice(0,20):[];
const bool=value=>value===true||value===1||value==='1'||String(value).toLowerCase()==='true';
const makeId=prefix=>`${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const safeState=value=>STATES.has(text(value,40))?text(value,40):null;
const safeRunStatus=value=>RUN_STATUSES.has(text(value,40))?text(value,40):'queued';
const safeDecisionStatus=value=>DECISION_STATUSES.has(text(value,40))?text(value,40):'open';
const token=()=>text(process.env.JAKEOS_AGENT_CONNECTOR_TOKEN,500);
function bearer(req){return text(req.get?.('authorization')||req.headers?.authorization,1000).match(/^Bearer\s+(.+)$/i)?.[1]||'';}
function secureEqual(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&x.length>0&&crypto.timingSafeEqual(x,y);}
function authenticateAgentConnector(req,res,next){
  const expected=token();
  if(!expected)return res.status(503).json({error:'Agent connector authentication is not configured',code:'CONNECTOR_AUTH_NOT_CONFIGURED'});
  if(!secureEqual(bearer(req),expected))return res.status(401).json({error:'Invalid agent connector credential',code:'AUTH_REQUIRED'});
  req.agentPrincipal={type:'service',id:'tuku-agent-os',scopes:['agents:read','agents:write']};
  next();
}
function eventKey(body){
  const explicit=text(body.dedupe_key||body.dedupeKey,200);
  if(explicit)return explicit;
  return crypto.createHash('sha256').update([
    text(body.run_id||body.runId,120),
    text(body.agent_id||body.agentId,120),
    text(body.event_type||body.eventType,120),
    text(body.event_at||body.eventAt,80),
    text(body.summary,500)
  ].join('|')).digest('hex');
}
function broadcast(event){bus.emit('agent-event',event);}

async function getOverview(){
  const [latestRows,activityRows,runStats,decisionStats]=await Promise.all([
    db.query(`SELECT DISTINCT ON(e.agent_id)
      e.agent_id,e.agent_name,e.state,e.summary,e.event_at,e.run_id,r.title AS current_work
      FROM agent_events e LEFT JOIN agent_runs r ON r.id=e.run_id
      ORDER BY e.agent_id,e.event_at DESC`),
    db.query(`SELECT e.id,e.run_id,e.agent_id,e.agent_name,e.event_type,e.state,e.summary,e.artifact_ref,
      e.requires_human_action,e.event_at AS created_at
      FROM agent_events e ORDER BY e.event_at DESC LIMIT 40`),
    db.query(`SELECT
      COUNT(*) FILTER(WHERE status='completed' AND updated_at>=NOW()-INTERVAL '30 days')::int AS completed,
      COUNT(*) FILTER(WHERE status='failed' AND updated_at>=NOW()-INTERVAL '30 days')::int AS failed,
      AVG(EXTRACT(EPOCH FROM(completed_at-started_at))/60.0) FILTER(WHERE status='completed' AND completed_at IS NOT NULL AND started_at IS NOT NULL AND updated_at>=NOW()-INTERVAL '30 days') AS avg_completion_minutes
      FROM agent_runs`),
    db.query(`SELECT COUNT(*) FILTER(WHERE status='open')::int AS open FROM agent_decisions`)
  ]);
  const latest=new Map(latestRows.rows.map(row=>[row.agent_id,row]));
  const staleMs=Math.max(2,Number(process.env.AGENT_STALE_MINUTES||10))*60000;
  const now=Date.now();
  const agents=AGENT_REGISTRY.map(base=>{
    const row=latest.get(base.id);
    if(!row)return{...base,state:null,current_work:null,last_seen_at:null,summary:null};
    let state=safeState(row.state);
    if(state==='working'&&row.event_at&&now-new Date(row.event_at).getTime()>staleMs)state='stale';
    return{...base,state,current_work:row.current_work||null,last_seen_at:row.event_at||null,summary:row.summary||null,run_id:row.run_id||null};
  });
  const count=state=>agents.filter(agent=>agent.state===state).length;
  const stats=runStats.rows[0]||{};
  const completed=Number(stats.completed||0),failed=Number(stats.failed||0),finished=completed+failed;
  return{
    generated_at:new Date().toISOString(),
    totals:{
      active:count('working'),
      queued:count('queued'),
      blocked:count('blocked'),
      stale:count('stale'),
      waiting:count('waiting'),
      success_rate:finished?Math.round(completed/finished*100):null,
      avg_completion_minutes:stats.avg_completion_minutes===null?null:Math.round(Number(stats.avg_completion_minutes)),
      decisions_open:Number(decisionStats.rows[0]?.open||0),
      registered:AGENT_REGISTRY.length
    },
    agents,
    activity:activityRows.rows
  };
}

agentBrowserRouter.get('/overview',async(req,res)=>{try{res.json(await getOverview());}catch(error){res.status(500).json({error:'Agent telemetry could not be loaded',detail:process.env.NODE_ENV==='development'?error.message:undefined});}});
agentBrowserRouter.get('/runs',async(req,res)=>{
  try{
    const limit=Math.max(1,Math.min(Number(req.query.limit)||50,200));
    const rows=(await db.query(`SELECT r.*,
      COUNT(DISTINCT a.id)::int AS artifacts,
      COUNT(DISTINCT d.id) FILTER(WHERE d.status='open')::int AS decisions_open
      FROM agent_runs r
      LEFT JOIN agent_artifacts a ON a.run_id=r.id
      LEFT JOIN agent_decisions d ON d.run_id=r.id
      GROUP BY r.id ORDER BY r.updated_at DESC LIMIT $1`,[limit])).rows;
    res.json({runs:rows});
  }catch(error){res.status(500).json({error:'Agent runs could not be loaded'});}
});
agentBrowserRouter.get('/runs/:id',async(req,res)=>{
  try{
    const id=text(req.params.id,120);
    const run=await db.get('agent_runs',{eq:{id}});
    if(!run)return res.status(404).json({error:'Agent run not found'});
    const [events,artifacts,decisions]=await Promise.all([
      db.all('agent_events',{eq:{run_id:id},order:{col:'event_at',asc:false},limit:300}),
      db.all('agent_artifacts',{eq:{run_id:id},order:{col:'created_at',asc:false},limit:200}),
      db.all('agent_decisions',{eq:{run_id:id},order:{col:'created_at',asc:false},limit:100})
    ]);
    res.json({run,events,artifacts,decisions});
  }catch(error){res.status(500).json({error:'Agent run could not be loaded'});}
});
agentBrowserRouter.get('/decisions',async(req,res)=>{
  try{
    const status=req.query.status?text(req.query.status,40):'open';
    const rows=await db.all('agent_decisions',{eq:status==='all'?{}:{status},order:{col:'created_at',asc:false},limit:200});
    res.json({decisions:rows});
  }catch(error){res.status(500).json({error:'Agent decisions could not be loaded'});}
});
agentBrowserRouter.post('/decisions/:id/resolve',async(req,res)=>{
  try{
    const id=text(req.params.id,120),existing=await db.get('agent_decisions',{eq:{id}});
    if(!existing)return res.status(404).json({error:'Decision not found'});
    const status=req.body.status==='dismissed'?'dismissed':'resolved';
    const resolution=text(req.body.resolution,4000);
    await db.update('agent_decisions',id,{status,resolution,resolved_at:new Date().toISOString(),updated_at:new Date().toISOString()});
    res.json({decision:await db.get('agent_decisions',{eq:{id}})});
  }catch(error){res.status(500).json({error:'Decision could not be resolved'});}
});
agentBrowserRouter.get('/events/stream',async(req,res)=>{
  res.status(200);
  res.setHeader('Content-Type','text/event-stream');
  res.setHeader('Cache-Control','no-cache, no-transform');
  res.setHeader('Connection','keep-alive');
  res.flushHeaders?.();
  res.write(`event: connected\ndata: ${JSON.stringify({connected:true,time:new Date().toISOString()})}\n\n`);
  const send=event=>res.write(`event: agent-event\ndata: ${JSON.stringify(event)}\n\n`);
  bus.on('agent-event',send);
  const heartbeat=setInterval(()=>res.write(`event: heartbeat\ndata: ${JSON.stringify({time:new Date().toISOString()})}\n\n`),20000);
  req.on('close',()=>{clearInterval(heartbeat);bus.off('agent-event',send);});
});

agentConnectorRouter.get('/capabilities',(req,res)=>res.json({service:'JakeOS Agent Telemetry',principal:req.agentPrincipal.id,scopes:req.agentPrincipal.scopes,write_operations:['runs','events','artifacts','decisions','work:claim','work:heartbeat','work:result'],read_operations:['work:queue'],delete:false}));
agentConnectorRouter.post('/runs',async(req,res)=>{
  try{
    const body=req.body||{},id=text(body.id,120)||makeId('run'),title=text(body.title,500);
    if(!title)return res.status(422).json({error:'title is required'});
    const existing=await db.get('agent_runs',{eq:{id}});
    const data={
      id,title,status:safeRunStatus(body.status),
      progress:Math.max(0,Math.min(100,Number(body.progress)||0)),
      context_type:text(body.context_type||body.contextType,80)||null,
      context_ref:text(body.context_ref||body.contextRef,500)||null,
      current_agent:text(body.current_agent||body.currentAgent,120)||null,
      blockers_count:Math.max(0,Number(body.blockers_count??body.blockersCount)||0),
      evidence_required:body.evidence_required===undefined?true:bool(body.evidence_required),
      metadata:json(body.metadata),
      started_at:body.started_at||body.startedAt||existing?.started_at||new Date().toISOString(),
      completed_at:body.completed_at||body.completedAt||null,
      updated_at:new Date().toISOString()
    };
    let run;
    if(existing){await db.update('agent_runs',id,data);run=await db.get('agent_runs',{eq:{id}});}
    else run=await db.insert('agent_runs',{...data,created_at:new Date().toISOString()},false);
    res.status(existing?200:201).json({run});
  }catch(error){res.status(500).json({error:'Agent run intake failed'});}
});
agentConnectorRouter.post('/events',async(req,res)=>{
  try{
    const body=req.body||{},agentId=text(body.agent_id||body.agentId,120),summary=text(body.summary,4000),eventType=text(body.event_type||body.eventType,120);
    if(!agentId||!summary||!eventType)return res.status(422).json({error:'agent_id, event_type and summary are required'});
    const dedupe=eventKey(body),existing=(await db.query('SELECT * FROM agent_events WHERE dedupe_key=$1 LIMIT 1',[dedupe])).rows[0];
    if(existing)return res.json({event:existing,replayed:true});
    const registry=AGENT_REGISTRY.find(agent=>agent.id===agentId);
    const event=await db.insert('agent_events',{
      id:text(body.id,120)||makeId('evt'),
      run_id:text(body.run_id||body.runId,120)||null,
      agent_id:agentId,
      agent_name:text(body.agent_name||body.agentName,200)||registry?.name||agentId,
      event_type:eventType,
      state:safeState(body.state),
      summary,
      artifact_ref:text(body.artifact_ref||body.artifactRef,2000)||null,
      requires_human_action:bool(body.requires_human_action??body.requiresHumanAction),
      event_at:body.event_at||body.eventAt||new Date().toISOString(),
      dedupe_key:dedupe,
      metadata:json(body.metadata)
    },false);
    if(event?.run_id){
      const patch={updated_at:new Date().toISOString(),current_agent:agentId};
      if(event.state==='blocked')patch.blockers_count=1;
      await db.update('agent_runs',event.run_id,patch);
    }
    if(event)broadcast(event);
    res.status(201).json({event,replayed:false});
  }catch(error){res.status(500).json({error:'Agent event intake failed'});}
});
agentConnectorRouter.post('/artifacts',async(req,res)=>{
  try{
    const body=req.body||{},runId=text(body.run_id||body.runId,120),name=text(body.name,500),uri=text(body.uri,4000);
    if(!runId||!name||!uri)return res.status(422).json({error:'run_id, name and uri are required'});
    const artifact=await db.insert('agent_artifacts',{
      id:text(body.id,120)||makeId('artifact'),
      run_id:runId,
      agent_id:text(body.agent_id||body.agentId,120)||null,
      name,
      artifact_type:text(body.artifact_type||body.artifactType,120)||'evidence',
      uri,
      evidence_kind:text(body.evidence_kind||body.evidenceKind,120)||null,
      metadata:json(body.metadata)
    },false);
    res.status(201).json({artifact});
  }catch(error){res.status(500).json({error:'Agent artifact intake failed'});}
});
agentConnectorRouter.post('/decisions',async(req,res)=>{
  try{
    const body=req.body||{},title=text(body.title,500);
    if(!title)return res.status(422).json({error:'title is required'});
    const decision=await db.insert('agent_decisions',{
      id:text(body.id,120)||makeId('decision'),
      run_id:text(body.run_id||body.runId,120)||null,
      title,
      status:safeDecisionStatus(body.status),
      priority:text(body.priority,40)||'medium',
      recommendation:text(body.recommendation,4000),
      options:list(body.options),
      due_at:body.due_at||body.dueAt||null,
      metadata:json(body.metadata)
    },false);
    res.status(201).json({decision});
  }catch(error){res.status(500).json({error:'Agent decision intake failed'});}
});

module.exports={agentBrowserRouter,agentConnectorRouter,authenticateAgentConnector,AGENT_REGISTRY,broadcastAgentEvent:broadcast};
