import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('experiment editor puts the primary markdown editor before supporting tools', () => {
  const template = read('edit.html');
  const editor = template.indexOf("{% include 'silverbullet-editor.html' %}");
  const diagram = template.indexOf("{% include 'experiment-diagram.html' %}");
  const drive = template.indexOf("{% include 'drive-links.html' %}");

  assert.ok(editor > 0);
  assert.ok(editor < diagram);
  assert.ok(editor < drive);
  assert.match(template, /data-native-main-text-section/);
});

test('native main text fallback is hidden as one section by the markdown editor', () => {
  const script = read('public/silverbullet-editor.js');

  assert.match(script, /nativeMainTextSection/);
  assert.match(script, /nativeMainTextSection\.hidden = true/);
});

test('planner todo composer can collapse on mobile', () => {
  const template = read('planner.html');
  const script = read('public/todos.js');

  assert.match(template, /<details[^>]+data-todo-composer/);
  assert.match(script, /matchMedia\('\(max-width: 575\.98px\)'\)/);
});

test('dashboard grid has a scoped class for mobile overflow containment', () => {
  const template = read('dashboard.html');
  const styles = read('public/todos.css');

  assert.match(template, /class='row dashboard-grid'/);
  assert.match(styles, /\.dashboard-grid/);
});

test('dashboard groups todos and plans into one today workspace', () => {
  const template = read('dashboard.html');

  assert.doesNotMatch(template, /Welcome %s/);
  assert.match(template, /class='dashboard-today'/);
  assert.ok(template.indexOf("id='dashboardTodos'") < template.indexOf("class='row dashboard-grid'"));
  assert.ok(template.indexOf("id='dashboardPlanner'") < template.indexOf("class='row dashboard-grid'"));
  assert.doesNotMatch(template, /col-md-4 mt-2 mt-md-0[\s\S]*id='dashboardPlanner'/);
});

test('literature empty state presents explicit sync and local-paper actions', () => {
  const template = read('literature.html');
  const script = read('public/literature.js');

  assert.match(template, /data-literature-empty-refresh/);
  assert.match(template, /data-literature-empty-new-paper/);
  assert.match(script, /emptyRefreshButton/);
  assert.match(script, /emptyNewPaperButton/);
});

test('literature uses a focused library and reading workspace', () => {
  const template = read('literature.html');
  const script = read('public/literature.js');
  const styles = read('public/literature.css');

  assert.match(template, /class='literature-library-pane'/);
  assert.match(template, /class='literature-reading-pane'/);
  assert.match(template, /class='literature-filter-drawer'/);
  assert.doesNotMatch(template, /literature-detail-panel/);
  assert.match(script, /literature-paper-workspace/);
  assert.match(script, /literature-capture/);
  assert.match(styles, /grid-template-columns:\s*minmax\(300px, 370px\) minmax\(0, 1fr\)/);
});

test('global mobile polish provides full-size entity toolbar targets', () => {
  const head = read('head.html');
  const styles = read('public/eln-ux.css');

  assert.match(head, /planner-assets\/eln-ux\.css/);
  assert.match(styles, /min-width:\s*44px/);
  assert.match(styles, /min-height:\s*44px/);
});

test('storage location save relies on one post-save selection refresh', () => {
  const script = read('public/storage-map-app.js');
  const submitHandler = script.slice(script.indexOf("$('#storage-location-form').addEventListener('submit'"), script.indexOf("$('#storage-item-search').addEventListener('input'"));

  assert.match(submitHandler, /await loadLocations\(\)/);
  assert.doesNotMatch(submitHandler, /await selectLocation/);
});

test('storage map presents a spatial hierarchy instead of fixed dashboard cards', () => {
  const template = read('storage-map.html');
  const script = read('public/storage-map-app.js');
  const styles = read('public/storage-map.css');

  assert.match(template, /id='storage-breadcrumb'/);
  assert.match(template, /id='storage-occupancy'/);
  assert.match(template, /data-storage-detail-panel/);
  assert.doesNotMatch(template, /storage-native-panel/);
  assert.match(script, /function renderFreezer/);
  assert.match(script, /function renderBox/);
  assert.match(styles, /\.storage-freezer-cabinet/);
  assert.match(styles, /\.storage-slot-cell[\s\S]*border-radius:\s*50%/);
});
