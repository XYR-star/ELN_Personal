import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('resource workspace is isolated to resource show pages', () => {
  const head = read('head.html');
  assert.match(head, /scriptName == 'database\.php'/);
  assert.match(head, /resource-workspace\.css/);
  assert.match(head, /resource-workspace\.js/);
  assert.match(head, /resource-workspace-bootstrap\.js/);
  assert.match(head, /mode'\) not in \['view', 'edit'\]/);
});

test('resource workspace preserves native resource controls while adding locations', () => {
  const script = read('public/resource-workspace.js');
  assert.match(script, /data-action="checkbox-entity"/);
  assert.match(script, /data-action="toggle-pin"/);
  assert.match(script, /className = 'entity resource-workspace-row'/);
  assert.match(script, /resource\.checkbox\.addEventListener\('change'/);
  assert.match(script, /createSelectionTools/);
  assert.match(script, /setupResourceFilters/);
  assert.match(script, /simplifyNativeToolbar/);
  assert.match(script, /integrateNativeToolbar/);
  assert.match(script, /renderLocationContext/);
  assert.match(script, /renderDrawerDepth/);
  assert.match(script, /renderFreezerOverview/);
  assert.match(script, /location\.kind === 'freezer' && !location\.parent_id/);
  assert.match(script, /visibleRange\(selectedSlot\.row, view\.rows, 4\)/);
  assert.match(script, /showModal\(\)/);
  assert.match(script, /resource-locations\?item_ids=/);
  assert.match(script, /MutationObserver/);
  assert.match(script, /locations\/\$\{assignment\.location_id\}\/view/);
});

test('resource workspace has desktop split view and mobile location sheet', () => {
  const styles = read('public/resource-workspace.css');
  assert.match(styles, /grid-template-columns:\s*minmax\(0, 3fr\) minmax\(320px, 2fr\)/);
  assert.match(styles, /@media \(max-width: 767\.98px\)/);
  assert.match(styles, /\.resource-location-panel\.is-open/);
  assert.match(styles, /\.resource-bulk-dialog/);
  assert.match(styles, /\.resource-filter-toggle/);
  assert.match(styles, /\.resource-context-grid/);
  assert.match(styles, /\.resource-freezer-overview/);
  assert.match(styles, /\.resource-drawer-stage/);
  assert.match(styles, /perspective:\s*420px/);
  assert.match(styles, /resource-workspace-pending/);
  assert.match(styles, /position:\s*fixed/);
});
