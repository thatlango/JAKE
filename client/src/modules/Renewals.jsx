import { useEffect, useState } from 'react';

const fmtDate=v=>v?new Date(v).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'—';
const money=(amount,currency='USD')=>amount==null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency}).format(Number(amount));

function statusFor(item){
  if(item.due_days!=null&&item.due_days<=7)return'critical';
  if(item.due_days!=null&&item.due_days<=30)return'attention';
  if(item.needs_confirmation)return'attention';
  return'healthy';
}

export default function Renewals(){
  const[data,setData]=useState(null),[error,setError]=useState(''),[saving,setSaving]=useState('');
  const load=async()=>{try{const r=await fetch('/api/ops/subscriptions',{headers:{Accept:'application/json'}}),body=await r.json();if(!r.ok)throw new Error(body.error||'Renewal registry unavailable');setData(body);setError('');}catch(e){setError(e.message);}};
  useEffect(()=>{load();},[]);
  const confirmDate=async(item,value)=>{if(!value)return;setSaving(item.id);try{const r=await fetch(`/api/ops/subscriptions/${encodeURIComponent(item.id)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({next_renewal_at:`${value}T00:00:00Z`,billing_cycle:item.billing_cycle==='unknown'?'monthly':item.billing_cycle,source:'manual',metadata:{...(item.metadata||{}),renewalDateConfirmed:true}})}),body=await r.json();if(!r.ok)throw new Error(body.error||'Could not save renewal date');await load();}catch(e){setError(e.message);}finally{setSaving('');}};
  return <section className="ops-section">
    <div className="ops-section-head"><div><span>Subscriptions & paid services</span><h2>Renewals, expiry & quotas</h2></div><span className="ops-muted">Continuity costs and service limits</span></div>
    {error&&<div className="ops-banner">{error}</div>}
    <div className="ops-domain-grid">
      {(data?.subscriptions||[]).map(item=>{
        const state=statusFor(item),due=item.expires_at||item.next_renewal_at;
        return <article className="ops-domain-card" key={item.id}>
          <div className="ops-domain-title"><span className={`ops-dot ops-dot--${state}`}/><strong>{item.name}</strong></div>
          <div><span>Provider / plan</span><strong>{item.provider||'—'} · {item.plan_name||'Unspecified'}</strong><small>{item.billing_mode==='quota'?'Quota-based service':item.billing_cycle==='unknown'?'Billing cycle not yet confirmed':`${item.billing_cycle} billing`}</small></div>
          <div><span>{item.expires_at?'Expires':'Next renewal'}</span><strong>{due?`${item.due_days} days`:(item.billing_mode==='quota'?'No fixed expiry':'Needs confirmation')}</strong><small>{due?fmtDate(due):(item.notes||'No date recorded')}</small></div>
          <div><span>Cost</span><strong>{money(item.amount,item.currency)}</strong><small>{item.auto_renew===true?'Auto-renew on':item.auto_renew===false?'Manual renewal':'Auto-renew status unconfirmed'}</small></div>
          {Number(item.usage_limit)>0&&<div><span>Quota</span><strong>{item.usage_current==null?`Up to ${Number(item.usage_limit).toLocaleString()}`:`${Number(item.usage_current).toLocaleString()} / ${Number(item.usage_limit).toLocaleString()}`}</strong><small>{item.usage_unit||'units'}{item.usage_period_end?` · resets ${fmtDate(item.usage_period_end)}`:''}</small></div>}
          {item.needs_confirmation&&<label className="ops-renewal-confirm"><span>Confirm next renewal date</span><input type="date" disabled={saving===item.id} onChange={e=>confirmDate(item,e.target.value)}/></label>}
        </article>;
      })}
      {!data&&<div className="ops-empty">Loading service renewals…</div>}
    </div>
    {data&&<div className="ops-subdomains"><span>{data.summary.total} services tracked</span><span>{data.summary.due30} due within 30 days · {data.summary.needsConfirmation} dates need confirmation</span></div>}
  </section>;
}
