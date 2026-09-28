'use strict';
const express=require('express');
const db=require('./db');

const router=express.Router();
const text=(v,max=4000)=>String(v??'').trim().slice(0,max);
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const bool=v=>v===true||v===1||v==='1'||String(v).toLowerCase()==='true';
function boundedPct(value,fallback=0){
  const n=Number(value);
  return Number.isFinite(n)?Math.max(0,Math.min(100,n)):fallback;
}
const IDENT=/^[a-z_][a-z0-9_]*$/i;
function txValue(value){
  if(value===undefined)return null;
  if(value!==null&&typeof value==='object'&&!(value instanceof Date)&&!Buffer.isBuffer(value))return JSON.stringify(value);
  return value;
}
async function txInsert(client,table,data){
  const cols=Object.keys(data).filter(key=>data[key]!==undefined);
  if(!IDENT.test(table)||cols.some(col=>!IDENT.test(col)))throw new Error('Unsafe transaction insert identifier');
  if(!cols.length)throw new Error('Transaction insert requires data');
  const values=cols.map(key=>txValue(data[key]));
  const quoted=value=>'"'+String(value).replaceAll('"','""')+'"';
  const placeholders=cols.map((_,i)=>'$'+(i+1)).join(',');
  const sql='INSERT INTO '+quoted(table)+' ('+cols.map(quoted).join(',')+') VALUES ('+placeholders+') RETURNING *';
  const row=(await client.query(sql,values)).rows[0];
  if(!row)throw new Error('Transaction insert returned no row');
  return row;
}
const id=(prefix='rev')=>prefix+'_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
const CLOSED_STAGES=new Set(['Paid','Lost','Parked']);
const STAGE_MAP={
  Target:'Watching',
  Contacted:'Qualifying',
  Conversation:'Pursuing',
  Proposal:'Drafting',
  Negotiation:'Decision',
  Contracted:'Won',
  Invoiced:'Won',
  Paid:'Won',
  Lost:'Lost',
  Parked:'Closed'
};

function dateOnly(value){
  if(!value)return null;
  if(value instanceof Date&&!Number.isNaN(value.getTime()))return value.toISOString().slice(0,10);
  const raw=String(value);
  const iso=raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if(iso)return iso[1];
  const parsed=new Date(raw);
  return Number.isNaN(parsed.getTime())?null:parsed.toISOString().slice(0,10);
}
function todayUtc(){return new Date().toISOString().slice(0,10);}
function dayDiffInclusive(start,end){
  if(!start||!end)return 0;
  const a=new Date(start+'T00:00:00Z'),b=new Date(end+'T00:00:00Z');
  return Math.max(0,Math.floor((b-a)/86400000)+1);
}
function summarizeAccounts(accounts=[],sprint={},today=todayUtc()){
  const grossPipeline=accounts.filter(a=>!CLOSED_STAGES.has(a.stage)).reduce((s,a)=>s+num(a.pipeline_value_usd),0);
  const activeAccounts=accounts.filter(a=>!CLOSED_STAGES.has(a.stage));
  const weightedPipeline=activeAccounts.reduce((s,a)=>s+num(a.pipeline_value_usd)*(Math.max(0,Math.min(100,num(a.probability)))/100),0);
  const cashNowPipeline=activeAccounts.filter(a=>a.lane==='Cash now').reduce((s,a)=>s+num(a.pipeline_value_usd),0);
  const tenderUpsidePipeline=activeAccounts.filter(a=>a.lane==='Tender upside').reduce((s,a)=>s+num(a.pipeline_value_usd),0);
  const cashCollected=accounts.reduce((s,a)=>s+num(a.cash_collected_usd),0);
  const contracted=accounts.reduce((s,a)=>s+num(a.contracted_usd),0);
  const proposalValue=accounts.filter(a=>a.proposal_sent).reduce((s,a)=>s+num(a.pipeline_value_usd),0);
  const stageCounts={};
  for(const a of accounts)stageCounts[a.stage||'Target']=(stageCounts[a.stage||'Target']||0)+1;
  const atRisk=accounts.filter(a=>{const next=dateOnly(a.next_action_date);return !CLOSED_STAGES.has(a.stage)&&next&&next<today;});
  const cashTarget=num(sprint.cash_target_usd||10000);
  const start=dateOnly(sprint.starts_on),end=dateOnly(sprint.ends_on);
  const totalDays=dayDiffInclusive(start,end);
  let dayNumber=1,daysRemaining=totalDays;
  if(start&&end){
    if(today<start){dayNumber=1;daysRemaining=totalDays;}
    else{dayNumber=Math.min(totalDays,Math.max(1,dayDiffInclusive(start,today)));daysRemaining=today>end?0:dayDiffInclusive(today,end);}
  }
  return{
    gross_pipeline_usd:grossPipeline,
    weighted_pipeline_usd:Math.round(weightedPipeline),
    cash_now_pipeline_usd:cashNowPipeline,
    tender_upside_pipeline_usd:tenderUpsidePipeline,
    cash_collected_usd:cashCollected,
    contracted_usd:contracted,
    proposal_value_usd:proposalValue,
    cash_gap_usd:Math.max(0,cashTarget-cashCollected),
    target_progress_pct:cashTarget?Math.min(100,Math.round(cashCollected/cashTarget*100)):0,
    stage_counts:stageCounts,
    active_accounts:activeAccounts.length,
    at_risk_count:atRisk.length,
    at_risk_ids:atRisk.map(a=>a.id),
    total_days:totalDays,
    day_number:dayNumber,
    days_remaining:daysRemaining
  };
}
function stageToOpportunityStage(stage){return STAGE_MAP[stage]||'Watching';}

