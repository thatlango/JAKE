'use strict';
const db=require('./db');
const {fetchEstateSnapshot,compactEstate}=require('./estate');

function rowsToObject(rows,key='key',value='count'){
  return Object.fromEntries((rows||[]).map(row=>[row[key]||'Other',Number(row[value]||0)]));
}
async function commandCenterOverview(){
  const[
    taskCounts,workStatusRows,projectRows,pipelineRows,invoiceRows,opportunityRows,opportunityStages,
    briefRows,signals,financeRows,expenseRows,targetRow,financeTrend,activityRows,estateResult
  ]=await Promise.all([
    db.query(`SELECT COUNT(*) FILTER(WHERE status NOT IN('done','cancelled'))::int AS open,
      COUNT(*) FILTER(WHERE status='inbox')::int AS inbox,
      COUNT(*) FILTER(WHERE status='doing')::int AS doing,
      COUNT(*) FILTER(WHERE status NOT IN('done','cancelled') AND due_at<NOW())::int AS overdue,
      COUNT(*) FILTER(WHERE status NOT IN('done','cancelled') AND(blocked=TRUE OR status='waiting'))::int AS blocked,
      COUNT(*) FILTER(WHERE status='done' AND completed_at>=date_trunc('week',NOW()))::int AS completed_this_week
      FROM work_items`),
    db.query(`SELECT COALESCE(NULLIF(status,''),'Other') AS key,COUNT(*)::int AS count
      FROM work_items WHERE status<>'cancelled' GROUP BY 1`),
    db.query(`SELECT p.id,p.name,p.emoji,p.status,p.priority,p.progress,
      COUNT(wi.id) FILTER(WHERE wi.status NOT IN('done','cancelled'))::int AS open_tasks,
      COUNT(wi.id) FILTER(WHERE wi.status NOT IN('done','cancelled') AND wi.due_at<NOW())::int AS overdue_tasks,
      COUNT(wi.id) FILTER(WHERE wi.status NOT IN('done','cancelled') AND(wi.blocked=TRUE OR wi.status='waiting'))::int AS blocked_tasks
      FROM projects p LEFT JOIN work_items wi ON wi.project_id=p.id
      GROUP BY p.id ORDER BY overdue_tasks DESC,blocked_tasks DESC,p.priority,p.name LIMIT 100`),
    db.query(`SELECT COUNT(*) FILTER(WHERE stage NOT IN('Won','Lost','Closed'))::int AS active,
      COALESCE(SUM(value_amount) FILTER(WHERE stage NOT IN('Won','Lost','Closed') AND currency='USD'),0)::numeric AS active_value_usd,
      COUNT(*) FILTER(WHERE stage NOT IN('Won','Lost','Closed') AND deadline IS NOT NULL AND deadline ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' AND deadline::timestamptz BETWEEN NOW() AND NOW()+INTERVAL '14 days')::int AS deadlines_14d
      FROM opportunities`),
    db.query(`SELECT COUNT(*) FILTER(WHERE status IN('Sent','Overdue'))::int AS receivables,
      COALESCE(SUM(total) FILTER(WHERE status IN('Sent','Overdue') AND currency='USD'),0)::numeric AS receivables_value,
      COUNT(*) FILTER(WHERE status IN('Sent','Overdue') AND due_date IS NOT NULL AND due_date<>'' AND due_date::date<CURRENT_DATE)::int AS overdue_count,
      COALESCE(SUM(total) FILTER(WHERE status IN('Sent','Overdue') AND currency='USD' AND due_date IS NOT NULL AND due_date<>'' AND due_date::date<CURRENT_DATE),0)::numeric AS overdue_value
      FROM invoices`),
    db.query(`SELECT COUNT(*) FILTER(WHERE stage NOT IN('Won','Lost','Closed'))::int AS open,
      COUNT(*) FILTER(WHERE stage NOT IN('Won','Lost','Closed') AND (fit_score>=4 OR relevance_score>=75))::int AS high_relevance,
      COUNT(*) FILTER(WHERE stage NOT IN('Won','Lost','Closed') AND deadline IS NOT NULL AND deadline ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' AND deadline::timestamptz BETWEEN NOW() AND NOW()+INTERVAL '14 days')::int AS deadlines_14d
      FROM opportunities`),
    db.query(`SELECT COALESCE(NULLIF(stage,''),'Other') AS key,COUNT(*)::int AS count
      FROM opportunities GROUP BY 1 ORDER BY count DESC`),
    db.query(`SELECT id,brief_date,title,summary,items,watchlist,created_at FROM research_briefs ORDER BY brief_date DESC LIMIT 1`),
    db.query(`SELECT id,signal_type,title,summary,severity,source,source_ref,action_url,due_at,metadata,created_at
      FROM attention_signals WHERE resolved=FALSE
      ORDER BY CASE lower(severity) WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      COALESCE(due_at,created_at) ASC LIMIT 12`),
    db.query(`SELECT status,COALESCE(SUM(amount),0)::numeric AS amount FROM finance_streams WHERE currency='USD' GROUP BY status`),
    db.query(`SELECT COALESCE(SUM(amount),0)::numeric AS monthly_costs_usd FROM expenses WHERE monthly=TRUE AND currency='USD'`),
    db.get('settings',{eq:{key:'finance_targets'}}),
    db.query(`SELECT COALESCE(NULLIF(month,''),'Unscheduled') AS label,
      COALESCE(SUM(amount) FILTER(WHERE currency='USD' AND status IN('Confirmed','Pending')),0)::numeric AS inflow,
      MAX(created_at) AS latest
      FROM finance_streams GROUP BY 1 ORDER BY latest DESC LIMIT 6`),
    db.query(`SELECT e.id,e.event_type,e.payload,e.created_at,w.title,w.status,w.project_id
      FROM work_item_events e JOIN work_items w ON w.id=e.work_item_id
      ORDER BY e.created_at DESC LIMIT 20`),
    fetchEstateSnapshot().catch(error=>({configured:true,available:false,stale:false,snapshot:null,error:error.message,lastSuccessfulAt:null}))
  ]);

  const financeByStatus=Object.fromEntries(financeRows.rows.map(row=>[String(row.status||'').toLowerCase(),Number(row.amount||0)]));
  let targets={quarterly:0,annual:0,currency:'USD'};
  try{if(targetRow?.value)targets={...targets,...JSON.parse(targetRow.value)};}catch{}
  const monthlyCosts=Number(expenseRows.rows[0]?.monthly_costs_usd||0);
  const trend=financeTrend.rows.reverse().map(row=>({label:row.label,inflow:Number(row.inflow||0),outflow:monthlyCosts}));

  return{
    generated_at:new Date().toISOString(),
    tasks:{...(taskCounts.rows[0]||{}),status_counts:rowsToObject(workStatusRows.rows)},
    projects:projectRows.rows,
    pipeline:pipelineRows.rows[0]||{},
    invoices:invoiceRows.rows[0]||{},
    opportunities:{...(opportunityRows.rows[0]||{}),stages:rowsToObject(opportunityStages.rows)},
    finance:{
      confirmed_usd:financeByStatus.confirmed||0,
      pending_usd:financeByStatus.pending||0,
      projected_usd:financeByStatus.projected||0,
      monthly_costs_usd:monthlyCosts,
      quarterly_target_usd:Number(targets.currency==='USD'?targets.quarterly||0:0),
      target_currency:targets.currency||'USD',
      trend
    },
    latest_research_brief:briefRows.rows[0]||null,
    attention_signals:signals.rows,
    recent_activity:activityRows.rows,
    estate:{
      configured:estateResult.configured,
      available:estateResult.available,
      stale:estateResult.stale,
      lastSuccessfulAt:estateResult.lastSuccessfulAt,
      error:estateResult.error||null,
      ...(compactEstate(estateResult.snapshot)||{products:[],commerce:[],totals:{},usageTrend:[]})
    }
  };
}
module.exports={commandCenterOverview};
