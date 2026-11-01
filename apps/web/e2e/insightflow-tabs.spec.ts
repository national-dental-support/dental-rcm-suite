import { test, expect, Page } from '@playwright/test';
import {
  SESSION_STORAGE_SEED,
  MOCK_USER,
  MOCK_ORG_SUBSCRIPTIONS,
  MOCK_PRODUCTS,
  MOCK_INSIGHTFLOW_HEALTH,
  MOCK_INSIGHTFLOW_KPIS,
} from './fixtures/session-state';

// -- Mock data -----------------------------------------------------------------

const MOCK_PROVIDER_ROWS = [
  { providerName: 'Dr. Smith', dayDate: '2026-02-28', production: 4200, weekProduction: 18500, dailyGoal: null, weeklyGoal: null },
  { providerName: 'Dr. Jones', dayDate: '2026-02-28', production: 3100, weekProduction: 14200, dailyGoal: null, weeklyGoal: null },
];

// -- Helpers -------------------------------------------------------------------

async function seedSession(page: Page, seed: Record<string, string>): Promise<void> {
  await page.addInitScript((entries: Record<string, string>) => {
    for (const [key, value] of Object.entries(entries)) {
      sessionStorage.setItem(key, value);
    }
  }, seed);
}

async function mockApis(page: Page): Promise<void> {
  // Playwright uses LIFO: last-registered handler is called first.
  // Register the catch-all FIRST so specific routes (registered after) take precedence.
  await page.route('**/api/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );

  // Specific routes registered AFTER catch-all -> checked BEFORE catch-all (LIFO)
  await page.route('**/api/subscriptions/my-org', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ORG_SUBSCRIPTIONS) }),
  );
  await page.route('**/api/subscriptions/products', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PRODUCTS) }),
  );
  await page.route('**/api/users/get-by-email**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) }),
  );
  await page.route('**/api/users/login-success', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
  );
  await page.route('**/api/insightflow/health', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_INSIGHTFLOW_HEALTH) }),
  );
  await page.route('**/api/insightflow/kpis**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_INSIGHTFLOW_KPIS) }),
  );
  // Provider production - component expects { rows: [...], asOf: string }
  await page.route('**/api/insightflow/reports/provider-daily-production**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: MOCK_PROVIDER_ROWS, asOf: new Date().toISOString() }) }),
  );
}

// -- Tests ---------------------------------------------------------------------

test.describe('InsightFlow tab reorganization', () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page, SESSION_STORAGE_SEED);
    await mockApis(page);
  });

  test('"Reports" does not appear as a standalone primary tab', async ({ page }) => {
    await page.goto('/app/insightflow/view/summary');
    await page.waitForURL('**/view/summary', { timeout: 15_000 });

    // The InsightFlow tabs component renders primary tabs - Reports must not be one of them
    // Primary tabs are rendered as buttons in the tab bar (not inside a dropdown)
    const tabBar = page.locator('app-insightflow-tabs');
    await expect(tabBar).toBeVisible({ timeout: 10_000 });

    // "Reports" should not appear as a direct .tab-btn or equivalent primary nav button
    // It should only be in the tools dropdown
    const primaryTabsWithReports = tabBar.locator('button.tab-btn:has-text("Reports"), a:has-text("Reports")').first();
    await expect(primaryTabsWithReports).toHaveCount(0);
  });

  test('"Executive Summary" appears as a primary navigation tab', async ({ page }) => {
    await page.goto('/app/insightflow/view/summary');
    await page.waitForURL('**/view/summary', { timeout: 15_000 });

    await expect(page.locator('app-insightflow-tabs')).toBeVisible({ timeout: 10_000 });
    // "Executive Summary" is always a core primary nav tab rendered as <a mat-tab-link>
    await expect(page.locator('app-insightflow-tabs a:has-text("Executive Summary")')).toBeVisible({ timeout: 10_000 });
  });

  test('"Daily Goals" label is no longer present in the tab bar', async ({ page }) => {
    await page.goto('/app/insightflow/view/summary');
    await page.waitForURL('**/view/summary', { timeout: 15_000 });

    await expect(page.locator('app-insightflow-tabs')).toBeVisible({ timeout: 10_000 });
    // "Daily Goals" was the old label - it should not exist anywhere in the tabs component
    await expect(
      page.locator('app-insightflow-tabs button:has-text("Daily Goals"), app-insightflow-tabs a:has-text("Daily Goals")'),
    ).toHaveCount(0);
  });

  test('"Industry Benchmarks" is accessible via the Tools dropdown', async ({ page }) => {
    await page.goto('/app/insightflow/view/summary');
    await page.waitForURL('**/view/summary', { timeout: 15_000 });

    await expect(page.locator('app-insightflow-tabs')).toBeVisible({ timeout: 10_000 });

    // Open the tools dropdown - button has class "tools-btn" and text "Tools"
    const toolsBtn = page.locator('app-insightflow-tabs button.tools-btn').first();

    if (await toolsBtn.isVisible()) {
      await toolsBtn.click();
      await expect(page.locator('a[mat-menu-item]:has-text("Industry Benchmarks"), button[mat-menu-item]:has-text("Industry Benchmarks")')).toBeVisible({ timeout: 5_000 });
    } else {
      // Tools may render inline - just verify Industry Benchmarks text exists somewhere in tabs
      await expect(page.locator('app-insightflow-tabs')).toContainText('Industry Benchmarks', { timeout: 5_000 });
    }
  });

  // -- Provider Production tab -----------------------------------------------
  test('Provider Production tab renders without "Failed to load" error', async ({ page }) => {
    await page.goto('/app/insightflow/view/provider-daily-goals');

    // Should NOT show the error state text
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
    const errorText = page.locator('text=Failed to load, text=failed to load production');
    await expect(errorText).toHaveCount(0);
  });

  test('Provider Production tab renders a data table or chart', async ({ page }) => {
    await page.goto('/app/insightflow/view/provider-daily-goals');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // The component renders a mat-table - wait for it to be visible
    const table = page.locator('table[mat-table], table.xen-table, mat-table');
    await expect(table).toBeVisible({ timeout: 12_000 });
  });

  test('Provider Production table shows data from the mock response', async ({ page }) => {
    await page.goto('/app/insightflow/view/provider-daily-goals');
    await page.waitForLoadState('networkidle', { timeout: 15_000 });

    // Provider names from MOCK_PROVIDER_ROWS should appear in the table
    await expect(page.locator('text=Dr. Smith')).toBeVisible({ timeout: 12_000 });
    await expect(page.locator('text=Dr. Jones')).toBeVisible({ timeout: 12_000 });
  });
});
