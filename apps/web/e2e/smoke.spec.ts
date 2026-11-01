import { test, expect, Page } from '@playwright/test';
import {
  SESSION_STORAGE_SEED,
  SESSION_STORAGE_SEED_NO_INSIGHTFLOW,
  MOCK_ORG_SUBSCRIPTIONS,
  MOCK_PRODUCTS,
  MOCK_USER,
  MOCK_INSIGHTFLOW_HEALTH,
  MOCK_INSIGHTFLOW_KPIS,
} from './fixtures/session-state';

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
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  );

  // Specific routes registered AFTER catch-all -> checked BEFORE catch-all (LIFO)
  await page.route('**/api/subscriptions/my-org', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ORG_SUBSCRIPTIONS) })
  );
  await page.route('**/api/subscriptions/products', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PRODUCTS) })
  );
  await page.route('**/api/users/get-by-email**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) })
  );
  await page.route('**/api/users/login-success', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  );
  await page.route('**/api/insightflow/health', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_INSIGHTFLOW_HEALTH) })
  );
  await page.route('**/api/insightflow/kpis**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_INSIGHTFLOW_KPIS) })
  );
}

// -- Test 1: Login page renders ------------------------------------------------
test('login page renders sign-in button and app title', async ({ page }) => {
  await mockApis(page);
  await page.goto('/signin');

  await expect(page.locator('h1.app-title')).toHaveText('RCM Suite');
  await expect(page.locator('button.login-button')).toBeVisible();
});

// -- Test 2: Unauthenticated user redirected to sign-in ------------------------
test('unauthenticated navigation to /app redirects to /signin', async ({ page }) => {
  await mockApis(page);
  // No sessionStorage seed - SimpleAuthGuard should block and redirect.
  await page.goto('/app/home');

  await page.waitForURL('**/signin', { timeout: 10_000 });
  expect(page.url()).toContain('/signin');
});

// -- Tests 3-6 require an authenticated session --------------------------------
test.describe('authenticated user', () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page, SESSION_STORAGE_SEED);
    await mockApis(page);
  });

  // -- Test 3: App home loads ------------------------------------------------
  test('authenticated user lands on /app/home with side nav visible', async ({ page }) => {
    await page.goto('/app/home');

    await page.waitForURL('**/app/home', { timeout: 15_000 });
    await expect(page.locator('nav[aria-label="Product navigation"]')).toBeVisible({ timeout: 10_000 });
  });

  // -- Test 4: InsightFlow route redirects to executive summary -------------
  test('/app/insightflow redirects to /app/insightflow/view/summary', async ({ page }) => {
    await page.goto('/app/insightflow');

    await page.waitForURL('**/app/insightflow/view/summary', { timeout: 15_000 });
    expect(page.url()).toContain('/app/insightflow/view/summary');
  });

  // -- Test 5: InsightFlow tabs render --------------------------------------
  test('InsightFlow view/summary renders the primary navigation tabs', async ({ page }) => {
    await page.goto('/app/insightflow/view/summary');

    await page.waitForURL('**/app/insightflow/view/summary', { timeout: 15_000 });

    // Tab labels come from the static baseTabs array - no API call required.
    await expect(page.getByText('Executive Summary')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Denial Management')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Accounts Receivable')).toBeVisible({ timeout: 10_000 });
  });
});

// -- Test 6: SubscriptionGuard blocks unsubscribed route -----------------------
test('SubscriptionGuard redirects unsubscribed user away from InsightFlow', async ({ page }) => {
  await seedSession(page, SESSION_STORAGE_SEED_NO_INSIGHTFLOW);
  await mockApis(page);
  // Override my-org to return subscriptions WITHOUT insightflow - LIFO means this fires before mockApis' version
  await page.route('**/api/subscriptions/my-org', route =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ customerId: 1, subscriptions: ['denial-iq', 'claim-vision', 'payer-iq', 'recon-iq'], role: 'Admin', permissions: { orgAdmin: true }, _v: 2 }),
    })
  );

  await page.goto('/app/insightflow');

  // Guard should redirect to /app/home with notSubscribed query param.
  await page.waitForURL('**/app/home**', { timeout: 15_000 });
  expect(page.url()).toContain('notSubscribed=insightflow');
});
