import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, LoadingRows, PageHeader, Panel, Pill, StateBanner, formatMoney } from '../components/ProductUI';
import { ConfirmDialog, Drawer, FormField } from '../components/InteractionUI';
import { APP_TIMEZONE, dateKey } from '../utils/time';

const toneForStatus=status=>status==='Paid'?'success':status==='Sent'?'info':status==='Overdue'?'danger':status==='Cancelled'?'neutral':'warning';

function CashFlowChart({projection=[]}){
  if(!projection.length)return <EmptyState icon="chart" title="No projection yet" body="Cash-flow projection data will appear once revenue and cost assumptions are available."/>;
  const max=Math.max(1,...projection.map(m=>Math.max(Number(m.income||0),Number(m.expenses||0))));
  return <div className="cashflow-bars" role="img" aria-label="90-day income and expense projection">
    {projection.map((m,i)=><div className="cashflow-bar-group" key={i}>
      <div className="cashflow-bar-track" aria-hidden="true">
        <span className="cashflow-bar cashflow-bar--income" style={{height:`${Math.max(2,(Number(m.income||0)/max)*100)}%`}}/>
        <span className="cashflow-bar cashflow-bar--expense" style={{height:`${Math.max(2,(Number(m.expenses||0)/max)*100)}%`}}/>
      </div>
      <strong>{m.label}</strong>
      <small>{formatMoney(m.net||0,'USD')} net</small>
    </div>)}
  </div>;
}

