'use strict';

const crypto=require('crypto');
const db=require('./db');
const gcal=require('./gcal');
const crm=require('./crm');
const workspace=require('./google-workspace');
const github=require('./github-executor');
const ops=require('./ops-executor');
const {TOOL_CATALOG,toolAllowed}=require('./errand-policy');

const clean=(v,max=4000)=>String(v??'').trim().slice(0,max);
const id=p=>p+'_'+Date.now()+'_'+crypto.randomBytes(4).toString('hex');
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};

function schemas(){
  return{
    jakeos_search:{description:'Search canonical JakeOS work, projects, relationships, opportunities and research briefs.',parameters:{type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false}},
    jakeos_get_context:{description:'Read the governed context packet attached to this errand.',parameters:{type:'object',properties:{},additionalProperties:false}},
    jakeos_list_work:{description:'List current canonical JakeOS work, optionally filtered by status or project.',parameters:{type:'object',properties:{status:{type:'string'},project_id:{type:'string'},limit:{type:'integer'}},additionalProperties:false}},
    jakeos_create_work:{description:'Create a non-delegated child Work item in JakeOS. This never recursively launches another errand.',parameters:{type:'object',properties:{title:{type:'string'},description:{type:'string'},priority:{type:'string'},due_at:{type:['string','null']},project_id:{type:['string','null']},completion_definition:{type:'string'}},required:['title'],additionalProperties:false}},
    jakeos_update_work:{description:'Update safe fields on an existing JakeOS Work item.',parameters:{type:'object',properties:{id:{type:'string'},status:{type:'string'},priority:{type:'string'},due_at:{type:['string','null']},blocked:{type:'boolean'},blocked_reason:{type:'string'},description:{type:'string'}},required:['id'],additionalProperties:false}},
    jakeos_list_opportunities:{description:'List canonical opportunities with fit, stage, deadline and next action.',parameters:{type:'object',properties:{stage:{type:'string'},query:{type:'string'},limit:{type:'integer'}},additionalProperties:false}},
    jakeos_update_opportunity:{description:'Update a canonical opportunity stage, fit notes or next action.',parameters:{type:'object',properties:{id:{type:'string'},stage:{type:'string'},next_action:{type:'string'},notes:{type:'string'},fit_summary:{type:'string'},decision_rationale:{type:'string'}},required:['id'],additionalProperties:false}},
    jakeos_list_relationships:{description:'Search or list JakeOS CRM relationships.',parameters:{type:'object',properties:{query:{type:'string'},limit:{type:'integer'}},additionalProperties:false}},
    jakeos_create_followup:{description:'Create an internal CRM follow-up reminder.',parameters:{type:'object',properties:{client_id:{type:'string'},message:{type:'string'},due_date:{type:'string'}},required:['client_id','message','due_date'],additionalProperties:false}},
    google_calendar_list:{description:'Read upcoming Google Calendar events after the user connects Google.',parameters:{type:'object',properties:{days:{type:'integer'}},additionalProperties:false}},
    google_calendar_create:{description:'Create an external Google Calendar event. Requires explicit human approval before execution.',parameters:{type:'object',properties:{title:{type:'string'},description:{type:'string'},start:{type:'string'},end:{type:'string'}},required:['title','start','end'],additionalProperties:false}},
    google_drive_search:{description:'Search connected Google Drive file metadata by name.',parameters:{type:'object',properties:{query:{type:'string'},limit:{type:'integer'}},required:['query'],additionalProperties:false}},
    google_drive_read:{description:'Read supported text/Google Docs/Sheets content from connected Google Drive.',parameters:{type:'object',properties:{file_id:{type:'string'}},required:['file_id'],additionalProperties:false}},
    gmail_search:{description:'Search connected Gmail messages using Gmail search syntax.',parameters:{type:'object',properties:{query:{type:'string'},limit:{type:'integer'}},required:['query'],additionalProperties:false}},
    gmail_read_thread:{description:'Read message metadata/snippets for a connected Gmail thread.',parameters:{type:'object',properties:{thread_id:{type:'string'}},required:['thread_id'],additionalProperties:false}},
    gmail_create_draft:{description:'Create an email draft in connected Gmail without sending it.',parameters:{type:'object',properties:{to:{type:'string'},subject:{type:'string'},body:{type:'string'},thread_id:{type:['string','null']}},required:['to','subject','body'],additionalProperties:false}},
    gmail_send:{description:'Send an email through connected Gmail. Requires explicit human approval before execution.',parameters:{type:'object',properties:{to:{type:'string'},subject:{type:'string'},body:{type:'string'},thread_id:{type:['string','null']}},required:['to','subject','body'],additionalProperties:false}},
    github_get_file:{description:'Read a text file from a configured GitHub repository.',parameters:{type:'object',properties:{repo:{type:'string'},path:{type:'string'},ref:{type:'string'}},required:['repo','path'],additionalProperties:false}},
    github_search_code:{description:'Search code within a configured GitHub repository.',parameters:{type:'object',properties:{repo:{type:'string'},query:{type:'string'},limit:{type:'integer'}},required:['repo','query'],additionalProperties:false}},
    github_create_branch:{description:'Create a GitHub branch. Requires explicit human approval before execution.',parameters:{type:'object',properties:{repo:{type:'string'},branch:{type:'string'},base:{type:'string'}},required:['repo','branch'],additionalProperties:false}},
    github_upsert_file:{description:'Create or update a GitHub file on a branch. Requires explicit human approval before execution.',parameters:{type:'object',properties:{repo:{type:'string'},path:{type:'string'},branch:{type:'string'},message:{type:'string'},content:{type:'string'},sha:{type:['string','null']}},required:['repo','path','branch','message','content'],additionalProperties:false}},
    github_create_pr:{description:'Open a GitHub pull request. Requires explicit human approval before execution.',parameters:{type:'object',properties:{repo:{type:'string'},title:{type:'string'},head:{type:'string'},base:{type:'string'},body:{type:'string'}},required:['repo','title','head'],additionalProperties:false}},
    github_merge_pr:{description:'Merge a GitHub pull request. Executive-only action requiring explicit human approval.',parameters:{type:'object',properties:{repo:{type:'string'},number:{type:'integer'},method:{type:'string'}},required:['repo','number'],additionalProperties:false}},
    ops_request_action:{description:'Request an approved infrastructure action through the separately configured Ops executor. Executive-only.',parameters:{type:'object',properties:{action:{type:'string'},params:{type:'object'}},required:['action'],additionalProperties:false}}
  };
}

