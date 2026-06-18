import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

function loadLocalEnv(file = '.env.e2e') {
  if (!existsSync(file)) return;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (!process.env[key]) {
      process.env[key] = rest.join('=').trim();
    }
  }
}

loadLocalEnv();

const authFile = process.env.ELAB_STORAGE_STATE || 'playwright/.auth/elabftw.json';

async function collectPageErrors(page) {
  const errors = [];
  const ignoredPatterns = [
    /static\.cloudflareinsights\.com\/beacon\.min\.js/,
    /Transition was skipped/
  ];
  const pushError = (message) => {
    if (!ignoredPatterns.some((pattern) => pattern.test(message))) {
      errors.push(message);
    }
  };
  page.on('pageerror', (error) => pushError(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') pushError(message.text());
  });
  return errors;
}

async function loginIfNeeded(page) {
  if (!/login|logout/.test(page.url())) return;

  const email = process.env.ELAB_EMAIL;
  const password = process.env.ELAB_PASSWORD;
  if (!email || !password) {
    throw new Error('Not authenticated. Set ELAB_EMAIL and ELAB_PASSWORD, or create ELAB_STORAGE_STATE with an authenticated session.');
  }

  const emailInput = page.locator('input[type="email"], input[name="email"], input[name="userid"], input[name="login"]').filter({ visible: true }).first();
  const passwordInput = page.locator('input[type="password"]').filter({ visible: true }).first();
  await expect(emailInput).toBeVisible();
  await expect(passwordInput).toBeVisible();
  await emailInput.fill(email);
  await passwordInput.fill(password);
  const loginButton = page.getByRole('button', { name: /^login$/i }).or(page.locator('button[type="submit"], input[type="submit"]').filter({ visible: true })).first();
  await loginButton.click();
  await page.waitForLoadState('networkidle');
  await expect(page).not.toHaveURL(/login|logout/);
}

if (existsSync(authFile)) {
  test.use({ storageState: authFile });
}

test('Planner renders calendar, selected list, and no browser errors', async ({ page }) => {
  const errors = await collectPageErrors(page);
  await page.goto('/planner.php');
  await loginIfNeeded(page);

  await expect(page.locator('[data-planner-root]')).toBeVisible();
  await expect(page.locator('#calendar-grid')).toBeVisible();
  await expect(page.locator('#selected-list')).toBeVisible();
  await expect(page.locator('.day-cell, .agenda-day').first()).toBeVisible();
  await expect(page.locator('#calendar-grid')).not.toBeEmpty();

  expect(errors).toEqual([]);
});

test('Storage map renders main panels and no browser errors', async ({ page }) => {
  const errors = await collectPageErrors(page);
  await page.goto('/storage-map.php');
  await loginIfNeeded(page);

  await expect(page.locator('[data-storage-map-root]')).toBeVisible();
  await expect(page.locator('#storage-location-tree')).toBeVisible();
  await expect(page.locator('#storage-location-count')).toBeVisible();
  await expect(page.locator('#storage-grid')).toBeVisible();

  expect(errors).toEqual([]);
});

test('Personal navigation hides team/all scopes and labels storage as inventory', async ({ page }) => {
  const errors = await collectPageErrors(page);
  await page.goto('/dashboard.php');
  await loginIfNeeded(page);

  const experimentsDropdown = page.locator('#navExperimentsDropdown');
  await expect(experimentsDropdown).toBeVisible();
  await experimentsDropdown.dispatchEvent('click');
  await expect(page.locator('a.dropdown-item', { hasText: /My experiments/i })).toBeVisible();
  await expect(page.locator('a.dropdown-item', { hasText: /Team experiments/i })).toHaveCount(0);
  await expect(page.locator('a.dropdown-item', { hasText: /All experiments/i })).toHaveCount(0);

  const resourcesDropdown = page.locator('#navResourcesDropdown');
  await expect(resourcesDropdown).toBeVisible();
  await resourcesDropdown.dispatchEvent('click');
  await expect(page.locator('a.dropdown-item', { hasText: /My resources/i })).toBeVisible();
  await expect(page.locator('a.dropdown-item', { hasText: /Team resources/i })).toHaveCount(0);
  await expect(page.locator('a.dropdown-item', { hasText: /All resources/i })).toHaveCount(0);
  await expect(page.locator('a.dropdown-item[href="storage-map.php"]')).toContainText(/Inventory \/ (Storage map|可视化存放)/);

  expect(errors).toEqual([]);
});
