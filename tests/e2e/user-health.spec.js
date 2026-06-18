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

function collectPageErrors(page) {
  const errors = [];
  const ignoredPatterns = [
    /static\.cloudflareinsights\.com\/beacon\.min\.js/,
    /Transition was skipped/
  ];
  const pushError = (message) => {
    if (!ignoredPatterns.some((pattern) => pattern.test(message))) errors.push(message);
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
  if (!email || !password) throw new Error('Not authenticated. Set ELAB_EMAIL and ELAB_PASSWORD, or create ELAB_STORAGE_STATE.');

  await page.locator('input[type="email"], input[name="email"], input[name="userid"], input[name="login"]').filter({ visible: true }).first().fill(email);
  await page.locator('input[type="password"]').filter({ visible: true }).first().fill(password);
  await page.getByRole('button', { name: /^login$/i }).or(page.locator('button[type="submit"], input[type="submit"]').filter({ visible: true })).first().click();
  await page.waitForLoadState('networkidle');
  await expect(page).not.toHaveURL(/login|logout/);
}

async function openAuthed(page, path) {
  await page.goto(path);
  await loginIfNeeded(page);
  await page.waitForLoadState('networkidle');
}

async function dispatchVisibleClick(locator) {
  await expect(locator).toBeVisible();
  await locator.dispatchEvent('click');
}

loadLocalEnv();

const authFile = process.env.ELAB_STORAGE_STATE || 'playwright/.auth/elabftw.json';
if (existsSync(authFile)) {
  test.use({ storageState: authFile });
}

test('daily user journey: dashboard, planner CRUD, and storage location CRUD', async ({ page }) => {
  const errors = collectPageErrors(page);
  const suffix = `${Date.now()}`.slice(-6);
  const planTitle = `E2E planner ${suffix}`;
  const planNote = `E2E note ${suffix}`;
  const freezerName = `E2E freezer ${suffix}`;
  const editedFreezerName = `E2E freezer edited ${suffix}`;

  page.on('dialog', (dialog) => dialog.accept());

  await openAuthed(page, '/');
  await expect(page.locator('a[href="planner.php"]').first()).toBeVisible();
  await expect(page.locator('#dashboardPlanner')).toBeVisible();

  await openAuthed(page, '/planner.php');
  await expect(page.locator('[data-planner-root]')).toBeVisible();
  const dayButton = page.locator('button[data-view="day"]');
  await dispatchVisibleClick(dayButton);
  await expect(page.locator('.agenda-day').first()).toBeVisible();

  await dispatchVisibleClick(page.locator('#selected-new-plan-button'));
  await expect(page.locator('#plan-dialog[open]')).toBeVisible();
  await page.locator('#plan-form input[name="title"]').fill(planTitle);
  await page.locator('#plan-form textarea[name="note"]').fill(planNote);
  await dispatchVisibleClick(page.locator('#plan-form button[type="submit"]'));
  await expect(page.locator('#plan-dialog')).not.toBeVisible();
  await expect(page.locator('#selected-list')).toContainText(planTitle);

  await dispatchVisibleClick(page.locator('.plan-card', { hasText: planTitle }).getByRole('button', { name: /Backfill|补记录/ }));
  await expect(page.locator('#plan-dialog[open]')).toBeVisible();
  await expect(page.locator('#plan-form select[name="status"]')).toHaveValue('done');
  await page.locator('#plan-form textarea[name="note"]').fill(`${planNote} backfilled`);
  await dispatchVisibleClick(page.locator('#plan-form button[type="submit"]'));
  await expect(page.locator('#selected-list')).toContainText(/Done|已完成/);

  await dispatchVisibleClick(page.locator('.plan-card', { hasText: planTitle }).getByRole('button', { name: /Delete|删除/ }));
  await expect(page.locator('#selected-list')).not.toContainText(planTitle);

  await openAuthed(page, '/storage-map.php');
  await expect(page.locator('[data-storage-map-root]')).toBeVisible();
  await dispatchVisibleClick(page.locator('#storage-new-freezer'));
  await expect(page.locator('#storage-location-dialog[open]')).toBeVisible();
  await page.locator('#storage-location-form input[name="name"]').fill(freezerName);
  await page.locator('#storage-location-form input[name="rows"]').fill('2');
  await page.locator('#storage-location-form input[name="columns"]').fill('2');
  await dispatchVisibleClick(page.locator('#storage-location-form button[type="submit"]'));
  await expect(page.locator('#storage-location-tree')).toContainText(freezerName);

  await dispatchVisibleClick(page.locator('.storage-tree-node', { hasText: freezerName }));
  await dispatchVisibleClick(page.locator('#storage-edit-location'));
  await expect(page.locator('#storage-location-dialog[open]')).toBeVisible();
  await page.locator('#storage-location-form input[name="name"]').fill(editedFreezerName);
  await dispatchVisibleClick(page.locator('#storage-location-form button[type="submit"]'));
  await expect(page.locator('#storage-location-tree')).toContainText(editedFreezerName);

  await dispatchVisibleClick(page.locator('.storage-tree-node', { hasText: editedFreezerName }));
  await dispatchVisibleClick(page.locator('#storage-delete-location'));
  await expect(page.locator('#storage-location-tree')).not.toContainText(editedFreezerName);

  expect(errors).toEqual([]);
});
