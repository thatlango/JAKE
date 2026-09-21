import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Icon, StateBanner, formatDate, relativeDate } from '../components/ProductUI';
import { HorizontalBars, MiniBars, ProgressBar } from '../components/CommandCharts';

const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const titleCase = value => String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
const stateLabel = value => value ? titleCase(value) : 'Not active';
const stateTone = value => {
  if (['working', 'completed', 'in_progress'].includes(value)) return 'green';
  if (['blocked', 'failed', 'stale'].includes(value)) return 'red';
  if (['waiting', 'queued', 'verification'].includes(value)) return 'amber';
  return 'muted';
};

function Summary({ label, value, helper, tone = 'blue' }) {
  return <div className={'cc-agent-summary cc-agent-summary--' + tone}><small>{label}</small><strong>{value}</strong><span>{helper}</span></div>;
}

function PanelHead({ icon, title, meta, action }) {
  return <div className="cc-panel-head">
    <div className="cc-panel-title"><span><Icon name={icon} size={16} /></span><div><h2>{title}</h2>{meta && <small>{meta}</small>}</div></div>
    {action}
  </div>;
}

export default function Agents({ openAI, navigate }) {
  const [data, setData] = useState({ overview: null, runs: [], decisions: [] });
  const [error, setError] = useState('');
  const [live, setLive] = useState('connecting');

  const load = useCallback(async () => {
    try {
      setError('');
      const get = async url => {
        const response = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(url + ' returned ' + response.status);
        return response.json();
      };
      const [overview, runs, decisions] = await Promise.all([
        get('/api/agents/overview'),
        get('/api/agents/runs?limit=20'),
        get('/api/agents/decisions?status=open')
      ]);
      setData({ overview, runs: runs.runs || [], decisions: decisions.decisions || [] });
    } catch (err) {
      setError(err.message || 'Agent telemetry could not be loaded.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let stream;
    try {
      stream = new EventSource('/api/agents/events/stream');
      stream.addEventListener('connected', () => setLive('live'));
      stream.addEventListener('agent-event', event => {
        setLive('live');
        try {
          const next = JSON.parse(event.data);
          setData(previous => {
            if (!previous.overview) return previous;
            const activity = [next, ...(previous.overview.activity || []).filter(item => item.id !== next.id)].slice(0, 40);
            const agents = (previous.overview.agents || []).map(agent => agent.id === next.agent_id ? {
              ...agent,
              state: next.state || agent.state,
              last_seen_at: next.event_at || next.created_at || new Date().toISOString(),
              summary: next.summary,
              run_id: next.run_id || agent.run_id
            } : agent);
            return { ...previous, overview: { ...previous.overview, activity, agents } };
          });
        } catch {}
      });
      stream.onerror = () => setLive('reconnecting');
    } catch {
      setLive('unavailable');
    }
    return () => stream?.close();
  }, []);

  const overview = data.overview || {};
  const totals = overview.totals || {};
  const agents = overview.agents || [];
  const activity = overview.activity || [];
  const activeRun = data.runs.find(run => ['in_progress', 'verification', 'blocked'].includes(run.status)) || data.runs[0] || null;
  const runBars = data.runs.slice(0, 8).map(run => ({ label: (run.title || 'Run').slice(0, 18), value: num(run.progress) }));

  const stateCounts = useMemo(() => agents.reduce((accumulator, agent) => {
    const key = agent.state || 'inactive';
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {}), [agents]);

  const roster = agents.filter(agent => agent.state || agent.current_work).sort((a, b) => {
    const rank = { working: 0, blocked: 1, stale: 2, waiting: 3, queued: 4, completed: 5, failed: 6 };
    return (rank[a.state] ?? 9) - (rank[b.state] ?? 9) || String(a.name).localeCompare(String(b.name));
  });

  const eventBars = useMemo(() => {
    const counts = {};
    activity.slice(0, 30).forEach(event => {
      const key = (event.agent_name || event.agent_id || 'Agent').split(' ')[0];
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).slice(0, 8).map(([label, value]) => ({ label, value }));
  }, [activity]);

  return <div className="module cc-agents-page">
    <header className="cc-hero cc-hero--compact">
      <div className="cc-hero-mark"><Icon name="users" size={26} /></div>
      <div className="cc-hero-copy"><div className="cc-eyebrow">AI workforce</div><h1>Agent Command Center</h1><p>Watch specialist agents execute, hand off evidence, surface blockers and bring only real decisions back to you.</p></div>
      <div className="cc-hero-actions">
        <span className={'cc-live-pill cc-live-pill--' + live}><i />{live === 'live' ? 'Live' : live === 'reconnecting' ? 'Reconnecting' : live === 'unavailable' ? 'Unavailable' : 'Connecting'}</span>
        <Button variant="secondary" icon="refresh" onClick={load}>Refresh</Button>
        <Button icon="spark" onClick={() => openAI('Review the current agent workforce. Tell me what is blocked, what is moving, which agent is overloaded, and which decisions require me.')}>Ask Jake</Button>
      </div>
    </header>

    {error && <StateBanner tone="danger" title="Agent telemetry unavailable">{error}</StateBanner>}

    <section className="cc-agent-summary-grid">
      <Summary label="Working" value={num(totals.active)} helper={num(totals.registered) + ' registered'} tone="green" />
      <Summary label="Queued" value={num(totals.queued)} helper={num(totals.waiting) + ' waiting'} tone="blue" />
      <Summary label="Blocked" value={num(totals.blocked)} helper={num(totals.stale) + ' stale'} tone="red" />
      <Summary label="Success rate" value={totals.success_rate == null ? '—' : totals.success_rate + '%'} helper="Completed vs failed · 30d" tone="green" />
      <Summary label="Avg completion" value={totals.avg_completion_minutes == null ? '—' : totals.avg_completion_minutes + 'm'} helper="Completed runs · 30d" tone="blue" />
      <Summary label="Decisions" value={num(totals.decisions_open || data.decisions.length)} helper="Waiting for Jacob" tone="amber" />
    </section>

    <section className="cc-agents-grid">
      <article className="cc-panel cc-agent-roster-panel">
        <PanelHead icon="users" title="Agent Roster" meta="Only agents with current or recent state are highlighted" />
        {roster.length ? <div className="cc-agent-roster">{roster.map(agent => <div className="cc-agent-card" key={agent.id}>
          <div className={'cc-agent-avatar cc-agent-avatar--' + stateTone(agent.state)}><Icon name={agent.group === 'Assurance' ? 'check' : agent.group === 'Revenue' ? 'target' : agent.group === 'Production' ? 'chart' : 'users'} size={16} /></div>
          <div className="cc-agent-card-copy">
            <div><strong>{agent.name}</strong><span className={'cc-state-badge cc-state-badge--' + stateTone(agent.state)}>{stateLabel(agent.state)}</span></div>
            <p>{agent.current_work || agent.summary || 'No active assignment'}</p>
            <small>{agent.last_seen_at ? 'Last activity ' + relativeDate(agent.last_seen_at) : agent.group}</small>
          </div>
        </div>)}</div> : <div className="cc-local-empty">No agents are active yet. The roster will light up when Agent OS starts emitting events.</div>}
      </article>

      <article className="cc-panel cc-agent-runs-panel">
        <PanelHead icon="chart" title="Active Runs" meta={activeRun ? activeRun.title : 'No active run'} />
        {activeRun ? <div className="cc-active-run">
          <div className="cc-run-title"><div><span className={'cc-state-badge cc-state-badge--' + stateTone(activeRun.status)}>{stateLabel(activeRun.status)}</span><h3>{activeRun.title}</h3></div><strong>{num(activeRun.progress)}%</strong></div>
          <ProgressBar value={num(activeRun.progress)} max={100} label={activeRun.title + ' progress'} />
          <div className="cc-run-meta"><span><Icon name="users" size={14} />{activeRun.current_agent || 'Awaiting agent'}</span><span><Icon name="warning" size={14} />{num(activeRun.blockers_count || activeRun.blockers)} blockers</span><span><Icon name="document" size={14} />{num(activeRun.artifacts)} artifacts</span></div>
        </div> : <div className="cc-local-empty">No agent run has started yet.</div>}
        <div className="cc-chart-title">Recent run progress</div>
        <HorizontalBars data={runBars} valueFormatter={value => value + '%'} ariaLabel="Recent agent run progress" />
      </article>

      <article className="cc-panel cc-agent-activity-panel">
        <PanelHead icon="spark" title="Live Agent Activity" meta={live === 'live' ? 'Streaming from JakeOS' : 'Latest stored events'} />
        <MiniBars data={eventBars} ariaLabel="Recent agent event volume" />
        <div className="cc-agent-timeline">{activity.slice(0, 12).map(event => <div key={event.id}>
          <time>{formatDate(event.created_at || event.event_at, { time: true })}</time>
          <span className={'cc-event-node cc-event-node--' + stateTone(event.state)} />
          <span><strong>{event.agent_name || event.agent_id}</strong><p>{event.summary}</p><small>{stateLabel(event.event_type)}</small></span>
        </div>)}{!activity.length && <div className="cc-local-empty">No events have been received yet.</div>}</div>
      </article>

      <article className="cc-panel cc-agent-decisions-panel">
        <PanelHead icon="document" title="Decision Queue" meta="Human authority stays here" />
        <div className="cc-decision-list">{data.decisions.length ? data.decisions.map(item => <div className="cc-decision-card" key={item.id}>
          <div><span className={'cc-priority-pill cc-priority-pill--' + String(item.priority || 'medium').toLowerCase()}>{titleCase(item.priority || 'medium')}</span><small>{item.due_at ? relativeDate(item.due_at) : 'No deadline'}</small></div>
          <h3>{item.title}</h3>
          <p>{item.recommendation || 'Review the evidence before deciding.'}</p>
          <button className="cc-link-btn" onClick={() => navigate('work')}>Open decision context <Icon name="arrow" size={14} /></button>
        </div>) : <div className="cc-local-empty">No open decisions.</div>}</div>
      </article>

      <article className="cc-panel cc-agent-state-panel">
        <PanelHead icon="chart" title="Workforce State" meta="Current state distribution" />
        <HorizontalBars data={Object.entries(stateCounts).map(([label, value]) => ({ label: stateLabel(label), value }))} ariaLabel="Agent state distribution" />
      </article>

      <article className="cc-panel cc-agent-guardrail-panel">
        <PanelHead icon="warning" title="Guardrails" meta="Agent OS authority boundary" />
        <div className="cc-guardrails"><div><strong>T0–T1</strong><span>Read, inspect and draft by default</span></div><div><strong>T2</strong><span>Controlled internal writes</span></div><div><strong>T3</strong><span>External or irreversible action needs Jacob</span></div><div><strong>T4</strong><span>Money, contracts and personnel never autonomous</span></div></div>
      </article>
    </section>
  </div>;
}
