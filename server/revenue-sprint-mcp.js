'use strict';
const express=require('express');
const crypto=require('crypto');
const db=require('./db');
const {summarizeAccounts,stageToOpportunityStage,latestSprint,loadAccounts,loadActions,dateOnly,boundedPct}=require('./revenue-sprint');

const router=express.Router();
const STAGES=new Set(['Target','Contacted','Conversation','Proposal','Negotiation','Contracted','Invoiced','Paid','Lost','Parked']);
const PRIORITIES=new Set(['low','medium','high','critical']);
const text=(value,max=4000)=>String(value??'').trim().slice(0,max);
const num=value=>Number.isFinite(Number(value))?Number(value):0;
const bool=value=>value===true||value===1||value==='1'||String(value).toLowerCase()==='true';
const makeId=prefix=>prefix+'_'+crypto.randomUUID();
function localDateInKampala(date=new Date()){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Africa/Kampala',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date),map={};
  for(const part of parts)if(part.type!=='literal')map[part.type]=part.value;
  return map.year+'-'+map.month+'-'+map.day;
}

const tools=[
  {
    name:'revenue_sprint_get',
    description:'Read the active JakeOS 30-day revenue mission, including targets, live metrics, due actions and close-next accounts.',
    inputSchema:{type:'object',properties:{sprint_id:{type:'string'}}}
  },
  {
    name:'revenue_account_update',
    description:'Update an existing revenue account and its linked canonical opportunity. Internal state only; this does not send messages, submit bids, sign contracts or move money.',
    inputSchema:{
      type:'object',required:['account_id'],
      properties:{
        account_id:{type:'string'},stage:{type:'string',enum:[...STAGES]},probability:{type:'number',minimum:0,maximum:100},
        pipeline_value_usd:{type:'number',minimum:0},cash_30d_target_usd:{type:'number',minimum:0},
        contracted_usd:{type:'number',minimum:0},cash_collected_usd:{type:'number',minimum:0},
        proposal_sent:{type:'boolean'},next_action:{type:'string'},next_action_date:{type:['string','null']},
        mobilization_pct:{type:'number',minimum:0,maximum:100},risk:{type:'string'},notes:{type:'string'},
        contact_name:{type:'string'},contact_email:{type:'string'},contact_channel:{type:'string'}
      }
    }
  },
  {
    name:'revenue_action_create',
    description:'Create an internal commercial action in the active revenue mission. The action is projected into canonical JakeOS Work and can surface in Momentum Today.',
    inputSchema:{
      type:'object',required:['title'],
      properties:{
        account_id:{type:['string','null']},title:{type:'string'},action_date:{type:'string'},
        action_type:{type:'string'},channel:{type:'string'},priority:{type:'string',enum:[...PRIORITIES]}
      }
    }
  },
  {
    name:'revenue_action_complete',
    description:'Mark a revenue action complete and record its result. Completion synchronizes to canonical JakeOS Work.',
    inputSchema:{type:'object',required:['action_id'],properties:{action_id:{type:'string'},result:{type:'string'}}}
  }
];

const result=value=>({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value});

async function sprintSnapshot(sprintId){
  const sprint=await latestSprint(sprintId);
  if(!sprint)throw Object.assign(new Error('No active revenue sprint'),{status:404});
  const [accounts,actions]=await Promise.all([loadAccounts(sprint.id),loadActions(sprint.id)]);
  const today=localDateInKampala();
  const summary=summarizeAccounts(accounts,sprint,today);
  const dueActions=actions.filter(action=>action.status!=='done'&&action.action_date&&action.action_date<=today);
  const closeNext=accounts
    .filter(account=>!['Paid','Lost','Parked'].includes(account.stage))
    .map(account=>({...account,close_score:num(account.cash_30d_target_usd)*(boundedPct(account.probability,0)/100)}))
    .sort((a,b)=>b.close_score-a.close_score||num(b.pipeline_value_usd)-num(a.pipeline_value_usd))
    .slice(0,10);
  return{
    sprint:{...sprint,starts_on:dateOnly(sprint.starts_on),ends_on:dateOnly(sprint.ends_on)},
    summary,
    today,
    due_actions:dueActions,
    close_next:closeNext,
    accounts,
    actions
  };
}