async function latestSprint(idValue){
  if(idValue)return db.get('revenue_sprints',{eq:{id:text(idValue,120)}});
  const rows=await db.all('revenue_sprints',{eq:{status:'active'},order:{col:'starts_on',asc:false},limit:1});
  return rows[0]||null;
}
async function loadAccounts(sprintId){
  const result=await db.query(`
    SELECT a.*,o.title AS opportunity_title,o.stage AS opportunity_stage,o.source_url AS opportunity_source_url
    FROM revenue_sprint_accounts a
    LEFT JOIN opportunities o ON o.id=a.opportunity_id
    WHERE a.sprint_id=$1
    ORDER BY
      CASE a.stage
        WHEN 'Negotiation' THEN 0 WHEN 'Proposal' THEN 1 WHEN 'Conversation' THEN 2
        WHEN 'Contacted' THEN 3 WHEN 'Target' THEN 4 WHEN 'Contracted' THEN 5
        WHEN 'Invoiced' THEN 6 WHEN 'Paid' THEN 7 WHEN 'Parked' THEN 8 ELSE 9 END,
      a.probability DESC,a.pipeline_value_usd DESC,a.org
  `,[sprintId]);
  return result.rows.map(row=>({...row,deadline:dateOnly(row.deadline),next_action_date:dateOnly(row.next_action_date)}));
}
async function loadActions(sprintId){
  return (await db.query(`
    SELECT x.*,a.org,a.offer,a.stage AS account_stage
    FROM revenue_sprint_actions x
    LEFT JOIN revenue_sprint_accounts a ON a.id=x.account_id
    WHERE x.sprint_id=$1
    ORDER BY x.action_date,
      CASE x.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      x.created_at
  `,[sprintId])).rows.map(row=>({...row,action_date:dateOnly(row.action_date)}));
}
async function loadRevenueEngine(sprintId){
  const [offers,markets,channels,campaigns,experiments,proof]=await Promise.all([
    db.query(`SELECT * FROM revenue_engine_offers WHERE status<>'archived' ORDER BY cash_speed_days,price_min_usd,name`),
    db.query(`SELECT * FROM revenue_engine_markets WHERE status<>'archived' ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,sales_cycle_min_days,name`),
    db.query(`SELECT * FROM revenue_engine_channels WHERE status<>'archived' ORDER BY CASE speed WHEN 'fast' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,name`),
    db.query(`SELECT c.*,o.name AS offer_name,m.name AS market_name,ch.name AS channel_name
      FROM revenue_engine_campaigns c
      LEFT JOIN revenue_engine_offers o ON o.id=c.offer_id
      LEFT JOIN revenue_engine_markets m ON m.id=c.market_id
      LEFT JOIN revenue_engine_channels ch ON ch.id=c.channel_id
      WHERE c.sprint_id=$1 ORDER BY CASE c.status WHEN 'active' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END,c.starts_on,c.name`,[sprintId]),
    db.query(`SELECT e.*,c.name AS campaign_name,ch.name AS channel_name
      FROM revenue_engine_experiments e
      LEFT JOIN revenue_engine_campaigns c ON c.id=e.campaign_id
      LEFT JOIN revenue_engine_channels ch ON ch.id=e.channel_id
      WHERE e.sprint_id=$1 ORDER BY CASE e.status WHEN 'active' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END,e.starts_on,e.name`,[sprintId]),
    db.query(`SELECT * FROM revenue_engine_proof WHERE status<>'archived' ORDER BY created_at,title`)
  ]);
  const campaignRows=campaigns.rows.map(row=>({...row,starts_on:dateOnly(row.starts_on),ends_on:dateOnly(row.ends_on)}));
  const experimentRows=experiments.rows.map(row=>({...row,starts_on:dateOnly(row.starts_on),ends_on:dateOnly(row.ends_on)}));
  const targetCash=campaignRows.filter(row=>row.status==='active'||row.status==='planned').reduce((sum,row)=>sum+num(row.target_cash_usd),0);
  return{
    offers:offers.rows,
    markets:markets.rows,
    channels:channels.rows,
    campaigns:campaignRows,
    experiments:experimentRows,
    proof:proof.rows,
    summary:{
      target_cash_mix_usd:targetCash,
      active_campaigns:campaignRows.filter(row=>row.status==='active').length,
      active_experiments:experimentRows.filter(row=>row.status==='active').length,
      fast_offers:offers.rows.filter(row=>Number(row.cash_speed_days)<=14).length
    }
  };
}


