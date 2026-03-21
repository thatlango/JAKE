import { useState, useCallback } from 'react';
import { askClaude } from '../api/claude';

const CATEGORIES = ['Web App', 'API', 'Website', 'Mobile App', 'Tool', 'Dashboard', 'Other'];

const CAT_ICON = {
  'Web App':    '🖥',
  'API':        '⚡',
  'Website':    '🌐',
  'Mobile App': '📱',
  'Tool':       '🔧',
  'Dashboard':  '📊',
  'Other':      '📦',
};

const STATUS_COLOR = {
  'Online':   '#0ECB81',
  'Degraded': '#F0B429',
  'Offline':  '#FF4757',
  'Unknown':  '#5C6680',
};

const STATUS_BG = {
  'Online':   'rgba(14,203,129,0.12)',
  'Degraded': 'rgba(240,180,41,0.12)',
  'Offline':  'rgba(255,71,87,0.12)',
  'Unknown':  'rgba(92,102,128,0.10)',
};

function usePlatforms() {
  const [platforms, setPlatforms] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jake_platforms') || '[]'); } catch { return []; }
  });
  const persist = (p) => { setPlatforms(p); localStorage.setItem('jake_platforms', JSON.stringify(p)); };
  return {
    platforms,
    add:    (p) => persist([p, ...platforms]),
    update: (id, ch) => persist(platforms.map(p => p.id === id ? { ...p, ...ch } : p)),
    del:    (id) => persist(platforms.filter(p => p.id !== id)),
  };
}

const DEFAULT_FORM = {
  name: '', url: '', category: 'Web App', emoji: '', description: '',
  users: '', visits: '', uptime: '', notes: '',
};

