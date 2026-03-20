import { useState, useEffect, useCallback } from 'react';

const STATUS_COLORS = { Draft:'#5C6680', Sent:'#F0B429', Paid:'#0ECB81', Overdue:'#FF4757', Cancelled:'#2A3050' };

function CashFlowChart({ projection }) {
  if (!projection?.length) return null;
  const max = Math.max(...projection.map(m => Math.max(m.income, m.expenses, 1)));

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', height: 120, padding: '0 4px' }}>
      {projection.map((m, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ width: '100%', display: 'flex', gap: 4, alignItems: 'flex-end', height: 90 }}>
            <div style={{ flex: 1, background: 'var(--green)', borderRadius: '3px 3px 0 0', height: `${(m.income / max) * 90}px`, minHeight: m.income > 0 ? 4 : 0, transition: 'height 0.4s ease' }} title={`Income: $${m.income.toLocaleString()}`} />
            <div style={{ flex: 1, background: 'var(--red)', borderRadius: '3px 3px 0 0', height: `${(m.expenses / max) * 90}px`, minHeight: 4, opacity: 0.7, transition: 'height 0.4s ease' }} title={`Expenses: $${m.expenses.toLocaleString()}`} />
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {m.label.split(' ')[0]}
          </div>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: m.net >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
            {m.net >= 0 ? '+' : ''}{m.net >= 1000 ? `$${(m.net/1000).toFixed(1)}k` : `$${m.net}`}
          </div>
        </div>
      ))}
    </div>
  );
}

