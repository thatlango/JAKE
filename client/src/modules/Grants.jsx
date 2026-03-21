import { useState, useEffect } from 'react';
import { askClaude } from '../api/claude';

const STAGES = ['Identified', 'LOI Submitted', 'Full Application', 'Under Review', 'Awarded', 'Rejected', 'Reporting'];
const STAGE_COLOR = {
  'Identified':       '#5A6480',
  'LOI Submitted':    '#5E6AD2',
  'Full Application': '#F0B429',
  'Under Review':     '#9F7AEA',
  'Awarded':          '#0ECB81',
  'Rejected':         '#FF4757',
  'Reporting':        '#22D3EE',
};
const TYPES = ['Grant', 'Tender', 'RFP', 'Co-funding', 'Prize'];
const SECTORS = ['Agriculture', 'Health', 'Education', 'Technology', 'Gender', 'Climate', 'MSME', 'Youth', 'Other'];

function useGrants() {
  const [grants, setGrants] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jake_grants') || '[]'); } catch { return []; }
  });
  const persist = (g) => { setGrants(g); localStorage.setItem('jake_grants', JSON.stringify(g)); };
  return {
    grants,
    add:    (g) => persist([g, ...grants]),
    update: (id, ch) => persist(grants.map(g => g.id === id ? { ...g, ...ch } : g)),
    del:    (id) => persist(grants.filter(g => g.id !== id)),
  };
}

function useFXRates() {
  const [rates, setRates] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('jake_fx_cache') || '{}');
      if (cached.ts && Date.now() - cached.ts < 3600000) return cached.rates;
    } catch {}
    return { UGX: 3700, KES: 130, EUR: 0.91, GBP: 0.79 };
  });

  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('jake_fx_cache') || '{}');
      if (cached.ts && Date.now() - cached.ts < 3600000) return;
    } catch {}
    fetch('/api/fx-rates?base=USD')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.rates) {
          setRates(d.rates);
          localStorage.setItem('jake_fx_cache', JSON.stringify({ ts: Date.now(), rates: d.rates }));
        }
      })
      .catch(() => {});
  }, []);

  const toUSD = (amount, currency) => {
    if (!amount || currency === 'USD') return amount;
    const rate = rates[currency];
    if (!rate) return amount;
    return Math.round(amount / rate);
  };

  return { rates, toUSD };
}

const DEFAULT_FORM = {
  title:'', funder:'', amount:'', currency:'USD', type:'Grant', sector:'Agriculture',
  stage:'Identified', deadline:'', contact:'', website:'', notes:'', context:'',
};

