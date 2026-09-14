import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, LoadingRows, Metric, PageHeader, Panel, Pill, StateBanner } from '../components/ProductUI';

const tone = state => state==='VERIFIED'?'success':state==='BLOCKED'?'danger':['ACTIVE','VERIFYING','MERGING','DEPLOYING'].includes(state)?'warning':'neutral';
const shortSha = value => value ? String(value).slice(0,8) : '—';
const ago = value => {
  if(!value) return 'never';
  const ms=Date.now()-new Date(value).getTime();
  if(ms<60000)return 'just now';
  if(ms<3600000)return `${Math.floor(ms/60000)}m ago`;
  if(ms<86400000)return `${Math.floor(ms/3600000)}h ago`;
  return `${Math.floor(ms/86400000)}d ago`;
};

export default function EstateControl(){
  const [state,setState]=useState({loading:true,data:null,error:''});
  const load=useCallback(async()=>{
    setState(s=>({...s,loading:!s.data,error:''}));
    try{
      const r=await fetch('/api/estate/control',{credentials:'same-origin',headers:{Accept:'application/json'}});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||'Estate Control unavailable');
      setState({loading:false,data:d,error:''});
    }catch(e){setState(s=>({...s,loading:false,error:e.message}));}
  },[]);
  useEffect(()=>{load();const t=setInterval(load,60000);return()=>clearInterval(t);},[load]);
  const repos=state.data?.repositories||[];
  const counts=state.data?.counts||{};
  const active=useMemo(()=>repos.filter(r=>['ACTIVE','VERIFYING','MERGING','DEPLOYING'].includes(r.state)),[repos]);
  const blocked=useMemo(()=>repos.filter(r=>r.state==='BLOCKED'),[repos]);
  const drift=useMemo(()=>repos.filter(r=>r.release&&r.checkpoint&&r.release.sourceSha!==r.checkpoint.commitSha),[repos]);

  return <div className="module">
    <PageHeader eyebrow="Tuku Estate · Release train" title="Estate Control" subtitle="Canonical repository ownership, durable checkpoints and verified production releases." actions={<Button variant="secondary" icon="refresh" onClick={load}>Refresh</Button>}/>
    {state.error&&<StateBanner tone="danger" title="Estate Control unavailable">{state.error}</StateBanner>}
    {!state.data&&state.loading?<LoadingRows count={8}/>:<>
      {!state.data?.databaseReady&&<StateBanner tone="warning" title="Control database unavailable">The registry is readable, but locks and release evidence cannot be persisted until JakeOS PostgreSQL is available and migrated.</StateBanner>}
      <div className="px-metrics">
        <Metric icon="estate" label="Registered repos" value={repos.length}/>
        <Metric icon="target" label="Active" value={active.length} tone={active.length?'warning':'neutral'}/>
        <Metric icon="warning" label="Blocked" value={blocked.length} tone={blocked.length?'danger':'neutral'}/>
        <Metric icon="check" label="Verified" value={counts.VERIFIED||0} tone="success"/>
        <Metric icon="refresh" label="Drift signals" value={drift.length} tone={drift.length?'warning':'neutral'}/>
      </div>

      <Panel title="Release train" subtitle="A repository can have only one active workstream. Production is considered verified only after green CI and a successful smoke check.">
        {repos.length?<div className="px-list">{repos.map(repo=><div className="px-list-row" key={repo.id}>
          <div className="px-list-main">
            <div className="px-list-title">{repo.repo}</div>
            <div className="px-list-sub">
              {repo.product} · P{repo.priority} · {repo.kind} · depends on {repo.dependencies?.length?repo.dependencies.join(', '):'nothing'}
            </div>
            {repo.lock&&<div className="px-kicker">Owned by {repo.lock.workstreamId} · {repo.lock.branch||'branch pending'} · heartbeat {ago(repo.lock.heartbeatAt)}</div>}
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',justifyContent:'flex-end'}}>
            <Pill tone={tone(repo.state)}>{repo.state}</Pill>
            <span className="px-kicker">checkpoint {shortSha(repo.checkpoint?.commitSha)}</span>
            <span className="px-kicker">production {shortSha(repo.release?.sourceSha)}</span>
          </div>
        </div>)}</div>:<EmptyState icon="estate" title="No repositories registered" body="Add repositories to estate-control/registry.json."/>}
      </Panel>

      {blocked.length>0&&<Panel title="Blocked repositories" subtitle="These require dependency repair, an explicit decision, or a later retry."><div className="px-list">{blocked.map(repo=><div className="px-list-row" key={repo.id}><div className="px-list-main"><div className="px-list-title">{repo.repo}</div><div className="px-list-sub">{repo.checkpoint?.notes||'Blocked without a recorded explanation.'}</div></div><Pill tone="danger">Blocked</Pill></div>)}</div></Panel>}

      <Panel title="Control rules" subtitle="The overnight sprint and future release agents use these same gates.">
        <div className="px-list">
          {[
            ['1 · Reconcile','Read real branches, PRs, CI, migrations and production state before writing code.'],
            ['2 · Claim','Acquire the repository lock before implementation; overlapping work joins or waits.'],
            ['3 · Checkpoint','Push meaningful progress. Local-only work is never considered durable.'],
            ['4 · Verify','Lint, typecheck, tests, build and migration safety must pass before merge.'],
            ['5 · Promote','Deploy the exact verified SHA/artifact, then smoke-test realistic user journeys.'],
            ['6 · Release','Only green CI + green smoke clears the lock and marks the repository VERIFIED.']
          ].map(([title,body])=><div className="px-list-row" key={title}><div className="px-list-main"><div className="px-list-title">{title}</div><div className="px-list-sub">{body}</div></div></div>)}
        </div>
      </Panel>
    </>}
  </div>;
}
