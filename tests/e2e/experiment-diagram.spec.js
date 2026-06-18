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

loadLocalEnv();

const authFile = process.env.ELAB_STORAGE_STATE || 'playwright/.auth/elabftw.json';
if (existsSync(authFile)) {
  test.use({ storageState: authFile });
}

test('experiment edit page exposes a local diagram panel above main text', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/experiments.php?mode=edit&id=1');
  await loginIfNeeded(page);

  await expect(page.locator('[data-experiment-diagram-root]')).toBeVisible();
  await expect(page.locator('[data-experiment-diagram-root]')).toContainText(/Experiment diagram|实验流程图/);
  const mainTextHeading = page.locator('h3[role="button"]').filter({ hasText: /Main text|正文|主要文本/i });
  await expect(mainTextHeading).toBeVisible();

  const diagramTop = await page.locator('[data-experiment-diagram-root]').boundingBox();
  const bodyTop = await mainTextHeading.boundingBox();
  expect(diagramTop?.y).toBeLessThan(bodyTop?.y ?? 0);
  expect(errors).toEqual([]);
});

test('experiment diagram editor opens without saving changes', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/experiments.php?mode=edit&id=1');
  await loginIfNeeded(page);

  const openButton = page.locator('[data-experiment-diagram-open]');
  await expect(openButton).toBeVisible();
  await openButton.dispatchEvent('click');
  await expect(page.locator('[data-experiment-diagram-dialog]')).toBeVisible();
  await expect(page.locator('[data-experiment-diagram-canvas] .excalidraw')).toBeVisible();
  await page.locator('[data-experiment-diagram-close]').dispatchEvent('click');
  await expect(page.locator('[data-experiment-diagram-dialog]')).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('experiment diagram API saves and restores a local scene', async ({ page }) => {
  await page.goto('/experiments.php?mode=edit&id=1');
  await loginIfNeeded(page);

  const result = await page.evaluate(async () => {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
    const headers = {
      'X-Requested-With': 'XMLHttpRequest',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
    };
    const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };
    const url = '/experiment-diagram-api.php?id=1';
    const readJson = async (response) => {
      const data = response.status === 204 ? null : await response.json();
      if (!response.ok) throw new Error(data?.error || `Request failed: ${response.status}`);
      return data;
    };

    const original = await readJson(await fetch(url, { headers }));
    const testPayload = {
      scene: {
        elements: [],
        appState: { viewBackgroundColor: '#ffffff' },
        files: {}
      },
      preview_svg: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><text x="8" y="32">diagram-smoke</text></svg>'
    };

    try {
      const saved = await readJson(await fetch(url, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify(testPayload)
      }));
      const loaded = await readJson(await fetch(url, { headers }));
      return {
        savedHasPreview: saved.preview_svg.includes('diagram-smoke'),
        loadedHasPreview: loaded.preview_svg.includes('diagram-smoke')
      };
    } finally {
      if (original?.scene || original?.preview_svg) {
        await fetch(url, {
          method: 'PATCH',
          headers: jsonHeaders,
          body: JSON.stringify({
            scene: original.scene,
            preview_svg: original.preview_svg || ''
          })
        });
      } else {
        await fetch(url, { method: 'DELETE', headers });
      }
    }
  });

  expect(result).toEqual({ savedHasPreview: true, loadedHasPreview: true });
});
