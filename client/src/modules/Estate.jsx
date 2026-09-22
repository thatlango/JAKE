import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, LoadingRows, Metric, PageHeader, Panel, Pill, StateBanner, formatMoney, formatDate } from '../components/ProductUI';
import ECITAADeviceTelemetry from '../components/ECITAADeviceTelemetry';
import SearchConsoleHealth from '../components/SearchConsoleHealth';
import './Estate.css';

const PRODUCT_URLS={
  units:'https://units.tukutuku.org',
  bcp:'https://prudevbcp.tukutuku.org',
  steady:'https://steady.tukutuku.org',
  prediq:'https://getprediq.com',
  impactos:'https://impactos.tukutuku.org',
  lendflow:'https://lendflow.tukutuku.org',
  kela:'https://kela.tukutuku.org',
  radar:'https://radar.tukutuku.org',
  nena:'https://nena.tukutuku.org',
  ecitaa:'https://ecitaa.tukutuku.org',
  synced:'https://synced.tukutuku.org',
  traffiq:'https://traffiq.tukutuku.org',
  tukuiq:'https://tukuiq.tukutuku.org'
};
const PRODUCT_MARKS={
  ecitaa:'/brand/ecitaa-icon.svg',
  units:'/brand/units-icon.svg',
  prediq:'/brand/prediq-icon.svg',
  kela:'/brand/kela-icon.svg'
};
const DOMAIN_KPIS={
  bcp:[['businesses','Businesses'],['assessmentsCompleted','Assessments'],['visits7d','Visits / 7d'],['finalReports','Final reports']],
  compliance:[['trackedBusinesses','Tracked businesses'],['requiredRequirements','Required items'],['missingEvidence','Missing evidence'],['expiringEvidence','Expiring / expired']],
  ecitaa:[['organizations','Organizations'],['farmers','Farmers'],['batches','Batches'],['openExceptions','Open exceptions']],
  impactos:[['activeProgrammes','Active programmes'],['activePeople','Active people'],['openTasks','Open tasks'],['openIssues','Open issues']],
  kela:[['activeOrders','Active orders'],['newOrders7d','Orders / 7d'],['serviceRevenue','Service revenue'],['availableRunners','Available runners']],
  lendflow:[['customers','Customers'],['applicationsUnderReview','Under review'],['applicationsApproved','Approved'],['loanAccounts','Loan accounts']],
  lero:[['activeUsers7d','Active / 7d'],['interactions7d','AI interactions / 7d'],['failedInteractions7d','Failed / 7d'],['avgLatencyMs7d','Avg latency ms']],
  nena:[['activeBusinesses','Active businesses'],['claimedBusinesses','Claimed'],['pendingClaims','Pending claims'],['searches7d','Searches / 7d']],
  prediq:[['predictions7d','Predictions / 7d'],['accuracy30d','Accuracy / 30d'],['activeSubscriptions','Active subscriptions'],['registeredUsers','Registered users']],
  radar:[['liveOpportunities','Live opportunities'],['closingSoon','Closing soon'],['remoteOpportunities','Remote'],['activeSources','Active sources']],
  steady:[['businesses','Businesses'],['assessmentsInProgress','Assessments in progress'],['openActions','Open actions'],['overdueActions','Overdue actions']],
  synced:[['users','Users'],['activeUsers7d','Active / 7d'],['transactions7d','Transactions / 7d'],['activeSubscriptions','Active subscriptions']],
  traffiq:[['users','Users'],['activeJourneys','Active journeys'],['journeyPoints24h','Location points / 24h'],['activeIncidents','Active incidents']],
  tukuiq:[['businesses','Businesses'],['watchlists','Watchlists'],['intelligenceEvents7d','Intelligence / 7d'],['dataSources','Data sources']],
  units:[['businesses','Businesses'],['customers','Customers'],['receivablesOutstanding','Receivables due'],['expenses30d','Expenses / 30d']]
};
const age=value=>{if(!value)return 'No activity yet';const ms=Date.now()-new Date(value).getTime();if(ms<60000)return 'Just now';if(ms<3600000)return `${Math.floor(ms/60000)}m ago`;if(ms<86400000)return `${Math.floor(ms/3600000)}h ago`;return `${Math.floor(ms/86400000)}d ago`;};
const growthTone=n=>Number(n)>0?'success':Number(n)<0?'danger':'neutral';
const growthLabel=p=>{const active=Number(p.activeUsers7d||0),newUsers=Number(p.newUsers7d||0),growth=Number(p.growth7dPercent||0);if(active<10&&newUsers>0)return `+${newUsers} new`;if(active>0&&active<10&&growth>0)return 'New activity';return `${growth>0?'+':''}${growth.toFixed(1)}%`;};
const telemetryTone=value=>value==='rich'?'success':value==='connected'?'neutral':value==='basic'?'warning':'danger';
const telemetryLabel=value=>value==='rich'?'Rich telemetry':value==='connected'?'Connected':value==='basic'?'SSO only':'Unobserved';
const humanize=value=>String(value||'').replace(/[_-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const domainValue=(key,value)=>{if(value===null||value===undefined)return '—';const n=Number(value);if(Number.isFinite(n)){if(['accuracy30d','meanConfidence7d','meanEdge7d','meanClvProbability30d'].includes(key))return `${(n*100).toFixed(1)}%`;if(String(key).toLowerCase().includes('percent'))return `${n.toFixed(1)}%`;if(['serviceRevenue','receivablesOutstanding','expenses30d'].includes(key))return formatMoney(n,'UGX');return Number.isInteger(n)?n.toLocaleString():n.toLocaleString(undefined,{maximumFractionDigits:2});}return String(value);};
const hasDomainUserCount=kpis=>Boolean(kpis&&typeof kpis==='object'&&(Object.prototype.hasOwnProperty.call(kpis,'registeredUsers')||Object.prototype.hasOwnProperty.call(kpis,'users')));
const productUserCount=(product,kpis={})=>{const raw=Object.prototype.hasOwnProperty.call(kpis,'registeredUsers')?kpis.registeredUsers:Object.prototype.hasOwnProperty.call(kpis,'users')?kpis.users:product?.reach?.users;const n=Number(raw||0);return Number.isFinite(n)?n:0;};
const primaryKpis=(productCode,kpis={})=>(DOMAIN_KPIS[productCode]||Object.keys(kpis).slice(0,4).map(key=>[key,humanize(key)])).filter(([key])=>Object.prototype.hasOwnProperty.call(kpis,key)).slice(0,4);
const actionRead=(productCode,kpis={})=>{const n=key=>Number(kpis[key]||0);if(productCode==='bcp'&&n('businesses')>0&&n('visits7d')===0)return `${n('businesses')} businesses are on the platform but no field visits were recorded this week.`;if(productCode==='compliance'&&n('missingEvidence')>0)return `${n('missingEvidence')} applicable compliance items are missing usable evidence.`;if(productCode==='lero'&&n('failedInteractions7d')>0)return `${n('failedInteractions7d')} AI interactions failed this week; inspect the intelligence gateway.`;if(productCode==='ecitaa'&&n('openExceptions')>0)return `${n('openExceptions')} traceability exceptions need review.`;if(productCode==='impactos'&&n('openIssues')>0)return `${n('openIssues')} programme issues are still open.`;if(productCode==='kela'&&n('activeOrders')>0&&n('availableRunners')===0)return `${n('activeOrders')} live orders and no runner is currently available.`;if(productCode==='lendflow'&&n('applicationsUnderReview')>0)return `${n('applicationsUnderReview')} loan applications are waiting for review.`;if(productCode==='nena'&&n('pendingClaims')>0)return `${n('pendingClaims')} business claims need a decision.`;if(productCode==='prediq'&&kpis.accuracy30d!==undefined&&n('accuracy30d')<0.55)return `30-day prediction accuracy is below 55%; inspect model performance.`;if(productCode==='radar'&&n('closingSoon')>0)return `${n('closingSoon')} opportunities close within 14 days.`;if(productCode==='steady'&&n('overdueActions')>0)return `${n('overdueActions')} resilience actions are overdue.`;if(productCode==='traffiq'&&n('activeIncidents')>0)return `${n('activeIncidents')} live road incidents need monitoring.`;if(productCode==='units'&&n('receivablesOutstanding')>0)return `${formatMoney(n('receivablesOutstanding'),'UGX')} is still outstanding on invoices.`;if(productCode==='synced'&&n('activeUsers7d')===0&&n('users')>0)return 'Registered users exist, but no one was active in the last 7 days.';if(productCode==='tukuiq'&&n('dataSources')===0)return 'No intelligence data sources are currently registered.';return 'No immediate exception is flagged by the four primary operating KPIs.';};

function TrendBars({rows}){
  const points=[...rows].sort((a,b)=>String(a.date).localeCompare(String(b.date))),max=Math.max(1,...points.map(p=>Number(p.activeUsers||0)));
  if(!points.length)return <EmptyState icon="chart" title="No usage trend yet" body="Daily activity will appear as the product records observed use."/>;
  return <div className="estate-trend" aria-label="14 day active user trend">{points.map(point=><div className="estate-trend-col" key={point.date} title={`${point.date}: ${point.activeUsers||0} active users, ${point.events||0} events`}><div className="estate-trend-bar" style={{height:`${Math.max(6,(Number(point.activeUsers||0)/max)*100)}%`}}/><span>{String(point.date).slice(5)}</span></div>)}</div>;
}

function CommercePanel({commerce,productCode}){
  if(!commerce.length)return <EmptyState icon="money" title="No commerce telemetry" body="This product has not reported canonical order or revenue records yet."/>;
  return <div className="px-list">{commerce.map(c=><div className="px-list-row" key={`${c.productCode}-${c.currency}`}><div className="px-list-main"><div className="px-list-title">{c.currency||'UGX'} commerce</div><div className="px-list-sub">{c.orders?.active||0} live · {c.orders?.completed||0} fulfilled · {c.orders?.cancelled||0} cancelled</div></div><div className="estate-money"><strong>{formatMoney(c.earnings?.realized||0,c.currency||'UGX')}</strong><span>{formatMoney(c.earnings?.pending||0,c.currency||'UGX')} pending</span></div></div>)}{productCode==='kela'&&commerce[0]&&<div className="px-fulfillment estate-fulfillment">{[['New',commerce[0].orders?.new],['Sourcing',commerce[0].orders?.sourcing],['Shopping',commerce[0].orders?.shopping],['Consolidation',commerce[0].orders?.consolidation],['Ready',commerce[0].orders?.ready],['Delivery',commerce[0].orders?.outForDelivery],['Completed',commerce[0].orders?.completed]].map(([label,value],index)=><div className="px-fulfillment-stage" key={label}><div><strong>{value||0}</strong><span>{label}</span></div>{index<6&&<span className="px-fulfillment-arrow">→</span>}</div>)}</div>}</div>;
}

function DomainKpis({productCode,domainTelemetry}){
  if(!domainTelemetry?.configured)return null;
  if(!domainTelemetry.available)return <StateBanner tone="warning" title="Product KPI feed unavailable">{domainTelemetry.error||'The product-specific KPI endpoint is configured but did not return a usable snapshot.'}</StateBanner>;
  const payload=domainTelemetry.payload||{},kpis=payload.kpis||{},spec=primaryKpis(productCode,kpis),portfolio=Array.isArray(payload.portfolioByCurrency)?payload.portfolioByCurrency:[];
  return <>
    <Panel title={`${humanize(productCode)} decision KPIs`} subtitle="The four product-native numbers that should drive your next management decision."><div className="estate-domain-kpis">{spec.map(([key,label])=><div className="estate-domain-kpi" key={key}><span>{label}</span><strong>{domainValue(key,kpis[key])}</strong></div>)}</div><div className="estate-action-read"><span>Management read</span><strong>{actionRead(productCode,kpis)}</strong></div></Panel>
    {portfolio.length>0&&<Panel title="Portfolio by currency" subtitle="Loan balances are kept currency-safe; unlike currencies are never summed together."><div className="px-list">{portfolio.map(row=><div className="px-list-row" key={row.currency}><div className="px-list-main"><div className="px-list-title">{row.currency} portfolio</div><div className="px-list-sub">{row.loanAccounts||0} loan accounts · {row.organisations||0} organisations · {row.portfolioPaidPercent??0}% paid</div></div><div className="estate-money"><strong>{formatMoney(row.outstandingAmount||0,row.currency)}</strong><span>of {formatMoney(row.principalAmount||0,row.currency)} principal outstanding</span></div></div>)}</div></Panel>}
  </>;
}

function DeviceRegistry({domainTelemetry}){
  const registry=domainTelemetry?.payload?.fieldDevices;
  if(!registry||!Array.isArray(registry.devices))return null;
  const tone=status=>status==='active_now'?'success':status==='recent'?'neutral':status==='stale'?'warning':status==='dormant'?'danger':'neutral';
  const label=status=>status==='active_now'?'Active now':status==='recent'?'Recent':status==='stale'?'Stale':status==='dormant'?'Dormant':'Unknown';
  return <Panel title="ECITAA Field device registry" subtitle="Heartbeat activity, app versions and sync recency from the ECITAA Field device registry.">
    <div className="px-metrics" style={{marginBottom:16}}>
      <Metric icon="users" label="Registered" value={registry.total||0} helper="Field devices"/>
      <Metric icon="users" label="Active now" value={registry.activeNow||0} helper="Seen within 15 min" tone="success"/>
      <Metric icon="users" label="Seen / 24h" value={registry.recent24h||0} helper="Recent field activity"/>
      <Metric icon="warning" label="Dormant" value={registry.dormant||0} helper="No use in 7+ days" tone={registry.dormant?'warning':'neutral'}/>
    </div>
    {registry.devices.length?<div className="px-list">{registry.devices.map(device=><div className="px-list-row" key={device.deviceUid}>
      <div className="px-list-main">
        <div className="px-between" style={{gap:8,justifyContent:'flex-start',flexWrap:'wrap'}}><div className="px-list-title">{device.actorName||device.deviceName||'Unassigned ECITAA device'}</div><Pill tone={tone(device.activityStatus)}>{label(device.activityStatus)}</Pill></div>
        <div className="px-list-sub">{device.organizationName||'Organisation unknown'} · {device.appVersion||'version unknown'} · last use {age(device.lastSeenAt)}</div>
        <div className="px-list-sub" style={{marginTop:4}}>{device.devicePlatform||'platform unknown'} · last sync {device.lastSyncAt?age(device.lastSyncAt):'not recorded'} · {device.pendingTotal||0} pending · {String(device.deviceUid||'').slice(0,8)}…</div>
      </div>
    </div>)}</div>:<EmptyState icon="warning" title="No ECITAA Field devices registered" body="Device heartbeat records will appear here after Field devices contact Core."/>}
  </Panel>;
}

function ProductDashboard({productCode,onBack}){
  const[state,setState]=useState({loading:true,data:null,error:''});
  const load=useCallback(async(force=false)=>{setState(s=>({...s,loading:!s.data,error:''}));try{const r=await fetch(`/api/estate/products/${encodeURIComponent(productCode)}${force?'?refresh=1':''}`),d=await r.json();if(!r.ok&&!d.detail)throw new Error(d.error||'Product telemetry unavailable');setState({loading:false,data:d,error:d.error||''});}catch(e){setState(s=>({...s,loading:false,error:e.message}))}},[productCode]);
  useEffect(()=>{load();const t=setInterval(()=>load(false),60000);return()=>clearInterval(t);},[load]);
  const detail=state.data?.detail,product=detail?.product,telemetry=detail?.telemetry,commerce=detail?.commerce||[],events=detail?.operations?.eventTypes||[],sourceTables=(detail?.operations?.sourceTables||[]).filter(x=>x.sourceTable),domainTelemetry=detail?.domainTelemetry,url=PRODUCT_URLS[productCode];
  const totalLiveOrders=commerce.reduce((sum,c)=>sum+Number(c.orders?.active||0),0),realizedUGX=commerce.filter(c=>c.currency==='UGX').reduce((sum,c)=>sum+Number(c.earnings?.realized||0),0);
  const confidenceCopy=!telemetry?'Telemetry quality has not been classified yet.':telemetry.coverage==='rich'?'This view is backed by product-level activity, source, commerce or authoritative product KPI telemetry in addition to access signals.':telemetry.message;
  if(state.loading&&!detail)return <div className="module"><PageHeader eyebrow="Tuku Estate" title={humanize(productCode)} subtitle="Loading product command view…"/><LoadingRows count={8}/></div>;
  if(!product)return <div className="module"><PageHeader eyebrow="Tuku Estate" title={humanize(productCode)} subtitle="Product dashboard" actions={<Button variant="secondary" icon="back" onClick={onBack}>Back to Estate</Button>}/><StateBanner tone="danger" title="Product telemetry unavailable">{state.error||'The requested product is not in the active Tuku Core product catalog.'}</StateBanner></div>;
  return <div className="module estate-product-page">
    <PageHeader eyebrow="Tuku Estate · Product command" title={product.name} subtitle="Users, active usage, operations, commercial activity and telemetry confidence for this product." actions={<div className="estate-header-actions"><Button variant="secondary" icon="back" onClick={onBack}>Back to Estate</Button>{url&&<Button icon="link" onClick={()=>window.open(url,'_blank','noopener,noreferrer')}>Open product</Button>}<Button variant="secondary" icon="refresh" onClick={()=>load(true)}>Refresh</Button></div>}/>
    {state.error&&<StateBanner tone={detail?'warning':'danger'} title={detail?'Using a fallback or cached product snapshot':'Product telemetry unavailable'}>{state.error}</StateBanner>}
    {state.data?.stale&&<StateBanner tone="warning" title="Cached product telemetry">The live Core feed could not be refreshed. The last successful product snapshot is being shown.</StateBanner>}
    {detail?.degraded&&<StateBanner tone="warning" title="Limited drill-down">The aggregate Estate feed is available, but the richer product endpoint is not yet responding. Usage and commerce are still shown without fabricated operational detail.</StateBanner>}

    <section className="estate-product-hero">
      <div><div className="px-brief-label">Current read</div><h2>{Number(product.activeUsers7d||0)>0?`${product.activeUsers7d} people used ${product.name} this week`:`No observed ${product.name} use this week`}</h2><p>{Number(product.growth7dPercent||0)>0?`Weekly active use is up ${Number(product.growth7dPercent).toFixed(1)}% against the preceding seven days.`:Number(product.growth7dPercent||0)<0?`Weekly active use is down ${Math.abs(Number(product.growth7dPercent)).toFixed(1)}% against the preceding seven days.`:'There is no positive or negative weekly movement to call yet.'} {confidenceCopy}</p></div>
      <div className="estate-product-status"><Pill tone={telemetryTone(telemetry?.coverage)}>{telemetryLabel(telemetry?.coverage)}</Pill><span>Last observed <strong>{age(telemetry?.lastObservedAt||product.lastActivityAt)}</strong></span></div>
    </section>

    <div className="px-metrics estate-product-metrics"><Metric icon="users" label="Users" value={productUserCount(product,domainTelemetry?.payload?.kpis||{}).toLocaleString()} helper={hasDomainUserCount(domainTelemetry?.payload?.kpis)?'Authoritative product count':`${product.reach?.organizations||0} organisations with access`}/><Metric icon="users" label="Active / 24h" value={product.activeUsers24h||0} helper="Observed users"/><Metric icon="users" label="Active / 7d" value={product.activeUsers7d||0} helper={growthLabel(product)} tone={growthTone(product.growth7dPercent)}/><Metric icon="users" label="Active / 30d" value={product.activeUsers30d||0} helper={`${product.newUsers7d||0} new / 7d`}/><Metric icon="target" label="Live orders" value={totalLiveOrders} helper={commerce.length?'Canonical commerce':'Not reported'}/><Metric icon="money" label="Realized" value={formatMoney(realizedUGX,'UGX')} helper={commerce.some(c=>c.currency==='UGX')?'UGX reported':'No UGX commerce'}/></div>

    <DomainKpis productCode={productCode} domainTelemetry={domainTelemetry}/>
    {productCode==='ecitaa'&&<ECITAADeviceTelemetry domainTelemetry={domainTelemetry}/>}

    <div className="estate-product-grid">
      <Panel title="14-day activity" subtitle="Distinct active users observed each day."><TrendBars rows={detail?.usageTrend||[]}/></Panel>
      <Panel title="Telemetry confidence" subtitle="What JakeOS can actually see for this product.">{telemetry?<div className="estate-telemetry"><div className="estate-telemetry-head"><Pill tone={telemetryTone(telemetry.coverage)}>{telemetryLabel(telemetry.coverage)}</Pill><span>{telemetry.message}</span></div><div className="estate-observed-grid"><div><strong>{telemetry.observed?.ssoEvents30d||0}</strong><span>SSO events / 30d</span></div><div><strong>{telemetry.observed?.productEvents30d||0}</strong><span>Product events / 30d</span></div><div><strong>{telemetry.observed?.sourceRecords||0}</strong><span>Source records</span></div><div><strong>{telemetry.observed?.commerceRecords||0}</strong><span>Commerce records</span></div></div><div className="estate-source-pills">{(telemetry.sources||[]).map(source=><Pill key={source}>{humanize(source)}</Pill>)}</div></div>:<EmptyState icon="warning" title="Telemetry coverage unknown" body="Core has not returned the telemetry-quality classification for this product yet."/>}</Panel>
    </div>

    <div className="estate-product-grid">
      <Panel title="Product operations" subtitle="Canonical product events and source-synchronised records; these are real records, not inferred activity.">{events.length||sourceTables.length?<div className="estate-operations">{events.length>0&&<div><div className="px-brief-label">Observed events · 30d</div><div className="px-list">{events.map(row=><div className="px-list-row" key={row.eventName}><div className="px-list-main"><div className="px-list-title">{humanize(row.eventName)}</div><div className="px-list-sub">{row.users30d||0} users · last {age(row.lastObservedAt)}</div></div><strong>{Number(row.events30d||0).toLocaleString()}</strong></div>)}</div></div>}{sourceTables.length>0&&<div><div className="px-brief-label">Synced source records</div><div className="px-list">{sourceTables.map(row=><div className="px-list-row" key={`${row.sourceSystem}-${row.sourceTable}`}><div className="px-list-main"><div className="px-list-title">{humanize(row.sourceTable)}</div><div className="px-list-sub">{humanize(row.sourceSystem)} · {row.businesses||0} businesses · last {age(row.lastObservedAt)}</div></div><strong>{Number(row.records||0).toLocaleString()}</strong></div>)}</div></div>}</div>:<EmptyState icon="chart" title="No deeper operational telemetry observed" body="JakeOS can still show access and usage, but this product needs explicit events, a source connector or a domain KPI endpoint before operational KPIs can be trusted."/>}</Panel>
      <Panel title="Orders & earnings" subtitle="Commercial records reported by the product."><CommercePanel commerce={commerce} productCode={productCode}/></Panel>
    </div>
    <div className="px-kicker estate-generated">Product snapshot generated {detail?.generatedAt?formatDate(detail.generatedAt,{year:true,time:true}):'—'} · refreshed approximately every minute.</div>
  </div>;
}

export default function Estate({compact=false,productCode=null,onSelectProduct=()=>{},onBack=()=>{}}){
  const[state,setState]=useState({loading:true,data:null,error:''});
  const load=useCallback(async(force=false)=>{setState(s=>({...s,loading:!s.data,error:''}));try{const r=await fetch(`/api/estate${force?'?refresh=1':''}`),d=await r.json();if(!r.ok&&!d.snapshot)throw new Error(d.error||'Estate telemetry unavailable');setState({loading:false,data:d,error:d.error||''});}catch(e){setState(s=>({...s,loading:false,error:e.message}))}},[]);
  useEffect(()=>{if(productCode)return undefined;load();const t=setInterval(()=>load(false),60000);return()=>clearInterval(t);},[load,productCode]);
  if(productCode)return <ProductDashboard productCode={productCode} onBack={onBack}/>;
  const snap=state.data?.snapshot,products=snap?.products||[],commerce=snap?.commerce||[],telemetry=snap?.telemetry||[],totals=snap?.totals||{},kela=commerce.find(x=>x.productCode==='kela');
  const telemetryByCode=useMemo(()=>new Map(telemetry.map(row=>[String(row.productCode||'').toLowerCase(),row])),[telemetry]);
  const commerceByCode=useMemo(()=>{const map=new Map();for(const row of commerce){const code=String(row.productCode||'').toLowerCase(),current=map.get(code)||{live:0,completed:0};current.live+=Number(row.orders?.active||0);current.completed+=Number(row.orders?.completed||0);map.set(code,current);}return map;},[commerce]);
  const sorted=useMemo(()=>[...products].sort((a,b)=>Number(b.activeUsers7d)-Number(a.activeUsers7d)||String(a.name).localeCompare(String(b.name))),[products]);
  const activeProducts=useMemo(()=>products.filter(p=>Number(p.activeUsers7d||0)>0),[products]);
  const inactiveProducts=useMemo(()=>products.filter(p=>Number(p.activeUsers30d||0)===0),[products]);
  const moving=useMemo(()=>[...products].filter(p=>Number(p.activeUsers7d||0)>0).sort((a,b)=>Number(b.newUsers7d||0)-Number(a.newUsers7d||0)||Number(b.activeUsers7d||0)-Number(a.activeUsers7d||0))[0]||null,[products]);
  const recent=useMemo(()=>[...products].filter(p=>p.lastActivityAt).sort((a,b)=>new Date(b.lastActivityAt)-new Date(a.lastActivityAt))[0]||null,[products]);
  const telemetryAttention=telemetry.filter(row=>row.needsAttention);
  const movementText=state.loading&&!snap?'Reading estate telemetry…':activeProducts.length?`${activeProducts.length} product${activeProducts.length===1?' is':'s are'} active this week${moving?`; ${moving.name} is showing the strongest current movement`:''}. ${inactiveProducts.length?`${inactiveProducts.length} product${inactiveProducts.length===1?' has':'s have'} no observed activity in the 30-day window.`:'Every reporting product has recorded activity in the last 30 days.'}`:'No product has reported active use in the current seven-day window.';
  if(compact)return snap?<div className="px-grid-3"><Metric label="Active users / 7d" value={totals.activeUsers7d||0}/><Metric label="Live orders" value={totals.ordersActive||0}/><Metric label="Realized" value={formatMoney(totals.realizedRevenueUGX||0,'UGX')}/></div>:null;
  return <div className="module"><PageHeader eyebrow="Portfolio intelligence" title="Tuku Estate" subtitle="Open any product for its own command view. Each product shows its user count alongside active usage, operations, revenue and telemetry confidence." actions={<Button variant="secondary" icon="refresh" onClick={()=>load(true)}>Refresh now</Button>}/>{state.error&&<StateBanner tone={snap?'warning':'danger'} title={snap?'Using the last successful estate snapshot':'Estate telemetry unavailable'}>{state.error}</StateBanner>}{state.data?.stale&&<StateBanner tone="warning" title="Cached telemetry">Last successful refresh {state.data.lastSuccessfulAt?age(state.data.lastSuccessfulAt):'at an unknown time'}. JakeOS will not turn a feed failure into false zeros.</StateBanner>}

    <div className="px-estate-brief"><div className="px-estate-brief-main"><div className="px-brief-label">Estate movement</div><h2>{moving?`${moving.name} is moving`:'No strong movement yet'}</h2><p>{movementText}</p><div className="px-estate-signal-row">{moving&&<span><strong>{moving.activeUsers7d||0}</strong> active / 7d</span>}{moving&&Number(moving.newUsers7d||0)>0&&<span><strong>+{moving.newUsers7d}</strong> new / 7d</span>}{recent&&<span>Latest activity <strong>{age(recent.lastActivityAt)}</strong></span>}</div></div><div className={`px-estate-brief-side ${inactiveProducts.length||telemetryAttention.length?'px-estate-brief-side--attention':''}`}><div className="px-brief-label">Needs attention</div><div className="px-focus-title">{telemetryAttention.length?`${telemetryAttention.length} telemetry gap${telemetryAttention.length===1?'':'s'}`:inactiveProducts.length?`${inactiveProducts.length} inactive product${inactiveProducts.length===1?'':'s'}`:'No portfolio exception'}</div><p>{telemetryAttention.length?`${telemetryAttention.slice(0,4).map(x=>x.productName).join(', ')}${telemetryAttention.length>4?' and others':''} need deeper telemetry verification.`:inactiveProducts.length?`${inactiveProducts.slice(0,4).map(p=>p.name).join(', ')} have no observed use in 30 days.`:'No telemetry or inactivity exception is currently flagged.'}</p></div></div>

    <div className="px-metrics"><Metric icon="users" label="Active users / 24h" value={totals.activeUsers24h||0} helper="Observed use across products"/><Metric icon="users" label="Active users / 7d" value={totals.activeUsers7d||0} helper={`${activeProducts.length} active products`} tone="success"/><Metric icon="target" label="Live orders" value={totals.ordersActive||0} helper={`${totals.ordersCompleted||0} fulfilled`} tone="warning"/><Metric icon="money" label="Realized earnings" value={formatMoney(totals.realizedRevenueUGX||0,'UGX')} helper={`${formatMoney(totals.pendingRevenueUGX||0,'UGX')} pending`} tone="success"/></div>

    <SearchConsoleHealth/>

    <Panel title="Products" subtitle="Every product shows its user count first, followed by the three most useful operating KPIs.">{state.loading&&!snap?<LoadingRows count={7}/>:sorted.length?<div className="estate-product-cards">{sorted.map(p=>{const code=String(p.code).toLowerCase(),t=telemetryByCode.get(code),c=commerceByCode.get(code),kpis=p.domainKpis||{},spec=primaryKpis(code,kpis),userCount=productUserCount(p,kpis),domainMetrics=spec.filter(([key])=>!['users','registeredUsers'].includes(key)).slice(0,3),fallback=[['activeUsers7d','Active / 7d',p.activeUsers7d||0],['newUsers7d','New / 7d',p.newUsers7d||0],['liveOrders','Live orders',c?.live||0]],metrics=[['estateUsers','Users',userCount],...(spec.length?domainMetrics.map(([key,label])=>[key,label,kpis[key]]):fallback)];return <article className={'estate-product-card '+(Number(p.activeUsers30d||0)===0?'estate-product-card--inactive':'')} key={p.code}>
  <div className="estate-card-top">
    <button className="estate-card-identity" onClick={()=>onSelectProduct(p.code)} aria-label={'View '+p.name+' in JakeOS'}>
      {PRODUCT_MARKS[code]&&<span className="estate-product-mark"><img src={PRODUCT_MARKS[code]} alt="" aria-hidden="true"/></span>}
      <span className="estate-card-name"><strong>{p.name}</strong><span>{p.code}</span></span>
    </button>
    <Pill tone={telemetryTone(t?.coverage)}>{telemetryLabel(t?.coverage)}</Pill>
  </div>
  <div className="estate-card-kpi-grid">{metrics.slice(0,4).map(([key,label,value])=><div className="estate-card-kpi" key={key}><strong>{key==='estateUsers'?Number(value||0).toLocaleString():spec.length?domainValue(key,value):Number(value||0).toLocaleString()}</strong><span>{label}</span></div>)}</div>
  {spec.length>0&&<div className="estate-card-action"><span>Management read</span><strong>{actionRead(code,kpis)}</strong></div>}
  <div className="estate-card-foot">
    <div className="estate-card-foot-signals"><Pill tone={growthTone(p.growth7dPercent)}>{growthLabel(p)}</Pill><span>{age(p.lastActivityAt)}</span></div>
    <div className="estate-card-nav-actions">
      <button className="estate-card-inspect" onClick={()=>onSelectProduct(p.code)}>View dashboard →</button>
      {PRODUCT_URLS[code]&&<button className="estate-card-launch" onClick={()=>window.open(PRODUCT_URLS[code],'_blank','noopener,noreferrer')}>Launch product ↗</button>}
    </div>
  </div>
</article>})}</div>:<EmptyState icon="estate" title="No product usage reported" body="The Estate connection is live, but no active products were returned in this snapshot."/>}</Panel>

    <div className="estate-product-grid estate-overview-bottom"><Panel title="Orders & earnings" subtitle="Commercial activity reported by each product.">{commerce.length?<div className="px-list">{commerce.map(c=><div className="px-list-row" key={`${c.productCode}-${c.currency}`}><div className="px-list-main"><button className="estate-link-button" onClick={()=>onSelectProduct(c.productCode)}>{humanize(c.productCode)}</button><div className="px-list-sub">{c.orders?.active||0} live · {c.orders?.completed||0} fulfilled · last order {c.lastOrderAt?age(c.lastOrderAt):'not reported'}</div></div><div className="estate-money"><strong>{formatMoney(c.earnings?.realized||0,c.currency||'UGX')}</strong><span>{formatMoney(c.earnings?.pending||0,c.currency||'UGX')} pending</span></div></div>)}</div>:<EmptyState icon="money" title="No commerce activity reported" body="Order and earnings feeds will appear here as products send canonical commerce events."/>}</Panel><Panel title="Kela operations" subtitle="Live fulfilment state from Kela's canonical errands table.">{kela?<div className="px-fulfillment">{[['New',kela.orders?.new],['Sourcing',kela.orders?.sourcing],['Shopping',kela.orders?.shopping],['Consolidation',kela.orders?.consolidation],['Ready',kela.orders?.ready],['Delivery',kela.orders?.outForDelivery],['Completed',kela.orders?.completed]].map(([label,value],index)=><div className="px-fulfillment-stage" key={label}><div><strong>{value||0}</strong><span>{label}</span></div>{index<6&&<span className="px-fulfillment-arrow">→</span>}</div>)}</div>:<EmptyState icon="target" title="Kela feed unavailable" body="The estate snapshot did not include Kela commerce state."/>}</Panel></div>
    <div className="px-kicker estate-generated">Snapshot generated {snap?.generatedAt?formatDate(snap.generatedAt,{year:true,time:true}):'—'} · JakeOS refreshes the cached view approximately every minute.</div>
  </div>;
}