async function loadRevenuePlan(){
  const[streams,expenses,target]=await Promise.all([
    db.all('finance_streams',{order:{col:'created_at',asc:false}}),
    db.all('expenses',{order:{col:'created_at',asc:false}}),
    db.get('settings',{eq:{key:'finance_targets'}})
  ]);
  let targets={quarterly:20000,annual:100000,currency:'USD'};
  try{if(target?.value)targets={...targets,...JSON.parse(target.value)};}catch{}
  return{streams,expenses,targets};
}

router.get('/',async(req,res)=>{
  try{
    const sprint=await latestSprint(req.query.id);
    if(!sprint)return res.status(404).json({error:'No active revenue sprint'});
    const[accounts,actions,engine,plan]=await Promise.all([loadAccounts(sprint.id),loadActions(sprint.id),loadRevenueEngine(sprint.id),loadRevenuePlan()]);
    const sprintView={...sprint,starts_on:dateOnly(sprint.starts_on),ends_on:dateOnly(sprint.ends_on)};
    const today=todayUtc(),summary=summarizeAccounts(accounts,sprintView,today);
    const dueActions=actions.filter(a=>a.status!=='done'&&a.action_date&&a.action_date<=today);
    const upcomingActions=actions.filter(a=>a.status!=='done'&&a.action_date>today).slice(0,12);
    const closeNext=accounts
      .filter(a=>!CLOSED_STAGES.has(a.stage))
      .map(a=>({...a,close_score:num(a.cash_30d_target_usd)*(Math.max(0,Math.min(100,num(a.probability)))/100)}))
      .sort((a,b)=>b.close_score-a.close_score||num(b.pipeline_value_usd)-num(a.pipeline_value_usd))
      .slice(0,10);
    res.json({sprint:sprintView,summary,accounts,actions,due_actions:dueActions,upcoming_actions:upcomingActions,close_next:closeNext,engine,plan,today});
  }catch(error){
    console.error('[RevenueSprint] load failed:',error.message);
    res.status(500).json({error:'Revenue sprint could not be loaded'});
  }
});

