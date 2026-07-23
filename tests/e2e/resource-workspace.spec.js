import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

function loadLocalEnv(file = '.env.e2e') {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (!process.env[key]) process.env[key] = rest.join('=').trim();
  }
}

async function loginIfNeeded(page) {
  if (!/login|logout/.test(page.url())) return;
  if (!process.env.ELAB_EMAIL || !process.env.ELAB_PASSWORD) {
    throw new Error('Resource workspace E2E needs an authenticated storage state or credentials.');
  }
  await page.locator('input[type="email"], input[name="email"], input[name="userid"], input[name="login"]').filter({ visible: true }).first().fill(process.env.ELAB_EMAIL);
  await page.locator('input[type="password"]').filter({ visible: true }).first().fill(process.env.ELAB_PASSWORD);
  await page.locator('button[type="submit"], input[type="submit"]').filter({ visible: true }).first().click();
  await expect(page).not.toHaveURL(/login|logout/);
}

loadLocalEnv();
const authFile = process.env.ELAB_STORAGE_STATE || 'playwright/.auth/elabftw.json';
if (existsSync(authFile)) test.use({ storageState: authFile });

test('workspace bootstrap hides the native list while the module starts', async ({ page }) => {
  await page.route('**/planner-assets/resource-workspace-bootstrap.js*', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace('}, 4000);', '}, 30000);');
    await route.fulfill({ response, body });
  });
  await page.route((url) => url.pathname.endsWith('/planner-assets/resource-workspace.js'), (route) => route.abort());
  await page.goto('/database.php?scope=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveClass(/resource-workspace-pending/);
  await expect(page.locator('#itemList')).toBeAttached();
  await expect(page.locator('#showModeContent')).toHaveCSS('visibility', 'hidden');
});

test('resource table and storage preview preserve native controls', async ({ page }) => {
  await page.goto('/database.php?scope=1', { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);

  const workspace = page.locator('.resource-workspace');
  await expect(workspace).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/resource-workspace-pending/);
  await expect(page.locator('.resource-freezer-overview')).toBeVisible();
  expect(await page.locator('.resource-freezer-overview-item').count()).toBeGreaterThan(0);
  await expect(page.locator('.resource-filter-section')).toBeHidden();
  await page.locator('.resource-filter-toggle').click();
  await expect(page.locator('.resource-filter-section')).toBeVisible();
  await expect(page.locator('#filtersDiv')).toBeHidden();
  await page.locator('.resource-more-filter-toggle').click();
  await expect(page.locator('#filtersDiv')).toBeVisible();
  await page.locator('.resource-filter-toggle').click();
  await expect(page.locator('.resource-filter-section')).toBeHidden();
  const rows = workspace.locator('.resource-workspace-row');
  expect(await rows.count()).toBeGreaterThan(0);
  const firstRow = rows.first();
  const title = (await firstRow.locator('.resource-title-link').innerText()).trim();
  const location = firstRow.locator('.resource-location-state');
  await expect(location).not.toHaveClass(/is-loading/);

  const checkbox = firstRow.locator('[data-action="checkbox-entity"]');
  const workspaceTop = await workspace.evaluate((node) => node.getBoundingClientRect().top);
  await checkbox.click();
  await expect(page.locator('.resource-location-summary h2')).toHaveText(title);
  if (await location.evaluate((node) => node.classList.contains('is-assigned'))) {
    await expect(page.locator('.resource-mini-slot.is-selected')).toHaveCount(1);
    expect(await page.locator('.resource-mini-grid .resource-grid-axis.is-row').count()).toBeLessThanOrEqual(4);
    await expect(page.locator('.resource-context-locator').first()).toBeVisible();
    await expect(page.locator('.resource-drawer-stage')).toBeVisible();
    await expect(page.locator('.resource-drawer-slot.is-selected')).toHaveCount(1);
  } else {
    await expect(page.locator('.resource-location-empty.is-unassigned')).toBeVisible();
  }

  await expect(page.locator('.resource-selection-control')).toBeVisible();
  await expect(page.locator('.resource-selection-delete')).toBeVisible();
  await expect(page.locator('.resource-bulk-dialog')).not.toBeVisible();
  expect(await workspace.evaluate((node) => node.getBoundingClientRect().top)).toBe(workspaceTop);
  await page.locator('.resource-bulk-trigger').click();
  await expect(page.locator('.resource-bulk-dialog')).toBeVisible();
  await expect(page.locator('#withSelected')).toBeVisible();
  await page.locator('[data-resource-bulk-close]').click();
  await checkbox.click();
  await expect(page.locator('#withSelected')).toBeHidden();
  await expect(page.locator('.resource-selection-control')).toBeHidden();
  await expect(page.locator('.resource-location-summary h2')).toHaveText(/Freezer overview|冰箱总览/);
  await expect(page.locator('.resource-freezer-overview')).toBeVisible();

  await expect(page.locator('[data-action="toggle-select-all-entities"]')).toBeVisible();
  await expect(page.locator('thead .resource-col-select [data-action="toggle-select-all-entities"]')).toHaveCount(1);
  await expect(page.locator('[data-action="invert-entities-selection"]')).toBeHidden();
  await expect(page.locator('[data-action="expand-all-entities"]')).toBeHidden();
  await expect(page.locator('#scopeBtn')).toBeHidden();
  await expect(page.locator('button[aria-label="Sort"]')).toBeVisible();
  await expect(page.locator('thead .resource-col-actions button[aria-label="Sort"]')).toHaveCount(1);
  await expect(page.locator('.resource-native-toolbar')).toBeHidden();
  await expect(page.locator('button[aria-label="Results per page"]')).toBeHidden();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('mobile resource title opens and closes the location sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/database.php?scope=1', { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);

  const firstTitle = page.locator('.resource-workspace-row .resource-title-link').first();
  const before = page.url();
  await firstTitle.click();
  await expect(page.locator('.resource-location-panel')).toHaveClass(/is-open/);
  expect(page.url()).toBe(before);
  await page.locator('.resource-location-close').click();
  await expect(page.locator('.resource-location-panel')).not.toHaveClass(/is-open/);

  const checkbox = page.locator('.resource-workspace-row [data-action="checkbox-entity"]').first();
  await checkbox.click();
  await expect(page.locator('.resource-location-panel')).toHaveClass(/is-open/);
  await page.locator('.resource-bulk-trigger').click();
  await expect(page.locator('.resource-bulk-dialog')).toBeVisible();
  await page.locator('[data-resource-bulk-close]').click();
  await expect(page.locator('.resource-location-panel')).toHaveClass(/is-open/);
  await page.locator('.resource-location-close').click();
  await checkbox.click();
});

test('resource workspace assets stay off unrelated pages', async ({ page }) => {
  await page.goto('/database.php?scope=1', { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);
  const resourceHref = await page.locator('.resource-workspace-row .resource-title-link').first().getAttribute('href');

  await page.goto('/experiments.php?scope=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('link[href*="resource-workspace"], script[src*="resource-workspace"]')).toHaveCount(0);

  await page.goto(resourceHref, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('link[href*="resource-workspace"], script[src*="resource-workspace"]')).toHaveCount(0);
});
