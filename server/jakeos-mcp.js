'use strict';

const crypto=require('crypto');
const express=require('express');
const db=require('./db');
const {commandCenterOverview}=require('./overview');
const {createJakeDelegation}=require('./agent-work');
const openaiErrands=require('./openai-errand-runner');

const router=express.Router();
const text=(v,max=10000)=>String(v??'').trim().slice(0,max);
const token=()=>String(process.env.JAKEOS_MCP_TOKEN||'').trim();
const secureEqual=(a,b)=>{const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&x.length>0&&crypto.timingSafeEqual(x,y);};
function bearer(req){return text(req.get('authorization'),1200).match(/^Bearer\s+(.+)$/i)?.[1]||'';}
function auth(req,res,next){
  const expected=token();
  if(!expected)return res.status(503).json({error:'JakeOS MCP is not configured',code:'MCP_NOT_CONFIGURED'});
  if(!secureEqual(bearer(req),expected))return res.status(401).json({error:'Invalid JakeOS MCP credential',code:'AUTH_REQUIRED'});
  req.mcpPrincipal={id:'chatgpt-jakeos',scopes:['jakeos:read','work:read','work:write','errands:read','errands:write','opportunities:read']};
  next();
}
router.use(auth);

const tools=[
  {name:'jakeos_executive_snapshot',description:'Read the current JakeOS executive operating snapshot: Work pressure, market pipeline, receivables, finance, attention signals and estate totals.',inputSchema:{type:'object',properties:{}}},
  {name:'jakeos_work_list',description:'List canonical JakeOS Work items.',inputSchema:{type:'object',properties:{status:{type:'string'},limit:{type:'integer',minimum:1,maximum:100}}}},
  {name:'jakeos_work_create',description:'Create a canonical JakeOS Work item. This does not execute it unless the caller explicitly uses jakeos_errand_create.',inputSchema:{type:'object',required:['title'],properties:{title:{type:'string'},description:{type:'string'},priority:{type:'string'},due_at:{type:['string','null']},completion_definition:{type:'string'},outcome_type:{type:'string'},market_stage:{type:'string'}}}},
  {name:'jakeos_opportunities_list',description:'List current canonical JakeOS opportunities and next actions.',inputSchema:{type:'object',properties:{limit:{type:'integer',minimum:1,maximum:100}}}},
  {name:'jakeos_errands_status',description:'Read the governed errand executor status and queue counts.',inputSchema:{type:'object',properties:{}}},
  {name:'jakeos_errand_create',description:'Create canonical Work and dispatch it as a governed JakeOS errand. External actions remain approval-gated inside JakeOS.',inputSchema:{type:'object',required:['request'],properties:{request:{type:'string'},executor_preference:{type:'string',enum:['auto','openai','local','external']},max_cost_usd:{type:'number',minimum:.05,maximum:100},max_tool_calls:{type:'integer',minimum:1,maximum:100}}}},
  {name:'jakeos_errand_get',description:'Read one errand status, result summary, approvals, tool audit and artifact metadata.',inputSchema:{type:'object',required:['id'],properties:{id:{type:'string'}}}}
];

const result=value=>({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value});