function InvoiceBuilder({ onSave, onCancel, clients }) {
  const [form, setForm] = useState({
    client_name: '', client_org: '', client_email: '', client_address: '',
    currency: 'USD', tax_rate: 0, notes: '',
    issued_date: new Date().toISOString().slice(0,10),
    due_date: new Date(Date.now() + 30*86400000).toISOString().slice(0,10),
    items: [{ description: '', qty: 1, rate: 0 }]
  });

  const setF = (k, v) => setForm(f => ({...f, [k]: v}));
  const setItem = (i, k, v) => setForm(f => ({...f, items: f.items.map((it,idx) => idx===i ? {...it,[k]:v} : it)}));
  const addItem = () => setForm(f => ({...f, items: [...f.items, {description:'',qty:1,rate:0}]}));
  const removeItem = (i) => setForm(f => ({...f, items: f.items.filter((_,idx)=>idx!==i)}));

  const subtotal = form.items.reduce((s, i) => s + (Number(i.qty)||1) * (Number(i.rate)||0), 0);
  const taxAmt = subtotal * (form.tax_rate||0) / 100;
  const total = subtotal + taxAmt;

  const save = async () => {
    if (!form.client_name) return;
    const res = await fetch('/api/invoices', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) });
    const data = await res.json();
    onSave(data.invoice);
  };

  const inp = (k, ph, type='text', style={}) => (
    <input type={type} value={form[k]||''} onChange={e=>setF(k,e.target.value)} placeholder={ph}
      style={{background:'var(--surface-3)',border:'1px solid var(--border)',borderRadius:5,padding:'7px 9px',color:'var(--text)',fontSize:13,width:'100%',...style}} />
  );

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box" style={{maxWidth:600,maxHeight:'90vh'}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">New Invoice</span>
          <button className="ai-close" onClick={onCancel}>✕</button>
        </div>
        <div className="modal-body" style={{overflowY:'auto'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
            <div><label style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',display:'block',marginBottom:3}}>Client Name *</label>{inp('client_name','e.g. Lead4Africa')}</div>
            <div><label style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',display:'block',marginBottom:3}}>Organisation</label>{inp('client_org','Organisation')}</div>
            <div><label style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',display:'block',marginBottom:3}}>Email</label>{inp('client_email','client@email.com','email')}</div>
            <div><label style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',display:'block',marginBottom:3}}>Currency</label>
              <select value={form.currency} onChange={e=>setF('currency',e.target.value)} style={{background:'var(--surface-3)',border:'1px solid var(--border)',borderRadius:5,padding:'7px 9px',color:'var(--text)',fontSize:13,width:'100%'}}>
                {['USD','UGX','KES','EUR','GBP'].map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em',color:'var(--text-muted)',marginBottom:8}}>Line Items</div>
            {form.items.map((item, i) => (
              <div key={i} style={{display:'flex',gap:6,marginBottom:6,alignItems:'center'}}>
                <input value={item.description} onChange={e=>setItem(i,'description',e.target.value)} placeholder="Description"
                  style={{flex:3,background:'var(--surface-3)',border:'1px solid var(--border)',borderRadius:5,padding:'7px 9px',color:'var(--text)',fontSize:13}} />
                <input type="number" value={item.qty} onChange={e=>setItem(i,'qty',e.target.value)} placeholder="Qty"
                  style={{width:55,background:'var(--surface-3)',border:'1px solid var(--border)',borderRadius:5,padding:'7px 9px',color:'var(--text)',fontSize:13,textAlign:'center'}} />
                <input type="number" value={item.rate} onChange={e=>setItem(i,'rate',e.target.value)} placeholder="Rate"
                  style={{flex:1,background:'var(--surface-3)',border:'1px solid var(--border)',borderRadius:5,padding:'7px 9px',color:'var(--text)',fontSize:13}} />
                <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:12,color:'var(--green)',width:70,textAlign:'right',flexShrink:0}}>
                  {form.currency==='UGX'?'UGX':'$'}{((item.qty||1)*(item.rate||0)).toLocaleString()}
                </span>
                {form.items.length > 1 && <button onClick={()=>removeItem(i)} style={{color:'var(--red)',background:'none',border:'none',cursor:'pointer',fontSize:14,padding:2}}>×</button>}
              </div>
            ))}
            <button onClick={addItem} style={{fontSize:12,color:'var(--blue)',background:'var(--blue-dim)',border:'1px solid rgba(94,106,210,.2)',borderRadius:5,padding:'5px 12px',cursor:'pointer',marginTop:4}}>+ Add item</button>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12}}>
            <div><label style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',display:'block',marginBottom:3}}>Issued</label>{inp('issued_date','','date')}</div>
            <div><label style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',display:'block',marginBottom:3}}>Due</label>{inp('due_date','','date')}</div>
            <div><label style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',display:'block',marginBottom:3}}>Tax %</label>
              <input type="number" value={form.tax_rate} onChange={e=>setF('tax_rate',e.target.value)} placeholder="0"
                style={{background:'var(--surface-3)',border:'1px solid var(--border)',borderRadius:5,padding:'7px 9px',color:'var(--text)',fontSize:13,width:'100%'}} />
            </div>
          </div>

          <div style={{background:'var(--surface-3)',borderRadius:8,padding:12,marginBottom:12}}>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:13,color:'var(--text-muted)',marginBottom:4}}>
              <span>Subtotal</span><span style={{fontFamily:'JetBrains Mono,monospace'}}>{form.currency==='UGX'?'UGX':'$'}{subtotal.toLocaleString()}</span>
            </div>
            {form.tax_rate > 0 && <div style={{display:'flex',justifyContent:'space-between',fontSize:13,color:'var(--text-muted)',marginBottom:4}}>
              <span>Tax ({form.tax_rate}%)</span><span style={{fontFamily:'JetBrains Mono,monospace'}}>{form.currency==='UGX'?'UGX':'$'}{taxAmt.toLocaleString()}</span>
            </div>}
            <div style={{display:'flex',justifyContent:'space-between',fontSize:16,fontWeight:700,fontFamily:'Syne,sans-serif',borderTop:'1px solid var(--border)',paddingTop:8,marginTop:4}}>
              <span>Total</span><span style={{color:'var(--green)',fontFamily:'JetBrains Mono,monospace'}}>{form.currency==='UGX'?'UGX':'$'}{total.toLocaleString()}</span>
            </div>
          </div>

          <textarea value={form.notes} onChange={e=>setF('notes',e.target.value)} placeholder="Notes (payment terms, bank details, etc.)"
            style={{width:'100%',background:'var(--surface-3)',border:'1px solid var(--border)',borderRadius:5,padding:'8px 10px',color:'var(--text)',fontSize:13,minHeight:60,resize:'vertical',fontFamily:'DM Sans,sans-serif'}} />
        </div>
        <div style={{padding:'12px 16px',borderTop:'1px solid var(--border)',display:'flex',gap:8}}>
          <button onClick={save} style={{flex:1,padding:'10px',background:'var(--accent)',color:'#07090F',border:'none',borderRadius:6,fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'Syne,sans-serif'}}>Create Invoice</button>
          <button onClick={onCancel} style={{padding:'10px 16px',background:'var(--surface-3)',color:'var(--text-muted)',border:'none',borderRadius:6,cursor:'pointer'}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function CashFlow({ openAI }) {
  const [data, setData] = useState({ streams:[], expenses:[], invoices:[], projection:[], monthlyExpenses:0 });
  const [tab, setTab] = useState('overview');
  const [showBuilder, setShowBuilder] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cashflow');
      setData(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id, status) => {
    await fetch(`/api/invoices/${id}/status`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status}) });
    load();
  };

  const openInvoice = (id) => window.open(`/api/invoices/${id}/html`, '_blank');

  const deleteInvoice = async (id) => {
    if (!confirm('Delete invoice?')) return;
    await fetch(`/api/invoices/${id}`, { method:'DELETE' });
    load();
  };

  const confirmed = data.streams.filter(s=>s.status==='Confirmed').reduce((s,x)=>s+x.amount,0);
  const pending   = data.streams.filter(s=>s.status==='Pending').reduce((s,x)=>s+x.amount,0);
  const invoicedTotal = data.invoices.filter(i=>i.status!=='Cancelled').reduce((s,i)=>s+i.total,0);
  const paidTotal = data.invoices.filter(i=>i.status==='Paid').reduce((s,i)=>s+i.total,0);
  const overdueInvoices = data.invoices.filter(i => i.status==='Sent' && i.due_date && new Date(i.due_date)<new Date());

  return (
    <div className="module">
      <div className="module-header">
        <div>
          <h1 className="module-title">Cash Flow</h1>
          <p className="module-sub">90-day projection · Invoices · Revenue streams</p>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="ai-trigger-sm" onClick={()=>setShowBuilder(true)}>+ Invoice</button>
          <button className="ai-trigger" onClick={()=>openAI(`Cash flow: confirmed $${confirmed.toLocaleString()}, pending $${pending.toLocaleString()}, monthly costs $${data.monthlyExpenses}/mo. ${overdueInvoices.length} overdue invoices.`)}>✦ Ask AI</button>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat-card stat-card--green"><div className="stat-value">${confirmed.toLocaleString()}</div><div className="stat-label">Confirmed</div></div>
        <div className="stat-card stat-card--amber"><div className="stat-value">${pending.toLocaleString()}</div><div className="stat-label">Pending</div></div>
        <div className="stat-card"><div className="stat-value">${paidTotal.toLocaleString()}</div><div className="stat-label">Invoices Paid</div></div>
        <div className="stat-card stat-card--red"><div className="stat-value">{overdueInvoices.length}</div><div className="stat-label">Overdue</div></div>
      </div>

      <div className="filter-bar">
        {['overview','invoices','streams'].map(t => (
          <button key={t} className={`filter-btn ${tab===t?'filter-btn--active':''}`} onClick={()=>setTab(t)} style={{textTransform:'capitalize'}}>{t}</button>
        ))}
      </div>

      <div className="module-body">
        {tab === 'overview' && (
          <>
            <div className="card" style={{marginBottom:14}}>
              <div className="card-header">90-Day Cash Flow Projection</div>
              <div style={{display:'flex',gap:16,marginBottom:10}}>
                <span style={{fontSize:11,color:'var(--green)'}}>█ Income</span>
                <span style={{fontSize:11,color:'var(--red)',opacity:0.7}}>█ Expenses</span>
              </div>
              <CashFlowChart projection={data.projection} />
              {data.projection.map((m,i) => (
                <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
                  <span style={{color:'var(--text)'}}>{m.label}</span>
                  <div style={{display:'flex',gap:16}}>
                    <span style={{color:'var(--green)',fontFamily:'JetBrains Mono,monospace'}}>+${m.income.toLocaleString()}</span>
                    <span style={{color:'var(--red)',fontFamily:'JetBrains Mono,monospace'}}>-${m.expenses.toLocaleString()}</span>
                    <span style={{color:m.net>=0?'var(--green)':'var(--red)',fontFamily:'JetBrains Mono,monospace',fontWeight:600}}>{m.net>=0?'+':''}{m.net.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'invoices' && (
          <div>
            {data.invoices.length === 0 && <div style={{color:'var(--text-muted)',fontSize:13}}>No invoices yet. Create one with the button above.</div>}
            {data.invoices.map(inv => (
              <div key={inv.id} className="card" style={{marginBottom:8,padding:12}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,color:'var(--text-muted)',marginBottom:2}}>{inv.number}</div>
                    <div style={{fontSize:14,fontWeight:600,color:'var(--text)'}}>{inv.client_name}</div>
                    <div style={{fontSize:11,color:'var(--text-muted)'}}>{inv.client_org}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:16,fontWeight:700,color:'var(--green)'}}>{inv.currency==='UGX'?'UGX':'$'}{Number(inv.total).toLocaleString()}</div>
                    <div style={{marginTop:3,display:'flex',gap:4,justifyContent:'flex-end'}}>
                      <span style={{fontSize:10,fontWeight:700,padding:'2px 6px',borderRadius:4,background:STATUS_COLORS[inv.status]+'22',color:STATUS_COLORS[inv.status]}}>{inv.status}</span>
                    </div>
                  </div>
                </div>
                <div style={{display:'flex',gap:6,marginTop:10,flexWrap:'wrap'}}>
                  <button onClick={()=>openInvoice(inv.id)} style={{padding:'5px 10px',background:'var(--blue-dim)',color:'var(--blue)',border:'none',borderRadius:5,fontSize:11,fontWeight:600,cursor:'pointer'}}>↗ View PDF</button>
                  {inv.status==='Draft' && <button onClick={()=>updateStatus(inv.id,'Sent')} style={{padding:'5px 10px',background:'var(--accent-dim)',color:'var(--accent)',border:'none',borderRadius:5,fontSize:11,fontWeight:600,cursor:'pointer'}}>Mark Sent</button>}
                  {inv.status==='Sent' && <button onClick={()=>updateStatus(inv.id,'Paid')} style={{padding:'5px 10px',background:'var(--green-dim)',color:'var(--green)',border:'none',borderRadius:5,fontSize:11,fontWeight:600,cursor:'pointer'}}>Mark Paid ✓</button>}
                  {['Draft','Sent'].includes(inv.status) && <button onClick={()=>updateStatus(inv.id,'Overdue')} style={{padding:'5px 10px',background:'var(--red-dim)',color:'var(--red)',border:'none',borderRadius:5,fontSize:11,fontWeight:600,cursor:'pointer'}}>Mark Overdue</button>}
                  <button onClick={()=>deleteInvoice(inv.id)} style={{padding:'5px 10px',background:'transparent',color:'var(--text-dim)',border:'none',borderRadius:5,fontSize:11,cursor:'pointer',marginLeft:'auto'}}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'streams' && (
          <table className="finance-table" style={{width:'100%'}}>
            <thead><tr>
              <th>Source</th><th>Type</th><th>Status</th><th>Amount</th><th>Period</th>
            </tr></thead>
            <tbody>
              {data.streams.map(s => (
                <tr key={s.id}>
                  <td className="finance-name">{s.name}</td>
                  <td><span className="badge">{s.type}</span></td>
                  <td><span className="badge" style={{color:s.status==='Confirmed'?'var(--green)':s.status==='Pending'?'var(--accent)':'var(--text-muted)'}}>{s.status}</span></td>
                  <td className="finance-amount">${Number(s.amount).toLocaleString()}</td>
                  <td style={{fontSize:11,color:'var(--text-muted)',fontFamily:'JetBrains Mono,monospace'}}>{s.month}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showBuilder && <InvoiceBuilder onSave={(inv) => { setShowBuilder(false); load(); if(inv?.id) openInvoice(inv.id); }} onCancel={()=>setShowBuilder(false)} />}
    </div>
  );
}
