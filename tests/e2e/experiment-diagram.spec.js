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
  await page.waitForLoadState('domcontentloaded');
  await expect(page).not.toHaveURL(/login|logout/);
}

async function createTempExperiment(page, title) {
  const result = await page.evaluate(async (experimentTitle) => {
    const headers = {
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/json'
    };
    const response = await fetch('/api/v2/experiments', {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: experimentTitle, body: '<p>temporary e2e experiment</p>' })
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to create experiment (${response.status}): ${text.slice(0, 200)}`);
    }
    const location = response.headers.get('location') || '';
    const id = Number(location.match(/\/experiments\/(\d+)/)?.[1] || location.match(/(\d+)$/)?.[1]);
    if (!id) throw new Error(`Could not parse experiment id from Location: ${location}`);
    return { id };
  }, title);
  return result.id;
}

async function deleteTempExperiment(page, id) {
  await page.request.delete(`/api/v2/experiments/${id}`, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  });
}

loadLocalEnv();

const authFile = process.env.ELAB_STORAGE_STATE || 'playwright/.auth/elabftw.json';
if (existsSync(authFile)) {
  test.use({ storageState: authFile });
}

test('experiment edit page exposes a local diagram panel above main text', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/dashboard.php', { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);
  const experimentId = await createTempExperiment(page, `E2E diagram panel ${Date.now()}`);

  try {
    await page.goto(`/experiments.php?mode=edit&id=${experimentId}`, { waitUntil: 'domcontentloaded' });

    await expect(page.locator('[data-experiment-diagram-root]')).toBeVisible();
    await expect(page.locator('[data-experiment-diagram-root]')).toContainText(/Experiment diagram|实验流程图/);
    const mainTextHeading = page.locator('h3[role="button"]').filter({ hasText: /Main text|正文|主要文本/i });
    await expect(mainTextHeading).toBeVisible();

    const diagramTop = await page.locator('[data-experiment-diagram-root]').boundingBox();
    const bodyTop = await mainTextHeading.boundingBox();
    expect(diagramTop?.y).toBeLessThan(bodyTop?.y ?? 0);
    expect(errors).toEqual([]);
  } finally {
    await deleteTempExperiment(page, experimentId);
  }
});

test('experiment edit page saves lightweight Google Drive links', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/dashboard.php', { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);
  const experimentId = await createTempExperiment(page, `E2E drive links ${Date.now()}`);

  try {
    await page.goto(`/experiments.php?mode=edit&id=${experimentId}`, { waitUntil: 'domcontentloaded' });

    const panel = page.locator('[data-drive-links-root]');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(/Drive files|Drive 文件/);

    await page.locator('[data-drive-link-add]').dispatchEvent('click');
    await page.locator('[data-drive-link-title]').fill('Raw microscopy images');
    await page.locator('[data-drive-link-url]').fill('https://drive.google.com/file/d/abc123/view?usp=sharing');
    await page.locator('[data-drive-link-note]').fill('day 1 images');
    await page.locator('[data-drive-link-save]').dispatchEvent('click');

    await expect(panel.locator('[data-drive-link-card]')).toContainText('Raw microscopy images');
    await expect(panel.locator('[data-drive-link-card]')).toContainText('drive.google.com');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-drive-link-card]')).toContainText('Raw microscopy images');

    await page.locator('[data-drive-link-delete]').dispatchEvent('click');
    await expect(page.locator('[data-drive-link-card]')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await deleteTempExperiment(page, experimentId);
  }
});

test('experiment diagram editor opens without saving changes', async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto('/dashboard.php', { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);
  const experimentId = await createTempExperiment(page, `E2E diagram editor ${Date.now()}`);

  try {
    await page.goto(`/experiments.php?mode=edit&id=${experimentId}`, { waitUntil: 'domcontentloaded' });

    const openButton = page.locator('[data-experiment-diagram-open]');
    await expect(openButton).toBeVisible();
    await openButton.dispatchEvent('click');
    await expect(page.locator('[data-experiment-diagram-dialog]')).toBeVisible();
    await expect(page.locator('[data-experiment-diagram-canvas] .excalidraw')).toBeVisible();
    await page.locator('[data-experiment-diagram-close]').dispatchEvent('click');
    await expect(page.locator('[data-experiment-diagram-dialog]')).not.toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await deleteTempExperiment(page, experimentId);
  }
});

test('experiment diagram preview stays compact for tall diagrams', async ({ page }) => {
  await page.goto('/dashboard.php', { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);
  const experimentId = await createTempExperiment(page, `E2E compact diagram ${Date.now()}`);

  try {
    await page.goto(`/experiments.php?mode=edit&id=${experimentId}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async (id) => {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
      const headers = {
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
      };
      const response = await fetch(`/experiment-diagram-api.php?id=${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          scene: {
            elements: [],
            appState: { viewBackgroundColor: '#ffffff' },
            files: {}
          },
          preview_svg: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><rect width="1200" height="900" fill="white"/><text x="40" y="80">tall diagram</text><circle cx="1100" cy="820" r="40" fill="none" stroke="black"/></svg>'
        })
      });
      if (!response.ok) throw new Error(`Failed to seed compact preview: ${response.status}`);
    }, experimentId);

    await page.reload({ waitUntil: 'domcontentloaded' });

    const previewMetrics = await page.locator('[data-experiment-diagram-preview]').evaluate((element) => {
      const svg = element.querySelector('svg');
      const containerBox = element.getBoundingClientRect();
      const svgBox = svg?.getBoundingClientRect();
      return {
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        containerHeight: containerBox.height,
        svgHeight: svgBox?.height || 0,
        svgWidth: svgBox?.width || 0
      };
    });
    expect(previewMetrics.containerHeight).toBeLessThanOrEqual(430);
    expect(previewMetrics.scrollHeight).toBeLessThanOrEqual(previewMetrics.clientHeight + 1);
    expect(previewMetrics.svgHeight).toBeLessThanOrEqual(previewMetrics.clientHeight);
    expect(previewMetrics.svgWidth).toBeGreaterThan(0);
  } finally {
    await deleteTempExperiment(page, experimentId);
  }
});

test('experiment diagram API saves and restores a local scene', async ({ page }) => {
  await page.goto('/dashboard.php', { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);
  const experimentId = await createTempExperiment(page, `E2E diagram API ${Date.now()}`);

  try {
    await page.goto(`/experiments.php?mode=edit&id=${experimentId}`, { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(async (id) => {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
    const headers = {
      'X-Requested-With': 'XMLHttpRequest',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
    };
    const jsonHeaders = { ...headers, 'Content-Type': 'application/json' };
    const url = `/experiment-diagram-api.php?id=${id}`;
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
  }, experimentId);

    expect(result).toEqual({ savedHasPreview: true, loadedHasPreview: true });
  } finally {
    await deleteTempExperiment(page, experimentId);
  }
});

test('mobile quick upload attaches a file through the native uploads API', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard.php', { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);
  const experimentId = await createTempExperiment(page, `E2E mobile upload ${Date.now()}`);

  try {
    await page.goto(`/experiments.php?mode=edit&id=${experimentId}`, { waitUntil: 'domcontentloaded' });

    const fileName = `mobile-quick-upload-${Date.now()}.txt`;
    await expect(page.locator('[data-mobile-quick-upload]')).toBeVisible();
    await expect(page.locator('[data-mobile-upload-trigger="image"]')).toBeVisible();
    await expect(page.locator('[data-mobile-upload-trigger="file"]')).toBeVisible();
    await expect(page.locator('[data-mobile-upload-input="image"]')).toHaveAttribute('accept', 'image/*');
    await expect(page.locator('[data-mobile-upload-input="image"]')).toHaveAttribute('capture', 'environment');

    await page.locator('[data-mobile-upload-input="file"]').setInputFiles({
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from('mobile quick upload smoke test\n')
    });

    await expect.poll(async () => page.evaluate(async ({ id, name }) => {
      const response = await fetch(`/api/v2/experiments/${id}/uploads`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });
      if (!response.ok) return false;
      const uploads = await response.json();
      return uploads.some((item) => item.real_name === name);
    }, {
      id: experimentId,
      name: fileName
    }), {
      timeout: 20000
    }).toBe(true);

    await page.goto(`/experiments.php?mode=edit&id=${experimentId}#filesDiv`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#filesDiv')).toContainText(fileName);

    const cleanup = await page.evaluate(async ({ id, name }) => {
      const headers = { 'X-Requested-With': 'XMLHttpRequest' };
      const uploadsResponse = await fetch(`/api/v2/experiments/${id}/uploads`, { headers });
      if (!uploadsResponse.ok) return { deleted: false, reason: `read ${uploadsResponse.status}` };
      const uploads = await uploadsResponse.json();
      const upload = uploads.find((item) => item.real_name === name);
      if (!upload) return { deleted: false, reason: 'not found' };
      const deleteResponse = await fetch(`/api/v2/experiments/${id}/uploads/${upload.id}`, {
        method: 'DELETE',
        headers
      });
      return { deleted: deleteResponse.ok, status: deleteResponse.status };
    }, {
      id: experimentId,
      name: fileName
    });

    expect(cleanup.deleted).toBe(true);
  } finally {
    await deleteTempExperiment(page, experimentId);
  }
});
