import { useEffect,useMemo,useState } from 'react';
import './Payments.css';

const fmt=v=>Number(v||0).toLocaleString('en-UG');
const ZERO_DECIMAL=new Set(['BIF','GNF','RWF','UGX','XAF','XOF']);
const moneyMinor=(v,currency='UGX')=>{
  const code=String(currency||'UGX').toUpperCase();
  const exponent=ZERO_DECIMAL.has(code)?0:2;
  const major=Number(v||0)/(10**exponent);
  return `${code} ${major.toLocaleString('en-UG',{maximumFractionDigits:exponent})}`;
};
const moneyRows=(rows,key='amount_minor')=>{
  const grouped=new Map();
  (rows||[]).forEach(row=>{
    const currency=String(row.currency||'UGX').toUpperCase();
    grouped.set(currency,(grouped.get(currency)||0)+Number(row[key]||0));
  });
  return grouped.size?[...grouped.entries()].map(([currency,value])=>moneyMinor(value,currency)).join(' · '):'—';
};
const age=v=>{if(!v)return'—';const mins=Math.max(0,Math.round((Date.now()-new Date(v).getTime())/60000));if(mins<2)return'Just now';if(mins<60)return`${mins}m ago`;const h=Math.round(mins/60);return h<48?`${h}h ago`:`${Math.round(h/24)}d ago`;};

function Stat({label,value,detail,tone=''}){return <article className={`pay-stat ${tone?`pay-stat--${tone}`:''}`}><span>{label}</span><strong>{value}</strong>{detail&&<small>{detail}</small>}</article>;}

