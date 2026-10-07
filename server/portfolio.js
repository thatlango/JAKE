'use strict';

const express=require('express');
const db=require('./db');
const {rankItems,buildReason}=require('./priority');
const {decorateWorkRows}=require('./agent-work');

const LANES=['SHIP','REVENUE','WORK','LEARN','LAB','PARKED'];
const WIP_LIMITS={SHIP:1,REVENUE:3,WORK:null,LEARN:1,LAB:1,PARKED:null};
const router=express.Router();

function clean(value,max=1000){return String(value??'').trim().slice(0,max);}
function metadataOf(item){return item&&item.metadata&&typeof item.metadata==='object'&&!Array.isArray(item.metadata)?item.metadata:{};}
function normalizeLane(value){
  const lane=clean(value,20).toUpperCase();
  return LANES.includes(lane)?lane:null;
}
function explicitLane(item){
  const meta=metadataOf(item);
  return normalizeLane(meta.portfolio?.lane||meta.portfolio_lane);
}
function haystack(item){
  const meta=metadataOf(item);
  return [
    item?.title,item?.description,item?.project_name,
    ...(Array.isArray(item?.tags)?item.tags:[]),
    meta.outcome_type,meta.market_stage
  ].filter(Boolean).join(' ').toLowerCase();
}
function inferLane(item){
  const fixed=explicitLane(item);
  if(fixed)return fixed;
  if(String(item?.agent_state||'').toLowerCase()==='review')return 'WORK';
  const meta=metadataOf(item),text=haystack(item);
  if(['market','revenue'].includes(String(meta.outcome_type||'').toLowerCase())||
    /\b(bid|proposal|tender|rfp|eoi|sales|revenue|customer|client acquisition|application)\b/.test(text))return 'REVENUE';
  if(/\b(course|study|learning|learn|certification|cloud|infrastructure lab|training module)\b/.test(text))return 'LEARN';
  if(/\b(prudev|gopa|bge|contractual|timesheet|manual review|client delivery|programme delivery)\b/.test(text))return 'WORK';
  if(/\b(lab|prototype|experiment|spike|side quest|side-quest|exploration)\b/.test(text))return 'LAB';
  if(/\b(ship|shipping|release|deploy|deployment|production|cutover|commercial mvp|go-live|go live|launch gate|production readiness)\b/.test(text))return 'SHIP';
  return 'PARKED';
}
function initiativeKey(item){
  if(item.project_id)return 'project:'+String(item.project_id);
  if(item.project_name)return 'project-name:'+String(item.project_name).trim().toLowerCase();
  const meta=metadataOf(item);
  if(meta.initiative)return 'initiative:'+String(meta.initiative).trim().toLowerCase();
  return 'task:'+String(item.id);
}
function initiativeName(item){
  const meta=metadataOf(item);
  return item.project_name||meta.initiative||item.title||'Unassigned work';
}
function laneScore(items,now){
  const ranked=rankItems(items,{now,limit:Math.max(1,items.length)});
  return ranked.length?Number(ranked[0].priority_score||0):0;
}
function applyWipLimits(items,{now=new Date()}={}){
  const decorated=items.map(item=>({...item,portfolio_lane:inferLane(item),portfolio_initiative:initiativeKey(item)}));
  const activeKeys={};
  for(const lane of LANES){
    if(lane==='PARKED'){activeKeys[lane]=new Set();continue;}
    const groups=new Map();
    decorated.filter(item=>item.portfolio_lane===lane).forEach(item=>{
      const key=item.portfolio_initiative;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(item);
    });
    const ordered=[...groups.entries()].map(([key,group])=>({
      key,group,score:laneScore(group,now),
      pinned:group.some(x=>x.pinned),
      doing:group.some(x=>String(x.status||'').toLowerCase()==='doing'),
      due:group.map(x=>x.due_at).filter(Boolean).sort()[0]||'9999'
    })).sort((a,b)=>Number(b.doing)-Number(a.doing)||Number(b.pinned)-Number(a.pinned)||b.score-a.score||String(a.due).localeCompare(String(b.due)));
    const limit=WIP_LIMITS[lane];
    activeKeys[lane]=new Set((limit==null?ordered:ordered.slice(0,limit)).map(x=>x.key));
  }
  return decorated.map(item=>{
    const lane=item.portfolio_lane;
    const active=lane!=='PARKED'&&activeKeys[lane]?.has(item.portfolio_initiative);
    return{
      ...item,
      portfolio_effective_lane:active?lane:'PARKED',
      portfolio_active:!!active,
      portfolio_parked_reason:lane==='PARKED'?'parked explicitly':active?null:`${lane} WIP limit reached`
    };
  });
}
function chooseDailyOutcomes(items,{now=new Date(),limit=3}={}){
  const reviews=items
    .filter(x=>x.portfolio_active&&String(x.agent_state||'').toLowerCase()==='review')
    .map(x=>({...x,why_now:'Agent deliverable ready for your review.'}));
  const active=items.filter(x=>x.portfolio_active&&String(x.agent_state||'').toLowerCase()!=='review'&&!x.blocked&&String(x.status||'').toLowerCase()!=='waiting');
  const ranked=rankItems(active,{now,limit:Math.max(30,active.length)}).map(x=>({...x,why_now:buildReason(x)}));
  const chosen=reviews.slice(0,limit),usedInitiatives=new Set(chosen.map(x=>x.portfolio_initiative));
  const take=(predicate)=>{
    const item=ranked.find(x=>!chosen.some(y=>y.id===x.id)&&!usedInitiatives.has(x.portfolio_initiative)&&predicate(x));
    if(item){chosen.push(item);usedInitiatives.add(item.portfolio_initiative);}
  };
  take(x=>x.portfolio_effective_lane==='SHIP');
  take(x=>['REVENUE','WORK'].includes(x.portfolio_effective_lane));
  while(chosen.length<limit){
    const item=ranked.find(x=>!chosen.some(y=>y.id===x.id)&&!usedInitiatives.has(x.portfolio_initiative));
    if(!item)break;
    chosen.push(item);usedInitiatives.add(item.portfolio_initiative);
  }
  while(chosen.length<limit){
    const item=ranked.find(x=>!chosen.some(y=>y.id===x.id));
    if(!item)break;
    chosen.push(item);
  }
  return chosen.slice(0,limit);
}
function laneSummary(items,lane){
  const laneItems=items.filter(x=>x.portfolio_effective_lane===lane);
  const initiatives=new Map();
  laneItems.forEach(item=>{
    if(!initiatives.has(item.portfolio_initiative))initiatives.set(item.portfolio_initiative,{key:item.portfolio_initiative,name:initiativeName(item),items:[]});
    initiatives.get(item.portfolio_initiative).items.push(item);
  });
  return{
    lane,
    limit:WIP_LIMITS[lane],
    initiative_count:initiatives.size,
    item_count:laneItems.length,
    initiatives:[...initiatives.values()].map(group=>({
      key:group.key,name:group.name,item_count:group.items.length,
      next:rankItems(group.items,{limit:1})[0]?.title||group.items[0]?.title||null
    }))
  };
}
async function openItems(){
  const result=await db.query(`
    SELECT wi.*,p.name AS project_name,p.emoji AS project_emoji
    FROM work_items wi
    LEFT JOIN projects p ON p.id=wi.project_id
    WHERE wi.status NOT IN ('done','cancelled')
      AND (wi.deferred_until IS NULL OR wi.deferred_until <= NOW())
    ORDER BY wi.pinned DESC,wi.due_at NULLS LAST,wi.updated_at DESC
    LIMIT 1000
  `);
  return decorateWorkRows(result.rows);
}
async function portfolioSnapshot({now=new Date()}={}){
  const constrained=applyWipLimits(await openItems(),{now});
  const daily=chooseDailyOutcomes(constrained,{now,limit:3});
  const lanes=Object.fromEntries(LANES.map(lane=>[lane,laneSummary(constrained,lane)]));
  const inferredCounts={};
  for(const lane of LANES)inferredCounts[lane]=new Set(constrained.filter(x=>x.portfolio_lane===lane).map(x=>x.portfolio_initiative)).size;
  const violations=Object.entries(WIP_LIMITS)
    .filter(([,limit])=>limit!=null)
    .map(([lane,limit])=>({lane,limit,count:inferredCounts[lane],excess:Math.max(0,inferredCounts[lane]-limit)}))
    .filter(x=>x.excess>0);
  return{
    generated_at:now.toISOString(),
    operating_rule:'Unlimited interests. Limited work in progress.',
    limits:WIP_LIMITS,
    daily_outcomes:daily,
    lanes,
    violations,
    parked_count:lanes.PARKED.item_count
  };
}

