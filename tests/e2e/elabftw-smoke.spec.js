import { test, expect } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

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
    /Transition was skipped/,
    /^Failed to fetch$/
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
  await page.waitForLoadState('domcontentloaded');
  await expect(page).not.toHaveURL(/login|logout/);
  mkdirSync(dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
}

if (existsSync(authFile)) {
  test.use({ storageState: authFile });
}

test('Planner renders calendar, selected list, and no browser errors', async ({ page }) => {
  const errors = await collectPageErrors(page);
  await page.goto('/planner.php', { waitUntil: 'domcontentloaded' });
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
  await page.goto('/storage-map.php', { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);

  await expect(page.locator('[data-storage-map-root]')).toBeVisible();
  await expect(page.locator('#realContainer')).toHaveClass(/max-width-70/);
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(page.locator('[data-storage-map-root] h1')).toHaveCount(0);
  await expect(page.locator('#storage-location-tree')).toBeVisible();
  await expect(page.locator('#storage-location-count')).toBeVisible();
  await expect(page.locator('#storage-grid')).toBeVisible();

  expect(errors).toEqual([]);
});

test('Personal navigation hides team/all scopes and labels storage as inventory', async ({ page }) => {
  const errors = await collectPageErrors(page);
  await page.goto('/dashboard.php', { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);

  await expect(page.locator('#scopeExp button')).toBeDisabled();
  await expect(page.locator('#scopeItems button')).toBeDisabled();
  await expect(page.locator('#scopeExp .dropdown-menu')).toHaveCount(0);
  await expect(page.locator('#scopeItems .dropdown-menu')).toHaveCount(0);
  await expect(page.locator('#scopeExp')).not.toContainText(/Team|Everything/i);
  await expect(page.locator('#scopeItems')).not.toContainText(/Team|Everything/i);

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

test('Literature and ideas shells render from the main navigation', async ({ page }) => {
  const errors = await collectPageErrors(page);
  await page.goto('/dashboard.php', { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);

  await expect(page.locator('a.nav-link[href="literature.php"]')).toBeVisible();
  await expect(page.locator('a.nav-link[href="ideas.php"]')).toBeVisible();

  await page.goto(`/literature.php?e2e=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-literature-root]')).toBeVisible();
  await expect(page.locator('#realContainer')).toHaveClass(/max-width-70/);
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(page.locator('#pageTitle')).toContainText(/Literature|文献调研/);
  await expect(page.locator('[data-literature-root] h1')).toHaveCount(0);
  await expect(page.locator('.literature-grid')).toBeVisible();
  await expect(page.locator('[data-literature-list]')).toBeVisible();
  await expect(page.locator('[data-literature-detail]')).toBeVisible();
  await expect(page.locator('[data-literature-collections]')).toBeVisible();
  await expect(page.locator('[data-literature-tags]')).toBeVisible();
  await expect(page.locator('[data-literature-config]')).toBeVisible();
  await page.locator('[data-literature-config]').click();
  await expect(page.locator('[data-literature-config-dialog]')).toBeVisible();
  await page.locator('[data-literature-config-close]').first().click();
  await expect(page.locator('[data-literature-config-dialog]')).not.toBeVisible();

  await page.goto('/ideas.php', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-ideas-root]')).toBeVisible();
  await expect(page.locator('#realContainer')).toHaveClass(/max-width-70/);
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(page.locator('#pageTitle')).toContainText(/Ideas|灵感/);
  await expect(page.locator('[data-ideas-root] h1')).toHaveCount(0);
  await expect(page.locator('[data-idea-composer]')).toBeVisible();
  await expect(page.locator('[data-idea-markdown]')).toBeVisible();
  await expect(page.locator('[data-ideas-list]')).toBeVisible();
  await expect(page.locator('[data-ideas-calendar]')).toBeVisible();

  expect(errors).toEqual([]);
});

test('Literature can create a local paper and evidence reference', async ({ page }) => {
  const errors = await collectPageErrors(page);
  const suffix = `${Date.now()}`.slice(-7);
  const paperKey = `E2EPaper${suffix}`;
  const paperTitle = `E2E literature paper ${suffix}`;

  await page.goto(`/literature.php?e2e=${suffix}`, { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);

  await page.locator('[data-literature-new-paper]').click();
  await expect(page.locator('[data-literature-paper-dialog]')).toBeVisible();
  await page.locator('[data-literature-paper-form] input[name="title"]').fill(paperTitle);
  await page.locator('[data-literature-paper-form] input[name="key"]').fill(paperKey);
  await page.locator('[data-literature-paper-form] input[name="doi"]').fill('10.1000/e2e');
  await page.locator('[data-literature-paper-form] button[type="submit"]').click();

  await expect(page.locator('[data-literature-item]', { hasText: paperTitle })).toBeVisible();
  await expect(page.locator('[data-literature-detail]')).toContainText(paperTitle);

  await page.locator('[data-literature-evidence-form] select[name="type"]').selectOption('figure');
  await page.locator('[data-literature-evidence-form] input[name="page"]').fill('3');
  await page.locator('[data-literature-evidence-form] input[name="section"]').fill('Fig. 2B');
  await page.locator('[data-literature-evidence-form] textarea[name="original_text"]').fill(`E2E quote ${suffix}`);
  await page.locator('[data-literature-evidence-form] textarea[name="my_note"]').fill('Useful for [[Experiment:12]].');
  await page.locator('[data-literature-evidence-form] button[type="submit"]').click();

  await expect(page.locator('.literature-evidence-card', { hasText: `E2E quote ${suffix}` })).toBeVisible();
  await expect(page.locator('.literature-evidence-card code')).toContainText(`[[Evidence:${paperKey}#fig-`);

  await page.evaluate(async ({ paperKey: key }) => {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
    await fetch(`/literature-api.php?action=paper&paper_key=${encodeURIComponent(key)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
    });
  }, { paperKey });

  expect(errors).toEqual([]);
});

test('Planner uses the native page title without an extra content h1', async ({ page }) => {
  const errors = await collectPageErrors(page);
  await page.goto('/planner.php', { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);

  await expect(page.locator('[data-planner-root]')).toBeVisible();
  await expect(page.locator('#realContainer')).toHaveClass(/max-width-70/);
  await expect(page.locator('#pageTitle')).toBeVisible();
  await expect(page.locator('#pageTitle')).toContainText(/Planner|规划日历/);
  await expect(page.locator('[data-planner-root] h1')).toHaveCount(0);
  await expect(page.locator('[data-planner-root]')).not.toContainText(/Experiment Planner|实验规划日历/);
  await expect(page.locator('.planner-actions')).toBeVisible();

  expect(errors).toEqual([]);
});

test('Ideas memo UI can create, edit, persist, and delete a memo', async ({ page }) => {
  const errors = await collectPageErrors(page);
  const suffix = `${Date.now()}`.slice(-6);
  const firstText = `E2E idea ${suffix} #faps [[Experiment:12]]`;
  const otherText = `E2E other idea ${suffix} #other`;
  const secondText = `E2E idea edited ${suffix} #rna [[Resource:11]]`;

  await page.goto('/ideas.php', { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);

  await page.locator('[data-idea-markdown]').fill(firstText);
  await page.locator('[data-idea-tags]').fill('#manual');
  await page.locator('[data-idea-location]').fill(`E2E bench ${suffix}`);
  await page.locator('[data-idea-save]').dispatchEvent('click');
  await expect(page.locator('[data-idea-card]', { hasText: firstText })).toBeVisible();
  await expect(page.locator('[data-idea-card]', { hasText: firstText })).toContainText('#manual');

  await page.locator('[data-idea-markdown]').fill(otherText);
  await page.locator('[data-idea-tags]').fill('#other-manual');
  await page.locator('[data-idea-location]').fill(`E2E other ${suffix}`);
  await page.locator('[data-idea-save]').dispatchEvent('click');
  await expect(page.locator('[data-idea-card]', { hasText: otherText })).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-idea-card]', { hasText: firstText })).toBeVisible();
  await expect(page.locator('[data-idea-card]', { hasText: firstText })).toContainText('#manual');
  const manualFilter = page.locator('[data-ideas-tag-filters] [data-ideas-filter-tag="manual"]');
  const benchFilter = page.locator(`[data-ideas-location-filters] [data-ideas-filter-location="E2E bench ${suffix}"]`);
  await expect(manualFilter).toBeVisible();
  await expect(benchFilter).toBeVisible();

  await manualFilter.dispatchEvent('click');
  await expect(page.locator('[data-idea-card]', { hasText: firstText })).toBeVisible();
  await expect(page.locator('[data-idea-card]', { hasText: otherText })).toHaveCount(0);

  await page.locator('[data-ideas-clear-filters]').click();
  await benchFilter.dispatchEvent('click');
  await expect(page.locator('[data-idea-card]', { hasText: firstText })).toBeVisible();
  await expect(page.locator('[data-idea-card]', { hasText: otherText })).toHaveCount(0);
  await page.locator('[data-ideas-clear-filters]').click();

  const card = page.locator('[data-idea-card]', { hasText: firstText }).first();
  await card.locator('[data-idea-edit]').click();
  await page.locator('[data-idea-markdown]').fill(secondText);
  await page.locator('[data-idea-tags]').fill('#manual-edited');
  await page.locator('[data-idea-location]').fill('');
  await page.locator('[data-idea-save]').dispatchEvent('click');
  await expect(page.locator('[data-idea-card]', { hasText: secondText })).toBeVisible();
  await expect(page.locator('[data-idea-card]', { hasText: secondText })).toContainText('#manual-edited');
  await expect(page.locator('[data-idea-card]', { hasText: firstText })).toHaveCount(0);

  await page.locator('[data-idea-card]', { hasText: secondText }).first().locator('[data-idea-delete]').click();
  await expect(page.locator('[data-idea-card]', { hasText: secondText })).toHaveCount(0);
  await page.locator('[data-idea-card]', { hasText: otherText }).first().locator('[data-idea-delete]').click();
  await expect(page.locator('[data-idea-card]', { hasText: otherText })).toHaveCount(0);

  expect(errors).toEqual([]);
});
