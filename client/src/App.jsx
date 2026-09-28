import { useCallback, useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import InstallPrompt from './components/InstallPrompt';
import CommandCenter from './components/CommandCenter';
import { Button, Icon } from './components/ProductUI';
import Dashboard from './modules/Dashboard';
import Agents from './modules/Agents';
import Work from './modules/Work';
import Projects from './modules/Projects';
import CalendarModule from './modules/Calendar';
import Finance from './modules/Finance';
import Integrations from './modules/Integrations';
import PersonalFinance from './modules/PersonalFinance';
import AlertsSettings from './modules/AlertsSettings';
import CRM from './modules/CRMNext';
import CashFlow from './modules/CashFlow';
import Opportunities from './modules/Opportunities';
import RevenueSprint from './modules/RevenueSprint';
import VoiceMemo from './modules/VoiceMemo';
import ExportCentre from './modules/ExportCentre';
import AISearch from './modules/AISearch';
import Platforms from './modules/Platforms';
import Estate from './modules/Estate';
import EstateControl from './modules/EstateControl';
import Accounts from './modules/Accounts';
import Operations from './modules/Operations';
import Payments from './modules/Payments';
import { KNOWN_MODULES, MODULE_META, moduleUrl, readLocation } from './navigation';

function AuthGate({checking}){
  const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[submitting,setSubmitting]=useState(false),[error,setError]=useState('');
  const returnTo=`${window.location.pathname}${window.location.search}`||'/';
  const signIn=async event=>{event.preventDefault();if(!email.trim()||!password||submitting)return;setSubmitting(true);setError('');try{const response=await fetch('/auth/tuku/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({email:email.trim(),password})});const data=await response.json().catch(()=>({}));if(!response.ok||data.authenticated!==true)throw new Error(data.error||'Tuku sign-in failed.');window.location.replace(returnTo);}catch(err){setError(err.message||'Tuku sign-in failed.');setSubmitting(false);}};
  return <main className="px-auth-page" data-product="jakeos"><section className="px-auth-card"><div className="px-auth-mark px-auth-mark--logo"><img src="/brand/jakeos-primary.svg" alt="JakeOS"/></div><div className="px-eyebrow">JakeOS</div><h1>Your command center.</h1><p>Use the same Tuku identity you use across the estate. JakeOS verifies it with Tuku Core and keeps no separate password.</p>{checking?<div className="px-kicker">Checking your Tuku session…</div>:<form onSubmit={signIn} className="px-stack"><div className="px-field"><label>Tuku email</label><input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></div><div className="px-field"><label>Password</label><input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></div>{error&&<div className="px-banner px-banner--danger"><div>{error}</div></div>}<Button type="submit" disabled={submitting}>{submitting?'Signing in…':'Sign in to JakeOS'}</Button><a className="px-auth-fallback" href={`/auth/tuku/start?return_to=${encodeURIComponent(returnTo)}`}>Use Tuku SSO redirect instead</a></form>}<div className="px-auth-note">Your password is sent over HTTPS to Tuku Core for verification and is not stored by JakeOS.</div></section></main>;
}

export default function App(){
  const[authState,setAuthState]=useState({checking:true,authenticated:false,user:null});
  const initial=readLocation();
  const[module,setModule]=useState(initial.module);
  const[estateProduct,setEstateProduct]=useState(initial.estateProduct);
  const[recordId,setRecordId]=useState(initial.recordId||null);
  const[profileOpen,setProfileOpen]=useState(false);
  const profileRef=useRef(null);
  useEffect(()=>{let active=true;fetch('/auth/session',{credentials:'same-origin',headers:{Accept:'application/json'}}).then(async r=>({ok:r.ok,data:await r.json().catch(()=>({}))})).then(({ok,data})=>active&&setAuthState({checking:false,authenticated:ok&&data.authenticated===true,user:data.user||null})).catch(()=>active&&setAuthState({checking:false,authenticated:false,user:null}));return()=>{active=false;};},[]);
  const signOut=useCallback(async()=>{try{await fetch('/auth/logout',{method:'POST'});}catch{}window.location.replace('/');},[]);
  useEffect(()=>{if(!profileOpen)return;const close=e=>{if(e.key==='Escape')setProfileOpen(false);if(e.type==='pointerdown'&&!profileRef.current?.contains(e.target))setProfileOpen(false);};document.addEventListener('keydown',close);document.addEventListener('pointerdown',close);return()=>{document.removeEventListener('keydown',close);document.removeEventListener('pointerdown',close);};},[profileOpen]);
  const openAI=useCallback(context=>window.dispatchEvent(new CustomEvent('jake:open',{detail:{prompt:context||''}})),[]);
  const navigate=useCallback((next,params={})=>{const safe=KNOWN_MODULES.has(next)?next:'dashboard';setModule(safe);setEstateProduct(null);setRecordId(params.id==null?null:String(params.id));setProfileOpen(false);const url=moduleUrl(safe,params);window.history.pushState({},'',url);window.scrollTo({top:0,behavior:'smooth'});},[]);
  const navigateEstateProduct=useCallback(code=>{const safe=String(code||'').trim().toLowerCase().replace(/[^a-z0-9_-]/g,'');if(!safe)return;setModule('estate');setEstateProduct(safe);setRecordId(null);window.history.pushState({},'',`/estate/${encodeURIComponent(safe)}`);window.scrollTo({top:0,behavior:'smooth'});},[]);
  const backToEstate=useCallback(()=>{setModule('estate');setEstateProduct(null);setRecordId(null);window.history.pushState({},'','/estate');window.scrollTo({top:0,behavior:'smooth'});},[]);
  const openJake=useCallback(()=>window.dispatchEvent(new CustomEvent('jake:open',{detail:{prompt:''}})),[]);
  useEffect(()=>{const onPop=()=>{const next=readLocation();setModule(next.module);setEstateProduct(next.estateProduct);setRecordId(next.recordId||null);};window.addEventListener('popstate',onPop);return()=>window.removeEventListener('popstate',onPop);},[]);
  if(!authState.authenticated)return <AuthGate checking={authState.checking}/>;
  const userName=authState.user?.name||authState.user?.display_name||authState.user?.full_name||'Jacob Odur';
  const userEmail=authState.user?.email||'Tuku account';
  const initials=userName.split(/\s+/).map(x=>x[0]).filter(Boolean).slice(0,2).join('').toUpperCase()||'JO';
  const opportunityModules=new Set(['opportunities','pipeline','radar','proposals','grants']);
  const opportunityView=module==='pipeline'?'pipeline':module==='radar'?'discover':module==='proposals'||module==='grants'?'applications':(new URLSearchParams(window.location.search).get('view')||'overview');
  const navActive=opportunityModules.has(module)?'opportunities':module;
  const moduleMeta=MODULE_META[navActive]||MODULE_META[module]||MODULE_META.dashboard;
  return <div className="app-layout" data-product="jakeos">
    <Sidebar active={navActive} onChange={navigate}/><MobileNav active={navActive} onChange={navigate}/>
    <header className="jd-topbar">
      <div className="jd-topbar-left">
        <div className="jd-topbar-context"><strong>{moduleMeta.title}</strong><small>{moduleMeta.subtitle}</small></div>
        <button className="jd-search-command" onClick={openJake}><Icon name="search" size={18}/><span>Search or ask Jake</span><kbd>⌘K</kbd></button>
      </div>
      <div className="jd-topbar-actions">
        <button className="jd-top-icon" onClick={()=>navigate('crm')} aria-label="Relationships"><Icon name="document" size={17}/></button>
        <button className="jd-top-icon" onClick={()=>navigate('alerts')} aria-label="Alerts"><Icon name="bell" size={17}/></button>
        <div className="jd-profile-wrap" ref={profileRef}><button className="jd-profile-chip" onClick={()=>setProfileOpen(v=>!v)} aria-haspopup="menu" aria-expanded={profileOpen} title="Account menu"><span className="jd-profile-avatar">{initials}</span><span className="jd-profile-copy"><strong>{userName}</strong><small>{userEmail}</small></span></button>{profileOpen&&<div className="jd-profile-menu" role="menu"><div className="jd-profile-menu-head"><strong>{userName}</strong><small>{userEmail}</small></div><button role="menuitem" onClick={()=>{setProfileOpen(false);navigate('personal-finance');}}>Personal finance</button><button role="menuitem" onClick={()=>{setProfileOpen(false);navigate('integrations');}}>Connections</button><button role="menuitem" className="jd-profile-menu-danger" onClick={signOut}><Icon name="logout" size={16}/>Sign out</button></div>}</div>
      </div>
    </header>
    <main className="main-content">
      {module==='dashboard'&&<Dashboard openAI={openAI} navigate={navigate}/>} {module==='agents'&&<Agents openAI={openAI} navigate={navigate}/>} {module==='work'&&<Work openAI={openAI} initialItemId={recordId}/>}  {module==='estate'&&<Estate key={estateProduct||'estate-overview'} productCode={estateProduct} onSelectProduct={navigateEstateProduct} onBack={backToEstate}/>} {module==='estate-control'&&<EstateControl/>} {module==='operations'&&<Operations/>} {module==='payments'&&<Payments openAI={openAI}/>}  {module==='accounts'&&<Accounts initialCoreUserId={recordId}/>}  {module==='projects'&&<Projects openAI={openAI} initialProjectId={recordId}/>}  {module==='revenue-sprint'&&<RevenueSprint openAI={openAI} navigate={navigate} initialAccountId={recordId}/>}  {opportunityModules.has(module)&&<Opportunities key={`${opportunityView}-${recordId||'none'}`} openAI={openAI} initialView={opportunityView} initialOpportunityId={recordId}/>}  {module==='calendar'&&<CalendarModule openAI={openAI} initialEventId={recordId}/>}  {module==='finance'&&<Finance openAI={openAI}/>} {module==='crm'&&<CRM openAI={openAI} initialClientId={recordId}/>}  {module==='cashflow'&&<CashFlow openAI={openAI}/>} {module==='integrations'&&<Integrations/>} {module==='personal-finance'&&<PersonalFinance openAI={openAI}/>} {module==='alerts'&&<AlertsSettings/>} {module==='ai-search'&&<AISearch navigate={navigate}/>} {module==='voice-memo'&&<VoiceMemo/>} {module==='export'&&<ExportCentre/>} {module==='platforms'&&<Platforms openAI={openAI}/>} 
    </main><CommandCenter navigate={navigate} module={navActive}/><InstallPrompt/>
  </div>;
}
