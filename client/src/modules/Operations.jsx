import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Icon, PageHeader, Panel, Pill, StateBanner, relativeDate } from '../components/ProductUI';
import Renewals from './Renewals';

const fmtPct=v=>Number.isFinite(Number(v))?`${Number(v).toFixed(0)}%`:'—';
const fmtMs=v=>Number.isFinite(Number(v))?`${Number(v)} ms`:'—';
const fmtDate=v=>v?new Date(v).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Not recorded';
const daysUntil=v=>v?Math.ceil((new Date(v)-Date.now())/86400000):null;
const age=v=>{if(!v)return'Never';const m=Math.round((Date.now()-new Date(v))/60000);if(m<2)return'Just now';if(m<60)return`${m}m ago`;const h=Math.round(m/60);if(h<48)return`${h}h ago`;return`${Math.round(h/24)}d ago`;};
const uptime=s=>{const n=Number(s||0);if(!n)return'—';const d=Math.floor(n/86400),h=Math.floor((n%86400)/3600);return d?`${d}d ${h}h`:`${h}h`;};
const normalizeSeverity=value=>{const v=String(value||'').toLowerCase();if(['critical','failed','error','unhealthy','danger'].includes(v))return'critical';if(['warning','attention','degraded'].includes(v))return'warning';if(['healthy','ok','passed','operational','success'].includes(v))return'healthy';return'normal';};
const tone=state=>normalizeSeverity(state)==='critical'?'danger':normalizeSeverity(state)==='warning'?'warning':normalizeSeverity(state)==='healthy'?'success':'neutral';
const severityRank={critical:0,warning:1,normal:2,healthy:3};
const STAGES=[
  {id:'needs-attention',label:'Needs attention',icon:'warning'},
  {id:'ready',label:'Ready to act',icon:'check'},
  {id:'in-progress',label:'In progress',icon:'refresh'},
  {id:'waiting',label:'Waiting',icon:'clock'},
  {id:'monitoring',label:'Monitoring',icon:'chart'},
];

function Signal({label,value,detail,state}){
  return <div className="px-metric"><div className="px-between"><span className="px-metric-label">{label}</span>{state&&<Pill tone={tone(state)}>{state}</Pill>}</div><div className="px-metric-value">{value}</div>{detail&&<div className="px-metric-helper">{detail}</div>}</div>;
}

function readinessFor(severity,good=92){
  if(severity==='critical')return 28;
  if(severity==='warning')return 56;
  if(severity==='healthy')return good;
  return 70;
}

