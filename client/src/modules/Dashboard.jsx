import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon, StateBanner, formatDate, formatMoney, relativeDate } from '../components/ProductUI';
import { DonutChart, HorizontalBars, LineChart, MiniBars, ProgressBar, Sparkline } from '../components/CommandCharts';

const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const compact = value => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(num(value));
const healthLabel = value => {
  const v = String(value || 'unknown').toLowerCase();
  if (v === 'healthy') return 'Healthy';
  if (v === 'degraded') return 'Degraded';
  if (v === 'down') return 'Down';
  return 'Unknown';
};

function MetricCard({ testId, label, value, helper, icon, tone = 'blue', onClick }) {
  return <button data-testid={testId} className={'cc-kpi cc-kpi--' + tone} onClick={onClick}>
    <span className="cc-kpi-icon"><Icon name={icon} size={18} /></span>
    <span className="cc-kpi-copy"><small>{label}</small><strong>{value}</strong><em>{helper}</em></span>
  </button>;
}

function PanelHead({ icon, title, meta, action }) {
  return <div className="cc-panel-head">
    <div className="cc-panel-title">
      <span><Icon name={icon} size={16} /></span>
      <div><h2>{title}</h2>{meta && <small>{meta}</small>}</div>
    </div>
    {action}
  </div>;
}

function EmptyLocal({ children }) {
  return <div className="cc-local-empty">{children}</div>;
}

