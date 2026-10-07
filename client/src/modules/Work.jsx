import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, EmptyState, Icon, LoadingRows, PageHeader, Panel, Pill, StateBanner, formatDate, relativeDate } from '../components/ProductUI';

const DEFAULT_META={outcome_type:'delivery',market_stage:'none',completion_definition:'',decision_required:false,delegation_preference:'me',evidence_required:'',portfolio_lane:'',portfolio:{lane:'',bookmark:'',restart_condition:''}};
const DEFAULT_TASK={title:'',description:'',project_id:'',status:'inbox',priority:'medium',impact:3,strategic_weight:3,estimated_minutes:30,due_at:'',pinned:false,blocked:false,blocked_reason:'',metadata:{...DEFAULT_META}};
const toneForPriority=p=>p==='critical'?'danger':p==='high'?'warning':p==='low'?'neutral':'info';

function guidanceFor(item,rank){
  if(item.blocked||item.status==='waiting')return 'Waiting';
  if(item.due_at&&new Date(item.due_at)<new Date())return 'Overdue';
  if(rank===0)return 'Best next';
  if(item.due_at&&new Date(item.due_at).getTime()-Date.now()<86400000)return 'Due soon';
  if(Number(item.estimated_minutes||0)<=20)return 'Quick win';
  if(item.priority==='critical'||item.priority==='high')return 'High priority';
  return null;
}

function TaskRow({item,onComplete,onEdit,onDefer,onAgent,rank=null}){
  const overdue=item.due_at&&new Date(item.due_at)<new Date();
  const guidance=guidanceFor(item,rank);
  const meta=item.metadata&&typeof item.metadata==='object'?item.metadata:{};
  const lane=String(item.portfolio_effective_lane||meta.portfolio?.lane||meta.portfolio_lane||'').toUpperCase();
  return <div className="px-task">
    <button className="px-check" onClick={()=>onComplete(item)} title="Complete"><Icon name="check" size={15}/></button>
    <div>
      <div className="px-task-title">{item.title}</div>
      {item.why_now&&<div className="px-task-reason">{item.why_now}</div>}
      <div className="px-task-meta">
        {guidance&&<span className="px-guidance">{guidance}</span>}
        {item.project_name&&<Pill tone="brand">{item.project_name}</Pill>}
        {lane&&<Pill tone={lane==='PARKED'?'neutral':lane==='REVENUE'?'success':lane==='WORK'?'warning':'brand'}>{lane}</Pill>}
        {meta.outcome_type&&<Pill tone={meta.outcome_type==='market'||meta.outcome_type==='revenue'?'success':meta.outcome_type==='decision'?'warning':'neutral'}>{meta.outcome_type}</Pill>}
        {meta.market_stage&&meta.market_stage!=='none'&&<Pill tone="brand">{meta.market_stage}</Pill>}
        <Pill tone={toneForPriority(item.priority)}>{item.priority}</Pill>
        {item.due_at&&<Pill tone={overdue?'danger':'neutral'}>{relativeDate(item.due_at)}</Pill>}
        {item.estimated_minutes&&<span className="px-kicker">{item.estimated_minutes} min</span>}
        {item.agent_name&&<Pill tone={item.agent_state==='review'?'warning':item.agent_state==='completed'?'success':item.agent_state==='failed'||item.agent_state==='blocked'?'danger':'info'}>{item.agent_name} · {item.agent_state||'queued'}</Pill>}
      </div>
      {meta.completion_definition&&<div className="px-task-reason"><strong>Done:</strong> {meta.completion_definition}</div>}
    </div>
    <div className="px-row">
      <button className="px-icon-button" title={item.agent_dispatch_id?"Agent work":"Delegate to agent"} onClick={()=>onAgent(item)}><Icon name="spark"/></button>
      <button className="px-icon-button" title="Defer one hour" onClick={()=>onDefer(item)}><Icon name="clock"/></button>
      <button className="px-icon-button" title="Edit" onClick={()=>onEdit(item)}><Icon name="dots"/></button>
    </div>
  </div>;
}

