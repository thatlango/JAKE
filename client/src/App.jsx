import { useCallback, useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import AIPanel from './components/AIPanel';
import InstallPrompt from './components/InstallPrompt';
import CommandCenter from './components/CommandCenter';
import { Button, Icon } from './components/ProductUI';
import Dashboard from './modules/Dashboard';
import Work from './modules/Work';
import Projects from './modules/Projects';
import Pipeline from './modules/Pipeline';
import CalendarModule from './modules/Calendar';
import Finance from './modules/Finance';
import Integrations from './modules/Integrations';
import PersonalFinance from './modules/PersonalFinance';
import AlertsSettings from './modules/AlertsSettings';
import CRM from './modules/CRMNext';
import CashFlow from './modules/CashFlow';
import OpportunityRadar from './modules/OpportunityRadar';
import Proposals from './modules/Proposals';
import Grants from './modules/Grants';
import VoiceMemo from './modules/VoiceMemo';
import ExportCentre from './modules/ExportCentre';
import AISearch from './modules/AISearch';
import Platforms from './modules/Platforms';
import Estate from './modules/Estate';

const KNOWN_MODULES=new Set(['dashboard','work','projects','calendar','crm','cashflow','pipeline','radar','estate','proposals','grants','finance','ai-search','voice-memo','personal-finance','platforms','export','integrations','alerts']);
const readLocation=()=>{
  const match=window.location.pathname.match(/^\/estate(?:\/([^/?#]+))?\/?$/i);
  if(match)return{module:'estate',estateProduct:match[1]?decodeURIComponent(match[1]).toLowerCase():null};
  const requested=new URLSearchParams(window.location.search).get('module')||'dashboard';
  return{module:KNOWN_MODULES.has(requested)?requested:'dashboard',estateProduct:null};
};

function AuthGate({checking}){
  const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[submitting,setSubmitting]=useState(false),[error,setError]=useState('');
  const returnTo=`${window.location.pathname}${window.location.search}`||'/';
  const signIn=async event=>{event.preventDefault();if(!email.trim()||!password||submitting)return;setSubmitting(true);setError('');try{const response=await fetch('/auth/tuku/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({email:email.trim(),password})});const data=await response.json().catch(()=>({}));if(!response.ok||data.authenticated!==true)throw new Error(data.error||'Tuku sign-in failed.');window.location.replace(returnTo);}catch(err){setError(err.message||'Tuku sign-in failed.');setSubmitting(false);}};
  return <main className="px-auth-page"><section className="px-auth-card"><div className="px-auth-mark">JO</div><div className="px-eyebrow">JakeOS</div><h1>Your command center.</h1><p>Use the same Tuku identity you use across the estate. JakeOS verifies it with Tuku Core and keeps no separate password.</p>{checking?<div className="px-kicker">Checking your Tuku session…</div>:<form onSubmit={signIn} className="px-stack"><div className="px-field"><label>Tuku email</label><input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></div><div className="px-field"><label>Password</label><input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></div>{error&&<div className="px-banner px-banner--danger"><div>{error}</div></div>}<Button type="submit" disabled={submitting}>{submitting?'Signing in…':'Sign in to JakeOS'}</Button><a className="px-auth-fallback" href={`/auth/tuku/start?return_to=${encodeURIComponent(returnTo)}`}>Use Tuku SSO redirect instead</a></form>}<div className="px-auth-note">Your password is sent over HTTPS to Tuku Core for verification and is not stored by JakeOS.</div></section></main>;
}

export default function App(){
  const[authState,setAuthState]=useState({checking:true,authenticated:false,user:null});
  const initial=readLocation();
  const[module,setModule]=useState(initial.module);
  const[estateProduct,setEstateProduct]=useState(initial.estateProduct);
  const[aiOpen,setAiOpen]=useState(false),[aiContext,setAiContext]=useState('');
  useEffect(()=>{let active=true;fetch('/auth/session',{credentials:'same-origin',headers:{Accept:'application/json'}}).then(async r=>({ok:r.ok,data:await r.json().catch(()=>({}))})).then(({ok,data})=>active&&setAuthState({checking:false,authenticated:ok&&data.authenticated===true,user:data.user||null})).catch(()=>active&&setAuthState({checking:false,authenticated:false,user:null}));return()=>{active=false;};},[]);
  const signOut=useCallback(async()=>{try{await fetch('/auth/logout',{method:'POST'});}catch{}window.location.replace('/');},[]);
  const openAI=useCallback(context=>{setAiContext(context||'');setAiOpen(true);},[]);
  const navigate=useCallback(next=>{const safe=KNOWN_MODULES.has(next)?next:'dashboard';setModule(safe);setEstateProduct(null);setAiOpen(false);const url=safe==='dashboard'?'/':safe==='estate'?'/estate':`/?module=${encodeURIComponent(safe)}`;window.history.replaceState({},'',url);window.scrollTo({top:0,behavior:'smooth'});},[]);
  const navigateEstateProduct=useCallback(code=>{const safe=String(code||'').trim().toLowerCase().replace(/[^a-z0-9_-]/g,'');if(!safe)return;setModule('estate');setEstateProduct(safe);setAiOpen(false);window.history.pushState({},'',`/estate/${encodeURIComponent(safe)}`);window.scrollTo({top:0,behavior:'smooth'});},[]);
  const backToEstate=useCallback(()=>{setModule('estate');setEstateProduct(null);setAiOpen(false);window.history.pushState({},'','/estate');window.scrollTo({top:0,behavior:'smooth'});},[]);
  const openJake=useCallback(()=>window.dispatchEvent(new Event('jake:open')),[]);
  useEffect(()=>{const onPop=()=>{const next=readLocation();setModule(next.module);setEstateProduct(next.estateProduct);setAiOpen(false);};window.addEventListener('popstate',onPop);return()=>window.removeEventListener('popstate',onPop);},[]);
  if(!authState.authenticated)return <AuthGate checking={authState.checking}/>;
  const userName=authState.user?.name||authState.user?.display_name||authState.user?.full_name||'Jacob Odur';
  const userEmail=authState.user?.email||'Tuku account';
  const initials=userName.split(/\s+/).map(x=>x[0]).filter(Boolean).slice(0,2).join('').toUpperCase()||'JO';
  return <div className="app-layout">
    <Sidebar active={module} onChange={navigate}/><MobileNav active={module} onChange={navigate}/>
    <header className="jd-topbar">
      <button className="jd-search-command" onClick={openJake}><Icon name="search" size={19}/><span>Search task, project or relationship</span><kbd>⌘F</kbd></button>
      <div className="jd-topbar-actions">
        <button className="jd-top-icon" onClick={()=>navigate('crm')} aria-label="Relationships"><Icon name="document" size={17}/></button>
        <button className="jd-top-icon" onClick={()=>navigate('alerts')} aria-label="Alerts"><Icon name="bell" size={17}/></button>
        <button className="jd-profile-chip" onClick={signOut} title="Sign out of JakeOS"><span className="jd-profile-avatar">{initials}</span><span className="jd-profile-copy"><strong>{userName}</strong><small>{userEmail}</small></span></button>
      </div>
    </header>
    <main className="main-content">
      {module==='dashboard'&&<Dashboard openAI={openAI} navigate={navigate}/>} {module==='work'&&<Work openAI={openAI}/>} {module==='estate'&&<Estate key={estateProduct||'estate-overview'} productCode={estateProduct} onSelectProduct={navigateEstateProduct} onBack={backToEstate}/>} {module==='projects'&&<Projects openAI={openAI}/>} {module==='pipeline'&&<Pipeline openAI={openAI}/>} {module==='proposals'&&<Proposals/>} {module==='grants'&&<Grants/>} {module==='calendar'&&<CalendarModule openAI={openAI}/>} {module==='finance'&&<Finance openAI={openAI}/>} {module==='crm'&&<CRM openAI={openAI}/>} {module==='cashflow'&&<CashFlow openAI={openAI}/>} {module==='radar'&&<OpportunityRadar openAI={openAI}/>} {module==='integrations'&&<Integrations/>} {module==='personal-finance'&&<PersonalFinance openAI={openAI}/>} {module==='alerts'&&<AlertsSettings/>} {module==='ai-search'&&<AISearch navigate={navigate}/>} {module==='voice-memo'&&<VoiceMemo/>} {module==='export'&&<ExportCentre/>} {module==='platforms'&&<Platforms openAI={openAI}/>} 
    </main>{aiOpen&&<AIPanel context={aiContext} module={module} onClose={()=>setAiOpen(false)} data={{}}/>}<CommandCenter navigate={navigate} module={module}/><InstallPrompt/>
  </div>;
}
