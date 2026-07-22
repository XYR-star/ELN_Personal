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

test('resource table and storage preview preserve native controls', async ({ page }) => {
  await page.goto('/database.php?scope=1', { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);

  const workspace = page.locator('.resource-workspace');
  await expect(workspace).toBeVisible();
  const rows = workspace.locator('.resource-workspace-row');
  expect(await rows.count()).toBeGreaterThan(0);
  const firstRow = rows.first();
  const title = (await firstRow.locator('.resource-title-link').innerText()).trim();
  const location = firstRow.locator('.resource-location-state');
  await expect(location).not.toHaveClass(/is-loading/);

  const checkbox = firstRow.locator('[data-action="checkbox-entity"]');
  await checkbox.click();
  await expect(page.locator('.resource-location-summary h2')).toHaveText(title);
  if (await location.evaluate((node) => node.classList.contains('is-assigned'))) {
    await expect(page.locator('.resource-mini-slot.is-selected')).toHaveCount(1);
  } else {
    await expect(page.locator('.resource-location-empty.is-unassigned')).toBeVisible();
  }

  await expect(page.locator('#withSelected')).toBeVisible();
  await checkbox.click();
  await expect(page.locator('#withSelected')).toBeHidden();

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
