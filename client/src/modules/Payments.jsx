import { useEffect,useMemo,useState } from 'react';
import './Payments.css';

const fmt=v=>Number(v||0).toLocaleString('en-UG');
const moneyMinor=v=>`UGX ${(Number(v||0)/100).toLocaleString('en-UG',{maximumFractionDigits:2})}`;
const age=v=>{if(!v)return'—';const mins=Math.max(0,Math.round((Date.now()-new Date(v).getTime())/60000));if(mins<2)return'Just now';if(mins<60)return`${mins}m ago`;const h=Math.round(mins/60);return h<48?`${h}h ago`:`${Math.round(h/24)}d ago`;};

function Stat({label,value,detail,tone=''}){return <article className={`pay-stat ${tone?`pay-stat--${tone}`:''}`}><span>{label}</span><strong>{value}</strong>{detail&&<small>{detail}</small>}</article>;}

export default function Payments(){
  const[data,setData]=useState(null),[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState('');
  const load=async(manual=false)=>{manual?setRefreshing(true):setLoading(true);setError('');try{const r=await fetch('/api/tukupay/summary',{headers:{Accept:'application/json'}});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error||'TukuPay operations unavailable');setData(body);}catch(e){setError(e.message||'TukuPay operations unavailable');}finally{setLoading(false);setRefreshing(false);}};
  useEffect(()=>{load();const timer=setInterval(()=>load(),30000);return()=>clearInterval(timer);},[]);

  const payments=Array.isArray(data?.ops?.payments24h)?data.ops.payments24h:[];
  const payouts=Array.isArray(data?.ops?.payouts24h)?data.ops.payouts24h:[];
  const balances=Array.isArray(data?.ops?.balances)?data.ops.balances:[];
  const rails=Array.isArray(data?.ops?.rails)?data.ops.rails:[];
  const byStatus=useMemo(()=>Object.fromEntries(payments.map(row=>[row.status,row])),[payments]);
  const totalCount=payments.reduce((s,row)=>s+Number(row.count||0),0);
  const totalMinor=payments.reduce((s,row)=>s+Number(row.amount_minor||0),0);
  const successful=byStatus.SUCCESSFUL??{};
  const pending=byStatus.PENDING??{};
  const failed=byStatus.FAILED??{};
  const aging=data?.ops?.pendingAging??{};
  const settlements=data?.ops?.settlements24h??{};

  if(loading&&!data)return <div className="pay-page"><div className="pay-loading">Loading TukuPay operations…</div></div>;
  return <div className="pay-page">
    <header className="pay-hero">
      <div><div className="pay-eyebrow">Tuku estate payments</div><h1>TukuPay</h1><p>Collections, payout exposure, provider balances, settlement activity and payment exceptions from the central Tuku payment rail.</p></div>
      <button className="pay-refresh" onClick={()=>load(true)} disabled={refreshing}>{refreshing?'Refreshing…':'Refresh'}</button>
    </header>
    {error&&<div className="pay-banner">{error}</div>}

    <section className="pay-status">
      <div><span>Service status</span><strong>{data?.health?.status==='ok'?'Operational':'Attention'}</strong><small>v{data?.health?.version??'—'} · simulator {data?.health?.simulator?'ON':'OFF'}</small></div>
      <div><span>Last generated</span><strong>{age(data?.ops?.generatedAt)}</strong><small>{data?.ops?.generatedAt?new Date(data.ops.generatedAt).toLocaleString('en-GB'):'—'}</small></div>
    </section>

    <section className="pay-grid">
      <Stat label="Collections · 24h" value={fmt(totalCount)} detail={moneyMinor(totalMinor)}/>
      <Stat label="Successful" value={fmt(successful.count)} detail={moneyMinor(successful.amount_minor)} tone="good"/>
      <Stat label="Pending" value={fmt(pending.count)} detail={moneyMinor(pending.amount_minor)} tone={Number(pending.count)>0?'warn':''}/>
      <Stat label="Failed" value={fmt(failed.count)} detail={moneyMinor(failed.amount_minor)} tone={Number(failed.count)>0?'bad':''}/>
    </section>

    <section className="pay-section">
      <div className="pay-section-head"><div><span>Exceptions</span><h2>Pending payment aging</h2></div><small>Automatic reconciliation remains authoritative</small></div>
      <div className="pay-grid pay-grid--three">
        <Stat label="Pending now" value={fmt(aging.pending)} detail="all pending collections"/>
        <Stat label="Over 5 minutes" value={fmt(aging.over_5m)} detail="review if growing" tone={Number(aging.over_5m)>0?'warn':''}/>
        <Stat label="Over 30 minutes" value={fmt(aging.over_30m)} detail="requires attention" tone={Number(aging.over_30m)>0?'bad':''}/>
      </div>
    </section>

    <section className="pay-section">
      <div className="pay-section-head"><div><span>Provider accounts</span><h2>Latest balances</h2></div><small>Read-only operational view</small></div>
      <div className="pay-cards">
        {balances.length?balances.map((row,index)=><article className="pay-card" key={row.id??`${row.provider_code}-${row.country_code}-${index}`}><div><strong>{String(row.provider_code||'provider').toUpperCase()}</strong><span>{row.country_code} · {row.account_type}</span></div><h3>{row.currency} {Number(row.available_major||0).toLocaleString('en-UG')}</h3><small>{row.simulated?'Simulator snapshot':'Provider snapshot'} · {age(row.captured_at)}</small></article>):<div className="pay-empty">No provider balance snapshots yet. They will populate once live operator credentials are activated.</div>}
      </div>
    </section>

    <section className="pay-section">
      <div className="pay-section-head"><div><span>Settlement</span><h2>Last 24 hours</h2></div><small>Recorded provider settlements</small></div>
      <div className="pay-grid pay-grid--three">
        <Stat label="Settlements" value={fmt(settlements.count)} detail="recorded"/>
        <Stat label="Gross" value={moneyMinor(settlements.gross_minor)} detail="provider settlement value"/>
        <Stat label="Processing fees" value={moneyMinor(settlements.fee_minor)} detail="recorded fees"/>
      </div>
    </section>

    <section className="pay-section">
      <div className="pay-section-head"><div><span>Disbursements</span><h2>Payout queue · 24h</h2></div><small>Approval-gated</small></div>
      <div className="pay-table">
        <div className="pay-tr pay-th"><span>Status</span><span>Count</span><span>Value</span></div>
        {payouts.length?payouts.map(row=><div className="pay-tr" key={row.status}><span>{row.status}</span><strong>{fmt(row.count)}</strong><span>{moneyMinor(row.amount_minor)}</span></div>):<div className="pay-empty">No payout activity in the last 24 hours.</div>}
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
