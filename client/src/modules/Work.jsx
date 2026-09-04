import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Icon, LoadingRows, PageHeader, Panel, Pill, StateBanner, formatDate, relativeDate } from '../components/ProductUI';

const DEFAULT_TASK={title:'',description:'',project_id:'',status:'inbox',priority:'medium',impact:3,strategic_weight:3,estimated_minutes:30,due_at:'',pinned:false,blocked:false,blocked_reason:''};
const toneForPriority=p=>p==='critical'?'danger':p==='high'?'warning':p==='low'?'neutral':'info';

function TaskRow({item,onComplete,onEdit,onDefer}){
  const overdue=item.due_at&&new Date(item.due_at)<new Date();
  return <div className="px-task">
    <button className="px-check" onClick={()=>onComplete(item)} title="Complete"><Icon name="check" size={15}/></button>
    <div>
      <div className="px-task-title">{item.title}</div>
      {item.why_now&&<div className="px-task-reason">{item.why_now}</div>}
      <div className="px-task-meta">
        {item.project_name&&<Pill tone="brand">{item.project_emoji||'•'} {item.project_name}</Pill>}
        <Pill tone={toneForPriority(item.priority)}>{item.priority}</Pill>
        {item.due_at&&<Pill tone={overdue?'danger':'neutral'}>{relativeDate(item.due_at)}</Pill>}
        {item.estimated_minutes&&<span className="px-kicker">{item.estimated_minutes} min</span>}
        {item.priority_score!=null&&<span className="px-priority-score">score {Math.round(item.priority_score)}</span>}
      </div>
    </div>
    <div className="px-row">
      <button className="px-icon-button" title="Defer one hour" onClick={()=>onDefer(item)}><Icon name="clock"/></button>
      <button className="px-icon-button" title="Edit" onClick={()=>onEdit(item)}><Icon name="dots"/></button>
    </div>
  </div>;
}