function InvoiceBuilder({open,onSave,onCancel}){
  const today=dateKey(new Date(),APP_TIMEZONE);
  const due=dateKey(new Date(Date.now()+30*86400000),APP_TIMEZONE);
  const[form,setForm]=useState({client_name:'',client_org:'',client_email:'',client_address:'',currency:'USD',tax_rate:0,notes:'',issued_date:today,due_date:due,items:[{description:'',qty:1,rate:0}]});
  const[busy,setBusy]=useState(false),[error,setError]=useState('');
  const setF=(k,v)=>setForm(f=>({...f,[k]:v}));
  const setItem=(i,k,v)=>setForm(f=>({...f,items:f.items.map((it,idx)=>idx===i?{...it,[k]:v}:it)}));
  const addItem=()=>setForm(f=>({...f,items:[...f.items,{description:'',qty:1,rate:0}]}));
  const removeItem=i=>setForm(f=>({...f,items:f.items.filter((_,idx)=>idx!==i)}));
  const subtotal=form.items.reduce((sum,item)=>sum+(Number(item.qty)||1)*(Number(item.rate)||0),0);
  const tax=subtotal*Number(form.tax_rate||0)/100,total=subtotal+tax;
  const save=async()=>{
    if(!form.client_name.trim()){setError('Client name is required.');return;}
    if(!form.items.some(x=>String(x.description||'').trim())){setError('Add at least one invoice line item.');return;}
    setBusy(true);setError('');
    try{
      const r=await fetch('/api/invoices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,client_name:form.client_name.trim()})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'Invoice could not be created.');
      onSave?.(d.invoice);
    }catch(e){setError(e.message||'Invoice could not be created.');}
    setBusy(false);
  };
  return <Drawer open={open} onClose={()=>!busy&&onCancel?.()} eyebrow="Money" title="New invoice" subtitle="Create the receivable, then verify delivery before marking it sent or paid." footer={<><Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy}>{busy?'Creating…':'Create invoice'}</Button></>}>
    {error&&<StateBanner tone="danger" title="Invoice needs attention">{error}</StateBanner>}
    <div className="px-stack">
      <div className="px-form-grid">
        <FormField label="Client name" required><input value={form.client_name} onChange={e=>setF('client_name',e.target.value)} placeholder="Client or buyer"/></FormField>
        <FormField label="Organisation"><input value={form.client_org} onChange={e=>setF('client_org',e.target.value)} placeholder="Organisation"/></FormField>
      </div>
      <div className="px-form-grid">
        <FormField label="Email"><input type="email" value={form.client_email} onChange={e=>setF('client_email',e.target.value)} placeholder="client@example.com"/></FormField>
        <FormField label="Currency"><select value={form.currency} onChange={e=>setF('currency',e.target.value)}>{['USD','UGX','KES','EUR','GBP'].map(c=><option key={c}>{c}</option>)}</select></FormField>
      </div>
      <div>
        <div className="px-between"><div><div className="px-list-title">Line items</div><div className="px-list-sub">Describe the actual billable outcome.</div></div><Button variant="ghost" icon="plus" onClick={addItem}>Add item</Button></div>
        <div className="px-stack" style={{marginTop:10}}>{form.items.map((item,i)=><div className="cashflow-line-item" key={i}>
          <FormField label={`Description ${i+1}`}><input value={item.description} onChange={e=>setItem(i,'description',e.target.value)} placeholder="Service or deliverable"/></FormField>
          <FormField label="Qty"><input type="number" min="0" value={item.qty} onChange={e=>setItem(i,'qty',e.target.value)}/></FormField>
          <FormField label="Rate"><input type="number" min="0" value={item.rate} onChange={e=>setItem(i,'rate',e.target.value)}/></FormField>
          <div className="cashflow-line-total"><span>Total</span><strong>{formatMoney((Number(item.qty)||1)*(Number(item.rate)||0),form.currency)}</strong>{form.items.length>1&&<button className="px-icon-button" aria-label={`Remove line item ${i+1}`} onClick={()=>removeItem(i)}>×</button>}</div>
        </div>)}</div>
      </div>
      <div className="px-form-grid">
        <FormField label="Issued date"><input type="date" value={form.issued_date} onChange={e=>setF('issued_date',e.target.value)}/></FormField>
        <FormField label="Due date"><input type="date" value={form.due_date} onChange={e=>setF('due_date',e.target.value)}/></FormField>
        <FormField label="Tax %"><input type="number" min="0" value={form.tax_rate} onChange={e=>setF('tax_rate',e.target.value)}/></FormField>
      </div>
      <Panel title="Invoice total" subtitle="Calculated from line items and tax.">
        <div className="px-list">
          <div className="px-list-row"><span>Subtotal</span><strong>{formatMoney(subtotal,form.currency)}</strong></div>
          {Number(form.tax_rate)>0&&<div className="px-list-row"><span>Tax ({form.tax_rate}%)</span><strong>{formatMoney(tax,form.currency)}</strong></div>}
          <div className="px-list-row"><strong>Total</strong><strong>{formatMoney(total,form.currency)}</strong></div>
        </div>
      </Panel>
      <FormField label="Notes"><textarea value={form.notes} onChange={e=>setF('notes',e.target.value)} placeholder="Payment terms, bank details or delivery notes"/></FormField>
    </div>
  </Drawer>;
}

