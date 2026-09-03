import { useCallback, useEffect, useMemo, useState } from 'react';

const money = (value, currency='UGX') => new Intl.NumberFormat('en-UG', {
  style:'currency', currency, maximumFractionDigits: currency==='UGX'?0:2
}).format(Number(value||0));
const number = value => Number(value||0).toLocaleString('en-UG');
const age = value => {
  if (!value) return 'No activity yet';
  const ms=Date.now()-new Date(value).getTime();
  if(ms<60000)return 'just now';
  if(ms<3600000)return `${Math.floor(ms/60000)}m ago`;
  if(ms<86400000)return `${Math.floor(ms/3600000)}h ago`;
  return `${Math.floor(ms/86400000)}d ago`;
};

function Metric({label,value,sub,tone}){
  return <div className={`stat-card ${tone?`stat-card--${tone}`:''}`}>
    <div className="stat-value">{value}</div><div className="stat-label">{label}</div>
    {sub&&<div style={{fontSize:10,color:'var(--text-muted)',marginTop:5}}>{sub}</div>}
  </div>;
}

function Growth({value}){
  const n=Number(value||0), positive=n>0;
  return <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,fontWeight:700,color:positive?'var(--green)':n<0?'var(--red)':'var(--text-muted)'}}>{positive?'+':''}{n.toFixed(1)}%</span>;
}

