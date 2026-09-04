import React from 'react';

const PATHS = {
  home:'M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  check:'m5 12 4 4L19 6',
  inbox:'M4 5h16l1 10h-5l-2 3h-4l-2-3H3z',
  folder:'M3 6h6l2 2h10v11H3z',
  calendar:'M5 3v4M19 3v4M4 9h16M4 5h16v16H4z',
  users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  money:'M3 6h18v12H3zM7 10h.01M17 14h.01M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  target:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-5a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-3a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  estate:'M4 20V10l8-6 8 6v10M8 20v-6h8v6M2 20h20',
  search:'M21 21l-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  spark:'m12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7ZM5 16l.8 2.2L8 19l-2.2.8L5 22l-.8-2.2L2 19l2.2-.8Z',
  dots:'M5 12h.01M12 12h.01M19 12h.01',
  plus:'M12 5v14M5 12h14',
  arrow:'M5 12h14m-6-6 6 6-6 6',
  back:'M19 12H5m6-6-6 6 6 6',
  chevron:'m9 18 6-6-6-6',
  warning:'M12 3 2 21h20L12 3Zm0 7v4m0 4h.01',
  clock:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-15v5l3 2',
  link:'M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1',
  settings:'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0-12v2m0 13v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M1.5 12h2m17 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  chart:'M4 20V10m6 10V4m6 16v-7m4 7H2',
  document:'M6 2h8l4 4v16H6zM14 2v5h5M9 12h6M9 16h6',
  mic:'M12 14a4 4 0 0 0 4-4V6a4 4 0 0 0-8 0v4a4 4 0 0 0 4 4Zm-7-4a7 7 0 0 0 14 0M12 17v4m-4 0h8',
  upload:'M12 16V4m-5 5 5-5 5 5M4 20h16',
  grid:'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  logout:'M10 17l5-5-5-5M15 12H3M14 3h6v18h-6',
  refresh:'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
};

export function Icon({name,size=18,className='',title}){
  const path=PATHS[name]||PATHS.grid;
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden={title?undefined:true} role={title?'img':undefined}><path d={path}/>{title&&<title>{title}</title>}</svg>;
}

export function PageHeader({eyebrow,title,subtitle,actions,children}){
  return <header className="px-page-header"><div className="px-page-copy">{eyebrow&&<div className="px-eyebrow">{eyebrow}</div>}<h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}{children}</div>{actions&&<div className="px-page-actions">{actions}</div>}</header>;
}
export function Button({children,icon,variant='primary',className='',...props}){return <button className={`px-btn px-btn--${variant} ${className}`} {...props}>{icon&&<Icon name={icon} size={16}/>}<span>{children}</span></button>;}
export function Panel({title,subtitle,action,children,className=''}){return <section className={`px-panel ${className}`}><div className="px-panel-head"><div>{title&&<h2>{title}</h2>}{subtitle&&<p>{subtitle}</p>}</div>{action}</div>{children}</section>;}
export function Metric({label,value,helper,tone='neutral',icon}){return <div className={`px-metric px-metric--${tone}`}>{icon&&<div className="px-metric-icon"><Icon name={icon}/></div>}<div className="px-metric-value">{value}</div><div className="px-metric-label">{label}</div>{helper&&<div className="px-metric-helper">{helper}</div>}</div>;}
export function Pill({children,tone='neutral'}){return <span className={`px-pill px-pill--${tone}`}>{children}</span>;}
export function EmptyState({icon='inbox',title='Nothing here yet',body,action}){return <div className="px-empty"><div className="px-empty-icon"><Icon name={icon} size={22}/></div><h3>{title}</h3>{body&&<p>{body}</p>}{action}</div>;}
export function StateBanner({tone='info',title,children,action}){return <div className={`px-banner px-banner--${tone}`}><div><strong>{title}</strong>{children&&<div>{children}</div>}</div>{action}</div>;}
export function LoadingRows({count=4}){return <div className="px-loading-list">{Array.from({length:count}).map((_,i)=><div key={i} className="px-skeleton-row"><span/><span/><span/></div>)}</div>;}
export function SectionTitle({title,subtitle,action}){return <div className="px-section-title"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{action}</div>;}
export function formatMoney(value,currency='USD'){const n=Number(value||0);try{return new Intl.NumberFormat('en-UG',{style:'currency',currency,maximumFractionDigits:currency==='UGX'?0:2}).format(n);}catch{return `${currency} ${n.toLocaleString()}`;}}
export function formatDate(value,opts={}){if(!value)return '—';const d=new Date(value);if(Number.isNaN(d.getTime()))return String(value);return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:opts.year?'numeric':undefined,hour:opts.time?'2-digit':undefined,minute:opts.time?'2-digit':undefined}).format(d);}
export function relativeDate(value){if(!value)return '';const d=new Date(value),now=new Date();if(Number.isNaN(d.getTime()))return '';const days=Math.round((d-now)/86400000);if(days===0)return 'Today';if(days===1)return 'Tomorrow';if(days===-1)return 'Yesterday';if(days<0)return `${Math.abs(days)}d overdue`;if(days<7)return `In ${days}d`;return formatDate(d);}
