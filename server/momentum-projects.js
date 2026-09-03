'use strict';
const express=require('express');
const rateLimit=require('express-rate-limit');
const db=require('./db');
const {momentumAuth}=require('./momentum-auth');

const router=express.Router();
router.use(rateLimit({windowMs:60000,limit:120,standardHeaders:'draft-7',legacyHeaders:false}));
router.use(momentumAuth());

function clampLimit(raw,fallback=100,max=300){
  const value=Number(raw);
  return Number.isFinite(value)?Math.max(1,Math.min(max,Math.round(value))):fallback;
}

router.get('/',async(req,res)=>{
  const limit=clampLimit(req.query.limit,100,300);
  const result=await db.query(`
    SELECT
      p.id,p.name,p.emoji,p.description,p.status,p.priority,p.color,p.progress,p.updated_at,
      count(wi.id) FILTER (WHERE wi.status NOT IN ('done','cancelled'))::int AS open_tasks,
      count(wi.id) FILTER (WHERE wi.status='doing')::int AS doing_tasks,
      count(wi.id) FILTER (WHERE wi.status='waiting' OR wi.blocked=TRUE)::int AS blocked_tasks,
      count(wi.id) FILTER (WHERE wi.status='done')::int AS completed_tasks,
      min(wi.due_at) FILTER (WHERE wi.status NOT IN ('done','cancelled') AND wi.due_at IS NOT NULL) AS next_due_at,
      max(wi.updated_at) AS last_task_activity_at
    FROM projects p
    LEFT JOIN work_items wi ON wi.project_id=p.id
    GROUP BY p.id,p.name,p.emoji,p.description,p.status,p.priority,p.color,p.progress,p.updated_at
    ORDER BY
      CASE lower(coalesce(p.priority,'')) WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
      blocked_tasks DESC,
      next_due_at NULLS LAST,
      p.name
    LIMIT $1
  `,[limit]);
  res.json({projects:result.rows});
});

router.get('/:id',async(req,res)=>{
  const projectId=String(req.params.id||'').trim().slice(0,120);
  const project=(await db.query(`
    SELECT id,name,emoji,description,status,priority,color,progress,updated_at
    FROM projects WHERE id=$1 LIMIT 1
  `,[projectId])).rows[0];
  if(!project)return res.status(404).json({error:'Project not found'});
  const tasks=await db.query(`
    SELECT id,project_id,parent_id,title,description,status,priority,impact,strategic_weight,
      estimated_minutes,due_at,scheduled_start,scheduled_end,deferred_until,blocked,blocked_reason,
      pinned,context_url,source,source_ref,tags,metadata,completed_at,last_touched_at,version,created_at,updated_at
    FROM work_items
    WHERE project_id=$1
    ORDER BY
      CASE status WHEN 'doing' THEN 0 WHEN 'ready' THEN 1 WHEN 'inbox' THEN 2 WHEN 'waiting' THEN 3 WHEN 'done' THEN 4 ELSE 5 END,
      pinned DESC,due_at NULLS LAST,updated_at DESC
    LIMIT 300
  `,[projectId]);
  const summary=tasks.rows.reduce((acc,item)=>{
    acc.total++;
    if(item.status==='done')acc.completed++;
    else if(item.status!=='cancelled')acc.open++;
    if(item.status==='doing')acc.doing++;
    if(item.status==='waiting'||item.blocked)acc.blocked++;
    return acc;
  },{total:0,open:0,doing:0,blocked:0,completed:0});
  res.json({project,summary,tasks:tasks.rows});
});

module.exports={momentumProjectsRouter:router};
