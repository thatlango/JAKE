import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Icon, LoadingRows, PageHeader, Pill, StateBanner, relativeDate } from '../components/ProductUI';

const DEFAULT_PROJECT={name:'',emoji:'📁',description:'',tech:'',status:'Planning',priority:'Medium',color:'#245c46'};
const DEFAULT_TASK={title:'',description:'',status:'ready',priority:'medium',estimated_minutes:30,due_at:'',impact:3,strategic_weight:3};
const projectTone=p=>String(p).toLowerCase()==='critical'?'danger':String(p).toLowerCase()==='high'?'warning':'neutral';
const healthFor=p=>{
  if(String(p.status).toLowerCase()==='completed')return {label:'Completed',tone:'good'};
  if(Number(p.blocked_tasks||0)>0)return {label:'Needs intervention',tone:'danger'};
  if(Number(p.doing_tasks||0)>0)return {label:'Moving',tone:'good'};
  if(Number(p.open_tasks||0)>0)return {label:'Ready to move',tone:'warning'};
  return {label:'Needs next action',tone:'warning'};
};

export default function Projects({openAI}){
  const[projects,setProjects]=useState([]),[selected,setSelected]=useState(null),[detail,setDetail]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const[projectDrawer,setProjectDrawer]=useState(false),[projectForm,setProjectForm]=useState(DEFAULT_PROJECT),[taskForm,setTaskForm]=useState(DEFAULT_TASK),[showTask,setShowTask]=useState(false),[saving,setSaving]=useState(false);

  const loadProjects=useCallback(async()=>{setLoading(true);setError('');try{const r=await fetch('/api/work/projects');if(!r.ok)throw new Error('Projects could not be loaded.');const d=await r.json();setProjects(d.projects||[]);setSelected(s=>s||(d.projects?.[0]?.id??null));}catch(e){setError(e.message);}setLoading(false);},[]);
  const loadDetail=useCallback(async id=>{if(!id){setDetail(null);return;}try{const r=await fetch(`/api/work/projects/${encodeURIComponent(id)}`);if(!r.ok)throw new Error('Project detail could not be loaded.');setDetail(await r.json());}catch(e){setError(e.message);}},[]);
  useEffect(()=>{loadProjects();},[loadProjects]);useEffect(()=>{loadDetail(selected);},[selected,loadDetail]);

  const createProject=async()=>{if(!projectForm.name.trim())return;setSaving(true);const r=await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...projectForm,name:projectForm.name.trim(),tasks:[]})});const d=await r.json().catch(()=>({}));if(!r.ok)setError(d.error||'Could not create project.');else{setProjectDrawer(false);setProjectForm(DEFAULT_PROJECT);await loadProjects();setSelected(d.project?.id||selected);}setSaving(false);};
  const createTask=async()=>{if(!taskForm.title.trim()||!selected)return;setSaving(true);const body={...taskForm,title:taskForm.title.trim(),project_id:selected,due_at:taskForm.due_at?new Date(taskForm.due_at).toISOString():null};const r=await fetch('/api/work/items',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)setError(d.error||'Could not create task.');else{setTaskForm(DEFAULT_TASK);setShowTask(false);await Promise.all([loadProjects(),loadDetail(selected)]);}setSaving(false);};
  const completeTask=async item=>{await fetch(`/api/work/items/${encodeURIComponent(item.id)}/complete`,{method:'POST'});await Promise.all([loadProjects(),loadDetail(selected)]);};
  const setTaskStatus=async(item,status)=>{await fetch(`/api/work/items/${encodeURIComponent(item.id)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,version:item.version})});await Promise.all([loadProjects(),loadDetail(selected)]);};
  const deleteTask=async item=>{if(!confirm('Remove this work item from the active system?'))return;await fetch(`/api/work/items/${encodeURIComponent(item.id)}`,{method:'DELETE'});await Promise.all([loadProjects(),loadDetail(selected)]);};
  const deleteProject=async()=>{if(!detail?.project||!confirm(`Delete ${detail.project.name}? Its tasks will stay in JakeOS without a project.`))return;const r=await fetch(`/api/work/projects/${encodeURIComponent(detail.project.id)}`,{method:'DELETE'});if(!r.ok)return setError('Project could not be deleted.');setSelected(null);setDetail(null);await loadProjects();};
  const progress=useMemo(()=>{const s=detail?.summary;if(!s?.total)return 0;return Math.round((s.completed/s.total)*100);},[detail]);
  const nextAction=useMemo(()=>{
    const rows=(detail?.items||[]).filter(x=>!['done','cancelled'].includes(x.status));
    return rows.sort((a,b)=>{
      if(Boolean(a.blocked)!==Boolean(b.blocked))return a.blocked?1:-1;
      if(a.due_at&&b.due_at)return new Date(a.due_at)-new Date(b.due_at);
      if(a.due_at)return -1;if(b.due_at)return 1;
      return Number(b.priority_score||0)-Number(a.priority_score||0);
    })[0]||null;
  },[detail]);
  const activeCount=projects.filter(p=>['Active','In Development'].includes(p.status)).length;
  const blockedCount=projects.reduce((s,p)=>s+Number(p.blocked_tasks||0),0);
  const openCount=projects.reduce((s,p)=>s+Number(p.open_tasks||0),0);

  return <div className="module">
    <PageHeader eyebrow="Delivery" title="Projects" subtitle="See project health, the next milestone-sized action, and the canonical work that also feeds Momentum." actions={<><Button variant="secondary" icon="refresh" onClick={loadProjects}>Refresh</Button><Button icon="plus" onClick={()=>setProjectDrawer(true)}>New project</Button></>}/>
    {error&&<StateBanner tone="danger" title="Project data needs attention">{error}</StateBanner>}
    <div className="px-status-ribbon" aria-label="Project status"><div className="px-status-ribbon-item"><strong>{projects.length}</strong><span>projects</span></div><div className="px-status-ribbon-item"><strong>{activeCount}</strong><span>active</span></div><div className="px-status-ribbon-item" data-alert={blockedCount>0}><strong>{blockedCount}</strong><span>blocked tasks</span></div><div className="px-status-ribbon-item"><strong>{openCount}</strong><span>open tasks</span></div></div>

    <div className="projects-layout">
      <div className="projects-list">
        {loading?<LoadingRows count={5}/>:projects.length===0?<EmptyState icon="folder" title="No projects yet" body="Create the first workstream. Its tasks will automatically become part of JakeOS priority intelligence." action={<Button variant="tonal" onClick={()=>setProjectDrawer(true)}>Create project</Button>}/>:projects.map(p=>{
          const total=Number(p.total_tasks||0),done=Number(p.completed_tasks||0),pct=total?Math.round(done/total*100):0,health=healthFor(p);
          return <button key={p.id} className={`project-card ${selected===p.id?'project-card--active':''}`} onClick={()=>setSelected(p.id)} style={{width:'100%',textAlign:'left',cursor:'pointer'}}>
            <div className="project-card-top"><span className="project-card-emoji"><Icon name="folder" size={18}/></span><div className="project-card-info"><div className="project-card-name">{p.name}</div><div className="project-card-tech">{p.tech||p.status}</div></div><Pill tone={projectTone(p.priority)}>{p.priority}</Pill></div>
            <div className={`px-project-health ${health.tone==='danger'?'px-project-health--danger':health.tone==='warning'?'px-project-health--warning':''}`}>{health.label}</div>
            <p className="project-card-desc">{p.description||'No project outcome or description recorded yet.'}</p>
            {total>0?<><div className="project-card-footer"><div className="progress-bar"><div className="progress-fill" style={{width:`${pct}%`,background:'var(--px-brand)'}}/></div><span className="progress-label">{pct}%</span></div><div className="task-summary">{p.open_tasks||0} open · {p.doing_tasks||0} doing · {p.blocked_tasks||0} blocked</div></>:<div className="px-project-next"><strong>No task progress yet.</strong> Add the next concrete action.</div>}
          </button>;
        })}
      </div>
      <div className="project-detail">
        {!selected?<EmptyState icon="folder" title="Choose a project" body="Select a workstream to see its health and work items."/>:!detail?<LoadingRows count={5}/>:<>
          <div className="detail-header" style={{borderBottomColor:detail.project.color||'var(--px-brand)'}}><span className="detail-emoji"><Icon name="folder" size={22}/></span><div style={{flex:1,minWidth:0}}><div className="detail-name">{detail.project.name}</div><div className="detail-tech">{detail.project.description||detail.project.tech||'Project workstream'}</div></div><div className="px-row"><Button variant="secondary" icon="spark" onClick={()=>openAI(`Project ${detail.project.name}. Status ${detail.project.status}. ${detail.summary.open} open tasks, ${detail.summary.blocked} blocked, ${progress}% complete. Next currently actionable task: ${nextAction?.title||'none recorded'}. Give me the three decisions that would move it forward.`)}>Review</Button><button className="px-icon-button" title="Delete project" onClick={deleteProject}>×</button></div></div>
          <div style={{padding:'12px 18px',borderBottom:'1px solid var(--px-border)'}}><div className="px-between"><div className="px-row" style={{flexWrap:'wrap'}}><Pill tone="brand">{detail.project.status}</Pill><Pill tone={projectTone(detail.project.priority)}>{detail.project.priority}</Pill>{detail.summary.blocked>0&&<Pill tone="warning">{detail.summary.blocked} blocked</Pill>}</div><span className="px-kicker">{detail.summary.total?`${progress}% complete`:'Progress starts with the first task'}</span></div>{nextAction&&<div className="px-project-next"><span className="px-brief-label" style={{display:'inline',marginRight:6}}>Next action</span><strong>{nextAction.title}</strong>{nextAction.due_at&&<> · {relativeDate(nextAction.due_at)}</>}</div>}</div>
          <div className="task-list">
            <div className="px-between" style={{margin:'6px 0 10px'}}><div><div className="px-list-title">Project work</div><div className="px-list-sub">The same tasks surface in Work and Momentum.</div></div><Button variant="tonal" icon="plus" onClick={()=>setShowTask(v=>!v)}>Add task</Button></div>
            {showTask&&<div className="px-panel" style={{padding:14,marginBottom:12,boxShadow:'none'}}><div className="px-field"><label>Task</label><input autoFocus value={taskForm.title} onChange={e=>setTaskForm(f=>({...f,title:e.target.value}))} placeholder="Actionable outcome"/></div><div className="px-form-grid" style={{marginTop:10}}><div className="px-field"><label>Priority</label><select value={taskForm.priority} onChange={e=>setTaskForm(f=>({...f,priority:e.target.value}))}>{['low','medium','high','critical'].map(x=><option key={x}>{x}</option>)}</select></div><div className="px-field"><label>Due</label><input type="datetime-local" value={taskForm.due_at} onChange={e=>setTaskForm(f=>({...f,due_at:e.target.value}))}/></div></div><div className="px-form-actions"><Button variant="secondary" onClick={()=>setShowTask(false)}>Cancel</Button><Button onClick={createTask} disabled={saving}>{saving?'Saving…':'Add task'}</Button></div></div>}
            {detail.items.length===0?<EmptyState icon="check" title="No project tasks" body="Add the next concrete action. Avoid turning the project description into a second task list."/>:<div>{detail.items.map(item=><div className="px-task" key={item.id}><button className="px-check" onClick={()=>completeTask(item)} disabled={item.status==='done'}><Icon name="check" size={15}/></button><div><div className="px-task-title" style={item.status==='done'?{textDecoration:'line-through',color:'var(--px-dim)'}:{}}>{item.title}</div><div className="px-task-meta"><Pill tone={item.status==='doing'?'brand':item.status==='waiting'?'warning':item.status==='done'?'success':'neutral'}>{item.status}</Pill><Pill tone={projectTone(item.priority)}>{item.priority}</Pill>{item.due_at&&<Pill tone={new Date(item.due_at)<new Date()&&item.status!=='done'?'danger':'neutral'}>{relativeDate(item.due_at)}</Pill>}{item.blocked&&<Pill tone="warning">blocked</Pill>}</div></div><div className="px-row">{item.status!=='done'&&<button className="px-icon-button" title={item.status==='doing'?'Move to ready':'Start'} onClick={()=>setTaskStatus(item,item.status==='doing'?'ready':'doing')}><Icon name="arrow"/></button>}<button className="px-icon-button" title="Remove" onClick={()=>deleteTask(item)}>×</button></div></div>)}</div>}
          </div>
        </>}
      </div>
    </div>

    {projectDrawer&&<div className="px-drawer" onMouseDown={e=>e.target===e.currentTarget&&setProjectDrawer(false)}><div className="px-drawer-card"><PageHeader eyebrow="New workstream" title="Create project" subtitle="Keep the project outcome clear; tasks belong in the canonical work queue." actions={<button className="px-icon-button" onClick={()=>setProjectDrawer(false)}>×</button>}/><div className="px-stack"><div className="px-form-grid"><div className="px-field"><label>Name</label><input autoFocus value={projectForm.name} onChange={e=>setProjectForm(f=>({...f,name:e.target.value}))}/></div><div className="px-field"><label>Area</label><input value={projectForm.tech} onChange={e=>setProjectForm(f=>({...f,tech:e.target.value}))} placeholder="Client, product or programme"/></div></div><div className="px-field"><label>Outcome / description</label><textarea value={projectForm.description} onChange={e=>setProjectForm(f=>({...f,description:e.target.value}))}/></div><div className="px-form-grid"><div className="px-field"><label>Status</label><select value={projectForm.status} onChange={e=>setProjectForm(f=>({...f,status:e.target.value}))}>{['Planning','In Development','Active','Paused','Completed'].map(x=><option key={x}>{x}</option>)}</select></div><div className="px-field"><label>Priority</label><select value={projectForm.priority} onChange={e=>setProjectForm(f=>({...f,priority:e.target.value}))}>{['Low','Medium','High','Critical'].map(x=><option key={x}>{x}</option>)}</select></div></div></div><div className="px-form-actions"><Button variant="secondary" onClick={()=>setProjectDrawer(false)}>Cancel</Button><Button onClick={createProject} disabled={saving}>{saving?'Creating…':'Create project'}</Button></div></div></div>}
  </div>;
}
