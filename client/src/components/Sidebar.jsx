import { Icon } from './ProductUI';

const GROUPS=[
  {label:'Menu',items:[
    {id:'dashboard',label:'Dashboard',icon:'grid'},
    {id:'work',label:'Work',icon:'check'},
    {id:'projects',label:'Projects',icon:'folder'},
    {id:'calendar',label:'Calendar',icon:'calendar'},
    {id:'crm',label:'Relationships',icon:'users'},
  ]},
  {label:'Operate',items:[
    {id:'cashflow',label:'Money',icon:'money'},
    {id:'pipeline',label:'Pipeline',icon:'target'},
    {id:'radar',label:'Opportunities',icon:'spark'},
    {id:'estate',label:'Tuku Estate',icon:'estate'},
    {id:'operations',label:'Operations',icon:'chart'},
  ]},
  {label:'Build & deliver',items:[
    {id:'proposals',label:'Proposals',icon:'document'},
    {id:'grants',label:'Grants & bids',icon:'document'},
    {id:'finance',label:'Revenue plan',icon:'chart'},
  ]},
  {label:'System',items:[
    {id:'ai-search',label:'Search',icon:'search'},
    {id:'integrations',label:'Integrations',icon:'link'},
    {id:'alerts',label:'Alerts',icon:'bell'},
  ]},
];

export default function Sidebar({active,onChange}){
  return <aside className="sidebar jd-sidebar">
    <div className="sidebar-brand jd-sidebar-brand">
      <span className="brand-mark jd-brand-mark"><Icon name="target" size={22}/></span>
      <div><div className="brand-name">JakeOS</div><div className="brand-sub">Command center</div></div>
    </div>
    <nav className="sidebar-nav jd-sidebar-nav" aria-label="JakeOS navigation">
      {GROUPS.map(group=><div className="jd-nav-group" key={group.label}>
        <div className="px-nav-section">{group.label}</div>
        {group.items.map(item=><button key={item.id} className={`nav-item ${active===item.id?'nav-item--active':''}`} onClick={()=>onChange(item.id)}>
          <span className="nav-icon"><Icon name={item.icon}/></span><span className="nav-label">{item.label}</span>
          {item.id==='work'&&<span className="jd-nav-badge">12+</span>}
        </button>)}
      </div>)}
    </nav>
    <button className="jd-momentum-card" onClick={()=>window.open('https://momentum.tukutuku.org','_blank','noopener,noreferrer')}>
      <span className="jd-momentum-icon"><Icon name="spark" size={16}/></span>
      <strong>Open Momentum<br/>on mobile</strong>
      <small>Stay connected on the go</small>
      <span className="jd-momentum-launch">Launch</span>
    </button>
  </aside>;
}
