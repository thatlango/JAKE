import { useState, useEffect, useCallback } from 'react';

const TYPE_COLORS = { note:'#5E6AD2', call:'#0ECB81', email:'#F0B429', meeting:'#9F7AEA', proposal:'#FF4757' };
const TYPE_ICONS  = { note:'📝', call:'📞', email:'✉️', meeting:'🤝', proposal:'📋' };

function ClientCard({ client, active, onClick }) {
  const daysSince = client.last_contact
    ? Math.floor((new Date() - new Date(client.last_contact)) / 86400000)
    : null;

  return (
    <div
      className={`project-card ${active ? 'project-card--active' : ''}`}
      onClick={onClick}
      style={{ '--project-color': daysSince > 30 ? '#FF4757' : '#0ECB81', cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 22 }}>{client.avatar_emoji || '👤'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>{client.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{client.org}{client.role ? ` · ${client.role}` : ''}</div>
        </div>
        <span className={`badge ${client.status === 'Active' ? 'badge--active' : ''}`}>{client.type}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        {client.last_contact
          ? <span style={{ fontSize: 11, color: daysSince > 30 ? 'var(--red)' : 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
              {daysSince === 0 ? 'Today' : `${daysSince}d ago`}
            </span>
          : <span style={{ fontSize: 11, color: 'var(--red)', fontStyle: 'italic' }}>No contact logged</span>
        }
        {client.next_followup && (
          <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 4 }}>
            📋 Follow-up {new Date(client.next_followup) <= new Date() ? 'DUE' : client.next_followup}
          </span>
        )}
      </div>
    </div>
  );
}

function InteractionForm({ clientId, onSave, onCancel }) {
  const [form, setForm] = useState({ type: 'note', title: '', content: '', date: new Date().toISOString().slice(0,10), outcome: '', follow_up_date: '', follow_up_note: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.content.trim()) return;
    await fetch(`/api/crm/clients/${clientId}/interactions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    onSave();
  };

  const inp = (key, placeholder, type='text') => (
    <input type={type} value={form[key]} onChange={e => set(key, e.target.value)} placeholder={placeholder}
      style={{ width:'100%', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 10px', color:'var(--text)', fontSize:13, marginBottom:8 }} />
  );

  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        {['note','call','email','meeting','proposal'].map(t => (
          <button key={t} onClick={() => set('type', t)} style={{
            padding:'5px 10px', borderRadius:4, border:'1px solid var(--border)', fontSize:11, fontWeight:600,
            background: form.type===t ? TYPE_COLORS[t]+'22' : 'transparent',
            color: form.type===t ? TYPE_COLORS[t] : 'var(--text-muted)', cursor:'pointer'
          }}>{TYPE_ICONS[t]} {t}</button>
        ))}
      </div>
      {inp('title', 'Title (optional)')}
      <textarea value={form.content} onChange={e => set('content', e.target.value)} placeholder="What happened / what was discussed…"
        style={{ width:'100%', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 10px', color:'var(--text)', fontSize:13, minHeight:80, resize:'vertical', marginBottom:8, fontFamily:'DM Sans, sans-serif' }} />
      {inp('outcome', 'Outcome / next step')}
      <div style={{ display:'flex', gap:8 }}>
        <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
          style={{ flex:1, background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:6, padding:'7px 10px', color:'var(--text)', fontSize:13 }} />
        <input type="date" value={form.follow_up_date} onChange={e => set('follow_up_date', e.target.value)}
          placeholder="Follow-up date"
          style={{ flex:1, background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:6, padding:'7px 10px', color:'var(--text)', fontSize:13 }} />
      </div>
      {form.follow_up_date && inp('follow_up_note', 'Follow-up reminder message', 'text')}
      <div style={{ display:'flex', gap:8, marginTop:10 }}>
        <button onClick={save} style={{ flex:1, padding:'9px', background:'var(--accent)', color:'#07090F', border:'none', borderRadius:6, fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'Syne, sans-serif' }}>Save</button>
        <button onClick={onCancel} style={{ padding:'9px 14px', background:'var(--surface-3)', color:'var(--text-muted)', border:'none', borderRadius:6, fontSize:13, cursor:'pointer' }}>Cancel</button>
      </div>
    </div>
  );
}

export default function CRM({ openAI }) {
  const [clients, setClients] = useState([]);
  const [stats, setStats] = useState({});
  const [selected, setSelected] = useState(null);
  const [clientDetail, setClientDetail] = useState(null);
  const [logging, setLogging] = useState(false);
  const [filter, setFilter] = useState('All');
  const [showAdd, setShowAdd] = useState(false);
  const [newClient, setNewClient] = useState({ name:'', org:'', role:'', type:'Partner', status:'Active', avatar_emoji:'👤', notes:'' });

  const load = useCallback(async () => {
    const res = await fetch('/api/crm/clients');
    const data = await res.json();
    setClients(data.clients || []);
    setStats(data.stats || {});
  }, []);

  const loadDetail = useCallback(async (id) => {
    const res = await fetch(`/api/crm/clients/${id}`);
    const data = await res.json();
    setClientDetail(data.client);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (selected) loadDetail(selected); }, [selected, loadDetail]);

  const filteredClients = filter === 'All' ? clients : clients.filter(c => c.type === filter || c.status === filter);

  const addClient = async () => {
    if (!newClient.name) return;
    await fetch('/api/crm/clients', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(newClient) });
    setShowAdd(false);
    setNewClient({ name:'', org:'', role:'', type:'Partner', status:'Active', avatar_emoji:'👤', notes:'' });
    load();
  };

  const interactionSaved = () => { setLogging(false); if (selected) loadDetail(selected); load(); };

  const inp = (key, placeholder, type='text') => (
    <input type={type} value={newClient[key]||''} onChange={e => setNewClient(f=>({...f,[key]:e.target.value}))} placeholder={placeholder}
      style={{ width:'100%', background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 10px', color:'var(--text)', fontSize:13, marginBottom:8 }} />
  );

  return (
    <div className="module">
      <div className="module-header">
        <div>
          <h1 className="module-title">Client CRM</h1>
          <p className="module-sub">
            {stats.active} active · {stats.dueFollowups > 0 && <span style={{color:'var(--red)'}}>⚠ {stats.dueFollowups} follow-ups due · </span>}
            {stats.noContact30d > 0 && <span style={{color:'var(--accent)'}}>{stats.noContact30d} not contacted in 30d</span>}
          </p>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="ai-trigger-sm" onClick={() => setShowAdd(s=>!s)}>+ Add Client</button>
          <button className="ai-trigger" onClick={() => openAI(`CRM: ${stats.total} contacts, ${stats.dueFollowups} follow-ups due, ${stats.noContact30d} not contacted in 30 days.`)}>✦ Ask AI</button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card stat-card--green"><div className="stat-value">{stats.total||0}</div><div className="stat-label">Contacts</div></div>
        <div className="stat-card stat-card--red"><div className="stat-value">{stats.dueFollowups||0}</div><div className="stat-label">Follow-ups Due</div></div>
        <div className="stat-card stat-card--amber"><div className="stat-value">{stats.noContact30d||0}</div><div className="stat-label">No Contact 30d</div></div>
        <div className="stat-card"><div className="stat-value">{stats.interactions7d||0}</div><div className="stat-label">Interactions 7d</div></div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{margin:'0 28px 12px', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:8, padding:16}}>
          <div style={{fontFamily:'Syne,sans-serif',fontWeight:700,fontSize:14,marginBottom:12}}>New Contact</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {inp('name','Full name *')} {inp('org','Organisation')}
            {inp('role','Role / title')} {inp('avatar_emoji','Emoji avatar')}
          </div>
          <div style={{display:'flex',gap:8,marginBottom:8}}>
            {['Partner','Client','Prospect','Funder'].map(t => (
              <button key={t} onClick={() => setNewClient(f=>({...f,type:t}))} style={{
                padding:'5px 10px',borderRadius:4,border:'1px solid var(--border)',fontSize:11,fontWeight:600,cursor:'pointer',
                background:newClient.type===t?'var(--accent-dim)':'transparent',color:newClient.type===t?'var(--accent)':'var(--text-muted)'
              }}>{t}</button>
            ))}
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={addClient} style={{flex:1,padding:'9px',background:'var(--accent)',color:'#07090F',border:'none',borderRadius:6,fontWeight:700,fontSize:13,cursor:'pointer',fontFamily:'Syne,sans-serif'}}>Save</button>
            <button onClick={()=>setShowAdd(false)} style={{padding:'9px 14px',background:'var(--surface-3)',color:'var(--text-muted)',border:'none',borderRadius:6,cursor:'pointer',fontSize:13}}>Cancel</button>
          </div>
        </div>
      )}

      <div className="filter-bar">
        {['All','Active','Partner','Client','Prospect','Funder'].map(f => (
          <button key={f} className={`filter-btn ${filter===f?'filter-btn--active':''}`} onClick={()=>setFilter(f)}>{f}</button>
        ))}
      </div>

      <div className="projects-layout">
        {/* Client list */}
        <div className="projects-list">
          {filteredClients.length === 0 && <div style={{color:'var(--text-muted)',fontSize:13,padding:'20px 0'}}>No contacts yet.</div>}
          {filteredClients.map(c => (
            <ClientCard key={c.id} client={c} active={selected===c.id} onClick={() => setSelected(c.id)} />
          ))}
        </div>

        {/* Detail panel */}
        {clientDetail && (
          <div className="project-detail">
            <div className="detail-header">
              <span style={{fontSize:24}}>{clientDetail.avatar_emoji||'👤'}</span>
              <div style={{flex:1}}>
                <div className="detail-name">{clientDetail.name}</div>
                <div className="detail-tech">{clientDetail.org} {clientDetail.role ? `· ${clientDetail.role}` : ''}</div>
              </div>
              <button className="ai-trigger-sm" onClick={() => openAI(`Client: ${clientDetail.name} at ${clientDetail.org}. Last contact: ${clientDetail.last_contact||'never'}. ${clientDetail.interactions?.length||0} interactions.`)}>✦ AI</button>
            </div>

            <div style={{padding:'8px 16px',borderBottom:'1px solid var(--border)',display:'flex',gap:8,flexWrap:'wrap'}}>
              {clientDetail.email && <a href={`mailto:${clientDetail.email}`} style={{fontSize:11,color:'var(--blue)'}}>✉ {clientDetail.email}</a>}
              {clientDetail.phone && <span style={{fontSize:11,color:'var(--text-muted)'}}>{clientDetail.phone}</span>}
              {clientDetail.next_followup && (
                <span style={{fontSize:11,color:'var(--accent)'}}>📋 Follow-up: {clientDetail.next_followup}</span>
              )}
            </div>

            <div style={{padding:'10px 16px',borderBottom:'1px solid var(--border)'}}>
              <button onClick={()=>setLogging(l=>!l)} style={{background:'var(--blue-dim)',color:'var(--blue)',border:'1px solid rgba(94,106,210,.25)',borderRadius:6,padding:'7px 14px',fontSize:12,fontWeight:600,cursor:'pointer',width:'100%'}}>
                {logging ? '× Cancel' : '+ Log Interaction'}
              </button>
            </div>

            {logging && (
              <div style={{padding:'0 16px',paddingTop:10}}>
                <InteractionForm clientId={clientDetail.id} onSave={interactionSaved} onCancel={()=>setLogging(false)} />
              </div>
            )}

            <div className="task-list">
              <div style={{fontSize:10,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--text-muted)',marginBottom:8,fontWeight:600}}>Interaction History</div>
              {(!clientDetail.interactions || clientDetail.interactions.length === 0) && (
                <div style={{color:'var(--text-muted)',fontSize:12,fontStyle:'italic'}}>No interactions yet — log your first one above.</div>
              )}
              {(clientDetail.interactions||[]).map(i => (
                <div key={i.id} style={{padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                    <span style={{fontSize:13}}>{TYPE_ICONS[i.type]||'📝'}</span>
                    <span style={{fontSize:12,fontWeight:600,color:'var(--text)',flex:1}}>{i.title||i.type}</span>
                    <span style={{fontSize:10,color:'var(--text-muted)',fontFamily:'JetBrains Mono,monospace'}}>{i.date}</span>
                  </div>
                  <div style={{fontSize:12,color:'var(--text-muted)',lineHeight:1.5,paddingLeft:19}}>{i.content}</div>
                  {i.outcome && <div style={{fontSize:11,color:'var(--accent)',paddingLeft:19,marginTop:3}}>→ {i.outcome}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
