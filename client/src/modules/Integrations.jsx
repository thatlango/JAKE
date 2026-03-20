import { useState } from 'react';
import WizardModal from '../components/WizardModal';
import { INTEGRATIONS, CATEGORIES } from '../data/integrations';

export default function Integrations({ openAI }) {
  const [filter, setFilter] = useState('All');
  const [activeWizard, setActiveWizard] = useState(null);
  const [connected, setConnected] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jake_connected') || '{}'); } catch { return {}; }
  });
  const [completedData, setCompletedData] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jake_int_data') || '{}'); } catch { return {}; }
  });

  const markConnected = (id, data) => {
    const next = { ...connected, [id]: true };
    const nextData = { ...completedData, [id]: data };
    setConnected(next);
    setCompletedData(nextData);
    localStorage.setItem('jake_connected', JSON.stringify(next));
    localStorage.setItem('jake_int_data', JSON.stringify(nextData));
  };

  const disconnect = (id) => {
    const next = { ...connected };
    delete next[id];
    setConnected(next);
    localStorage.setItem('jake_connected', JSON.stringify(next));
  };

  const filtered = filter === 'All' ? INTEGRATIONS : INTEGRATIONS.filter(i => i.category === filter);
  const connectedCount = Object.values(connected).filter(Boolean).length;

  return (
    <div className="module">
      <div className="module-header">
        <div>
          <h1 className="module-title">Integrations</h1>
          <p className="module-sub">{connectedCount} connected · tap any card to set up</p>
        </div>
        <button className="ai-trigger" onClick={() => openAI('Which integrations should I set up first?')}>✦ Ask AI</button>
      </div>

      <div className="stats-row">
        <div className="stat-card stat-card--green"><div className="stat-value">{connectedCount}</div><div className="stat-label">Connected</div></div>
        <div className="stat-card"><div className="stat-value">{INTEGRATIONS.length - connectedCount}</div><div className="stat-label">Available</div></div>
        <div className="stat-card stat-card--amber">
          <div className="stat-value">{INTEGRATIONS.filter(i => i.category === 'Alerts' && connected[i.id]).length}/{INTEGRATIONS.filter(i => i.category === 'Alerts').length}</div>
          <div className="stat-label">Alerts Active</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{INTEGRATIONS.filter(i => i.category === 'Finance' && connected[i.id]).length}/{INTEGRATIONS.filter(i => i.category === 'Finance').length}</div>
          <div className="stat-label">Finance Links</div>
        </div>
      </div>

      <div className="filter-bar">
        {CATEGORIES.map(c => (
          <button key={c} className={`filter-btn ${filter === c ? 'filter-btn--active' : ''}`} onClick={() => setFilter(c)}>{c}</button>
        ))}
      </div>

      <div className="module-body">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
          {filtered.map(item => {
            const isConnected = !!connected[item.id];
            const data = completedData[item.id] || {};
            const savedLinks = Object.entries(data).filter(([, v]) => v && String(v).startsWith('http'));

            return (
              <div key={item.id} style={{
                background: 'var(--surface-2)',
                border: `1px solid ${isConnected ? 'rgba(14,203,129,0.3)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ fontSize: 24, flexShrink: 0 }}>{item.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14, letterSpacing: '-0.3px' }}>{item.name}</div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginTop: 1 }}>{item.category}</div>
                  </div>
                  {isConnected && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', background: 'var(--green-dim)', padding: '2px 6px', borderRadius: 4, flexShrink: 0, letterSpacing: '0.04em' }}>✓</span>
                  )}
                </div>

                <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>{item.description}</p>

                {/* Step count bar */}
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {item.wizard.map((_, i) => (
                    <div key={i} style={{ height: 3, flex: 1, background: isConnected ? 'var(--green)' : 'var(--surface-3)', borderRadius: 999, transition: 'background 0.3s' }} />
                  ))}
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 4 }}>{item.wizard.length} steps</span>
                </div>

                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                  <button
                    style={{
                      flex: 1, padding: '10px 0',
                      background: isConnected ? 'var(--surface-3)' : 'var(--accent)',
                      color: isConnected ? 'var(--text-muted)' : '#07090F',
                      border: 'none', borderRadius: 'var(--radius-sm)',
                      fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 12,
                      cursor: 'pointer', letterSpacing: '0.02em',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                    onClick={() => setActiveWizard(item)}
                  >
                    {isConnected ? '⚙ Reconfigure' : '→ Connect'}
                  </button>
                  {isConnected && (
                    <button onClick={() => disconnect(item.id)} style={{
                      padding: '10px 12px', background: 'var(--red-dim)', color: 'var(--red)',
                      border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 12,
                      cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                    }}>✕</button>
                  )}
                </div>

                {savedLinks.map(([k, v]) => (
                  <a key={k} href={v} target="_blank" rel="noreferrer" style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 8px', background: 'var(--surface-3)',
                    borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--blue)',
                    textDecoration: 'none', fontFamily: 'JetBrains Mono, monospace',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    ↗ {v.replace('https://', '').slice(0, 42)}
                  </a>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {activeWizard && (
        <WizardModal
          integration={activeWizard}
          onClose={() => setActiveWizard(null)}
          onComplete={(data) => markConnected(activeWizard.id, data)}
        />
      )}
    </div>
  );
}
