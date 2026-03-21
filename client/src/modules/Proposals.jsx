import { useState } from 'react';
import { askClaude } from '../api/claude';

const TYPES = ['Grant Application', 'Consulting Proposal', 'Partnership MOU', 'Service Agreement', 'Project Brief'];

const TYPE_HINTS = {
  'Grant Application':   'executive summary, problem statement, objectives, methodology, budget, impact metrics, team qualifications, sustainability',
  'Consulting Proposal': 'understanding of need, proposed approach, deliverables, timeline, fees, team, terms and conditions',
  'Partnership MOU':     'parties, purpose, roles & responsibilities, resource commitments, duration, reporting, governance, exit clause',
  'Service Agreement':   'scope of services, deliverables, timeline, payment schedule, IP ownership, termination clause',
  'Project Brief':       'background, goals, target audience, deliverables, timeline, budget, success metrics',
};

const STATUS_COLOR = {
  Draft:    'var(--text-muted)',
  Sent:     'var(--accent)',
  Accepted: 'var(--green)',
  Rejected: 'var(--red)',
  Archived: 'var(--text-dim)',
};

function useProposals() {
  const [proposals, setProposals] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jake_proposals') || '[]'); } catch { return []; }
  });
  const persist = (p) => { setProposals(p); localStorage.setItem('jake_proposals', JSON.stringify(p)); };
  return {
    proposals,
    add:    (p) => persist([p, ...proposals]),
    update: (id, ch) => persist(proposals.map(p => p.id === id ? { ...p, ...ch } : p)),
    del:    (id) => persist(proposals.filter(p => p.id !== id)),
  };
}