function buildPipelineItems(data){
  const items=[];
  (data?.attention||[]).forEach((item,index)=>{
    const severity=normalizeSeverity(item.severity);
    const stage=severity==='critical'?'needs-attention':severity==='warning'?'waiting':'in-progress';
    items.push({
      id:`attention-${item.id||index}`,title:item.title||'Operational exception',product:item.product||item.service||'Estate',type:'Exception',
      stage,severity,readiness:readinessFor(severity),summary:item.summary||'Requires operational review.',dueAt:item.due_at||null,
      actionUrl:item.action_url||null,metric:item.metric||null,source:'Live exception'
    });
  });

  (data?.services||[]).forEach((service,index)=>{
    const status=Number(service.last_status),failures=Number(service.consecutive_failures||0),tlsDays=daysUntil(service.tls_expires_at);
    const ok=status>=200&&status<400&&failures===0;
    const tlsUrgent=tlsDays!=null&&tlsDays<=7,tlsSoon=tlsDays!=null&&tlsDays>7&&tlsDays<=30;
    const severity=!ok||tlsUrgent?'critical':tlsSoon?'warning':'healthy';
    const stage=!ok||tlsUrgent?'needs-attention':tlsSoon?'ready':'monitoring';
    const latency=Number(service.last_latency_ms||0);
    const readiness=!ok?Math.max(18,45-Math.min(failures,5)*5):tlsUrgent?44:tlsSoon?74:Math.max(82,96-Math.min(Math.round(latency/250),10));
    const summary=!ok?(failures?`${failures} consecutive failure${failures===1?'':'s'}`:`HTTP ${service.last_status||'unknown'}`):tlsSoon||tlsUrgent?`TLS expires in ${tlsDays} day${tlsDays===1?'':'s'}`:`HTTP ${status} · ${latency||'—'} ms`;
    items.push({id:`service-${service.id||index}`,title:service.name||service.product||'Production endpoint',product:service.product||'Estate',type:'Service',stage,severity,readiness,summary,dueAt:service.tls_expires_at||null,source:'Endpoint monitor',checkedAt:service.last_checked_at});
  });

  const roots=[],seen=new Set();
  (data?.domains||[]).forEach(domain=>{if(domain.kind!=='registrable'||seen.has(domain.root_domain))return;seen.add(domain.root_domain);roots.push(domain);});
  roots.forEach((domain,index)=>{
    const regDays=daysUntil(domain.expires_at),tlsDays=daysUntil(domain.tls_expires_at),raw=normalizeSeverity(domain.status);
    const minDays=Math.min(...[regDays,tlsDays].filter(v=>v!=null));
    const urgent=Number.isFinite(minDays)&&minDays<=7,soon=Number.isFinite(minDays)&&minDays>7&&minDays<=30;
    const severity=urgent?'critical':soon||raw==='warning'?'warning':raw==='critical'?'critical':'healthy';
    const stage=severity==='critical'?'needs-attention':severity==='warning'?'ready':'monitoring';
    const summary=Number.isFinite(minDays)?`Next renewal in ${minDays} day${minDays===1?'':'s'}`:(domain.registrar||'Registration and TLS are being monitored');
    items.push({id:`domain-${domain.root_domain||index}`,title:domain.root_domain||domain.host||'Domain',product:'Domains',type:'Domain',stage,severity,readiness:readinessFor(severity,94),summary,dueAt:[domain.expires_at,domain.tls_expires_at].filter(Boolean).sort()[0]||null,source:'Domain monitor'});
  });

  const host=data?.hosts?.[0],containers=Array.isArray(host?.snapshot?.containers)?host.snapshot.containers:[];
  containers.filter(c=>String(c.health||'').toLowerCase()==='unhealthy'||String(c.status||'').toLowerCase().includes('restarting')||String(c.status||'').toLowerCase().includes('exited')).forEach((container,index)=>{
    items.push({id:`container-${container.name||index}`,title:container.name||'Container',product:host?.label||'Production VPS',type:'Runtime',stage:'needs-attention',severity:'critical',readiness:24,summary:container.status||container.health||'Runtime problem detected',dueAt:null,source:'Host agent'});
  });

  const platform=host?.snapshot?.platform||{};
  const platformSignals=[
    ['status','Platform',platform.status],['workers','Workers',platform.workers],['databases','Databases',platform.databases],['security','Security',platform.security],['offsiteBackup','Off-site backup',platform.offsiteBackup],['restore','Restore test',platform.restore]
  ];
  platformSignals.forEach(([key,label,signal])=>{
    if(!signal||typeof signal!=='object')return;
    const state=key==='restore'?(signal.ok===true?'passed':signal.ok===false?'failed':'unknown'):(signal.severity||signal.state||'unknown');
    const severity=normalizeSeverity(state);
    const stage=severity==='critical'?'needs-attention':severity==='warning'?'waiting':severity==='healthy'?'monitoring':'in-progress';
    const reasons=Array.isArray(signal.reasons)?signal.reasons.filter(Boolean):[];
    const summary=reasons.slice(0,2).join(' · ')||((signal.checked_at||signal.finished_at)?`Checked ${age(signal.checked_at||signal.finished_at)}`:'Collector status available');
    items.push({id:`platform-${key}`,title:label,product:'Platform',type:'Control',stage,severity,readiness:readinessFor(severity,93),summary,dueAt:null,source:'Platform collector',checkedAt:signal.checked_at||signal.finished_at});
  });
  return items;
}

