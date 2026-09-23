const { test, expect } = require('@playwright/test');

const overview = {
  tasks: { open: 48, inbox: 20, doing: 4, overdue: 3, blocked: 2, completed_this_week: 9 },
  pipeline: { active: 23, active_value_usd: 148000, deadlines_14d: 4 },
  invoices: { receivables: 3, receivables_value: 18400, overdue_count: 1, overdue_value: 4200 },
  finance: { confirmed_usd: 52000, pending_usd: 18000, projected_usd: 90000, monthly_costs_usd: 12000 },
  attention_signals: [
    { id: 'sig-1', signal_type: 'decision', title: 'Approve ImpactOS demo release', summary: 'Release is ready for executive approval', severity: 'high', action_url: '/?module=work' },
    { id: 'sig-2', signal_type: 'operations', title: 'PRUDEV BCP endpoint degraded', summary: 'Availability check needs remediation', severity: 'critical', action_url: '/?module=operations' }
  ],
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
  await mockJson(page, '**/api/work/day', {
    timezone: 'Africa/Kampala',
    workday: { starts_at: '07:30', ends_at: '18:30' },
    do_now: { kind: 'task', id: 'w1', task_id: 'w1', title: 'Finish LendFlow production cutover', subtitle: 'LendFlow', starts_at: '2026-09-23T14:00:00Z', ends_at: '2026-09-23T15:00:00Z', block_title: 'Deep work', minutes_remaining: 42 },
    up_next: { kind: 'event', id: 'ev1', title: 'Client demo prep', subtitle: 'ImpactOS', starts_at: '2026-09-23T15:15:00Z', ends_at: '2026-09-23T16:00:00Z' },
    current_block: { kind: 'block', id: 'block-1', title: 'Deep work', starts_at: '2026-09-23T14:00:00Z', ends_at: '2026-09-23T16:30:00Z' },
    timeline: []
  });
  await mockJson(page, '**/api/work/today*', { priorities: [
    { id: 'w1', title: 'Finish LendFlow production cutover', status: 'doing', priority: 'critical', estimated_minutes: 30, project_name: 'LendFlow', due_at: '2026-09-23T17:00:00Z', metadata: { outcome_type: 'delivery', completion_definition: 'Production smoke test passes' } },
    { id: 'w2', title: 'Approve consultant network launch copy', status: 'waiting', priority: 'high', estimated_minutes: 15, project_name: 'Tuku-Tuku', metadata: { outcome_type: 'decision', decision_required: true } }
  ]});
  await mockJson(page, '**/api/work/projects', { projects: [
    { id: 'impactos', name: 'ImpactOS', total_tasks: 20, completed_tasks: 14, open_tasks: 6 }
  ]});
  await mockJson(page, '**/api/crm/clients', { clients: [] });
  await mockJson(page, '**/api/work/items*', { items: [
    { id: 'w1', title: 'Finish LendFlow production cutover', status: 'doing', priority: 'critical', project_name: 'LendFlow', updated_at: '2026-09-22T10:00:00Z', metadata: { outcome_type: 'delivery', completion_definition: 'Production smoke test passes' } },
    { id: 'w2', title: 'Approve consultant network launch copy', status: 'waiting', priority: 'high', project_name: 'Tuku-Tuku', updated_at: '2026-09-22T11:00:00Z', metadata: { outcome_type: 'decision', decision_required: true } },
    { id: 'w3', title: 'Submit UNICEF regional evidence application', status: 'ready', priority: 'high', project_name: 'Business development', tags: ['market','proposal'], updated_at: '2026-09-22T09:00:00Z', metadata: { outcome_type: 'market', market_stage: 'submit', completion_definition: 'Submission receipt saved' } },
    { id: 'w4', title: 'Rewrite internal notes', status: 'inbox', priority: 'low', project_name: 'Admin', created_at: '2026-09-01T09:00:00Z', updated_at: '2026-09-01T09:00:00Z', metadata: { outcome_type: 'internal' } },
    { id: 'w5', title: 'Review agent evidence pack', status: 'waiting', priority: 'high', project_name: 'Bid', agent_name: 'Document & Knowledge', agent_state: 'review', updated_at: '2026-09-22T12:00:00Z', metadata: { outcome_type: 'market', market_stage: 'bid' } }
  ] });
  await mockJson(page, '**/api/calendar/events*', { events: [] });
  await mockJson(page, '**/api/opportunities*', { summary: { active: 3, due14: 2, submitted: 1, won: 0 }, opportunities: [
    { id: 'o1', title: 'UNICEF Regional Evidence Compendium', org: 'UNICEF', stage: 'Drafting', fit_score: 4.5, deadline: '2026-09-25T17:00:00Z', next_action: 'Finish technical response', value_amount: 35000, currency: 'USD' },
    { id: 'o2', title: 'Warehouse management assignment', org: 'DRC', stage: 'Pursuing', fit_score: 4, deadline: '2026-09-28T17:00:00Z', next_action: 'Close eligibility gaps', value_amount: 18000, currency: 'USD' },
    { id: 'o3', title: 'Long-shot challenge', org: 'Other', stage: 'Watching', fit_score: 1, deadline: null, next_action: '' }
  ], watches: [], proposals: [], sources: [] });
  await mockJson(page, '**/api/accounts*', { totals: { active7d: 126, totalAccounts: 184 } });
}

