const { test, expect } = require('@playwright/test');

test.skip(process.env.E2E_FULL_STACK !== '1', 'Full-stack run is executed by the dedicated CI job.');

const browserToken = process.env.JAKEOS_TEST_AUTH_TOKEN || 'ci_jakeos_token';
const connectorToken = process.env.JAKEOS_AGENT_CONNECTOR_TOKEN || 'ci_agent_connector_token';
const connectorHeaders = { Authorization: 'Bearer ' + connectorToken, 'Content-Type': 'application/json' };

async function connectorPost(request, path, data) {
  const response = await request.post(path, { headers: connectorHeaders, data });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test('real Agent OS telemetry reaches authenticated JakeOS UI and streams live evidence', async ({ page, request }, testInfo) => {
  const unique = 'r' + testInfo.retry + '-w' + testInfo.workerIndex + '-' + Date.now();
  const runId = 'e2e-agent-run-' + unique;
  const capabilities = await request.get('/api/connectors/v1/agents/capabilities', { headers: { Authorization: 'Bearer ' + connectorToken } });
  expect(capabilities.ok()).toBeTruthy();
  const capabilityBody = await capabilities.json();
  expect(capabilityBody.delete).toBe(false);
  expect(capabilityBody.scopes).toEqual(['agents:read', 'agents:write']);

  const forbidden = await request.get('/api/projects', { headers: { Authorization: 'Bearer ' + connectorToken } });
  expect(forbidden.status()).toBe(401);

  await connectorPost(request, '/api/connectors/v1/agents/runs', {
    id: runId,
    title: 'UNICEF Agora RFPS 503950',
    status: 'in_progress',
    progress: 62,
    context_type: 'opportunity',
    context_ref: 'RFPS-503950',
    current_agent: 'command-orchestrator',
    blockers_count: 0,
    evidence_required: true,
    started_at: '2026-09-21T14:30:00Z'
  });

  await connectorPost(request, '/api/connectors/v1/agents/events', {
    id: 'e2e-event-command-' + unique,
    run_id: runId,
    agent_id: 'command-orchestrator',
    agent_name: 'Command Orchestrator',
    event_type: 'run_started',
    state: 'working',
    summary: 'Delegated UNICEF qualification and evidence work',
    event_at: '2026-09-21T14:31:00Z',
    dedupe_key: 'e2e-command-start-' + unique
  });

  const firstEvent = await connectorPost(request, '/api/connectors/v1/agents/events', {
    id: 'e2e-event-watch-' + unique,
    run_id: runId,
    agent_id: 'opportunity-watch',
    agent_name: 'Opportunity Watch',
    event_type: 'qualification_completed',
    state: 'working',
    summary: 'Eligibility gate completed',
    event_at: '2026-09-21T14:34:00Z',
    dedupe_key: 'e2e-watch-qualified-' + unique
  });
  expect(firstEvent.replayed).toBe(false);

  const replay = await connectorPost(request, '/api/connectors/v1/agents/events', {
    run_id: runId,
    agent_id: 'opportunity-watch',
    agent_name: 'Opportunity Watch',
    event_type: 'qualification_completed',
    state: 'working',
    summary: 'Eligibility gate completed',
    event_at: '2026-09-21T14:34:00Z',
    dedupe_key: 'e2e-watch-qualified-' + unique
  });
  expect(replay.replayed).toBe(true);

  await connectorPost(request, '/api/connectors/v1/agents/artifacts', {
    id: 'e2e-artifact-evidence-' + unique,
    run_id: runId,
    agent_id: 'document-knowledge',
    name: 'Evidence pack',
    artifact_type: 'evidence',
    evidence_kind: 'document',
    uri: 'github://thatlango/tuku-agent-os/work/e2e/evidence.md'
  });

  await connectorPost(request, '/api/connectors/v1/agents/decisions', {
    id: 'e2e-decision-prime-' + unique,
    run_id: runId,
    title: 'UNICEF prime-partner route',
    status: 'open',
    priority: 'high',
    recommendation: 'Continue only until partner gate',
    options: ['Conditional pursuit', 'No-bid'],
    due_at: '2026-09-23T14:00:00Z'
  });

  await page.setExtraHTTPHeaders({ Authorization: 'Bearer ' + browserToken });
  await page.goto('/?module=agents');

  await expect(page.getByRole('heading', { name: 'Agent Command Center' })).toBeVisible();
  await expect(page.getByText('Command Orchestrator').first()).toBeVisible();
  await expect(page.getByText('UNICEF Agora RFPS 503950').first()).toBeVisible();
  await expect(page.getByText('UNICEF prime-partner route').first()).toBeVisible();

  await connectorPost(request, '/api/connectors/v1/agents/events', {
    id: 'e2e-event-assurance-' + unique,
    run_id: runId,
    agent_id: 'assurance-reviewer',
    agent_name: 'Independent Assurance',
    event_type: 'blocker_found',
    state: 'blocked',
    summary: 'Premium Moodle Partner evidence not verified',
    event_at: new Date().toISOString(),
    dedupe_key: 'e2e-assurance-blocker-' + unique
  });

  await expect(page.getByText('Premium Moodle Partner evidence not verified').first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Independent Assurance').first()).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath('agent-command-center-full-stack.png'), fullPage: true });

  await page.getByRole('button', { name: 'Dashboard' }).click();
  await expect(page.getByRole('heading', { name: 'JakeOS Command Center' })).toBeVisible();
  await expect(page.getByTestId('kpi-active-agents')).not.toContainText('—');
  await page.screenshot({ path: testInfo.outputPath('jakeos-command-center-full-stack.png'), fullPage: true });
});