function Readiness({value,severity}){
  const active=Math.max(0,Math.min(10,Math.round(Number(value||0)/10)));
  return <div className="op-readiness"><strong>{Math.round(Number(value||0))}%</strong><span className={`op-bars op-bars--${severity}`}>{Array.from({length:10}).map((_,i)=><i key={i} data-active={i<active}/>)}</span><small>{severity==='healthy'?'High':severity==='critical'?'Low':'Medium'}</small></div>;
}

function PipelineCard({item}){
  return <article className={`op-card op-card--${item.severity}`}>
    <div className="op-card-head"><div><strong>{item.title}</strong><span>{item.product} · {item.type}</span></div>{item.actionUrl&&<a href={item.actionUrl} className="op-card-open" aria-label={`Open ${item.title}`}><Icon name="arrow" size={14}/></a>}</div>
    <Readiness value={item.readiness} severity={item.severity}/>
    <div className="op-card-status"><span className={`op-dot op-dot--${item.severity}`}/><span>{item.summary}</span></div>
    <div className="op-card-foot"><div><span>Source</span><strong>{item.source}</strong></div><div><span>Due</span><strong>{item.dueAt?relativeDate(item.dueAt):'Continuous'}</strong></div></div>
  </article>;
}

function PipelineList({items}){
  return <div className="op-list-wrap"><table className="op-list"><thead><tr><th>Work item</th><th>Stage</th><th>Readiness</th><th>Signal</th><th>Due</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td><strong>{item.title}</strong><span>{item.product} · {item.type}</span></td><td><Pill tone={tone(item.severity)}>{STAGES.find(s=>s.id===item.stage)?.label||item.stage}</Pill></td><td>{item.readiness}%</td><td>{item.summary}</td><td>{item.dueAt?relativeDate(item.dueAt):'Continuous'}</td></tr>)}</tbody></table></div>;
}

function PipelineTimeline({items}){
  const dated=items.filter(x=>x.dueAt).sort((a,b)=>new Date(a.dueAt)-new Date(b.dueAt)),continuous=items.filter(x=>!x.dueAt);
  return <div className="op-timeline"><div className="op-timeline-lane"><h3>Scheduled</h3>{dated.length?dated.map(item=><div className="op-timeline-row" key={item.id}><time>{relativeDate(item.dueAt)}</time><span className={`op-timeline-marker op-timeline-marker--${item.severity}`}/><div><strong>{item.title}</strong><span>{item.product} · {item.summary}</span></div></div>):<EmptyState icon="calendar" title="No scheduled operational deadlines" body="Continuous controls remain visible below."/>}</div><div className="op-timeline-lane"><h3>Continuous controls</h3>{continuous.map(item=><div className="op-timeline-row" key={item.id}><time>Live</time><span className={`op-timeline-marker op-timeline-marker--${item.severity}`}/><div><strong>{item.title}</strong><span>{item.product} · {item.summary}</span></div></div>)}</div></div>;
}

