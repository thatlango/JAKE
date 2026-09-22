'use strict';

const PRIORITY_BASE={critical:40,high:28,medium:16,low:6};
const MARKET_STAGES={validate:8,sell:18,bid:20,submit:24,deliver:20,collect:26,retain:16};
const MARKET_TERMS=['market','revenue','sales','customer','client','bid','proposal','tender','rfp','application','contract','invoice','collect'];

function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
function asDate(value){const d=value?new Date(value):null;return d&&!Number.isNaN(d.getTime())?d:null;}
function metadataOf(item){return item&&item.metadata&&typeof item.metadata==='object'&&!Array.isArray(item.metadata)?item.metadata:{};}
function tagsOf(item){return Array.isArray(item?.tags)?item.tags.map(x=>String(x).toLowerCase()):[];}
function isMarketFacing(item){
  const meta=metadataOf(item);
  if(['market','revenue'].includes(String(meta.outcome_type||'').toLowerCase()))return true;
  if(tagsOf(item).some(tag=>MARKET_TERMS.includes(tag)))return true;
  const haystack=[item?.title,item?.description,item?.project_name].filter(Boolean).join(' ').toLowerCase();
  return MARKET_TERMS.some(term=>haystack.includes(term));
}
function needsExecutiveDecision(item){
  const meta=metadataOf(item);
  return meta.decision_required===true||String(meta.outcome_type||'').toLowerCase()==='decision'||String(item?.agent_state||'').toLowerCase()==='review';
}
function activeAgentExecution(item){
  const state=String(item?.agent_state||'').toLowerCase();
  return !!item?.agent_name&&['queued','claimed','working','running','waiting'].includes(state);
}

function priorityScore(item,now=new Date()){
  const reasons=[];
  const meta=metadataOf(item);
  const status=String(item.status||'').toLowerCase();
  const executiveDecision=needsExecutiveDecision(item);
  const marketFacing=isMarketFacing(item);
  let score=PRIORITY_BASE[String(item.priority||'medium').toLowerCase()]??16;

  const impact=clamp(Number(item.impact||3),1,5);
  const strategic=clamp(Number(item.strategic_weight||3),1,5);
  score+=impact*3+strategic*4;
  if(impact>=4)reasons.push('high impact');
  if(strategic>=4)reasons.push('strategically important');

  if(executiveDecision){score+=35;reasons.push(item.agent_state==='review'?'agent output needs your review':'needs your decision');}
  if(String(item.agent_state||'').toLowerCase()==='review'){score+=30;}
  if(activeAgentExecution(item)){score-=80;reasons.push('already delegated and executing');}

  if(marketFacing){score+=26;reasons.push('moves market or revenue');}
  const marketStage=String(meta.market_stage||'none').toLowerCase();
  if(MARKET_STAGES[marketStage]){score+=MARKET_STAGES[marketStage];reasons.push(`market stage: ${marketStage}`);}
  const outcome=String(meta.outcome_type||'').toLowerCase();
  if(outcome==='delivery'){score+=12;reasons.push('client/delivery outcome');}
  if(outcome==='internal'){score-=6;}
  if(outcome==='maintenance'){score-=4;}

  if(item.pinned){score+=24;reasons.push('pinned by you');}

  if(item.blocked||status==='waiting'){
    if(executiveDecision){score+=8;reasons.push(item.blocked_reason?`blocked: ${item.blocked_reason}`:'blocked and awaiting a decision');}
    else{score-=120;reasons.push(item.blocked_reason?`blocked: ${item.blocked_reason}`:'currently blocked');}
  }

  const deferred=asDate(item.deferred_until);
  if(deferred&&deferred>now){score-=1000;reasons.push('deferred');}

  const due=asDate(item.due_at);
  if(due){
    const hours=(due-now)/3600000;
    if(hours<0){score+=48;reasons.push('overdue');}
    else if(hours<=6){score+=38;reasons.push('due within 6 hours');}
    else if(hours<=24){score+=32;reasons.push('due today');}
    else if(hours<=72){score+=23;reasons.push('due within 3 days');}
    else if(hours<=168){score+=13;reasons.push('due this week');}
  }

  if(status==='doing'){score+=32;reasons.push('finish what is already in progress');}
  else if(status==='ready'){score+=5;}
  else if(status==='inbox'&&!marketFacing&&!executiveDecision){score-=8;reasons.push('not yet committed');}

  if(meta.completion_definition&&['doing','ready'].includes(status)){score+=6;reasons.push('definition of done is clear');}

  const created=asDate(item.created_at);
  if(created){
    const ageDays=Math.max(0,(now-created)/86400000);
    if(status==='doing'){const momentum=Math.min(6,Math.floor(ageDays/4));score+=momentum;}
    else if((marketFacing||executiveDecision)&&ageDays>=7){score+=Math.min(4,Math.floor(ageDays/7));}
    else if(!due&&ageDays>=14){score-=12;reasons.push('old backlog without current pull');}
  }

  const estimate=clamp(Number(item.estimated_minutes||30),5,480);
  if(estimate<=20&&score>20){score+=3;reasons.push('small enough to close quickly');}

  if(!due&&!marketFacing&&!executiveDecision&&status!=='doing'&&impact<=2&&strategic<=2){
    score-=18;reasons.push('candidate to park or defer');
  }

  return{score:Math.round(score),reasons};
}

