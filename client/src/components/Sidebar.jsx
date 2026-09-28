import { Icon } from './ProductUI';
import { NAV_GROUPS } from '../navigation';

export default function Sidebar({active,onChange}){
  return <aside className="sidebar jd-sidebar">
    <div className="sidebar-brand jd-sidebar-brand">
      <div className="jd-brand-lockup">
        <img src="/brand/jakeos-primary.svg" alt="JakeOS"/>
        <small>Executive operating system</small>
      </div>
    </div>
    <nav className="sidebar-nav jd-sidebar-nav" aria-label="JakeOS navigation">
      {NAV_GROUPS.map(group=><div className="jd-nav-group" key={group.label}>
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
