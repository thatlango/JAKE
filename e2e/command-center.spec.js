const { test, expect } = require('@playwright/test');

const overview = {
  tasks: { open: 48 },
  pipeline: { active: 23, active_value_usd: 148000 },
  estate: { totals: { activeUsers7d: 126 } }
};

const agents = {
  totals: { active: 3, queued: 1, blocked: 1, stale: 0, success_rate: 92, avg_completion_minutes: 38, decisions_open: 2, registered: 23 },
  agents: [
    { id: 'command-orchestrator', name: 'Command Orchestrator', group: 'Command', state: 'working', current_work: 'UNICEF Agora RFPS 503950', last_seen_at: '2026-09-21T15:00:00Z' },
    { id: 'opportunity-watch', name: 'Opportunity Watch', group: 'Revenue', state: 'working', current_work: 'Eligibility verification', last_seen_at: '2026-09-21T14:59:20Z' },
    { id: 'document-knowledge', name: 'Document & Knowledge', group: 'Revenue', state: 'completed', current_work: 'Evidence pack', last_seen_at: '2026-09-21T14:57:10Z' },
    { id: 'bid-partnerships', name: 'Bid & Partnerships', group: 'Revenue', state: 'waiting', current_work: 'Waiting for prime evidence', last_seen_at: '2026-09-21T14:56:00Z' },
    { id: 'assurance-reviewer', name: 'Independent Assurance', group: 'Assurance', state: 'blocked', current_work: 'Prime eligibility blocker', last_seen_at: '2026-09-21T14:55:00Z' }
  ],
  activity: [
    { id: 'evt-3', agent_name: 'Independent Assurance', event_type: 'blocker_found', state: 'blocked', summary: 'Premium Moodle Partner evidence not verified', created_at: '2026-09-21T14:55:00Z' },
    { id: 'evt-2', agent_name: 'Document & Knowledge', event_type: 'artifact_created', state: 'completed', summary: 'Evidence pack completed', created_at: '2026-09-21T14:54:00Z' }
  ]
};

const runs = {
  runs: [
    { id: 'run-1', title: 'UNICEF Agora RFPS 503950', status: 'blocked', progress: 68, current_agent: 'Independent Assurance', blockers_count: 1, artifacts: 4 }
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
  const agentsStatus = options.agentsStatus || 200;
  await mockJson(page, '**/auth/session', { authenticated: true, user: { name: 'Jacob Odur', email: 'jacob@example.com' } });
  await mockJson(page, '**/api/overview', overview);
  await mockJson(page, '**/api/agents/overview', agentsStatus === 200 ? agents : { error: 'agent telemetry unavailable' }, agentsStatus);
  await mockJson(page, '**/api/agents/runs*', runs);
  await mockJson(page, '**/api/agents/decisions*', decisions);
  await mockJson(page, '**/api/agents/work*', { dispatches: [] });
  await mockJson(page, '**/api/work/today*', { priorities: [
    { id: 'w1', title: 'Resolve LendFlow queue', priority: 'critical', estimated_minutes: 30, project_name: 'LendFlow', due_at: '2026-09-21T17:00:00Z' }
  ]});
  await mockJson(page, '**/api/work/projects', { projects: [
    { id: 'impactos', name: 'ImpactOS', total_tasks: 20, completed_tasks: 14, open_tasks: 6 }
  ]});
  await mockJson(page, '**/api/crm/clients', { clients: [] });
  await mockJson(page, '**/api/work/items*', { items: [] });
  await mockJson(page, '**/api/calendar/events*', { events: [] });
  await mockJson(page, '**/api/accounts*', { totals: { active7d: 126, totalAccounts: 184 } });
}

test('existing JakeOS dashboard UI remains unchanged by the Agents feature', async ({ page }, testInfo) => {
  await installMocks(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Plan, prioritise, and move the right work forward with clarity.')).toBeVisible();
  await expect(page.getByText('Open work')).toBeVisible();
  await expect(page.getByText('Active pipeline')).toBeVisible();
  await expect(page.getByText('Upcoming events')).toBeVisible();
  await expect(page.getByText('Active accounts')).toBeVisible();
  await expect(page.getByText('Focus now')).toBeVisible();
  await expect(page.getByText('Priority queue')).toBeVisible();

  await expect(page.getByRole('heading', { name: 'JakeOS Command Center' })).toHaveCount(0);
  await expect(page.getByText('Agent Command Center')).toHaveCount(0);

  await page.screenshot({ path: testInfo.outputPath('dashboard-preserved.png'), fullPage: true });
});

async function openAgents(page) {
  const agents = page.getByRole('button', { name: /^Agents$/ });
  if (await agents.count()) {
    await agents.first().click();
    return;
  }
  await page.getByRole('button', { name: /^More$/ }).click();
  await page.getByRole('button', { name: /^Agents$/ }).click();
}

test('Agents is an additive section with live states, runs and decisions', async ({ page }) => {
  await installMocks(page);
  await page.goto('/');
  await openAgents(page);

  await expect(page.getByRole('heading', { name: 'Agents' })).toBeVisible();
  await expect(page.getByText('Command Orchestrator').first()).toBeVisible();
  await expect(page.getByText('Independent Assurance').first()).toBeVisible();
  await expect(page.getByText('UNICEF Agora RFPS 503950').first()).toBeVisible();
  await expect(page.getByText('Premium Moodle Partner evidence not verified').first()).toBeVisible();
  await expect(page.getByText('UNICEF prime-partner route').first()).toBeVisible();
});

test('agent API failure stays inside the Agents section', async ({ page }) => {
  await installMocks(page, { agentsStatus: 503 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await openAgents(page);
  await expect(page.getByRole('heading', { name: 'Agents' })).toBeVisible();
  await expect(page.getByText('Agent telemetry unavailable', { exact: true }).first()).toBeVisible();
});

test('mobile keeps the original primary navigation and exposes Agents under More', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMocks(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Home$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Work$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Projects$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Estate$/ })).toBeVisible();

  await page.getByRole('button', { name: /^More$/ }).click();
  await expect(page.getByRole('button', { name: /^Agents$/ })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
