'use strict';

const express=require('express');
const db=require('./db');
const openai=require('./openai-errand-runner');
const workspace=require('./google-workspace');
const github=require('./github-executor');
const ops=require('./ops-executor');
const gcal=require('./gcal');
const {capabilitySnapshot}=require('./errand-tools');

const router=express.Router();
const clean=(v,max=4000)=>String(v??'').trim().slice(0,max);

router.get('/status',async(_req,res)=>{
  try{
    const counts=(await db.query(`SELECT state,COUNT(*)::int AS count FROM agent_work_dispatches GROUP BY state`)).rows;
    const executors=await db.all('agent_executor_capabilities',{order:{col:'updated_at',asc:false},limit:50});
    const defaultScopes=['web:search','jakeos:read','work:read','work:write','opportunities:read','opportunities:write','crm:read','crm:write','calendar:read','drive:read','gmail:read','gmail:draft','github:read'];
    res.set('Cache-Control','no-store').json({
      openai:openai.status(),
      connectors:{
        google_calendar:gcal.getStatus(),
        google_workspace:workspace.status(),
        github:{configured:github.configured()},
        ops:{configured:ops.config().configured}
      },
      queue:Object.fromEntries(counts.map(x=>[x.state,Number(x.count||0)])),
      executors,
      tools:capabilitySnapshot(defaultScopes)
    });
  }catch(error){res.status(500).json({error:error.message||'Errand runtime status unavailable'});}
});

router.get('/',async(req,res)=>{
  try{
    const limit=Math.max(1,Math.min(Number(req.query.limit)||100,300));
    const values=[];let where='';
    if(req.query.state){values.push(clean(req.query.state,40));where='WHERE d.state=$1';}
    values.push(limit);
    const rows=(await db.query(`SELECT d.*,w.title AS work_title,w.status AS work_status,p.name AS project_name
      FROM agent_work_dispatches d JOIN work_items w ON w.id=d.work_item_id
      LEFT JOIN projects p ON p.id=w.project_id ${where}
      ORDER BY d.updated_at DESC LIMIT $${values.length}`,values)).rows;
    res.json({errands:rows});
  }catch(error){res.status(500).json({error:'Errands could not be loaded'});}
});

router.get('/:id',async(req,res)=>{
  try{
    const id=clean(req.params.id,120);
    const dispatch=await db.get('agent_work_dispatches',{eq:{id}});
    if(!dispatch)return res.status(404).json({error:'Errand not found'});
    const[work,run,audit,artifacts,decisions,notifications]=await Promise.all([
      db.get('work_items',{eq:{id:dispatch.work_item_id}}),
      db.get('agent_runs',{eq:{id:dispatch.run_id}}),
      db.all('agent_tool_audit',{eq:{dispatch_id:id},order:{col:'started_at',asc:false},limit:200}),
      db.all('agent_artifact_versions',{eq:{dispatch_id:id},order:{col:'created_at',asc:false},limit:200}),
      db.all('agent_decisions',{eq:{run_id:dispatch.run_id},order:{col:'created_at',asc:false},limit:100}),
      db.all('agent_notifications',{eq:{dispatch_id:id},order:{col:'created_at',asc:false},limit:100})
    ]);
    res.set('Cache-Control','no-store').json({dispatch,work,run,audit,artifacts,decisions,notifications});
  }catch(error){res.status(500).json({error:'Errand detail could not be loaded'});}
});

router.get('/:id/artifacts/:artifactId',async(req,res)=>{
  try{
    const row=await db.get('agent_artifact_versions',{eq:{id:clean(req.params.artifactId,120)}});
    if(!row||row.dispatch_id!==clean(req.params.id,120))return res.status(404).json({error:'Artifact not found'});
    res.set('Cache-Control','no-store');
    if(row.content_text!==null&&row.content_text!==undefined)return res.type(row.media_type||'text/plain').send(row.content_text);
    return res.type('application/json').send(JSON.stringify(row.content_json??{}));
  }catch(error){res.status(500).json({error:'Artifact could not be opened'});}
});

router.post('/:id/retry',async(req,res)=>{
  try{
    const id=clean(req.params.id,120),dispatch=await db.get('agent_work_dispatches',{eq:{id}});
    if(!dispatch)return res.status(404).json({error:'Errand not found'});
    if(dispatch.state==='approval')return res.status(409).json({error:'Resolve the pending approval instead of retrying this errand.'});
    if(dispatch.state==='completed')return res.status(409).json({error:'Completed errands are immutable. Create a revision from Work instead.'});
    await db.update('agent_work_dispatches',id,{state:'queued',executor_id:null,lease_expires_at:null,claimed_at:null,failure_reason:null,response_state:'retry_queued',pending_action:null,updated_at:new Date().toISOString()});
    await db.query(`UPDATE work_items SET status='ready',blocked=FALSE,blocked_reason='',updated_at=NOW(),last_touched_at=NOW(),version=version+1 WHERE id=$1`,[dispatch.work_item_id]);
    await db.query(`UPDATE agent_runs SET status='queued',progress=0,blockers_count=0,completed_at=NULL,updated_at=NOW() WHERE id=$1`,[dispatch.run_id]);
    res.json({errand:await db.get('agent_work_dispatches',{eq:{id}})});
  }catch(error){res.status(500).json({error:'Errand could not be retried'});}
});

router.post('/:id/cancel',async(req,res)=>{
  try{
    const id=clean(req.params.id,120),dispatch=await db.get('agent_work_dispatches',{eq:{id}});
    if(!dispatch)return res.status(404).json({error:'Errand not found'});
    if(dispatch.state==='completed')return res.status(409).json({error:'Completed errands cannot be cancelled.'});
    await db.update('agent_work_dispatches',id,{state:'cancelled',executor_id:null,lease_expires_at:null,failure_reason:clean(req.body?.reason,2000)||'Cancelled by user',updated_at:new Date().toISOString()});
    await db.query(`UPDATE work_items SET status='ready',blocked=FALSE,blocked_reason='',updated_at=NOW(),last_touched_at=NOW(),version=version+1 WHERE id=$1`,[dispatch.work_item_id]);
    await db.query(`UPDATE agent_runs SET status='failed',blockers_count=0,updated_at=NOW() WHERE id=$1`,[dispatch.run_id]);
    res.json({errand:await db.get('agent_work_dispatches',{eq:{id}})});
  }catch(error){res.status(500).json({error:'Errand could not be cancelled'});}
});

module.exports={errandRouter:router};