export default function Payments(){
  const[data,setData]=useState(null),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState('');
  const load=async(manual=false)=>{manual?setRefreshing(true):setLoading(true);setError('');try{const r=await fetch('/api/tukupay/summary',{headers:{Accept:'application/json'}});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error||'TukuPay operations unavailable');setData(body);}catch(e){setError(e.message||'TukuPay operations unavailable');}finally{setLoading(false);setRefreshing(false);}};
  useEffect(()=>{load();const timer=setInterval(()=>load(),30000);return()=>clearInterval(timer);},[]);

  const legacyPayments=Array.isArray(data?.ops?.payments24h)?data.ops.payments24h:[];
  const payments=Array.isArray(data?.ops?.payments24hByCurrency)&&data.ops.payments24hByCurrency.length
    ?data.ops.payments24hByCurrency
    :legacyPayments.map(row=>({...row,currency:'UGX'}));
  const legacyPayouts=Array.isArray(data?.ops?.payouts24h)?data.ops.payouts24h:[];
  const payouts=Array.isArray(data?.ops?.payouts24hByCurrency)&&data.ops.payouts24hByCurrency.length
    ?data.ops.payouts24hByCurrency
    :legacyPayouts.map(row=>({...row,currency:'UGX'}));
  const balances=Array.isArray(data?.ops?.balances)?data.ops.balances:[];
  const rails=Array.isArray(data?.ops?.rails)?data.ops.rails:[];
  const products=Array.isArray(data?.ops?.productPerformance7d)?data.ops.productPerformance7d:[];
  const recent=Array.isArray(data?.ops?.recentPayments)?data.ops.recentPayments:[];
  const attention=Array.isArray(data?.ops?.attention)?data.ops.attention:[];
  const totalCount=payments.reduce((s,row)=>s+Number(row.count||0),0);
  const statusRows=status=>payments.filter(row=>row.status===status);
  const successful=statusRows('SUCCESSFUL'),pending=statusRows('PENDING'),failed=statusRows('FAILED');
  const aging=data?.ops?.pendingAging??{};
  const reconciliation=data?.ops?.reconciliation??{};
  const webhooks=data?.ops?.webhooks??{};
  const settlementRows=Array.isArray(data?.ops?.settlements24hByCurrency)?data.ops.settlements24hByCurrency:[];
  const settlements=data?.ops?.settlements24h??{};
  const payoutStatus=useMemo(()=>{
    const map=new Map();
    payouts.forEach(row=>{
      const key=row.status;
      if(!map.has(key))map.set(key,{status:key,count:0,rows:[]});
      const current=map.get(key);current.count+=Number(row.count||0);current.rows.push(row);
    });
    return [...map.values()];
  },[payouts]);
  const attentionLabel=code=>({
    PENDING_OVER_30M:'Collections pending over 30 minutes',
    WEBHOOK_ERRORS_24H:'Webhook processing errors in the last 24 hours',
    RECONCILIATION_FAILED_24H:'Failed reconciliation runs in the last 24 hours',
  }[code]||code);

  if(loading&&!data)return <div className="pay-page"><div className="pay-loading">Loading TukuPay operations…</div></div>;
  return <div className="pay-page">
    <header className="pay-hero">
      <div><div className="pay-eyebrow">Tuku estate payments</div><h1>TukuPay</h1><p>Collections, product payment performance, reconciliation, provider balances, settlement activity, payouts and exceptions from the central Tuku payment rail.</p></div>
      <button className="pay-refresh" onClick={()=>load(true)} disabled={refreshing}>{refreshing?'Refreshing…':'Refresh'}</button>
    </header>
    {error&&<div className="pay-banner">{error}</div>}
    {attention.map(item=><div className="pay-banner" key={item.code}>{attentionLabel(item.code)} · {fmt(item.count)} affected</div>)}

    <section className="pay-status">
      <div><span>Service status</span><strong>{data?.health?.status==='ok'&&!attention.length?'Operational':'Attention'}</strong><small>v{data?.health?.version??'—'} · simulator {data?.health?.simulator?'ON':'OFF'}</small></div>
      <div><span>Last generated</span><strong>{age(data?.ops?.generatedAt)}</strong><small>{data?.ops?.generatedAt?new Date(data.ops.generatedAt).toLocaleString('en-GB'):'—'}</small></div>
    </section>

    <section className="pay-grid">
      <Stat label="Collections · 24h" value={fmt(totalCount)} detail={moneyRows(payments)}/>
      <Stat label="Successful" value={fmt(successful.reduce((s,row)=>s+Number(row.count||0),0))} detail={moneyRows(successful)} tone="good"/>
      <Stat label="Pending" value={fmt(pending.reduce((s,row)=>s+Number(row.count||0),0))} detail={moneyRows(pending)} tone={pending.length?'warn':''}/>
      <Stat label="Failed" value={fmt(failed.reduce((s,row)=>s+Number(row.count||0),0))} detail={moneyRows(failed)} tone={failed.length?'bad':''}/>
    </section>

    <section className="pay-section">
      <div className="pay-section-head"><div><span>Exceptions</span><h2>Pending payment aging</h2></div><small>Provider-authoritative reconciliation</small></div>
      <div className="pay-grid pay-grid--three">
        <Stat label="Pending now" value={fmt(aging.pending)} detail="all pending collections"/>
        <Stat label="Over 5 minutes" value={fmt(aging.over_5m)} detail="watch queue" tone={Number(aging.over_5m)>0?'warn':''}/>
        <Stat label="Over 30 minutes" value={fmt(aging.over_30m)} detail="requires attention" tone={Number(aging.over_30m)>0?'bad':''}/>
      </div>
    </section>

    <section className="pay-section">
      <div className="pay-section-head"><div><span>Products</span><h2>Collection performance · 7 days</h2></div><small>Which Tuku products are moving money</small></div>
      <div className="pay-table">
        <div className="pay-tr pay-th"><span>Product</span><span>Success</span><span>Successful value</span></div>
        {products.length?products.slice(0,12).map((row,index)=><div className="pay-tr" key={`${row.product_code}-${row.currency}-${index}`}><span><strong>{row.product_code}</strong><br/><small>{row.currency}</small></span><span>{fmt(row.successful)} / {fmt(row.requests)}<br/><small>{fmt(row.pending)} pending · {fmt(row.failed)} failed</small></span><span>{moneyMinor(row.successful_minor,row.currency)}</span></div>):<div className="pay-empty">No product collection activity in the last 7 days.</div>}
      </div>
    </section>

    <section className="pay-section">
      <div className="pay-section-head"><div><span>Live activity</span><h2>Recent collections</h2></div><small>Latest 40 payment intents</small></div>
      <div className="pay-table">
        <div className="pay-tr pay-th"><span>Product / reference</span><span>Status / rail</span><span>Amount</span></div>
        {recent.length?recent.slice(0,16).map(row=><div className="pay-tr" key={row.id}><span><strong>{row.product_code}</strong><br/><small>{row.external_id}</small></span><span>{row.status}<br/><small>{String(row.provider_code||row.requested_provider||'—').toUpperCase()} · {age(row.created_at)}{row.last_error?` · ${row.last_error}`:''}</small></span><span>{moneyMinor(row.amount_minor,row.currency)}</span></div>):<div className="pay-empty">No recent payment activity.</div>}
      </div>
    </section>

    <section className="pay-section">
      <div className="pay-section-head"><div><span>Reconciliation</span><h2>Provider verification health</h2></div><small>Last 24 hours</small></div>
      <div className="pay-grid pay-grid--three">
        <Stat label="Checked" value={fmt(reconciliation.checked_24h)} detail={`${fmt(reconciliation.corrected_24h)} corrected`}/>
        <Stat label="Failed runs" value={fmt(reconciliation.failed_24h)} detail={reconciliation.last_failed_at?`last ${age(reconciliation.last_failed_at)}`:'none'} tone={Number(reconciliation.failed_24h)>0?'bad':'good'}/>
        <Stat label="Last completed" value={age(reconciliation.last_completed_at)} detail={`${fmt(reconciliation.running)} running now`}/>
      </div>
    </section>

    <section className="pay-section">
      <div className="pay-section-head"><div><span>Webhooks</span><h2>Callback processing</h2></div><small>Last 24 hours</small></div>
      <div className="pay-grid pay-grid--three">
        <Stat label="Received" value={fmt(webhooks.received_24h)} detail={webhooks.last_received_at?`last ${age(webhooks.last_received_at)}`:'none'}/>
        <Stat label="Unprocessed" value={fmt(webhooks.pending_24h)} detail="received but not processed" tone={Number(webhooks.pending_24h)>0?'warn':''}/>
        <Stat label="Errors" value={fmt(webhooks.errors_24h)} detail={webhooks.last_processed_at?`last processed ${age(webhooks.last_processed_at)}`:'none'} tone={Number(webhooks.errors_24h)>0?'bad':''}/>
      </div>
    </section>

    <section className="pay-section">
      <div className="pay-section-head"><div><span>Provider accounts</span><h2>Latest balances</h2></div><small>Read-only operational view</small></div>
      <div className="pay-cards">
        {balances.length?balances.map((row,index)=><article className="pay-card" key={row.id??`${row.provider_code}-${row.country_code}-${index}`}><div><strong>{String(row.provider_code||'provider').toUpperCase()}</strong><span>{row.country_code} · {row.account_type}</span></div><h3>{row.currency} {Number(row.available_major||0).toLocaleString('en-UG')}</h3><small>{row.simulated?'Simulator snapshot':'Provider snapshot'} · {age(row.captured_at)}</small></article>):<div className="pay-empty">No provider balance snapshots yet. They will populate once balance capture is enabled for the active rail.</div>}
      </div>
    </section>

    <section className="pay-section">
      <div className="pay-section-head"><div><span>Settlement</span><h2>Last 24 hours</h2></div><small>Recorded provider settlements</small></div>
      <div className="pay-grid pay-grid--three">
        <Stat label="Settlements" value={fmt(settlements.count)} detail="recorded"/>
        <Stat label="Gross" value={settlementRows.length?moneyRows(settlementRows,'gross_minor'):fmt(settlements.gross_minor)} detail="provider settlement value"/>
        <Stat label="Processing fees" value={settlementRows.length?moneyRows(settlementRows,'fee_minor'):fmt(settlements.fee_minor)} detail="recorded fees"/>
      </div>
    </section>

    <section className="pay-section">
      <div className="pay-section-head"><div><span>Disbursements</span><h2>Payout queue · 24h</h2></div><small>Approval-gated</small></div>
      <div className="pay-table">
        <div className="pay-tr pay-th"><span>Status</span><span>Count</span><span>Value</span></div>
        {payoutStatus.length?payoutStatus.map(row=><div className="pay-tr" key={row.status}><span>{row.status}</span><strong>{fmt(row.count)}</strong><span>{moneyRows(row.rows)}</span></div>):<div className="pay-empty">No payout activity in the last 24 hours.</div>}
      </div>
    </section>

    <section className="pay-section">
      <div className="pay-section-head"><div><span>Rails</span><h2>Configured markets</h2></div><small>Runtime registry</small></div>
      <div className="pay-table">
        <div className="pay-tr pay-th"><span>Market</span><span>Provider</span><span>Environment</span></div>
        {rails.map((row,index)=><div className="pay-tr" key={row.id??index}><span>{row.country_code}</span><strong>{String(row.provider_code||'').toUpperCase()}</strong><span>{row.environment}{row.enabled===false?' · disabled':''}</span></div>)}
      </div>
    </section>
  </div>;
}