test('Executive home is organized around decisions, market movement and verified completion', async ({ page }, testInfo) => {
  await installMocks(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Executive', exact: true })).toBeVisible();
  await expect(page.getByText('Decide what matters. Move it to market. Finish before starting more.')).toBeVisible();
  await expect(page.getByText('Do now')).toBeVisible();
  await expect(page.getByText('Up next')).toBeVisible();
  await expect(page.getByText('Operating pulse')).toBeVisible();
  await expect(page.getByText('Deep work').first()).toBeVisible();
  await expect(page.getByText('Client demo prep')).toBeVisible();
  await expect(page.getByText('Decisions waiting')).toBeVisible();
  await expect(page.getByText('Market moves')).toBeVisible();
  await expect(page.getByText('Completed this week')).toBeVisible();
  await expect(page.getByText('Cash to collect')).toBeVisible();
  await expect(page.getByText('Decide now')).toBeVisible();
  await expect(page.getByText('Move to market')).toBeVisible();
  await expect(page.getByText('Finish what is started')).toBeVisible();
  await expect(page.getByText('Delegated engine')).toBeVisible();
  await expect(page.getByText('Backlog drag')).toBeVisible();
  await expect(page.getByText('Critical exceptions')).toBeVisible();
  await expect(page.getByText('PRUDEV BCP endpoint degraded')).toBeVisible();
  await expect(page.getByText('Review agent evidence pack')).toHaveCount(2);
  await expect(page.getByText('Review agent evidence pack').first()).toBeVisible();
  await expect(page.getByText('UNICEF Regional Evidence Compendium')).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath('executive-home.png'), fullPage: true });
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

  await expect(page.getByRole('heading', { name: 'Executive', exact: true })).toBeVisible();
  await openAgents(page);
  await expect(page.getByRole('heading', { name: 'Agents' })).toBeVisible();
  await expect(page.getByText('Agent telemetry unavailable', { exact: true }).first()).toBeVisible();
});

test('mobile keeps the original primary navigation and exposes Agents under More', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMocks(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Executive', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Home$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Work$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Projects$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Estate$/ })).toBeVisible();

  await page.getByRole('button', { name: /^More$/ }).click();
  await expect(page.locator('.more-menu').getByRole('button', { name: /^Agents$/ })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});


test('Work captures outcome, completion, market and delegation intent', async ({ page }) => {
  await installMocks(page);
  await page.goto('/');
  await page.getByRole('button', { name: /^Work$/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Work' })).toBeVisible();
  await page.getByRole('button', { name: 'New task' }).click();

  await expect(page.getByLabel('Definition of done')).toBeVisible();
  await expect(page.getByLabel('Outcome')).toBeVisible();
  await expect(page.getByLabel('Market stage')).toBeVisible();
  await expect(page.getByLabel('Execution mode')).toBeVisible();
  await expect(page.getByLabel('Completion evidence')).toBeVisible();
  await expect(page.getByText('This requires an executive decision from me')).toBeVisible();

  await page.getByLabel('Outcome').selectOption('market');
  await page.getByLabel('Market stage').selectOption('submit');
  await page.getByLabel('Execution mode').selectOption('agent');
  await page.getByLabel('Definition of done').fill('Submission receipt saved');
  await page.getByLabel('Completion evidence').fill('Receipt URL');
  await page.getByText('This requires an executive decision from me').click();

  await expect(page.getByLabel('Outcome')).toHaveValue('market');
  await expect(page.getByLabel('Market stage')).toHaveValue('submit');
  await expect(page.getByLabel('Execution mode')).toHaveValue('agent');
});
