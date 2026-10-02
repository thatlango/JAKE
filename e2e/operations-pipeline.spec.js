const { test, expect } = require('@playwright/test');

const operations = {
  status: 'degraded',
  score: 84,
  generatedAt: '2026-10-02T09:45:00Z',
  summary: { servicesHealthy: 2, servicesTotal: 3, domainsAttention: 1, criticalSignals: 2 },
  attention: [
    { id: 'ecitaa-sync', title: 'ECITAA sync backlog', summary: '27 records failing sync', severity: 'critical', product: 'ECITAA', action_url: '/?module=work' }
  ],
  services: [
    { id: 'impactos', name: 'ImpactOS', product: 'ImpactOS', last_status: 200, last_latency_ms: 164, consecutive_failures: 0, last_checked_at: '2026-10-02T09:44:00Z', tls_expires_at: '2026-12-20T00:00:00Z' },
    { id: 'prudev', name: 'PRUDEV BCP', product: 'PRUDEV', last_status: 503, last_latency_ms: 980, consecutive_failures: 3, last_checked_at: '2026-10-02T09:44:00Z', tls_expires_at: '2026-12-20T00:00:00Z' },
    { id: 'kela', name: 'Kela', product: 'Kela', last_status: 200, last_latency_ms: 211, consecutive_failures: 0, last_checked_at: '2026-10-02T09:44:00Z', tls_expires_at: '2026-10-18T00:00:00Z' }
  ],
  domains: [
    { kind: 'registrable', root_domain: 'tukutuku.org', host: 'tukutuku.org', status: 'warning', expires_at: '2026-10-24T00:00:00Z', tls_expires_at: '2026-12-20T00:00:00Z', registrar: 'Registry' }
  ],
  hosts: [
    {
      label: 'Production VPS', hostname: 'tuku-vps', cpu_percent: 34, memory_percent: 61, disk_percent: 52, uptime_seconds: 691200, captured_at: '2026-10-02T09:44:00Z', load1: 0.72,
      snapshot: {
        containers: [{ name: 'tukubds-web', status: 'restarting', health: 'unhealthy', running: true }],
        platform: {
          status: { severity: 'healthy', checked_at: '2026-10-02T09:44:00Z' },
          workers: { severity: 'warning', reasons: ['Queue depth above baseline'], checked_at: '2026-10-02T09:44:00Z' },
          databases: { severity: 'healthy', databases: ['jakeos'], checked_at: '2026-10-02T09:44:00Z' },
          security: { severity: 'healthy', checked_at: '2026-10-02T09:44:00Z' },
          offsiteBackup: { state: 'healthy', checked_at: '2026-10-02T09:44:00Z' },
          restore: { ok: true, finished_at: '2026-10-01T20:00:00Z' }
        }
      }
    }
  ]
};

async function installMocks(page) {
  await page.route('**/auth/session', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, user: { name: 'Jacob Odur', email: 'jacob@example.com' } }) }));
  await page.route('**/api/ops/overview', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(operations) }));
  await page.route('**/api/ops/refresh*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
}

test('Operations opens to the live pipeline board and preserves Health', async ({ page }, testInfo) => {
  await installMocks(page);
  await page.goto('/?module=operations');

  await expect(page.getByRole('heading', { name: 'Operations Pipeline' })).toBeVisible();
  const stageLabels = page.locator('.op-column > header strong');
  for (const label of ['Needs attention', 'Ready to act', 'In progress', 'Waiting', 'Monitoring']) {
    await expect(stageLabels.filter({ hasText: label })).toBeVisible();
  }
  await expect(page.getByText('ECITAA sync backlog')).toBeVisible();
  await expect(page.getByText('PRUDEV BCP').first()).toBeVisible();
  await expect(page.getByText('tukutuku.org')).toBeVisible();
  await expect(page.getByText('Recent outcomes')).toBeVisible();

  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: 'Work item' })).toBeVisible();
  await expect(page.getByRole('cell', { name: /ECITAA sync backlog/ })).toBeVisible();

  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Scheduled' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Continuous controls' })).toBeVisible();

  await page.getByRole('button', { name: 'Health', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Infrastructure & continuity' })).toBeVisible();
  await expect(page.getByText('Production VPS').first()).toBeVisible();
  await expect(page.getByText('Platform signals')).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath('operations-pipeline.png'), fullPage: true });
});

test('Operations pipeline remains usable at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installMocks(page);
  await page.goto('/?module=operations');

  await expect(page.getByRole('heading', { name: 'Operations Pipeline' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New work item' })).toBeVisible();
  await expect(page.locator('.op-board')).toBeVisible();
  const board = page.locator('.op-board');
  expect(await board.evaluate(el => el.scrollWidth > el.clientWidth)).toBeTruthy();

  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: 'Readiness' })).toBeVisible();
});
