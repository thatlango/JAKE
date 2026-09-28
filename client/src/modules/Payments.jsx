import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, PageHeader, Panel, Pill, StateBanner } from '../components/ProductUI';

const fmt=v=>Number(v||0).toLocaleString('en-UG');
const ZERO_DECIMAL=new Set(['BIF','GNF','RWF','UGX','XAF','XOF']);
const moneyMinor=(v,currency='UGX')=>{const code=String(currency||'UGX').toUpperCase(),exponent=ZERO_DECIMAL.has(code)?0:2,major=Number(v||0)/(10**exponent);return `${code} ${major.toLocaleString('en-UG',{maximumFractionDigits:exponent})}`;};
const moneyRows=(rows,key='amount_minor')=>{const grouped=new Map();(rows||[]).forEach(row=>{const currency=String(row.currency||'UGX').toUpperCase();grouped.set(currency,(grouped.get(currency)||0)+Number(row[key]||0));});return grouped.size?[...grouped.entries()].map(([currency,value])=>moneyMinor(value,currency)).join(' · '):'—';};
const age=v=>{if(!v)return'—';const mins=Math.max(0,Math.round((Date.now()-new Date(v).getTime())/60000));if(mins<2)return'Just now';if(mins<60)return`${mins}m ago`;const h=Math.round(mins/60);return h<48?`${h}h ago`:`${Math.round(h/24)}d ago`;};
const attentionLabel=code=>({PENDING_OVER_30M:'Collections pending over 30 minutes',WEBHOOK_ERRORS_24H:'Webhook processing errors in the last 24 hours',RECONCILIATION_FAILED_24H:'Failed reconciliation runs in the last 24 hours'}[code]||code);
const nextAction=code=>({PENDING_OVER_30M:'Verify provider status and reconcile the affected payment intents before retrying or contacting the payer.',WEBHOOK_ERRORS_24H:'Inspect callback failures, confirm signature/processing health, then replay only safe unprocessed events.',RECONCILIATION_FAILED_24H:'Inspect the failed reconciliation run and provider response before trusting settlement or collection totals.'}[code]||'Inspect the affected records and provider evidence before changing payment state.');

function Stat({label,value,detail,tone='neutral'}){return <div className={`px-metric px-metric--${tone}`}><div className="px-metric-value">{value}</div><div className="px-metric-label">{label}</div>{detail&&<div className="px-metric-helper">{detail}</div>}</div>;}