async function updateAccount(args){
  const account=await db.get('revenue_sprint_accounts',{eq:{id:text(args.account_id,120)}});
  if(!account)throw Object.assign(new Error('Revenue account not found'),{status:404});
  const data={updated_at:new Date().toISOString()};
  if(args.stage!==undefined){
    if(!STAGES.has(args.stage))throw Object.assign(new Error('Invalid revenue stage'),{status:422});
    data.stage=args.stage;
    if(['Proposal','Negotiation','Contracted','Invoiced','Paid'].includes(args.stage))data.proposal_sent=true;
  }
  for(const field of ['pipeline_value_usd','cash_30d_target_usd','contracted_usd','cash_collected_usd']){
    if(args[field]!==undefined)data[field]=Math.max(0,num(args[field]));
  }
  if(args.probability!==undefined)data.probability=boundedPct(args.probability,0);
  if(args.mobilization_pct!==undefined)data.mobilization_pct=boundedPct(args.mobilization_pct,0);
  if(args.proposal_sent!==undefined)data.proposal_sent=bool(args.proposal_sent);
  if(args.next_action!==undefined)data.next_action=text(args.next_action,4000);
  if(args.next_action_date!==undefined)data.next_action_date=dateOnly(args.next_action_date);
  if(args.risk!==undefined)data.risk=text(args.risk,2000);
  if(args.notes!==undefined)data.notes=text(args.notes,10000);
  if(args.contact_name!==undefined)data.contact_name=text(args.contact_name,300);
  if(args.contact_email!==undefined)data.contact_email=text(args.contact_email,300);
  if(args.contact_channel!==undefined)data.contact_channel=text(args.contact_channel,80);

  const accountFields=Object.keys(data);
  await db.withTransaction(async client=>{
    const values=accountFields.map(field=>data[field]);
    values.push(account.id);
    await client.query(
      'UPDATE revenue_sprint_accounts SET '+accountFields.map((field,index)=>'"'+field+'"=$'+(index+1)).join(',')+' WHERE id=$'+values.length,
      values
    );
    if(account.opportunity_id){
      const opportunityData={updated_at:new Date().toISOString()};
      if(data.stage!==undefined)opportunityData.stage=stageToOpportunityStage(data.stage);
      if(data.next_action!==undefined)opportunityData.next_action=data.next_action;
      if(data.pipeline_value_usd!==undefined)opportunityData.value_amount=data.pipeline_value_usd;
      if(data.contact_name!==undefined)opportunityData.contact=data.contact_name;
      if(data.notes!==undefined)opportunityData.notes=data.notes;
      const fields=Object.keys(opportunityData),opportunityValues=fields.map(field=>opportunityData[field]);
      opportunityValues.push(account.opportunity_id);
      await client.query(
        'UPDATE opportunities SET '+fields.map((field,index)=>'"'+field+'"=$'+(index+1)).join(',')+' WHERE id=$'+opportunityValues.length,
        opportunityValues
      );
    }
  });
  return{account:await db.get('revenue_sprint_accounts',{eq:{id:account.id}})};
}

async function createAction(args){
  const sprint=await latestSprint();
  if(!sprint)throw Object.assign(new Error('No active revenue sprint'),{status:404});
  const title=text(args.title,1000);
  if(!title)throw Object.assign(new Error('Action title is required'),{status:422});
  let accountId=text(args.account_id,120)||null;
  if(accountId){
    const account=await db.get('revenue_sprint_accounts',{eq:{id:accountId}});
    if(!account||account.sprint_id!==sprint.id)throw Object.assign(new Error('Revenue account is not part of the active sprint'),{status:422});
  }
  const priority=text(args.priority,40)||'high';
  if(!PRIORITIES.has(priority))throw Object.assign(new Error('Invalid action priority'),{status:422});
  const action=await db.insert('revenue_sprint_actions',{
    id:makeId('rsa_action'),sprint_id:sprint.id,account_id:accountId,
    action_date:dateOnly(args.action_date)||localDateInKampala(),
    title,action_type:text(args.action_type,80)||'follow-up',channel:text(args.channel,80)||'JakeOS',priority,status:'todo',result:''
  },false);
  if(!action)throw new Error('Revenue action could not be created');
  return{action};
}

async function completeAction(args){
  const id=text(args.action_id,120);
  const resultText=text(args.result,4000);
  const updated=(await db.query(
    `UPDATE revenue_sprint_actions SET status='done',result=$2,updated_at=NOW() WHERE id=$1 RETURNING *`,
    [id,resultText]
  )).rows[0];
  if(!updated)throw Object.assign(new Error('Revenue action not found'),{status:404});
  return{action:updated};
}

async function call(name,args={}){
  if(name==='revenue_sprint_get')return sprintSnapshot(args.sprint_id);
  if(name==='revenue_account_update')return updateAccount(args);
  if(name==='revenue_action_create')return createAction(args);
  if(name==='revenue_action_complete')return completeAction(args);
  throw Object.assign(new Error('Unknown tool'),{status:404});
}

router.post('/',async(req,res)=>{
  const body=req.body||{},id=body.id??null;
  try{
    if(body.method==='initialize')return res.json({jsonrpc:'2.0',id,result:{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'JakeOS Revenue Mission',version:'1.0.0'}}});
    if(body.method==='notifications/initialized')return res.status(202).end();
    if(body.method==='ping')return res.json({jsonrpc:'2.0',id,result:{}});
    if(body.method==='tools/list')return res.json({jsonrpc:'2.0',id,result:{tools}});
    if(body.method==='tools/call')return res.json({jsonrpc:'2.0',id,result:result(await call(body.params?.name,body.params?.arguments||{}))});
    return res.status(400).json({jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}});
  }catch(error){
    return res.status(error.status||500).json({jsonrpc:'2.0',id,result:{content:[{type:'text',text:error.message||'Tool failed'}],isError:true}});
  }
});

module.exports={revenueSprintMcpRouter:router,sprintSnapshot,updateAccount,createAction,completeAction,localDateInKampala};
