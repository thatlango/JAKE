'use strict';
const cron=require('node-cron');
const db=require('./db');
const gcal=require('./gcal');
const crm=require('./crm');
const radar=require('./radar');
const {sendDeadlineDigest,sendAlert}=require('./alerts');
const {commandCenterOverview}=require('./overview');
const {refreshOperations}=require('./ops');

async function withJobLock(name,fn){
  const pool=db.getPool();
  if(!pool)return{skipped:true,reason:'database-not-configured'};
  const client=await pool.connect();
  let locked=false;
  try{
    const result=await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',[`jakeos-job:${name}`]);
    locked=!!result.rows[0]?.locked;
    if(!locked)return{skipped:true,reason:'already-running'};
    return await fn();
  }finally{
    if(locked)await client.query('SELECT pg_advisory_unlock(hashtext($1))',[`jakeos-job:${name}`]).catch(()=>{});
    client.release();
  }
}

async function syncGoogleCalendar(){
  if(!gcal.isConnected())return{connected:false,count:0};
  const events=await gcal.getAllEvents({days:90});
  for(const e of events){
    await db.insert('calendar_events',{
      id:e.id,title:e.title,date:e.date,project:e.project,type:e.type,done:false,
      source:'google',notes:e.desc||'',starts_at:e.dateTime,ends_at:e.endDateTime||null,
      all_day:e.allDay,external_id:e.id.replace(/^gcal_/,'')
    },true);
  }
  return{connected:true,count:events.length};
}

async function runDailyOperations(){
  return withJobLock('daily',async()=>{
    let calendar={connected:false,count:0};
    try{calendar=await syncGoogleCalendar();}catch(e){console.warn('[Jobs] Google Calendar sync failed:',e.message);}
    let followupResult={sent:0,total:0};
    try{followupResult=await crm.processDueFollowups();}catch(e){console.warn('[Jobs] CRM follow-ups failed:',e.message);}
    const today=new Date().toISOString().slice(0,10);
    const [events,streams,followups,pipeline]=await Promise.all([
      db.all('calendar_events',{eq:{done:false},gte:{date:today},order:{col:'date'},limit:100}),
      db.all('finance_streams',{order:{col:'month'},limit:100}),
      db.all('followups',{eq:{sent:false},lte:{due_date:today},limit:100}),
      db.all('pipeline',{order:{col:'created_at',asc:false},limit:100})
    ]);
    const sent=await sendDeadlineDigest(events,{finance:{streams},followups,pipeline});
    console.log(`[Jobs] daily complete: calendar=${calendar.count}, followups=${followupResult.sent||0}`);
    return{calendar,followups:followupResult,sent};
  });
}

async function runRadarScan(){
  return withJobLock('radar',async()=>{
    const results=await radar.scanAll();
    const added=results.reduce((sum,row)=>sum+Number(row.added||0),0);
    console.log(`[Jobs] Radar complete: ${added} new opportunities`);
    return{added,results};
  });
}

async function runOpsChecks({domains=false}={}){
  return withJobLock(domains?'ops-domains':'ops',async()=>{
    const result=await refreshOperations({domains});
    console.log(`[Jobs] ops complete: ${result.checked} services${domains?' + domains':''}`);
    return result;
  });
}

async function runWeeklyReview(){
  return withJobLock('weekly-review',async()=>{
    const overview=await commandCenterOverview();
    const topSignals=(overview.attention_signals||[]).slice(0,5);
    const estate=overview.estate||{};
    const estateTotals=estate.totals||{};
    const fastest=(estate.products||[]).filter(p=>Number(p.growth7dPercent)>0).sort((a,b)=>Number(b.growth7dPercent)-Number(a.growth7dPercent)).slice(0,3);
    const lines=[
      '🧭 *JakeOS Weekly Review*','',
      `Open work: ${overview.tasks.open||0} · overdue: ${overview.tasks.overdue||0} · blocked: ${overview.tasks.blocked||0}`,
      `Active pipeline: ${overview.pipeline.active||0} · upcoming deadlines: ${overview.pipeline.deadlines_14d||0}`,
      `Receivables: ${overview.invoices.receivables||0} · overdue invoices: ${overview.invoices.overdue_count||0}`,
      `Open opportunities: ${overview.opportunities.open||0} · high relevance: ${overview.opportunities.high_relevance||0}`,
      estate.available?`Tuku estate: ${estateTotals.activeUsers7d||0} active users (7d) · ${estateTotals.ordersActive||0} live orders · UGX ${Number(estateTotals.realizedRevenueUGX||0).toLocaleString('en-UG')} realized`:'Tuku estate telemetry unavailable',
      fastest.length?`Fastest 7d growth: ${fastest.map(p=>`${p.name} +${Number(p.growth7dPercent).toFixed(1)}%`).join(' · ')}`:'',
      topSignals.length?'':'No unresolved attention signals.',
      ...topSignals.map((s,i)=>`${i+1}. ${s.title}${s.summary?` — ${s.summary}`:''}`),'',
      '_Open JakeOS for the full command-center view._'
    ].filter(Boolean);
    const result=await sendAlert({message:lines.join('\n'),subject:'JakeOS Weekly Review',channels:['telegram','email','whatsapp']});
    console.log('[Jobs] weekly review complete');
    return result;
  });
}

function startJobs(){
  if(process.env.NODE_ENV==='test'||String(process.env.JOBS_ENABLED||'true').toLowerCase()==='false'){
    console.log('[Jobs] scheduled jobs disabled');return[];
  }
  const timezone=process.env.JOBS_TIMEZONE||'Africa/Kampala';
  const jobs=[
    cron.schedule('*/5 * * * *',()=>runOpsChecks().catch(e=>console.error('[Jobs] ops failed:',e)),{timezone}),
    cron.schedule('20 */6 * * *',()=>runOpsChecks({domains:true}).catch(e=>console.error('[Jobs] ops domains failed:',e)),{timezone}),
    cron.schedule('0 7 * * *',()=>runDailyOperations().catch(e=>console.error('[Jobs] daily failed:',e)),{timezone}),
    cron.schedule('15 */6 * * *',()=>runRadarScan().catch(e=>console.error('[Jobs] radar failed:',e)),{timezone}),
    cron.schedule('15 7 * * 1',()=>runWeeklyReview().catch(e=>console.error('[Jobs] weekly failed:',e)),{timezone})
  ];
  console.log(`[Jobs] scheduled in ${timezone}: ops every 5m, domain/SSL every 6h, daily 07:00, Radar every 6h, weekly Monday 07:15`);
  setTimeout(()=>runOpsChecks({domains:true}).catch(e=>console.error('[Jobs] initial ops failed:',e)),15000).unref?.();
  return jobs;
}

module.exports={startJobs,runDailyOperations,runRadarScan,runWeeklyReview,runOpsChecks,syncGoogleCalendar,withJobLock};
