'use strict';
const express=require('express');
const db=require('./db');

const router=express.Router();
const text=(v,max=2000)=>String(v??'').trim().slice(0,max);
const bool=v=>v===true||v===1||v==='1'||String(v).toLowerCase()==='true';
const makeId=(prefix='opp')=>prefix+'_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
const STAGES=new Set(['Discover','Watching','Qualifying','Pursuing','Drafting','Submitted','Decision','Won','Lost','Closed']);
const AUDIENCES=new Set(['Jacob','Tuku-Tuku','Both']);
const TYPES=new Set(['Opportunity','Role','Consultancy','Tender','Grant','RFP','Framework Agreement','Partnership','Challenge','Programme','Supplier','Other']);
const cleanStage=(v,f='Discover')=>STAGES.has(text(v,40))?text(v,40):f;
const cleanAudience=(v,f='Both')=>AUDIENCES.has(text(v,40))?text(v,40):f;
const cleanType=(v,f='Opportunity')=>TYPES.has(text(v,80))?text(v,80):(text(v,80)||f);

router.get('/',async(req,res)=>{
  const values=[],clauses=[];
  if(req.query.stage){values.push(cleanStage(req.query.stage));clauses.push('o.stage=$'+values.length);}
  if(req.query.audience){values.push(cleanAudience(req.query.audience));clauses.push('o.audience=$'+values.length);}
  if(req.query.watch){values.push(text(req.query.watch,120));clauses.push('o.watch_profile_id=$'+values.length);}
  if(req.query.q){values.push('%'+text(req.query.q,160)+'%');clauses.push('(o.title ILIKE $'+values.length+' OR o.org ILIKE $'+values.length+' OR o.description ILIKE $'+values.length+' OR o.notes ILIKE $'+values.length+')');}
  values.push(Math.max(1,Math.min(Number(req.query.limit)||500,1000)));
  const where=clauses.length?'WHERE '+clauses.join(' AND '):'';
  const sql=[
    'SELECT o.*,COUNT(p.id)::int AS proposal_count,MAX(p.updated_at) AS proposal_updated_at',
    'FROM opportunities o LEFT JOIN proposals p ON p.opportunity_id=o.id',
    where,
    'GROUP BY o.id',
    "ORDER BY CASE o.stage WHEN 'Pursuing' THEN 0 WHEN 'Drafting' THEN 1 WHEN 'Submitted' THEN 2 WHEN 'Decision' THEN 3 WHEN 'Qualifying' THEN 4 WHEN 'Watching' THEN 5 WHEN 'Discover' THEN 6 WHEN 'Won' THEN 7 WHEN 'Lost' THEN 8 ELSE 9 END,",
    "CASE WHEN o.deadline ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN o.deadline::date ELSE NULL END NULLS LAST,",
    'o.fit_score DESC,o.relevance_score DESC,o.updated_at DESC LIMIT $'+values.length
  ].join(' ');
  const opportunities=(await db.query(sql,values)).rows;
  const [watches,proposals,sources]=await Promise.all([
    db.query("SELECT w.*,COUNT(o.id)::int AS opportunity_count,COUNT(o.id) FILTER(WHERE o.stage NOT IN('Won','Lost','Closed'))::int AS active_count FROM opportunity_watch_profiles w LEFT JOIN opportunities o ON o.watch_profile_id=w.id GROUP BY w.id ORDER BY w.active DESC,w.name"),
    db.query("SELECT p.*,o.title AS opportunity_title,o.org AS opportunity_org,o.stage AS opportunity_stage FROM proposals p LEFT JOIN opportunities o ON o.id=p.opportunity_id ORDER BY p.updated_at DESC LIMIT 500"),
    db.query("SELECT * FROM opportunity_sources ORDER BY name")
  ]);
  const active=opportunities.filter(o=>!['Won','Lost','Closed'].includes(o.stage));
  const due14=active.filter(o=>o.deadline&&/^\d{4}-\d{2}-\d{2}/.test(o.deadline)&&new Date(o.deadline)<=new Date(Date.now()+14*86400000));
  res.json({
    opportunities,
    watches:watches.rows,
    proposals:proposals.rows,
    sources:sources.rows,
    summary:{
      total:opportunities.length,
      active:active.length,
      discover:opportunities.filter(o=>o.stage==='Discover').length,
      pursuing:opportunities.filter(o=>['Qualifying','Pursuing','Drafting'].includes(o.stage)).length,
      submitted:opportunities.filter(o=>['Submitted','Decision'].includes(o.stage)).length,
      won:opportunities.filter(o=>o.stage==='Won').length,
      due14:due14.length,
      active_value_usd:active.filter(o=>(o.currency||'USD')==='USD').reduce((s,o)=>s+Number(o.value_amount||0),0)
    }
  });
});

