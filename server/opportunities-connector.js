'use strict';
const express=require('express');
const rateLimit=require('express-rate-limit');
const db=require('./db');
const {
  READ_SCOPE,
  WRITE_SCOPE,
  CONNECTOR_SCOPES,
  requireOpportunityScope
}=require('./opportunities-connector-auth');

const router=express.Router();
router.use(rateLimit({windowMs:60000,limit:120,standardHeaders:'draft-7',legacyHeaders:false}));

const text=(v,max=2000)=>String(v??'').trim().slice(0,max);
const bool=v=>v===true||v===1||v==='1'||String(v).toLowerCase()==='true';
const makeId=()=>`opp_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
const STAGES=new Set(['Discover','Watching','Qualifying','Pursuing','Drafting','Submitted','Decision','Won','Lost','Closed']);
const AUDIENCES=new Set(['Jacob','Tuku-Tuku','Both']);
const TYPES=new Set(['Opportunity','Role','Consultancy','Tender','Grant','RFP','Framework Agreement','Partnership','Challenge','Programme','Supplier','Other']);
const ARRAY_FIELDS=[
  ['mandatory_requirements','mandatoryRequirements'],
  ['desirable_requirements','desirableRequirements'],
  ['strongest_matches','strongestMatches'],
  ['gaps','gaps'],
  ['hard_blockers','hardBlockers'],
  ['deliverables','deliverables'],
  ['application_requirements','applicationRequirements'],
  ['strategic_reasons','strategicReasons']
];
const cleanStage=(v,f='Watching')=>STAGES.has(text(v,40))?text(v,40):f;
const cleanAudience=(v,f='Both')=>AUDIENCES.has(text(v,40))?text(v,40):f;
const cleanType=(v,f='Opportunity')=>TYPES.has(text(v,80))?text(v,80):(text(v,80)||f);
const list=v=>Array.isArray(v)?v.slice(0,100):[];
const number=(v,min,max,fallback=0)=>{
  const n=Number(v);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
};
const pick=(body,snake,camel)=>body[snake]!==undefined?body[snake]:body[camel];

function createData(body={}){
  const title=text(body.title,500);
  const org=text(body.org||body.organisation||body.organization,500);
  if(!title||!org){
    const error=new Error('Title and organisation are required');
    error.status=422;
    throw error;
  }
  return {
    id:text(body.id,120)||makeId(),
    title,
    org,
    source:text(body.source,200)||'JakeOS Connector',
    source_url:text(body.source_url||body.sourceUrl,2000),
    deadline:text(body.deadline,40)||null,
    budget:text(body.budget,200),
    description:text(body.description,8000),
    relevance_score:number(body.relevance_score??body.relevanceScore,0,100),
    relevance_reason:text(body.relevance_reason||body.relevanceReason,2000),
    status:text(body.status,60)||'Tracked',
    tags:text(body.tags,1000),
    saved:body.saved===undefined?true:bool(body.saved),
    seen:body.seen===undefined?true:bool(body.seen),
    audience:cleanAudience(body.audience),
    opportunity_type:cleanType(body.opportunity_type||body.opportunityType),
    stage:cleanStage(body.stage),
    value_amount:Number(body.value_amount??body.valueAmount)||0,
    currency:text(body.currency,10)||'USD',
    location:text(body.location,300),
    arrangement:text(body.arrangement,200),
    procurement_type:text(body.procurement_type||body.procurementType,200),
    fit_score:number(body.fit_score??body.fitScore,0,5),
    bid_posture:text(body.bid_posture||body.bidPosture,120),
    next_action:text(body.next_action||body.nextAction,4000),
    contact:text(body.contact,500),
    notes:text(body.notes,10000),
    source_context:text(body.source_context||body.sourceContext,30000),
    fit_status:text(body.fit_status||body.fitStatus,60)||'Needs assessment',
    eligibility_status:text(body.eligibility_status||body.eligibilityStatus,80)||'Needs verification',
    assessment_status:text(body.assessment_status||body.assessmentStatus,60)||'Partial',
    assessment_confidence:text(body.assessment_confidence||body.assessmentConfidence,40)||'Medium',
    opportunity_summary:text(body.opportunity_summary||body.opportunitySummary,12000),
    fit_summary:text(body.fit_summary||body.fitSummary,8000),
    decision_rationale:text(body.decision_rationale||body.decisionRationale,8000),
    winning_strategy:text(body.winning_strategy||body.winningStrategy,10000),
    mandatory_requirements:list(pick(body,'mandatory_requirements','mandatoryRequirements')),
    desirable_requirements:list(pick(body,'desirable_requirements','desirableRequirements')),
    strongest_matches:list(pick(body,'strongest_matches','strongestMatches')),
    gaps:list(body.gaps),
    hard_blockers:list(pick(body,'hard_blockers','hardBlockers')),
    deliverables:list(body.deliverables),
    application_requirements:list(pick(body,'application_requirements','applicationRequirements')),
    strategic_reasons:list(pick(body,'strategic_reasons','strategicReasons')),
    start_window:text(body.start_window||body.startWindow,300),
    duration:text(body.duration,300),
    compensation:text(body.compensation,500),
    source_verified_at:body.source_verified_at||body.sourceVerifiedAt||null,
    assessed_at:body.assessed_at||body.assessedAt||new Date().toISOString(),
    checklist:list(body.checklist),
    watch_profile_id:text(body.watch_profile_id||body.watchProfileId,120)||null,
    updated_at:new Date().toISOString()
  };
}

function patchData(body={},existing={}){
  const data={updated_at:new Date().toISOString()};
  const directFields=[
    ['title',500],['org',500],['source',200],['source_url',2000],['deadline',40],
    ['budget',200],['description',8000],['relevance_reason',2000],['status',60],
    ['tags',1000],['currency',10],['location',300],['arrangement',200],
    ['procurement_type',200],['bid_posture',120],['next_action',4000],['contact',500],
    ['notes',10000],['source_context',30000],['outcome',1000],['fit_status',60],
    ['eligibility_status',80],['assessment_status',60],['assessment_confidence',40],
    ['opportunity_summary',12000],['fit_summary',8000],['decision_rationale',8000],
    ['winning_strategy',10000],['start_window',300],['duration',300],['compensation',500]
  ];
  for(const [key,max] of directFields){
    if(body[key]!==undefined)data[key]=text(body[key],max);
  }
  const aliases=[
    ['source_url','sourceUrl',2000],['procurement_type','procurementType',200],
    ['bid_posture','bidPosture',120],['next_action','nextAction',4000],
    ['source_context','sourceContext',30000],['fit_status','fitStatus',60],
    ['eligibility_status','eligibilityStatus',80],['assessment_status','assessmentStatus',60],
    ['assessment_confidence','assessmentConfidence',40],
    ['opportunity_summary','opportunitySummary',12000],['fit_summary','fitSummary',8000],
    ['decision_rationale','decisionRationale',8000],['winning_strategy','winningStrategy',10000],
    ['start_window','startWindow',300]
  ];
  for(const [key,alias,max] of aliases){
    if(body[alias]!==undefined)data[key]=text(body[alias],max);
  }
  if(body.stage!==undefined)data.stage=cleanStage(body.stage,existing.stage);
  if(body.audience!==undefined)data.audience=cleanAudience(body.audience,existing.audience);
  if(body.opportunity_type!==undefined||body.opportunityType!==undefined){
    data.opportunity_type=cleanType(body.opportunity_type??body.opportunityType,existing.opportunity_type);
  }
  if(body.value_amount!==undefined||body.valueAmount!==undefined)data.value_amount=Number(body.value_amount??body.valueAmount)||0;
  if(body.fit_score!==undefined||body.fitScore!==undefined)data.fit_score=number(body.fit_score??body.fitScore,0,5);
  if(body.relevance_score!==undefined||body.relevanceScore!==undefined)data.relevance_score=number(body.relevance_score??body.relevanceScore,0,100);
  if(body.saved!==undefined)data.saved=bool(body.saved);
  if(body.seen!==undefined)data.seen=bool(body.seen);
  if(body.watch_profile_id!==undefined||body.watchProfileId!==undefined){
    data.watch_profile_id=text(body.watch_profile_id??body.watchProfileId,120)||null;
  }
  if(Array.isArray(body.checklist))data.checklist=list(body.checklist);
  for(const [snake,camel] of ARRAY_FIELDS){
    const value=body[snake]??body[camel];
    if(Array.isArray(value))data[snake]=list(value);
  }
  for(const [snake,camel] of [
    ['source_verified_at','sourceVerifiedAt'],
    ['assessed_at','assessedAt'],
    ['submitted_at','submittedAt'],
    ['decision_at','decisionAt']
  ]){
    if(body[snake]!==undefined||body[camel]!==undefined)data[snake]=(body[snake]??body[camel])||null;
  }
  return data;
}

async function duplicateFor(input={}){
  const sourceUrl=text(input.source_url||input.sourceUrl,2000);
  if(sourceUrl){
    const rows=(await db.query(
      'SELECT * FROM opportunities WHERE lower(source_url)=lower($1) ORDER BY updated_at DESC LIMIT 1',
      [sourceUrl]
    )).rows;
    if(rows[0])return rows[0];
  }
  const title=text(input.title,500);
  const org=text(input.org||input.organisation||input.organization,500);
  if(title&&org){
    const rows=(await db.query(
      'SELECT * FROM opportunities WHERE lower(title)=lower($1) AND lower(org)=lower($2) ORDER BY updated_at DESC LIMIT 1',
      [title,org]
    )).rows;
    if(rows[0])return rows[0];
  }
  return null;
}

async function createOne(body){
  const duplicate=await duplicateFor(body);
  if(duplicate)return {action:'duplicate',opportunity:duplicate};
  const row=await db.insert('opportunities',createData(body),false);
  if(!row){
    const error=new Error('Opportunity could not be created');
    error.status=500;
    throw error;
  }
  return {action:'created',opportunity:row};
}

function fail(res,error){
  return res.status(error.status||500).json({
    error:error.message||'Opportunity connector failed',
    code:error.status===422?'INVALID_INPUT':'CONNECTOR_ERROR'
  });
}

router.get('/capabilities',requireOpportunityScope(READ_SCOPE),(req,res)=>{
  res.json({
    service:'JakeOS Opportunities',
    principal:req.opportunitiesPrincipal.id,
    scopes:[...CONNECTOR_SCOPES],
    write_operations:['create','update','status','notes','import'],
    delete:false
  });
});

router.get('/dedupe',requireOpportunityScope(READ_SCOPE),async(req,res)=>{
  try{
    const duplicate=await duplicateFor(req.query);
    res.json({duplicate:Boolean(duplicate),opportunity:duplicate});
  }catch(error){fail(res,error);}
});

router.get('/',requireOpportunityScope(READ_SCOPE),async(req,res)=>{
  try{
    const values=[],clauses=[];
    if(req.query.stage){values.push(cleanStage(req.query.stage));clauses.push('stage=$'+values.length);}
    if(req.query.audience){values.push(cleanAudience(req.query.audience));clauses.push('audience=$'+values.length);}
    if(req.query.q){
      values.push('%'+text(req.query.q,160)+'%');
      clauses.push('(title ILIKE $'+values.length+' OR org ILIKE $'+values.length+' OR description ILIKE $'+values.length+' OR notes ILIKE $'+values.length+')');
    }
    values.push(Math.max(1,Math.min(Number(req.query.limit)||100,200)));
    const where=clauses.length?'WHERE '+clauses.join(' AND '):'';
    const rows=(await db.query(
      `SELECT * FROM opportunities ${where} ORDER BY updated_at DESC LIMIT $${values.length}`,
      values
    )).rows;
    res.json({opportunities:rows,count:rows.length});
  }catch(error){fail(res,error);}
});

router.get('/:id',requireOpportunityScope(READ_SCOPE),async(req,res)=>{
  try{
    const row=await db.get('opportunities',{eq:{id:text(req.params.id,120)}});
    if(!row)return res.status(404).json({error:'Opportunity not found'});
    res.json({opportunity:row});
  }catch(error){fail(res,error);}
});

router.post('/import',requireOpportunityScope(WRITE_SCOPE),async(req,res)=>{
  try{
    const items=Array.isArray(req.body)?req.body:req.body?.opportunities;
    if(!Array.isArray(items)||items.length===0||items.length>100){
      return res.status(422).json({error:'Provide 1-100 opportunities',code:'INVALID_INPUT'});
    }
    const results=[];
    for(const item of items)results.push(await createOne(item));
    res.status(201).json({
      results,
      created:results.filter(item=>item.action==='created').length,
      duplicates:results.filter(item=>item.action==='duplicate').length
    });
  }catch(error){fail(res,error);}
});

router.post('/',requireOpportunityScope(WRITE_SCOPE),async(req,res)=>{
  try{
    const result=await createOne(req.body||{});
    res.status(result.action==='created'?201:200).json(result);
  }catch(error){fail(res,error);}
});

router.patch('/:id',requireOpportunityScope(WRITE_SCOPE),async(req,res)=>{
  try{
    const id=text(req.params.id,120);
    const existing=await db.get('opportunities',{eq:{id}});
    if(!existing)return res.status(404).json({error:'Opportunity not found'});
    await db.update('opportunities',id,patchData(req.body||{},existing));
    res.json({opportunity:await db.get('opportunities',{eq:{id}})});
  }catch(error){fail(res,error);}
});

router.post('/:id/status',requireOpportunityScope(WRITE_SCOPE),async(req,res)=>{
  try{
    const id=text(req.params.id,120);
    const existing=await db.get('opportunities',{eq:{id}});
    if(!existing)return res.status(404).json({error:'Opportunity not found'});
    const data={updated_at:new Date().toISOString()};
    if(req.body.stage!==undefined)data.stage=cleanStage(req.body.stage,existing.stage);
    if(req.body.status!==undefined)data.status=text(req.body.status,60);
    if(req.body.outcome!==undefined)data.outcome=text(req.body.outcome,1000);
    if(req.body.next_action!==undefined||req.body.nextAction!==undefined){
      data.next_action=text(req.body.next_action??req.body.nextAction,4000);
    }
    if(req.body.submitted_at!==undefined||req.body.submittedAt!==undefined){
      data.submitted_at=(req.body.submitted_at??req.body.submittedAt)||null;
    }
    if(req.body.decision_at!==undefined||req.body.decisionAt!==undefined){
      data.decision_at=(req.body.decision_at??req.body.decisionAt)||null;
    }
    await db.update('opportunities',id,data);
    res.json({opportunity:await db.get('opportunities',{eq:{id}})});
  }catch(error){fail(res,error);}
});

router.post('/:id/notes',requireOpportunityScope(WRITE_SCOPE),async(req,res)=>{
  try{
    const id=text(req.params.id,120);
    const existing=await db.get('opportunities',{eq:{id}});
    if(!existing)return res.status(404).json({error:'Opportunity not found'});
    const note=text(req.body.note,2000);
    if(!note)return res.status(422).json({error:'note is required',code:'INVALID_INPUT'});
    const stamp=new Date().toISOString();
    const next=text([existing.notes,`[${stamp}] ${note}`].filter(Boolean).join('\n\n'),10000);
    await db.update('opportunities',id,{notes:next,updated_at:stamp});
    res.json({opportunity:await db.get('opportunities',{eq:{id}})});
  }catch(error){fail(res,error);}
});

module.exports={opportunitiesConnectorRouter:router,createData,patchData,duplicateFor};