function HealthView({data,error,load,refreshing}){
  const host=data?.hosts?.[0],containers=Array.isArray(host?.snapshot?.containers)?host.snapshot.containers:[],platform=host?.snapshot?.platform||{};
  const running=containers.filter(c=>c.running!==false&&!String(c.status||'').toLowerCase().includes('exited')).length;
  const badContainers=containers.filter(c=>String(c.health||'').toLowerCase()==='unhealthy'||String(c.status||'').toLowerCase().includes('restarting')||String(c.status||'').toLowerCase().includes('exited'));
  const roots=[];const seen=new Set();(data?.domains||[]).forEach(d=>{if(d.kind!=='registrable'||seen.has(d.root_domain))return;seen.add(d.root_domain);roots.push(d);});
  return <>
    {error&&<StateBanner tone="warning" title="Operations refresh is degraded">{error} The last successful snapshot remains visible.</StateBanner>}
    <div className="px-status-ribbon" aria-label="Estate operational status">
      <div className="px-status-ribbon-item" data-alert={data.status!=='healthy'}><strong>{data.score??'—'}/100</strong><span>estate health</span></div>
      <div className="px-status-ribbon-item"><strong>{data.summary?.servicesHealthy||0}/{data.summary?.servicesTotal||0}</strong><span>services healthy</span></div>
      <div className="px-status-ribbon-item" data-alert={Number(data.summary?.domainsAttention)>0}><strong>{data.summary?.domainsAttention||0}</strong><span>domain issues</span></div>
      <div className="px-status-ribbon-item" data-alert={Number(data.summary?.criticalSignals)>0}><strong>{data.summary?.criticalSignals||0}</strong><span>critical signals</span></div>
      <div className="px-status-ribbon-item"><strong>{age(data.generatedAt)}</strong><span>last refresh</span></div>
    </div>
    <Panel title={host?.label||'Production VPS'} subtitle={host?.hostname||'Awaiting host snapshot'} action={<Button variant="secondary" icon="refresh" onClick={()=>load(true)} disabled={refreshing}>{refreshing?'Checking…':'Run full check'}</Button>}>
      <div className="px-metrics"><Signal label="CPU" value={fmtPct(host?.cpu_percent)} detail={`Load ${host?.load1??'—'}`}/><Signal label="Memory" value={fmtPct(host?.memory_percent)} detail="Host utilisation"/><Signal label="Disk" value={fmtPct(host?.disk_percent)} detail="Primary filesystem"/><Signal label="Uptime" value={uptime(host?.uptime_seconds)} detail={host?.captured_at?`Sample ${age(host.captured_at)}`:'Agent not reporting'}/><Signal label="Containers" value={containers.length?`${running}/${containers.length}`:'—'} detail={badContainers.length?`${badContainers.length} require attention`:'Running'} state={badContainers.length?'warning':'healthy'}/></div>
      {badContainers.length>0&&<div className="px-list" style={{marginTop:14}}>{badContainers.map(c=><div className="px-list-row" key={c.name}><div className="px-list-main"><div className="px-list-title">{c.name}</div><div className="px-list-sub">{c.status||c.health||'Problem detected'}</div></div><Pill tone="danger">Attention</Pill></div>)}</div>}
    </Panel>
    <div style={{height:14}}/><Panel title="Platform signals" subtitle="Collector freshness, workers, databases, security and recovery evidence."><div className="px-metrics"><Signal label="Platform" value={platform.status?.severity||'—'} detail={platform.status?.checked_at?`Sample ${age(platform.status.checked_at)}`:'Not reporting'} state={platform.status?.severity}/><Signal label="Workers" value={platform.workers?.severity||'—'} detail={platform.workers?.reasons?.length?`${platform.workers.reasons.length} issue(s)`:platform.workers?.checked_at?`Sample ${age(platform.workers.checked_at)}`:'Not reporting'} state={platform.workers?.severity}/><Signal label="Databases" value={platform.databases?.severity||'—'} detail={platform.databases?.databases?.length?`${platform.databases.databases.length} databases sampled`:'Not reporting'} state={platform.databases?.severity}/><Signal label="Security" value={platform.security?.severity||platform.security?.state||'—'} detail={platform.security?.checked_at?`Sample ${age(platform.security.checked_at)}`:'Not reporting'} state={platform.security?.severity||platform.security?.state}/><Signal label="Off-site backup" value={platform.offsiteBackup?.state||'—'} detail={platform.offsiteBackup?.checked_at?`Sample ${age(platform.offsiteBackup.checked_at)}`:'Not reporting'} state={platform.offsiteBackup?.state}/><Signal label="Restore test" value={platform.restore?.ok===true?'Passed':platform.restore?.ok===false?'Failed':'—'} detail={platform.restore?.finished_at?`Finished ${age(platform.restore.finished_at)}`:'Not reporting'} state={platform.restore?.ok===true?'passed':platform.restore?.ok===false?'failed':'unknown'}/></div></Panel>
    <div style={{height:14}}/><Panel title="What needs action" subtitle="Every exception should lead to evidence, remediation or an explicit decision.">{(data.attention||[]).length===0?<EmptyState icon="check" title="No infrastructure exceptions" body="The latest operations snapshot has no open infrastructure exceptions."/>:<div className="px-list">{data.attention.map(item=><div className="px-list-row" key={item.id}><div className="px-list-main"><div className="px-list-title">{item.title}</div><div className="px-list-sub">{item.summary}</div>{item.due_at&&<div className="px-task-meta"><span>Due {fmtDate(item.due_at)}</span></div>}</div><Pill tone={tone(item.severity)}>{item.severity}</Pill>{item.action_url&&<a className="px-btn px-btn--secondary" href={item.action_url}>Open remediation</a>}</div>)}</div>}</Panel>
    <div style={{height:14}}/><Renewals/><div style={{height:14}}/>
    <Panel title="Production endpoints" subtitle="Five-minute checks with status, latency and TLS evidence."><div style={{overflowX:'auto'}}><table className="finance-table"><thead><tr><th>Service</th><th>Status</th><th>Latency</th><th>TLS</th><th>Checked</th></tr></thead><tbody>{(data.services||[]).map(service=>{const ok=Number(service.last_status)>=200&&Number(service.last_status)<400&&Number(service.consecutive_failures||0)===0,tls=daysUntil(service.tls_expires_at);return <tr key={service.id}><td><strong>{service.name}</strong><div className="px-list-sub">{service.product}</div></td><td><Pill tone={ok?'success':service.last_checked_at?'danger':'neutral'}>{service.last_status||'Unknown'}</Pill>{Number(service.consecutive_failures||0)>0&&<div className="px-list-sub">{service.consecutive_failures} failures</div>}</td><td>{fmtMs(service.last_latency_ms)}</td><td>{tls==null?'—':`${tls}d`}<div className="px-list-sub">{service.tls_expires_at?fmtDate(service.tls_expires_at):''}</div></td><td>{age(service.last_checked_at)}</td></tr>;})}</tbody></table></div></Panel>
    <div style={{height:14}}/><Panel title="Domains & certificates" subtitle="Registration and TLS renewal exposure.">{roots.length?<div className="px-grid-3">{roots.map(domain=>{const exp=daysUntil(domain.expires_at),tls=daysUntil(domain.tls_expires_at);return <div className="px-panel" key={domain.host} style={{boxShadow:'none'}}><div className="px-between"><strong>{domain.root_domain}</strong><Pill tone={tone(domain.status)}>{domain.status||'unknown'}</Pill></div><div className="px-context-grid" style={{marginTop:12}}><div><span>Registration</span><strong>{exp==null?'Pending check':`${exp} days`}</strong><small>{domain.expires_at?fmtDate(domain.expires_at):domain.registrar||'Expiry unresolved'}</small></div><div><span>TLS</span><strong>{tls==null?'—':`${tls} days`}</strong><small>{domain.tls_expires_at?fmtDate(domain.tls_expires_at):'Certificate not sampled'}</small></div></div></div>;})}</div>:<EmptyState icon="link" title="No root domains returned" body="The current operations snapshot did not include registrable domain records."/>}</Panel>
  </>;
}

