import { Icon } from './ProductUI';

const GROUPS=[
  {label:'Executive',items:[
    {id:'dashboard',label:'Executive',icon:'grid'},
    {id:'work',label:'Work',icon:'check'},
    {id:'agents',label:'Agents',icon:'users'},
  ]},
  {label:'Market',items:[
    {id:'opportunities',label:'Opportunities',icon:'target'},
    {id:'cashflow',label:'Money',icon:'money'},
    {id:'finance',label:'Revenue plan',icon:'chart'},
    {id:'crm',label:'Relationships',icon:'users'},
  ]},
  {label:'Delivery',items:[
    {id:'projects',label:'Projects',icon:'folder'},
    {id:'calendar',label:'Calendar',icon:'calendar'},
  ]},
  {label:'Estate',items:[
    {id:'estate',label:'Tuku Estate',icon:'estate'},
    {id:'estate-control',label:'Estate Control',icon:'target'},
    {id:'operations',label:'Operations',icon:'chart'},
    {id:'payments',label:'Payments',icon:'money'},
  ]},
  {label:'System',items:[
    {id:'ai-search',label:'Search',icon:'search'},
    {id:'accounts',label:'Accounts',icon:'users'},
    {id:'integrations',label:'Integrations',icon:'link'},
    {id:'alerts',label:'Alerts',icon:'bell'},
  ]},
];

export default function Sidebar({active,onChange}){
  return <aside className="sidebar jd-sidebar">
    <div className="sidebar-brand jd-sidebar-brand">
      <div className="jd-brand-lockup">
        <img src="/brand/jakeos-primary.svg" alt="JakeOS"/>
        <small>Executive operating system</small>
      </div>
    </div>
    <nav className="sidebar-nav jd-sidebar-nav" aria-label="JakeOS navigation">
      {GROUPS.map(group=><div className="jd-nav-group" key={group.label}>
        <div className="px-nav-section">{group.label}</div>
        {group.items.map(item=><button key={item.id} className={`nav-item ${active===item.id?'nav-item--active':''}`} aria-current={active===item.id?'page':undefined} onClick={()=>onChange(item.id)}>
          <span className="nav-icon"><Icon name={item.icon}/></span><span className="nav-label">{item.label}</span>
        </button>)}
      </div>)}
    </nav>
    <button className="jd-momentum-card" onClick={()=>window.open('https://momentum.tukutuku.org','_blank','noopener,noreferrer')}>
      <span className="jd-momentum-icon"><Icon name="spark" size={16}/></span>
      <strong>Execute the day<br/>in Momentum</strong>
      <small>JakeOS decides. Momentum moves.</small>
      <span className="jd-momentum-launch">Launch</span>
    </button>
  </aside>;
}
