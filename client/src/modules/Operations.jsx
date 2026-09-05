import { useEffect, useMemo, useState } from 'react';
import './Operations.css';

const fmtPct=v=>Number.isFinite(Number(v))?`${Number(v).toFixed(0)}%`:'—';
const fmtMs=v=>Number.isFinite(Number(v))?`${Number(v)} ms`:'—';
const fmtDate=v=>v?new Date(v).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Not recorded';
const daysUntil=v=>v?Math.ceil((new Date(v)-Date.now())/86400000):null;
const age=v=>{if(!v)return'Never';const m=Math.round((Date.now()-new Date(v))/60000);if(m<2)return'Just now';if(m<60)return`${m}m ago`;const h=Math.round(m/60);if(h<48)return`${h}h ago`;return`${Math.round(h/24)}d ago`;};
const uptime=s=>{const n=Number(s||0);if(!n)return'—';const d=Math.floor(n/86400),h=Math.floor((n%86400)/3600);return d?`${d}d ${h}h`:`${h}h`;};

function StatusDot({state='unknown'}){return <span className={`ops-dot ops-dot--${state}`}/>;}
function Stat({label,value,detail}){return <div className="ops-stat"><span>{label}</span><strong>{value}</strong>{detail&&<small>{detail}</small>}</div>;}

