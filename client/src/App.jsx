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
import { SEED_DATA } from './data/seed';

function usePersistedState(key, seedValue) {
  const [state, setState] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : seedValue; } catch { return seedValue; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(state)); } catch {} }, [key, state]);
  return [state, setState];
}

const uid = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

export default function App() {
  const [module, setModule] = useState(() => new URLSearchParams(window.location.search).get('module') || 'dashboard');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiContext, setAiContext] = useState('');
  const [projects,  setProjects]  = usePersistedState('jake_projects',  SEED_DATA.projects);
  const [pipeline,  setPipeline]  = usePersistedState('jake_pipeline',  SEED_DATA.pipeline);
  const [calendar,  setCalendar]  = usePersistedState('jake_calendar',  SEED_DATA.calendar);
  const [finance,   setFinance]   = usePersistedState('jake_finance',   SEED_DATA.finance);

  const syncToServer = useCallback(async (cal, fin) => {
    try { await fetch('/api/sync', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ calendar: cal, finance: fin }) }); } catch {}
  }, []);

  const loadCoreData = useCallback(async () => {
    try {
      const [projectsRes, pipelineRes] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/pipeline'),
      ]);

      if (projectsRes.ok) {
        const p = await projectsRes.json();
        if (Array.isArray(p.projects) && p.projects.length) setProjects(p.projects);
      }

      if (pipelineRes.ok) {
        const p = await pipelineRes.json();
        if (Array.isArray(p.pipeline) && p.pipeline.length) setPipeline(p.pipeline);
      }
    } catch {}
  }, [setPipeline, setProjects]);

  useEffect(() => { loadCoreData(); }, [loadCoreData]);
  useEffect(() => { syncToServer(calendar, finance); }, [calendar, finance, syncToServer]);

  const addProject = useCallback(async (projectInput) => {
    const payload = { ...projectInput, id: uid('proj') };
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data?.project) {
        setProjects(prev => [data.project, ...prev]);
        return;
      }
    } catch {}
    setProjects(prev => [payload, ...prev]);
  }, [setProjects]);

  const toggleProjectTask = useCallback(async (projectId, taskId) => {
    setProjects(prev => prev.map(p => p.id === projectId
      ? { ...p, tasks: p.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t) }
      : p
    ));

    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const updatedTasks = project.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t);
    const progress = updatedTasks.length ? Math.round((updatedTasks.filter(t => t.done).length / updatedTasks.length) * 100) : 0;
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: updatedTasks, progress }),
      });
    } catch {}
  }, [projects, setProjects]);

  const addProspect = useCallback(async (prospectInput) => {
    const payload = { ...prospectInput, id: uid('pipe') };
    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data?.item) {
        setPipeline(prev => [data.item, ...prev]);
        return;
      }
    } catch {}
    setPipeline(prev => [payload, ...prev]);
  }, [setPipeline]);

  const openAI = (context = '') => { setAiContext(context); setAiOpen(true); };
  const navigate = (m) => { setModule(m); setAiOpen(false); };

  const allData = { projects, pipeline, calendar, finance };
  const moduleProps = { projects, setProjects, pipeline, setPipeline, calendar, setCalendar, finance, setFinance, openAI };

  return (
    <div className="app-layout">
      <Sidebar active={module} onChange={navigate} />
      <MobileNav active={module} onChange={navigate} />

      <main className="main-content">
        {module === 'dashboard'        && <Dashboard         {...moduleProps} />}
        {module === 'projects'         && <Projects          {...moduleProps} onCreateProject={addProject} onToggleTask={toggleProjectTask} />}
        {module === 'pipeline'         && <Pipeline          {...moduleProps} onAddProspect={addProspect} />}
        {module === 'calendar'         && <CalendarModule    {...moduleProps} />}
        {module === 'finance'          && <Finance           {...moduleProps} />}
        {module === 'crm'              && <CRM               openAI={openAI} />}
        {module === 'cashflow'         && <CashFlow          openAI={openAI} />}
        {module === 'radar'            && <OpportunityRadar  openAI={openAI} />}
        {module === 'integrations'     && <Integrations      openAI={openAI} />}
        {module === 'personal-finance' && <PersonalFinance   openAI={openAI} />}
        {module === 'alerts'           && <AlertsSettings    calendar={calendar} finance={finance} openAI={openAI} />}
      </main>

      {aiOpen && <AIPanel context={aiContext} module={module} onClose={() => setAiOpen(false)} data={allData} />}
      <CommandCenter navigate={navigate} />
      <InstallPrompt />
    </div>
  );
}
