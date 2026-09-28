import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, PageHeader, Panel, Pill, StateBanner } from '../components/ProductUI';
import Renewals from './Renewals';

const fmtPct=v=>Number.isFinite(Number(v))?`${Number(v).toFixed(0)}%`:'—';
const fmtMs=v=>Number.isFinite(Number(v))?`${Number(v)} ms`:'—';
const fmtDate=v=>v?new Date(v).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Not recorded';
const daysUntil=v=>v?Math.ceil((new Date(v)-Date.now())/86400000):null;
const age=v=>{if(!v)return'Never';const m=Math.round((Date.now()-new Date(v))/60000);if(m<2)return'Just now';if(m<60)return`${m}m ago`;const h=Math.round(m/60);if(h<48)return`${h}h ago`;return`${Math.round(h/24)}d ago`;};
const uptime=s=>{const n=Number(s||0);if(!n)return'—';const d=Math.floor(n/86400),h=Math.floor((n%86400)/3600);return d?`${d}d ${h}h`:`${h}h`;};
const tone=state=>['critical','failed','error','unhealthy'].includes(String(state||'').toLowerCase())?'danger':['warning','attention','degraded'].includes(String(state||'').toLowerCase())?'warning':['healthy','ok','passed','operational'].includes(String(state||'').toLowerCase())?'success':'neutral';

function Signal({label,value,detail,state}){
  return <div className="px-metric"><div className="px-between"><span className="px-metric-label">{label}</span>{state&&<Pill tone={tone(state)}>{state}</Pill>}</div><div className="px-metric-value">{value}</div>{detail&&<div className="px-metric-helper">{detail}</div>}</div>;
}