router.get('/watches',async(_,res)=>{
  const rows=(await db.query("SELECT w.*,COUNT(o.id)::int AS opportunity_count,COUNT(o.id) FILTER(WHERE o.stage NOT IN('Won','Lost','Closed'))::int AS active_count FROM opportunity_watch_profiles w LEFT JOIN opportunities o ON o.watch_profile_id=w.id GROUP BY w.id ORDER BY w.active DESC,w.name")).rows;
  res.json({watches:rows});
});

router.post('/',async(req,res)=>{
  const title=text(req.body.title,500),org=text(req.body.org,500);
  if(!title||!org)return res.status(422).json({error:'Title and organisation are required'});
  const row=await db.insert('opportunities',{
    id:text(req.body.id,120)||makeId('opp'),title,org,
    source:text(req.body.source,200)||'JakeOS',
    source_url:text(req.body.source_url||req.body.sourceUrl,2000),
    deadline:text(req.body.deadline,40)||null,
    budget:text(req.body.budget,200),
    description:text(req.body.description,8000),
    relevance_score:Math.max(0,Math.min(100,Number(req.body.relevance_score||req.body.relevanceScore)||0)),
    relevance_reason:text(req.body.relevance_reason||req.body.relevanceReason,2000),
    status:text(req.body.status,60)||'Tracked',
    tags:text(req.body.tags,1000),
    saved:req.body.saved===undefined?true:bool(req.body.saved),
    seen:req.body.seen===undefined?true:bool(req.body.seen),
    audience:cleanAudience(req.body.audience),
    opportunity_type:cleanType(req.body.opportunity_type||req.body.opportunityType),
    stage:cleanStage(req.body.stage,'Watching'),
    value_amount:Number(req.body.value_amount||req.body.valueAmount)||0,
    currency:text(req.body.currency,10)||'USD',
    location:text(req.body.location,300),
    arrangement:text(req.body.arrangement,200),
    procurement_type:text(req.body.procurement_type||req.body.procurementType,200),
    fit_score:Math.max(0,Math.min(5,Number(req.body.fit_score||req.body.fitScore)||0)),
    bid_posture:text(req.body.bid_posture||req.body.bidPosture,120),
    next_action:text(req.body.next_action||req.body.nextAction,4000),
    contact:text(req.body.contact,500),
    notes:text(req.body.notes,10000),
    source_context:text(req.body.source_context||req.body.sourceContext,30000),
    checklist:Array.isArray(req.body.checklist)?req.body.checklist.slice(0,100):[],
    watch_profile_id:text(req.body.watch_profile_id||req.body.watchProfileId,120)||null,
    updated_at:new Date().toISOString()
  },false);
  res.status(201).json({opportunity:row});
});

router.patch('/proposals/:proposalId',async(req,res)=>{
  const existing=await db.get('proposals',{eq:{id:text(req.params.proposalId,120)}});
  if(!existing)return res.status(404).json({error:'Proposal not found'});
  const data={updated_at:new Date().toISOString()};
  for(const key of ['title','type','client','value','content','status'])if(req.body[key]!==undefined)data[key]=text(req.body[key],key==='content'?100000:500);
  if(req.body.opportunityId!==undefined||req.body.opportunity_id!==undefined)data.opportunity_id=text(req.body.opportunityId??req.body.opportunity_id,120)||null;
  await db.update('proposals',existing.id,data);
  res.json({proposal:await db.get('proposals',{eq:{id:existing.id}})});
});