async function call(name,args={}){
  if(name==='jakeos_executive_snapshot')return await commandCenterOverview();
  if(name==='jakeos_work_list'){
    const values=[],where=[];
    if(args.status){values.push(text(args.status,40));where.push('wi.status=$'+values.length);}
    values.push(Math.max(1,Math.min(Number(args.limit)||40,100)));
    return{items:(await db.query(`SELECT wi.id,wi.title,wi.description,wi.status,wi.priority,wi.due_at,wi.blocked,wi.blocked_reason,wi.metadata,p.name AS project_name
      FROM work_items wi LEFT JOIN projects p ON p.id=wi.project_id ${where.length?'WHERE '+where.join(' AND '):''}
      ORDER BY wi.updated_at DESC LIMIT $${values.length}`,values)).rows};
  }
  if(name==='jakeos_work_create'){
    const title=text(args.title,500);if(!title)throw Object.assign(new Error('title is required'),{status:422});
    const id='work_'+Date.now()+'_'+crypto.randomBytes(4).toString('hex');
    const metadata={completion_definition:text(args.completion_definition,2000),outcome_type:text(args.outcome_type,40)||'delivery',market_stage:text(args.market_stage,40)||'none',created_via:'mcp'};
    const item=await db.insert('work_items',{id,title,description:text(args.description,8000),status:'inbox',priority:['low','medium','high','critical'].includes(args.priority)?args.priority:'medium',impact:3,strategic_weight:3,estimated_minutes:30,due_at:args.due_at||null,source:'chatgpt-mcp',tags:['chatgpt'],metadata,last_touched_at:new Date().toISOString()},false);
    return{item};
  }
  if(name==='jakeos_opportunities_list'){
    const limit=Math.max(1,Math.min(Number(args.limit)||40,100));
    return{opportunities:(await db.query(`SELECT id,title,org,stage,fit_score,relevance_score,deadline,value_amount,currency,next_action,fit_status,eligibility_status,hard_blockers,strongest_matches,gaps,updated_at
      FROM opportunities WHERE stage NOT IN('Won','Lost','Closed') ORDER BY deadline NULLS LAST,fit_score DESC LIMIT $1`,[limit])).rows};
  }
  if(name==='jakeos_errands_status'){
    const counts=(await db.query('SELECT state,COUNT(*)::int AS count FROM agent_work_dispatches GROUP BY state')).rows;
    return{openai:openaiErrands.status(),queue:Object.fromEntries(counts.map(x=>[x.state,Number(x.count||0)]))};
  }
  if(name==='jakeos_errand_create'){
    const request=text(args.request,12000);if(!request)throw Object.assign(new Error('request is required'),{status:422});
    const created=await createJakeDelegation({
      requestId:'mcp_'+Date.now()+'_'+crypto.randomBytes(4).toString('hex'),
      request,module:'mcp',
      executorPreference:['auto','openai','local','external'].includes(args.executor_preference)?args.executor_preference:'auto',
      approvalPolicy:'external',maxCostUsd:args.max_cost_usd,maxToolCalls:args.max_tool_calls
    });
    return{work:created.work,dispatch:{id:created.dispatch.id,run_id:created.dispatch.run_id,state:created.dispatch.state,requested_agent_name:created.dispatch.requested_agent_name,executor_preference:created.dispatch.executor_preference,approval_policy:created.dispatch.approval_policy}};
  }
  if(name==='jakeos_errand_get'){
    const dispatch=await db.get('agent_work_dispatches',{eq:{id:text(args.id,120)}});
    if(!dispatch)throw Object.assign(new Error('Errand not found'),{status:404});
    const[audit,artifacts,decisions]=await Promise.all([
      db.all('agent_tool_audit',{eq:{dispatch_id:dispatch.id},order:{col:'started_at',asc:false},limit:100}),
      db.all('agent_artifact_versions',{eq:{dispatch_id:dispatch.id},order:{col:'created_at',asc:false},limit:100}),
      db.all('agent_decisions',{eq:{run_id:dispatch.run_id},order:{col:'created_at',asc:false},limit:50})
    ]);
    return{dispatch:{id:dispatch.id,work_item_id:dispatch.work_item_id,run_id:dispatch.run_id,state:dispatch.state,requested_agent_name:dispatch.requested_agent_name,executor_preference:dispatch.executor_preference,result_summary:dispatch.result_summary,failure_reason:dispatch.failure_reason,model:dispatch.model,spent_usd:dispatch.spent_usd,max_cost_usd:dispatch.max_cost_usd,tool_calls_used:dispatch.tool_calls_used,max_tool_calls:dispatch.max_tool_calls,updated_at:dispatch.updated_at},audit:audit.map(x=>({tool_name:x.tool_name,tool_scope:x.tool_scope,action_class:x.action_class,status:x.status,result_summary:x.result_summary,started_at:x.started_at,completed_at:x.completed_at})),artifacts:artifacts.map(x=>({id:x.id,name:x.name,artifact_type:x.artifact_type,media_type:x.media_type,sha256:x.sha256,version:x.version,created_at:x.created_at})),decisions:decisions.map(x=>({id:x.id,title:x.title,status:x.status,priority:x.priority,recommendation:x.recommendation,due_at:x.due_at,resolution:x.resolution,metadata:x.metadata}))};
  }
  throw Object.assign(new Error('Unknown MCP tool'),{status:404});
}

router.post('/',async(req,res)=>{
  const body=req.body||{},id=body.id??null;
  try{
    if(body.method==='initialize')return res.json({jsonrpc:'2.0',id,result:{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'JakeOS',version:'1.0.0'}}});
    if(body.method==='notifications/initialized')return res.status(202).end();
    if(body.method==='ping')return res.json({jsonrpc:'2.0',id,result:{}});
    if(body.method==='tools/list')return res.json({jsonrpc:'2.0',id,result:{tools}});
    if(body.method==='tools/call')return res.json({jsonrpc:'2.0',id,result:result(await call(body.params?.name,body.params?.arguments||{}))});
    return res.status(400).json({jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}});
  }catch(error){
    return res.status(error.status||500).json({jsonrpc:'2.0',id,result:{content:[{type:'text',text:error.message||'Tool failed'}],isError:true}});
  }
});

router.get('/health',(_req,res)=>res.json({status:'ok',service:'JakeOS MCP',configured:!!token(),tools:tools.length}));

module.exports={jakeosMcpRouter:router};