router.get('/plan',async(_req,res)=>{
  try{res.json(await loadRevenuePlan());}catch(error){console.error('[RevenuePlan] load failed:',error.message);res.status(500).json({error:'Revenue plan could not be loaded'});}
});
router.post('/plan/streams',async(req,res)=>{
  try{
    const name=text(req.body.name,500);if(!name)return res.status(422).json({error:'Name is required'});
    const row=await db.insert('finance_streams',{id:text(req.body.id,120)||id('revenue'),name,type:text(req.body.type,100)||'Consulting',status:text(req.body.status,60)||'Projected',amount:Number(req.body.amount)||0,currency:text(req.body.currency,10)||'USD',month:text(req.body.month,40)},false);
    res.status(201).json({stream:row});
  }catch(error){res.status(500).json({error:'Revenue stream could not be created'});}
});
router.patch('/plan/streams/:id',async(req,res)=>{
  try{
    const existing=await db.get('finance_streams',{eq:{id:text(req.params.id,120)}});if(!existing)return res.status(404).json({error:'Revenue stream not found'});
    const data={updated_at:new Date().toISOString()};for(const key of ['name','type','status','currency','month'])if(req.body[key]!==undefined)data[key]=text(req.body[key],500);if(req.body.amount!==undefined)data.amount=Number(req.body.amount)||0;
    await db.update('finance_streams',existing.id,data);res.json({stream:await db.get('finance_streams',{eq:{id:existing.id}})});
  }catch(error){res.status(500).json({error:'Revenue stream could not be updated'});}
});
router.delete('/plan/streams/:id',async(req,res)=>{try{await db.del('finance_streams',text(req.params.id,120));res.json({ok:true});}catch(error){res.status(500).json({error:'Revenue stream could not be deleted'});}});
router.post('/plan/expenses',async(req,res)=>{
  try{
    const name=text(req.body.name,500);if(!name)return res.status(422).json({error:'Name is required'});
    const row=await db.insert('expenses',{id:text(req.body.id,120)||id('expense'),name,amount:Number(req.body.amount)||0,currency:text(req.body.currency,10)||'USD',monthly:req.body.monthly!==undefined?bool(req.body.monthly):true,category:text(req.body.category,100)||'Operations'},false);
    res.status(201).json({expense:row});
  }catch(error){res.status(500).json({error:'Expense could not be created'});}
});
router.patch('/plan/expenses/:id',async(req,res)=>{
  try{
    const existing=await db.get('expenses',{eq:{id:text(req.params.id,120)}});if(!existing)return res.status(404).json({error:'Expense not found'});
    const data={updated_at:new Date().toISOString()};for(const key of ['name','currency','category'])if(req.body[key]!==undefined)data[key]=text(req.body[key],500);if(req.body.amount!==undefined)data.amount=Number(req.body.amount)||0;if(req.body.monthly!==undefined)data.monthly=bool(req.body.monthly);
    await db.update('expenses',existing.id,data);res.json({expense:await db.get('expenses',{eq:{id:existing.id}})});
  }catch(error){res.status(500).json({error:'Expense could not be updated'});}
});
router.delete('/plan/expenses/:id',async(req,res)=>{try{await db.del('expenses',text(req.params.id,120));res.json({ok:true});}catch(error){res.status(500).json({error:'Expense could not be deleted'});}});
router.patch('/plan/targets',async(req,res)=>{
  try{
    const target=await db.get('settings',{eq:{key:'finance_targets'}});let current={};try{current=target?.value?JSON.parse(target.value):{};}catch{}
    const updatedTargets={...current};for(const key of ['quarterly','annual'])if(req.body[key]!==undefined)updatedTargets[key]=Number(req.body[key])||0;if(req.body.currency!==undefined)updatedTargets.currency=text(req.body.currency,10)||'USD';
    await db.insert('settings',{key:'finance_targets',value:JSON.stringify(updatedTargets),updated_at:new Date().toISOString()},true);res.json({targets:updatedTargets});
  }catch(error){res.status(500).json({error:'Revenue targets could not be updated'});}
});

