'use strict';

const db=require('./db');
const {rankItems,buildReason}=require('./priority');

const TIMEZONE='Africa/Kampala';
const UTC_OFFSET='+03:00';

const FIXED_BLOCKS=[
  {key:'learning',title:'Cloud and Infrastructure Study',start:'07:30',end:'09:30',type:'learning',notes:'Protected learning: 40 min learn, 60 min hands-on lab, 20 min runbook/notes.'},
  {key:'break-am',title:'Break',start:'09:30',end:'09:45',type:'break',notes:'Step away from the desk. Water, stretch and reset.'},
  {key:'lunch',title:'Lunch and walk',start:'12:15',end:'13:00',type:'break',notes:'Lunch away from the desk plus a short walk.'},
  {key:'break-pm',title:'Break',start:'15:00',end:'15:15',type:'break',notes:'Short reset before collaboration and admin.'},
  {key:'break-close',title:'Break',start:'16:45',end:'17:00',type:'break',notes:'Transition break before closing the workday.'},
  {key:'closeout',title:'Daily close-out',start:'17:00',end:'17:45',type:'review',notes:'Close loops, clear urgent correspondence, capture carry-over and set tomorrow up.'},
  {key:'exercise',title:'Exercise',start:'17:45',end:'18:30',type:'exercise',notes:'Protected movement: strength, cardio or mobility. Keep the block even on busy days.'}
];

const WORK_WINDOWS=[
  {key:'deep-work-1',mode:'deep_work',start:'09:45',end:'12:15'},
  {key:'deep-work-2',mode:'deep_work',start:'13:00',end:'15:00'},
  {key:'execution',mode:'execution',start:'15:15',end:'16:45'}
];