function rankItems(items,{now=new Date(),limit=7,availableMinutes=null}={}){
  return items.filter(item=>{
    const status=String(item.status||'').toLowerCase();
    if(['done','cancelled'].includes(status))return false;
    if(needsExecutiveDecision(item))return true;
    return status!=='waiting'&&!item.blocked;
  }).map(item=>{
    const ranked=priorityScore(item,now);
    let score=ranked.score;
    const reasons=[...ranked.reasons];
    if(availableMinutes&&Number(item.estimated_minutes||30)<=availableMinutes){score+=5;reasons.push('fits the next available work block');}
    return{...item,priority_score:score,priority_reasons:reasons};
  }).filter(item=>item.priority_score>-500)
    .sort((a,b)=>b.priority_score-a.priority_score||String(a.due_at||'9999').localeCompare(String(b.due_at||'9999')))
    .slice(0,limit);
}

function buildReason(item){
  const reasons=item.priority_reasons||[];
  return reasons.length?reasons.slice(0,3).join(' · '):'Actionable work tied to completion, market movement or an executive decision.';
}

function daySlots({date,busy=[],startHour=8,endHour=18,offsetMinutes=180}){
  const sign=offsetMinutes>=0?'+':'-',abs=Math.abs(offsetMinutes),offset=`${sign}${String(Math.floor(abs/60)).padStart(2,'0')}:${String(abs%60).padStart(2,'0')}`;
  const start=new Date(`${date}T${String(startHour).padStart(2,'0')}:00:00${offset}`),end=new Date(`${date}T${String(endHour).padStart(2,'0')}:00:00${offset}`);
  const normalized=busy.map(b=>({start:asDate(b.start),end:asDate(b.end)})).filter(b=>b.start&&b.end&&b.end>start&&b.start<end).map(b=>({start:b.start<start?start:b.start,end:b.end>end?end:b.end})).sort((a,b)=>a.start-b.start);
  const merged=[];
  for(const block of normalized){const last=merged[merged.length-1];if(last&&block.start<=last.end)last.end=new Date(Math.max(last.end,block.end));else merged.push({...block});}
  const slots=[];let cursor=start;
  for(const block of merged){if(block.start>cursor)slots.push({start:new Date(cursor),end:new Date(block.start)});if(block.end>cursor)cursor=block.end;}
  if(cursor<end)slots.push({start:new Date(cursor),end});
  return slots;
}
function allocatePlan(items,slots){
  const plan=[],mutable=slots.map(s=>({start:new Date(s.start),end:new Date(s.end)}));
  for(const item of items){
    const mins=clamp(Number(item.estimated_minutes||30),10,180),ms=mins*60000,slot=mutable.find(s=>s.end-s.start>=ms);
    if(!slot)continue;
    const start=new Date(slot.start),end=new Date(start.getTime()+ms);
    plan.push({task_id:item.id,title:item.title,start:start.toISOString(),end:end.toISOString(),estimated_minutes:mins,priority_score:item.priority_score,reason:buildReason(item)});
    slot.start=end;
  }
  return plan;
}

module.exports={priorityScore,rankItems,buildReason,daySlots,allocatePlan,isMarketFacing,needsExecutiveDecision};
