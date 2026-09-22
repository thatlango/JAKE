const { test, expect } = require('@playwright/test');

async function mockJson(page, pattern, body, status = 200) {
  await page.route(pattern, route => route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  }));
}

async function installEstateMocks(page, searchStatus) {
  await mockJson(page, '**/auth/session', {
    authenticated: true,
    user: { name: 'Jacob Odur', email: 'jacob@example.com' }
  });

  await mockJson(page, '**/api/estate', {
    configured: true,
    available: true,
    stale: false,
    snapshot: {
      products: [
        { code: 'impactos', name: 'ImpactOS', activeUsers7d: 12, activeUsers30d: 18, newUsers7d: 2, growth7dPercent: 8.2, lastActivityAt: '2026-09-22T06:00:00Z', domainKpis: {} }
      ],
      usageTrend: [],
      commerce: [],
      telemetry: [],
      totals: { activeUsers24h: 5, activeUsers7d: 12, ordersActive: 0, ordersCompleted: 0, realizedRevenueUGX: 0, pendingRevenueUGX: 0 },
      generatedAt: '2026-09-22T06:00:00Z'
    }
  });

  await mockJson(page, '**/api/search-console/summary*', searchStatus);
}

test('Tuku Estate exposes current Search Console activation state without fake metrics', async ({ page }, testInfo) => {
  await installEstateMocks(page, {
    bridgeConfigured: true,
    available: true,
    searchConsoleConfigured: false,
    productsConfigured: 19,
    coreHealth: {
      configured: false,
      enabled: false,
      credentialsConfigured: false,
      productsConfigured: 19
    },
    summary: null,
    alerts: [
      {
        code: 'google_search_console_credentials_missing',
        severity: 'warning',
        title: 'Google Search Console credentials missing',
        summary: 'Tuku Core is ready, but the Google service-account credential has not been provisioned.'
      },
      {
        code: 'google_search_console_disabled',
        severity: 'warning',
        title: 'Search Console integration disabled',
        summary: 'Tuku Core has Search Console disabled.'
      }
    ],
    error: null,
    generatedAt: '2026-09-22T06:00:00Z'
  });

  await page.goto('/estate');

  await expect(page.getByRole('heading', { name: 'Tuku Estate' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Google Search visibility' })).toBeVisible();
  await expect(page.getByText('19', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Google Search Console is not active yet')).toBeVisible();
  await expect(page.getByText('Google Search Console credentials missing')).toBeVisible();
  await expect(page.getByText('Search Console integration disabled')).toBeVisible();
  await expect(page.getByText('Awaiting live Search Console data')).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath('estate-search-console-activation-state.png'), fullPage: true });
});

test('Tuku Estate renders live Search Console health and product feed totals', async ({ page }, testInfo) => {
  await installEstateMocks(page, {
    bridgeConfigured: true,
    available: true,
    searchConsoleConfigured: true,
    productsConfigured: 2,
    coreHealth: {
      configured: true,
      enabled: true,
      credentialsConfigured: true,
      productsConfigured: 2
    },
    summary: {
      days: 28,
      products: [
        {
          productCode: 'impactos',
          available: true,
          totals: { clicks: 43, impressions: 1280, ctr: 0.03359375, position: 14.2 }
        },
        {
          productCode: 'bds',
          available: true,
          totals: { clicks: 21, impressions: 770, ctr: 0.0272727, position: 18.8 }
        }
      ],
      generatedAt: '2026-09-22T06:00:00Z'
    },
    alerts: [],
    error: null,
    generatedAt: '2026-09-22T06:00:00Z'
  });

  await page.goto('/estate');

  await expect(page.getByText('Search Console is healthy')).toBeVisible();
  await expect(page.getByText('64', { exact: true })).toBeVisible();
  await expect(page.getByText('2,050', { exact: true })).toBeVisible();
  await expect(page.getByText('impactos')).toBeVisible();
  await expect(page.getByText('bds')).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.screenshot({ path: testInfo.outputPath('estate-search-console-live-state.png'), fullPage: true });
});
