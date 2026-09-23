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

  await expect(page.getByRole('heading', { name: 'Agents' })).toBeVisible();
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

  await page.getByRole('button', { name: 'Executive', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Executive', exact: true })).toBeVisible();
  await expect(page.getByText('Know what to do now. Make the decisions only you can make. Move work to market and closure.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('jakeos-command-center-full-stack.png'), fullPage: true });
});

test('Jake delegation stays in the canonical Work queue through claim, review, revision and acceptance', async ({ page, request }, testInfo) => {
  const unique = 'delegate-' + testInfo.retry + '-' + testInfo.workerIndex + '-' + Date.now();
  const userHeaders = { Authorization: 'Bearer ' + browserToken, 'Content-Type': 'application/json' };

  const first = await request.post('/api/jake/delegate', {
    headers: userHeaders,
    data: {
      request_id: unique,
      request: 'Draft a concise two-paragraph concept note for a youth entrepreneurship bootcamp in Northern Uganda.',
      module: 'work'
    }
  });
  expect(first.status(), await first.text()).toBe(201);
  const delegated = await first.json();
  expect(delegated.work?.id).toBeTruthy();
  expect(delegated.dispatch?.id).toBeTruthy();
  expect(delegated.dispatch.state).toBe('queued');
  expect(delegated.dispatch.requested_agent_id).toBe('document-knowledge');

  const replay = await request.post('/api/jake/delegate', {
    headers: userHeaders,
    data: {
      request_id: unique,
      request: 'Draft a concise two-paragraph concept note for a youth entrepreneurship bootcamp in Northern Uganda.',
      module: 'work'
    }
  });
  expect(replay.ok()).toBeTruthy();
  const replayBody = await replay.json();
  expect(replayBody.replayed).toBe(true);
  expect(replayBody.work.id).toBe(delegated.work.id);
  expect(replayBody.dispatch.id).toBe(delegated.dispatch.id);

  const forbidden = await request.get('/api/work/items?limit=5', {
    headers: { Authorization: 'Bearer ' + connectorToken }
  });
  expect(forbidden.status()).toBe(401);

  const queue = await request.get('/api/connectors/v1/agents/work?state=queued&limit=50', {
    headers: { Authorization: 'Bearer ' + connectorToken }
  });
  expect(queue.ok(), await queue.text()).toBeTruthy();
  const queueBody = await queue.json();
  const queued = queueBody.dispatches.find(item => item.id === delegated.dispatch.id);
  expect(queued).toBeTruthy();
  expect(queued.work_item_id).toBe(delegated.work.id);
  expect(queued.request_text).toContain('concept note');

  const claim = await connectorPost(request, '/api/connectors/v1/agents/work/' + encodeURIComponent(delegated.dispatch.id) + '/claim', {
    executor_id: 'e2e-agent-worker',
    lease_seconds: 300
  });
  expect(claim.dispatch.state).toBe('working');
  expect(claim.dispatch.executor_id).toBe('e2e-agent-worker');

  const duplicateClaim = await request.post('/api/connectors/v1/agents/work/' + encodeURIComponent(delegated.dispatch.id) + '/claim', {
    headers: connectorHeaders,
    data: { executor_id: 'second-worker', lease_seconds: 300 }
  });
  expect(duplicateClaim.status()).toBe(409);

  const resultText = 'Youth Enterprise Bootcamp\n\nThe programme will equip young entrepreneurs with practical business skills, market access and guided venture development.\n\nDelivery will combine structured bootcamps, coaching and evidence-based follow-up.';
  const result = await connectorPost(request, '/api/connectors/v1/agents/work/' + encodeURIComponent(delegated.dispatch.id) + '/result', {
    executor_id: 'e2e-agent-worker',
    status: 'review',
    summary: 'Concept note draft ready for review.',
    result_content: resultText,
    artifact_uri: 'jakeos://work/' + delegated.work.id + '/deliverable'
  });
  expect(result.dispatch.state).toBe('review');
  expect(result.work.status).toBe('waiting');

  const workDetail = await request.get('/api/work/items/' + encodeURIComponent(delegated.work.id), { headers: { Authorization: 'Bearer ' + browserToken } });
  expect(workDetail.ok()).toBeTruthy();
  const workBody = await workDetail.json();
  expect(workBody.item.agent_state).toBe('review');
  expect(workBody.item.agent_name).toBe('Document & Knowledge');
  expect(workBody.agent_dispatch.result_content).toContain('Youth Enterprise Bootcamp');

  await page.setExtraHTTPHeaders({ Authorization: 'Bearer ' + browserToken });
  await page.goto('/?module=work');
  await expect(page.getByText(delegated.work.title).first()).toBeVisible();
  await expect(page.getByText(/Document & Knowledge/i).first()).toBeVisible();
  await expect(page.getByText(/Review/i).first()).toBeVisible();

  const revise = await request.post('/api/work/items/' + encodeURIComponent(delegated.work.id) + '/agent/revise', {
    headers: userHeaders,
    data: { feedback: 'Add a short paragraph on graduation pitches and post-bootcamp coaching.' }
  });
  expect(revise.ok(), await revise.text()).toBeTruthy();
  const reviseBody = await revise.json();
  expect(reviseBody.dispatch.state).toBe('queued');
  expect(reviseBody.work.status).toBe('ready');

  const reclaim = await connectorPost(request, '/api/connectors/v1/agents/work/' + encodeURIComponent(delegated.dispatch.id) + '/claim', {
    executor_id: 'e2e-agent-worker',
    lease_seconds: 300
  });
  expect(reclaim.dispatch.state).toBe('working');

  const revisedText = resultText + '\n\nGraduation will culminate in pitch sessions, followed by structured coaching to support implementation and early growth.';
  const revisedResult = await connectorPost(request, '/api/connectors/v1/agents/work/' + encodeURIComponent(delegated.dispatch.id) + '/result', {
    executor_id: 'e2e-agent-worker',
    status: 'review',
    summary: 'Revised concept note ready.',
    result_content: revisedText
  });
  expect(revisedResult.dispatch.state).toBe('review');
  expect(revisedResult.work.status).toBe('waiting');

  const accept = await request.post('/api/work/items/' + encodeURIComponent(delegated.work.id) + '/agent/accept', {
    headers: userHeaders,
    data: {}
  });
  expect(accept.ok(), await accept.text()).toBeTruthy();
  const accepted = await accept.json();
  expect(accepted.dispatch.state).toBe('completed');
  expect(accepted.work.status).toBe('done');

  await page.goto('/');
  await page.getByTitle(/Ask Jake/i).click();
  const jakePanel = page.getByLabel('Ask Jake');
  await expect(jakePanel.getByRole('button', { name: 'Agents', exact: true })).toBeVisible();
  await jakePanel.getByRole('button', { name: 'Agents', exact: true }).click();
  const input = jakePanel.getByPlaceholder(/Describe the work to delegate/i);
  await input.fill('Draft a one-page partner briefing note for a donor meeting.');
  await jakePanel.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText(/added to Work/i).first()).toBeVisible({ timeout: 10000 });

  await page.screenshot({ path: testInfo.outputPath('jake-agent-work-bridge.png'), fullPage: true });
});