function localParts(now=new Date()){
  const dateFmt=new Intl.DateTimeFormat('en-CA',{timeZone:TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'});
  const weekdayFmt=new Intl.DateTimeFormat('en-US',{timeZone:TIMEZONE,weekday:'short'});
  return{date:dateFmt.format(now),weekday:weekdayFmt.format(now)};
}

function instant(date,time){return new Date(`${date}T${time}:00${UTC_OFFSET}`);}
function isWeekday(name){return['Mon','Tue','Wed','Thu','Fri'].includes(name);}

async function ensureFixedBlocks(date){
  for(const block of FIXED_BLOCKS){
    const id=`weekday-plan-${date}-${block.key}`;
    const starts=instant(date,block.start).toISOString();
    const ends=instant(date,block.end).toISOString();
    await db.query(`
      INSERT INTO calendar_events(id,title,date,project,type,done,source,notes,starts_at,ends_at,all_day,updated_at)
      VALUES($1,$2,$3,'Personal Operating System',$4,FALSE,'jakeos-day-planner',$5,$6,$7,FALSE,NOW())
      ON CONFLICT(id) DO UPDATE SET
        title=EXCLUDED.title,date=EXCLUDED.date,project=EXCLUDED.project,type=EXCLUDED.type,
        done=FALSE,source=EXCLUDED.source,notes=EXCLUDED.notes,starts_at=EXCLUDED.starts_at,
        ends_at=EXCLUDED.ends_at,all_day=FALSE,updated_at=NOW()
    `,[id,block.title,date,block.type,block.notes,starts,ends]);
  }
}

function subtractBusy(start,end,busy){
  const clipped=busy
    .map(row=>({start:new Date(row.start),end:new Date(row.end)}))
    .filter(row=>row.start<end&&row.end>start)
    .map(row=>({start:row.start<start?start:row.start,end:row.end>end?end:row.end}))
    .sort((a,b)=>a.start-b.start);
  const merged=[];
  for(const block of clipped){
    const last=merged[merged.length-1];
    if(last&&block.start<=last.end)last.end=new Date(Math.max(last.end,block.end));
    else merged.push({...block});
  }
  const slots=[];
  let cursor=start;
  for(const block of merged){
    if(block.start>cursor)slots.push({start:new Date(cursor),end:new Date(block.start)});
    if(block.end>cursor)cursor=block.end;
  }
  if(cursor<end)slots.push({start:new Date(cursor),end:new Date(end)});
  return slots.filter(slot=>(slot.end-slot.start)>=30*60000);
}

async function busyForDate(date){
  const start=instant(date,'07:30').toISOString(),end=instant(date,'18:30').toISOString();
  const result=await db.query(`
    SELECT starts_at AS start,ends_at AS end
    FROM calendar_events
    WHERE starts_at IS NOT NULL AND ends_at IS NOT NULL
      AND starts_at < $2 AND ends_at > $1
      AND source <> 'jakeos-day-planner'
    UNION ALL
    SELECT scheduled_start AS start,scheduled_end AS end
    FROM work_items
    WHERE scheduled_start IS NOT NULL AND scheduled_end IS NOT NULL
      AND scheduled_start < $2 AND scheduled_end > $1
      AND status NOT IN ('done','cancelled')
      AND COALESCE(metadata->'day_plan'->>'auto','false') <> 'true'
  `,[start,end]);
  return result.rows;
}

async function clearPreviousAutoPlan(date){
  await db.query(`
    UPDATE work_items
    SET scheduled_start=NULL,scheduled_end=NULL,
        metadata=COALESCE(metadata,'{}'::jsonb)-'day_plan',
        updated_at=NOW(),version=version+1
    WHERE status NOT IN ('done','cancelled')
      AND metadata->'day_plan'->>'auto'='true'
      AND metadata->'day_plan'->>'date'=$1
  `,[date]);
}

async function candidates(now=new Date()){
  const result=await db.query(`
    SELECT wi.*,p.name AS project_name,p.emoji AS project_emoji
    FROM work_items wi
    LEFT JOIN projects p ON p.id=wi.project_id
    WHERE wi.status NOT IN ('done','cancelled')
      AND (wi.deferred_until IS NULL OR wi.deferred_until <= $1)
      AND wi.scheduled_start IS NULL
      AND NOT wi.blocked
      AND wi.status <> 'waiting'
    ORDER BY wi.pinned DESC,wi.due_at NULLS LAST,wi.updated_at ASC
    LIMIT 500
  `,[now.toISOString()]);
  return result.rows;
}

function workSlots(date,busy,mode){
  return WORK_WINDOWS
    .filter(window=>window.mode===mode)
    .flatMap(window=>subtractBusy(instant(date,window.start),instant(date,window.end),busy)
      .map(slot=>({...slot,window:window.key,mode})));
}

async function scheduleItems(items,slots,date,mode,used){
  const scheduled=[];
  for(const item of items){
    if(used.has(item.id))continue;
    const estimate=Math.max(15,Math.min(180,Number(item.estimated_minutes||30)));
    const slot=slots.find(value=>(value.end-value.start)>=estimate*60000);
    if(!slot)continue;
    const start=new Date(slot.start),end=new Date(start.getTime()+estimate*60000);
    const meta={
      auto:'true',date,mode,window:slot.window,reason:buildReason(item)
    };
    const saved=(await db.query(`
      UPDATE work_items
      SET scheduled_start=$2,scheduled_end=$3,
          status=CASE WHEN status='inbox' THEN 'ready' ELSE status END,
          metadata=COALESCE(metadata,'{}'::jsonb)||jsonb_build_object('day_plan',$4::jsonb),
          updated_at=NOW(),version=version+1
      WHERE id=$1
      RETURNING id,title,scheduled_start,scheduled_end,status,metadata
    `,[item.id,start.toISOString(),end.toISOString(),JSON.stringify(meta)])).rows[0];
    if(saved){
      await db.query('INSERT INTO work_item_events(work_item_id,event_type,payload) VALUES($1,$2,$3::jsonb)',[
        item.id,'auto_scheduled',JSON.stringify({date,mode,start:start.toISOString(),end:end.toISOString(),reason:meta.reason})
      ]);
      scheduled.push(saved);used.add(item.id);slot.start=end;
    }
  }
  return scheduled;
}

async function planWeekday({now=new Date()}={}){
  const {date,weekday}=localParts(now);
  if(!isWeekday(weekday))return{skipped:true,reason:'weekend',date,weekday};

  await clearPreviousAutoPlan(date);
  await ensureFixedBlocks(date);

  const [busy,items]=await Promise.all([busyForDate(date),candidates(now)]);
  const ranked=rankItems(items,{now,limit:120});
  const used=new Set();

  const deepRanked=[...ranked].sort((a,b)=>{
    const aFit=(a.status==='doing'||Number(a.impact)>=4||Number(a.strategic_weight)>=4||Number(a.estimated_minutes)>=45)?1:0;
    const bFit=(b.status==='doing'||Number(b.impact)>=4||Number(b.strategic_weight)>=4||Number(b.estimated_minutes)>=45)?1:0;
    return bFit-aFit||b.priority_score-a.priority_score;
  });
  const deep=await scheduleItems(deepRanked,workSlots(date,busy,'deep_work'),date,'deep_work',used);

  const executionRanked=ranked
    .filter(item=>!used.has(item.id))
    .sort((a,b)=>{
      const aFit=Number(a.estimated_minutes||30)<=90?1:0,bFit=Number(b.estimated_minutes||30)<=90?1:0;
      return bFit-aFit||b.priority_score-a.priority_score;
    });
  const execution=await scheduleItems(executionRanked,workSlots(date,busy,'execution'),date,'execution',used);

  return{
    skipped:false,date,weekday,
    anchors:FIXED_BLOCKS.map(block=>({title:block.title,start:block.start,end:block.end,type:block.type})),
    scheduled:{deep_work:deep,execution},
    unscheduled_ranked:ranked.filter(item=>!used.has(item.id)).slice(0,10).map(item=>({id:item.id,title:item.title,score:item.priority_score,why:buildReason(item)}))
  };
}

module.exports={planWeekday,ensureFixedBlocks,localParts,FIXED_BLOCKS,WORK_WINDOWS};