router.post('/accounts',async(req,res)=>{
  try{
    const sprint=await latestSprint(req.body.sprint_id||req.body.sprintId);
    if(!sprint)return res.status(404).json({error:'No active revenue sprint'});
    const org=text(req.body.org,300),offer=text(req.body.offer,1000);
    if(!org||!offer)return res.status(422).json({error:'Organisation and offer are required'});
    const opportunityId=text(req.body.opportunity_id||req.body.opportunityId,120)||id('opp');
    const stage=text(req.body.stage,40)||'Target';
    const pipelineValue=num(req.body.pipeline_value_usd??req.body.pipelineValueUSD);
    const nextAction=text(req.body.next_action||req.body.nextAction,4000);
    const mobilizationInput=req.body.mobilization_pct??req.body.mobilizationPct;
    const accountId=text(req.body.id,120)||id('rsa');

    const created=await db.withTransaction(async client=>{
      let opportunity=(await client.query('SELECT * FROM opportunities WHERE id=$1 LIMIT 1',[opportunityId])).rows[0]||null;
      if(!opportunity){
        opportunity=await txInsert(client,'opportunities',{
          id:opportunityId,title:offer,org,source:'JakeOS Revenue Sprint',source_url:text(req.body.source_url||req.body.sourceUrl,2000),
          deadline:dateOnly(req.body.deadline),budget:'',description:text(req.body.notes,8000),relevance_score:75,status:'Tracked',
          tags:'revenue-sprint',saved:true,seen:true,audience:'Tuku-Tuku',opportunity_type:text(req.body.opportunity_type||req.body.opportunityType,80)||'Consultancy',
          stage:stageToOpportunityStage(stage),value_amount:pipelineValue,currency:'USD',fit_score:4,bid_posture:'Consider',
          next_action:nextAction,contact:text(req.body.contact_name||req.body.contactName,500),notes:text(req.body.notes,10000),updated_at:new Date().toISOString()
        });
      }

      const account=await txInsert(client,'revenue_sprint_accounts',{
        id:accountId,sprint_id:sprint.id,opportunity_id:opportunityId,org,offer,
        lane:text(req.body.lane,80)||'Cash now',relationship:text(req.body.relationship,120)||'Cold',stage,
        pipeline_value_usd:pipelineValue,cash_30d_target_usd:num(req.body.cash_30d_target_usd??req.body.cash30dTargetUSD),
        probability:boundedPct(req.body.probability,0),contact_name:text(req.body.contact_name||req.body.contactName,300),
        contact_email:text(req.body.contact_email||req.body.contactEmail,300),contact_channel:text(req.body.contact_channel||req.body.contactChannel,80)||'Email',
        source_url:text(req.body.source_url||req.body.sourceUrl,2000),deadline:dateOnly(req.body.deadline),next_action:nextAction,
        next_action_date:dateOnly(req.body.next_action_date||req.body.nextActionDate),mobilization_pct:boundedPct(mobilizationInput,60),
        cash_collected_usd:0,contracted_usd:0,proposal_sent:false,owner:text(req.body.owner,120)||'Jacob',risk:text(req.body.risk,2000),notes:text(req.body.notes,10000)
      });
      return{account,opportunity};
    });

    res.status(201).json(created);
  }catch(error){
    console.error('[RevenueSprint] create account failed:',error.message);
    const duplicate=String(error.code||'')==='23505';
    res.status(duplicate?409:500).json({error:duplicate?'Revenue sprint account already exists':'Revenue sprint account could not be created'});
  }
});
router.patch('/accounts/:id',async(req,res)=>{
  try{
    const account=await db.get('revenue_sprint_accounts',{eq:{id:text(req.params.id,120)}});
    if(!account)return res.status(404).json({error:'Sprint account not found'});
    const data={updated_at:new Date().toISOString()};
    const textFields=['org','offer','lane','relationship','stage','contact_name','contact_email','contact_channel','source_url','next_action','owner','risk','notes'];
    for(const key of textFields)if(req.body[key]!==undefined)data[key]=text(req.body[key],key==='notes'?10000:key==='next_action'?4000:key==='risk'?2000:2000);
    const numberFields=['pipeline_value_usd','cash_30d_target_usd','cash_collected_usd','contracted_usd'];
    for(const key of numberFields)if(req.body[key]!==undefined)data[key]=Math.max(0,num(req.body[key]));
    if(req.body.probability!==undefined)data.probability=boundedPct(req.body.probability,0);
    if(req.body.mobilization_pct!==undefined)data.mobilization_pct=boundedPct(req.body.mobilization_pct,0);
    if(req.body.proposal_sent!==undefined)data.proposal_sent=bool(req.body.proposal_sent);
    if(data.stage!==undefined&&['Proposal','Negotiation','Contracted','Invoiced','Paid'].includes(data.stage))data.proposal_sent=true;
    if(req.body.deadline!==undefined)data.deadline=dateOnly(req.body.deadline);
    if(req.body.next_action_date!==undefined)data.next_action_date=dateOnly(req.body.next_action_date);
    await db.update('revenue_sprint_accounts',account.id,data);
    if(account.opportunity_id){
      const opportunityData={updated_at:new Date().toISOString()};
      if(data.stage!==undefined)opportunityData.stage=stageToOpportunityStage(data.stage);
      if(data.next_action!==undefined)opportunityData.next_action=data.next_action;
      if(data.pipeline_value_usd!==undefined)opportunityData.value_amount=data.pipeline_value_usd;
      if(data.deadline!==undefined)opportunityData.deadline=data.deadline;
      if(data.contact_name!==undefined)opportunityData.contact=data.contact_name;
      if(data.notes!==undefined)opportunityData.notes=data.notes;
      await db.update('opportunities',account.opportunity_id,opportunityData);
    }
    res.json({account:await db.get('revenue_sprint_accounts',{eq:{id:account.id}})});
  }catch(error){
    console.error('[RevenueSprint] update account failed:',error.message);
    res.status(500).json({error:'Revenue sprint account could not be updated'});
  }
});