export default function Proposals({ pipeline, openAI }) {
  const { proposals, add, update, del } = useProposals();
  const [selected, setSelected]     = useState(null);
  const [editing,  setEditing]      = useState(false);
  const [editText, setEditText]     = useState('');
  const [showForm, setShowForm]     = useState(false);
  const [busy,     setBusy]         = useState(false);
  const [form, setForm] = useState({ title: '', type: 'Consulting Proposal', client: '', value: '', dealId: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const generate = async () => {
    if (!form.title.trim()) return;
    setBusy(true);
    const deal = (pipeline || []).find(p => p.id === form.dealId);
    const context = deal
      ? `Deal: "${deal.name}" with ${deal.org}. Stage: ${deal.stage}. Value: ${deal.valueUSD > 0 ? `$${deal.valueUSD.toLocaleString()}` : 'TBD'}. Notes: ${deal.notes || 'none'}.`
      : `Proposal: "${form.title}". Client: ${form.client || 'TBD'}. Value: ${form.value || 'TBD'}.`;
    const content = await askClaude([{ role:'user', content:
      `Write a professional ${form.type} for Jacob Odur, Founder of Tuku-Tuku Labs (Uganda-based consulting & tech firm, Northern Uganda).\n\n${context}\n\nInclude these sections: ${TYPE_HINTS[form.type]}.\n\nFormat with clear headings (## Section). Be specific to the Uganda/East Africa context. Professional tone. First person from Jacob's perspective.`
    }], 'pipeline');
    add({
      id: `prop_${Date.now()}`,
      title: form.title,
      type:  form.type,
      client: deal?.org || form.client,
      value:  deal?.valueUSD > 0 ? `$${deal.valueUSD.toLocaleString()}` : form.value,
      dealId: form.dealId,
      content: typeof content === 'string' ? content : '',
      status: 'Draft',
      createdAt: new Date().toISOString(),
    });
    setForm({ title:'', type:'Consulting Proposal', client:'', value:'', dealId:'' });
    setShowForm(false);
    setBusy(false);
  };

  const exportPDF = (p) => {
    const win = window.open('', '_blank');
    const html = (p.content || '')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
    win.document.write(`<!DOCTYPE html><html><head><title>${p.title}</title><style>
      body{font-family:Georgia,serif;max-width:760px;margin:48px auto;padding:0 24px;color:#1a1a1a;line-height:1.75}
      h1{font-size:26px;margin-bottom:4px}h2{font-size:18px;margin-top:32px;border-bottom:1px solid #ddd;padding-bottom:6px}
      h3{font-size:15px;margin-top:20px}.meta{color:#666;font-size:13px;margin-bottom:32px;border-bottom:1px solid #eee;padding-bottom:12px}
      @media print{body{margin:20px}}</style></head>
      <body><h1>${p.title}</h1>
      <div class="meta">${p.type} &nbsp;·&nbsp; ${p.client} &nbsp;·&nbsp; ${p.value || 'Value TBD'} &nbsp;·&nbsp; ${new Date(p.createdAt).toLocaleDateString('en-GB',{year:'numeric',month:'long',day:'numeric'})}</div>
      <div>${html}</div></body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 400);
  };

  const sel = proposals.find(p => p.id === selected);
  const inp = (pl, k, type='text') => (
    <input type={type} value={form[k]} onChange={e => set(k, e.target.value)} placeholder={pl}
      style={{ width:'100%', background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 10px', color:'var(--text)', fontSize:13, marginBottom:8 }} />
  );

  return (
    <div className="module">
      <div className="module-header">
        <div>
          <h1 className="module-title">Proposals</h1>
          <p className="module-sub">{proposals.length} saved · {proposals.filter(p=>p.status==='Draft').length} drafts · {proposals.filter(p=>p.status==='Accepted').length} accepted</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="ai-trigger-sm" onClick={() => setShowForm(s=>!s)}>+ Generate</button>
          <button className="ai-trigger" onClick={() => openAI('Help me write a compelling proposal for a grant or consulting engagement in Uganda.')}>✦ Ask AI</button>
        </div>
      </div>

      {showForm && (
        <div className="pipeline-add-form">
          <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:14, marginBottom:12 }}>Generate Proposal with AI</div>
          <div className="pipeline-form-grid">
            {inp('Proposal title *', 'title')}
            {inp('Client / Funder name', 'client')}
          </div>
          <div style={{ display:'flex', gap:8, marginBottom:8 }}>
            <select value={form.type} onChange={e => set('type', e.target.value)}
              style={{ flex:2, background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 10px', color:'var(--text)', fontSize:13 }}>
              {TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            <select value={form.dealId} onChange={e => set('dealId', e.target.value)}
              style={{ flex:2, background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 10px', color:'var(--text)', fontSize:13 }}>
              <option value="">— Link to pipeline deal —</option>
              {(pipeline||[]).map(d => <option key={d.id} value={d.id}>{d.name} · {d.org}</option>)}
            </select>
            {inp('Value (e.g. $5,000)', 'value')}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={generate} disabled={busy || !form.title.trim()}
              style={{ flex:1, padding:9, background: busy?'var(--surface-3)':'var(--accent)', color: busy?'var(--text-muted)':'#07090F', border:'none', borderRadius:6, fontWeight:700, fontSize:13, cursor: busy?'not-allowed':'pointer', fontFamily:'Syne,sans-serif' }}>
              {busy ? '✦ Writing…' : '✦ Generate with AI'}
            </button>
            <button onClick={() => setShowForm(false)}
              style={{ padding:'9px 14px', background:'var(--surface-3)', color:'var(--text-muted)', border:'none', borderRadius:6, cursor:'pointer', fontSize:13 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="projects-layout">
        {/* List */}
        <div className="projects-list">
          {proposals.length === 0 && (
            <div style={{ textAlign:'center', padding:'48px 20px', color:'var(--text-muted)' }}>
              <div style={{ fontSize:36, marginBottom:12 }}>📋</div>
              <div style={{ fontFamily:'Syne,sans-serif', fontWeight:600, marginBottom:6 }}>No proposals yet</div>
              <div style={{ fontSize:12 }}>Generate your first from a pipeline deal or scratch</div>
            </div>
          )}
          {proposals.map(p => (
            <div key={p.id}
              className={`project-card ${selected===p.id?'project-card--active':''}`}
              style={{ '--project-color': STATUS_COLOR[p.status]||'var(--text-dim)', cursor:'pointer' }}
              onClick={() => { setSelected(p.id); setEditing(false); }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:14 }}>{p.title}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>{p.client}{p.value ? ` · ${p.value}` : ''}</div>
                </div>
                <span className="badge">{p.type.split(' ')[0]}</span>
              </div>
              <div style={{ display:'flex', gap:8, marginTop:8, alignItems:'center' }}>
                <select value={p.status}
                  onChange={e => { e.stopPropagation(); update(p.id,{status:e.target.value}); }}
                  onClick={e => e.stopPropagation()}
                  style={{ fontSize:11, background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:4, padding:'2px 6px', color:STATUS_COLOR[p.status]||'var(--text-muted)', cursor:'pointer' }}>
                  {Object.keys(STATUS_COLOR).map(s => <option key={s}>{s}</option>)}
                </select>
                <span style={{ fontSize:10, color:'var(--text-dim)', marginLeft:'auto', fontFamily:'JetBrains Mono,monospace' }}>
                  {new Date(p.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Detail */}
        <div className="project-detail">
          {!sel ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', flexDirection:'column', gap:8, color:'var(--text-muted)' }}>
              <div style={{ fontSize:36 }}>📋</div>
              <div>Select a proposal to view</div>
            </div>
          ) : (
            <>
              <div className="detail-header">
                <div style={{ flex:1 }}>
                  <div className="detail-name">{sel.title}</div>
                  <div className="detail-tech">{sel.type} · {sel.client}</div>
                </div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  <button onClick={() => { setEditing(e=>!e); setEditText(sel.content); }}
                    style={{ padding:'5px 10px', background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, fontSize:11, color:'var(--text-muted)', cursor:'pointer' }}>
                    {editing ? '✕ Cancel' : '✎ Edit'}
                  </button>
                  {editing && (
                    <button onClick={() => { update(sel.id,{content:editText}); setEditing(false); }}
                      style={{ padding:'5px 10px', background:'var(--accent)', border:'none', borderRadius:6, fontSize:11, color:'#07090F', fontWeight:700, cursor:'pointer' }}>
                      Save
                    </button>
                  )}
                  <button onClick={() => exportPDF(sel)}
                    style={{ padding:'5px 10px', background:'var(--blue-dim)', border:'1px solid rgba(94,106,210,.2)', borderRadius:6, fontSize:11, color:'var(--blue)', cursor:'pointer' }}>
                    ↗ PDF
                  </button>
                  <button onClick={() => { del(sel.id); setSelected(null); }}
                    style={{ padding:'5px 10px', background:'var(--red-dim)', border:'1px solid rgba(255,71,87,.2)', borderRadius:6, fontSize:11, color:'var(--red)', cursor:'pointer' }}>
                    ✕
                  </button>
                </div>
              </div>
              <div className="task-list" style={{ padding:'16px 20px', overflowY:'auto' }}>
                {editing ? (
                  <textarea value={editText} onChange={e => setEditText(e.target.value)}
                    style={{ width:'100%', minHeight:500, background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:12, color:'var(--text)', fontSize:13, lineHeight:1.75, resize:'vertical', fontFamily:'DM Sans,sans-serif' }} />
                ) : (
                  <div className="proposal-content"
                    dangerouslySetInnerHTML={{ __html: (sel.content||'')
                      .replace(/^## (.+)$/gm,'<h3 class="prop-h2">$1</h3>')
                      .replace(/^### (.+)$/gm,'<h4 class="prop-h3">$1</h4>')
                      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
                      .replace(/\n/g,'<br>')
                    }} />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
