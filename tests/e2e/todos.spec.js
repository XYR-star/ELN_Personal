import { test, expect } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

function loadLocalEnv(file = '.env.e2e') {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    if (!process.env[key]) process.env[key] = rest.join('=').trim();
  }
}

loadLocalEnv();

const authFile = process.env.ELAB_STORAGE_STATE || 'playwright/.auth/elabftw.json';
if (existsSync(authFile)) {
  test.use({ storageState: authFile });
}

async function loginIfNeeded(page) {
  if (!/login|logout/.test(page.url())) return;
  const email = process.env.ELAB_EMAIL;
  const password = process.env.ELAB_PASSWORD;
  if (!email || !password) throw new Error('Not authenticated. Set ELAB_EMAIL and ELAB_PASSWORD, or create ELAB_STORAGE_STATE.');

  await page.locator('input[type="email"], input[name="email"], input[name="userid"], input[name="login"]').filter({ visible: true }).first().fill(email);
  await page.locator('input[type="password"]').filter({ visible: true }).first().fill(password);
  await page.getByRole('button', { name: /^login$/i }).or(page.locator('button[type="submit"], input[type="submit"]').filter({ visible: true })).first().click();
  await page.waitForLoadState('domcontentloaded');
  await expect(page).not.toHaveURL(/login|logout/);
  mkdirSync(dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
}

function collectPageErrors(page) {
  const errors = [];
  const ignoredPatterns = [/static\.cloudflareinsights\.com\/beacon\.min\.js/, /Transition was skipped/, /^Failed to fetch$/];
  const pushError = (message) => {
    if (!ignoredPatterns.some((pattern) => pattern.test(message))) errors.push(message);
  };
  page.on('pageerror', (error) => pushError(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') pushError(message.text());
  });
  return errors;
}

async function openAuthed(page, path) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);
}

test('mixed todos can be edited in planner and shown on dashboard', async ({ page }) => {
  const errors = collectPageErrors(page);
  const suffix = `${Date.now()}`.slice(-6);
  const title = `E2E todo ${suffix}`;

  await openAuthed(page, '/planner.php');
  await expect(page.locator('[data-todos-root][data-todo-mode="editor"]')).toBeVisible();
  await page.locator('[data-todo-title]').fill(title);
  await page.locator('[data-todo-due-date]').fill('2026-06-24');
  await page.locator('[data-todo-pinned]').check();
  await page.locator('[data-todo-note]').fill('dashboard check');
  await page.locator('[data-todo-save]').click();
  await expect(page.locator('[data-todo-item]', { hasText: title })).toBeVisible();

  await openAuthed(page, '/dashboard.php');
  await expect(page.locator('[data-todos-root][data-todo-mode="dashboard"]')).toBeVisible();
  await expect(page.locator('[data-dashboard-todo-item]', { hasText: title })).toBeVisible();

  await openAuthed(page, '/planner.php');
  await page.locator('[data-todo-item]', { hasText: title }).locator('[data-todo-toggle]').click();
  await expect(page.locator('[data-todo-item]', { hasText: title })).toHaveClass(/is-done/);
  await page.locator('[data-todo-item]', { hasText: title }).locator('[data-todo-delete]').click();
  await expect(page.locator('[data-todo-item]', { hasText: title })).toHaveCount(0);

  expect(errors).toEqual([]);
});
