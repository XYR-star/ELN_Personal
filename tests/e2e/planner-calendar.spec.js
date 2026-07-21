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
  if (!process.env.ELAB_EMAIL || !process.env.ELAB_PASSWORD) throw new Error('Planner E2E needs an authenticated storage state or credentials.');
  await page.locator('input[type="email"], input[name="email"], input[name="userid"], input[name="login"]').filter({ visible: true }).first().fill(process.env.ELAB_EMAIL);
  await page.locator('input[type="password"]').filter({ visible: true }).first().fill(process.env.ELAB_PASSWORD);
  await page.locator('button[type="submit"], input[type="submit"]').filter({ visible: true }).first().click();
  await expect(page).not.toHaveURL(/login|logout/);
}

async function deletePlansByTitle(page, titles) {
  await page.evaluate(async (planTitles) => {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
    const headers = { 'X-Requested-With': 'XMLHttpRequest', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) };
    const response = await fetch(`/planner-api.php?path=${encodeURIComponent('/api/plans')}`, { headers });
    const plans = await response.json();
    for (const plan of plans.filter((item) => planTitles.includes(item.title))) {
      await fetch(`/planner-api.php?path=${encodeURIComponent(`/api/plans/${plan.id}`)}`, { method: 'DELETE', headers });
    }
  }, titles);
}

loadLocalEnv();
const authFile = process.env.ELAB_STORAGE_STATE || 'playwright/.auth/elabftw.json';
if (existsSync(authFile)) test.use({ storageState: authFile });

let cleanupTitles = [];
test.afterEach(async ({ page }) => {
  if (cleanupTitles.length) await deletePlansByTitle(page, cleanupTitles).catch(() => {});
  cleanupTitles = [];
});

test('same-day plans remain distinct after save another and reload', async ({ page }) => {
  const suffix = `${Date.now()}`.slice(-7);
  const titles = [`E2E calendar A ${suffix}`, `E2E calendar B ${suffix}`];
  cleanupTitles = titles;

  await page.goto('/planner.php', { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);
  await expect(page.locator('.calendar-grid.timeline')).toBeVisible();

  const slot = page.locator('.time-day-column.selected .time-slot[data-time-hour="9"]').first();
  const selectedDate = await slot.getAttribute('data-time-date');
  await slot.click();
  await page.locator('#plan-form input[name="title"]').fill(titles[0]);
  await page.locator('#save-another-button').click();

  await expect(page.locator('#plan-dialog[open]')).toBeVisible();
  await expect(page.locator('#plan-form input[name="id"]')).toHaveValue('');
  await page.locator('#plan-form input[name="title"]').fill(titles[1]);
  await page.locator('#plan-form button[type="submit"]:not([data-save-another])').click();

  await expect(page.locator('#selected-list')).toContainText(titles[0]);
  await expect(page.locator('#selected-list')).toContainText(titles[1]);
  await expect(page.locator(`.time-day-column[data-date="${selectedDate}"] .timed-event`)).toHaveCount(2);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#selected-list')).toContainText(titles[0]);
  await expect(page.locator('#selected-list')).toContainText(titles[1]);

  await deletePlansByTitle(page, titles);
  cleanupTitles = [];
});

test('calendar navigation keeps the visible and selected dates in sync', async ({ page }) => {
  await page.goto('/planner.php', { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);

  const initialDate = await page.locator('#selected-date').textContent();
  await page.locator('[data-view="day"]').click();
  await expect(page.locator('.calendar-grid')).toHaveClass(/\bday\b/);
  await expect(page.locator('.timeline-day-header')).toHaveAttribute('data-date', initialDate);

  await page.locator('#next-button').click();
  const expectedDate = await page.evaluate((value) => {
    const date = new Date(`${value}T00:00`);
    date.setDate(date.getDate() + 1);
    const pad = (part) => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }, initialDate);
  await expect(page.locator('#selected-date')).toHaveText(expectedDate);
  await expect(page.locator('.timeline-day-header')).toHaveAttribute('data-date', expectedDate);

  await page.locator('[data-view="week"]').click();
  await expect(page.locator('.calendar-grid')).toHaveClass(/\bweek\b/);
  await expect(page.locator(`.timeline-day-header[data-date="${expectedDate}"]`)).toHaveClass(/selected/);
});
