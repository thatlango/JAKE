import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Icon, Metric, PageHeader, Panel, Pill, StateBanner, formatDate, relativeDate } from '../components/ProductUI';
import { Drawer, FormField } from '../components/InteractionUI';
import './Agents.css';

const num=value=>Number.isFinite(Number(value))?Number(value):0;
const titleCase=value=>String(value||'').replace(/[_-]+/g,' ').replace(/\b\w/g,m=>m.toUpperCase());
const tone=value=>{
  if(['working','completed','in_progress'].includes(value))return 'success';
  if(['blocked','failed','stale'].includes(value))return 'danger';
  if(['waiting','queued','verification','review'].includes(value))return 'warning';
  return 'neutral';
};
const FALLBACK_AGENTS=[
  {id:'command-orchestrator',name:'Command Orchestrator',description:'Plan and coordinate multi-step work.'},
  {id:'opportunity-watch',name:'Opportunity Watch',description:'Find and verify opportunities.'},
  {id:'bid-partnerships',name:'Bid & Partnerships',description:'Prepare bids, proposals and partner material.'},
  {id:'document-knowledge',name:'Document & Knowledge',description:'Draft and structure documents.'},
  {id:'assurance-reviewer',name:'Independent Assurance',description:'Review evidence, claims and quality.'}
];
const queueMeta={
  'needs-you':{label:'Needs you',states:['review','blocked','failed']},
  'in-motion':{label:'In motion',states:['queued','working']},
  done:{label:'Done',states:['completed']}
};