export default function Grants({ openAI }) {
  const { grants, add, update, del } = useGrants();
  const { rates, toUSD } = useFXRates();
  const [selected, setSelected]   = useState(null);
  const [showForm, setShowForm]   = useState(false);
  const [filter,   setFilter]     = useState('All');
  const [aiDraft,  setAiDraft]    = useState('');
  const [busyLOI,  setBusyLOI]    = useState(false);
  const [showUSD,  setShowUSD]    = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addGrant = () => {
    if (!form.title.trim() || !form.funder.trim()) return;
    add({ ...form, id:`grant_${Date.now()}`, amount: Number(form.amount)||0, checklist:[], createdAt: new Date().toISOString() });
    setForm(DEFAULT_FORM);
    setShowForm(false);
  };

  const generateLOI = async (g) => {
    setBusyLOI(true);
    setAiDraft('');
    const draft = await askClaude([{ role:'user', content:
      `Write a concise Letter of Intent (LOI) for Jacob Odur at Tuku-Tuku Labs to apply for:\n\nGrant: ${g.title}\nFunder: ${g.funder}\nSector: ${g.sector}\nAmount sought: ${g.amount > 0 ? `${g.amount.toLocaleString()} ${g.currency}` : 'TBD'}\nDeadline: ${g.deadline || 'TBD'}\nNotes: ${g.notes || 'none'}\n${g.context ? `\nGrant Context / Guidelines:\n${g.context}` : ''}\n\nTuku-Tuku Labs is a Uganda-based consulting and capacity building firm working in Northern Uganda (Gulu, Lira). Focus areas: MSME development, agricultural incubation, digital literacy, gender-smart business tools.\n\nLOI format: 1-page, include: who we are (2 sentences), proposed project (3 sentences), expected impact (2 sentences), brief budget note, closing ask. Professional but human tone.`
    }], 'pipeline');
    setAiDraft(typeof draft === 'string' ? draft : '');
    setBusyLOI(false);
  };

  const toggleCheck = (id, item) => {
    const g = grants.find(g => g.id === id);
    if (!g) return;
    const list = g.checklist || [];
    const exists = list.find(c => c.item === item);
    update(id, { checklist: exists
      ? list.map(c => c.item === item ? { ...c, done: !c.done } : c)
      : [...list, { item, done: false }]
    });
  };

  const CHECKLIST = [
    'Read full guidelines', 'Register on funder portal', 'Write LOI / concept note',
    'Prepare organisation profile', 'Collect supporting docs', 'Budget prepared',
    'Submit application', 'Confirmation received',
  ];

  const filtered = filter === 'All' ? grants : grants.filter(g => g.stage === filter);
  const sel = grants.find(g => g.id === selected);

  const totalAwarded  = grants.filter(g=>g.stage==='Awarded').reduce((s,g)=>s+g.amount,0);
  const totalPending  = grants.filter(g=>!['Awarded','Rejected'].includes(g.stage)).reduce((s,g)=>s+g.amount,0);

  const displayAmount = (g) => {
    if (!g.amount) return null;
    if (showUSD && g.currency !== 'USD') {
      const usd = toUSD(g.amount, g.currency);
      return `$${usd.toLocaleString()} USD ≈ ${g.amount.toLocaleString()} ${g.currency}`;
    }
    const sym = g.currency === 'USD' ? '$' : '';
    return `${sym}${g.amount.toLocaleString()} ${g.currency}`;
  };

  const inp = (pl, k, type='text') => (
    <input type={type} value={form[k]} onChange={e => set(k, e.target.value)} placeholder={pl}
      style={{ width:'100%', background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 10px', color:'var(--text)', fontSize:13, marginBottom:8 }} />
  );

  const fxLabel = rates.UGX ? `1 USD = ${Math.round(rates.UGX).toLocaleString()} UGX` : null;

  return (
    <div className="module">
      <div className="module-header">
        <div>
          <h1 className="module-title">Grants & Bids</h1>
          <p className="module-sub">
            {grants.length} tracked · {totalAwarded > 0 ? `$${totalAwarded.toLocaleString()} awarded · ` : ''}
            ${totalPending.toLocaleString()} in pursuit
          </p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
          {fxLabel && (
            <span style={{ fontSize:10, color:'var(--text-muted)', fontFamily:'JetBrains Mono,monospace', alignSelf:'center', whiteSpace:'nowrap' }}>
              {fxLabel}
            </span>
          )}
          <button className="ai-trigger-sm" onClick={() => setShowForm(s=>!s)}>+ Add</button>
          <button className="ai-trigger" onClick={() => openAI(`Grants tracker: ${grants.length} opportunities totalling $${(totalAwarded+totalPending).toLocaleString()}. Help me prioritise and strategise.`)}>✦ Ask AI</button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card stat-card--green">
          <div className="stat-value">{grants.filter(g=>g.stage==='Awarded').length}</div>
          <div className="stat-label">Awarded</div>
        </div>
        <div className="stat-card stat-card--amber">
          <div className="stat-value">{grants.filter(g=>['LOI Submitted','Full Application','Under Review'].includes(g.stage)).length}</div>
          <div className="stat-label">In Progress</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{grants.filter(g=>g.stage==='Reporting').length}</div>
          <div className="stat-label">Reporting</div>
        </div>
        <div className="stat-card stat-card--green">
          <div className="stat-value" style={{ fontSize:15 }}>${totalAwarded.toLocaleString()}</div>
          <div className="stat-label">Total Awarded</div>
        </div>
      </div>

      {showForm && (
        <div className="pipeline-add-form">
          <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:14, marginBottom:12 }}>Add Grant / Bid</div>
          <div className="pipeline-form-grid">
            {inp('Grant / programme title *', 'title')}
            {inp('Funder / donor *', 'funder')}
          </div>
          <div style={{ display:'flex', gap:8, marginBottom:8, flexWrap:'wrap' }}>
            <input type="number" value={form.amount} onChange={e=>set('amount',e.target.value)} placeholder="Amount"
              style={{ flex:'2 1 100px', background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 10px', color:'var(--text)', fontSize:13, minWidth:80 }} />
            {['USD','UGX','KES','EUR'].map(c=>(
              <button key={c} onClick={()=>set('currency',c)}
                style={{ flex:'1 1 40px', padding:'8px 4px', borderRadius:6, border:'1px solid var(--border)', fontSize:11, fontWeight:600, cursor:'pointer', background:form.currency===c?'var(--accent-dim)':'transparent', color:form.currency===c?'var(--accent)':'var(--text-muted)', minWidth:40 }}>{c}</button>
            ))}
          </div>
          <div className="grants-form-row">
            <select value={form.type} onChange={e=>set('type',e.target.value)}
              style={{ flex:1, background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 10px', color:'var(--text)', fontSize:13 }}>
              {TYPES.map(t=><option key={t}>{t}</option>)}
            </select>
            <select value={form.sector} onChange={e=>set('sector',e.target.value)}
              style={{ flex:1, background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 10px', color:'var(--text)', fontSize:13 }}>
              {SECTORS.map(s=><option key={s}>{s}</option>)}
            </select>
            <input type="date" value={form.deadline} onChange={e=>set('deadline',e.target.value)}
              style={{ flex:1, background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 10px', color:'var(--text)', fontSize:13 }} />
          </div>
          <div className="pipeline-form-grid" style={{ marginTop:8 }}>
            {inp('Contact person', 'contact')}
            {inp('Website / portal URL', 'website')}
          </div>
          <textarea value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Notes, eligibility criteria, special requirements…"
            style={{ width:'100%', background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 10px', color:'var(--text)', fontSize:13, minHeight:60, resize:'vertical', marginBottom:8, fontFamily:'DM Sans,sans-serif' }} />
          <textarea value={form.context} onChange={e=>set('context',e.target.value)} placeholder="Paste full grant guidelines, RFP text, or eligibility criteria here — AI will use this to draft a stronger LOI…"
            style={{ width:'100%', background:'var(--surface-3)', border:'1px solid rgba(94,106,210,.3)', borderRadius:6, padding:'8px 10px', color:'var(--text)', fontSize:13, minHeight:80, resize:'vertical', marginBottom:8, fontFamily:'DM Sans,sans-serif', borderLeft:'3px solid var(--blue)' }} />
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={addGrant}
              style={{ flex:1, padding:9, background:'var(--accent)', color:'#07090F', border:'none', borderRadius:6, fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'Syne,sans-serif' }}>
              Add Grant
            </button>
            <button onClick={()=>setShowForm(false)}
              style={{ padding:'9px 14px', background:'var(--surface-3)', color:'var(--text-muted)', border:'none', borderRadius:6, cursor:'pointer', fontSize:13 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Stage filter */}
      <div className="filter-bar">
        {['All', ...STAGES].map(s => (
          <button key={s} className={`filter-btn ${filter===s?'filter-btn--active':''}`} onClick={() => setFilter(s)}
            style={{ borderLeftColor: s!=='All' ? STAGE_COLOR[s] : undefined }}>
            {s}
          </button>
        ))}
      </div>

      <div className="projects-layout">
        {/* Grant list */}
        <div className="projects-list">
          {filtered.length === 0 && (
            <div style={{ textAlign:'center', padding:'48px 20px', color:'var(--text-muted)' }}>
              <div style={{ fontSize:36, marginBottom:12 }}>🏆</div>
              <div style={{ fontFamily:'Syne,sans-serif', fontWeight:600, marginBottom:6 }}>No grants tracked</div>
              <div style={{ fontSize:12 }}>Add your first grant opportunity</div>
            </div>
          )}
          {filtered.map(g => {
            const daysLeft = g.deadline ? Math.ceil((new Date(g.deadline)-new Date())/86400000) : null;
            const urgent = daysLeft !== null && daysLeft <= 14;
            const checks = (g.checklist||[]).filter(c=>c.done).length;
            const amtDisplay = displayAmount(g);
            return (
              <div key={g.id}
                className={`project-card ${selected===g.id?'project-card--active':''}`}
                style={{ '--project-color': STAGE_COLOR[g.stage], cursor:'pointer' }}
                onClick={() => { setSelected(g.id); setAiDraft(''); }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:14 }}>{g.title}</div>
                    <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{g.funder}</div>
                  </div>
                  {amtDisplay && (
                    <span style={{ fontSize:11, fontFamily:'JetBrains Mono,monospace', color:'var(--green)', fontWeight:700, flexShrink:0, textAlign:'right', lineHeight:1.3 }}>
                      {amtDisplay}
                    </span>
                  )}
                </div>
                <div style={{ display:'flex', gap:8, marginTop:8, alignItems:'center', flexWrap:'wrap' }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:4, background:STAGE_COLOR[g.stage]+'22', color:STAGE_COLOR[g.stage] }}>
                    {g.stage}
                  </span>
                  {g.deadline && (
                    <span style={{ fontSize:10, color: urgent?'var(--red)':'var(--text-muted)', fontFamily:'JetBrains Mono,monospace' }}>
                      {urgent && '⚠ '}{daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? 'Due today' : 'Overdue'}
                    </span>
                  )}
                  {g.context && <span style={{ fontSize:9, color:'var(--blue)', fontWeight:600 }}>CONTEXT</span>}
                  {(g.checklist||[]).length > 0 && (
                    <span style={{ fontSize:10, color:'var(--text-dim)', marginLeft:'auto', fontFamily:'JetBrains Mono,monospace' }}>
                      {checks}/{g.checklist.length} ✓
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail */}
        <div className="project-detail">
          {!sel ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', flexDirection:'column', gap:8, color:'var(--text-muted)' }}>
              <div style={{ fontSize:36 }}>🏆</div><div>Select a grant to manage</div>
            </div>
          ) : (
            <>
              <div className="detail-header" style={{ flexShrink:0 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div className="detail-name" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{sel.title}</div>
                  <div className="detail-tech">{sel.funder} · {sel.type} · {sel.sector}</div>
                </div>
                <button onClick={() => setShowUSD(s=>!s)}
                  style={{ padding:'4px 8px', background: showUSD?'var(--green-dim)':'var(--surface-3)', border:`1px solid ${showUSD?'rgba(14,203,129,.3)':'var(--border)'}`, borderRadius:6, fontSize:10, fontWeight:700, color: showUSD?'var(--green)':'var(--text-muted)', cursor:'pointer', whiteSpace:'nowrap', marginRight:6 }}>
                  {showUSD ? '≈ USD' : '$ USD'}
                </button>
                <button onClick={() => { del(sel.id); setSelected(null); }}
                  style={{ padding:'5px 8px', background:'var(--red-dim)', border:'1px solid rgba(255,71,87,.2)', borderRadius:6, fontSize:11, color:'var(--red)', cursor:'pointer', flexShrink:0 }}>✕</button>
              </div>

              {/* Stage progression */}
              <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', overflowX:'auto', flexShrink:0 }}>
                <div style={{ display:'flex', gap:4, minWidth:'max-content' }}>
                  {STAGES.map(s => (
                    <button key={s} onClick={() => update(sel.id,{stage:s})}
                      style={{ padding:'4px 8px', borderRadius:4, border:`1px solid ${STAGE_COLOR[s]}44`, fontSize:10, fontWeight:700, cursor:'pointer', background: sel.stage===s?STAGE_COLOR[s]+'33':'transparent', color: sel.stage===s?STAGE_COLOR[s]:'var(--text-muted)', whiteSpace:'nowrap' }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Info row */}
              <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', display:'flex', gap:12, flexWrap:'wrap', fontSize:11, color:'var(--text-muted)', flexShrink:0 }}>
                {sel.amount > 0 && (
                  <span style={{ color:'var(--green)', fontWeight:700 }}>
                    {displayAmount(sel)}
                  </span>
                )}
                {sel.deadline && <span>📅 Due {new Date(sel.deadline).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</span>}
                {sel.contact  && <span>👤 {sel.contact}</span>}
                {sel.website  && <a href={sel.website} target="_blank" rel="noreferrer" style={{ color:'var(--blue)' }}>🔗 Portal</a>}
              </div>

              {/* Scrollable body */}
              <div className="grants-detail-body">
                {/* Application checklist */}
                <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)', marginBottom:10, fontWeight:600 }}>Application Checklist</div>
                {CHECKLIST.map(item => {
                  const check = (sel.checklist||[]).find(c=>c.item===item);
                  return (
                    <div key={item} className="task-item" style={{ padding:'9px 6px' }} onClick={() => toggleCheck(sel.id, item)}>
                      <input type="checkbox" checked={check?.done||false} readOnly style={{ width:15, height:15, accentColor:'var(--accent)', flexShrink:0 }} />
                      <span style={{ fontSize:13, color: check?.done?'var(--text-muted)':'var(--text)', textDecoration:check?.done?'line-through':'none' }}>{item}</span>
                    </div>
                  );
                })}

                {/* Notes */}
                {sel.notes && (
                  <div style={{ marginTop:12, padding:10, background:'var(--surface-3)', borderRadius:6, fontSize:12, color:'var(--text-muted)', lineHeight:1.6 }}>
                    <div style={{ fontSize:9, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)', marginBottom:6, fontWeight:600 }}>Notes</div>
                    {sel.notes}
                  </div>
                )}

                {/* Grant context */}
                {sel.context && (
                  <div style={{ marginTop:10, padding:10, background:'var(--surface-3)', borderRadius:6, borderLeft:'3px solid var(--blue)', fontSize:12, color:'var(--text-muted)', lineHeight:1.7 }}>
                    <div style={{ fontSize:9, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--blue)', marginBottom:6, fontWeight:600 }}>Grant Context / Guidelines</div>
                    <div style={{ maxHeight:160, overflowY:'auto', whiteSpace:'pre-wrap' }}>{sel.context}</div>
                  </div>
                )}

                {/* Edit context */}
                <div style={{ marginTop:10 }}>
                  <div style={{ fontSize:9, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)', marginBottom:6, fontWeight:600 }}>Update Context</div>
                  <textarea
                    defaultValue={sel.context || ''}
                    key={sel.id}
                    onBlur={e => update(sel.id, { context: e.target.value })}
                    placeholder="Paste grant guidelines, RFP, or eligibility criteria…"
                    style={{ width:'100%', background:'var(--surface-3)', border:'1px solid rgba(94,106,210,.2)', borderRadius:6, padding:'8px 10px', color:'var(--text)', fontSize:12, minHeight:70, resize:'vertical', fontFamily:'DM Sans,sans-serif', borderLeft:'3px solid var(--blue)' }}
                  />
                </div>

                {/* AI LOI Generator */}
                <div style={{ marginTop:14 }}>
                  <button onClick={() => generateLOI(sel)} disabled={busyLOI}
                    style={{ width:'100%', padding:9, background: busyLOI?'var(--surface-3)':'var(--blue-dim)', color: busyLOI?'var(--text-muted)':'var(--blue)', border:'1px solid rgba(94,106,210,.25)', borderRadius:6, fontWeight:600, fontSize:13, cursor: busyLOI?'not-allowed':'pointer' }}>
                    {busyLOI ? '✦ Drafting LOI…' : '✦ Generate Letter of Intent (AI)'}
                  </button>
                  {aiDraft && (
                    <div style={{ marginTop:10, padding:12, background:'var(--surface-3)', borderRadius:6, fontSize:12, color:'var(--text)', lineHeight:1.7, whiteSpace:'pre-wrap' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                        <span style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--text-muted)', fontWeight:600 }}>AI Draft LOI</span>
                        <button onClick={() => navigator.clipboard.writeText(aiDraft)}
                          style={{ fontSize:10, color:'var(--accent)', background:'none', border:'none', cursor:'pointer' }}>Copy</button>
                      </div>
                      {aiDraft}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