export default function Operations(){
  const[data,setData]=useState(null),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState('');
  const load=async(force=false)=>{
    force?setRefreshing(true):setLoading(true);setError('');
    try{
      if(force){const refresh=await fetch('/api/ops/refresh?domains=1',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!refresh.ok){const d=await refresh.json().catch(()=>({}));throw new Error(d.error||'Full operations check could not start.');}}
      const r=await fetch('/api/ops/overview',{headers:{Accept:'application/json'}});const body=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(body.error||'Operations data unavailable');setData(body);
    }catch(e){setError(e.message||'Operations data unavailable');}
    finally{setLoading(false);setRefreshing(false);}
  };
  useEffect(()=>{load();const timer=setInterval(()=>load(),60000);return()=>clearInterval(timer);},[]);
  const host=data?.hosts?.[0],containers=Array.isArray(host?.snapshot?.containers)?host.snapshot.containers:[],platform=host?.snapshot?.platform||{};
  const running=containers.filter(c=>c.running!==false&&!String(c.status||'').toLowerCase().includes('exited')).length;
  const badContainers=containers.filter(c=>String(c.health||'').toLowerCase()==='unhealthy'||String(c.status||'').toLowerCase().includes('restarting')||String(c.status||'').toLowerCase().includes('exited'));
  const roots=useMemo(()=>{const seen=new Set();return(data?.domains||[]).filter(d=>{if(d.kind!=='registrable'||seen.has(d.root_domain))return false;seen.add(d.root_domain);return true;});},[data]);

  if(loading&&!data)return <div className="module"><PageHeader eyebrow="Estate operations" title="Infrastructure & continuity" subtitle="Live service health, capacity, domains, TLS and continuity controls."/><div className="px-kicker">Loading estate operations…</div></div>;
  if(!data)return <div className="module"><PageHeader eyebrow="Estate operations" title="Infrastructure & continuity" subtitle="Live service health, capacity, domains, TLS and continuity controls."/><StateBanner tone="danger" title="Operations data unavailable">{error}<div style={{marginTop:10}}><Button variant="secondary" icon="refresh" onClick={()=>load()}>Retry</Button></div></StateBanner></div>;

  return <div className="module">
    <PageHeader eyebrow="Estate operations" title="Infrastructure & continuity" subtitle="Exception-first operational control across production services, infrastructure, certificates and recovery." actions={<Button variant="secondary" icon="refresh" onClick={()=>load(true)} disabled={refreshing}>{refreshing?'Checking…':'Run full check'}</Button>}/>
    {error&&<StateBanner tone="warning" title="Operations refresh is degraded">{error} The last successful snapshot remains visible.</StateBanner>}
    <div className="px-status-ribbon" aria-label="Estate operational status">
      <div className="px-status-ribbon-item" data-alert={data.status!=='healthy'}><strong>{data.score??'—'}/100</strong><span>estate health</span></div>
      <div className="px-status-ribbon-item"><strong>{data.summary?.servicesHealthy||0}/{data.summary?.servicesTotal||0}</strong><span>services healthy</span></div>
      <div className="px-status-ribbon-item" data-alert={Number(data.summary?.domainsAttention)>0}><strong>{data.summary?.domainsAttention||0}</strong><span>domain issues</span></div>
      <div className="px-status-ribbon-item" data-alert={Number(data.summary?.criticalSignals)>0}><strong>{data.summary?.criticalSignals||0}</strong><span>critical signals</span></div>
      <div className="px-status-ribbon-item"><strong>{age(data.generatedAt)}</strong><span>last refresh</span></div>
    </div>

    <Panel title={host?.label||'Production VPS'} subtitle={host?.hostname||'Awaiting host snapshot'}>
      <div className="px-metrics">
        <Signal label="CPU" value={fmtPct(host?.cpu_percent)} detail={`Load ${host?.load1??'—'}`}/>
        <Signal label="Memory" value={fmtPct(host?.memory_percent)} detail="Host utilisation"/>
        <Signal label="Disk" value={fmtPct(host?.disk_percent)} detail="Primary filesystem"/>
        <Signal label="Uptime" value={uptime(host?.uptime_seconds)} detail={host?.captured_at?`Sample ${age(host.captured_at)}`:'Agent not reporting'}/>
        <Signal label="Containers" value={containers.length?`${running}/${containers.length}`:'—'} detail={badContainers.length?`${badContainers.length} require attention`:'Running'} state={badContainers.length?'warning':'healthy'}/>
      </div>
      {badContainers.length>0&&<div className="px-list" style={{marginTop:14}}>{badContainers.map(c=><div className="px-list-row" key={c.name}><div className="px-list-main"><div className="px-list-title">{c.name}</div><div className="px-list-sub">{c.status||c.health||'Problem detected'}</div></div><Pill tone="danger">Attention</Pill></div>)}</div>}
    </Panel>

    <div style={{height:14}}/>
    <Panel title="Platform signals" subtitle="Collector freshness, workers, databases, security and recovery evidence.">
      <div className="px-metrics">
        <Signal label="Platform" value={platform.status?.severity||'—'} detail={platform.status?.checked_at?`Sample ${age(platform.status.checked_at)}`:'Not reporting'} state={platform.status?.severity}/>
        <Signal label="Workers" value={platform.workers?.severity||'—'} detail={platform.workers?.reasons?.length?`${platform.workers.reasons.length} issue(s)`:platform.workers?.checked_at?`Sample ${age(platform.workers.checked_at)}`:'Not reporting'} state={platform.workers?.severity}/>
        <Signal label="Databases" value={platform.databases?.severity||'—'} detail={platform.databases?.databases?.length?`${platform.databases.databases.length} databases sampled`:'Not reporting'} state={platform.databases?.severity}/>
        <Signal label="Security" value={platform.security?.severity||platform.security?.state||'—'} detail={platform.security?.checked_at?`Sample ${age(platform.security.checked_at)}`:'Not reporting'} state={platform.security?.severity||platform.security?.state}/>
        <Signal label="Off-site backup" value={platform.offsiteBackup?.state||'—'} detail={platform.offsiteBackup?.checked_at?`Sample ${age(platform.offsiteBackup.checked_at)}`:'Not reporting'} state={platform.offsiteBackup?.state}/>
        <Signal label="Restore test" value={platform.restore?.ok===true?'Passed':platform.restore?.ok===false?'Failed':'—'} detail={platform.restore?.finished_at?`Finished ${age(platform.restore.finished_at)}`:'Not reporting'} state={platform.restore?.ok===true?'passed':platform.restore?.ok===false?'failed':'unknown'}/>
      </div>
    </Panel>

    <div style={{height:14}}/>
    <Panel title="What needs action" subtitle="Every exception should lead to evidence, remediation or an explicit decision.">
      {(data.attention||[]).length===0?<EmptyState icon="check" title="No infrastructure exceptions" body="The latest operations snapshot has no open infrastructure exceptions."/>:<div className="px-list">{data.attention.map(item=><div className="px-list-row" key={item.id}><div className="px-list-main"><div className="px-list-title">{item.title}</div><div className="px-list-sub">{item.summary}</div>{item.due_at&&<div className="px-task-meta"><span>Due {fmtDate(item.due_at)}</span></div>}</div><Pill tone={tone(item.severity)}>{item.severity}</Pill>{item.action_url&&<a className="px-btn px-btn--secondary" href={item.action_url}>Open remediation</a>}</div>)}</div>}
    </Panel>

    <div style={{height:14}}/><Renewals/><div style={{height:14}}/>
    <Panel title="Production endpoints" subtitle="Five-minute checks with status, latency and TLS evidence.">
      <div style={{overflowX:'auto'}}><table className="finance-table"><thead><tr><th>Service</th><th>Status</th><th>Latency</th><th>TLS</th><th>Checked</th></tr></thead><tbody>{(data.services||[]).map(service=>{const ok=Number(service.last_status)>=200&&Number(service.last_status)<400&&Number(service.consecutive_failures||0)===0,tls=daysUntil(service.tls_expires_at);return <tr key={service.id}><td><strong>{service.name}</strong><div className="px-list-sub">{service.product}</div></td><td><Pill tone={ok?'success':service.last_checked_at?'danger':'neutral'}>{service.last_status||'Unknown'}</Pill>{Number(service.consecutive_failures||0)>0&&<div className="px-list-sub">{service.consecutive_failures} failures</div>}</td><td>{fmtMs(service.last_latency_ms)}</td><td>{tls==null?'—':`${tls}d`}<div className="px-list-sub">{service.tls_expires_at?fmtDate(service.tls_expires_at):''}</div></td><td>{age(service.last_checked_at)}</td></tr>;})}</tbody></table></div>
    </Panel>

    <div style={{height:14}}/>
    <Panel title="Domains & certificates" subtitle="Registration and TLS renewal exposure.">
      {roots.length?<div className="px-grid-3">{roots.map(domain=>{const exp=daysUntil(domain.expires_at),tls=daysUntil(domain.tls_expires_at);return <div className="px-panel" key={domain.host} style={{boxShadow:'none'}}><div className="px-between"><strong>{domain.root_domain}</strong><Pill tone={tone(domain.status)}>{domain.status||'unknown'}</Pill></div><div className="px-context-grid" style={{marginTop:12}}><div><span>Registration</span><strong>{exp==null?'Pending check':`${exp} days`}</strong><small>{domain.expires_at?fmtDate(domain.expires_at):domain.registrar||'Expiry unresolved'}</small></div><div><span>TLS</span><strong>{tls==null?'—':`${tls} days`}</strong><small>{domain.tls_expires_at?fmtDate(domain.tls_expires_at):'Certificate not sampled'}</small></div></div></div>;})}</div>:<EmptyState icon="link" title="No root domains returned" body="The current operations snapshot did not include registrable domain records."/>}
    </Panel>
  </div>;
}
