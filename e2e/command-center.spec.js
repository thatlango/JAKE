const { test, expect } = require('@playwright/test');

const overview = {
  generated_at: '2026-09-21T15:00:00.000Z',
  tasks: { open: 48, inbox: 14, doing: 19, overdue: 3, blocked: 5, completed_this_week: 27 },
  projects: [
    { id: 'impactos', name: 'ImpactOS', status: 'Active', priority: 'High', open_tasks: 8, overdue_tasks: 1, blocked_tasks: 1 },
    { id: 'bds', name: 'Tuku BDS', status: 'Active', priority: 'High', open_tasks: 6, overdue_tasks: 0, blocked_tasks: 0 }
  ],
  pipeline: { active: 23, active_value_usd: 148000, deadlines_14d: 7 },
  invoices: { receivables: 6, receivables_value: 28400, overdue_count: 2, overdue_value: 7200 },
  opportunities: {
    open: 23, high_relevance: 11, deadlines_14d: 7,
    stages: { New: 4, Qualifying: 5, Pursuing: 6, Drafting: 3, Submitted: 2, Won: 2, Lost: 1 }
  },
  finance: {
    confirmed_usd: 62000, pending_usd: 34000, projected_usd: 91000,
    monthly_costs_usd: 18500, quarterly_target_usd: 100000,
    trend: [
      { label: 'Apr', inflow: 17000, outflow: 12000 },
      { label: 'May', inflow: 22000, outflow: 14500 },
      { label: 'Jun', inflow: 26000, outflow: 15000 },
      { label: 'Jul', inflow: 31000, outflow: 17000 },
      { label: 'Aug', inflow: 28000, outflow: 16000 },
      { label: 'Sep', inflow: 36000, outflow: 18500 }
    ]
  },
  attention_signals: [
    { id: 'sig-1', title: 'LendFlow servicing queue needs review', severity: 'critical', source: 'lendflow', due_at: '2026-09-21T17:00:00Z' },
    { id: 'sig-2', title: 'Three opportunities close this week', severity: 'high', source: 'opportunities', due_at: '2026-09-23T12:00:00Z' }
  ],
  estate: {
    configured: true, available: true, stale: false,
    totals: { products: 10, healthy: 8, degraded: 1, down: 1, activeUsers7d: 126 },
    products: [
      { code: 'impactos', name: 'ImpactOS', health: 'healthy', availability: 99.9, activeUsers7d: 31 },
      { code: 'bds', name: 'Tuku BDS', health: 'healthy', availability: 99.8, activeUsers7d: 22 },
      { code: 'ecitaa', name: 'ECITAA', health: 'healthy', availability: 99.7, activeUsers7d: 18 },
      { code: 'lendflow', name: 'LendFlow', health: 'degraded', availability: 97.4, activeUsers7d: 12 },
      { code: 'traffiq', name: 'Traffiq', health: 'healthy', availability: 99.6, activeUsers7d: 14 },
      { code: 'smartvet', name: 'SmartVet', health: 'healthy', availability: 99.9, activeUsers7d: 8 },
      { code: 'tukuiq', name: 'TukuIQ', health: 'healthy', availability: 99.9, activeUsers7d: 5 },
      { code: 'ops', name: 'Ops', health: 'healthy', availability: 99.9, activeUsers7d: 7 },
      { code: 'radar', name: 'Radar', health: 'down', availability: 82.1, activeUsers7d: 2 },
      { code: 'tukupay', name: 'TukuPay', health: 'healthy', availability: 99.5, activeUsers7d: 7 }
    ],
    usageTrend: []
  }
};

const agents = {
  totals: { active: 3, queued: 1, blocked: 1, stale: 0, success_rate: 92, avg_completion_minutes: 38, decisions_open: 2 },
  agents: [
    { id: 'command-orchestrator', name: 'Command Orchestrator', state: 'working', current_work: 'UNICEF Agora RFPS 503950', last_seen_at: '2026-09-21T15:00:00Z' },
    { id: 'opportunity-watch', name: 'Opportunity Watch', state: 'working', current_work: 'Eligibility verification', last_seen_at: '2026-09-21T14:59:20Z' },
    { id: 'document-knowledge', name: 'Document & Knowledge', state: 'completed', current_work: 'Evidence pack', last_seen_at: '2026-09-21T14:57:10Z' },
    { id: 'bid-partnerships', name: 'Bid & Partnerships', state: 'waiting', current_work: 'Waiting for prime evidence', last_seen_at: '2026-09-21T14:56:00Z' },
    { id: 'assurance-reviewer', name: 'Independent Assurance', state: 'blocked', current_work: 'Prime eligibility blocker', last_seen_at: '2026-09-21T14:55:00Z' }
  ],
  activity: [
    { id: 'evt-3', agent_name: 'Independent Assurance', event_type: 'blocker_found', summary: 'Premium Moodle Partner evidence not verified', created_at: '2026-09-21T14:55:00Z' },
    { id: 'evt-2', agent_name: 'Document & Knowledge', event_type: 'artifact_created', summary: 'Evidence pack completed', created_at: '2026-09-21T14:54:00Z' },
    { id: 'evt-1', agent_name: 'Opportunity Watch', event_type: 'qualification_completed', summary: 'Eligibility gate completed', created_at: '2026-09-21T14:52:00Z' }
  ]
};

const runs = {
  runs: [
    { id: 'run-1', title: 'UNICEF Agora RFPS 503950', status: 'blocked', progress: 68, started_at: '2026-09-21T14:30:00Z', updated_at: '2026-09-21T14:55:00Z', current_agent: 'Independent Assurance', blockers: 1, artifacts: 4 }
  ]
};