router.get('/',async(_req,res)=>{
  try{res.set('Cache-Control','no-store').json(await portfolioSnapshot());}
  catch(error){res.status(500).json({error:'Portfolio is unavailable',detail:process.env.NODE_ENV==='development'?error.message:undefined});}
});
router.get('/weekly-reset',async(_req,res)=>{
  try{
    const now=new Date(),since=new Date(now.getTime()-7*86400000).toISOString();
    const [snapshot,done]=await Promise.all([
      portfolioSnapshot({now}),
      db.query(`SELECT id,title,project_id,completed_at,metadata FROM work_items WHERE status='done' AND completed_at >= $1 ORDER BY completed_at DESC LIMIT 100`,[since])
    ]);
    res.json({...snapshot,review_window_days:7,completed_last_7d:done.rows});
  }catch(error){res.status(500).json({error:'Weekly portfolio reset is unavailable'});}
});
router.patch('/items/:id',async(req,res)=>{
  try{
    const lane=normalizeLane(req.body.lane);
    if(!lane)return res.status(422).json({error:`lane must be one of ${LANES.join(', ')}`});
    const found=await db.query('SELECT id,status,metadata,title FROM work_items WHERE id=$1 LIMIT 1',[clean(req.params.id,100)]);
    const existing=found.rows[0];
    if(!existing)return res.status(404).json({error:'Work item not found'});
    const current=metadataOf(existing);
    const previous=explicitLane(existing)||inferLane(existing);
    const portfolio={
      ...(current.portfolio&&typeof current.portfolio==='object'?current.portfolio:{}),
      lane,
      bookmark:clean(req.body.bookmark??current.portfolio?.bookmark??existing.title,1500),
      restart_condition:clean(req.body.restart_condition??req.body.restartCondition??current.portfolio?.restart_condition??'',1500),
      note:clean(req.body.note??current.portfolio?.note??'',1500),
      changed_at:new Date().toISOString(),
      previous_lane:previous
    };
    const metadata={...current,portfolio_lane:lane,portfolio};
    const result=await db.query(`
      UPDATE work_items
      SET metadata=$2::jsonb,
          scheduled_start=CASE WHEN $3='PARKED' THEN NULL ELSE scheduled_start END,
          scheduled_end=CASE WHEN $3='PARKED' THEN NULL ELSE scheduled_end END,
          status=CASE WHEN $3='PARKED' AND status='doing' THEN 'ready' ELSE status END,
          updated_at=NOW(),version=version+1
      WHERE id=$1
      RETURNING *
    `,[existing.id,JSON.stringify(metadata),lane]);
    await db.query('INSERT INTO work_item_events(work_item_id,event_type,payload) VALUES($1,$2,$3::jsonb)',[
      existing.id,'portfolio_lane_changed',JSON.stringify({from:previous,to:lane,bookmark:portfolio.bookmark,restart_condition:portfolio.restart_condition})
    ]);
    res.json({item:result.rows[0],portfolio:await portfolioSnapshot()});
  }catch(error){res.status(500).json({error:'Portfolio update failed',detail:process.env.NODE_ENV==='development'?error.message:undefined});}
});

module.exports={portfolioRouter:router,portfolioSnapshot,applyWipLimits,chooseDailyOutcomes,inferLane,normalizeLane,WIP_LIMITS,LANES};
