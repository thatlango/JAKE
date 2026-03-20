import { useState } from 'react';

const PRIMARY = [
  { id: 'dashboard',        label: 'Home',     icon: '⊞' },
  { id: 'crm',              label: 'CRM',      icon: '🤝' },
  { id: 'personal-finance', label: 'Finance',  icon: '📱' },
  { id: 'radar',            label: 'Radar',    icon: '📡' },
  { id: 'more',             label: 'More',     icon: '⋯' },
];

const MORE = [
  { id: 'projects',   label: 'Projects',   icon: '◈' },
  { id: 'pipeline',   label: 'Pipeline',   icon: '⟳' },
  { id: 'calendar',   label: 'Calendar',   icon: '▦' },
  { id: 'cashflow',   label: 'Cash Flow',  icon: '💰' },
  { id: 'integrations',label:'Integrations',icon:'⬡' },
  { id: 'alerts',     label: 'Alerts',     icon: '🔔' },
];

export default function MobileNav({ active, onChange }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const isMoreActive = MORE.some(n => n.id === active);

  const handle = (id) => {
    if (id === 'more') { setMoreOpen(o => !o); return; }
    setMoreOpen(false);
    onChange(id);
  };

  return (
    <>
      {moreOpen && (
        <>
          <div style={{ position:'fixed',inset:0,zIndex:240,background:'rgba(0,0,0,.4)' }} onClick={() => setMoreOpen(false)} />
          <div className="more-menu">
            {MORE.map(item => (
              <button key={item.id} className={`more-menu-item ${active===item.id?'more-menu-item--active':''}`} onClick={() => handle(item.id)}>
                <span className="more-menu-icon">{item.icon}</span>
                <span>{item.label}</span>
                {active === item.id && <span style={{ marginLeft:'auto',color:'var(--accent)',fontSize:10,fontWeight:700 }}>●</span>}
              </button>
            ))}
          </div>
        </>
      )}
      <nav className="mobile-nav">
        <div className="mobile-nav-inner">
          {PRIMARY.map(item => (
            <button key={item.id} className={`mobile-nav-item ${item.id==='more'?(isMoreActive||moreOpen?'mobile-nav-item--active':''):(active===item.id?'mobile-nav-item--active':'')}`} onClick={() => handle(item.id)}>
              <span className="mobile-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