export default function Dashboard({ openAI, navigate }) {
  const [state, setState] = useState({ overview: null, agents: null, decisions: [], priorities: [], events: [], accounts: null });
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setErrors({});
    const now = new Date();
    const to = new Date(Date.now() + 7 * 86400000);
    const request = async url => {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(url + ' returned ' + response.status);
      return response.json();
    };
    const entries = [
      ['overview', '/api/overview'],
      ['agents', '/api/agents/overview'],
      ['decisions', '/api/agents/decisions?status=open'],
      ['priorities', '/api/work/today?limit=7'],
      ['events', '/api/calendar/events?from=' + now.toISOString().slice(0, 10) + '&to=' + to.toISOString().slice(0, 10)],
      ['accounts', '/api/accounts?limit=1']
    ];
    const results = await Promise.allSettled(entries.map(([, url]) => request(url)));
    const next = { overview: null, agents: null, decisions: [], priorities: [], events: [], accounts: null };
    const nextErrors = {};
    results.forEach((result, index) => {
      const key = entries[index][0];
      if (result.status === 'fulfilled') {
        const data = result.value;
        if (key === 'decisions') next.decisions = data.decisions || [];
        else if (key === 'priorities') next.priorities = data.priorities || [];
        else if (key === 'events') next.events = data.events || [];
        else next[key] = data;
      } else {
        nextErrors[key] = result.reason?.message || 'Unavailable';
      }
    });
    setState(next);
    setErrors(nextErrors);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const overview = state.overview || {};
  const tasks = overview.tasks || {};
  const pipeline = overview.pipeline || {};
  const invoices = overview.invoices || {};
  const finance = overview.finance || {};
  const opportunities = overview.opportunities || {};
  const estate = overview.estate || {};
  const agentTotals = state.agents?.totals || {};
  const products = Array.isArray(estate.products) ? estate.products : [];
  const signals = Array.isArray(overview.attention_signals) ? overview.attention_signals : [];
  const criticalAlerts = signals.filter(item => String(item.severity).toLowerCase() === 'critical').length;
  const healthy = num(estate.totals?.healthy);
  const productTotal = num(estate.totals?.products) || products.length;
  const confirmed = num(finance.confirmed_usd);
  const target = num(finance.quarterly_target_usd);
  const targetPct = target ? Math.round(confirmed / target * 100) : 0;

  const stageOrder = ['New', 'Qualifying', 'Pursuing', 'Drafting', 'Submitted', 'Won', 'Lost', 'Closed', 'Other'];
  const stageData = stageOrder.map(label => ({ label, value: num(opportunities.stages?.[label]) })).filter(item => item.value > 0);
  const unknownStageCount = Object.entries(opportunities.stages || {})
    .filter(([key]) => !stageOrder.includes(key))
    .reduce((sum, [, value]) => sum + num(value), 0);
  if (unknownStageCount) stageData.push({ label: 'Other', value: unknownStageCount });

  const statusCounts = tasks.status_counts || {};
  const workSegments = [
    { label: 'Inbox', value: num(statusCounts.inbox) },
    { label: 'Doing', value: num(statusCounts.doing) },
    { label: 'Ready', value: num(statusCounts.ready) },
    { label: 'Waiting', value: num(statusCounts.waiting) }
  ].filter(item => item.value > 0);
  if (!workSegments.length && num(tasks.open) > 0) workSegments.push({ label: 'Open', value: num(tasks.open) });

  const agentBars = useMemo(() => {
    if (!state.agents?.activity?.length) return [];
    const counts = {};
    state.agents.activity.slice(0, 30).forEach(item => {
      const label = (item.agent_name || item.agent_id || 'Agent').split(' ')[0];
      counts[label] = (counts[label] || 0) + 1;
    });
    return Object.entries(counts).slice(0, 8).map(([label, value]) => ({ label, value }));
  }, [state.agents]);

  const liveActivity = useMemo(() => {
    const agent = (state.agents?.activity || []).map(item => ({
      id: 'a-' + item.id,
      time: item.created_at || item.event_at,
      title: item.summary,
      source: item.agent_name || item.agent_id || 'Agent'
    }));
    const work = (overview.recent_activity || []).map(item => ({
      id: 'w-' + item.id,
      time: item.created_at,
      title: item.title || item.event_type,
      source: item.project_id || 'Work'
    }));
    return [...agent, ...work]
      .filter(item => item.time)
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 8);
  }, [state.agents, overview.recent_activity]);

  const milestones = [...state.events]
    .filter(item => !item.done)
    .sort((a, b) => new Date(a.starts_at || a.date) - new Date(b.starts_at || b.date))
    .slice(0, 5);
  const urgent = [...state.priorities].slice(0, 5);

  return <div className="module cc-dashboard">
    {errors.overview && <StateBanner tone="danger" title="Command-center overview is partially unavailable">Some operational metrics could not be refreshed. Other panels remain usable.</StateBanner>}

    <header className="cc-hero">
      <div className="cc-hero-mark"><img src="/brand/jakeos-icon.svg" alt="" aria-hidden="true" /></div>
      <div className="cc-hero-copy">
        <div className="cc-eyebrow">Operating picture</div>
        <h1>JakeOS Command Center</h1>
        <p>People, products, opportunities and operations — one glance before you decide what moves next.</p>
      </div>
      <div className="cc-hero-actions">
        <button className="cc-ghost-btn" onClick={load}><Icon name="refresh" size={16} />Refresh</button>
        <button className="cc-primary-btn" onClick={() => openAI('Read the current JakeOS command-center state and tell me the three decisions or actions with the highest operational and commercial impact today.')}><img src="/brand/tuku-ai.svg" alt="" aria-hidden="true" />Ask Jake</button>
      </div>
    </header>

    <section className="cc-kpi-grid" aria-label="Executive command-center metrics">
      <MetricCard testId="kpi-active-agents" label="Active Agents" value={state.agents ? num(agentTotals.active) : '—'} helper={state.agents ? num(agentTotals.blocked) + ' blocked · ' + num(agentTotals.queued) + ' queued' : 'Telemetry unavailable'} icon="users" tone="green" onClick={() => navigate('agents')} />
      <MetricCard testId="kpi-open-work" label="Open Work" value={loading ? '—' : num(tasks.open)} helper={num(tasks.blocked) + ' blocked · ' + num(tasks.overdue) + ' overdue'} icon="check" tone="blue" onClick={() => navigate('work')} />
      <MetricCard testId="kpi-opportunities" label="Opportunities" value={loading ? '—' : num(pipeline.active || opportunities.open)} helper={formatMoney(pipeline.active_value_usd || 0, 'USD') + ' active value'} icon="target" tone="blue" onClick={() => navigate('opportunities')} />
      <MetricCard label="Revenue at Risk" value={formatMoney(invoices.overdue_value || 0, 'USD')} helper={num(invoices.overdue_count) + ' overdue receivables'} icon="warning" tone="red" onClick={() => navigate('cashflow')} />
      <MetricCard label="Confirmed Revenue" value={formatMoney(confirmed, 'USD')} helper={target ? Math.min(999, targetPct) + '% of quarterly target' : 'Target not set'} icon="money" tone="green" onClick={() => navigate('finance')} />
      <MetricCard label="Products Healthy" value={productTotal ? healthy + '/' + productTotal : '—'} helper={estate.stale ? 'Estate telemetry stale' : estate.available === false ? 'Estate telemetry unavailable' : 'Latest estate health'} icon="estate" tone="green" onClick={() => navigate('estate')} />
      <MetricCard label="Decisions Needed" value={state.agents ? num(agentTotals.decisions_open || state.decisions.length) : state.decisions.length || '—'} helper={state.decisions.filter(item => String(item.priority).toLowerCase() === 'high').length + ' high priority'} icon="document" tone="amber" onClick={() => navigate('agents')} />
      <MetricCard label="Critical Alerts" value={criticalAlerts} helper={signals.length + ' open signals'} icon="bell" tone="red" onClick={() => navigate('alerts')} />
    </section>

    <section className="cc-main-grid">
      <article className="cc-panel cc-panel--agents" data-testid="panel-agent-command-center">
        <PanelHead icon="users" title="Agent Command Center" meta="Live agent workforce" action={<button className="cc-link-btn" onClick={() => navigate('agents')}>View agents <Icon name="arrow" size={14} /></button>} />
        {state.agents ? <>
          <div className="cc-mini-metrics">
            <div><span className="cc-status-dot cc-status-dot--working" /><strong>{num(agentTotals.active)}</strong><small>Working</small></div>
            <div><span className="cc-status-dot cc-status-dot--queued" /><strong>{num(agentTotals.queued)}</strong><small>Queued</small></div>
            <div><span className="cc-status-dot cc-status-dot--blocked" /><strong>{num(agentTotals.blocked)}</strong><small>Blocked</small></div>
            <div><Icon name="clock" size={14} /><strong>{agentTotals.avg_completion_minutes == null ? '—' : agentTotals.avg_completion_minutes + 'm'}</strong><small>Avg completion</small></div>
            <div><Icon name="check" size={14} /><strong>{agentTotals.success_rate == null ? '—' : agentTotals.success_rate + '%'}</strong><small>Success rate</small></div>
          </div>
          <div className="cc-chart-title">Recent event volume by agent</div>
          <MiniBars data={agentBars} ariaLabel="Recent agent event volume by agent" />
        </> : <EmptyLocal>{errors.agents ? 'Agent telemetry unavailable' : 'No agent telemetry connected yet.'}</EmptyLocal>}
      </article>

      <article className="cc-panel cc-panel--pipeline" data-testid="panel-opportunity-pipeline">
        <PanelHead icon="target" title="Opportunity Pipeline" meta={num(pipeline.active || opportunities.open) + ' active · ' + formatMoney(pipeline.active_value_usd || 0, 'USD')} action={<button className="cc-link-btn" onClick={() => navigate('opportunities')}>Open pipeline <Icon name="arrow" size={14} /></button>} />
        <HorizontalBars data={stageData} valueFormatter={value => compact(value)} ariaLabel="Opportunities by pipeline stage" />
        <div className="cc-panel-foot"><span><strong>{num(opportunities.high_relevance)}</strong> high-relevance</span><span><strong>{num(opportunities.deadlines_14d || pipeline.deadlines_14d)}</strong> deadlines in 14d</span></div>
      </article>

      <article className="cc-panel cc-panel--work" data-testid="panel-work-execution">
        <PanelHead icon="check" title="Work & Execution" meta={num(tasks.open) + ' open items'} action={<button className="cc-link-btn" onClick={() => navigate('work')}>Open work <Icon name="arrow" size={14} /></button>} />
        <div className="cc-work-layout">
          <div>
            <DonutChart segments={workSegments} centerValue={num(tasks.open)} centerLabel="Open work" ariaLabel="Open work distribution" />
            <div className="cc-donut-legend">{workSegments.map((item, index) => <span key={item.label}><i className={'cc-legend-dot cc-series-' + index % 6} />{item.label} <strong>{item.value}</strong></span>)}</div>
          </div>
          <div className="cc-urgent">
            <div className="cc-chart-title">Urgent work</div>
            {urgent.length ? urgent.map(item => <button key={item.id} onClick={() => navigate('work')}>
              <span className={'cc-priority-mark cc-priority-mark--' + String(item.priority || 'medium').toLowerCase()} />
              <span><strong>{item.title}</strong><small>{(item.project_name || 'Work') + ' · ' + (item.due_at ? relativeDate(item.due_at) : 'No due date')}</small></span>
              <em>{item.estimated_minutes ? item.estimated_minutes + 'm' : ''}</em>
            </button>) : <EmptyLocal>No urgent work right now.</EmptyLocal>}
          </div>
        </div>
      </article>

      <article className="cc-panel cc-panel--estate" data-testid="panel-estate-health">
        <PanelHead icon="estate" title="Estate Health" meta={estate.stale ? 'Telemetry stale' : estate.available === false ? 'Telemetry unavailable' : 'Cross-product operating health'} action={<button className="cc-link-btn" onClick={() => navigate('estate')}>View estate <Icon name="arrow" size={14} /></button>} />
        {products.length ? <div className="cc-product-grid">{products.slice(0, 10).map((product, index) => {
          const health = healthLabel(product.health || product.status);
          const tone = health.toLowerCase();
          const availability = num(product.availability);
          const spark = Array.isArray(product.trend) ? product.trend : [availability - .4, availability - .2, availability - .3, availability];
          return <button className="cc-product-card" key={product.code || product.name || index} onClick={() => navigate('estate')}>
            <div className="cc-product-top"><span className={'cc-product-icon cc-product-icon--' + index % 5}><Icon name="grid" size={14} /></span><strong>{product.name || product.code || 'Product'}</strong></div>
            <div className={'cc-health cc-health--' + tone}><i />{health}</div>
            <small>{product.availability != null ? availability.toFixed(1) + '% availability' : num(product.activeUsers7d) + ' active users'}</small>
            <Sparkline values={spark} ariaLabel={(product.name || 'Product') + ' recent health trend'} />
          </button>;
        })}</div> : <EmptyLocal>{estate.available === false ? 'Estate telemetry unavailable.' : 'No estate products reported yet.'}</EmptyLocal>}
      </article>

      <article className="cc-panel cc-panel--finance" data-testid="panel-financial-overview">
        <PanelHead icon="chart" title="Financial Overview" meta="USD-only aggregate where currencies differ" action={<button className="cc-link-btn" onClick={() => navigate('finance')}>View finance <Icon name="arrow" size={14} /></button>} />
        <div className="cc-finance-metrics"><div><small>Confirmed</small><strong>{formatMoney(finance.confirmed_usd || 0, 'USD')}</strong></div><div><small>Pending</small><strong>{formatMoney(finance.pending_usd || 0, 'USD')}</strong></div><div><small>Monthly costs</small><strong>{formatMoney(finance.monthly_costs_usd || 0, 'USD')}</strong></div></div>
        <div className="cc-finance-target"><span>Quarterly target</span><strong>{target ? Math.min(999, targetPct) + '%' : 'Not set'}</strong><ProgressBar value={confirmed} max={target || 1} label="Confirmed revenue against quarterly target" /></div>
        <div className="cc-chart-title">Revenue and recurring cost trend</div>
        <LineChart data={finance.trend || []} series={[{ key: 'inflow', label: 'Inflow' }, { key: 'outflow', label: 'Outflow' }]} ariaLabel="Revenue and monthly recurring cost trend" />
      </article>

      <article className="cc-panel cc-panel--alerts" data-testid="panel-alerts-decisions" aria-label="Alerts and decisions">
        <PanelHead icon="bell" title="Alerts & Decisions" meta={signals.length + ' signals · ' + state.decisions.length + ' decisions'} action={<button className="cc-link-btn" onClick={() => navigate('agents')}>Review <Icon name="arrow" size={14} /></button>} />
        <div className="cc-alert-tabs"><span className="cc-alert-tab cc-alert-tab--red">Critical <b>{criticalAlerts}</b></span><span className="cc-alert-tab cc-alert-tab--amber">Decisions <b>{state.decisions.length}</b></span><span className="cc-alert-tab">Blocked <b>{num(tasks.blocked) + num(agentTotals.blocked)}</b></span></div>
        <div className="cc-alert-list">
          {[...signals.slice(0, 4), ...state.decisions.slice(0, 2).map(item => ({ ...item, severity: 'decision', source: 'Agents' }))].slice(0, 6).map((item, index) => <button key={item.id || index} onClick={() => item.severity === 'decision' ? navigate('agents') : navigate('alerts')}>
            <span className={'cc-alert-icon cc-alert-icon--' + String(item.severity || 'info').toLowerCase()}><Icon name={item.severity === 'decision' ? 'document' : 'warning'} size={14} /></span>
            <span><strong>{item.title}</strong><small>{(item.source || 'JakeOS') + ' · ' + (item.due_at ? relativeDate(item.due_at) : 'Needs review')}</small></span>
          </button>)}
          {!signals.length && !state.decisions.length && <EmptyLocal>No open alerts or decisions.</EmptyLocal>}
        </div>
      </article>
    </section>

    <section className="cc-bottom-grid">
      <article className="cc-panel" data-testid="panel-live-activity">
        <PanelHead icon="spark" title="Live Activity" meta="Latest work and agent events" />
        <div className="cc-activity-list">{liveActivity.length ? liveActivity.map(item => <div key={item.id}><time>{formatDate(item.time, { time: true })}</time><span className="cc-activity-dot" /><span><strong>{item.title}</strong><small>{item.source}</small></span></div>) : <EmptyLocal>No recent activity.</EmptyLocal>}</div>
      </article>

      <article className="cc-panel" data-testid="panel-upcoming-milestones">
        <PanelHead icon="calendar" title="Upcoming Milestones" meta="Next seven days" action={<button className="cc-link-btn" onClick={() => navigate('calendar')}>Calendar <Icon name="arrow" size={14} /></button>} />
        <div className="cc-milestone-list">{milestones.length ? milestones.map(item => <button key={item.id} onClick={() => navigate('calendar')}><span className="cc-date-chip"><strong>{formatDate(item.starts_at || item.date)}</strong></span><span><strong>{item.title}</strong><small>{(item.project || item.type || 'Calendar') + ' · ' + relativeDate(item.starts_at || item.date)}</small></span></button>) : <EmptyLocal>No milestones in the next seven days.</EmptyLocal>}</div>
      </article>

      <article className="cc-panel cc-panel--reach">
        <PanelHead icon="estate" title="Estate Reach" meta="Current connected estate signal" />
        <div className="cc-reach-stats"><div><strong>{productTotal}</strong><span>Products</span></div><div><strong>{num(estate.totals?.activeUsers7d || state.accounts?.totals?.active7d)}</strong><span>Active users · 7d</span></div><div><strong>{num(state.accounts?.totals?.totalAccounts)}</strong><span>Accounts</span></div></div>
        <div className="cc-reach-note"><span className="cc-pulse-ring" /><div><strong>{estate.available === false ? 'Estate telemetry unavailable' : estate.stale ? 'Estate telemetry is stale' : 'Estate telemetry connected'}</strong><p>Verified estate usage only; no estimated impact numbers are shown.</p></div></div>
      </article>
    </section>
  </div>;
}