export default function CashFlow({openAI}){
  const[data,setData]=useState(null),[tab,setTab]=useState('overview'),[showBuilder,setShowBuilder]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[pendingDelete,setPendingDelete]=useState(null),[busy,setBusy]=useState('');
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const r=await fetch('/api/cashflow',{headers:{Accept:'application/json'}});
      const body=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(body.error||'Cash-flow data could not be loaded.');
      setData(body);
    }catch(e){setError(e.message||'Cash-flow data could not be loaded.');}
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  const updateStatus=async(id,status)=>{
    setBusy(id);setError('');
    const r=await fetch(`/api/invoices/${encodeURIComponent(id)}/status`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){setError(d.error||`Invoice could not be marked ${status}.`);setBusy('');return;}
    await load();setBusy('');
  };
  const deleteInvoice=async()=>{
    const id=pendingDelete?.id;if(!id)return;
    setBusy(id);const r=await fetch(`/api/invoices/${encodeURIComponent(id)}`,{method:'DELETE'});const d=await r.json().catch(()=>({}));
    if(!r.ok){setError(d.error||'Invoice could not be deleted.');setBusy('');return;}
    setPendingDelete(null);await load();setBusy('');
  };
  const openInvoice=id=>window.open(`/api/invoices/${encodeURIComponent(id)}/html`,'_blank','noopener,noreferrer');

  if(loading&&!data)return <div className="module"><PageHeader eyebrow="Money" title="Cash flow" subtitle="90-day projection, invoices and receivables."/><LoadingRows count={7}/></div>;
  if(!data)return <div className="module"><PageHeader eyebrow="Money" title="Cash flow" subtitle="90-day projection, invoices and receivables."/><StateBanner tone="danger" title="Cash-flow data unavailable">{error||'JakeOS could not load financial data.'}<div style={{marginTop:10}}><Button variant="secondary" icon="refresh" onClick={load}>Retry</Button></div></StateBanner></div>;

  const streams=Array.isArray(data.streams)?data.streams:[],invoices=Array.isArray(data.invoices)?data.invoices:[],projection=Array.isArray(data.projection)?data.projection:[];
  const confirmed=streams.filter(x=>x.status==='Confirmed').reduce((sum,x)=>sum+Number(x.amount||0),0);
  const pending=streams.filter(x=>x.status==='Pending').reduce((sum,x)=>sum+Number(x.amount||0),0);
  const paid=invoices.filter(x=>x.status==='Paid').reduce((sum,x)=>sum+Number(x.total||0),0);
  const overdue=invoices.filter(x=>x.status==='Sent'&&x.due_date&&new Date(x.due_date)<new Date());
  const ask=()=>openAI?.(`Cash flow: confirmed ${confirmed} USD, pending ${pending} USD, monthly costs ${Number(data.monthlyExpenses||0)} USD, ${overdue.length} overdue invoices. Identify collection risk, cash timing and the next three money actions.`);

  return <div className="module">
    <PageHeader eyebrow="Money" title="Cash flow" subtitle="Projection, invoices, collection status and revenue movement. Unavailable data is never presented as zero." actions={<><Button variant="secondary" icon="refresh" onClick={load}>Refresh</Button><Button variant="secondary" icon="spark" onClick={ask}>Review</Button><Button icon="plus" onClick={()=>setShowBuilder(true)}>New invoice</Button></>}/>
    {error&&<StateBanner tone="warning" title="Cash-flow refresh is degraded">{error} The last successful snapshot remains visible.</StateBanner>}
    <div className="px-metrics">
      <div className="px-metric px-metric--success"><div className="px-metric-value">{formatMoney(confirmed,'USD')}</div><div className="px-metric-label">Confirmed</div><div className="px-metric-helper">Revenue already secured</div></div>
      <div className="px-metric px-metric--warning"><div className="px-metric-value">{formatMoney(pending,'USD')}</div><div className="px-metric-label">Pending</div><div className="px-metric-helper">Expected, not yet secure</div></div>
      <div className="px-metric"><div className="px-metric-value">{formatMoney(paid,'USD')}</div><div className="px-metric-label">Invoices paid</div><div className="px-metric-helper">Recorded collections</div></div>
      <div className={`px-metric ${overdue.length?'px-metric--danger':''}`}><div className="px-metric-value">{overdue.length}</div><div className="px-metric-label">Overdue</div><div className="px-metric-helper">Sent invoices past due</div></div>
    </div>
    <div className="px-tabs" role="tablist" aria-label="Cash-flow views">{[['overview','Overview'],['invoices','Invoices'],['streams','Revenue streams']].map(([id,label])=><button role="tab" aria-selected={tab===id} key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}</button>)}</div>
    <div style={{height:14}}/>
    {tab==='overview'&&<Panel title="90-day projection" subtitle="Income and expense assumptions, with the net position shown as text as well as bars.">
      <CashFlowChart projection={projection}/>
      {projection.length>0&&<div className="px-list" style={{marginTop:14}}>{projection.map((m,i)=><div className="px-list-row" key={i}><div className="px-list-main"><div className="px-list-title">{m.label}</div><div className="px-list-sub">Income {formatMoney(m.income||0,'USD')} · Expenses {formatMoney(m.expenses||0,'USD')}</div></div><strong>{formatMoney(m.net||0,'USD')}</strong></div>)}</div>}
    </Panel>}
    {tab==='invoices'&&<Panel title="Invoices" subtitle="Verify delivery state before changing invoice status.">
      {invoices.length===0?<EmptyState icon="money" title="No invoices yet" body="Create an invoice when a real receivable exists." action={<Button variant="tonal" onClick={()=>setShowBuilder(true)}>Create invoice</Button>}/>:<div className="px-list">{invoices.map(inv=><div className="px-list-row cashflow-invoice-row" key={inv.id}>
        <div className="px-list-main"><div className="px-list-title">{inv.client_name||'Unnamed client'}</div><div className="px-list-sub">{inv.number||inv.id}{inv.client_org?` · ${inv.client_org}`:''}</div><div className="px-task-meta"><Pill tone={toneForStatus(inv.status)}>{inv.status}</Pill>{inv.due_date&&<span>Due {inv.due_date}</span>}</div></div>
        <strong>{formatMoney(inv.total||0,inv.currency||'USD')}</strong>
        <div className="px-row" style={{flexWrap:'wrap'}}>
          <Button variant="ghost" onClick={()=>openInvoice(inv.id)}>View</Button>
          {inv.status==='Draft'&&<Button variant="secondary" disabled={busy===inv.id} onClick={()=>updateStatus(inv.id,'Sent')}>Mark sent</Button>}
          {inv.status==='Sent'&&<Button variant="secondary" disabled={busy===inv.id} onClick={()=>updateStatus(inv.id,'Paid')}>Mark paid</Button>}
          {['Draft','Sent'].includes(inv.status)&&<Button variant="ghost" disabled={busy===inv.id} onClick={()=>updateStatus(inv.id,'Overdue')}>Mark overdue</Button>}
          <Button variant="ghost" disabled={busy===inv.id} onClick={()=>setPendingDelete(inv)}>Delete</Button>
        </div>
      </div>)}</div>}
    </Panel>}
    {tab==='streams'&&<Panel title="Revenue streams" subtitle="Confirmed, pending and projected sources that feed the operating picture.">
      {streams.length===0?<EmptyState icon="money" title="No revenue streams" body="Revenue streams are managed from Revenue Mission → Plan & targets."/>:<div style={{overflowX:'auto'}}><table className="finance-table"><thead><tr><th>Source</th><th>Type</th><th>Status</th><th>Amount</th><th>Period</th></tr></thead><tbody>{streams.map(row=><tr key={row.id}><td><strong>{row.name}</strong></td><td>{row.type}</td><td><Pill tone={row.status==='Confirmed'?'success':row.status==='Pending'?'warning':'neutral'}>{row.status}</Pill></td><td>{formatMoney(row.amount||0,row.currency||'USD')}</td><td>{row.month||'—'}</td></tr>)}</tbody></table></div>}
    </Panel>}
    <InvoiceBuilder open={showBuilder} onCancel={()=>setShowBuilder(false)} onSave={async inv=>{setShowBuilder(false);await load();if(inv?.id)openInvoice(inv.id);}}/>
    <ConfirmDialog open={!!pendingDelete} onClose={()=>!busy&&setPendingDelete(null)} onConfirm={deleteInvoice} busy={!!busy} title="Delete invoice?" body={pendingDelete?`${pendingDelete.number||'This invoice'} for ${pendingDelete.client_name||'the client'} will be deleted. This cannot be used as a collection record afterwards.`:''} confirmLabel="Delete invoice"/>
  </div>;
}