export default function Operations(){
  const[data,setData]=useState(null),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState('');
  const load=async(force=false)=>{force?setRefreshing(true):setLoading(true);setError('');try{if(force)await fetch('/api/ops/refresh?domains=1',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const r=await fetch('/api/ops/overview',{headers:{Accept:'application/json'}});const body=await r.json();if(!r.ok)throw new Error(body.error||'Operations data unavailable');setData(body);}catch(e){setError(e.message);}finally{setLoading(false);setRefreshing(false);}};
  useEffect(()=>{load();const timer=setInterval(()=>load(),60000);return()=>clearInterval(timer);},[]);
  const host=data?.hosts?.[0];
  const containers=Array.isArray(host?.snapshot?.containers)?host.snapshot.containers:[];
  const running=containers.filter(c=>c.running!==false&&!String(c.status||'').toLowerCase().includes('exited')).length;
  const badContainers=containers.filter(c=>String(c.health||'').toLowerCase()==='unhealthy'||String(c.status||'').toLowerCase().includes('restarting')||String(c.status||'').toLowerCase().includes('exited'));
  const roots=useMemo(()=>{const seen=new Set();return(data?.domains||[]).filter(d=>{if(d.kind!=='registrable'||seen.has(d.root_domain))return false;seen.add(d.root_domain);return true;});},[data]);
  if(loading&&!data)return <div className="ops-page"><div className="ops-loading">Loading estate operations…</div></div>;
  return <div className="ops-page">
    <header className="ops-hero">
      <div><div className="ops-eyebrow">Estate operations</div><h1>Infrastructure & continuity</h1><p>Live service health, VPS capacity, domains, TLS and infrastructure exceptions across Tuku.</p></div>
      <button className="ops-refresh" onClick={()=>load(true)} disabled={refreshing}>{refreshing?'Checking…':'Run full check'}</button>
    </header>
    {error&&<div className="ops-banner">{error}</div>}
    <section className={`ops-score ops-score--${data?.status||'unknown'}`}>
      <div><span className="ops-score-label">Tuku estate health</span><strong>{data?.score??'—'}<small>/100</small></strong><span className="ops-score-state"><StatusDot state={data?.status||'unknown'}/>{String(data?.status||'unknown').replace(/^./,c=>c.toUpperCase())}</span></div>
      <div className="ops-score-grid">
        <Stat label="Services" value={`${data?.summary?.servicesHealthy||0}/${data?.summary?.servicesTotal||0}`} detail="responding"/>
        <Stat label="Domains" value={data?.summary?.domainsAttention||0} detail="need attention"/>
        <Stat label="Critical" value={data?.summary?.criticalSignals||0} detail="open signals"/>
        <Stat label="Last refresh" value={age(data?.generatedAt)} detail={fmtDate(data?.generatedAt)}/>
      </div>
    </section>

    <section className="ops-section">
      <div className="ops-section-head"><div><span>Production VPS</span><h2>{host?.label||'Tuku production host'}</h2></div><span className="ops-muted">{host?.hostname||'Awaiting host snapshot'}</span></div>
      <div className="ops-grid ops-grid--host">
        <Stat label="CPU" value={fmtPct(host?.cpu_percent)} detail={`Load ${host?.load1??'—'}`}/>
        <Stat label="Memory" value={fmtPct(host?.memory_percent)} detail="host utilisation"/>
        <Stat label="Disk" value={fmtPct(host?.disk_percent)} detail="primary filesystem"/>
        <Stat label="Uptime" value={uptime(host?.uptime_seconds)} detail={host?.captured_at?`sample ${age(host.captured_at)}`:'agent not yet reporting'}/>
        <Stat label="Containers" value={containers.length?`${running}/${containers.length}`:'—'} detail={badContainers.length?`${badContainers.length} require attention`:'running'}/>
      </div>
      {badContainers.length>0&&<div className="ops-container-alerts">{badContainers.map(c=><div key={c.name}><StatusDot state="critical"/><strong>{c.name}</strong><span>{c.status||c.health||'problem detected'}</span></div>)}</div>}
    </section>

    <section className="ops-section">
      <div className="ops-section-head"><div><span>Attention</span><h2>What needs action</h2></div><span className="ops-muted">Exception-first, not raw telemetry</span></div>
      <div className="ops-attention-list">
        {(data?.attention||[]).length===0?<div className="ops-empty">No infrastructure exceptions are currently open.</div>:(data.attention||[]).map(item=><article className={`ops-attention ops-attention--${item.severity}`} key={item.id}><div className="ops-attention-severity">{item.severity}</div><div><h3>{item.title}</h3><p>{item.summary}</p>{item.due_at&&<small>Due {fmtDate(item.due_at)}</small>}</div></article>)}
      </div>
    </section>

    <section className="ops-section">
      <div className="ops-section-head"><div><span>Services</span><h2>Production endpoints</h2></div><span className="ops-muted">5-minute checks</span></div>
      <div className="ops-table">
        <div className="ops-tr ops-th"><span>Service</span><span>Status</span><span>Latency</span><span>TLS</span><span>Checked</span></div>
        {(data?.services||[]).map(s=>{const ok=Number(s.last_status)>=200&&Number(s.last_status)<500&&Number(s.consecutive_failures||0)===0;const tls=daysUntil(s.tls_expires_at);return <div className="ops-tr" key={s.id}><span><strong>{s.name}</strong><small>{s.product}</small></span><span><StatusDot state={ok?'healthy':s.last_checked_at?'critical':'unknown'}/>{s.last_status||'—'}{Number(s.consecutive_failures||0)>0&&<small>{s.consecutive_failures} failures</small>}</span><span>{fmtMs(s.last_latency_ms)}</span><span>{tls==null?'—':`${tls}d`}<small>{s.tls_expires_at?fmtDate(s.tls_expires_at):''}</small></span><span>{age(s.last_checked_at)}</span></div>;})}
      </div>
    </section>

    <section className="ops-section">
      <div className="ops-section-head"><div><span>Domains & certificates</span><h2>Renewal exposure</h2></div><span className="ops-muted">RDAP + live TLS inspection</span></div>
      <div className="ops-domain-grid">
        {roots.map(d=>{const exp=daysUntil(d.expires_at);const tls=daysUntil(d.tls_expires_at);return <article className="ops-domain-card" key={d.host}><div className="ops-domain-title"><StatusDot state={d.status==='healthy'?'healthy':d.status==='critical'?'critical':'attention'}/><strong>{d.root_domain}</strong></div><div><span>Registration</span><strong>{exp==null?'Pending RDAP check':`${exp} days`}</strong><small>{d.expires_at?fmtDate(d.expires_at):d.registrar||'Expiry not yet resolved'}</small></div><div><span>TLS</span><strong>{tls==null?'—':`${tls} days`}</strong><small>{d.tls_expires_at?fmtDate(d.tls_expires_at):'Certificate not sampled'}</small></div></article>;})}
      </div>
      <div className="ops-subdomains"><span>{data?.domains?.length||0} production hostnames tracked</span><span>{(data?.domains||[]).filter(d=>d.status!=='healthy'&&d.status!=='unknown').length} hostname-level issues</span></div>
    </section>
  </div>;
}