export default function Estate({compact=false}){
  const [state,setState]=useState({loading:true,data:null,error:null});
  const load=useCallback(async(force=false)=>{
    setState(s=>({...s,loading:!s.data,error:null}));
    try{
      const r=await fetch(`/api/estate${force?'?refresh=1':''}`);
      const d=await r.json();
      if(!r.ok&&!d.snapshot)throw new Error(d.error||'Estate data unavailable');
      setState({loading:false,data:d,error:d.error||null});
    }catch(e){setState(s=>({loading:false,data:s.data,error:e.message}));}
  },[]);
  useEffect(()=>{load();const timer=setInterval(()=>load(false),60000);return()=>clearInterval(timer);},[load]);

  const snapshot=state.data?.snapshot;
  const products=snapshot?.products||[],commerce=snapshot?.commerce||[],totals=snapshot?.totals||{};
  const kela=commerce.find(x=>x.productCode==='kela');
  const topProducts=useMemo(()=>[...products].sort((a,b)=>b.activeUsers7d-a.activeUsers7d).slice(0,compact?5:100),[products,compact]);

  if(state.loading&&!snapshot)return <div className="module"><div className="card">Loading Tuku estate…</div></div>;
  if(!snapshot)return <div className="module"><div className="card"><div className="card-header">Tuku Estate</div><div style={{color:'var(--text-muted)'}}>{state.error||'Estate telemetry is not connected yet.'}</div></div></div>;

  return <div className={compact?'':'module'}>
    {!compact&&<div className="module-header"><div><h1 className="module-title">Tuku Estate</h1><p className="module-sub">Usage, growth, orders and earnings across the portfolio</p></div><button className="ai-trigger" onClick={()=>load(true)}>↻ Refresh</button></div>}
    {(state.data?.stale||state.error)&&<div style={{padding:'9px 12px',marginBottom:12,border:'1px solid var(--border)',borderRadius:9,color:'var(--accent)',fontSize:11}}>Showing last successful Tuku Core snapshot · {state.data?.lastSuccessfulAt?age(state.data.lastSuccessfulAt):'freshness unknown'}{state.error?` · ${state.error}`:''}</div>}
    <div className="stats-row" style={{marginBottom:16}}>
      <Metric label="Active users · 24h" value={number(totals.activeUsers24h)} />
      <Metric label="Active users · 7d" value={number(totals.activeUsers7d)} />
      <Metric label="Active orders" value={number(totals.ordersActive)} tone="amber" />
      <Metric label="Realized earnings" value={money(totals.realizedRevenueUGX,'UGX')} tone="green" />
    </div>

    <div className="card" style={{marginBottom:16}}>
      <div className="card-header">Product usage <span style={{fontWeight:400,textTransform:'none',letterSpacing:0}}>· actual activity, not just access</span></div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',minWidth:720,fontSize:11}}>
          <thead><tr style={{textAlign:'left',color:'var(--text-muted)',borderBottom:'1px solid var(--border)'}}>
            <th style={{padding:'8px 6px'}}>Tool</th><th>Reach</th><th>24h</th><th>7d</th><th>30d</th><th>New 7d</th><th>Growth</th><th>Last activity</th>
          </tr></thead>
          <tbody>{topProducts.map(p=><tr key={p.code} style={{borderBottom:'1px solid var(--border)'}}>
            <td style={{padding:'11px 6px'}}><div style={{fontWeight:700,color:'var(--text)'}}>{p.name}</div><div style={{fontSize:9,color:'var(--text-muted)'}}>{p.code}</div></td>
            <td>{number(p.reach?.users)} <span style={{color:'var(--text-muted)'}}>users</span></td>
            <td>{number(p.activeUsers24h)}</td><td style={{fontWeight:700}}>{number(p.activeUsers7d)}</td><td>{number(p.activeUsers30d)}</td><td>{number(p.newUsers7d)}</td><td><Growth value={p.growth7dPercent}/></td><td style={{color:'var(--text-muted)'}}>{age(p.lastActivityAt)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {!topProducts.length&&<div style={{color:'var(--text-muted)',fontSize:12,padding:'8px 0'}}>No active estate products reported yet.</div>}
    </div>

    <div className="card">
      <div className="card-header">Orders & Earnings</div>
      {kela&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(135px,1fr))',gap:8,marginBottom:14}}>
        {[
          ['Kela live',kela.orders?.active],['New',kela.orders?.new],['Sourcing',kela.orders?.sourcing],['Shopping',kela.orders?.shopping],['Ready',kela.orders?.ready],['On delivery',kela.orders?.outForDelivery],['Fulfilled',kela.orders?.completed]
        ].map(([label,val])=><div key={label} style={{padding:'10px 12px',background:'var(--surface-3)',borderRadius:8}}><div style={{fontFamily:'Syne,sans-serif',fontWeight:800,fontSize:18}}>{number(val)}</div><div style={{fontSize:10,color:'var(--text-muted)'}}>{label}</div></div>)}
      </div>}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:10}}>
        {commerce.map(c=><div key={`${c.productCode}-${c.currency}`} style={{padding:14,border:'1px solid var(--border)',borderRadius:10}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'baseline'}}><strong style={{textTransform:'capitalize'}}>{c.productCode}</strong><span style={{fontSize:9,color:'var(--text-muted)'}}>{c.currency}</span></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:10}}>
            <div><div style={{fontSize:15,fontWeight:800}}>{number(c.orders?.active)}</div><div style={{fontSize:9,color:'var(--text-muted)'}}>Live orders</div></div>
            <div><div style={{fontSize:15,fontWeight:800}}>{number(c.orders?.completed)}</div><div style={{fontSize:9,color:'var(--text-muted)'}}>Fulfilled</div></div>
            <div><div style={{fontSize:13,fontWeight:800,color:'var(--green)'}}>{money(c.earnings?.realized,c.currency)}</div><div style={{fontSize:9,color:'var(--text-muted)'}}>Realized</div></div>
            <div><div style={{fontSize:13,fontWeight:800,color:'var(--accent)'}}>{money(c.earnings?.pending,c.currency)}</div><div style={{fontSize:9,color:'var(--text-muted)'}}>Pending</div></div>
          </div>
        </div>)}
      </div>
      {!commerce.length&&<div style={{color:'var(--text-muted)',fontSize:12}}>No commerce feeds have reported orders yet.</div>}
    </div>
    {!compact&&<div style={{fontSize:9,color:'var(--text-muted)',marginTop:10}}>Tuku Core snapshot generated {snapshot.generatedAt?new Date(snapshot.generatedAt).toLocaleString('en-UG'):'—'} · refreshed by JakeOS every minute.</div>}
  </div>;
}