router.post('/:id/proposals',async(req,res)=>{
  const opportunity=await db.get('opportunities',{eq:{id:text(req.params.id,120)}});
  if(!opportunity)return res.status(404).json({error:'Opportunity not found'});
  const row=await db.insert('proposals',{
    id:text(req.body.id,120)||makeId('proposal'),
    title:text(req.body.title,500)||opportunity.title+' — Proposal',
    type:text(req.body.type,100)||'Consulting Proposal',
    client:text(req.body.client,300)||opportunity.org,
    value:text(req.body.value,100)||(Number(opportunity.value_amount)>0?opportunity.value_amount+' '+(opportunity.currency||'USD'):''),
    deal_id:opportunity.legacy_pipeline_id||null,
    opportunity_id:opportunity.id,
    content:text(req.body.content,100000),
    status:text(req.body.status,60)||'Draft'
  },false);
  if(['Watching','Qualifying','Pursuing'].includes(opportunity.stage))await db.update('opportunities',opportunity.id,{stage:'Drafting',saved:true,status:'Tracked',updated_at:new Date().toISOString()});
  res.status(201).json({proposal:row});
});

router.patch('/:id',async(req,res)=>{
  const opportunity=await db.get('opportunities',{eq:{id:text(req.params.id,120)}});
  if(!opportunity)return res.status(404).json({error:'Opportunity not found'});
  const data={updated_at:new Date().toISOString()};
  const fields=[['title',500],['org',500],['source',200],['source_url',2000],['deadline',40],['budget',200],['description',8000],['relevance_reason',2000],['status',60],['tags',1000],['currency',10],['location',300],['arrangement',200],['procurement_type',200],['bid_posture',120],['next_action',4000],['contact',500],['notes',10000],['source_context',30000],['outcome',1000]];
  for(const [key,max] of fields)if(req.body[key]!==undefined)data[key]=text(req.body[key],max);
  if(req.body.sourceUrl!==undefined)data.source_url=text(req.body.sourceUrl,2000);
  if(req.body.procurementType!==undefined)data.procurement_type=text(req.body.procurementType,200);
  if(req.body.bidPosture!==undefined)data.bid_posture=text(req.body.bidPosture,120);
  if(req.body.nextAction!==undefined)data.next_action=text(req.body.nextAction,4000);
  if(req.body.sourceContext!==undefined)data.source_context=text(req.body.sourceContext,30000);
  if(req.body.stage!==undefined)data.stage=cleanStage(req.body.stage,opportunity.stage);
  if(req.body.audience!==undefined)data.audience=cleanAudience(req.body.audience,opportunity.audience);
  if(req.body.opportunity_type!==undefined||req.body.opportunityType!==undefined)data.opportunity_type=cleanType(req.body.opportunity_type??req.body.opportunityType,opportunity.opportunity_type);
  if(req.body.value_amount!==undefined||req.body.valueAmount!==undefined)data.value_amount=Number(req.body.value_amount??req.body.valueAmount)||0;
  if(req.body.fit_score!==undefined||req.body.fitScore!==undefined)data.fit_score=Math.max(0,Math.min(5,Number(req.body.fit_score??req.body.fitScore)||0));
  if(req.body.relevance_score!==undefined||req.body.relevanceScore!==undefined)data.relevance_score=Math.max(0,Math.min(100,Number(req.body.relevance_score??req.body.relevanceScore)||0));
  if(req.body.saved!==undefined)data.saved=bool(req.body.saved);
  if(req.body.seen!==undefined)data.seen=bool(req.body.seen);
  if(req.body.watch_profile_id!==undefined||req.body.watchProfileId!==undefined)data.watch_profile_id=text(req.body.watch_profile_id??req.body.watchProfileId,120)||null;
  if(Array.isArray(req.body.checklist))data.checklist=req.body.checklist.slice(0,100);
  if(req.body.submitted_at!==undefined||req.body.submittedAt!==undefined)data.submitted_at=req.body.submitted_at??req.body.submittedAt||null;
  if(req.body.decision_at!==undefined||req.body.decisionAt!==undefined)data.decision_at=req.body.decision_at??req.body.decisionAt||null;
  await db.update('opportunities',opportunity.id,data);
  res.json({opportunity:await db.get('opportunities',{eq:{id:opportunity.id}})});
});

router.delete('/:id',async(req,res)=>{
  const opportunity=await db.get('opportunities',{eq:{id:text(req.params.id,120)}});
  if(!opportunity)return res.status(404).json({error:'Opportunity not found'});
  await db.update('opportunities',opportunity.id,{stage:'Closed',status:'Archived',updated_at:new Date().toISOString()});
  res.json({ok:true});
});

module.exports={opportunitiesWorkspaceRouter:router};
