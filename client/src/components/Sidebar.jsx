import { Icon } from './ProductUI';

const GROUPS=[
  {label:'Command',items:[
    {id:'dashboard',label:'Dashboard',icon:'home'},
    {id:'agents',label:'Agents',icon:'users'},
    {id:'work',label:'Work',icon:'check'},
    {id:'opportunities',label:'Opportunities',icon:'target'},
    {id:'estate',label:'Estate',icon:'estate'},
    {id:'operations',label:'Operations',icon:'chart'},
  ]},
  {label:'Business',items:[
    {id:'finance',label:'Finance',icon:'chart'},
    {id:'payments',label:'Payments',icon:'money'},
    {id:'accounts',label:'Accounts',icon:'users'},
  ]},
  {label:'System',items:[
    {id:'integrations',label:'Integrations',icon:'link'},
    {id:'alerts',label:'Alerts',icon:'bell'},
    {id:'platforms',label:'Platforms',icon:'grid'},
    {id:'export',label:'Export',icon:'upload'},
  ]},
];

export default function Sidebar({active,onChange}){
  return <aside className="sidebar jd-sidebar">
    <div className="sidebar-brand jd-sidebar-brand">
      <img className="cc-sidebar-logo" src="/brand/jakeos-secondary.svg" alt="JakeOS"/>
      <small>One platform. Stronger economies.</small>
    </div>
    <nav className="sidebar-nav jd-sidebar-nav" aria-label="JakeOS navigation">
      {GROUPS.map(group=><div className="jd-nav-group" key={group.label}>
        <div className="px-nav-section">{group.label}</div>
        {group.items.map(item=><button key={item.id} className={`nav-item ${active===item.id?'nav-item--active':''}`} aria-current={active===item.id?'page':undefined} onClick={()=>onChange(item.id)}>
          <span className="nav-icon"><Icon name={item.icon}/></span><span className="nav-label">{item.label}</span>
          {item.id==='alerts'&&<span className="jd-nav-badge jd-nav-badge--alert">!</span>}
        </button>)}
      </div>)}
    </nav>
    <div className="cc-sidebar-footer">
      <div className="cc-africa-mark">◎</div>
      <div><strong>Stronger people.<br/>Stronger economies.</strong><small>JakeOS · Tuku estate</small></div>
    </div>
  </aside>;
}