export default function Work({openAI}){
  const[tab,setTab]=useState('today');
  const[today,setToday]=useState({priorities:[],events:[]});
  const[inbox,setInbox]=useState([]);
  const[all,setAll]=useState([]);
  const[projects,setProjects]=useState([]);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');
  const[drawer,setDrawer]=useState(null);
  const[form,setForm]=useState(DEFAULT_TASK);
  const[capture,setCapture]=useState('');
  const[saving,setSaving]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const[rToday,rInbox,rAll,rProjects]=await Promise.all([fetch('/api/work/today'),fetch('/api/work/inbox'),fetch('/api/work/items?limit=250'),fetch('/api/work/projects')]);
      if(!rToday.ok||!rInbox.ok||!rAll.ok||!rProjects.ok)throw new Error('JakeOS could not load your work queue.');
      const[dToday,dInbox,dAll,dProjects]=await Promise.all([rToday.json(),rInbox.json(),rAll.json(),rProjects.json()]);
      setToday(dToday);setInbox(dInbox.items||[]);setAll(dAll.items||[]);setProjects(dProjects.projects||[]);
    }catch(e){setError(e.message||'Work could not be loaded.');}
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  const openNew=(seed={})=>{setForm({...DEFAULT_TASK,...seed});setDrawer('new');};
  const openEdit=item=>{setForm({...DEFAULT_TASK,...item,due_at:item.due_at?new Date(item.due_at).toISOString().slice(0,16):''});setDrawer(item.id);};
  const save=async()=>{
    if(!form.title.trim())return;setSaving(true);setError('');
    try{
      const body={...form,title:form.title.trim(),due_at:form.due_at?new Date(form.due_at).toISOString():null,project_id:form.project_id||null};
      const response=await fetch(drawer==='new'?'/api/work/items':`/api/work/items/${encodeURIComponent(drawer)}`,{method:drawer==='new'?'POST':'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Could not save work item.');setDrawer(null);setForm(DEFAULT_TASK);await load();
    }catch(e){setError(e.message||'Could not save work item.');}setSaving(false);
  };
  const complete=async item=>{await fetch(`/api/work/items/${encodeURIComponent(item.id)}/complete`,{method:'POST'});await load();};
  const defer=async item=>{const until=new Date(Date.now()+3600000).toISOString();await fetch(`/api/work/items/${encodeURIComponent(item.id)}/defer`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({until})});await load();};
  const quickCapture=async()=>{if(!capture.trim())return;const title=capture.trim();setCapture('');const response=await fetch('/api/work/items',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,status:'inbox',source:'jakeos-capture'})});if(!response.ok)setError('Capture failed. Your text was not saved.');await load();};

  const items=tab==='today'?today.priorities:tab==='inbox'?inbox:all.filter(x=>!['done','cancelled'].includes(x.status));
  const completed=all.filter(x=>x.status==='done').length;
  const blocked=all.filter(x=>x.blocked||x.status==='waiting').length;
  const overdue=all.filter(x=>!['done','cancelled'].includes(x.status)&&x.due_at&&new Date(x.due_at)<new Date()).length;
  const focus=useMemo(()=>today.priorities?.[0]||null,[today]);

  return <div className="module">
    <PageHeader eyebrow="Execution" title="Work" subtitle="One canonical queue shared with Momentum. JakeOS decides what deserves attention; you decide what gets done." actions={<><Button variant="secondary" icon="refresh" onClick={load}>Refresh</Button><Button icon="plus" onClick={()=>openNew()}>New task</Button></>}/>
    {error&&<StateBanner tone="danger" title="Work needs attention">{error}</StateBanner>}
    <div className="px-metrics">
      <div className="px-metric"><div className="px-metric-value">{today.priorities?.length||0}</div><div className="px-metric-label">Priorities now</div><div className="px-metric-helper">Ranked by deadlines, impact and strategy</div></div>
      <div className="px-metric"><div className="px-metric-value">{inbox.length}</div><div className="px-metric-label">Inbox</div><div className="px-metric-helper">Unprocessed capture</div></div>
      <div className={`px-metric ${overdue?'px-metric--danger':''}`}><div className="px-metric-value">{overdue}</div><div className="px-metric-label">Overdue</div><div className="px-metric-helper">Needs a decision</div></div>
      <div className="px-metric"><div className="px-metric-value">{completed}</div><div className="px-metric-label">Completed</div><div className="px-metric-helper">All recorded work</div></div>
    </div>

    <div className="px-grid-2">
      <Panel title="Your queue" subtitle="Use Today for the ranked shortlist; Inbox to triage; All for the full open system." action={<div className="px-row">{['today','inbox','all'].map(x=><Button key={x} variant={tab===x?'tonal':'ghost'} onClick={()=>setTab(x)}>{x[0].toUpperCase()+x.slice(1)}</Button>)}</div>}>
        <div className="px-row" style={{marginBottom:12}}><input className="px-input" value={capture} onChange={e=>setCapture(e.target.value)} onKeyDown={e=>e.key==='Enter'&&quickCapture()} placeholder="Capture a task, follow-up or commitment…"/><Button icon="plus" onClick={quickCapture}>Capture</Button></div>
        {loading?<LoadingRows/>:items.length===0?<EmptyState icon="check" title={tab==='today'?'Nothing urgent right now':tab==='inbox'?'Inbox is clear':'No open work'} body="Capture something when it arrives. JakeOS will keep it in the canonical work queue." action={<Button variant="tonal" icon="plus" onClick={()=>openNew()}>Add work</Button>}/>:<div>{items.map(item=><TaskRow key={item.id} item={item} onComplete={complete} onEdit={openEdit} onDefer={defer}/>)}</div>}
      </Panel>
      <div className="px-stack">
        <Panel title="Focus" subtitle="The highest-ranked actionable item right now.">
          {focus?<div><div className="px-eyebrow">Why this now</div><h3 style={{fontSize:20,lineHeight:1.25,letterSpacing:'-.02em',margin:'0 0 8px'}}>{focus.title}</h3><p className="px-muted" style={{fontSize:13,lineHeight:1.55,margin:'0 0 14px'}}>{focus.why_now||'This is the strongest currently actionable item.'}</p><div className="px-row" style={{flexWrap:'wrap'}}><Pill tone={toneForPriority(focus.priority)}>{focus.priority}</Pill>{focus.project_name&&<Pill tone="brand">{focus.project_name}</Pill>}<Pill>{focus.estimated_minutes||30} min</Pill></div><div className="px-form-actions" style={{justifyContent:'flex-start'}}><Button icon="check" onClick={()=>complete(focus)}>Complete</Button><Button variant="secondary" icon="clock" onClick={()=>defer(focus)}>Defer 1h</Button></div></div>:<EmptyState icon="check" title="Focus is clear" body="When actionable work exists, JakeOS will explain why it should be next."/>}
        </Panel>
        <Panel title="Today’s commitments" subtitle="Calendar blocks already competing for your attention.">
          {(today.events||[]).length?<div className="px-list">{today.events.map(event=><div className="px-list-row" key={event.id}><div className="px-metric-icon" style={{margin:0,width:36,height:36}}><Icon name="calendar" size={17}/></div><div className="px-list-main"><div className="px-list-title">{event.title}</div><div className="px-list-sub">{event.project||event.source||'Calendar'}</div></div><div className="px-list-meta">{event.starts_at?formatDate(event.starts_at,{time:true}):'Today'}</div></div>)}</div>:<EmptyState icon="calendar" title="No calendar blocks today" body="Your work queue has the day to itself unless device or Google calendar events are added."/>}
        </Panel>
        {blocked>0&&<StateBanner tone="warning" title={`${blocked} blocked or waiting item${blocked===1?'':'s'}`}>Open All to review what is stalled and why.</StateBanner>}
      </div>
    </div>

    {drawer&&<div className="px-drawer" onMouseDown={e=>e.target===e.currentTarget&&setDrawer(null)}><div className="px-drawer-card"><PageHeader eyebrow={drawer==='new'?'Capture':'Edit'} title={drawer==='new'?'New work item':'Work item'} subtitle="Keep the title actionable. Add only the context JakeOS needs to prioritise it." actions={<button className="px-icon-button" onClick={()=>setDrawer(null)}>×</button>}/><div className="px-stack">
      <div className="px-field"><label>What needs to happen?</label><input autoFocus value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Send revised proposal to client"/></div>
      <div className="px-field"><label>Context</label><textarea value={form.description||''} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Useful details, expected outcome, links or constraints"/></div>
      <div className="px-form-grid"><div className="px-field"><label>Project</label><select value={form.project_id||''} onChange={e=>setForm(f=>({...f,project_id:e.target.value}))}><option value="">No project</option>{projects.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></div><div className="px-field"><label>Status</label><select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>{['inbox','ready','doing','waiting','done'].map(x=><option key={x}>{x}</option>)}</select></div></div>
      <div className="px-form-grid"><div className="px-field"><label>Priority</label><select value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))}>{['low','medium','high','critical'].map(x=><option key={x}>{x}</option>)}</select></div><div className="px-field"><label>Due</label><input type="datetime-local" value={form.due_at||''} onChange={e=>setForm(f=>({...f,due_at:e.target.value}))}/></div></div>
      <div className="px-form-grid"><div className="px-field"><label>Estimated minutes</label><input type="number" min="5" max="480" step="5" value={form.estimated_minutes} onChange={e=>setForm(f=>({...f,estimated_minutes:Number(e.target.value)}))}/></div><div className="px-field"><label>Impact (1–5)</label><input type="number" min="1" max="5" value={form.impact} onChange={e=>setForm(f=>({...f,impact:Number(e.target.value)}))}/></div></div>
      <div className="px-form-grid"><div className="px-field"><label>Strategic weight (1–5)</label><input type="number" min="1" max="5" value={form.strategic_weight} onChange={e=>setForm(f=>({...f,strategic_weight:Number(e.target.value)}))}/></div><div className="px-field"><label>Blocked reason</label><input value={form.blocked_reason||''} onChange={e=>setForm(f=>({...f,blocked:!!e.target.value,blocked_reason:e.target.value}))} placeholder="Leave blank if actionable"/></div></div>
    </div><div className="px-form-actions"><Button variant="secondary" onClick={()=>setDrawer(null)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving?'Saving…':'Save work item'}</Button></div></div></div>}
  </div>;
}
