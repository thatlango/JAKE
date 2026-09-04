import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Icon, LoadingRows, Metric, PageHeader, Panel, Pill, StateBanner, formatMoney, relativeDate } from '../components/ProductUI';

const severityTone=s=>s==='critical'||s==='high'?'danger':s==='medium'?'warning':'info';

export default function Dashboard({openAI,navigate}){
  const[overview,setOverview]=useState(null),[today,setToday]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const load=useCallback(async()=>{setLoading(true);setError('');try{const[a,b]=await Promise.all([fetch('/api/overview'),fetch('/api/work/today?limit=7')]);if(!a.ok||!b.ok)throw new Error('Command-center data could not be loaded.');setOverview(await a.json());setToday(await b.json());}catch(e){setError(e.message||'JakeOS could not load the overview.');}setLoading(false);},[]);
  useEffect(()=>{load();},[load]);
  const estate=overview?.estate||{},tasks=overview?.tasks||{},pipeline=overview?.pipeline||{},invoices=overview?.invoices||{},opportunities=overview?.opportunities||{};
  const estateTotal=estate.totals||{};
  const urgent=useMemo(()=>[...(overview?.attention_signals||[])].slice(0,6),[overview]);
  const first=today?.priorities?.[0];
  const priorities=today?.priorities||[];
  const greeting=new Date().getHours()<12?'Good morning':new Date().getHours()<18?'Good afternoon':'Good evening';
  const brief=useMemo(()=>{
    if(loading)return 'Reading your work, calendar, business development and estate signals…';
    const parts=[];
    if(tasks.overdue)parts.push(`${tasks.overdue} overdue work item${Number(tasks.overdue)===1?'':'s'} need a decision`);
    else if(priorities.length)parts.push(`${priorities.length} ranked work item${priorities.length===1?'':'s'} are currently actionable`);
    else parts.push('there is no urgent work competing for attention');
    if(urgent.length)parts.push(`${urgent.length} exception signal${urgent.length===1?'':'s'} ${urgent.length===1?'is':'are'} unresolved`);
    if(pipeline.deadlines_14d)parts.push(`${pipeline.deadlines_14d} pipeline deadline${Number(pipeline.deadlines_14d)===1?'':'s'} fall within 14 days`);
    return `${parts.join('; ')}. ${first?`The strongest next move is ${first.title}.`:'JakeOS does not currently see a single action that should dominate the rest.'}`;
  },[loading,tasks.overdue,priorities,urgent.length,pipeline.deadlines_14d,first]);

  return <div className="module">
    <PageHeader eyebrow="Command center" title={`${greeting}.`} subtitle="What changed, what deserves attention, and where your time should go next." actions={<Button variant="secondary" icon="refresh" onClick={load}>Refresh</Button>}/>
    {error&&<StateBanner tone="danger" title="Overview could not refresh">{error}</StateBanner>}
    {estate.stale&&<StateBanner tone="warning" title="Estate data is cached">The product telemetry below is the last successful snapshot, not a fresh zero.</StateBanner>}

    <div className="px-brief">
      <section className="px-brief-main">
        <div className="px-brief-label">Jake brief</div>
        <h2>{first?`Start with ${first.title}`:'Your attention is relatively clear'}</h2>
        <p>{brief}</p>
        <div className="px-brief-actions">
          {first&&<Button onClick={()=>navigate('work')}>Start next action</Button>}
          <Button variant="tonal" icon="spark" onClick={()=>openAI('Use the live JakeOS command-center context to give me a short prioritised briefing: what changed, what is urgent, what should I do next, and what can wait. Do not repeat dashboard numbers without interpreting them.')}>Brief me</Button>
          <Button variant="ghost" onClick={()=>navigate('calendar')}>Check calendar</Button>
        </div>
      </section>
      <section className="px-brief-side">
        <div className="px-brief-label">Focus now</div>
        {first?<><div className="px-focus-title">{first.title}</div><p className="px-muted" style={{fontSize:12.5,lineHeight:1.58,margin:'0 0 14px'}}>{first.why_now||'This is the strongest currently actionable item.'}</p><div className="px-row" style={{flexWrap:'wrap'}}>{first.project_name&&<Pill tone="brand">{first.project_name}</Pill>}<Pill>{first.estimated_minutes||30} min</Pill>{first.due_at&&<Pill tone={new Date(first.due_at)<new Date()?'danger':'neutral'}>{relativeDate(first.due_at)}</Pill>}</div></>:<EmptyState icon="check" title="No forced focus" body="Nothing is currently ranked far enough above the rest to demand the next block of time."/>}
      </section>
    </div>

    <div className="px-metrics">
      <Metric icon="check" label="Open work" value={loading?'—':tasks.open??0} helper={`${tasks.overdue??0} overdue · ${tasks.blocked??0} blocked`} tone={tasks.overdue?'danger':'neutral'}/>
      <Metric icon="target" label="Active pipeline" value={loading?'—':pipeline.active??0} helper={formatMoney(pipeline.active_value_usd||0,'USD')} tone="warning"/>
      <Metric icon="money" label="Receivables" value={loading?'—':formatMoney(invoices.receivables_value||0,'USD')} helper={`${invoices.overdue_count??0} overdue invoice${Number(invoices.overdue_count)===1?'':'s'}`} tone={invoices.overdue_count?'danger':'success'}/>
      <Metric icon="estate" label="Estate active users" value={loading?'—':estateTotal.activeUsers7d??0} helper={`${estateTotal.products??estate.products?.length??0} tools · 7 days`} tone="success"/>
    </div>

    <div className="px-grid-2">
      <div className="px-stack">
        <Panel title="Do next" subtitle="A human-readable shortlist from the canonical JakeOS work queue." action={<Button variant="ghost" icon="arrow" onClick={()=>navigate('work')}>Open Work</Button>}>
          {loading?<LoadingRows count={4}/>:priorities.length?<div>{priorities.slice(0,5).map((item,index)=><div className="px-task" key={item.id}><div className="px-kicker" style={{paddingTop:4,width:24,textAlign:'center'}}>{index+1}</div><div><div className="px-task-title">{item.title}</div><div className="px-task-reason">{item.why_now}</div><div className="px-task-meta">{index===0&&<span className="px-guidance">Best next</span>}{item.project_name&&<Pill tone="brand">{item.project_name}</Pill>}<Pill tone={item.priority==='critical'?'danger':item.priority==='high'?'warning':'neutral'}>{item.priority}</Pill>{item.due_at&&<Pill tone={new Date(item.due_at)<new Date()?'danger':'neutral'}>{relativeDate(item.due_at)}</Pill>}</div></div><div className="px-kicker">{item.estimated_minutes||30} min</div></div>)}</div>:<EmptyState icon="check" title="Nothing urgent is queued" body="Capture work in JakeOS or Momentum and the ranking engine will surface it here." action={<Button variant="tonal" onClick={()=>navigate('work')}>Open Work</Button>}/>}
        </Panel>
        <Panel title="Needs attention" subtitle="Exceptions across work, deadlines, money and connected services." action={<Button variant="ghost" onClick={()=>navigate('work')}>Review all</Button>}>
          {loading?<LoadingRows count={3}/>:urgent.length?<div className="px-list">{urgent.map(signal=><div className="px-list-row" key={signal.id}><div className="px-metric-icon" style={{margin:0,width:36,height:36,background:signal.severity==='high'?'var(--px-danger-soft)':'var(--px-warning-soft)',color:signal.severity==='high'?'var(--px-danger)':'var(--px-warning)'}}><Icon name="warning" size={17}/></div><div className="px-list-main"><div className="px-list-title">{signal.title}</div><div className="px-list-sub">{signal.summary||signal.source}</div></div><Pill tone={severityTone(signal.severity)}>{signal.severity}</Pill></div>)}</div>:<EmptyState icon="check" title="No exception signals" body="JakeOS has no unresolved cross-work signals to surface right now."/>}
        </Panel>
      </div>
      <div className="px-stack">
        <Panel title="Business development" subtitle="Pipeline, opportunities and near-term deadlines." action={<Button variant="ghost" icon="arrow" onClick={()=>navigate('pipeline')}>Pipeline</Button>}>
          <div className="px-grid-3"><div><div className="px-metric-value" style={{fontSize:21}}>{pipeline.active??0}</div><div className="px-kicker">active deals</div></div><div><div className="px-metric-value" style={{fontSize:21}}>{pipeline.deadlines_14d??0}</div><div className="px-kicker">deadlines / 14d</div></div><div><div className="px-metric-value" style={{fontSize:21}}>{opportunities.high_relevance??0}</div><div className="px-kicker">high-fit opportunities</div></div></div>
        </Panel>
        <Panel title="Tuku Estate" subtitle={estate.available===false?'Telemetry is not currently available':'Observed usage and live commercial activity.'} action={<Button variant="ghost" icon="arrow" onClick={()=>navigate('estate')}>Open Estate</Button>}>
          {estate.available===false?<StateBanner tone="warning" title="Estate telemetry unavailable">{estate.error||'JakeOS could not reach Tuku Core telemetry.'}</StateBanner>:<div className="px-grid-3"><div><div className="px-metric-value" style={{fontSize:21}}>{estateTotal.activeUsers24h??0}</div><div className="px-kicker">active / 24h</div></div><div><div className="px-metric-value" style={{fontSize:21}}>{estateTotal.ordersActive??0}</div><div className="px-kicker">live orders</div></div><div><div className="px-metric-value" style={{fontSize:21}}>{formatMoney(estateTotal.realizedRevenueUGX||0,'UGX')}</div><div className="px-kicker">realized</div></div></div>}
        </Panel>
        {overview?.latest_research_brief&&<Panel title="Latest evidence brief" subtitle={overview.latest_research_brief.brief_date} action={<Button variant="ghost" onClick={()=>navigate('ai-search')}>Search</Button>}><div className="px-list-title">{overview.latest_research_brief.title}</div><p className="px-muted" style={{fontSize:12,lineHeight:1.55,margin:'7px 0 0'}}>{overview.latest_research_brief.summary}</p></Panel>}
      </div>
    </div>
  </div>;
}
