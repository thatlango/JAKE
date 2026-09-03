'use strict';
const PRIORITY_BASE={critical:42,high:30,medium:18,low:8};
function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
function asDate(value){const d=value?new Date(value):null;return d&&!Number.isNaN(d.getTime())?d:null;}
function priorityScore(item,now=new Date()){
  const reasons=[];let score=PRIORITY_BASE[String(item.priority||'medium').toLowerCase()]??18;
  const impact=clamp(Number(item.impact||3),1,5),strategic=clamp(Number(item.strategic_weight||3),1,5);
  score+=impact*4+strategic*5;if(impact>=4)reasons.push('high impact');if(strategic>=4)reasons.push('strategically important');
  if(item.pinned){score+=28;reasons.push('pinned by you');}
  if(item.blocked||String(item.status).toLowerCase()==='waiting'){score-=120;reasons.push(item.blocked_reason?`blocked: ${item.blocked_reason}`:'currently blocked');}
  const deferred=asDate(item.deferred_until);if(deferred&&deferred>now){score-=1000;reasons.push('deferred');}
  const due=asDate(item.due_at);if(due){const hours=(due-now)/3600000;if(hours<0){score+=48;reasons.push('overdue');}else if(hours<=6){score+=38;reasons.push('due within 6 hours');}else if(hours<=24){score+=32;reasons.push('due today');}else if(hours<=72){score+=23;reasons.push('due within 3 days');}else if(hours<=168){score+=13;reasons.push('due this week');}}
  const created=asDate(item.created_at);if(created){const ageDays=Math.max(0,(now-created)/86400000),aging=Math.min(10,Math.floor(ageDays/3));score+=aging;if(aging>=4)reasons.push('has been open for a while');}
  const estimate=clamp(Number(item.estimated_minutes||30),5,480);if(estimate<=20){score+=4;reasons.push('quick win');}
  if(String(item.status).toLowerCase()==='doing'){score+=18;reasons.push('already in progress');}
  return{score:Math.round(score),reasons};
}
function rankItems(items,{now=new Date(),limit=7,availableMinutes=null}={}){return items.filter(item=>!['done','cancelled','waiting'].includes(String(item.status||'').toLowerCase())&&!item.blocked).map(item=>{const ranked=priorityScore(item,now);let score=ranked.score;const reasons=[...ranked.reasons];if(availableMinutes&&Number(item.estimated_minutes||30)<=availableMinutes){score+=6;reasons.push('fits the next available work block');}return{...item,priority_score:score,priority_reasons:reasons};}).filter(item=>item.priority_score>-500).sort((a,b)=>b.priority_score-a.priority_score||String(a.due_at||'9999').localeCompare(String(b.due_at||'9999'))).slice(0,limit);}
function buildReason(item){const reasons=item.priority_reasons||[];return reasons.length?reasons.slice(0,3).join(' · '):'Important open work that is currently actionable.';}
function daySlots({date,busy=[],startHour=8,endHour=18,offsetMinutes=180}){const sign=offsetMinutes>=0?'+':'-',abs=Math.abs(offsetMinutes),offset=`${sign}${String(Math.floor(abs/60)).padStart(2,'0')}:${String(abs%60).padStart(2,'0')}`;const start=new Date(`${date}T${String(startHour).padStart(2,'0')}:00:00${offset}`),end=new Date(`${date}T${String(endHour).padStart(2,'0')}:00:00${offset}`);const normalized=busy.map(b=>({start:asDate(b.start),end:asDate(b.end)})).filter(b=>b.start&&b.end&&b.end>start&&b.start<end).map(b=>({start:b.start<start?start:b.start,end:b.end>end?end:b.end})).sort((a,b)=>a.start-b.start);const merged=[];for(const block of normalized){const last=merged[merged.length-1];if(last&&block.start<=last.end)last.end=new Date(Math.max(last.end,block.end));else merged.push({...block});}const slots=[];let cursor=start;for(const block of merged){if(block.start>cursor)slots.push({start:new Date(cursor),end:new Date(block.start)});if(block.end>cursor)cursor=block.end;}if(cursor<end)slots.push({start:new Date(cursor),end});return slots;}
function allocatePlan(items,slots){const plan=[],mutable=slots.map(s=>({start:new Date(s.start),end:new Date(s.end)}));for(const item of items){const mins=clamp(Number(item.estimated_minutes||30),10,180),ms=mins*60000,slot=mutable.find(s=>s.end-s.start>=ms);if(!slot)continue;const start=new Date(slot.start),end=new Date(start.getTime()+ms);plan.push({task_id:item.id,title:item.title,start:start.toISOString(),end:end.toISOString(),estimated_minutes:mins,priority_score:item.priority_score,reason:buildReason(item)});slot.start=end;}return plan;}
module.exports={priorityScore,rankItems,buildReason,daySlots,allocatePlan};
