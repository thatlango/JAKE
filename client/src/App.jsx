import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import AIPanel from './components/AIPanel';
import InstallPrompt from './components/InstallPrompt';
import CommandCenter from './components/CommandCenter';
import Dashboard from './modules/Dashboard';
import Projects from './modules/Projects';
import Pipeline from './modules/Pipeline';
import CalendarModule from './modules/Calendar';
import Finance from './modules/Finance';
import Integrations from './modules/Integrations';
import PersonalFinance from './modules/PersonalFinance';
import AlertsSettings from './modules/AlertsSettings';
import CRM from './modules/CRM';
import CashFlow from './modules/CashFlow';
import OpportunityRadar from './modules/OpportunityRadar';
import ClaudeSync from './modules/ClaudeSync';
import Proposals from './modules/Proposals';
import Grants from './modules/Grants';
import VoiceMemo from './modules/VoiceMemo';
import ExportCentre from './modules/ExportCentre';
import AISearch from './modules/AISearch';
import Platforms from './modules/Platforms';
import Estate from './modules/Estate';
import { SEED_DATA } from './data/seed';

function usePersistedState(key, seedValue) {
  const [state, setState] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : seedValue; } catch { return seedValue; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(state)); } catch {} }, [key, state]);
  return [state, setState];
}

const uid = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

function AuthGate({ checking }) {
  return (
    <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,background:'linear-gradient(145deg,#f7f9fc,#eef3fb)',color:'#142033'}}>
      <section style={{width:'min(460px,100%)',background:'#fff',border:'1px solid #e4eaf2',borderRadius:28,padding:'32px 30px',boxShadow:'0 24px 70px rgba(32,48,74,.10)'}}>
        <div style={{width:52,height:52,borderRadius:17,display:'grid',placeItems:'center',background:'#eef2ff',fontSize:25,marginBottom:24}}>🧭</div>
        <div style={{fontSize:12,fontWeight:800,letterSpacing:'.12em',textTransform:'uppercase',color:'#667085',marginBottom:8}}>JakeOS</div>
        <h1 style={{fontSize:31,lineHeight:1.08,margin:'0 0 12px',letterSpacing:'-.04em'}}>Your command center.</h1>
        <p style={{fontSize:15,lineHeight:1.6,color:'#667085',margin:'0 0 26px'}}>Use your Tuku account to access projects, pipeline, finances, Estate performance and the work that flows into Momentum.</p>
        {checking ? <div style={{fontWeight:700,color:'#667085'}}>Checking your Tuku session…</div> : <button onClick={()=>window.location.assign(`/auth/tuku/start?return_to=${encodeURIComponent(window.location.pathname+window.location.search)}`)} style={{width:'100%',border:0,borderRadius:15,padding:'14px 18px',background:'#1f2937',color:'#fff',fontSize:15,fontWeight:800,cursor:'pointer'}}>Continue with Tuku Auth</button>}
        <p style={{fontSize:12,lineHeight:1.5,color:'#98a2b3',margin:'18px 0 0'}}>The same Tuku email and password are used. JakeOS does not keep a separate password.</p>
      </section>
    </main>
  );
}

