import { useState, useEffect, useCallback } from 'react';

const SCORE_COLOR = (s) => s >= 70 ? 'var(--green)' : s >= 40 ? 'var(--accent)' : 'var(--text-muted)';

function OpportunityCard({ opp, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false);

  const save = () => onUpdate(opp.id, { saved: opp.saved ? 0 : 1 });
  const markApplied = () => onUpdate(opp.id, { status: 'Applied' });
  const dismiss = () => onUpdate(opp.id, { status: 'Dismissed' });

  return (
    <div className="kanban-card" style={{ marginBottom: 8, borderLeft: `3px solid ${SCORE_COLOR(opp.relevance_score)}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 2 }}>{opp.org}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>{opp.title}</div>
        </div>
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 700, color: SCORE_COLOR(opp.relevance_score) }}>{opp.relevance_score}%</div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Match</div>
        </div>
      </div>

      {opp.relevance_reason && (
        <div style={{ fontSize: 10, color: 'var(--blue)', marginBottom: 6, fontFamily: 'JetBrains Mono, monospace' }}>
          ✦ {opp.relevance_reason}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        {opp.deadline && (
          <span style={{ fontSize: 10, color: 'var(--red)', fontFamily: 'JetBrains Mono, monospace' }}>📅 {opp.deadline}</span>
        )}
        {opp.budget && (
          <span style={{ fontSize: 10, color: 'var(--green)', fontFamily: 'JetBrains Mono, monospace' }}>{opp.budget}</span>
        )}
      </div>

      {expanded && opp.description && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          {opp.description}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {opp.source_url && (
          <a href={opp.source_url} target="_blank" rel="noreferrer" style={{ padding: '5px 10px', background: 'var(--blue-dim)', color: 'var(--blue)', borderRadius: 5, fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>↗ View</a>
        )}
        <button onClick={() => setExpanded(e => !e)} style={{ padding: '5px 10px', background: 'var(--surface-3)', color: 'var(--text-muted)', border: 'none', borderRadius: 5, fontSize: 11, cursor: 'pointer' }}>
          {expanded ? '▲ Less' : '▼ More'}
        </button>
        {opp.status !== 'Applied' && (
          <button onClick={markApplied} style={{ padding: '5px 10px', background: 'var(--green-dim)', color: 'var(--green)', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>✓ Applied</button>
        )}
        <button onClick={save} style={{ padding: '5px 10px', background: opp.saved ? 'var(--accent-dim)' : 'var(--surface-3)', color: opp.saved ? 'var(--accent)' : 'var(--text-muted)', border: 'none', borderRadius: 5, fontSize: 11, cursor: 'pointer' }}>
          {opp.saved ? '★ Saved' : '☆ Save'}
        </button>
        <button onClick={dismiss} style={{ padding: '5px 10px', background: 'transparent', color: 'var(--text-dim)', border: 'none', borderRadius: 5, fontSize: 11, cursor: 'pointer', marginLeft: 'auto' }}>✕</button>
      </div>
    </div>
  );
}

export default function OpportunityRadar({ openAI }) {
  const [data, setData] = useState({ opportunities: [], sources: [], lastScan: null });
  const [filter, setFilter] = useState('New');
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/radar/opportunities${filter === 'Saved' ? '?saved=1' : filter !== 'All' ? `?status=${filter}` : ''}`);
      setData(await res.json());
    } catch {}
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const scan = async () => {
    setScanning(true);
    setScanMsg('');
    try {
      const res = await fetch('/api/radar/scan', { method: 'POST' });
      const d = await res.json();
      const added = (d.results || []).reduce((s, r) => s + (r.added || 0), 0);
      setScanMsg(added > 0 ? `✓ ${added} new opportunities found` : '✓ Scan complete — no new matches');
      load();
    } catch (e) {
      setScanMsg(`✗ ${e.message}`);
    }
    setScanning(false);
    setTimeout(() => setScanMsg(''), 5000);
  };

  const update = async (id, updates) => {
    await fetch(`/api/radar/opportunities/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
    load();
  };

  const del = async (id) => {
    await fetch(`/api/radar/opportunities/${id}`, { method: 'DELETE' });
    load();
  };

  const newCount = data.opportunities.filter(o => o.status === 'New' && !o.seen).length;
  const highMatch = data.opportunities.filter(o => o.relevance_score >= 60).length;

  return (
    <div className="module">
      <div className="module-header">
        <div>
          <h1 className="module-title">Opportunity Radar</h1>
          <p className="module-sub">
            {newCount > 0 && <span style={{ color: 'var(--accent)' }}>{newCount} new · </span>}
            {highMatch} high-match · auto-scans every 6 hours
            {data.lastScan && <span style={{ color: 'var(--text-dim)' }}> · last: {new Date(data.lastScan).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ai-trigger-sm" onClick={scan} disabled={scanning}>
            {scanning ? '⟳ Scanning…' : '↻ Scan Now'}
          </button>
          <button className="ai-trigger" onClick={() => openAI(`Opportunity radar: ${data.opportunities.length} opportunities found, ${highMatch} high-match (60%+). Sources: ${(data.sources||[]).map(s=>s.name).join(', ')}.`)}>✦ Ask AI</button>
        </div>
      </div>

      {scanMsg && (
        <div style={{ padding: '6px 28px', fontSize: 12, color: scanMsg.startsWith('✓') ? 'var(--green)' : 'var(--red)', borderBottom: '1px solid var(--border)' }}>
          {scanMsg}
        </div>
      )}

      <div className="stats-row">
        <div className="stat-card stat-card--amber"><div className="stat-value">{data.opportunities.filter(o=>o.status==='New').length}</div><div className="stat-label">New</div></div>
        <div className="stat-card stat-card--green"><div className="stat-value">{highMatch}</div><div className="stat-label">High Match</div></div>
        <div className="stat-card"><div className="stat-value">{data.opportunities.filter(o=>o.saved).length}</div><div className="stat-label">Saved</div></div>
        <div className="stat-card"><div className="stat-value">{data.opportunities.filter(o=>o.status==='Applied').length}</div><div className="stat-label">Applied</div></div>
      </div>

      <div className="filter-bar">
        {['New', 'Saved', 'Applied', 'All', 'Dismissed'].map(f => (
          <button key={f} className={`filter-btn ${filter === f ? 'filter-btn--active' : ''}`} onClick={() => setFilter(f)}>{f}</button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center', fontFamily: 'JetBrains Mono, monospace' }}>
          {data.sources?.length || 0} sources
        </span>
      </div>

      <div className="module-body">
        {data.opportunities.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>
            {scanning ? 'Scanning sources…' : 'No opportunities found. Click "Scan Now" to search all sources.'}
          </div>
        )}
        {data.opportunities.map(opp => (
          <OpportunityCard key={opp.id} opp={opp} onUpdate={update} onDelete={del} />
        ))}
      </div>
    </div>
  );
}
