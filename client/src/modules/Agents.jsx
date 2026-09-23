import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Icon, Metric, PageHeader, Panel, Pill, StateBanner, formatDate, relativeDate } from '../components/ProductUI';
import './Agents.css';

const num=value=>Number.isFinite(Number(value))?Number(value):0;
const titleCase=value=>String(value||'').replace(/[_-]+/g,' ').replace(/\b\w/g,m=>m.toUpperCase());
const tone=value=>{
  if(['working','completed','in_progress'].includes(value))return 'success';
  if(['blocked','failed','stale'].includes(value))return 'danger';
  if(['waiting','queued','verification','approval'].includes(value))return 'warning';
  return 'neutral';
};

export default function Agents({openAI}){
  const[state,setState]=useState({overview:null,runs:[],decisions:[],delegated:[],runtime:null});
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');
  const[live,setLive]=useState('connecting');
  const[busy,setBusy]=useState('');
  const[detail,setDetail]=useState(null);

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const get=async url=>{
        const r=await fetch(url,{headers:{Accept:'application/json'}});
        const d=await r.json().catch(()=>({}));
        if(!r.ok)throw new Error(d.error||(url+' returned '+r.status));
        return d;
      };
      const[overview,runs,decisions,delegated,runtime]=await Promise.all([
        get('/api/agents/overview'),
        get('/api/agents/runs?limit=20'),
        get('/api/agents/decisions?status=open'),
        get('/api/agents/work?limit=40'),
        get('/api/errands/status')
      ]);
      setState({overview,runs:runs.runs||[],decisions:decisions.decisions||[],delegated:delegated.dispatches||[],runtime});
    }catch(err){setError(err.message||'Agent telemetry unavailable.');}
    setLoading(false);
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
        }catch{}
      });
      stream.onerror=()=>setLive('reconnecting');
    }catch{setLive('unavailable');}
    return()=>stream?.close();
  },[]);

  const resolveDecision=async(item,approved)=>{
    if(busy)return;setBusy(item.id);setError('');
    try{
      const response=await fetch('/api/agents/decisions/'+encodeURIComponent(item.id)+'/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({approved,status:'resolved',resolution:approved?'Approved by Jacob':'Rejected by Jacob'})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Decision could not be resolved.');
      await load();
    }catch(error){setError(error.message||'Decision could not be resolved.');}
    setBusy('');
  };
  const openErrand=async item=>{
    if(!item?.id)return;setBusy('detail:'+item.id);setError('');
    try{
      const response=await fetch('/api/errands/'+encodeURIComponent(item.id)),data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Errand detail could not be loaded.');
      setDetail(data);
    }catch(error){setError(error.message||'Errand detail could not be loaded.');}
    setBusy('');
  };

  const overview=state.overview||{},totals=overview.totals||{},agents=overview.agents||[],activity=overview.activity||[];
  const activeAgents=agents.filter(agent=>agent.state||agent.current_work);
  const activeRun=state.runs.find(run=>['in_progress','verification','blocked'].includes(run.status))||state.runs[0]||null;
  const groups=useMemo(()=>activeAgents.reduce((acc,agent)=>{const key=agent.group||'Other';(acc[key]??=[]).push(agent);return acc;},{}),[activeAgents]);
  const openai=state.runtime?.openai||{},queue=state.runtime?.queue||{};
  const approvals=state.decisions.filter(x=>x.metadata?.type==='tool_approval');
  const normalDecisions=state.decisions.filter(x=>x.metadata?.type!=='tool_approval');

  return <div className="module agents-page">
    <PageHeader
      eyebrow="Agent OS"
      title="Agents"
      subtitle="See what each agent is doing, what is blocked, what evidence has been produced, and what needs your decision."
      actions={<div className="agents-actions">
        <span className={'agents-live agents-live--'+live}><i/>{live==='live'?'Live':live==='reconnecting'?'Reconnecting':live==='unavailable'?'Unavailable':'Connecting'}</span>
        <Button variant="secondary" icon="refresh" onClick={load}>Refresh</Button>
        <Button icon="spark" onClick={()=>openAI('Review the current agent activity. Tell me what is moving, what is blocked, and which decisions need me.')}>Ask Jake</Button>
      </div>}
    />

    {error&&<StateBanner tone="danger" title="Agent telemetry unavailable">{error}</StateBanner>}

    <div className="px-metrics agents-metrics">
      <Metric icon="users" label="Working" value={loading&&!state.overview?'—':num(totals.active)} helper={num(totals.registered)+' registered'} tone="success"/>
      <Metric icon="clock" label="Queued / waiting" value={loading&&!state.overview?'—':num(totals.queued)+num(totals.waiting)} helper={num(totals.queued)+' queued · '+num(totals.waiting)+' waiting'}/>
      <Metric icon="warning" label="Blocked" value={loading&&!state.overview?'—':num(totals.blocked)} helper={num(totals.stale)+' stale'} tone={num(totals.blocked)?'warning':'neutral'}/>
      <Metric icon="check" label="Success rate" value={totals.success_rate==null?'—':totals.success_rate+'%'} helper="Completed vs failed · 30d" tone="success"/>
      <Metric icon="clock" label="Avg completion" value={totals.avg_completion_minutes==null?'—':totals.avg_completion_minutes+'m'} helper="Completed runs · 30d"/>
      <Metric icon="document" label="Decisions" value={num(totals.decisions_open||state.decisions.length)} helper="Waiting for Jacob" tone={state.decisions.length?'warning':'neutral'}/>
    </div>

    <div className="agents-layout">
      <Panel title="Agent roster" subtitle="Current state and active assignment for agents that have reported activity.">
        {activeAgents.length?<div className="agents-roster">
          {Object.entries(groups).map(([group,items])=><div className="agents-group" key={group}>
            <div className="agents-group-title">{group}</div>
            {items.map(agent=><div className="agents-row" key={agent.id}>
              <span className="agents-avatar"><Icon name={agent.group==='Assurance'?'check':agent.group==='Revenue'?'target':agent.group==='Production'?'chart':'users'} size={15}/></span>
              <span className="agents-row-copy"><strong>{agent.name}</strong><small>{(agent.current_work||agent.summary||'No active assignment')+' · '+(agent.last_seen_at?relativeDate(agent.last_seen_at):'No recent activity')}</small></span>
              <Pill tone={tone(agent.state)}>{agent.state?titleCase(agent.state):'Inactive'}</Pill>
            </div>)}
          </div>)}
        </div>:<EmptyState icon="users" title="No agent activity yet" body="Agents will appear here when Tuku Agent OS starts sending run events."/>}
      </Panel>

      <div className="agents-side">
        <Panel title="Active run" subtitle={activeRun?activeRun.title:'No run is active'}>
          {activeRun?<div className="agents-run">
            <div className="agents-run-head"><Pill tone={tone(activeRun.status)}>{titleCase(activeRun.status)}</Pill><strong>{num(activeRun.progress)}%</strong></div>
            <div className="agents-progress" aria-label={activeRun.title+' progress'}><span style={{width:Math.max(0,Math.min(100,num(activeRun.progress)))+'%'}}/></div>
            <h3>{activeRun.title}</h3>
            <div className="agents-run-meta"><span><Icon name="users" size={13}/>{activeRun.current_agent||'Awaiting agent'}</span><span><Icon name="warning" size={13}/>{num(activeRun.blockers_count||activeRun.blockers)} blockers</span><span><Icon name="document" size={13}/>{num(activeRun.artifacts)} artifacts</span></div>
          </div>:<EmptyState icon="clock" title="No active run" body="New agent runs will appear here."/>}
        </Panel>

        <Panel title="Decision queue" subtitle="Items that require your judgement or authority.">
          {state.decisions.length?<div className="agents-decisions">{state.decisions.map(item=><div className="agents-decision" key={item.id}>
            <div><Pill tone={tone(item.priority==='high'?'blocked':'waiting')}>{titleCase(item.priority||'medium')}</Pill><small>{item.due_at?relativeDate(item.due_at):'No deadline'}</small></div>
            <strong>{item.title}</strong>
            <p>{item.recommendation||'Review the evidence before deciding.'}</p>
          </div>)}</div>:<EmptyState icon="check" title="No open decisions" body="Agent work is not waiting on you right now."/>}
        </Panel>
      </div>
    </div>

    <Panel title="Delegated from Work" subtitle="Agent assignments remain linked to the same canonical JakeOS Work items.">
      {state.delegated.length?<div className="agents-work-list">{state.delegated.map(item=><div className="agents-work-row" key={item.id}>
        <span className="agents-event-icon"><Icon name="spark" size={14}/></span>
        <span><strong>{item.work_title}</strong><small>{(item.requested_agent_name||item.requested_agent_id)+' · '+(item.project_name||'Work')}</small></span>
        <Pill tone={tone(item.state)}>{titleCase(item.state)}</Pill>
      </div>)}</div>:<EmptyState icon="check" title="No delegated Work yet" body="Use Ask Jake in Agent mode or delegate an existing Work item. It will appear here while the Work queue remains canonical."/>}
    </Panel>

    <Panel title="Live activity" subtitle="Latest agent events, evidence handoffs and blockers.">
      {activity.length?<div className="agents-activity">{activity.slice(0,20).map(event=><div key={event.id}>
        <time>{formatDate(event.created_at||event.event_at,{time:true})}</time>
        <span className="agents-event-icon"><Icon name={event.state==='blocked'?'warning':'spark'} size={14}/></span>
        <span><strong>{event.agent_name||event.agent_id}</strong><small>{event.summary}</small></span>
        <Pill tone={tone(event.state)}>{titleCase(event.event_type)}</Pill>
      </div>)}</div>:<EmptyState icon="inbox" title="No agent events yet" body="Live events will stream here as agents execute work."/>}
    </Panel>
  </div>;
}
