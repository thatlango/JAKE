'use strict';
const express=require('express');
const crypto=require('crypto');
const db=require('./db');
const localAi=require('./ai');
const {broadcastAgentEvent}=require('./agent-control');
const {defaultScopesFor,normalizeScopes}=require('./errand-policy');

const agentWorkBrowserRouter=express.Router();
const agentWorkConnectorRouter=express.Router();

const AGENTS={
  'command-orchestrator':{name:'Command Orchestrator',local:true},
  'opportunity-watch':{name:'Opportunity Watch',local:false},
  'bid-partnerships':{name:'Bid & Partnerships',local:true},
  'document-knowledge':{name:'Document & Knowledge',local:true},
  'assurance-reviewer':{name:'Independent Assurance',local:false}
};
const text=(v,max=10000)=>String(v??'').trim().slice(0,max);
const makeId=p=>p+'_'+Date.now()+'_'+crypto.randomBytes(4).toString('hex');
const now=()=>new Date().toISOString();

function routeAgent(request=''){
  const q=String(request).toLowerCase();
  if(/\b(tender|rfp|eoi|bid|proposal|technical proposal|financial proposal)\b/.test(q))return'bid-partnerships';
  if(/\b(find|scan|search|watch|source)\b.*\b(opportunit|tender|procurement|grant)\b/.test(q))return'opportunity-watch';
  if(/\b(audit|assurance|verify|verification|security review|qa|quality review)\b/.test(q))return'assurance-reviewer';
  if(/\b(draft|write|prepare|rewrite|edit|report|memo|brief|concept note|sop|manual|letter|email|document|summary)\b/.test(q))return'document-knowledge';
  return'command-orchestrator';
}
function deliverableType(request=''){
  const q=String(request).toLowerCase();
  if(/\b(proposal|bid|tender|rfp|eoi)\b/.test(q))return'proposal';
  if(/\b(report)\b/.test(q))return'report';
  if(/\b(research|scan|find)\b/.test(q))return'research';
  if(/\b(review|audit|verify)\b/.test(q))return'review';
  return'draft';
}
function cleanRequest(raw=''){
  return text(raw,12000).replace(/^\s*(delegate\s*:|ask\s+(?:the\s+)?agents?\s+to|have\s+(?:the\s+)?agents?\s+)/i,'').trim();
}
function titleFromRequest(request){
  const cleaned=cleanRequest(request).replace(/\s+/g,' ');
  return cleaned.length<=120?cleaned:cleaned.slice(0,117)+'...';
}
async function getWork(workId,client=db){
  const q=client.query?client:db;
  return (await q.query(`SELECT wi.*,p.name AS project_name,p.emoji AS project_emoji
    FROM work_items wi LEFT JOIN projects p ON p.id=wi.project_id WHERE wi.id=$1 LIMIT 1`,[workId])).rows[0]||null;
}
async function getDispatchByWork(workId){
  return (await db.query('SELECT * FROM agent_work_dispatches WHERE work_item_id=$1 LIMIT 1',[workId])).rows[0]||null;
}
async function getDispatch(id){
  return (await db.query('SELECT * FROM agent_work_dispatches WHERE id=$1 LIMIT 1',[id])).rows[0]||null;
}
async function decorateWorkRows(rows=[]){
  if(!rows.length)return rows;
  const ids=rows.map(r=>r.id);
  const dispatches=(await db.query(`SELECT id,work_item_id,run_id,requested_agent_id,requested_agent_name,state,result_summary,artifact_uri,failure_reason,updated_at
    FROM agent_work_dispatches WHERE work_item_id=ANY($1::text[])`,[ids])).rows;
  const map=new Map(dispatches.map(d=>[d.work_item_id,d]));
  return rows.map(row=>{
    const d=map.get(row.id);
    return d?{...row,agent_dispatch_id:d.id,agent_run_id:d.run_id,agent_id:d.requested_agent_id,agent_name:d.requested_agent_name,agent_state:d.state,agent_result_summary:d.result_summary,agent_artifact_uri:d.artifact_uri,agent_failure_reason:d.failure_reason,agent_updated_at:d.updated_at}:row;
  });
}
async function recordWorkEvent(client,workId,type,payload={}){
  await client.query('INSERT INTO work_item_events(work_item_id,event_type,payload) VALUES($1,$2,$3::jsonb)',[workId,type,JSON.stringify(payload)]);
}
async function recordAgentEvent(client,{runId,agentId,agentName,eventType,state,summary,artifactRef=null,human=false,metadata={}}){
  const event=(await client.query(`INSERT INTO agent_events(id,run_id,agent_id,agent_name,event_type,state,summary,artifact_ref,requires_human_action,event_at,dedupe_key,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),$10,$11::jsonb)
    RETURNING id,run_id,agent_id,agent_name,event_type,state,summary,artifact_ref,requires_human_action,event_at,event_at AS created_at,metadata`,[
      makeId('evt'),runId,agentId,agentName,eventType,state,summary,artifactRef,human,
      crypto.createHash('sha256').update([runId,agentId,eventType,summary,Date.now()].join('|')).digest('hex'),
      JSON.stringify(metadata)
    ])).rows[0];
  if(event)queueMicrotask(()=>broadcastAgentEvent(event));
  return event;
}
async function createDispatchForWork(workId,{requestText,agentId,requestKey=null,requestedBy='jake',deliverable=null,executorPreference='auto',approvalPolicy='external',toolScopes=null,maxCostUsd=null,maxToolCalls=null}={}){
  const existing=await getDispatchByWork(workId);
  if(existing&&['queued','working','review','blocked','failed'].includes(existing.state))return{dispatch:existing,replayed:true};
  const work=await getWork(workId);
  if(!work)throw Object.assign(new Error('Work item not found'),{status:404});
  const chosen=AGENTS[agentId]?agentId:routeAgent(requestText||work.description||work.title);
  const agent=AGENTS[chosen];
  const request=cleanRequest(requestText||work.description||work.title);
  const type=deliverable||deliverableType(request);
  const meta=work.metadata&&typeof work.metadata==='object'?work.metadata:{};
  const executor=['auto','local','openai','external'].includes(executorPreference)?executorPreference:'auto';
  const approval=['auto','evidence','external','executive'].includes(approvalPolicy)?approvalPolicy:'external';
  const scopes=normalizeScopes(Array.isArray(toolScopes)&&toolScopes.length?toolScopes:defaultScopesFor({outcomeType:meta.outcome_type,marketStage:meta.market_stage,requestedAgentId:chosen}));
  const budget=Math.max(0.05,Math.min(100,Number(maxCostUsd)||Number(process.env.OPENAI_ERRAND_DEFAULT_MAX_COST_USD)||2));
  const toolBudget=Math.max(1,Math.min(100,Number(maxToolCalls)||Number(process.env.OPENAI_ERRAND_DEFAULT_MAX_TOOL_CALLS)||24));
  return db.withTransaction(async client=>{
    const runId=existing?.run_id||makeId('run');
    if(existing){
      const row=(await client.query(`UPDATE agent_work_dispatches SET request_key=COALESCE($2,request_key),requested_agent_id=$3,requested_agent_name=$4,request_text=$5,deliverable_type=$6,state='queued',executor_id=NULL,lease_expires_at=NULL,claimed_at=NULL,completed_at=NULL,failure_reason=NULL,requested_by=$7,local_executable=$8,remote_executable=$9,executor_preference=$10,approval_policy=$11,tool_scopes=$12::jsonb,max_cost_usd=$13,max_tool_calls=$14,pending_action=NULL,response_state=NULL,updated_at=NOW() WHERE id=$1 RETURNING *`,[existing.id,requestKey,chosen,agent.name,request,type,requestedBy,agent.local&&executor!=='openai',executor!=='local',executor,approval,JSON.stringify(scopes),budget,toolBudget])).rows[0];
      await client.query(`UPDATE agent_runs SET status='queued',progress=0,current_agent=$2,blockers_count=0,completed_at=NULL,updated_at=NOW() WHERE id=$1`,[runId,chosen]);
      await client.query(`UPDATE work_items SET status='ready',blocked=FALSE,blocked_reason='',updated_at=NOW(),last_touched_at=NOW(),version=version+1 WHERE id=$1`,[workId]);
      await recordWorkEvent(client,workId,'agent_requeued',{dispatch_id:row.id,agent_id:chosen});
      await recordAgentEvent(client,{runId,agentId:chosen,agentName:agent.name,eventType:'work_queued',state:'queued',summary:'Work queued from JakeOS',metadata:{work_item_id:workId}});
      return{dispatch:row,replayed:false};
    }
    await client.query(`INSERT INTO agent_runs(id,title,status,progress,context_type,context_ref,current_agent,blockers_count,evidence_required,metadata,started_at,created_at,updated_at)
      VALUES($1,$2,'queued',0,'work_item',$3,$4,0,TRUE,$5::jsonb,NULL,NOW(),NOW())`,[runId,work.title,workId,chosen,JSON.stringify({work_item_id:workId,deliverable_type:type})]);
    const dispatchId=makeId('dispatch');
    const row=(await client.query(`INSERT INTO agent_work_dispatches(id,work_item_id,run_id,request_key,requested_agent_id,requested_agent_name,request_text,deliverable_type,state,local_executable,remote_executable,executor_preference,approval_policy,tool_scopes,max_cost_usd,max_tool_calls,requested_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'queued',$9,$10,$11,$12,$13::jsonb,$14,$15,$16) RETURNING *`,[dispatchId,workId,runId,requestKey,chosen,agent.name,request,type,agent.local&&executor!=='openai',executor!=='local',executor,approval,JSON.stringify(scopes),budget,toolBudget,requestedBy])).rows[0];
    await client.query(`UPDATE work_items SET status='ready',source=CASE WHEN source='jakeos' THEN source ELSE source END,updated_at=NOW(),last_touched_at=NOW(),version=version+1 WHERE id=$1`,[workId]);
    await recordWorkEvent(client,workId,'agent_delegated',{dispatch_id:dispatchId,run_id:runId,agent_id:chosen,agent_name:agent.name,deliverable_type:type});
    await recordAgentEvent(client,{runId,agentId:chosen,agentName:agent.name,eventType:'work_queued',state:'queued',summary:'Work queued from JakeOS',metadata:{work_item_id:workId,dispatch_id:dispatchId}});
    return{dispatch:row,replayed:false};
  });
}
async function createJakeDelegation({requestId,request,module='dashboard',executorPreference='auto',approvalPolicy='external',toolScopes=null,maxCostUsd=null,maxToolCalls=null}){
  const req=cleanRequest(request);
  if(!req)throw Object.assign(new Error('Request is required'),{status:422});
  if(requestId){
    const existing=(await db.query('SELECT * FROM agent_work_dispatches WHERE request_key=$1 LIMIT 1',[requestId])).rows[0];
    if(existing)return{work:await getWork(existing.work_item_id),dispatch:existing,replayed:true};
  }
  const agentId=routeAgent(req),agent=AGENTS[agentId],workId=makeId('work');
  const executor=['auto','local','openai','external'].includes(executorPreference)?executorPreference:'auto';
  const approval=['auto','evidence','external','executive'].includes(approvalPolicy)?approvalPolicy:'external';
  const scopes=normalizeScopes(Array.isArray(toolScopes)&&toolScopes.length?toolScopes:defaultScopesFor({requestedAgentId:agentId}));
  const budget=Math.max(0.05,Math.min(100,Number(maxCostUsd)||Number(process.env.OPENAI_ERRAND_DEFAULT_MAX_COST_USD)||2));
  const toolBudget=Math.max(1,Math.min(100,Number(maxToolCalls)||Number(process.env.OPENAI_ERRAND_DEFAULT_MAX_TOOL_CALLS)||24));
  return db.withTransaction(async client=>{
    const work=(await client.query(`INSERT INTO work_items(id,title,description,status,priority,impact,strategic_weight,estimated_minutes,source,source_ref,tags,metadata,last_touched_at)
      VALUES($1,$2,$3,'ready','medium',3,3,45,'jake-ai',$4,$5::jsonb,$6::jsonb,NOW()) RETURNING *`,[
        workId,titleFromRequest(req),req,requestId||null,JSON.stringify(['agent-delegated',module]),JSON.stringify({delegated_by:'jake-ai',module})
      ])).rows[0];
    const runId=makeId('run'),dispatchId=makeId('dispatch'),type=deliverableType(req);
    await client.query(`INSERT INTO agent_runs(id,title,status,progress,context_type,context_ref,current_agent,blockers_count,evidence_required,metadata,created_at,updated_at)
      VALUES($1,$2,'queued',0,'work_item',$3,$4,0,TRUE,$5::jsonb,NOW(),NOW())`,[runId,work.title,workId,agentId,JSON.stringify({work_item_id:workId,deliverable_type:type})]);
    const dispatch=(await client.query(`INSERT INTO agent_work_dispatches(id,work_item_id,run_id,request_key,requested_agent_id,requested_agent_name,request_text,deliverable_type,state,local_executable,remote_executable,executor_preference,approval_policy,tool_scopes,max_cost_usd,max_tool_calls,requested_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'queued',$9,$10,$11,$12,$13::jsonb,$14,$15,'jake-ai') RETURNING *`,[dispatchId,workId,runId,requestId||null,agentId,agent.name,req,type,agent.local&&executor!=='openai',executor!=='local',executor,approval,JSON.stringify(scopes),budget,toolBudget])).rows[0];
    await recordWorkEvent(client,workId,'created',{actor:'jake-ai'});
    await recordWorkEvent(client,workId,'agent_delegated',{dispatch_id:dispatchId,run_id:runId,agent_id:agentId,agent_name:agent.name,deliverable_type:type});
    await recordAgentEvent(client,{runId,agentId,agentName:agent.name,eventType:'work_queued',state:'queued',summary:'Jake delegated work to '+agent.name,metadata:{work_item_id:workId,dispatch_id:dispatchId}});
    return{work,dispatch,replayed:false};
  });
}
async function claimDispatch(id,executorId,leaseSeconds=300){
  const seconds=Math.max(60,Math.min(1800,Number(leaseSeconds)||300));
  return db.withTransaction(async client=>{
    const row=(await client.query(`UPDATE agent_work_dispatches
      SET state='working',executor_id=$2,claimed_at=COALESCE(claimed_at,NOW()),lease_expires_at=NOW()+($3::text||' seconds')::interval,updated_at=NOW()
      WHERE id=$1 AND (state='queued' OR (state='working' AND lease_expires_at<NOW())) RETURNING *`,[id,executorId,seconds])).rows[0];
    if(!row)throw Object.assign(new Error('Dispatch is not claimable'),{status:409});
    await client.query(`UPDATE work_items SET status='doing',blocked=FALSE,blocked_reason='',updated_at=NOW(),last_touched_at=NOW(),version=version+1 WHERE id=$1`,[row.work_item_id]);
    await client.query(`UPDATE agent_runs SET status='in_progress',progress=10,current_agent=$2,started_at=COALESCE(started_at,NOW()),updated_at=NOW() WHERE id=$1`,[row.run_id,row.requested_agent_id]);
    await recordWorkEvent(client,row.work_item_id,'agent_claimed',{dispatch_id:row.id,executor_id:executorId});
    await recordAgentEvent(client,{runId:row.run_id,agentId:row.requested_agent_id,agentName:row.requested_agent_name,eventType:'work_started',state:'working',summary:row.requested_agent_name+' started work',metadata:{work_item_id:row.work_item_id,dispatch_id:row.id,executor_id:executorId}});
    return row;
  });
}
async function submitResult(id,{executorId,status='review',summary='',resultContent='',artifactUri=null,failureReason=''}){
  const desired=['review','blocked','failed'].includes(status)?status:'review';
  return db.withTransaction(async client=>{
    const current=(await client.query('SELECT * FROM agent_work_dispatches WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!current)throw Object.assign(new Error('Dispatch not found'),{status:404});
    if(current.state!=='working'||current.executor_id!==executorId)throw Object.assign(new Error('Dispatch is not owned by this executor'),{status:409});
    const history=Array.isArray(current.result_history)?current.result_history:[];
    if(current.result_content||current.result_summary)history.push({at:now(),summary:current.result_summary||'',content:current.result_content||'',artifact_uri:current.artifact_uri||null});
    const row=(await client.query(`UPDATE agent_work_dispatches SET state=$2,result_summary=$3,result_content=$4,artifact_uri=COALESCE($5,artifact_uri),failure_reason=$6,result_history=$7::jsonb,lease_expires_at=NULL,updated_at=NOW() WHERE id=$1 RETURNING *`,[
      id,desired,text(summary,4000),text(resultContent,100000),artifactUri?text(artifactUri,4000):null,text(failureReason,4000),JSON.stringify(history)
    ])).rows[0];
    const blocked=desired==='blocked'||desired==='failed';
    await client.query(`UPDATE work_items SET status='waiting',blocked=$2,blocked_reason=$3,updated_at=NOW(),last_touched_at=NOW(),version=version+1 WHERE id=$1`,[row.work_item_id,blocked,blocked?(row.failure_reason||row.result_summary||'Agent work blocked'):'']);
    await client.query(`UPDATE agent_runs SET status=$2,progress=$3,blockers_count=$4,updated_at=NOW() WHERE id=$1`,[row.run_id,desired==='review'?'verification':desired,desired==='review'?90:50,blocked?1:0]);
    if(row.artifact_uri)await client.query(`INSERT INTO agent_artifacts(id,run_id,agent_id,name,artifact_type,uri,evidence_kind,metadata) VALUES($1,$2,$3,$4,'deliverable',$5,$6,$7::jsonb) ON CONFLICT(id) DO NOTHING`,[
      'artifact_'+row.id,row.run_id,row.requested_agent_id,row.deliverable_type+' deliverable',row.artifact_uri,row.deliverable_type,JSON.stringify({work_item_id:row.work_item_id})
    ]);
    await recordWorkEvent(client,row.work_item_id,'agent_result',{dispatch_id:row.id,state:desired,summary:row.result_summary});
    await recordAgentEvent(client,{runId:row.run_id,agentId:row.requested_agent_id,agentName:row.requested_agent_name,eventType:desired==='review'?'draft_ready':'work_'+desired,state:desired==='review'?'waiting':desired,summary:row.result_summary||('Agent work '+desired),artifactRef:row.artifact_uri,human:desired==='review',metadata:{work_item_id:row.work_item_id,dispatch_id:row.id}});
    return{dispatch:row,work:await getWork(row.work_item_id,client)};
  });
}

agentWorkBrowserRouter.post('/jake/delegate',async(req,res)=>{
  try{
    const result=await createJakeDelegation({requestId:text(req.body.request_id,200)||null,request:req.body.request,module:text(req.body.module,80)||'dashboard',executorPreference:text(req.body.executor_preference,40)||'auto',approvalPolicy:text(req.body.approval_policy,40)||'external',toolScopes:Array.isArray(req.body.tool_scopes)?req.body.tool_scopes:null,maxCostUsd:req.body.max_cost_usd,maxToolCalls:req.body.max_tool_calls});
    res.status(result.replayed?200:201).json({...result,reply:'Added to Work and assigned to '+result.dispatch.requested_agent_name+'.'});
  }catch(error){res.status(error.status||500).json({error:error.message||'Could not delegate work'});}
});
agentWorkBrowserRouter.get('/agents/work',async(req,res)=>{
  try{
    const limit=Math.max(1,Math.min(Number(req.query.limit)||50,200));
    const state=text(req.query.state,40);
    const values=[];let where='';
    if(state){values.push(state);where='WHERE d.state=$1';}
    values.push(limit);
    const rows=(await db.query(`SELECT d.*,w.title AS work_title,w.status AS work_status,p.name AS project_name
      FROM agent_work_dispatches d JOIN work_items w ON w.id=d.work_item_id LEFT JOIN projects p ON p.id=w.project_id
      ${where} ORDER BY d.updated_at DESC LIMIT $${values.length}`,values)).rows;
    res.json({dispatches:rows});
  }catch(error){res.status(500).json({error:'Delegated work could not be loaded'});}
});
agentWorkBrowserRouter.get('/work/items/:id/agent',async(req,res)=>{
  const work=await getWork(text(req.params.id,120));if(!work)return res.status(404).json({error:'Work item not found'});
  res.json({work,dispatch:await getDispatchByWork(work.id)});
});
agentWorkBrowserRouter.post('/work/items/:id/delegate',async(req,res)=>{
  try{
    const workId=text(req.params.id,120);
    const result=await createDispatchForWork(workId,{requestText:req.body.request_text||req.body.instruction,agentId:text(req.body.agent_id,120)||null,requestKey:text(req.body.request_id,200)||null,requestedBy:'jakeos-web',deliverable:text(req.body.deliverable_type,80)||null,executorPreference:text(req.body.executor_preference,40)||'auto',approvalPolicy:text(req.body.approval_policy,40)||'external',toolScopes:Array.isArray(req.body.tool_scopes)?req.body.tool_scopes:null,maxCostUsd:req.body.max_cost_usd,maxToolCalls:req.body.max_tool_calls});
    res.status(result.replayed?200:201).json({work:await getWork(workId),...result});
  }catch(error){res.status(error.status||500).json({error:error.message||'Could not delegate work'});}
});
agentWorkBrowserRouter.post('/work/items/:id/agent/revise',async(req,res)=>{
  try{
    const workId=text(req.params.id,120),feedback=text(req.body.feedback,8000);
    if(!feedback)return res.status(422).json({error:'Revision feedback is required'});
    const result=await db.withTransaction(async client=>{
      const current=(await client.query('SELECT * FROM agent_work_dispatches WHERE work_item_id=$1 FOR UPDATE',[workId])).rows[0];
      if(!current)return null;
      if(!['review','blocked','failed'].includes(current.state))throw Object.assign(new Error('Agent work is not ready for revision'),{status:409});
      const feedbackHistory=Array.isArray(current.feedback_history)?current.feedback_history:[];
      feedbackHistory.push({at:now(),feedback});
      const resultHistory=Array.isArray(current.result_history)?current.result_history:[];
      if(current.result_content||current.result_summary)resultHistory.push({at:now(),summary:current.result_summary||'',content:current.result_content||'',artifact_uri:current.artifact_uri||null});
      const row=(await client.query(`UPDATE agent_work_dispatches SET state='queued',executor_id=NULL,lease_expires_at=NULL,claimed_at=NULL,failure_reason=NULL,feedback_history=$2::jsonb,result_history=$3::jsonb,updated_at=NOW() WHERE id=$1 RETURNING *`,[current.id,JSON.stringify(feedbackHistory),JSON.stringify(resultHistory)])).rows[0];
      await client.query(`UPDATE work_items SET status='ready',blocked=FALSE,blocked_reason='',updated_at=NOW(),last_touched_at=NOW(),version=version+1 WHERE id=$1`,[workId]);
      await client.query(`UPDATE agent_runs SET status='queued',progress=0,blockers_count=0,updated_at=NOW() WHERE id=$1`,[current.run_id]);
      await recordWorkEvent(client,workId,'agent_revision_requested',{dispatch_id:current.id,feedback});
      await recordAgentEvent(client,{runId:current.run_id,agentId:current.requested_agent_id,agentName:current.requested_agent_name,eventType:'revision_requested',state:'queued',summary:'Revision requested: '+feedback.slice(0,500),metadata:{work_item_id:workId,dispatch_id:current.id}});
      return{dispatch:row,work:await getWork(workId,client)};
    });
    if(!result)return res.status(404).json({error:'No agent dispatch for this work item'});
    res.json(result);
  }catch(error){res.status(error.status||500).json({error:error.message||'Could not request revision'});}
});
agentWorkBrowserRouter.post('/work/items/:id/agent/accept',async(req,res)=>{
  try{
    const workId=text(req.params.id,120);
    const result=await db.withTransaction(async client=>{
      const current=(await client.query('SELECT * FROM agent_work_dispatches WHERE work_item_id=$1 FOR UPDATE',[workId])).rows[0];
      if(!current)return null;
      if(current.state!=='review')throw Object.assign(new Error('Only reviewed agent work can be accepted'),{status:409});
      const row=(await client.query(`UPDATE agent_work_dispatches SET state='completed',completed_at=NOW(),lease_expires_at=NULL,updated_at=NOW() WHERE id=$1 RETURNING *`,[current.id])).rows[0];
      await client.query(`UPDATE work_items SET status='done',blocked=FALSE,blocked_reason='',completed_at=COALESCE(completed_at,NOW()),updated_at=NOW(),last_touched_at=NOW(),version=version+1 WHERE id=$1`,[workId]);
      await client.query(`UPDATE agent_runs SET status='completed',progress=100,completed_at=NOW(),blockers_count=0,updated_at=NOW() WHERE id=$1`,[current.run_id]);
      await recordWorkEvent(client,workId,'agent_result_accepted',{dispatch_id:current.id});
      await recordAgentEvent(client,{runId:current.run_id,agentId:current.requested_agent_id,agentName:current.requested_agent_name,eventType:'work_completed',state:'completed',summary:'Agent deliverable accepted',artifactRef:current.artifact_uri,metadata:{work_item_id:workId,dispatch_id:current.id}});
      return{dispatch:row,work:await getWork(workId,client)};
    });
    if(!result)return res.status(404).json({error:'No agent dispatch for this work item'});
    res.json(result);
  }catch(error){res.status(error.status||500).json({error:error.message||'Could not accept agent result'});}
});

agentWorkConnectorRouter.get('/work',async(req,res)=>{
  try{
    const state=['queued','working','review','blocked','failed'].includes(text(req.query.state,40))?text(req.query.state,40):'queued';
    const limit=Math.max(1,Math.min(Number(req.query.limit)||50,200));
    const rows=(await db.query(`SELECT d.*,w.title AS work_title,w.description AS work_description,w.priority,w.due_at,w.project_id,p.name AS project_name
      FROM agent_work_dispatches d JOIN work_items w ON w.id=d.work_item_id LEFT JOIN projects p ON p.id=w.project_id
      WHERE d.state=$1 ORDER BY d.created_at ASC LIMIT $2`,[state,limit])).rows;
    res.json({dispatches:rows});
  }catch(error){res.status(500).json({error:'Agent work queue could not be loaded'});}
});
agentWorkConnectorRouter.post('/work/:id/claim',async(req,res)=>{
  try{res.json({dispatch:await claimDispatch(text(req.params.id,120),text(req.body.executor_id,200)||'agent-worker',req.body.lease_seconds)});}
  catch(error){res.status(error.status||500).json({error:error.message||'Could not claim dispatch'});}
});
agentWorkConnectorRouter.post('/work/:id/heartbeat',async(req,res)=>{
  try{
    const id=text(req.params.id,120),executor=text(req.body.executor_id,200),seconds=Math.max(60,Math.min(1800,Number(req.body.lease_seconds)||300));
    const row=(await db.query(`UPDATE agent_work_dispatches SET lease_expires_at=NOW()+($3::text||' seconds')::interval,updated_at=NOW() WHERE id=$1 AND state='working' AND executor_id=$2 RETURNING *`,[id,executor,seconds])).rows[0];
    if(!row)return res.status(409).json({error:'Dispatch is not owned by this executor'});
    res.json({dispatch:row});
  }catch(error){res.status(500).json({error:'Heartbeat failed'});}
});
agentWorkConnectorRouter.post('/work/:id/result',async(req,res)=>{
  try{
    const result=await submitResult(text(req.params.id,120),{executorId:text(req.body.executor_id,200),status:text(req.body.status,40)||'review',summary:req.body.summary,resultContent:req.body.result_content,artifactUri:req.body.artifact_uri,failureReason:req.body.failure_reason});
    res.json(result);
  }catch(error){res.status(error.status||500).json({error:error.message||'Could not submit result'});}
});

let workerTimer=null,workerBusy=false;
const AGENT_PROMPTS={
  'document-knowledge':'You are the Document & Knowledge Agent. Produce a polished, usable draft grounded only in the supplied request and context. Preserve uncertainty rather than inventing facts. Return only the finished deliverable, not commentary about your process.',
  'bid-partnerships':'You are the Bid & Partnerships Agent. Produce a submission-ready draft section or bid artifact from supplied context. Do not invent eligibility, experience, partners, pricing or evidence. Mark unsupported placeholders clearly.',
  'command-orchestrator':'You are the Command Orchestrator. Produce the requested internal work product, clearly separating supported facts from assumptions.'
};
async function executeLocalDispatch(){
  if(workerBusy)return;workerBusy=true;
  try{
    const candidate=(await db.query(`SELECT id FROM agent_work_dispatches WHERE state='queued' AND local_executable=TRUE AND COALESCE(executor_preference,'auto') IN ('auto','local') ORDER BY created_at ASC LIMIT 1`)).rows[0];
    if(!candidate)return;
    let dispatch;
    try{dispatch=await claimDispatch(candidate.id,'jakeos-local-worker',300);}catch{return;}
    const work=await getWork(dispatch.work_item_id);
    const feedback=Array.isArray(dispatch.feedback_history)?dispatch.feedback_history:[];
    const prompt=AGENT_PROMPTS[dispatch.requested_agent_id]||AGENT_PROMPTS['command-orchestrator'];
    const context=[
      'WORK TITLE: '+(work?.title||''),
      'WORK REQUEST: '+dispatch.request_text,
      work?.description?'WORK CONTEXT: '+work.description:'',
      feedback.length?'REVISION FEEDBACK:\n'+feedback.map((x,i)=>(i+1)+'. '+x.feedback).join('\n'):'',
      'DELIVERABLE TYPE: '+dispatch.deliverable_type
    ].filter(Boolean).join('\n\n');
    try{
      const result=await localAi.ollamaChat({messages:[{role:'user',content:context}],systemPrompt:prompt,temperature:0.2,maxTokens:1800,timeoutMs:90000});
      const summary='Draft produced by '+dispatch.requested_agent_name+' and ready for review.';
      await submitResult(dispatch.id,{executorId:'jakeos-local-worker',status:'review',summary,resultContent:result.text,artifactUri:'jakeos://work/'+dispatch.work_item_id+'/deliverable'});
    }catch(error){
      await submitResult(dispatch.id,{executorId:'jakeos-local-worker',status:'failed',summary:'Local agent execution failed.',failureReason:text(error.message,4000)});
    }
  }finally{workerBusy=false;}
}
function startAgentWorkWorker(){
  const enabled=!['false','0','off','no'].includes(String(process.env.JAKEOS_AGENT_LOCAL_WORKER_ENABLED||'false').toLowerCase());
  if(!enabled||workerTimer)return;
  const interval=Math.max(5000,Math.min(60000,Number(process.env.JAKEOS_AGENT_LOCAL_WORKER_INTERVAL_MS)||10000));
  setTimeout(()=>executeLocalDispatch().catch(e=>console.error('[AgentWorker]',e.message)),1500);
  workerTimer=setInterval(()=>executeLocalDispatch().catch(e=>console.error('[AgentWorker]',e.message)),interval);
  workerTimer.unref?.();
  console.log('[AgentWorker] local fallback enabled');
}

module.exports={agentWorkBrowserRouter,agentWorkConnectorRouter,startAgentWorkWorker,decorateWorkRows,getDispatchByWork,getDispatch,getWork,claimDispatch,submitResult,recordAgentEvent,recordWorkEvent,routeAgent,deliverableType,cleanRequest,createJakeDelegation,createDispatchForWork,AGENTS};