export default function Agents({openAI,navigate}){
  const[state,setState]=useState({overview:null,runs:[],decisions:[],delegated:[],catalog:FALLBACK_AGENTS});
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');
  const[notice,setNotice]=useState('');
  const[live,setLive]=useState('connecting');
  const[filter,setFilter]=useState('needs-you');
  const[selectedId,setSelectedId]=useState(null);
  const[delegate,setDelegate]=useState({request:'',agent_id:'',deliverable_type:'',priority:'high'});
  const[submitting,setSubmitting]=useState(false);
  const[reviewBusy,setReviewBusy]=useState(false);
  const[feedback,setFeedback]=useState('');
  const[revisionAgent,setRevisionAgent]=useState('');

  const load=useCallback(async({silent=false}={})=>{
    if(!silent)setLoading(true);
    const specs=[
      ['overview','/api/agents/overview'],
      ['runs','/api/agents/runs?limit=20'],
      ['decisions','/api/agents/decisions?status=open'],
      ['delegated','/api/agents/work?limit=80'],
      ['catalog','/api/agents/catalog']
    ];
    const results=await Promise.allSettled(specs.map(async([key,url])=>{
      const r=await fetch(url,{headers:{Accept:'application/json'}});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||(url+' returned '+r.status));
      return[key,d];
    }));
    const failures=[],patch={};
    results.forEach((result,index)=>{
      const key=specs[index][0];
      if(result.status==='rejected'){failures.push(result.reason?.message||key+' unavailable');return;}
      const data=result.value[1];
      if(key==='overview')patch.overview=data;
      if(key==='runs')patch.runs=data.runs||[];
      if(key==='decisions')patch.decisions=data.decisions||[];
      if(key==='delegated')patch.delegated=data.dispatches||[];
      if(key==='catalog')patch.catalog=data.agents?.length?data.agents:FALLBACK_AGENTS;
    });
    setState(prev=>({...prev,...patch}));
    setError(failures.length===specs.length?'Agent workspace is unavailable.':failures.length?'Some agent data is temporarily unavailable: '+failures.join(' · '):'');
    if(!silent)setLoading(false);
  },[]);

  useEffect(()=>{load();},[load]);
  useEffect(()=>{
    let stream;
    try{
      stream=new EventSource('/api/agents/events/stream');
      stream.addEventListener('connected',()=>setLive('live'));
      stream.addEventListener('agent-event',event=>{
        setLive('live');
        try{
          const next=JSON.parse(event.data);
          setState(prev=>{
            if(!prev.overview)return prev;
            const activity=[next,...(prev.overview.activity||[]).filter(item=>item.id!==next.id)].slice(0,40);
            const agents=(prev.overview.agents||[]).map(agent=>agent.id===next.agent_id?{...agent,state:next.state||agent.state,last_seen_at:next.event_at||next.created_at,summary:next.summary,run_id:next.run_id||agent.run_id}:agent);
            return{...prev,overview:{...prev.overview,activity,agents}};
          });
          setTimeout(()=>load({silent:true}),250);
        }catch{}
      });
      stream.onerror=()=>setLive('reconnecting');
    }catch{setLive('unavailable');}
    return()=>stream?.close();
  },[load]);

  const overview=state.overview||{},totals=overview.totals||{},agents=overview.agents||[],activity=overview.activity||[];
  const activeAgents=agents.filter(agent=>agent.state||agent.current_work);
  const activeRun=state.runs.find(run=>['in_progress','verification','blocked'].includes(run.status))||state.runs[0]||null;
  const groups=useMemo(()=>activeAgents.reduce((acc,agent)=>{const key=agent.group||'Other';(acc[key]??=[]).push(agent);return acc;},{}),[activeAgents]);
  const counts=useMemo(()=>Object.fromEntries(Object.entries(queueMeta).map(([key,meta])=>[key,state.delegated.filter(item=>meta.states.includes(item.state)).length])),[state.delegated]);
  const queueItems=state.delegated.filter(item=>queueMeta[filter].states.includes(item.state));
  const selected=state.delegated.find(item=>item.id===selectedId)||null;

  useEffect(()=>{
    if(!selected){setFeedback('');setRevisionAgent('');return;}
    setFeedback('');
    setRevisionAgent(selected.requested_agent_id||'');
  },[selectedId,selected?.requested_agent_id]);

  const submitDelegation=async e=>{
    e?.preventDefault();
    const request=delegate.request.trim();
    if(!request){setNotice('Describe the outcome you want the agent to produce.');return;}
    setSubmitting(true);setNotice('');setError('');
    try{
      const r=await fetch('/api/jake/delegate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        request_id:globalThis.crypto?.randomUUID?.()||('agent_'+Date.now()),
        request,
        module:'agents',
        agent_id:delegate.agent_id||null,
        deliverable_type:delegate.deliverable_type||null,
        priority:delegate.priority
      })});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'Could not delegate work.');
      setDelegate(v=>({...v,request:''}));
      setNotice('Assigned to '+d.dispatch.requested_agent_name+'. It is now in canonical Work.');
      await load({silent:true});
      setFilter('in-motion');
      setSelectedId(d.dispatch.id);
    }catch(err){setError(err.message);}
    setSubmitting(false);
  };

  const acceptSelected=async()=>{
    if(!selected||selected.state!=='review')return;
    setReviewBusy(true);setError('');
    try{
      const r=await fetch('/api/work/items/'+encodeURIComponent(selected.work_item_id)+'/agent/accept',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'Could not accept this result.');
      setNotice('Result accepted. The Work item is complete.');
      await load({silent:true});
      setSelectedId(null);
      setFilter('done');
    }catch(err){setError(err.message);}
    setReviewBusy(false);
  };

  const reviseSelected=async()=>{
    if(!selected||!['review','blocked','failed'].includes(selected.state))return;
    const note=feedback.trim();
    if(!note){setNotice('Add clear revision or redirect instructions first.');return;}
    setReviewBusy(true);setError('');setNotice('');
    try{
      const r=await fetch('/api/work/items/'+encodeURIComponent(selected.work_item_id)+'/agent/revise',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({feedback:note,agent_id:revisionAgent||null})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'Could not request the revision.');
      setNotice('Revision queued with '+d.dispatch.requested_agent_name+'.');
      setFeedback('');
      await load({silent:true});
      setSelectedId(null);
      setFilter('in-motion');
    }catch(err){setError(err.message);}
    setReviewBusy(false);
  };

  const copyResult=async()=>{
    const text=selected?.result_content||selected?.result_summary||'';
    if(!text)return;
    try{await navigator.clipboard.writeText(text);setNotice('Agent output copied.');}
    catch{setNotice('Copy was blocked by the browser. Open the Work item to use the result.');}
  };

  return <div className="module agents-page">
    <PageHeader eyebrow="Agent OS" title="Agents" subtitle="Delegate work, watch execution, review outputs and close the loop without leaving this workspace." actions={<div className="agents-actions">
      <span className={'agents-live agents-live--'+live}><i/>{live==='live'?'Live':live==='reconnecting'?'Reconnecting':live==='unavailable'?'Unavailable':'Connecting'}</span>
      <Button variant="secondary" icon="refresh" onClick={()=>load()}>Refresh</Button>
      <Button icon="spark" onClick={()=>openAI('Review the current agent workspace. Tell me what needs my review, what is blocked, and what I should delegate next.')}>Ask Jake</Button>
    </div>}/>

    {error&&<StateBanner tone="danger" title="Agent workspace needs attention">{error}</StateBanner>}
    {notice&&<StateBanner tone="info" title="Agent workspace">{notice}</StateBanner>}

    <Panel className="agents-delegate" title="Delegate work" subtitle="Describe the outcome. Jake can choose the agent, or you can route it yourself. Every delegation becomes canonical Work.">
      <form onSubmit={submitDelegation}>
        <FormField label="What should the agent deliver?" required description="Write the outcome and useful context. You do not need to turn it into a perfect prompt.">
          <textarea rows="4" value={delegate.request} onChange={e=>setDelegate(v=>({...v,request:e.target.value}))} placeholder="Example: Prepare a two-page partner brief for the youth entrepreneurship programme using our existing evidence. Include the offer, delivery model, proof points and the next ask."/>
        </FormField>
        <div className="agents-delegate-grid">
          <FormField label="Agent" description={delegate.agent_id?(state.catalog.find(a=>a.id===delegate.agent_id)?.description||'Selected agent'):'Jake routes from the request.'}>
            <select value={delegate.agent_id} onChange={e=>setDelegate(v=>({...v,agent_id:e.target.value}))}>
              <option value="">Jake chooses</option>
              {state.catalog.map(agent=><option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
          </FormField>
          <FormField label="Deliverable">
            <select value={delegate.deliverable_type} onChange={e=>setDelegate(v=>({...v,deliverable_type:e.target.value}))}>
              <option value="">Auto detect</option><option value="draft">Draft</option><option value="research">Research</option><option value="proposal">Proposal</option><option value="report">Report</option><option value="review">Review</option>
            </select>
          </FormField>
          <FormField label="Priority">
            <select value={delegate.priority} onChange={e=>setDelegate(v=>({...v,priority:e.target.value}))}>
              <option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </select>
          </FormField>
          <div className="agents-delegate-submit"><Button type="submit" icon="spark" disabled={submitting}>{submitting?'Delegating…':'Delegate'}</Button></div>
        </div>
      </form>
    </Panel>

    <div className="px-metrics agents-metrics">
      <Metric icon="document" label="Needs you" value={counts['needs-you']+state.decisions.length} helper={counts['needs-you']+' outputs · '+state.decisions.length+' decisions'} tone={(counts['needs-you']+state.decisions.length)?'warning':'success'}/>
      <Metric icon="users" label="In motion" value={counts['in-motion']} helper={num(totals.active)+' agents working'} tone="success"/>
      <Metric icon="warning" label="Blocked" value={state.delegated.filter(x=>['blocked','failed'].includes(x.state)).length} helper={num(totals.stale)+' stale'} tone={state.delegated.some(x=>['blocked','failed'].includes(x.state))?'warning':'neutral'}/>
      <Metric icon="check" label="Success rate" value={totals.success_rate==null?'—':totals.success_rate+'%'} helper="Completed vs failed · 30d" tone="success"/>
    </div>

    <Panel title="Agent workbench" subtitle="One queue for work delegated from Jake, Work and the Agents workspace.">
      <div className="agents-queue-tabs" role="tablist" aria-label="Agent work queue">
        {Object.entries(queueMeta).map(([key,meta])=><button key={key} role="tab" aria-selected={filter===key} className={filter===key?'active':''} onClick={()=>setFilter(key)}>{meta.label}<span>{counts[key]}</span></button>)}
      </div>
      {queueItems.length?<div className="agents-work-list">{queueItems.map(item=><button type="button" className="agents-work-row agents-work-row--button" key={item.id} onClick={()=>setSelectedId(item.id)}>
        <span className="agents-event-icon"><Icon name={item.state==='blocked'||item.state==='failed'?'warning':item.state==='completed'?'check':'spark'} size={14}/></span>
        <span className="agents-work-copy"><strong>{item.work_title}</strong><small>{item.requested_agent_name||item.requested_agent_id} · {item.project_name||'Work'} · {item.deliverable_type||'deliverable'} · {relativeDate(item.updated_at)}</small>{item.result_summary&&<em>{item.result_summary}</em>}</span>
        <Pill tone={tone(item.state)}>{titleCase(item.state)}</Pill>
      </button>)}</div>:<EmptyState icon={filter==='done'?'check':'inbox'} title={filter==='needs-you'?'Nothing waiting on you':filter==='in-motion'?'No delegated work is moving':'No completed agent work yet'} body={filter==='needs-you'?'Review queue is clear.':filter==='in-motion'?'Delegate a task above or from Ask Jake.':'Accepted agent outputs will collect here.'}/>}
    </Panel>

    <div className="agents-layout">
      <Panel title="Agent roster" subtitle="Who is active and what each agent is currently handling.">
        {activeAgents.length?<div className="agents-roster">{Object.entries(groups).map(([group,items])=><div className="agents-group" key={group}><div className="agents-group-title">{group}</div>{items.map(agent=><div className="agents-row" key={agent.id}>
          <span className="agents-avatar"><Icon name={agent.group==='Assurance'?'check':agent.group==='Revenue'?'target':agent.group==='Production'?'chart':'users'} size={15}/></span>
          <span className="agents-row-copy"><strong>{agent.name}</strong><small>{(agent.current_work||agent.summary||'No active assignment')+' · '+(agent.last_seen_at?relativeDate(agent.last_seen_at):'No recent activity')}</small></span>
          <Pill tone={tone(agent.state)}>{agent.state?titleCase(agent.state):'Inactive'}</Pill>
        </div>)}</div>)}</div>:<EmptyState icon="users" title="No agent activity yet" body="Delegate work above. Agents appear here when they begin reporting activity."/>}
      </Panel>

      <div className="agents-side">
        <Panel title="Active run" subtitle={activeRun?activeRun.title:'No run is active'}>
          {activeRun?<div className="agents-run"><div className="agents-run-head"><Pill tone={tone(activeRun.status)}>{titleCase(activeRun.status)}</Pill><strong>{num(activeRun.progress)}%</strong></div><div className="agents-progress" aria-label={activeRun.title+' progress'}><span style={{width:Math.max(0,Math.min(100,num(activeRun.progress)))+'%'}}/></div><h3>{activeRun.title}</h3><div className="agents-run-meta"><span><Icon name="users" size={13}/>{activeRun.current_agent||'Awaiting agent'}</span><span><Icon name="warning" size={13}/>{num(activeRun.blockers_count||activeRun.blockers)} blockers</span><span><Icon name="document" size={13}/>{num(activeRun.artifacts)} artifacts</span></div></div>:<EmptyState icon="clock" title="No active run" body="New agent runs will appear here."/>}
        </Panel>
        <Panel title="Decision queue" subtitle="Judgement or authority that cannot be delegated.">
          {state.decisions.length?<div className="agents-decisions">{state.decisions.map(item=><div className="agents-decision" key={item.id}><div><Pill tone={tone(item.priority==='high'?'blocked':'waiting')}>{titleCase(item.priority||'medium')}</Pill><small>{item.due_at?relativeDate(item.due_at):'No deadline'}</small></div><strong>{item.title}</strong><p>{item.recommendation||'Review the evidence before deciding.'}</p></div>)}</div>:<EmptyState icon="check" title="No open decisions" body="Agent work is not waiting on an executive decision right now."/>}
        </Panel>
      </div>
    </div>

    <Panel title="Live activity" subtitle="Latest agent events, evidence handoffs and blockers.">
      {activity.length?<div className="agents-activity">{activity.slice(0,20).map(event=><div key={event.id}><time>{formatDate(event.created_at||event.event_at,{time:true})}</time><span className="agents-event-icon"><Icon name={event.state==='blocked'?'warning':'spark'} size={14}/></span><span><strong>{event.agent_name||event.agent_id}</strong><small>{event.summary}</small></span><Pill tone={tone(event.state)}>{titleCase(event.event_type)}</Pill></div>)}</div>:<EmptyState icon="inbox" title="No agent events yet" body="Live events will stream here as agents execute work."/>}
    </Panel>

    <Drawer open={!!selected} onClose={()=>setSelectedId(null)} eyebrow="Agent work" title={selected?.work_title||'Delegated work'} subtitle={selected?(selected.requested_agent_name+' · '+titleCase(selected.state)):''} footer={selected&&<><Button variant="secondary" onClick={()=>navigate?.('work',{id:selected.work_item_id})}>Open Work</Button><Button variant="ghost" onClick={()=>setSelectedId(null)}>Close</Button></>}>
      {selected&&<div className="agents-review">
        <div className="agents-review-meta"><Pill tone={tone(selected.state)}>{titleCase(selected.state)}</Pill><span>{selected.deliverable_type||'deliverable'}</span><span>{selected.project_name||'Work'}</span><span>{selected.updated_at?relativeDate(selected.updated_at):''}</span></div>
        <div><div className="px-brief-label">Instruction</div><p className="agents-review-request">{selected.request_text||selected.work_title}</p></div>
        {(selected.result_summary||selected.failure_reason)&&<StateBanner tone={selected.failure_reason?'danger':'info'} title={selected.failure_reason?'Execution issue':'Agent summary'}>{selected.failure_reason||selected.result_summary}</StateBanner>}
        {selected.result_content?<div><div className="agents-review-heading"><div className="px-brief-label">Output</div><Button variant="ghost" onClick={copyResult}>Copy output</Button></div><div className="agents-result">{selected.result_content}</div></div>:<EmptyState icon="clock" title={selected.state==='queued'?'Waiting to start':selected.state==='working'?'Agent is working':'No output yet'} body="The result will appear here when the agent returns evidence for review."/>}
        {selected.artifact_uri&&<div><div className="px-brief-label">Evidence / artifact</div><code className="agents-artifact">{selected.artifact_uri}</code></div>}
        {['review','blocked','failed'].includes(selected.state)&&<div className="agents-review-actions">
          <h3>{selected.state==='review'?'Review the result':'Redirect the work'}</h3>
          <FormField label="Revision or redirect instructions" description="Be specific about what must change. You can keep the same agent or send the revision to another specialist.">
            <textarea rows="4" value={feedback} onChange={e=>setFeedback(e.target.value)} placeholder="Example: Keep the structure, but replace the generic evidence with our GIZ/PRUDEV and Technovation delivery examples. Add a one-paragraph implementation sequence."/>
          </FormField>
          <FormField label="Send revision to">
            <select value={revisionAgent} onChange={e=>setRevisionAgent(e.target.value)}>{state.catalog.map(agent=><option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>
          </FormField>
          <div className="px-form-actions">{selected.state==='review'&&<Button variant="secondary" onClick={acceptSelected} disabled={reviewBusy}>Accept & complete</Button>}<Button onClick={reviseSelected} disabled={reviewBusy}>{reviewBusy?'Working…':'Request revision'}</Button></div>
        </div>}
      </div>}
    </Drawer>
  </div>;
}