router.post('/accounts/:id/actions',async(req,res)=>{
  try{
    const account=await db.get('revenue_sprint_accounts',{eq:{id:text(req.params.id,120)}});
    if(!account)return res.status(404).json({error:'Sprint account not found'});
    const title=text(req.body.title,1000);
    if(!title)return res.status(422).json({error:'Action title is required'});
    const action=await db.insert('revenue_sprint_actions',{
      id:id('rsa_action'),sprint_id:account.sprint_id,account_id:account.id,action_date:dateOnly(req.body.action_date||req.body.actionDate)||todayUtc(),
      title,action_type:text(req.body.action_type||req.body.actionType,80)||'follow-up',channel:text(req.body.channel,80)||account.contact_channel||'Email',
      priority:text(req.body.priority,40)||'high',status:'todo',result:''
    },false);
    res.status(201).json({action});
  }catch(error){
    res.status(500).json({error:'Revenue action could not be created'});
  }
});

router.patch('/actions/:id',async(req,res)=>{
  try{
    const action=await db.get('revenue_sprint_actions',{eq:{id:text(req.params.id,120)}});
    if(!action)return res.status(404).json({error:'Revenue action not found'});
    const data={updated_at:new Date().toISOString()};
    for(const key of ['title','action_type','channel','priority','status','result'])if(req.body[key]!==undefined)data[key]=text(req.body[key],key==='result'?4000:1000);
    if(req.body.action_date!==undefined)data.action_date=dateOnly(req.body.action_date);
    await db.update('revenue_sprint_actions',action.id,data);
    res.json({action:await db.get('revenue_sprint_actions',{eq:{id:action.id}})});
  }catch(error){
    res.status(500).json({error:'Revenue action could not be updated'});
  }
});

router.patch('/engine/campaigns/:id',async(req,res)=>{
  try{
    const campaign=await db.get('revenue_engine_campaigns',{eq:{id:text(req.params.id,120)}});
    if(!campaign)return res.status(404).json({error:'Revenue campaign not found'});
    const data={updated_at:new Date().toISOString()};
    for(const key of ['status','success_metric','notes'])if(req.body[key]!==undefined)data[key]=text(req.body[key],key==='notes'?5000:1000);
    if(req.body.target_cash_usd!==undefined)data.target_cash_usd=Math.max(0,num(req.body.target_cash_usd));
    if(req.body.target_accounts!==undefined)data.target_accounts=Math.max(0,Math.round(num(req.body.target_accounts)));
    if(req.body.starts_on!==undefined)data.starts_on=dateOnly(req.body.starts_on);
    if(req.body.ends_on!==undefined)data.ends_on=dateOnly(req.body.ends_on);
    await db.update('revenue_engine_campaigns',campaign.id,data);
    res.json({campaign:await db.get('revenue_engine_campaigns',{eq:{id:campaign.id}})});
  }catch(error){
    console.error('[RevenueEngine] update campaign failed:',error.message);
    res.status(500).json({error:'Revenue campaign could not be updated'});
  }
});

router.patch('/engine/experiments/:id',async(req,res)=>{
  try{
    const experiment=await db.get('revenue_engine_experiments',{eq:{id:text(req.params.id,120)}});
    if(!experiment)return res.status(404).json({error:'Revenue experiment not found'});
    const data={updated_at:new Date().toISOString()};
    for(const key of ['status','success_threshold','result'])if(req.body[key]!==undefined)data[key]=text(req.body[key],key==='result'?5000:1500);
    if(req.body.starts_on!==undefined)data.starts_on=dateOnly(req.body.starts_on);
    if(req.body.ends_on!==undefined)data.ends_on=dateOnly(req.body.ends_on);
    await db.update('revenue_engine_experiments',experiment.id,data);
    res.json({experiment:await db.get('revenue_engine_experiments',{eq:{id:experiment.id}})});
  }catch(error){
    console.error('[RevenueEngine] update experiment failed:',error.message);
    res.status(500).json({error:'Revenue experiment could not be updated'});
  }
});

module.exports={revenueSprintRouter:router,summarizeAccounts,stageToOpportunityStage,dayDiffInclusive,boundedPct,latestSprint,loadAccounts,loadActions,loadRevenueEngine,loadRevenuePlan,dateOnly};
