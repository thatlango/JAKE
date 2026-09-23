'use strict';

const db=require('./db');
const {commandCenterOverview}=require('./overview');

function object(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
function strip(record,keys){if(!record)return null;return Object.fromEntries(keys.filter(k=>record[k]!==undefined).map(k=>[k,record[k]]));}

async function buildErrandContext(work,{includeOverview=true}={}){
  const metadata=object(work?.metadata);
  const packet={
    generated_at:new Date().toISOString(),
    work:strip(work,['id','title','description','status','priority','impact','strategic_weight','estimated_minutes','due_at','scheduled_start','scheduled_end','project_id','project_name','source','source_ref','tags','metadata']),
    project:null,
    related:{opportunity:null,relationship:null},
    project_work:[],
    market:[],
    executive:null
  };
  if(work?.project_id){
    packet.project=await db.get('projects',{eq:{id:work.project_id}});
    packet.project_work=(await db.query(`SELECT id,title,status,priority,due_at,blocked,blocked_reason,metadata,updated_at
      FROM work_items WHERE project_id=$1 AND status NOT IN('done','cancelled') ORDER BY updated_at DESC LIMIT 30`,[work.project_id])).rows;
  }
  const opportunityId=metadata.opportunity_id||metadata.opportunityId||(work?.source==='opportunity'?work.source_ref:null);
  if(opportunityId)packet.related.opportunity=await db.get('opportunities',{eq:{id:String(opportunityId).slice(0,120)}});
  const relationshipId=metadata.relationship_id||metadata.client_id||metadata.contact_id;
  if(relationshipId)packet.related.relationship=await db.get('clients',{eq:{id:String(relationshipId).slice(0,120)}});

  packet.market=(await db.query(`SELECT id,title,org,stage,fit_score,relevance_score,deadline,value_amount,currency,next_action,
      fit_status,eligibility_status,hard_blockers,strongest_matches,gaps,updated_at
      FROM opportunities WHERE stage NOT IN('Won','Lost','Closed')
      ORDER BY CASE WHEN deadline IS NULL OR deadline='' THEN 1 ELSE 0 END,deadline ASC,fit_score DESC NULLS LAST
      LIMIT 12`)).rows;
  if(includeOverview){
    const overview=await commandCenterOverview();
    packet.executive={
      tasks:overview.tasks,
      pipeline:overview.pipeline,
      invoices:overview.invoices,
      opportunities:overview.opportunities,
      finance:overview.finance,
      attention_signals:(overview.attention_signals||[]).slice(0,10),
      estate:{available:overview.estate?.available,stale:overview.estate?.stale,totals:overview.estate?.totals}
    };
  }
  return packet;
}

module.exports={buildErrandContext};
