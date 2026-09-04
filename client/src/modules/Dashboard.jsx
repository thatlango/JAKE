import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon, StateBanner, formatMoney, relativeDate } from '../components/ProductUI';

const DAY_LABELS=['S','M','T','W','T','F','S'];
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const dateKey=value=>{if(!value)return null;const d=new Date(value);return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10);};
const toneForStatus=value=>String(value||'').toLowerCase().includes('ready')?'ready':String(value||'').toLowerCase().includes('pending')?'pending':'progress';

function ArrowButton({label,onClick}){return <button className="jd-arrow-button" aria-label={label} onClick={onClick}><Icon name="arrow" size={15}/></button>;}

function StatCard({label,value,helper,icon,highlight=false,onClick}){
  return <button className={`jd-stat-card ${highlight?'jd-stat-card--highlight':''}`} onClick={onClick}>
    <div className="jd-stat-top"><span>{label}</span><ArrowButton label={`Open ${label}`}/></div>
    <strong>{value}</strong>
    <div className="jd-stat-helper">{icon&&<Icon name={icon} size={14}/>}<span>{helper}</span></div>
  </button>;
}

function TimerCard({minutes=30}){
  const initial=Math.max(5,Number(minutes)||30)*60;
  const[remaining,setRemaining]=useState(initial),[running,setRunning]=useState(false);
  useEffect(()=>{setRemaining(initial);setRunning(false);},[initial]);
  useEffect(()=>{if(!running||remaining<=0)return;const t=setInterval(()=>setRemaining(v=>v>0?v-1:0),1000);return()=>clearInterval(t);},[running,remaining]);
  const h=Math.floor(remaining/3600),m=Math.floor((remaining%3600)/60),s=remaining%60;
  const display=[h,m,s].map(v=>String(v).padStart(2,'0')).join(':');
  return <section className="jd-timer-card">
    <div className="jd-card-title jd-card-title--light">Time block</div>
    <div className="jd-timer-pattern" aria-hidden="true"/>
    <div className="jd-timer-value">{display}</div>
    <div className="jd-timer-controls">
      <button className="jd-timer-control" onClick={()=>setRunning(v=>!v)} aria-label={running?'Pause timer':'Start timer'}>{running?'Ⅱ':'▶'}</button>
      <button className="jd-timer-control jd-timer-control--stop" onClick={()=>{setRunning(false);setRemaining(initial);}} aria-label="Reset timer">■</button>
    </div>
  </section>;
}

