const NAV = [
  { id: 'dashboard',        label: 'Dashboard',          icon: '⊞' },
  { id: 'estate',           label: 'Tuku Estate',        icon: '◉' },
  { id: 'projects',         label: 'Projects',            icon: '◈' },
  { id: 'pipeline',         label: 'Pipeline',            icon: '⟳' },
  { id: 'proposals',        label: 'Proposals',           icon: '📋' },
  { id: 'grants',           label: 'Grants & Bids',       icon: '🏆' },
  { id: 'calendar',         label: 'Calendar',            icon: '▦' },
  { id: 'DIVIDER' },
  { id: 'crm',              label: 'Client CRM',          icon: '🤝' },
  { id: 'cashflow',         label: 'Cash Flow',           icon: '💰' },
  { id: 'finance',          label: 'Revenue',             icon: '◆' },
  { id: 'radar',            label: 'Opportunity Radar',   icon: '📡' },
  { id: 'DIVIDER' },
  { id: 'ai-search',        label: 'AI Search',           icon: '🔍' },
  { id: 'voice-memo',       label: 'Voice Memo',          icon: '🎙' },
  { id: 'platforms',        label: 'Platforms',           icon: '🚀' },
  { id: 'claude-sync',      label: 'Claude Sync',         icon: '🧠' },
  { id: 'personal-finance', label: 'Personal Finance',    icon: '📱' },
  { id: 'export',           label: 'Export Centre',       icon: '📤' },
  { id: 'integrations',     label: 'Integrations',        icon: '⬡' },
  { id: 'alerts',           label: 'Alerts',              icon: '🔔' },
];

export default function Sidebar({ active, onChange }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark">JO</span>
        <div>
          <div className="brand-name">JakeOS</div>
          <div className="brand-sub">Command Center</div>
        </div>
      </div>
      <nav className="sidebar-nav">
        {NAV.map((item, i) => {
          if (item.id === 'DIVIDER') return <div key={i} style={{ height:1, background:'var(--border)', margin:'6px 0' }} />;
          return (
            <button key={item.id} className={`nav-item ${active===item.id?'nav-item--active':''}`} onClick={() => onChange(item.id)}>
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-footer-text">Personal operating system</div>
      </div>
    </aside>
  );
}