export default function App() {
  const [authState, setAuthState] = useState({ checking:true, authenticated:false, user:null });
  const [module, setModule] = useState(() => new URLSearchParams(window.location.search).get('module') || 'dashboard');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiContext, setAiContext] = useState('');
  const [projects,  setProjects]  = usePersistedState('jake_projects',  SEED_DATA.projects);
  const [pipeline,  setPipeline]  = usePersistedState('jake_pipeline',  SEED_DATA.pipeline);
  const [calendar,  setCalendar]  = usePersistedState('jake_calendar',  SEED_DATA.calendar);
  const [finance,   setFinance]   = usePersistedState('jake_finance',   SEED_DATA.finance);

  useEffect(() => {
    let active = true;
    fetch('/auth/session', { credentials:'same-origin', headers:{Accept:'application/json'} })
      .then(async r => ({ ok:r.ok, data:await r.json().catch(()=>({})) }))
      .then(({ok,data}) => { if(active) setAuthState({checking:false,authenticated:ok&&data.authenticated===true,user:data.user||null}); })
      .catch(() => { if(active) setAuthState({checking:false,authenticated:false,user:null}); });
    return () => { active=false; };
  }, []);

  const syncToServer = useCallback(async (cal, fin, pipe) => {
    try { await fetch('/api/sync', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ calendar: cal, finance: fin, pipeline: pipe }) }); } catch {}
  }, []);

  const loadCoreData = useCallback(async () => {
    try {
      const [projectsRes, pipelineRes] = await Promise.all([fetch('/api/projects'), fetch('/api/pipeline')]);
      if (projectsRes.status === 401 || pipelineRes.status === 401) { setAuthState({checking:false,authenticated:false,user:null}); return; }
      if (projectsRes.ok) { const p = await projectsRes.json(); if (Array.isArray(p.projects) && p.projects.length) setProjects(p.projects); }
      if (pipelineRes.ok) { const p = await pipelineRes.json(); if (Array.isArray(p.pipeline) && p.pipeline.length) setPipeline(p.pipeline); }
    } catch {}
  }, [setPipeline, setProjects]);

  useEffect(() => { if(authState.authenticated) loadCoreData(); }, [authState.authenticated, loadCoreData]);
  useEffect(() => { if(authState.authenticated) syncToServer(calendar, finance, pipeline); }, [authState.authenticated, calendar, finance, pipeline, syncToServer]);

  const addProject = useCallback(async (projectInput) => {
    const payload = { ...projectInput, id: uid('proj') };
    try { const res = await fetch('/api/projects', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }); const data = await res.json(); if (data?.project) { setProjects(prev => [data.project, ...prev]); return; } } catch {}
    setProjects(prev => [payload, ...prev]);
  }, [setProjects]);

  const toggleProjectTask = useCallback(async (projectId, taskId) => {
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, tasks: p.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t) } : p));
    const project = projects.find(p => p.id === projectId); if (!project) return;
    const updatedTasks = project.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t);
    const progress = updatedTasks.length ? Math.round((updatedTasks.filter(t=>t.done).length / updatedTasks.length) * 100) : 0;
    try { await fetch(`/api/projects/${projectId}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ tasks: updatedTasks, progress }) }); } catch {}
  }, [projects, setProjects]);

  const addProspect = useCallback(async (prospectInput) => {
    const payload = { ...prospectInput, id: uid('pipe') };
    try { const res = await fetch('/api/pipeline', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }); const data = await res.json(); if (data?.item) { setPipeline(prev => [data.item, ...prev]); return; } } catch {}
    setPipeline(prev => [payload, ...prev]);
  }, [setPipeline]);

  const signOut = useCallback(async () => { try { await fetch('/auth/logout',{method:'POST'}); } catch {} window.location.replace('/'); }, []);
  const openAI = (context = '') => { setAiContext(context); setAiOpen(true); };
  const navigate = (m) => { setModule(m); setAiOpen(false); window.history.replaceState({},'',`?module=${encodeURIComponent(m)}`); };
  const allData = { projects, pipeline, calendar, finance };
  const moduleProps = { projects, setProjects, pipeline, setPipeline, calendar, setCalendar, finance, setFinance, openAI };

  if (!authState.authenticated) return <AuthGate checking={authState.checking} />;

  return (
    <div className="app-layout">
      <Sidebar active={module} onChange={navigate} />
      <MobileNav active={module} onChange={navigate} />
      <button onClick={signOut} title="Sign out of JakeOS" style={{position:'fixed',top:14,right:16,zIndex:70,border:'1px solid var(--border)',borderRadius:10,padding:'7px 10px',background:'var(--surface)',color:'var(--text-muted)',fontSize:11,fontWeight:800,cursor:'pointer'}}>Tuku · Sign out</button>
      <main className="main-content">
        {module === 'dashboard'        && <Dashboard         {...moduleProps} />}
        {module === 'estate'           && <Estate />}
        {module === 'projects'         && <Projects          {...moduleProps} onCreateProject={addProject} onToggleTask={toggleProjectTask} />}
        {module === 'pipeline'         && <Pipeline          {...moduleProps} onAddProspect={addProspect} />}
        {module === 'proposals'        && <Proposals         pipeline={pipeline} openAI={openAI} />}
        {module === 'grants'           && <Grants            openAI={openAI} />}
        {module === 'calendar'         && <CalendarModule    {...moduleProps} />}
        {module === 'finance'          && <Finance           {...moduleProps} />}
        {module === 'crm'              && <CRM               openAI={openAI} />}
        {module === 'cashflow'         && <CashFlow          openAI={openAI} />}
        {module === 'radar'            && <OpportunityRadar  openAI={openAI} />}
        {module === 'integrations'     && <Integrations      openAI={openAI} />}
        {module === 'personal-finance' && <PersonalFinance   openAI={openAI} />}
        {module === 'alerts'           && <AlertsSettings    calendar={calendar} finance={finance} openAI={openAI} />}
        {module === 'claude-sync'      && <ClaudeSync        openAI={openAI} projects={projects} />}
        {module === 'ai-search'        && <AISearch          {...allData} />}
        {module === 'voice-memo'       && <VoiceMemo         projects={projects} pipeline={pipeline} setCalendar={setCalendar} openAI={openAI} />}
        {module === 'export'           && <ExportCentre      {...allData} />}
        {module === 'platforms'        && <Platforms         openAI={openAI} />}
      </main>
      {aiOpen && <AIPanel context={aiContext} module={module} onClose={() => setAiOpen(false)} data={allData} />}
      <CommandCenter navigate={navigate} />
      <InstallPrompt />
    </div>
  );
}