export default function Operations({navigate}){
  const[data,setData]=useState(null),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState('');
  const[section,setSection]=useState('pipeline'),[view,setView]=useState('board'),[query,setQuery]=useState(''),[product,setProduct]=useState('all'),[type,setType]=useState('all'),[status,setStatus]=useState('all'),[priority,setPriority]=useState('any'),[due,setDue]=useState('any'),[sort,setSort]=useState('severity');
  const load=useCallback(async(force=false)=>{
    force?setRefreshing(true):setLoading(true);setError('');
    try{
      if(force){const refresh=await fetch('/api/ops/refresh?domains=1',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!refresh.ok){const d=await refresh.json().catch(()=>({}));throw new Error(d.error||'Full operations check could not start.');}}
      const r=await fetch('/api/ops/overview',{headers:{Accept:'application/json'}});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error||'Operations data unavailable');setData(body);
    }catch(e){setError(e.message||'Operations data unavailable');}finally{setLoading(false);setRefreshing(false);}
  },[]);
  useEffect(()=>{load();const timer=setInterval(()=>load(),60000);return()=>clearInterval(timer);},[load]);

  const items=useMemo(()=>buildPipelineItems(data),[data]);
  const products=useMemo(()=>[...new Set(items.map(x=>x.product).filter(Boolean))].sort(),[items]);
  const types=useMemo(()=>[...new Set(items.map(x=>x.type).filter(Boolean))].sort(),[items]);
  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();
    const withinDue=item=>{if(due==='any'||!item.dueAt)return true;const d=daysUntil(item.dueAt);if(d==null)return false;if(due==='7d')return d<=7;if(due==='30d')return d<=30;return true;};
    const list=items.filter(item=>(!q||`${item.title} ${item.product} ${item.type} ${item.summary}`.toLowerCase().includes(q))&&(product==='all'||item.product===product)&&(type==='all'||item.type===type)&&(status==='all'||item.stage===status)&&(priority==='any'||item.severity===priority)&&withinDue(item));
    return [...list].sort((a,b)=>sort==='due'?((a.dueAt?new Date(a.dueAt).getTime():Number.MAX_SAFE_INTEGER)-(b.dueAt?new Date(b.dueAt).getTime():Number.MAX_SAFE_INTEGER)):sort==='name'?a.title.localeCompare(b.title):(severityRank[a.severity]-severityRank[b.severity]||b.readiness-a.readiness));
  },[items,query,product,type,status,priority,due,sort]);
  const activeCount=items.filter(x=>x.stage!=='monitoring').length,criticalCount=items.filter(x=>x.severity==='critical').length,readyCount=items.filter(x=>x.stage==='ready').length,monitoringCount=items.filter(x=>x.stage==='monitoring').length;
  const services=data?.services||[],successOutcomes=services.filter(s=>Number(s.last_status)>=200&&Number(s.last_status)<400&&Number(s.consecutive_failures||0)===0).slice(0,5),failedOutcomes=services.filter(s=>Number(s.consecutive_failures||0)>0||Number(s.last_status)>=400).slice(0,4);

  if(loading&&!data)return <div className="module"><PageHeader eyebrow="Estate operations" title="Operations Pipeline" subtitle="Loading live operational evidence…"/><div className="op-board-shell op-board-shell--loading"><div/><div/><div/><div/></div></div>;
  if(!data)return <div className="module"><PageHeader eyebrow="Estate operations" title="Operations Pipeline" subtitle="Cross-estate work, readiness and operational exceptions."/><StateBanner tone="danger" title="Operations data unavailable">{error}<div style={{marginTop:10}}><Button variant="secondary" icon="refresh" onClick={()=>load()}>Retry</Button></div></StateBanner></div>;

  return <div className="module op-module">
    <PageHeader eyebrow="Estate operations" title={section==='pipeline'?'Operations Pipeline':'Infrastructure & continuity'} subtitle={section==='pipeline'?'What needs attention, what is ready, what is moving and what is under continuous watch.':'Live service health, capacity, domains, TLS and continuity controls.'} actions={<div className="op-header-actions"><div className="op-segment" aria-label="Operations section"><button data-active={section==='pipeline'} onClick={()=>setSection('pipeline')}>Pipeline</button><button data-active={section==='health'} onClick={()=>setSection('health')}>Health</button></div><Button variant="secondary" icon="refresh" onClick={()=>load(true)} disabled={refreshing}>{refreshing?'Checking…':'Refresh'}</Button></div>}/>
    {section==='health'?<HealthView data={data} error={error} load={load} refreshing={refreshing}/>:<>
      {error&&<StateBanner tone="warning" title="Pipeline refresh is degraded">{error} The last successful operational snapshot remains visible.</StateBanner>}
      <div className="op-kpis"><div><strong>{activeCount}</strong><span>active items</span></div><div data-alert={criticalCount>0}><strong>{criticalCount}</strong><span>critical</span></div><div><strong>{readyCount}</strong><span>ready to act</span></div><div><strong>{monitoringCount}</strong><span>monitored</span></div><div><strong>{age(data.generatedAt)}</strong><span>snapshot age</span></div></div>
      <section className="op-workspace">
        <div className="op-toolbar">
          <div className="op-search"><Icon name="search" size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search services, domains, controls…" aria-label="Search operations pipeline"/></div>
          <select value={product} onChange={e=>setProduct(e.target.value)} aria-label="Filter by product"><option value="all">Product · All</option>{products.map(x=><option key={x} value={x}>{x}</option>)}</select>
          <select value={type} onChange={e=>setType(e.target.value)} aria-label="Filter by type"><option value="all">Type · All</option>{types.map(x=><option key={x} value={x}>{x}</option>)}</select>
          <select value={status} onChange={e=>setStatus(e.target.value)} aria-label="Filter by stage"><option value="all">Status · All</option>{STAGES.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select>
          <select value={priority} onChange={e=>setPriority(e.target.value)} aria-label="Filter by priority"><option value="any">Priority · Any</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="normal">Normal</option><option value="healthy">Healthy</option></select>
          <select value={due} onChange={e=>setDue(e.target.value)} aria-label="Filter by due date"><option value="any">Due · Any</option><option value="7d">Next 7 days</option><option value="30d">Next 30 days</option></select>
          <div className="op-toolbar-spacer"/>
          <select value={sort} onChange={e=>setSort(e.target.value)} aria-label="Sort pipeline"><option value="severity">Sort · Severity</option><option value="due">Sort · Due date</option><option value="name">Sort · Name</option></select>
        </div>
        <div className="op-view-row"><div className="op-segment op-view-segment">{['board','list','timeline'].map(x=><button key={x} data-active={view===x} onClick={()=>setView(x)}>{x[0].toUpperCase()+x.slice(1)}</button>)}</div><Button icon="plus" onClick={()=>navigate?.('work')}>New work item</Button></div>
        {filtered.length===0?<EmptyState icon="inbox" title="No operational items match these filters" body="Clear a filter or refresh the operational snapshot."/>:view==='list'?<PipelineList items={filtered}/>:view==='timeline'?<PipelineTimeline items={filtered}/>:<div className="op-board-layout"><div className="op-board">{STAGES.map(stage=>{const stageItems=filtered.filter(item=>item.stage===stage.id);return <section className="op-column" key={stage.id}><header><span className={`op-stage-icon op-stage-icon--${stage.id}`}><Icon name={stage.icon} size={14}/></span><div><strong>{stage.label}</strong><small>{stageItems.length} item{stageItems.length===1?'':'s'}</small></div></header><div className="op-column-body">{stageItems.length?stageItems.map(item=><PipelineCard key={item.id} item={item}/>):<div className="op-column-empty">No items</div>}</div></section>;})}</div><aside className="op-outcomes"><header><strong>Recent outcomes</strong><small>Live endpoint checks</small></header><div className="op-outcome-group"><div className="op-outcome-label"><Pill tone="success">Healthy</Pill><span>{successOutcomes.length}</span></div>{successOutcomes.map(item=><div className="op-outcome" key={`ok-${item.id}`}><strong>{item.name}</strong><span>{item.product} · {age(item.last_checked_at)}</span></div>)}</div><div className="op-outcome-group"><div className="op-outcome-label"><Pill tone="danger">Failed</Pill><span>{failedOutcomes.length}</span></div>{failedOutcomes.length?failedOutcomes.map(item=><div className="op-outcome" key={`bad-${item.id}`}><strong>{item.name}</strong><span>{item.consecutive_failures||1} failure{Number(item.consecutive_failures||1)===1?'':'s'}</span></div>):<div className="op-outcome-empty">No failed endpoint checks</div>}</div></aside></div>}
      </section>
    </>}
  </div>;
}
