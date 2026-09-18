import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, Icon, LoadingRows, Metric, PageHeader, Panel, Pill, StateBanner, formatDate } from '../components/ProductUI';
import './Accounts.css';

const tone=value=>value==='active'?'success':value==='suspended'?'warning':'neutral';
const nameOf=a=>a.displayName||a.fullName||a.email||a.phone||'Unnamed account';
const initials=a=>nameOf(a).split(/\s+/).map(x=>x[0]).filter(Boolean).slice(0,2).join('').toUpperCase()||'?';
const lastSeen=value=>{if(!value)return 'Never observed';const ms=Date.now()-new Date(value).getTime();if(ms<60000)return 'Just now';if(ms<3600000)return `${Math.floor(ms/60000)}m ago`;if(ms<86400000)return `${Math.floor(ms/3600000)}h ago`;if(ms<7*86400000)return `${Math.floor(ms/86400000)}d ago`;return formatDate(value,{year:true});};

function AccountDetail({coreUserId,onClose}){
  const[state,setState]=useState({loading:true,data:null,error:''});
  useEffect(()=>{let active=true;setState({loading:true,data:null,error:''});fetch(`/api/accounts/${encodeURIComponent(coreUserId)}`).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Account detail could not be loaded.');if(active)setState({loading:false,data:d,error:''});}).catch(e=>active&&setState({loading:false,data:null,error:e.message}));return()=>{active=false;};},[coreUserId]);
  if(state.loading)return <Panel title="Account detail" action={<Button variant="ghost" onClick={onClose}>Close</Button>}><LoadingRows count={6}/></Panel>;
  if(state.error)return <Panel title="Account detail" action={<Button variant="ghost" onClick={onClose}>Close</Button>}><StateBanner tone="danger" title="Could not load account">{state.error}</StateBanner></Panel>;
  const d=state.data||{},a=d.account||{},auth=a.auth||{},memberships=Array.isArray(d.memberships)?d.memberships:[],activity=Array.isArray(d.activity)?d.activity:[],security=Array.isArray(d.security)?d.security:[],identities=Array.isArray(d.identities)?d.identities:[];
  const products=[...new Set(memberships.flatMap(m=>Array.isArray(m.products)?m.products:[]))];
  const roles=[...new Set([...(a.platformRoles||[]),...memberships.flatMap(m=>Array.isArray(m.roles)?m.roles:[])])];
  return <div className="accounts-detail-stack">
    <Panel title={nameOf(a)} subtitle={a.email||a.phone||a.coreUserId} action={<Button variant="ghost" onClick={onClose}>Close</Button>}>
      <div className="accounts-detail-head"><span className="accounts-avatar accounts-avatar--large">{initials(a)}</span><div><Pill tone={tone(a.status)}>{a.status||'unknown'}</Pill><div className="accounts-id">Core ID · {a.coreUserId}</div></div></div>
      <div className="accounts-detail-grid">
        <div><span>Email</span><strong>{a.email||'—'}</strong><small>{auth.emailVerifiedAt?'Verified':'Not verified'}</small></div>
        <div><span>Phone</span><strong>{a.phone||'—'}</strong><small>{a.countryCode||'No country set'}</small></div>
        <div><span>Last login</span><strong>{lastSeen(auth.lastLoginAt)}</strong><small>{auth.activeSessions||0} active session{Number(auth.activeSessions)===1?'':'s'}</small></div>
        <div><span>Joined Tuku</span><strong>{formatDate(a.createdAt,{year:true})}</strong><small>{a.preferredLanguage||'en'} language</small></div>
      </div>
      {(products.length>0||roles.length>0)&&<div className="accounts-chip-sections">{products.length>0&&<div><span>Products</span><div className="accounts-chips">{products.map(x=><span key={x}>{x}</span>)}</div></div>}{roles.length>0&&<div><span>Roles</span><div className="accounts-chips">{roles.map(x=><span key={x}>{x}</span>)}</div></div>}</div>}
    </Panel>
    <div className="accounts-detail-columns">
      <Panel title="Organisation access" subtitle="Current Tuku Core memberships, roles and product entitlements.">{memberships.length?<div className="accounts-memberships">{memberships.map(m=><div className="accounts-membership" key={String(m.membership_id)}><div><strong>{m.organization_name||'Organisation'}</strong><small>{m.organization_type||'workspace'} · {m.country_code||'—'}</small></div><Pill tone={tone(m.status)}>{m.status}</Pill><div className="accounts-chips">{(m.products||[]).map(x=><span key={`p-${x}`}>{x}</span>)}{(m.roles||[]).map(x=><span key={`r-${x}`}>{x}</span>)}</div></div>)}</div>:<EmptyState icon="estate" title="No memberships" body="This identity is not currently attached to an organisation workspace."/>}</Panel>
      <Panel title="Authentication" subtitle="Safe account health only; JakeOS never receives passwords or token values."><div className="accounts-auth-list"><div><span>Verified identities</span><strong>{identities.filter(x=>x.is_verified).length}</strong></div><div><span>Failed login attempts</span><strong>{auth.failedLoginAttempts||0}</strong></div><div><span>Password change required</span><strong>{auth.mustChangePassword?'Yes':'No'}</strong></div><div><span>Account lock</span><strong>{auth.lockedUntil?`Until ${formatDate(auth.lockedUntil,{year:true,time:true})}`:'None'}</strong></div></div></Panel>
    </div>
    <div className="accounts-detail-columns">
      <Panel title="Recent estate activity" subtitle="Latest auditable actions associated with this Core identity.">{activity.length?<div className="accounts-activity">{activity.slice(0,12).map((x,i)=><div key={`${x.occurred_at}-${i}`}><span className="accounts-activity-icon"><Icon name="check" size={14}/></span><div><strong>{String(x.action||'activity').replace(/[._-]+/g,' ')}</strong><small>{x.product_code?`${x.product_code} · `:''}{lastSeen(x.occurred_at)}</small></div></div>)}</div>:<EmptyState icon="clock" title="No recent activity" body="No audit activity is recorded for this identity yet."/>}</Panel>
      <Panel title="Security activity" subtitle="Recent authentication and account-security events.">{security.length?<div className="accounts-activity">{security.slice(0,12).map((x,i)=><div key={`${x.occurred_at}-${i}`}><span className="accounts-activity-icon"><Icon name={x.outcome==='success'?'check':'warning'} size={14}/></span><div><strong>{String(x.event_type||'security event').replace(/[._-]+/g,' ')}</strong><small>{x.outcome||'unknown'} · {lastSeen(x.occurred_at)}</small></div></div>)}</div>:<EmptyState icon="warning" title="No security events" body="There are no recent account-security events to show."/>}</Panel>
    </div>
  </div>;
}

export default function Accounts(){
  const params=useMemo(()=>new URLSearchParams(window.location.search),[]);
  const[filters,setFilters]=useState({search:params.get('search')||'',status:params.get('status')||'',product:params.get('product')||'',role:params.get('role')||'',activity:params.get('activity')||''});
  const[draft,setDraft]=useState(filters.search);
  const[state,setState]=useState({loading:true,data:null,error:''});
  const[reconciliation,setReconciliation]=useState({loading:true,data:null,error:''});
  const[selected,setSelected]=useState(null);
  const load=useCallback(async(next=filters)=>{setState(s=>({...s,loading:true,error:''}));try{const q=new URLSearchParams({limit:'100'});Object.entries(next).forEach(([k,v])=>{if(v)q.set(k,v);});const r=await fetch(`/api/accounts?${q}`),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Account directory could not be loaded.');setState({loading:false,data:d,error:''});}catch(e){setState(s=>({...s,loading:false,error:e.message||'Account directory could not be loaded.'}));}},[filters]);
  const loadReconciliation=useCallback(async()=>{setReconciliation(s=>({...s,loading:true,error:''}));try{const r=await fetch('/api/accounts/reconciliation'),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Access reconciliation could not be loaded.');setReconciliation({loading:false,data:d,error:''});}catch(e){setReconciliation(s=>({...s,loading:false,error:e.message||'Access reconciliation could not be loaded.'}));}},[]);
  useEffect(()=>{load(filters);loadReconciliation();},[]); // initial URL filters only
  const update=(key,value)=>{const next={...filters,[key]:value};setFilters(next);load(next);const q=new URLSearchParams({module:'accounts'});Object.entries(next).forEach(([k,v])=>{if(v)q.set(k,v);});window.history.replaceState({},'',`/?${q}`);};
  const submit=e=>{e.preventDefault();update('search',draft.trim());};
  const clear=()=>{const next={search:'',status:'',product:'',role:'',activity:''};setDraft('');setFilters(next);load(next);window.history.replaceState({},'','/?module=accounts');};
  const data=state.data||{},items=Array.isArray(data.items)?data.items:[],totals=data.totals||{},products=Array.isArray(data.products)?data.products:[];
  const reconciliationData=reconciliation.data||{},reconciliationSummary=reconciliationData.summary||{},reconciliationIssues=Array.isArray(reconciliationData.issues)?reconciliationData.issues:[];
  return <div className="module accounts-page">
    <PageHeader eyebrow="System · Tuku Core" title="Accounts" subtitle="Canonical identities, access and recent activity across the Tuku estate." actions={<Button variant="secondary" icon="refresh" onClick={()=>{load(filters);loadReconciliation();}}>Refresh</Button>}/>
    {state.error&&<StateBanner tone="danger" title="Account directory unavailable">{state.error}</StateBanner>}
    {reconciliation.error&&<StateBanner tone="danger" title="Access reconciliation unavailable">{reconciliation.error}</StateBanner>}
    <div className="px-metrics accounts-metrics"><Metric icon="users" label="Total accounts" value={state.loading&&!state.data?'—':totals.totalAccounts??0} helper="Canonical Tuku identities"/><Metric icon="check" label="Active / 7d" value={state.loading&&!state.data?'—':totals.active7d??0} helper="Unique recently active accounts" tone="success"/><Metric icon="plus" label="New / 30d" value={state.loading&&!state.data?'—':totals.new30d??0} helper="Recently created"/><Metric icon="warning" label="Suspended" value={state.loading&&!state.data?'—':totals.suspended??0} helper="Access currently blocked" tone={Number(totals.suspended)>0?'warning':'neutral'}/><Metric icon="warning" label="Access issues" value={reconciliation.loading&&!reconciliation.data?'—':reconciliationSummary.total??0} helper={`${reconciliationSummary.critical??0} critical · ${reconciliationSummary.error??0} errors`} tone={Number(reconciliationSummary.total)>0?'warning':'success'}/></div>
    <Panel title="Identity & access reconciliation" subtitle="Estate access anomalies detected from the canonical identity layer. Resolve these before they become product access incidents.">{reconciliation.loading&&!reconciliation.data?<LoadingRows count={4}/>:reconciliationIssues.length?<div className="accounts-reconciliation">{reconciliationIssues.slice(0,12).map(issue=><div key={issue.id} className={`accounts-reconciliation-row accounts-reconciliation-row--${issue.severity||'info'}`}><span className="accounts-activity-icon"><Icon name={issue.severity==='critical'||issue.severity==='error'?'warning':'info'} size={14}/></span><div><strong>{String(issue.issueType||'access issue').replace(/[._-]+/g,' ')}</strong><small>{issue.productCode?`${issue.productCode} · `:''}{String(issue.details?.message||'Needs review')}</small></div><Pill tone={issue.severity==='critical'||issue.severity==='error'?'danger':issue.severity==='warning'?'warning':'neutral'}>{issue.severity||'info'}</Pill></div>)}</div>:<EmptyState icon="check" title="Identity access is reconciled" body="No open identity or organisation-access anomalies are currently detected."/>}</Panel>
    <Panel title="Account directory" subtitle={`${data.page?.total??items.length} matching account${Number(data.page?.total??items.length)===1?'':'s'}. Click an account for memberships, roles and activity.`}>
      <form className="accounts-toolbar" onSubmit={submit}>
        <div className="accounts-search"><Icon name="search" size={17}/><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Search name, email, phone or Core ID"/><button type="submit">Search</button></div>
        <select value={filters.activity} onChange={e=>update('activity',e.target.value)}><option value="">Any activity</option><option value="7d">Active in 7 days</option></select>
        <select value={filters.status} onChange={e=>update('status',e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="archived">Archived</option></select>
        <select value={filters.product} onChange={e=>update('product',e.target.value)}><option value="">All products</option>{products.map(p=><option value={p.code} key={p.code}>{p.name}</option>)}</select>
        {(filters.search||filters.status||filters.product||filters.role||filters.activity)&&<button className="accounts-clear" type="button" onClick={clear}>Clear</button>}
      </form>
      {state.loading&&!state.data?<LoadingRows count={8}/>:items.length?<div className="accounts-table" role="table"><div className="accounts-row accounts-row--head" role="row"><span>Account</span><span>Products</span><span>Organisation</span><span>Last active</span><span>Status</span></div>{items.map(a=><button className={`accounts-row ${selected===a.coreUserId?'accounts-row--selected':''}`} role="row" key={a.coreUserId} onClick={()=>setSelected(a.coreUserId)}><span className="accounts-person"><i className="accounts-avatar">{initials(a)}</i><span><strong>{nameOf(a)}</strong><small>{a.email||a.phone||a.coreUserId}</small></span></span><span className="accounts-products">{a.products?.length?a.products.slice(0,3).map(x=><em key={x}>{x}</em>):<small>No product access</small>}{a.products?.length>3&&<small>+{a.products.length-3}</small>}</span><span><strong>{a.organizations?.[0]?.name||'—'}</strong>{a.organizations?.length>1&&<small>+{a.organizations.length-1} more</small>}</span><span><strong>{lastSeen(a.lastActivityAt)}</strong><small>{a.active7d?'Active this week':'Outside 7d window'}</small></span><span><Pill tone={tone(a.status)}>{a.status}</Pill></span></button>)}</div>:<EmptyState icon="users" title="No accounts match" body="Change the filters or search term to broaden the directory."/>}
    </Panel>
    {selected&&<AccountDetail coreUserId={selected} onClose={()=>setSelected(null)}/>}
  </div>;
}
