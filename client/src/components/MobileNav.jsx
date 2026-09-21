import { useState } from 'react';
import { Icon } from './ProductUI';

const PRIMARY=[
  {id:'dashboard',label:'Home',icon:'home'},
  {id:'agents',label:'Agents',icon:'users'},
  {id:'work',label:'Work',icon:'check'},
  {id:'opportunities',label:'Opportunities',icon:'target'},
  {id:'more',label:'More',icon:'dots'},
];
const MORE=[
  {id:'estate',label:'Estate',icon:'estate'},
  {id:'operations',label:'Operations',icon:'chart'},
  {id:'finance',label:'Finance',icon:'chart'},
  {id:'payments',label:'Payments',icon:'money'},
  {id:'accounts',label:'Accounts',icon:'users'},
  {id:'projects',label:'Projects',icon:'folder'},
  {id:'calendar',label:'Calendar',icon:'calendar'},
  {id:'crm',label:'Relationships',icon:'users'},
  {id:'cashflow',label:'Money',icon:'money'},
  {id:'integrations',label:'Integrations',icon:'link'},
  {id:'alerts',label:'Alerts',icon:'bell'},
  {id:'platforms',label:'Platforms',icon:'grid'},
  {id:'ai-search',label:'Search',icon:'search'},
  {id:'voice-memo',label:'Voice capture',icon:'mic'},
  {id:'personal-finance',label:'Personal finance',icon:'money'},
  {id:'export',label:'Export',icon:'upload'},
];
export default function MobileNav({active,onChange}){
  const[open,setOpen]=useState(false),isMore=MORE.some(x=>x.id===active);
  const go=id=>{if(id==='more')return setOpen(v=>!v);setOpen(false);onChange(id);};
  return <>
    {open&&<><div className="px-mobile-scrim" onClick={()=>setOpen(false)}/><div className="more-menu">{MORE.map(item=><button key={item.id} className={`more-menu-item ${active===item.id?'more-menu-item--active':''}`} aria-current={active===item.id?'page':undefined} onClick={()=>go(item.id)}><span className="more-menu-icon"><Icon name={item.icon}/></span><span>{item.label}</span>{active===item.id&&<span className="cc-current-dot">●</span>}</button>)}</div></>}
    <nav className="mobile-nav" aria-label="Mobile navigation"><div className="mobile-nav-inner">{PRIMARY.map(item=><button key={item.id} className={`mobile-nav-item ${item.id==='more'?(isMore||open?'mobile-nav-item--active':''):(active===item.id?'mobile-nav-item--active':'')}`} aria-current={item.id!=='more'&&active===item.id?'page':undefined} onClick={()=>go(item.id)}><span className="mobile-nav-icon"><Icon name={item.icon}/></span><span>{item.label}</span></button>)}</div></nav>
  </>;
}
