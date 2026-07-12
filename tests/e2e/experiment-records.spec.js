import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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
    /Transition was skipped/,
    /^Failed to fetch$/,
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
  await page.waitForLoadState('domcontentloaded');
  await expect(page).not.toHaveURL(/login|logout/);
}

async function openAuthed(page, path) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);
  await page.waitForLoadState('domcontentloaded');
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

test('experiment records can create, upload, persist, and delete a run log', async ({ page }) => {
  const errors = collectPageErrors(page);
  const suffix = `${Date.now()}`.slice(-7);
  const title = `E2E record ${suffix}`;
  const uploadPath = join('/tmp', `record-upload-${suffix}.txt`);
  writeFileSync(uploadPath, `record upload ${suffix}`);

  page.on('dialog', (dialog) => dialog.accept());
  await openAuthed(page, '/experiments.php?mode=edit&id=2');

  await expect(page.locator('[data-experiment-records-root]')).toBeVisible();
  await dispatchVisibleClick(page.locator('[data-record-new]'));
  await expect(page.locator('[data-record-modal]')).toBeVisible();
  await page.locator('[data-record-title]').fill(title);
  await page.locator('[data-record-date]').fill('2026-06-20');
  await page.locator('[data-record-type]').selectOption('facs');
  await expect(page.locator('[data-record-markdown]')).toBeVisible();
  await page.locator('[data-record-markdown]').fill(`# ${title}\n\nInitial run using [[Resource:11]] and [[Idea:20260619-001]].`);
  await expect(page.locator('[data-record-preview] h1')).toContainText(title);
  await expect(page.locator('[data-record-preview]')).toContainText('Resource:11');
  await dispatchVisibleClick(page.locator('[data-record-save]'));
  await expect(page.locator('[data-record-modal]')).toBeHidden();
  await expect(page.locator('[data-record-list]')).toContainText(title);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-record-list]')).toContainText(title);

  await dispatchVisibleClick(page.locator('.experiment-record-card', { hasText: title }).getByRole('button', { name: /Open/i }));
  await expect(page.locator('[data-record-modal]')).toBeVisible();
  await expect(page.locator('[data-record-markdown]')).toHaveValue(/Resource:11/);
  await expect(page.locator('[data-record-preview] h1')).toContainText(title);
  await page.locator('[data-record-upload]').setInputFiles(uploadPath);
  await expect(page.locator('[data-record-status]')).toContainText(/Saved|Could not upload/, { timeout: 15000 });
  await expect(page.locator('[data-record-status]')).not.toContainText('Could not upload');
  await dispatchVisibleClick(page.locator('[data-record-delete]'));
  await expect(page.locator('[data-record-modal]')).toBeHidden();
  await expect(page.locator('[data-record-list]')).not.toContainText(title);

  expect(errors).toEqual([]);
});
