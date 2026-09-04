import { Icon } from './ProductUI';

const GROUPS = [
  { label:'Command', items:[
    { id:'dashboard', label:'Overview', icon:'home' },
    { id:'work', label:'Work', icon:'check' },
    { id:'projects', label:'Projects', icon:'folder' },
    { id:'calendar', label:'Calendar', icon:'calendar' },
  ]},
  { label:'Operate', items:[
    { id:'crm', label:'Relationships', icon:'users' },
    { id:'cashflow', label:'Money', icon:'money' },
    { id:'pipeline', label:'Pipeline', icon:'target' },
    { id:'radar', label:'Opportunities', icon:'target' },
    { id:'estate', label:'Tuku Estate', icon:'estate' },
  ]},
  { label:'Build & deliver', items:[
    { id:'proposals', label:'Proposals', icon:'document' },
    { id:'grants', label:'Grants & bids', icon:'document' },
    { id:'finance', label:'Revenue plan', icon:'chart' },
  ]},
  { label:'Tools', items:[
    { id:'ai-search', label:'Search', icon:'search' },
    { id:'voice-memo', label:'Voice capture', icon:'mic' },
    { id:'personal-finance', label:'Personal finance', icon:'money' },
    { id:'platforms', label:'Platforms', icon:'grid' },
    { id:'export', label:'Export', icon:'upload' },
    { id:'integrations', label:'Integrations', icon:'link' },
    { id:'alerts', label:'Alerts', icon:'bell' },
  ]},
];

export default function Sidebar({ active, onChange }) {
  return <aside className="sidebar">
    <div className="sidebar-brand">
      <span className="brand-mark">JO</span>
      <div><div className="brand-name">JakeOS</div><div className="brand-sub">Command center</div></div>
    </div>
    <nav className="sidebar-nav" aria-label="JakeOS navigation">
      {GROUPS.map(group=><div key={group.label}>
        <div className="px-nav-section">{group.label}</div>
        {group.items.map(item=><button key={item.id} className={`nav-item ${active===item.id?'nav-item--active':''}`} onClick={()=>onChange(item.id)}>
          <span className="nav-icon"><Icon name={item.icon}/></span><span className="nav-label">{item.label}</span>
        </button>)}
      </div>)}
    </nav>
    <div className="sidebar-footer"><div className="sidebar-footer-text">One system of record · Momentum on the go</div></div>
  </aside>;
}
