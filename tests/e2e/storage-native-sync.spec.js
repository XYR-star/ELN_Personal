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

async function storageApi(page, path, options = {}) {
  return page.evaluate(async ({ path, options }) => {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
    const response = await fetch(`/storage-map-api.php?path=${encodeURIComponent(path)}`, {
      ...options,
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        ...(options.body ? { 'Content-Type': 'application/json' } : {})
      }
    });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
    return data;
  }, { path, options });
}

loadLocalEnv();

const authFile = process.env.ELAB_STORAGE_STATE || 'playwright/.auth/elabftw.json';
if (existsSync(authFile)) {
  test.use({ storageState: authFile });
}

test('visual storage assignment appears in the native resource storage panel', async ({ page }) => {
  test.setTimeout(90000);
  const suffix = `${Date.now()}`.slice(-7);
  const resourceTitle = `E2E native sync resource ${suffix}`;
  const freezerName = `E2E native sync freezer ${suffix}`;
  let itemId;
  let freezer;
  let drawer;
  let box;
  let assignment;
  let category;

  await openAuthed(page, '/storage-map.php');

  try {
    const categories = await storageApi(page, 'categories');
    expect(categories.length).toBeGreaterThan(0);
    category = categories[0];

    const item = await storageApi(page, 'items', {
      method: 'POST',
      body: JSON.stringify({ title: resourceTitle, category_id: category.id })
    });
    itemId = item.id;
    expect(item.category_id).toBe(category.id);

    freezer = await storageApi(page, 'locations', {
      method: 'POST',
      body: JSON.stringify({ name: freezerName, kind: 'freezer', layout_type: 'grid', rows: 1, columns: 1 })
    });
    drawer = await storageApi(page, 'locations', {
      method: 'POST',
      body: JSON.stringify({ parent_id: freezer.id, name: '抽屉 A1', kind: 'drawer', layout_type: 'grid', rows: 1, columns: 1, position_code: 'A1' })
    });
    box = await storageApi(page, 'locations', {
      method: 'POST',
      body: JSON.stringify({ parent_id: drawer.id, name: '盒子 A1', kind: 'box', layout_type: 'grid', rows: 1, columns: 2, position_code: 'A1' })
    });
    assignment = await storageApi(page, 'assignments', {
      method: 'POST',
      body: JSON.stringify({ location_id: box.id, slot_code: 'A1', item_id: itemId, qty_stored: 2, qty_unit: 'tube', note: 'native sync e2e' })
    });

    await openAuthed(page, `/database.php?mode=edit&id=${itemId}`);

    await expect(page.locator('#storageDivContent')).toContainText(freezerName);
    await expect(page.locator('#storageDivContent')).toContainText('抽屉 A1');
    await expect(page.locator('#storageDivContent')).toContainText('盒子 A1');
    await expect(page.locator('#storageDivContent')).toContainText('A1');
    await expect(page.locator('#storageDivContent')).toContainText('2.00');
    await expect(page.locator('#storageDivContent')).toContainText('tube');
    const storageLink = page.locator('a[href^="storage-map.php?item_id="]');
    await expect(storageLink).toContainText(/Visual storage|可视化放入/);
    await expect(storageLink).toHaveAttribute('href', new RegExp(`item_id=${itemId}`));

    const storageHref = await storageLink.getAttribute('href');
    await page.goto(storageHref);
    await expect(page).toHaveURL(new RegExp(`storage-map\\.php\\?item_id=${itemId}`));
    await page.locator(`.storage-tree-node[data-location-id="${box.id}"]`).dispatchEvent('click');
    await expect(page.locator('#storage-selected-name')).toContainText('盒子 A1');
    await page.locator('.storage-slot-cell[data-slot-code="A2"]').dispatchEvent('click');
    await page.locator('#storage-assign-slot').dispatchEvent('click');
    await expect(page.locator('#storage-category-filter')).toHaveValue(String(category.id));
    await expect(page.locator('#storage-item-selection')).toContainText(resourceTitle);
    await expect(page.locator('#storage-item-selection')).toContainText(category.title);
  } finally {
    if (assignment?.id) await storageApi(page, `assignments/${assignment.id}`, { method: 'DELETE' }).catch(() => {});
    if (box?.id) await storageApi(page, `locations/${box.id}`, { method: 'DELETE' }).catch(() => {});
    if (drawer?.id) await storageApi(page, `locations/${drawer.id}`, { method: 'DELETE' }).catch(() => {});
    if (freezer?.id) await storageApi(page, `locations/${freezer.id}`, { method: 'DELETE' }).catch(() => {});
    if (itemId) await page.request.delete(`/api/v2/items/${itemId}`, { headers: { 'X-Requested-With': 'XMLHttpRequest' } }).catch(() => {});
  }
});