export default function Dashboard({openAI,navigate}){
  const[data,setData]=useState({overview:null,today:null,projects:[],clients:[],items:[],events:[]});
  const[loading,setLoading]=useState(true),[error,setError]=useState('');
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const now=new Date(),to=new Date(Date.now()+7*86400000);
      const endpoints=[
        '/api/overview','/api/work/today?limit=7','/api/work/projects','/api/crm/clients','/api/work/items?limit=300',
        `/api/calendar/events?from=${now.toISOString().slice(0,10)}&to=${to.toISOString().slice(0,10)}`
      ];
      const responses=await Promise.all(endpoints.map(url=>fetch(url)));
      if(responses.some(r=>!r.ok))throw new Error('Command-center data could not be loaded.');
      const[overview,today,projects,crm,items,events]=await Promise.all(responses.map(r=>r.json()));
      setData({overview,today,projects:projects.projects||[],clients:crm.clients||[],items:items.items||[],events:events.events||[]});
    }catch(e){setError(e.message||'JakeOS could not load the dashboard.');}
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  const overview=data.overview||{},tasks=overview.tasks||{},pipeline=overview.pipeline||{},estate=overview.estate||{},estateTotal=estate.totals||{};
  const priorities=data.today?.priorities||[],focus=priorities[0]||null;
  const upcoming=data.events.filter(e=>!e.done);
  const collaborators=useMemo(()=>[...data.clients].sort((a,b)=>{
    const af=a.next_followup?new Date(a.next_followup).getTime():Infinity,bf=b.next_followup?new Date(b.next_followup).getTime():Infinity;
    if(af!==bf)return af-bf;
    return String(a.name||'').localeCompare(String(b.name||''));
  }).slice(0,4),[data.clients]);

  const week=useMemo(()=>{
    const now=new Date(),sunday=new Date(now);sunday.setHours(0,0,0,0);sunday.setDate(now.getDate()-now.getDay());
    const days=Array.from({length:7},(_,i)=>{const d=new Date(sunday);d.setDate(sunday.getDate()+i);return d;});
    const counts=days.map(day=>{
      const key=day.toISOString().slice(0,10);
      return data.items.filter(item=>dateKey(item.scheduled_start||item.due_at)===key&& !['done','cancelled'].includes(item.status)).length;
    });
    const max=Math.max(...counts,1);
    return days.map((d,i)=>({label:DAY_LABELS[i],count:counts[i],height:counts[i]?clamp(38+(counts[i]/max)*54,38,92):34,today:d.toDateString()===now.toDateString()}));
  },[data.items]);

  const projectTotals=useMemo(()=>data.projects.reduce((acc,p)=>{
    acc.total+=Number(p.total_tasks||0);acc.complete+=Number(p.completed_tasks||0);acc.open+=Number(p.open_tasks||0);return acc;
  },{total:0,complete:0,open:0}),[data.projects]);
  const projectPct=projectTotals.total?Math.round(projectTotals.complete/projectTotals.total*100):0;
  const priorityHigh=priorities.filter(x=>['high','critical'].includes(String(x.priority).toLowerCase())).length;

  return <div className="module jd-dashboard">
    {error&&<StateBanner tone="danger" title="Dashboard could not refresh">{error}</StateBanner>}
    <header className="jd-dashboard-head">
      <div><h1>Dashboard</h1><p>Plan, prioritise, and move the right work forward with clarity.</p></div>
      <div className="jd-dashboard-actions">
        <button className="jd-primary-action" onClick={()=>openAI('Use the live JakeOS context to tell me what deserves my attention now, what can wait, and what the best next action is.')}><Icon name="spark" size={17}/>Ask Jake</button>
        <button className="jd-outline-action" onClick={load}><Icon name="refresh" size={16}/>Refresh now</button>
      </div>
    </header>

    <section className="jd-stats-grid" aria-label="Command center metrics">
      <StatCard label="Open work" value={loading?'—':tasks.open??0} helper={`${priorityHigh} high priority`} icon="warning" highlight onClick={()=>navigate('work')}/>
      <StatCard label="Active pipeline" value={loading?'—':pipeline.active??0} helper={`${formatMoney(pipeline.active_value_usd||0,'USD')} tracked`} icon="money" onClick={()=>navigate('pipeline')}/>
      <StatCard label="Upcoming events" value={loading?'—':upcoming.length} helper="Next 7 days" icon="calendar" onClick={()=>navigate('calendar')}/>
      <StatCard label="Estate active users" value={loading?'—':estateTotal.activeUsers7d??0} helper={`${estateTotal.products??estate.products?.length??0} tools · 7 days`} icon="users" onClick={()=>navigate('estate')}/>
    </section>

    <section className="jd-mid-grid">
      <article className="jd-card jd-work-rhythm">
        <div className="jd-card-title">Work rhythm</div>
        <div className="jd-rhythm-chart">
          {week.map((d,i)=><div className="jd-rhythm-day" key={`${d.label}-${i}`}><div className={`jd-rhythm-bar ${d.count?'jd-rhythm-bar--active':'jd-rhythm-bar--idle'} ${d.today?'jd-rhythm-bar--today':''}`} style={{height:`${d.height}%`}}>{d.today&&<span>{d.count||0}</span>}</div><small>{d.label}</small></div>)}
        </div>
        <p className="jd-chart-caption">Scheduled and due work across this week</p>
      </article>

      <article className="jd-card jd-focus-card">
        <div className="jd-card-title">Focus now</div>
        {focus?<><h2>{focus.title}</h2><p>{focus.project_name||'Canonical JakeOS work'}</p><div className="jd-focus-time"><Icon name="clock" size={16}/>{focus.estimated_minutes||30} min</div><button className="jd-primary-action jd-focus-action" onClick={()=>navigate('work')}><span className="jd-play">▶</span>Start next action</button></>:<div className="jd-empty-compact">Nothing is forcing attention right now.</div>}
      </article>

      <article className="jd-card jd-priority-card">
        <div className="jd-card-head-row"><div className="jd-card-title">Priority queue</div><button className="jd-mini-action" onClick={()=>navigate('work')}><Icon name="plus" size={14}/>New</button></div>
        <div className="jd-priority-list">
          {priorities.slice(0,5).map((item,index)=><button key={item.id} className="jd-priority-row" onClick={()=>navigate('work')}><span className={`jd-priority-icon jd-priority-icon--${index%5}`}><Icon name={['spark','target','document','estate','chart'][index%5]} size={16}/></span><span><strong>{item.title}</strong><small>{item.due_at?relativeDate(item.due_at):item.project_name||'Ready when you are'}</small></span></button>)}
          {!loading&&!priorities.length&&<div className="jd-empty-compact">No ranked work in the queue.</div>}
        </div>
      </article>
    </section>

    <section className="jd-bottom-grid">
      <article className="jd-card jd-collaborators-card">
        <div className="jd-card-head-row"><div className="jd-card-title">Key collaborators</div><button className="jd-mini-action" onClick={()=>navigate('crm')}><Icon name="plus" size={14}/>Add contact</button></div>
        <div className="jd-collaborator-list">
          {collaborators.map((person,index)=>{const state=person.next_followup?'Pending':person.status||'Active';return <button className="jd-collaborator-row" key={person.id} onClick={()=>navigate('crm')}><span className={`jd-avatar jd-avatar--${index%4}`}>{person.avatar_emoji||String(person.name||'?').slice(0,1)}</span><span className="jd-collaborator-copy"><strong>{person.name}</strong><small>{person.org||person.role||person.type||'Relationship'}</small></span><em className={`jd-status jd-status--${toneForStatus(state)}`}>{state}</em></button>;})}
          {!loading&&!collaborators.length&&<div className="jd-empty-compact">Relationship intelligence will surface collaborators here.</div>}
        </div>
      </article>

      <article className="jd-card jd-progress-card">
        <div className="jd-card-title">Project progress</div>
        <div className="jd-progress-wrap">
          <div className="jd-progress-gauge" style={{'--progress':`${projectPct*1.8}deg`}}><div><strong>{projectPct}%</strong><span>Projects moved</span></div></div>
        </div>
        <div className="jd-progress-legend"><span><i className="jd-dot jd-dot--complete"/>Completed</span><span><i className="jd-dot jd-dot--progress"/>In progress</span><span><i className="jd-dot jd-dot--pending"/>Pending</span></div>
      </article>

      <TimerCard minutes={focus?.estimated_minutes||30}/>
    </section>
  </div>;
}
