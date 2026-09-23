'use strict';
const crypto=require('crypto');
const express=require('express');
const db=require('./db');

const estateTelemetryRouter=express.Router();

function authorized(provided){
  const expected=String(process.env.TUKU_ESTATE_INSIGHTS_SECRET||'');
  const supplied=String(provided||'');
  if(!expected||!supplied||expected.length!==supplied.length)return false;
  try{return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(supplied));}catch{return false;}
}

estateTelemetryRouter.get('/',async(req,res)=>{
  if(!authorized(req.get('x-tuku-insights-key'))){
    return res.status(401).json({error:{code:'ESTATE_TELEMETRY_UNAUTHORIZED',message:'Telemetry credential is invalid.'}});
  }
  try{
    const [work,agents,dispatches,lastWork,lastAgent,opportunities]=await Promise.all([
      db.query(`SELECT
        count(*)::int total,
        count(*) FILTER(WHERE status='ready')::int ready,
        count(*) FILTER(WHERE status='doing')::int doing,
        count(*) FILTER(WHERE status='waiting')::int waiting,
        count(*) FILTER(WHERE status='done')::int done,
        count(*) FILTER(WHERE blocked)::int blocked
        FROM work_items`),
      db.query(`SELECT
        count(*) FILTER(WHERE status IN ('queued','in_progress','verification','blocked'))::int active,
        count(*) FILTER(WHERE status='blocked')::int blocked
        FROM agent_runs`),
      db.query(`SELECT
        count(*) FILTER(WHERE state='queued')::int queued,
        count(*) FILTER(WHERE state='working')::int working,
        count(*) FILTER(WHERE state='review')::int review,
        count(*) FILTER(WHERE state IN ('blocked','failed'))::int blocked
        FROM agent_work_dispatches`),
      db.query(`SELECT max(last_touched_at) last_work_at FROM work_items`),
      db.query(`SELECT max(event_at) last_agent_event_at FROM agent_events`),
      db.query(`SELECT
        count(*)::int total,
        count(*) FILTER(WHERE status IS NULL OR status NOT IN ('dismissed','closed','expired'))::int open
        FROM opportunities`).catch(()=>({rows:[{total:0,open:0}]}))
    ]);
    const w=work.rows[0]||{},a=agents.rows[0]||{},d=dispatches.rows[0]||{},o=opportunities.rows[0]||{};
    res.json({
      productCode:'jakeos',
      generatedAt:new Date().toISOString(),
      kpis:{
        workItems:Number(w.total||0),
        workReady:Number(w.ready||0),
        workDoing:Number(w.doing||0),
        workWaiting:Number(w.waiting||0),
        workDone:Number(w.done||0),
        workBlocked:Number(w.blocked||0),
        agentRunsActive:Number(a.active||0),
        agentRunsBlocked:Number(a.blocked||0),
        agentDispatchQueued:Number(d.queued||0),
        agentDispatchWorking:Number(d.working||0),
        agentDispatchReview:Number(d.review||0),
        agentDispatchBlocked:Number(d.blocked||0),
        opportunities:Number(o.total||0),
        opportunitiesOpen:Number(o.open||0)
      },
      activity:{
        lastWorkAt:lastWork.rows[0]?.last_work_at?new Date(lastWork.rows[0].last_work_at).toISOString():null,
        lastAgentEventAt:lastAgent.rows[0]?.last_agent_event_at?new Date(lastAgent.rows[0].last_agent_event_at).toISOString():null
      }
    });
  }catch(error){
    console.error('[EstateTelemetry] failed:',error.message);
    res.status(500).json({error:{code:'ESTATE_TELEMETRY_FAILED',message:'JakeOS telemetry could not be loaded.'}});
  }
});

module.exports={estateTelemetryRouter};