export default function Payments({openAI}){
  const[data,setData]=useState(null),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState('');
  const load=async(manual=false)=>{manual?setRefreshing(true):setLoading(true);setError('');try{const r=await fetch('/api/tukupay/summary',{headers:{Accept:'application/json'}});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error||'TukuPay operations unavailable');setData(body);}catch(e){setError(e.message||'TukuPay operations unavailable');}finally{setLoading(false);setRefreshing(false);}};
  useEffect(()=>{load();const timer=setInterval(()=>load(),30000);return()=>clearInterval(timer);},[]);

  if(loading&&!data)return <div className="module"><PageHeader eyebrow="Tuku estate payments" title="TukuPay" subtitle="Collections, settlement, reconciliation and provider health."/><div className="px-kicker">Loading payment operations…</div></div>;
  if(!data)return <div className="module"><PageHeader eyebrow="Tuku estate payments" title="TukuPay" subtitle="Collections, settlement, reconciliation and provider health."/><StateBanner tone="danger" title="Payment operations unavailable">{error}<div style={{marginTop:10}}><Button variant="secondary" icon="refresh" onClick={()=>load(true)}>Retry</Button></div></StateBanner></div>;

  const legacyPayments=Array.isArray(data?.ops?.payments24h)?data.ops.payments24h:[];
  const payments=Array.isArray(data?.ops?.payments24hByCurrency)&&data.ops.payments24hByCurrency.length?data.ops.payments24hByCurrency:legacyPayments.map(row=>({...row,currency:'UGX'}));
  const legacyPayouts=Array.isArray(data?.ops?.payouts24h)?data.ops.payouts24h:[];
  const payouts=Array.isArray(data?.ops?.payouts24hByCurrency)&&data.ops.payouts24hByCurrency.length?data.ops.payouts24hByCurrency:legacyPayouts.map(row=>({...row,currency:'UGX'}));
  const balances=Array.isArray(data?.ops?.balances)?data.ops.balances:[],rails=Array.isArray(data?.ops?.rails)?data.ops.rails:[],products=Array.isArray(data?.ops?.productPerformance7d)?data.ops.productPerformance7d:[],recent=Array.isArray(data?.ops?.recentPayments)?data.ops.recentPayments:[],attention=Array.isArray(data?.ops?.attention)?data.ops.attention:[];
  const totalCount=payments.reduce((s,row)=>s+Number(row.count||0),0),statusRows=status=>payments.filter(row=>row.status===status),successful=statusRows('SUCCESSFUL'),pending=statusRows('PENDING'),failed=statusRows('FAILED');
  const aging=data?.ops?.pendingAging??{},reconciliation=data?.ops?.reconciliation??{},webhooks=data?.ops?.webhooks??{},settlementRows=Array.isArray(data?.ops?.settlements24hByCurrency)?data.ops.settlements24hByCurrency:[],settlements=data?.ops?.settlements24h??{};
  const payoutStatus=useMemo(()=>{const map=new Map();payouts.forEach(row=>{const key=row.status;if(!map.has(key))map.set(key,{status:key,count:0,rows:[]});const current=map.get(key);current.count+=Number(row.count||0);current.rows.push(row);});return[...map.values()];},[payouts]);
  const ask=()=>openAI?.(`TukuPay operations: ${attention.length} attention signals; ${aging.over_30m||0} collections pending over 30 minutes; ${reconciliation.failed_24h||0} reconciliation failures; ${webhooks.errors_24h||0} webhook errors. Give me an investigation order, what evidence to verify before changing state, and what can safely wait.`);

  return <div className="module">
    <PageHeader eyebrow="Tuku estate payments" title="TukuPay" subtitle="Collections, product payment performance, reconciliation, provider balances, settlements, payouts and exceptions." actions={<><Button variant="secondary" icon="spark" onClick={ask}>Investigate</Button><Button variant="secondary" icon="refresh" onClick={()=>load(true)} disabled={refreshing}>{refreshing?'Refreshing…':'Refresh'}</Button></>}/>
    {error&&<StateBanner tone="warning" title="Payment refresh is degraded">{error} The last successful snapshot remains visible.</StateBanner>}
    <div className="px-status-ribbon" aria-label="TukuPay service status">
      <div className="px-status-ribbon-item" data-alert={data?.health?.status!=='ok'||attention.length>0}><strong>{data?.health?.status==='ok'&&!attention.length?'Operational':'Attention'}</strong><span>service status</span></div>
      <div className="px-status-ribbon-item"><strong>{fmt(totalCount)}</strong><span>collections / 24h</span></div>
      <div className="px-status-ribbon-item" data-alert={pending.length>0}><strong>{fmt(pending.reduce((s,row)=>s+Number(row.count||0),0))}</strong><span>pending</span></div>
      <div className="px-status-ribbon-item" data-alert={failed.length>0}><strong>{fmt(failed.reduce((s,row)=>s+Number(row.count||0),0))}</strong><span>failed</span></div>
      <div className="px-status-ribbon-item"><strong>{age(data?.ops?.generatedAt)}</strong><span>snapshot age</span></div>
    </div>

    {attention.length>0&&<Panel title="Payment exceptions" subtitle="Investigate provider evidence before retrying, correcting or communicating a final payment state."><div className="px-list">{attention.map(item=><div className="px-list-row" key={item.code}><div className="px-list-main"><div className="px-list-title">{attentionLabel(item.code)}</div><div className="px-list-sub">{nextAction(item.code)}</div></div><Pill tone="danger">{fmt(item.count)} affected</Pill></div>)}</div></Panel>}
    {attention.length>0&&<div style={{height:14}}/>}

    <div className="px-metrics">
      <Stat label="Collections · 24h" value={fmt(totalCount)} detail={moneyRows(payments)}/>
      <Stat label="Successful" value={fmt(successful.reduce((s,row)=>s+Number(row.count||0),0))} detail={moneyRows(successful)} tone="success"/>
      <Stat label="Pending" value={fmt(pending.reduce((s,row)=>s+Number(row.count||0),0))} detail={moneyRows(pending)} tone={pending.length?'warning':'neutral'}/>
      <Stat label="Failed" value={fmt(failed.reduce((s,row)=>s+Number(row.count||0),0))} detail={moneyRows(failed)} tone={failed.length?'danger':'neutral'}/>
    </div>

    <div className="px-grid-2">
      <Panel title="Pending aging" subtitle="Provider-authoritative collection exceptions."><div className="px-metrics"><Stat label="Pending now" value={fmt(aging.pending)} detail="All pending collections"/><Stat label="Over 5 min" value={fmt(aging.over_5m)} detail="Watch queue" tone={Number(aging.over_5m)>0?'warning':'neutral'}/><Stat label="Over 30 min" value={fmt(aging.over_30m)} detail="Requires attention" tone={Number(aging.over_30m)>0?'danger':'neutral'}/></div></Panel>
      <Panel title="Reconciliation & callbacks" subtitle="Evidence that internal state matches provider state."><div className="px-metrics"><Stat label="Reconciled / 24h" value={fmt(reconciliation.checked_24h)} detail={`${fmt(reconciliation.corrected_24h)} corrected`} tone={Number(reconciliation.failed_24h)>0?'warning':'success'}/><Stat label="Failed runs" value={fmt(reconciliation.failed_24h)} detail={reconciliation.last_failed_at?`Last ${age(reconciliation.last_failed_at)}`:'None'} tone={Number(reconciliation.failed_24h)>0?'danger':'success'}/><Stat label="Webhook errors" value={fmt(webhooks.errors_24h)} detail={`${fmt(webhooks.pending_24h)} unprocessed`} tone={Number(webhooks.errors_24h)>0?'danger':Number(webhooks.pending_24h)>0?'warning':'success'}/></div></Panel>
    </div>

    <div style={{height:14}}/>
    <Panel title="Collection performance · 7 days" subtitle="Which Tuku products are successfully moving money.">
      {products.length?<div style={{overflowX:'auto'}}><table className="finance-table"><thead><tr><th>Product</th><th>Currency</th><th>Successful / requests</th><th>Pending</th><th>Failed</th><th>Successful value</th></tr></thead><tbody>{products.slice(0,20).map((row,index)=><tr key={`${row.product_code}-${row.currency}-${index}`}><td><strong>{row.product_code}</strong></td><td>{row.currency}</td><td>{fmt(row.successful)} / {fmt(row.requests)}</td><td>{fmt(row.pending)}</td><td>{fmt(row.failed)}</td><td>{moneyMinor(row.successful_minor,row.currency)}</td></tr>)}</tbody></table></div>:<EmptyState icon="money" title="No product collection activity" body="No Tuku product has reported collection activity in the last seven days."/>}
    </Panel>

    <div style={{height:14}}/>
    <Panel title="Recent collections" subtitle="Latest payment intents. Provider state remains authoritative.">
      {recent.length?<div className="px-list">{recent.slice(0,20).map(row=><div className="px-list-row" key={row.id}><div className="px-list-main"><div className="px-list-title">{row.product_code} · {row.external_id}</div><div className="px-list-sub">{String(row.provider_code||row.requested_provider||'—').toUpperCase()} · {age(row.created_at)}{row.last_error?` · ${row.last_error}`:''}</div></div><Pill tone={row.status==='SUCCESSFUL'?'success':row.status==='FAILED'?'danger':'warning'}>{row.status}</Pill><strong>{moneyMinor(row.amount_minor,row.currency)}</strong></div>)}</div>:<EmptyState icon="money" title="No recent payment activity" body="No payment intents were returned in the current operational window."/>}
    </Panel>

    <div style={{height:14}}/>
    <div className="px-grid-2">
      <Panel title="Provider balances" subtitle="Latest read-only balance evidence.">{balances.length?<div className="px-list">{balances.map((row,index)=><div className="px-list-row" key={row.id??`${row.provider_code}-${row.country_code}-${index}`}><div className="px-list-main"><div className="px-list-title">{String(row.provider_code||'provider').toUpperCase()} · {row.country_code}</div><div className="px-list-sub">{row.account_type} · {row.simulated?'Simulator snapshot':'Provider snapshot'} · {age(row.captured_at)}</div></div><strong>{row.currency} {Number(row.available_major||0).toLocaleString('en-UG')}</strong></div>)}</div>:<EmptyState icon="money" title="No provider balances" body="Balance snapshots will appear when capture is enabled on the active rail."/>}</Panel>
      <Panel title="Settlements · 24h" subtitle="Recorded provider settlement evidence."><div className="px-metrics"><Stat label="Settlements" value={fmt(settlements.count)} detail="Recorded"/><Stat label="Gross" value={settlementRows.length?moneyRows(settlementRows,'gross_minor'):fmt(settlements.gross_minor)} detail="Provider settlement value"/><Stat label="Fees" value={settlementRows.length?moneyRows(settlementRows,'fee_minor'):fmt(settlements.fee_minor)} detail="Recorded processing fees"/></div></Panel>
    </div>

    <div style={{height:14}}/>
    <div className="px-grid-2">
      <Panel title="Payout queue · 24h" subtitle="Approval-gated disbursements.">{payoutStatus.length?<div className="px-list">{payoutStatus.map(row=><div className="px-list-row" key={row.status}><div className="px-list-main"><div className="px-list-title">{row.status}</div><div className="px-list-sub">{fmt(row.count)} payout records</div></div><strong>{moneyRows(row.rows)}</strong></div>)}</div>:<EmptyState icon="money" title="No payout activity" body="No payout activity was recorded in the last 24 hours."/>}</Panel>
      <Panel title="Configured rails" subtitle="Runtime market and provider registry.">{rails.length?<div className="px-list">{rails.map((row,index)=><div className="px-list-row" key={row.id??index}><div className="px-list-main"><div className="px-list-title">{row.country_code} · {String(row.provider_code||'').toUpperCase()}</div><div className="px-list-sub">{row.environment}{row.enabled===false?' · disabled':''}</div></div><Pill tone={row.enabled===false?'warning':'success'}>{row.enabled===false?'Disabled':'Enabled'}</Pill></div>)}</div>:<EmptyState icon="link" title="No payment rails returned" body="The runtime registry did not return configured markets."/>}</Panel>
    </div>
  </div>;
}