export default function Platforms({ openAI }) {
  const { platforms, add, update, del } = usePlatforms();
  const [selected,  setSelected]  = useState(null);
  const [showForm,  setShowForm]  = useState(false);
  const [checking,  setChecking]  = useState({});
  const [form,      setForm]      = useState(DEFAULT_FORM);
  const [aiText,    setAiText]    = useState('');
  const [busyAI,    setBusyAI]    = useState(false);
  const [statsEdit, setStatsEdit] = useState(false);
  const [statsForm, setStatsForm] = useState({});

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addPlatform = () => {
    if (!form.name.trim()) return;
    add({
      ...form,
      id:       `plat_${Date.now()}`,
      users:    Number(form.users)  || 0,
      visits:   Number(form.visits) || 0,
      uptime:   Number(form.uptime) || 0,
      status:   'Unknown',
      lastChecked: null,
      addedAt:  new Date().toISOString(),
    });
    setForm(DEFAULT_FORM);
    setShowForm(false);
  };

  const checkStatus = useCallback(async (plat) => {
    if (!plat.url) return;
    setChecking(c => ({ ...c, [plat.id]: true }));
    try {
      // no-cors means we can't read the response, but if it resolves (no network error) the server is up
      await fetch(plat.url, { method: 'GET', mode: 'no-cors', cache: 'no-store' });
      update(plat.id, { status: 'Online', lastChecked: new Date().toISOString() });
    } catch {
      update(plat.id, { status: 'Offline', lastChecked: new Date().toISOString() });
    }
    setChecking(c => ({ ...c, [plat.id]: false }));
  }, [update]);

  const checkAll = () => platforms.forEach(p => checkStatus(p));

  const analyzeAI = async (p) => {
    setBusyAI(true);
    setAiText('');
    const draft = await askClaude([{ role: 'user', content:
      `Analyse this deployed platform for Jacob Odur at Tuku-Tuku Labs:\n\nName: ${p.name}\nCategory: ${p.category}\nURL: ${p.url || 'N/A'}\nStatus: ${p.status}\nDescription: ${p.description || 'none'}\nActive users: ${p.users || 'unknown'}\nMonthly visits: ${p.visits || 'unknown'}\nUptime: ${p.uptime ? p.uptime + '%' : 'unknown'}\nNotes: ${p.notes || 'none'}\n\nContext: Tuku-Tuku Labs is a Uganda-based consulting and tech firm serving Northern Uganda. Platforms serve SMEs, farmers, NGOs.\n\nProvide: 1) Health snapshot (2 sentences), 2) Top 3 metrics to track, 3) Two quick wins to grow or improve this platform. Keep it sharp and practical.`
    }], 'pipeline');
    setAiText(typeof draft === 'string' ? draft : '');
    setBusyAI(false);
  };

  const saveStats = (id) => {
    update(id, {
      users:  Number(statsForm.users)  || 0,
      visits: Number(statsForm.visits) || 0,
      uptime: Number(statsForm.uptime) || 0,
      notes:  statsForm.notes || '',
    });
    setStatsEdit(false);
  };

  const sel = platforms.find(p => p.id === selected);

  const onlineCount   = platforms.filter(p => p.status === 'Online').length;
  const offlineCount  = platforms.filter(p => p.status === 'Offline').length;
  const totalUsers    = platforms.reduce((s, p) => s + (p.users || 0), 0);

  const fmtTime = (iso) => {
    if (!iso) return 'Never';
    const d = new Date(iso);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' ' +
           d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="module">
      <div className="module-header">
        <div>
          <h1 className="module-title">Platforms</h1>
          <p className="module-sub">
            {platforms.length} tracked · {onlineCount} online{offlineCount > 0 ? ` · ${offlineCount} offline` : ''}
          </p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
          {platforms.length > 0 && (
            <button className="ai-trigger-sm" onClick={checkAll}>↻ Check All</button>
          )}
          <button className="ai-trigger-sm" onClick={() => setShowForm(s=>!s)}>+ Add</button>
          <button className="ai-trigger" onClick={() => openAI(`My deployed platforms: ${platforms.length > 0 ? platforms.map(p=>`${p.name} (${p.category}, ${p.status})`).join(', ') : 'none yet'}. Help me think about platform strategy and user growth.`)}>✦ Ask AI</button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{platforms.length}</div>
          <div className="stat-label">Platforms</div>
        </div>
        <div className={`stat-card ${onlineCount > 0 ? 'stat-card--green' : ''}`}>
          <div className="stat-value">{onlineCount}</div>
          <div className="stat-label">Online</div>
        </div>
        <div className={`stat-card ${offlineCount > 0 ? 'stat-card--red' : ''}`}>
          <div className="stat-value">{offlineCount}</div>
          <div className="stat-label">Offline</div>
        </div>
        <div className="stat-card stat-card--amber">
          <div className="stat-value" style={{ fontSize:totalUsers>9999?15:22 }}>{totalUsers.toLocaleString()}</div>
          <div className="stat-label">Total Users</div>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="pipeline-add-form">
          <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:14, marginBottom:12 }}>Add Platform</div>
          <div className="pipeline-form-grid">
            <input value={form.name} onChange={e=>setF('name',e.target.value)} placeholder="Platform name *"
              style={{ width:'100%', background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 10px', color:'var(--text)', fontSize:13 }} />
            <input value={form.url} onChange={e=>setF('url',e.target.value)} placeholder="URL (e.g. https://radar.tukutuku.co)"
              style={{ width:'100%', background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 10px', color:'var(--text)', fontSize:13 }} />
          </div>
          <div style={{ display:'flex', gap:8, marginBottom:8, flexWrap:'wrap' }}>
            <select value={form.category} onChange={e=>setF('category',e.target.value)}
              style={{ flex:1, minWidth:130, background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 10px', color:'var(--text)', fontSize:13 }}>
              {CATEGORIES.map(c=><option key={c}>{c}</option>)}
            </select>
            <input value={form.emoji} onChange={e=>setF('emoji',e.target.value)} placeholder="Emoji (optional)"
              style={{ width:130, background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 10px', color:'var(--text)', fontSize:16, textAlign:'center' }} />
          </div>
          <textarea value={form.description} onChange={e=>setF('description',e.target.value)} placeholder="What does this platform do?"
            style={{ width:'100%', background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 10px', color:'var(--text)', fontSize:13, minHeight:60, resize:'vertical', marginBottom:8, fontFamily:'DM Sans,sans-serif' }} />
          <div style={{ display:'flex', gap:8, marginBottom:8, flexWrap:'wrap' }}>
            <input type="number" value={form.users} onChange={e=>setF('users',e.target.value)} placeholder="Active users"
              style={{ flex:1, minWidth:100, background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 10px', color:'var(--text)', fontSize:13 }} />
            <input type="number" value={form.visits} onChange={e=>setF('visits',e.target.value)} placeholder="Monthly visits"
              style={{ flex:1, minWidth:100, background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 10px', color:'var(--text)', fontSize:13 }} />
            <input type="number" value={form.uptime} onChange={e=>setF('uptime',e.target.value)} placeholder="Uptime %"
              style={{ flex:1, minWidth:80, background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 10px', color:'var(--text)', fontSize:13 }} />
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={addPlatform}
              style={{ flex:1, padding:9, background:'var(--accent)', color:'#07090F', border:'none', borderRadius:6, fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'Syne,sans-serif' }}>
              Add Platform
            </button>
            <button onClick={()=>setShowForm(false)}
              style={{ padding:'9px 14px', background:'var(--surface-3)', color:'var(--text-muted)', border:'none', borderRadius:6, cursor:'pointer', fontSize:13 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Two-panel layout */}
      <div className="projects-layout">
        {/* Platform list */}
        <div className="projects-list">
          {platforms.length === 0 && (
            <div style={{ textAlign:'center', padding:'48px 20px', color:'var(--text-muted)' }}>
              <div style={{ fontSize:36, marginBottom:12 }}>🚀</div>
              <div style={{ fontFamily:'Syne,sans-serif', fontWeight:600, marginBottom:6 }}>No platforms added</div>
              <div style={{ fontSize:12 }}>Add Radar, Nena, or any deployed platform to track</div>
            </div>
          )}
          {platforms.map(plat => (
            <div key={plat.id}
              className={`project-card ${selected===plat.id?'project-card--active':''}`}
              style={{ '--project-color': STATUS_COLOR[plat.status], cursor:'pointer' }}
              onClick={() => { setSelected(plat.id); setAiText(''); setStatsEdit(false); }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                <div style={{ fontSize:24, lineHeight:1, flexShrink:0 }}>
                  {plat.emoji || CAT_ICON[plat.category] || '📦'}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:14 }}>{plat.name}</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {plat.url || plat.category}
                  </div>
                </div>
                {/* Status dot */}
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }}>
                  <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:4, background:STATUS_BG[plat.status], color:STATUS_COLOR[plat.status] }}>
                    <span style={{ width:5, height:5, borderRadius:'50%', background:STATUS_COLOR[plat.status], display:'inline-block' }} />
                    {plat.status}
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); checkStatus(plat); }}
                    disabled={checking[plat.id]}
                    style={{ fontSize:10, color:'var(--text-muted)', background:'none', border:'none', cursor:'pointer', padding:'2px 0' }}>
                    {checking[plat.id] ? '…' : '↻'}
                  </button>
                </div>
              </div>
              {(plat.users > 0 || plat.visits > 0 || plat.uptime > 0) && (
                <div style={{ display:'flex', gap:12, marginTop:8, fontSize:10, color:'var(--text-muted)', fontFamily:'JetBrains Mono,monospace' }}>
                  {plat.users > 0   && <span>👥 {plat.users.toLocaleString()}</span>}
                  {plat.visits > 0  && <span>👁 {plat.visits.toLocaleString()}/mo</span>}
                  {plat.uptime > 0  && <span style={{ color: plat.uptime >= 99 ? 'var(--green)' : plat.uptime >= 95 ? 'var(--accent)' : 'var(--red)' }}>
                    ↑{plat.uptime}%
                  </span>}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Detail panel */}
        <div className="project-detail">
          {!sel ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', flexDirection:'column', gap:8, color:'var(--text-muted)' }}>
              <div style={{ fontSize:36 }}>🚀</div>
              <div>Select a platform to view details</div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="detail-header" style={{ flexShrink:0 }}>
                <div style={{ fontSize:28, flexShrink:0 }}>{sel.emoji || CAT_ICON[sel.category] || '📦'}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div className="detail-name">{sel.name}</div>
                  <div className="detail-tech">{sel.category}{sel.url ? ` · ${sel.url}` : ''}</div>
                </div>
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  {sel.url && (
                    <a href={sel.url} target="_blank" rel="noreferrer"
                      style={{ padding:'5px 8px', background:'var(--blue-dim)', border:'1px solid rgba(94,106,210,.2)', borderRadius:6, fontSize:11, color:'var(--blue)', cursor:'pointer', textDecoration:'none' }}>
                      ↗ Open
                    </a>
                  )}
                  <button onClick={() => { del(sel.id); setSelected(null); }}
                    style={{ padding:'5px 8px', background:'var(--red-dim)', border:'1px solid rgba(255,71,87,.2)', borderRadius:6, fontSize:11, color:'var(--red)', cursor:'pointer' }}>✕</button>
                </div>
              </div>

              {/* Status bar */}
              <div style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', display:'flex', gap:10, alignItems:'center', flexShrink:0, flexWrap:'wrap' }}>
                <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, fontWeight:700, padding:'4px 10px', borderRadius:6, background:STATUS_BG[sel.status], color:STATUS_COLOR[sel.status] }}>
                  <span style={{ width:7, height:7, borderRadius:'50%', background:STATUS_COLOR[sel.status], display:'inline-block' }} />
                  {sel.status}
                </span>
                {['Online','Degraded','Offline','Unknown'].map(s => (
                  <button key={s} onClick={() => update(sel.id, { status:s, lastChecked: new Date().toISOString() })}
                    style={{ padding:'3px 8px', borderRadius:4, border:`1px solid ${STATUS_COLOR[s]}44`, fontSize:10, fontWeight:700, cursor:'pointer', background: sel.status===s?STATUS_COLOR[s]+'22':'transparent', color: sel.status===s?STATUS_COLOR[s]:'var(--text-muted)' }}>
                    {s}
                  </button>
                ))}
                <button onClick={() => checkStatus(sel)} disabled={checking[sel.id]}
                  style={{ marginLeft:'auto', padding:'4px 10px', background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, fontSize:11, color:'var(--text-muted)', cursor:'pointer' }}>
                  {checking[sel.id] ? '…checking' : '↻ Ping'}
                </button>
              </div>

              {/* Scrollable body */}
              <div className="grants-detail-body">
                {/* Last checked */}
                {sel.lastChecked && (
                  <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:14, fontFamily:'JetBrains Mono,monospace' }}>
                    Last checked: {fmtTime(sel.lastChecked)}
                  </div>
                )}

                {/* Description */}
                {sel.description && (
                  <div style={{ padding:10, background:'var(--surface-3)', borderRadius:6, fontSize:12, color:'var(--text-muted)', lineHeight:1.6, marginBottom:12 }}>
                    {sel.description}
                  </div>
                )}

                {/* Stats */}
                <div style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)', marginBottom:10, fontWeight:600, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span>Platform Stats</span>
                  <button onClick={() => { setStatsEdit(s=>!s); setStatsForm({ users:sel.users, visits:sel.visits, uptime:sel.uptime, notes:sel.notes }); }}
                    style={{ fontSize:10, color:'var(--accent)', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>
                    {statsEdit ? 'Cancel' : 'Edit'}
                  </button>
                </div>

                {statsEdit ? (
                  <div style={{ marginBottom:14 }}>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:8 }}>
                      {[['users','Active Users'],['visits','Monthly Visits'],['uptime','Uptime %']].map(([k,label])=>(
                        <div key={k}>
                          <div style={{ fontSize:10, color:'var(--text-muted)', marginBottom:4 }}>{label}</div>
                          <input type="number" value={statsForm[k]||''} onChange={e=>setStatsForm(f=>({...f,[k]:e.target.value}))}
                            style={{ width:'100%', background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'7px 8px', color:'var(--text)', fontSize:13 }} />
                        </div>
                      ))}
                    </div>
                    <textarea value={statsForm.notes||''} onChange={e=>setStatsForm(f=>({...f,notes:e.target.value}))} placeholder="Notes…"
                      style={{ width:'100%', background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 10px', color:'var(--text)', fontSize:12, minHeight:60, resize:'vertical', fontFamily:'DM Sans,sans-serif', marginBottom:8 }} />
                    <button onClick={() => saveStats(sel.id)}
                      style={{ width:'100%', padding:8, background:'var(--accent)', color:'#07090F', border:'none', borderRadius:6, fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'Syne,sans-serif' }}>
                      Save Stats
                    </button>
                  </div>
                ) : (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:14 }}>
                    {[
                      { label:'Active Users',    value: sel.users  > 0 ? sel.users.toLocaleString()  : '—', color: sel.users  > 0 ? 'var(--text)' : 'var(--text-dim)' },
                      { label:'Monthly Visits',  value: sel.visits > 0 ? sel.visits.toLocaleString() : '—', color: sel.visits > 0 ? 'var(--text)' : 'var(--text-dim)' },
                      { label:'Uptime',          value: sel.uptime > 0 ? `${sel.uptime}%`            : '—', color: sel.uptime >= 99 ? 'var(--green)' : sel.uptime >= 95 ? 'var(--accent)' : sel.uptime > 0 ? 'var(--red)' : 'var(--text-dim)' },
                    ].map(({ label, value, color }) => (
                      <div key={label} style={{ background:'var(--surface-3)', borderRadius:8, padding:'10px 12px' }}>
                        <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:18, color, letterSpacing:-0.5 }}>{value}</div>
                        <div style={{ fontSize:10, color:'var(--text-muted)', marginTop:4, textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Notes */}
                {sel.notes && !statsEdit && (
                  <div style={{ padding:10, background:'var(--surface-3)', borderRadius:6, fontSize:12, color:'var(--text-muted)', lineHeight:1.6, marginBottom:14 }}>
                    {sel.notes}
                  </div>
                )}

                {/* AI Analysis */}
                <div>
                  <button onClick={() => analyzeAI(sel)} disabled={busyAI}
                    style={{ width:'100%', padding:9, background: busyAI?'var(--surface-3)':'var(--blue-dim)', color: busyAI?'var(--text-muted)':'var(--blue)', border:'1px solid rgba(94,106,210,.25)', borderRadius:6, fontWeight:600, fontSize:13, cursor: busyAI?'not-allowed':'pointer' }}>
                    {busyAI ? '✦ Analysing…' : '✦ AI Platform Analysis'}
                  </button>
                  {aiText && (
                    <div style={{ marginTop:10, padding:12, background:'var(--surface-3)', borderRadius:6, fontSize:12, color:'var(--text)', lineHeight:1.7, whiteSpace:'pre-wrap' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                        <span style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--text-muted)', fontWeight:600 }}>AI Analysis</span>
                        <button onClick={() => navigator.clipboard.writeText(aiText)}
                          style={{ fontSize:10, color:'var(--accent)', background:'none', border:'none', cursor:'pointer' }}>Copy</button>
                      </div>
                      {aiText}
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
