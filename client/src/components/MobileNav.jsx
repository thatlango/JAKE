import { useEffect, useRef, useState } from 'react';
import { Icon } from './ProductUI';
import { MOBILE_PRIMARY as PRIMARY, MOBILE_MORE as MORE } from '../navigation';
export default function MobileNav({active,onChange}){
  const[open,setOpen]=useState(false),isMore=MORE.some(x=>x.id===active),menuRef=useRef(null);
  const go=id=>{if(id==='more')return setOpen(v=>!v);setOpen(false);onChange(id);};
  useEffect(()=>{if(!open)return;const onKey=e=>{if(e.key==='Escape'){setOpen(false);return;}if(!['ArrowDown','ArrowUp'].includes(e.key))return;const items=[...(menuRef.current?.querySelectorAll('[role="menuitem"]')||[])];if(!items.length)return;e.preventDefault();const current=Math.max(0,items.indexOf(document.activeElement)),next=e.key==='ArrowDown'?(current+1)%items.length:(current-1+items.length)%items.length;items[next]?.focus();};document.addEventListener('keydown',onKey);queueMicrotask(()=>menuRef.current?.querySelector('[role="menuitem"]')?.focus());return()=>document.removeEventListener('keydown',onKey);},[open]);
  return <>
    {open&&<><div className="px-mobile-scrim" onClick={()=>setOpen(false)}/><div className="more-menu" role="menu" aria-label="More JakeOS destinations" ref={menuRef}>{MORE.map(item=><button role="menuitem" key={item.id} className={`more-menu-item ${active===item.id?'more-menu-item--active':''}`} aria-current={active===item.id?'page':undefined} onClick={()=>go(item.id)}><span className="more-menu-icon"><Icon name={item.icon}/></span><span>{item.label}</span>{active===item.id&&<span style={{marginLeft:'auto',color:'var(--px-brand)'}}>●</span>}</button>)}</div></>}
    <nav className="mobile-nav" aria-label="Mobile navigation"><div className="mobile-nav-inner">{PRIMARY.map(item=><button key={item.id} className={`mobile-nav-item ${item.id==='more'?(isMore||open?'mobile-nav-item--active':''):(active===item.id?'mobile-nav-item--active':'')}`} aria-current={item.id!=='more'&&active===item.id?'page':undefined} aria-haspopup={item.id==='more'?'menu':undefined} aria-expanded={item.id==='more'?open:undefined} onClick={()=>go(item.id)}><span className="mobile-nav-icon"><Icon name={item.icon}/></span><span>{item.label}</span></button>)}</div></nav>
  </>;
}