function availability(){
  return{
    jakeos_search:true,jakeos_get_context:true,jakeos_list_work:true,jakeos_create_work:true,jakeos_update_work:true,
    jakeos_list_opportunities:true,jakeos_update_opportunity:true,jakeos_list_relationships:true,jakeos_create_followup:true,
    google_calendar_list:gcal.isConnected(),google_calendar_create:gcal.isConnected(),
    google_drive_search:workspace.status().connected,google_drive_read:workspace.status().connected,
    gmail_search:workspace.status().connected,gmail_read_thread:workspace.status().connected,gmail_create_draft:workspace.status().connected,gmail_send:workspace.status().connected,
    github_get_file:github.configured(),github_search_code:github.configured(),github_create_branch:github.configured(),github_upsert_file:github.configured(),github_create_pr:github.configured(),github_merge_pr:github.configured(),
    ops_request_action:ops.config().configured
  };
}

function toolDefinitions(scopes){
  const defs=schemas(),available=availability();
  return Object.entries(defs).filter(([name])=>available[name]&&toolAllowed(name,scopes)&&TOOL_CATALOG[name]).map(([name,d])=>({type:'function',name,description:d.description,parameters:d.parameters,strict:true}));
}

async function execute(name,args,{dispatch,contextSnapshot}={}){
  const input=object(args);
  if(name==='jakeos_get_context')return contextSnapshot||dispatch?.context_snapshot||{};
  if(name==='jakeos_search'){
    const q=clean(input.query,180),like='%'+q+'%';
    if(q.length<2)return{results:[]};
    const [work,projects,clients,opportunities,briefs]=await Promise.all([
      db.query(`SELECT id,title AS name,description AS subtitle,'work' AS type,status,project_id AS context FROM work_items WHERE title ILIKE $1 OR description ILIKE $1 ORDER BY updated_at DESC LIMIT 12`,[like]),
      db.query(`SELECT id,name,description AS subtitle,'project' AS type,status,NULL::text AS context FROM projects WHERE name ILIKE $1 OR description ILIKE $1 ORDER BY updated_at DESC LIMIT 8`,[like]),
      db.query(`SELECT id,name,org AS subtitle,'relationship' AS type,status,org AS context FROM clients WHERE name ILIKE $1 OR org ILIKE $1 OR notes ILIKE $1 ORDER BY updated_at DESC LIMIT 8`,[like]),
      db.query(`SELECT id,title AS name,org AS subtitle,'opportunity' AS type,stage AS status,org AS context FROM opportunities WHERE title ILIKE $1 OR org ILIKE $1 OR description ILIKE $1 OR notes ILIKE $1 ORDER BY fit_score DESC,relevance_score DESC LIMIT 12`,[like]),
      db.query(`SELECT id,title,summary AS subtitle,'research' AS type,'brief' AS status,brief_date::text AS context FROM research_briefs WHERE title ILIKE $1 OR summary ILIKE $1 ORDER BY brief_date DESC LIMIT 5`,[like])
    ]);
    return{results:[...work.rows,...projects.rows,...clients.rows,...opportunities.rows,...briefs.rows]};
  }
  if(name==='jakeos_list_work'){
    const values=[],where=[];
    if(input.status){values.push(clean(input.status,40));where.push('wi.status=$'+values.length);}
    if(input.project_id){values.push(clean(input.project_id,120));where.push('wi.project_id=$'+values.length);}
    values.push(Math.max(1,Math.min(Number(input.limit)||30,100)));
    const rows=(await db.query(`SELECT wi.id,wi.title,wi.description,wi.status,wi.priority,wi.due_at,wi.blocked,wi.blocked_reason,wi.metadata,p.name AS project_name FROM work_items wi LEFT JOIN projects p ON p.id=wi.project_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY wi.updated_at DESC LIMIT $${values.length}`,values)).rows;
    return{items:rows};
  }
  if(name==='jakeos_create_work'){
    const title=clean(input.title,500);if(!title)throw new Error('title is required');
    const workId=id('work');
    const metadata={parent_dispatch_id:dispatch?.id||null,spawned_by:'errand',completion_definition:clean(input.completion_definition,2000)};
    const row=await db.insert('work_items',{id:workId,title,description:clean(input.description,8000),status:'inbox',priority:['low','medium','high','critical'].includes(input.priority)?input.priority:'medium',impact:3,strategic_weight:3,estimated_minutes:30,due_at:input.due_at||null,project_id:input.project_id||null,source:'errand',source_ref:dispatch?.id||null,tags:['agent-spawned'],metadata,last_touched_at:new Date().toISOString()},false);
    return{item:row};
  }
  if(name==='jakeos_update_work'){
    const existing=await db.get('work_items',{eq:{id:clean(input.id,120)}});if(!existing)throw new Error('Work item not found');
    const data={updated_at:new Date().toISOString(),last_touched_at:new Date().toISOString(),version:Number(existing.version||0)+1};
    if(input.status!==undefined&&['inbox','ready','doing','waiting','done','cancelled'].includes(input.status))data.status=input.status;
    if(input.priority!==undefined&&['low','medium','high','critical'].includes(input.priority))data.priority=input.priority;
    if(input.due_at!==undefined)data.due_at=input.due_at||null;
    if(input.blocked!==undefined)data.blocked=!!input.blocked;
    if(input.blocked_reason!==undefined)data.blocked_reason=clean(input.blocked_reason,2000);
    if(input.description!==undefined)data.description=clean(input.description,8000);
    await db.update('work_items',existing.id,data);return{item:await db.get('work_items',{eq:{id:existing.id}})};
  }
  if(name==='jakeos_list_opportunities'){
    const values=[],where=["stage NOT IN('Won','Lost','Closed')"];
    if(input.stage){values.push(clean(input.stage,40));where.push('stage=$'+values.length);}
    if(input.query){values.push('%'+clean(input.query,160)+'%');where.push('(title ILIKE $'+values.length+' OR org ILIKE $'+values.length+' OR notes ILIKE $'+values.length+')');}
    values.push(Math.max(1,Math.min(Number(input.limit)||30,100)));
    return{opportunities:(await db.query(`SELECT id,title,org,stage,fit_score,relevance_score,deadline,value_amount,currency,next_action,fit_status,eligibility_status,hard_blockers,strongest_matches,gaps FROM opportunities WHERE ${where.join(' AND ')} ORDER BY deadline NULLS LAST,fit_score DESC LIMIT $${values.length}`,values)).rows};
  }
  if(name==='jakeos_update_opportunity'){
    const idv=clean(input.id,120),existing=await db.get('opportunities',{eq:{id:idv}});if(!existing)throw new Error('Opportunity not found');
    const data={updated_at:new Date().toISOString()};
    for(const [k,max] of [['next_action',4000],['notes',10000],['fit_summary',8000],['decision_rationale',8000]])if(input[k]!==undefined)data[k]=clean(input[k],max);
    if(input.stage!==undefined)data.stage=clean(input.stage,40);
    await db.update('opportunities',idv,data);return{opportunity:await db.get('opportunities',{eq:{id:idv}})};
  }
  if(name==='jakeos_list_relationships'){
    const q=clean(input.query,160),limit=Math.max(1,Math.min(Number(input.limit)||30,100));
    if(!q)return{relationships:await db.all('clients',{order:{col:'updated_at',asc:false},limit})};
    const like='%'+q+'%';return{relationships:(await db.query('SELECT * FROM clients WHERE name ILIKE $1 OR org ILIKE $1 OR email ILIKE $1 OR notes ILIKE $1 ORDER BY updated_at DESC LIMIT $2',[like,limit])).rows};
  }
  if(name==='jakeos_create_followup'){
    await crm.scheduleFollowup(clean(input.client_id,120),{message:clean(input.message,2000),due_date:clean(input.due_date,40),channel:'internal'});
    return{ok:true,client_id:clean(input.client_id,120),due_date:clean(input.due_date,40)};
  }
  if(name==='google_calendar_list')return{events:await gcal.getAllEvents({days:Math.max(1,Math.min(Number(input.days)||30,90))})};
  if(name==='google_calendar_create')return{event:await gcal.createEvent({title:clean(input.title,500),description:clean(input.description,4000),start:input.start,end:input.end})};
  if(name==='google_drive_search')return{files:await workspace.driveSearch(input.query,{limit:input.limit})};
  if(name==='google_drive_read')return{file:await workspace.driveRead(input.file_id)};
  if(name==='gmail_search')return{messages:await workspace.gmailSearch(input.query,{limit:input.limit})};
  if(name==='gmail_read_thread')return{thread:await workspace.gmailReadThread(input.thread_id)};
  if(name==='gmail_create_draft')return{draft:await workspace.gmailCreateDraft({to:input.to,subject:input.subject,body:input.body,thread_id:input.thread_id})};
  if(name==='gmail_send')return{message:await workspace.gmailSend({to:input.to,subject:input.subject,body:input.body,thread_id:input.thread_id})};
  if(name==='github_get_file')return{file:await github.getFile(input)};
  if(name==='github_search_code')return{results:await github.searchCode(input)};
  if(name==='github_create_branch')return{branch:await github.createBranch(input)};
  if(name==='github_upsert_file')return await github.upsertFile(input);
  if(name==='github_create_pr')return{pull_request:await github.createPr(input)};
  if(name==='github_merge_pr')return{merge:await github.mergePr(input)};
  if(name==='ops_request_action')return{operation:await ops.requestAction(input.action,input.params||{})};
  throw new Error('Unknown or unavailable errand tool');
}

function capabilitySnapshot(scopes=[]){
  const available=availability(),defs=schemas();
  return Object.keys(defs).map(name=>({name,scope:TOOL_CATALOG[name]?.scope||null,action_class:TOOL_CATALOG[name]?.actionClass||null,granted:toolAllowed(name,scopes),available:!!available[name]}));
}
module.exports={toolDefinitions,execute,availability,capabilitySnapshot};