export default function Work({initialItemId=null}){
  const[tab,setTab]=useState('today');
  const[today,setToday]=useState({priorities:[],events:[]});
  const[inbox,setInbox]=useState([]);
  const[all,setAll]=useState([]);
  const[projects,setProjects]=useState([]);
  const[portfolio,setPortfolio]=useState(null);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');
  const[drawer,setDrawer]=useState(null);
  const[form,setForm]=useState(DEFAULT_TASK);
  const[capture,setCapture]=useState('');
  const[saving,setSaving]=useState(false);
  const[agentDrawer,setAgentDrawer]=useState(null);
  const[agentInstruction,setAgentInstruction]=useState('');
  const[agentFeedback,setAgentFeedback]=useState('');
  const[agentBusy,setAgentBusy]=useState(false);
  const deepOpened=useRef(null);

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    const sources=[
      ['today','/api/work/today'],
      ['inbox','/api/work/inbox'],
      ['all','/api/work/items?limit=250'],
      ['projects','/api/work/projects'],
      ['portfolio','/api/portfolio']
    ];
    const results=await Promise.allSettled(sources.map(async([name,url])=>{
      const response=await fetch(url,{headers:{Accept:'application/json'}});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error||`${name} returned ${response.status}`);
      return{name,body};
    }));
    const failed=[];
    results.forEach((result,index)=>{
      const name=sources[index][0];
      if(result.status==='rejected'){failed.push(name);return;}
      const body=result.value.body||{};
      if(name==='today')setToday(body);
      if(name==='inbox')setInbox(body.items||[]);
      if(name==='all')setAll(body.items||[]);
      if(name==='projects')setProjects(body.projects||[]);
      if(name==='portfolio')setPortfolio(body);
    });
    if(failed.length===sources.length)setError('Work is unavailable. Your last loaded view has been retained where possible.');
    else if(failed.length)setError(`Some Work sources could not refresh: ${failed.join(', ')}. Available sections remain usable.`);
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  const openNew=(seed={})=>{setForm({...DEFAULT_TASK,...seed,metadata:{...DEFAULT_META,...(seed.metadata||{})}});setDrawer('new');};
  const openEdit=item=>{setForm({...DEFAULT_TASK,...item,metadata:{...DEFAULT_META,...(item.metadata||{})},due_at:item.due_at?new Date(item.due_at).toISOString().slice(0,16):''});setDrawer(item.id);};
  const closeDrawer=()=>{setDrawer(null);if(window.location.pathname.startsWith('/work/'))window.history.replaceState({},'','/?module=work');};
  useEffect(()=>{if(!initialItemId||deepOpened.current===initialItemId||!all.length)return;const item=all.find(x=>String(x.id)===String(initialItemId));if(item){deepOpened.current=initialItemId;openEdit(item);}},[initialItemId,all]);
  const save=async()=>{
    if(!form.title.trim())return;setSaving(true);setError('');
    try{
      const body={...form,title:form.title.trim(),due_at:form.due_at?new Date(form.due_at).toISOString():null,project_id:form.project_id||null};
      const response=await fetch(drawer==='new'?'/api/work/items':`/api/work/items/${encodeURIComponent(drawer)}`,{method:drawer==='new'?'POST':'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Could not save work item.');closeDrawer();setForm(DEFAULT_TASK);await load();
    }catch(e){setError(e.message||'Could not save work item.');}setSaving(false);
  };
  const complete=async item=>{setError('');const response=await fetch(`/api/work/items/${encodeURIComponent(item.id)}/complete`,{method:'POST'});if(!response.ok){const body=await response.json().catch(()=>({}));setError(body.error||'Could not complete this work item.');return;}await load();};
  const defer=async item=>{setError('');const until=new Date(Date.now()+3600000).toISOString();const response=await fetch(`/api/work/items/${encodeURIComponent(item.id)}/defer`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({until})});if(!response.ok){const body=await response.json().catch(()=>({}));setError(body.error||'Could not defer this work item.');return;}await load();};
  const quickCapture=async()=>{if(!capture.trim()||saving)return;const title=capture.trim();setSaving(true);setError('');try{const response=await fetch('/api/work/items',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,status:'inbox',source:'jakeos-capture'})});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'Capture failed. Your text is still here; retry when ready.');setCapture('');await load();}catch(e){setError(e.message||'Capture failed. Your text is still here; retry when ready.');}setSaving(false);};
  const openAgent=async item=>{
    setAgentBusy(true);setError('');
    try{
      const response=await fetch('/api/work/items/'+encodeURIComponent(item.id)+'/agent');
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Could not load agent work.');
      setAgentDrawer(data);
      setAgentInstruction(data.dispatch?.request_text||item.description||item.title||'');
      setAgentFeedback('');
    }catch(e){setError(e.message||'Could not load agent work.');}
    setAgentBusy(false);
  };
  const delegateAgent=async()=>{
    if(!agentDrawer?.work?.id||!agentInstruction.trim()||agentBusy)return;
    setAgentBusy(true);setError('');
    try{
      const response=await fetch('/api/work/items/'+encodeURIComponent(agentDrawer.work.id)+'/delegate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_text:agentInstruction.trim()})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Could not delegate work.');
      setAgentDrawer({work:data.work,dispatch:data.dispatch});await load();
    }catch(e){setError(e.message||'Could not delegate work.');}
    setAgentBusy(false);
  };
  const reviseAgent=async()=>{
    if(!agentDrawer?.work?.id||!agentFeedback.trim()||agentBusy)return;
    setAgentBusy(true);setError('');
    try{
      const response=await fetch('/api/work/items/'+encodeURIComponent(agentDrawer.work.id)+'/agent/revise',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({feedback:agentFeedback.trim()})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Could not request revision.');
      setAgentDrawer({work:data.work,dispatch:data.dispatch});setAgentFeedback('');await load();
    }catch(e){setError(e.message||'Could not request revision.');}
    setAgentBusy(false);
  };
  const acceptAgent=async()=>{
    if(!agentDrawer?.work?.id||agentBusy)return;
    setAgentBusy(true);setError('');
    try{
      const response=await fetch('/api/work/items/'+encodeURIComponent(agentDrawer.work.id)+'/agent/accept',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Could not accept agent result.');
      setAgentDrawer(null);await load();
    }catch(e){setError(e.message||'Could not accept agent result.');}
    setAgentBusy(false);
  };

  const dailyOutcomes=portfolio?.daily_outcomes?.length?portfolio.daily_outcomes:(today.priorities||[]).slice(0,3);
  const items=tab==='today'?dailyOutcomes:tab==='inbox'?inbox:all.filter(x=>!['done','cancelled'].includes(x.status));
  const weekAgo=Date.now()-7*86400000;
  const completed=all.filter(x=>x.status==='done'&&x.completed_at&&new Date(x.completed_at).getTime()>=weekAgo).length;
  const doing=all.filter(x=>x.status==='doing').length;
  const blocked=all.filter(x=>x.blocked||x.status==='waiting').length;
  const overdue=all.filter(x=>!['done','cancelled'].includes(x.status)&&x.due_at&&new Date(x.due_at)<new Date()).length;
  const focus=useMemo(()=>dailyOutcomes?.[0]||null,[dailyOutcomes]);

  return <div className="module">
    <PageHeader eyebrow="Execution" title="Work" subtitle="Finish active work, move market and client outcomes, delegate what others can do, and keep new WIP constrained." actions={<><Button variant="secondary" icon="refresh" onClick={load}>Refresh</Button><Button icon="plus" onClick={()=>openNew()}>New task</Button></>}/>
    {error&&<StateBanner tone="danger" title="Work needs attention">{error}</StateBanner>}

    <div className="px-status-ribbon" aria-label="Work status">
      <div className="px-status-ribbon-item"><strong>{dailyOutcomes.length}</strong><span>outcomes today</span></div>
      <div className="px-status-ribbon-item" data-alert={(portfolio?.violations||[]).length>0}><strong>{portfolio?.lanes?.SHIP?.initiative_count||0}/1</strong><span>SHIP WIP</span></div>
      <div className="px-status-ribbon-item" data-alert={overdue>0}><strong>{overdue}</strong><span>overdue</span></div>
      <div className="px-status-ribbon-item"><strong>{blocked}</strong><span>blocked / waiting</span></div>
      <div className="px-status-ribbon-item"><strong>{completed}</strong><span>completed / 7d</span></div>
    </div>

    {(portfolio?.violations||[]).length>0&&<StateBanner tone="warning" title="Portfolio WIP guardrail is active">Overflow initiatives are parked automatically for planning. Promote one by explicitly moving another initiative out of its active lane.</StateBanner>}

    {portfolio&&<Panel title="Portfolio lanes" subtitle="Unlimited interests. Limited work in progress. JakeOS keeps overflow work bookmarked instead of letting it compete for today."><div className="px-status-ribbon" aria-label="Portfolio lanes">{['SHIP','REVENUE','WORK','LEARN','LAB','PARKED'].map(lane=>{const data=portfolio.lanes?.[lane]||{};const limit=portfolio.limits?.[lane];return <div className="px-status-ribbon-item" key={lane}><strong>{data.initiative_count||0}{limit?`/${limit}`:''}</strong><span>{lane}</span></div>;})}</div></Panel>}

    <div className="px-grid-2">
      <Panel title="Your queue" subtitle="Today is the ranked shortlist. Inbox is unprocessed capture. All is the complete open system." action={<div className="px-row">{['today','inbox','all'].map(x=><Button key={x} variant={tab===x?'tonal':'ghost'} onClick={()=>setTab(x)}>{x[0].toUpperCase()+x.slice(1)}</Button>)}</div>}>
        <div className="px-row" style={{marginBottom:12}}><input className="px-input" value={capture} onChange={e=>setCapture(e.target.value)} onKeyDown={e=>e.key==='Enter'&&quickCapture()} placeholder="Capture a task, follow-up or commitment…"/><Button icon="plus" onClick={quickCapture}>Capture</Button></div>
        {loading?<LoadingRows/>:items.length===0?<EmptyState icon="check" title={tab==='today'?'Nothing urgent right now':tab==='inbox'?'Inbox is clear':'No open work'} body="Capture something when it arrives. JakeOS will keep it in the canonical work queue." action={<Button variant="tonal" icon="plus" onClick={()=>openNew()}>Add work</Button>}/>:<div>{items.map((item,index)=><TaskRow key={item.id} item={item} rank={tab==='today'?index:null} onComplete={complete} onEdit={openEdit} onDefer={defer} onAgent={openAgent}/>)}</div>}
      </Panel>
      <div className="px-stack">
        <Panel title="Focus" subtitle="The strongest currently actionable item, translated into plain language.">
          {focus?<div><div className="px-brief-label">Why this now</div><h3 className="px-focus-title">{focus.title}</h3><p className="px-muted" style={{fontSize:12.5,lineHeight:1.58,margin:'0 0 14px'}}>{focus.why_now||'This is the strongest currently actionable item.'}</p><div className="px-row" style={{flexWrap:'wrap'}}><span className="px-guidance">Best next</span><Pill tone={toneForPriority(focus.priority)}>{focus.priority}</Pill>{focus.project_name&&<Pill tone="brand">{focus.project_name}</Pill>}<Pill>{focus.estimated_minutes||30} min</Pill>{focus.due_at&&<Pill tone={new Date(focus.due_at)<new Date()?'danger':'neutral'}>{relativeDate(focus.due_at)}</Pill>}</div><div className="px-form-actions" style={{justifyContent:'flex-start'}}><Button icon="check" onClick={()=>complete(focus)}>Complete</Button><Button variant="secondary" icon="clock" onClick={()=>defer(focus)}>Defer 1h</Button></div></div>:<EmptyState icon="check" title="Focus is clear" body="When actionable work exists, JakeOS will explain why it should be next."/>}
        </Panel>
        <Panel title="Today’s commitments" subtitle="Calendar blocks already competing for your attention.">
          {(today.events||[]).length?<div className="px-list">{today.events.map(event=><div className="px-list-row" key={event.id}><div className="px-metric-icon" style={{margin:0,width:36,height:36}}><Icon name="calendar" size={17}/></div><div className="px-list-main"><div className="px-list-title">{event.title}</div><div className="px-list-sub">{event.project||event.source||'Calendar'}</div></div><div className="px-list-meta">{event.starts_at?formatDate(event.starts_at,{time:true}):'Today'}</div></div>)}</div>:<EmptyState icon="calendar" title="No calendar blocks today" body="Your work queue has the day to itself unless device or Google calendar events are added."/>}
        </Panel>
        {blocked>0&&<StateBanner tone="warning" title={`${blocked} blocked or waiting item${blocked===1?'':'s'}`}>Open All to review what is stalled and why.</StateBanner>}
      </div>
    </div>

    {agentDrawer&&<div className="px-drawer" onMouseDown={e=>e.target===e.currentTarget&&setAgentDrawer(null)}><div className="px-drawer-card">
      <PageHeader eyebrow="Agent work" title={agentDrawer.work?.title||'Work item'} subtitle={agentDrawer.dispatch?'Review the delegated work without leaving your canonical Work queue.':'Delegate this existing Work item to the agent workforce.'} actions={<button className="px-icon-button" onClick={()=>setAgentDrawer(null)}>×</button>}/>
      {!agentDrawer.dispatch?<div className="px-stack">
        <div className="px-field"><label>Instruction for the agent</label><textarea value={agentInstruction} onChange={e=>setAgentInstruction(e.target.value)} placeholder="Describe the draft, research, review or other work you want the agent to produce."/></div>
        <StateBanner tone="info" title="This stays in Work">Delegation creates an agent run linked to this same Work item. The agent result returns here for your review.</StateBanner>
        <div className="px-form-actions"><Button variant="secondary" onClick={()=>setAgentDrawer(null)}>Cancel</Button><Button icon="spark" onClick={delegateAgent} disabled={agentBusy||!agentInstruction.trim()}>{agentBusy?'Delegating…':'Delegate to agent'}</Button></div>
      </div>:<div className="px-stack">
        <div className="px-row" style={{flexWrap:'wrap'}}><Pill tone="brand">{agentDrawer.dispatch.requested_agent_name}</Pill><Pill tone={agentDrawer.dispatch.state==='review'?'warning':agentDrawer.dispatch.state==='completed'?'success':agentDrawer.dispatch.state==='failed'||agentDrawer.dispatch.state==='blocked'?'danger':'info'}>{agentDrawer.dispatch.state}</Pill></div>
        <div className="px-field"><label>Agent instruction</label><textarea readOnly value={agentDrawer.dispatch.request_text||''}/></div>
        {agentDrawer.dispatch.result_summary&&<StateBanner tone={agentDrawer.dispatch.state==='failed'||agentDrawer.dispatch.state==='blocked'?'danger':'info'} title={agentDrawer.dispatch.state==='review'?'Ready for review':'Agent update'}>{agentDrawer.dispatch.result_summary}</StateBanner>}
        {agentDrawer.dispatch.result_content&&<div className="px-field"><label>Deliverable</label><textarea readOnly rows={14} value={agentDrawer.dispatch.result_content}/></div>}
        {['review','blocked','failed'].includes(agentDrawer.dispatch.state)&&<div className="px-field"><label>Revision feedback</label><textarea value={agentFeedback} onChange={e=>setAgentFeedback(e.target.value)} placeholder="Tell the agent exactly what to change, add or correct."/></div>}
        <div className="px-form-actions">
          <Button variant="secondary" onClick={()=>setAgentDrawer(null)}>Close</Button>
          {['review','blocked','failed'].includes(agentDrawer.dispatch.state)&&<Button variant="tonal" icon="refresh" onClick={reviseAgent} disabled={agentBusy||!agentFeedback.trim()}>{agentBusy?'Sending…':'Request revision'}</Button>}
          {agentDrawer.dispatch.state==='review'&&<Button icon="check" onClick={acceptAgent} disabled={agentBusy}>{agentBusy?'Accepting…':'Accept & complete'}</Button>}
        </div>
      </div>}
    </div></div>}

    {drawer&&<div className="px-drawer" onMouseDown={e=>e.target===e.currentTarget&&closeDrawer()}><div className="px-drawer-card"><PageHeader eyebrow={drawer==='new'?'Capture':'Edit'} title={drawer==='new'?'New work item':'Work item'} subtitle="Define the outcome, what done means, and whether this should move to market, stay with you, or be delegated." actions={<button className="px-icon-button" onClick={closeDrawer}>×</button>}/><div className="px-stack">
      <div className="px-field"><label>What needs to happen?</label><input autoFocus value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Send revised proposal to client"/></div>
      <div className="px-field"><label>Context</label><textarea value={form.description||''} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Useful details, expected outcome, links or constraints"/></div>
      <div className="px-field"><label htmlFor="work-definition-done">Definition of done</label><input id="work-definition-done" value={form.metadata?.completion_definition||''} onChange={e=>setForm(f=>({...f,metadata:{...DEFAULT_META,...(f.metadata||{}),completion_definition:e.target.value}}))} placeholder="What evidence proves this is actually complete?"/></div>
      <div className="px-form-grid">
        <div className="px-field"><label htmlFor="work-lane">Portfolio lane</label><select id="work-lane" value={form.metadata?.portfolio?.lane||form.metadata?.portfolio_lane||''} onChange={e=>setForm(f=>({...f,metadata:{...DEFAULT_META,...(f.metadata||{}),portfolio_lane:e.target.value,portfolio:{...(f.metadata?.portfolio||{}),lane:e.target.value}}}))}><option value="">Auto classify</option>{['SHIP','REVENUE','WORK','LEARN','LAB','PARKED'].map(x=><option value={x} key={x}>{x}</option>)}</select></div>
        <div className="px-field"><label htmlFor="work-outcome">Outcome</label><select id="work-outcome" value={form.metadata?.outcome_type||'delivery'} onChange={e=>setForm(f=>({...f,metadata:{...DEFAULT_META,...(f.metadata||{}),outcome_type:e.target.value}}))}><option value="market">Market / revenue</option><option value="delivery">Client / delivery</option><option value="decision">Executive decision</option><option value="internal">Internal operation</option><option value="maintenance">Maintenance</option></select></div>
        <div className="px-field"><label htmlFor="work-market-stage">Market stage</label><select id="work-market-stage" value={form.metadata?.market_stage||'none'} onChange={e=>setForm(f=>({...f,metadata:{...DEFAULT_META,...(f.metadata||{}),market_stage:e.target.value}}))}><option value="none">Not market-facing</option><option value="validate">Validate</option><option value="sell">Sell</option><option value="bid">Bid</option><option value="submit">Submit</option><option value="deliver">Deliver</option><option value="collect">Collect</option><option value="retain">Retain</option></select></div>
      </div>
      {(form.metadata?.portfolio?.lane||form.metadata?.portfolio_lane)==='PARKED'&&<div className="px-form-grid"><div className="px-field"><label>Parked bookmark</label><input value={form.metadata?.portfolio?.bookmark||form.title||''} onChange={e=>setForm(f=>({...f,metadata:{...DEFAULT_META,...(f.metadata||{}),portfolio:{...(f.metadata?.portfolio||{}),bookmark:e.target.value}}}))} placeholder="Where did this stop?"/></div><div className="px-field"><label>Restart condition</label><input value={form.metadata?.portfolio?.restart_condition||''} onChange={e=>setForm(f=>({...f,metadata:{...DEFAULT_META,...(f.metadata||{}),portfolio:{...(f.metadata?.portfolio||{}),restart_condition:e.target.value}}}))} placeholder="What must be true before this returns?"/></div></div>}
      <div className="px-form-grid">
        <div className="px-field"><label htmlFor="work-execution-mode">Execution mode</label><select id="work-execution-mode" value={form.metadata?.delegation_preference||'me'} onChange={e=>setForm(f=>({...f,metadata:{...DEFAULT_META,...(f.metadata||{}),delegation_preference:e.target.value}}))}><option value="me">I must execute</option><option value="delegate">Delegate to a person</option><option value="agent">Delegate to an agent</option></select></div>
        <div className="px-field"><label htmlFor="work-completion-evidence">Completion evidence</label><input id="work-completion-evidence" value={form.metadata?.evidence_required||''} onChange={e=>setForm(f=>({...f,metadata:{...DEFAULT_META,...(f.metadata||{}),evidence_required:e.target.value}}))} placeholder="e.g. receipt, URL, screenshot, signed document"/></div>
      </div>
      <label className="px-row" htmlFor="work-decision-required" style={{justifyContent:'flex-start',gap:10}}><input id="work-decision-required" type="checkbox" checked={!!form.metadata?.decision_required} onChange={e=>setForm(f=>({...f,metadata:{...DEFAULT_META,...(f.metadata||{}),decision_required:e.target.checked}}))}/><span>This requires an executive decision from me</span></label>
      <div className="px-form-grid"><div className="px-field"><label>Project</label><select value={form.project_id||''} onChange={e=>setForm(f=>({...f,project_id:e.target.value}))}><option value="">No project</option>{projects.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></div><div className="px-field"><label>Status</label><select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>{['inbox','ready','doing','waiting','done'].map(x=><option key={x}>{x}</option>)}</select></div></div>
      <div className="px-form-grid"><div className="px-field"><label>Priority</label><select value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))}>{['low','medium','high','critical'].map(x=><option key={x}>{x}</option>)}</select></div><div className="px-field"><label>Due</label><input type="datetime-local" value={form.due_at||''} onChange={e=>setForm(f=>({...f,due_at:e.target.value}))}/></div></div>
      <div className="px-form-grid"><div className="px-field"><label>Estimated minutes</label><input type="number" min="5" max="480" step="5" value={form.estimated_minutes} onChange={e=>setForm(f=>({...f,estimated_minutes:Number(e.target.value)}))}/></div><div className="px-field"><label>Impact (1–5)</label><input type="number" min="1" max="5" value={form.impact} onChange={e=>setForm(f=>({...f,impact:Number(e.target.value)}))}/></div></div>
      <div className="px-form-grid"><div className="px-field"><label>Strategic weight (1–5)</label><input type="number" min="1" max="5" value={form.strategic_weight} onChange={e=>setForm(f=>({...f,strategic_weight:Number(e.target.value)}))}/></div><div className="px-field"><label>Blocked reason</label><input value={form.blocked_reason||''} onChange={e=>setForm(f=>({...f,blocked:!!e.target.value,blocked_reason:e.target.value}))} placeholder="Leave blank if actionable"/></div></div>
    </div><div className="px-form-actions"><Button variant="secondary" onClick={()=>setDrawer(null)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?'Saving…':'Save work item'}</Button></div></div></div>}
  </div>;
}