const decisions = {
  decisions: [
    { id: 'decision-1', title: 'UNICEF prime-partner route', status: 'open', priority: 'high', recommendation: 'Continue only until partner gate', due_at: '2026-09-23T14:00:00Z' }
  ]
};

async function mockJson(page, pattern, body, status = 200) {
  await page.route(pattern, route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }));
}

async function installMocks(page, options = {}) {
  const overviewStatus = options.overviewStatus || 200;
  const agentsStatus = options.agentsStatus || 200;
  await mockJson(page, '**/auth/session', { authenticated: true, user: { name: 'Jacob Odur', email: 'jacob@example.com' } });
  await mockJson(page, '**/api/overview', overviewStatus === 200 ? overview : { error: 'overview unavailable' }, overviewStatus);
  await mockJson(page, '**/api/agents/overview', agentsStatus === 200 ? agents : { error: 'agent telemetry unavailable' }, agentsStatus);
  await mockJson(page, '**/api/agents/runs*', runs);
  await mockJson(page, '**/api/agents/decisions*', decisions);
  await mockJson(page, '**/api/work/today*', { priorities: [
    { id: 'w1', title: 'Resolve LendFlow queue', priority: 'critical', estimated_minutes: 30, project_name: 'LendFlow', due_at: '2026-09-21T17:00:00Z' },
    { id: 'w2', title: 'Review UNICEF partner gate', priority: 'high', estimated_minutes: 25, project_name: 'Opportunities', due_at: '2026-09-23T14:00:00Z' }
  ]});
  await mockJson(page, '**/api/work/projects', { projects: [
    { id: 'impactos', name: 'ImpactOS', total_tasks: 20, completed_tasks: 14, open_tasks: 6 },
    { id: 'bds', name: 'Tuku BDS', total_tasks: 12, completed_tasks: 9, open_tasks: 3 }
  ]});
  await mockJson(page, '**/api/crm/clients', { clients: [] });
  await mockJson(page, '**/api/work/items*', { items: [] });
  await mockJson(page, '**/api/calendar/events*', { events: [
    { id: 'e1', title: 'UNICEF partner gate', date: '2026-09-23', starts_at: '2026-09-23T14:00:00Z', done: false, project: 'Opportunities' },
    { id: 'e2', title: 'Finance review', date: '2026-09-24', starts_at: '2026-09-24T09:00:00Z', done: false, project: 'Finance' }
  ]});
  await mockJson(page, '**/api/accounts*', { totals: { active7d: 126, totalAccounts: 184 } });
}

test('command center is glanceable, data-grounded and produces a visual evidence artifact', async ({ page }, testInfo) => {
  await installMocks(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /JakeOS Command Center/i })).toBeVisible();
  await expect(page.getByTestId('kpi-active-agents')).toContainText('3');
  await expect(page.getByTestId('kpi-open-work')).toContainText('48');
  await expect(page.getByTestId('kpi-opportunities')).toContainText('23');
  await expect(page.getByTestId('panel-agent-command-center')).toBeVisible();
  await expect(page.getByTestId('panel-opportunity-pipeline')).toBeVisible();
  await expect(page.getByTestId('panel-work-execution')).toBeVisible();
  await expect(page.getByTestId('panel-estate-health')).toBeVisible();
  await expect(page.getByTestId('panel-financial-overview')).toBeVisible();
  await expect(page.getByTestId('panel-alerts-decisions')).toBeVisible();
  await expect(page.getByTestId('panel-live-activity')).toBeVisible();
  await expect(page.getByTestId('panel-upcoming-milestones')).toBeVisible();

  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toMatch(/NaN|undefined|Infinity/);

  await page.screenshot({ path: testInfo.outputPath('command-center-success.png'), fullPage: true });
});

test('agents view shows canonical states, live work, blockers, runs and decisions', async ({ page }) => {
  await installMocks(page);
  await page.goto('/');
  await page.getByRole('button', { name: /^Agents$/ }).click();

  await expect(page.getByRole('heading', { name: /Agent Command Center/i })).toBeVisible();
  await expect(page.getByText('Command Orchestrator')).toBeVisible();
  await expect(page.getByText('Independent Assurance')).toBeVisible();
  await expect(page.getByText('UNICEF Agora RFPS 503950')).toBeVisible();
  await expect(page.getByText('Premium Moodle Partner evidence not verified')).toBeVisible();
  await expect(page.getByText('UNICEF prime-partner route')).toBeVisible();
});

test('partial API failure degrades locally instead of blanking the whole command center', async ({ page }) => {
  await installMocks(page, { agentsStatus: 503 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /JakeOS Command Center/i })).toBeVisible();
  await expect(page.getByTestId('kpi-open-work')).toContainText('48');
  await expect(page.getByTestId('panel-agent-command-center')).toContainText(/unavailable|not connected|No agent telemetry/i);
  await expect(page.getByTestId('panel-opportunity-pipeline')).toBeVisible();
});

test('mobile command center has no page-level horizontal overflow and keeps core signals visible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMocks(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /JakeOS Command Center/i })).toBeVisible();
  await expect(page.getByTestId('kpi-open-work')).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await expect(page.getByRole('button', { name: /^Agents$/ })).toBeVisible();
});

test('critical and degraded states remain explicit and accessible', async ({ page }) => {
  await installMocks(page);
  await page.goto('/');

  await expect(page.getByText('LendFlow servicing queue needs review')).toBeVisible();
  await expect(page.getByText('Radar')).toBeVisible();
  await expect(page.getByText(/Down|Degraded/).first()).toBeVisible();
  await expect(page.getByTestId('panel-alerts-decisions')).toHaveAttribute('aria-label', /alerts and decisions/i);
});
