import { buildStorageView, defaultChildLocationForSlot, prepareStorageItemResults } from './storage-map-core.js?v=20260616-ui1';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const root = $('[data-storage-map-root]');
const apiBase = root?.dataset.apiBase || '/storage-map-api.php';

const state = {
  locations: [],
  categories: [],
  initialItemId: Number(root?.dataset.initialItemId || 0),
  initialItem: null,
  selectedLocationId: null,
  view: null,
  selectedSlot: null
};

function api(path, options = {}) {
  const [cleanPath, query = ''] = String(path).split('?');
  const suffix = query ? `&${query}` : '';
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
  const headers = {
    'X-Requested-With': 'XMLHttpRequest',
    ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    ...(options.body ? { 'Content-Type': 'application/json' } : {})
  };
  return fetch(`${apiBase}?path=${encodeURIComponent(cleanPath)}${suffix}`, {
    headers,
    ...options
  }).then(async (response) => {
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
    return data;
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formData(form) {
  return Object.fromEntries(new FormData(form));
}

function itemField() {
  return $('#storage-item-id') || $('#storage-item-select');
}

function categoryField() {
  return $('#storage-category-filter');
}

function selectedCategoryId() {
  const value = categoryField()?.value || '';
  return value ? Number(value) : 0;
}

function ensureItemPicker() {
  if ($('#storage-item-results')) return;
  const legacySelect = $('#storage-item-select');
  if (!legacySelect) return;

  const hidden = document.createElement('input');
  hidden.name = 'item_id';
  hidden.id = 'storage-item-id';
  hidden.type = 'hidden';
  hidden.required = true;

  const results = document.createElement('div');
  results.id = 'storage-item-results';
  results.className = 'storage-item-results';
  results.setAttribute('role', 'listbox');
  results.setAttribute('aria-label', 'Resource 搜索结果');

  const selection = document.createElement('p');
  selection.id = 'storage-item-selection';
  selection.className = 'storage-item-selection text-muted mb-0';
  selection.textContent = '搜索并选择一个 Resource。';

  const error = document.createElement('p');
  error.id = 'storage-assignment-error';
  error.className = 'storage-assignment-error text-danger mb-0';
  error.hidden = true;

  legacySelect.replaceWith(hidden, results, selection, error);
}

function showAssignmentError(message = '') {
  const error = $('#storage-assignment-error');
  if (!error) {
    if (message) alert(message);
    return;
  }
  error.textContent = message;
  error.hidden = !message;
}

function locationDepth(location, byId) {
  let depth = 0;
  let current = location;
  const seen = new Set();
  while (current?.parent_id && !seen.has(current.id)) {
    seen.add(current.id);
    current = byId.get(Number(current.parent_id));
    depth += 1;
  }
  return depth;
}

function iconFor(location) {
  if (location.kind === 'freezer') return '<i class="fas fa-temperature-low fa-fw"></i>';
  if (location.kind === 'drawer') return '<i class="fas fa-layer-group fa-fw"></i>';
  if (location.kind === 'box') return '<i class="fas fa-border-all fa-fw"></i>';
  return '<i class="fas fa-location-dot fa-fw"></i>';
}

function renderTree() {
  const byId = new Map(state.locations.map((location) => [Number(location.id), location]));
  const sorted = [...state.locations].sort((a, b) => {
    const depth = locationDepth(a, byId) - locationDepth(b, byId);
    return depth || String(a.position_code || '').localeCompare(String(b.position_code || '')) || Number(a.id) - Number(b.id);
  });
  $('#storage-location-count').textContent = `${state.locations.length}`;
  $('#storage-location-tree').innerHTML = sorted.length ? sorted.map((location) => {
    const active = Number(location.id) === Number(state.selectedLocationId) ? ' active' : '';
    return `
      <button class="storage-tree-node${active}" data-location-id="${location.id}" style="--depth:${locationDepth(location, byId)}" type="button">
        <span>${iconFor(location)}</span>
        <strong>${escapeHtml(location.name)}</strong>
        <small>${escapeHtml(location.kind)}${location.position_code ? ` · ${escapeHtml(location.position_code)}` : ''}${location.layout_type === 'grid' ? ` · ${location.row_count}x${location.column_count}` : ''}</small>
      </button>
    `;
  }).join('') : '<p class="text-muted">还没有位置，先新建一个冰箱。</p>';
  $$('.storage-tree-node').forEach((button) => button.addEventListener('click', () => selectLocation(Number(button.dataset.locationId))));
}

function updateLocationActions() {
  const hasSelection = Boolean(state.selectedLocationId);
  $('#storage-edit-location').hidden = !hasSelection;
  $('#storage-delete-location').hidden = !hasSelection;
}

function locationTrail(locationId) {
  const byId = new Map(state.locations.map((location) => [Number(location.id), location]));
  const trail = [];
  const seen = new Set();
  let current = byId.get(Number(locationId));
  while (current && !seen.has(Number(current.id))) {
    trail.unshift(current);
    seen.add(Number(current.id));
    current = current.parent_id ? byId.get(Number(current.parent_id)) : null;
  }
  return trail;
}

function renderBreadcrumb(locationId) {
  const breadcrumb = $('#storage-breadcrumb');
  const trail = locationTrail(locationId);
  breadcrumb.innerHTML = trail.map((location, index) => `
    ${index ? '<i class="fas fa-chevron-right fa-fw"></i>' : ''}
    <button type="button" data-breadcrumb-location="${location.id}">${escapeHtml(location.name)}</button>
  `).join('');
  $$('[data-breadcrumb-location]').forEach((button) => button.addEventListener('click', () => selectLocation(Number(button.dataset.breadcrumbLocation))));
}

function locationKindLabel(location) {
  return ({ freezer: '冰箱', drawer: '抽屉', box: '冻存盒', location: '位置' })[location.kind] || location.kind;
}

function updateOccupancy(view = null, childCount = 0) {
  const node = $('#storage-occupancy');
  if (!view?.slots) {
    node.textContent = childCount ? `${childCount} 个下级位置` : '暂无下级位置';
    node.hidden = false;
    return;
  }
  const occupied = view.slots.filter((slot) => slot.assignment).length;
  const children = view.slots.filter((slot) => slot.child).length;
  const total = view.slots.length;
  node.textContent = `${occupied + children} / ${total} 已使用`;
  node.hidden = false;
}

function closeSlotDetail() {
  $('[data-storage-detail-panel]')?.classList.add('is-empty');
}

function openSlotDetail() {
  $('[data-storage-detail-panel]')?.classList.remove('is-empty');
}

async function loadLocations() {
  state.locations = await api('locations');
  if (state.selectedLocationId && !state.locations.some((location) => Number(location.id) === Number(state.selectedLocationId))) {
    state.selectedLocationId = null;
  }
  if (!state.selectedLocationId && state.locations.length) {
    state.selectedLocationId = Number(state.locations[0].id);
  }
  renderTree();
  updateLocationActions();
  if (state.selectedLocationId) await selectLocation(state.selectedLocationId);
}

async function loadInitialItem() {
  if (!state.initialItemId) return;
  const items = await api(`items?item_id=${state.initialItemId}`);
  state.initialItem = items[0] || null;
}

async function loadCategories() {
  state.categories = await api('categories');
  renderCategoryOptions();
}

function renderCategoryOptions() {
  const select = categoryField();
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">全部分类</option>' + state.categories.map((category) => (
    `<option value="${category.id}">${escapeHtml(category.title)}</option>`
  )).join('');
  select.value = state.categories.some((category) => Number(category.id) === Number(current)) ? current : '';
}

async function selectLocation(locationId) {
  state.selectedLocationId = Number(locationId);
  state.selectedSlot = null;
  renderTree();
  updateLocationActions();
  const location = state.locations.find((item) => Number(item.id) === Number(locationId));
  if (!location) return;
  closeSlotDetail();
  renderBreadcrumb(location.id);
  $('#storage-selected-name').textContent = location.name;
  $('#storage-selected-meta').textContent = `${locationKindLabel(location)}${location.position_code ? ` · ${location.position_code}` : ''}${location.layout_type === 'grid' ? ` · ${location.row_count} × ${location.column_count}` : ''}`;
  $('#storage-location-kind-icon').innerHTML = iconFor(location);
  $('#storage-slot-detail').innerHTML = '<p class="text-muted">点击孔位查看样本和历史。</p>';

  if (location.layout_type !== 'grid') {
    const children = state.locations.filter((item) => Number(item.parent_id) === Number(location.id));
    updateOccupancy(null, children.length);
    $('#storage-grid').className = 'storage-grid-empty';
    $('#storage-grid').innerHTML = children.length
      ? children.map((child) => `<button class="storage-child-location" data-location-id="${child.id}" type="button"><strong>${escapeHtml(child.name)}</strong><span>${escapeHtml(child.kind)}</span></button>`).join('')
      : '这个位置下还没有子位置。';
    $$('.storage-child-location').forEach((button) => button.addEventListener('click', () => selectLocation(Number(button.dataset.locationId))));
    return;
  }

  const data = await api(`locations/${location.id}/view`);
  state.view = buildStorageView(data);
  updateOccupancy(state.view);
  renderGrid(state.view);
}

function renderGrid(view) {
  if (view.location.kind === 'freezer') {
    renderFreezer(view);
    return;
  }
  if (view.location.kind === 'drawer') {
    renderDrawer(view);
    return;
  }
  renderBox(view);
}

function renderFreezer(view) {
  const grid = $('#storage-grid');
  grid.className = 'storage-freezer-cabinet';
  grid.style.setProperty('--columns', view.columns);
  grid.innerHTML = view.slots.map((slot) => `
    <button class="storage-freezer-slot ${slot.state}" data-slot-code="${slot.code}" type="button">
      <span class="storage-slot-code">${slot.code}</span>
      <strong>${slot.child ? escapeHtml(slot.child.name) : slot.assignment ? escapeHtml(slot.assignment.item_title) : '空位'}</strong>
      <small>${slot.child ? locationKindLabel(slot.child) : slot.assignment ? `${slot.assignment.qty_stored} ${escapeHtml(slot.assignment.qty_unit)}` : '可用'}</small>
    </button>
  `).join('');
  $$('.storage-freezer-slot').forEach((button) => button.addEventListener('click', () => showSlot(view.slots.find((slot) => slot.code === button.dataset.slotCode))));
}

function renderBox(view) {
  const grid = $('#storage-grid');
  grid.className = 'storage-box-shell';
  grid.innerHTML = `<div class="storage-box-grid" style="--columns:${view.columns}">
    ${view.slots.map((slot) => `
      <button class="storage-slot-cell ${slot.state}" data-slot-code="${slot.code}" type="button" title="${slot.assignment ? escapeHtml(slot.assignment.item_title) : slot.child ? escapeHtml(slot.child.name) : `空位 ${slot.code}`}">
        <span class="storage-slot-code">${slot.code}</span>
        ${slot.assignment ? `<strong>${escapeHtml(slot.assignment.item_title)}</strong>` : ''}
      </button>
    `).join('')}
  </div>`;
  $$('.storage-slot-cell').forEach((button) => button.addEventListener('click', () => showSlot(view.slots.find((slot) => slot.code === button.dataset.slotCode))));
}

function renderDrawer(view) {
  const grid = $('#storage-grid');
  grid.className = 'storage-drawer-depth';
  grid.innerHTML = Array.from({ length: view.rows }, (_, index) => {
    const row = index + 1;
    const rowSlots = view.slots.filter((slot) => slot.row === row);
    return `
      <section class="storage-drawer-row">
        <div class="storage-drawer-label">${rowSlots[0]?.rowLabel || row}</div>
        <div class="storage-drawer-track" style="--columns:${view.columns}">
          ${rowSlots.map((slot) => `
            <button class="storage-drawer-spine ${slot.state}" data-slot-code="${slot.code}" type="button">
              <span class="storage-slot-code">${slot.code}</span>
              <strong>${slot.child ? escapeHtml(slot.child.name) : ''}</strong>
              <small>${slot.child ? escapeHtml(slot.child.kind) : '空'}</small>
            </button>
          `).join('')}
        </div>
      </section>
    `;
  }).join('');
  $$('.storage-drawer-spine').forEach((button) => button.addEventListener('click', () => showSlot(view.slots.find((slot) => slot.code === button.dataset.slotCode))));
}

function openLocationDialog(location = null, defaults = {}) {
  const dialog = $('#storage-location-dialog');
  const form = $('#storage-location-form');
  form.reset();
  const data = location || defaults;
  form.id.value = data.id || '';
  form.parent_id.value = data.parent_id || '';
  form.position_code.value = data.position_code || '';
  form.name.value = data.name || '';
  form.kind.value = data.kind || 'freezer';
  form.layout_type.value = data.layout_type || 'grid';
  form.rows.value = data.rows ?? data.row_count ?? (form.kind.value === 'box' ? 9 : 4);
  form.columns.value = data.columns ?? data.column_count ?? (form.kind.value === 'box' ? 9 : 6);
  form.notes.value = data.notes || '';
  dialog.showModal();
  form.name.focus();
}

function openAssignmentDialog(slot) {
  const dialog = $('#storage-assignment-dialog');
  const form = $('#storage-assignment-form');
  form.reset();
  const selectedItem = slot.assignment ? {
    id: slot.assignment.item_id,
    title: slot.assignment.item_title,
    category_id: slot.assignment.item_category_id,
    category_title: slot.assignment.item_category_title || ''
  } : state.initialItem;
  form.location_id.value = state.selectedLocationId;
  form.slot_code.value = slot.code;
  const field = itemField();
  if (field) field.value = selectedItem?.id || '';
  form.qty_stored.value = slot.assignment?.qty_stored || '1';
  form.qty_unit.value = slot.assignment?.qty_unit || 'tube';
  form.note.value = slot.assignment?.note || '';
  if (categoryField()) {
    categoryField().value = selectedItem?.category_id || '';
  }
  $('#storage-assignment-title').textContent = `填入孔位 ${slot.code}`;
  $('#storage-item-search').value = selectedItem?.title || '';
  showAssignmentError('');
  const results = $('#storage-item-results');
  if (results) results.innerHTML = '';
  updateItemSelection(selectedItem || null);
  dialog.showModal();
  $('#storage-item-search').focus();
}

async function showSlot(slot) {
  state.selectedSlot = slot;
  openSlotDetail();
  const location = state.locations.find((item) => Number(item.id) === Number(state.selectedLocationId));
  if (slot.child) {
    $('#storage-slot-detail').innerHTML = `
      <span class="storage-slot-badge">${slot.code}</span>
      <h3 class="h5 mt-2">${escapeHtml(slot.child.name)}</h3>
      <p>${escapeHtml(slot.child.kind)} · 子位置</p>
      <button id="storage-open-child" class="btn btn-secondary btn-sm" type="button">打开这个位置</button>
    `;
    $('#storage-open-child').addEventListener('click', () => selectLocation(Number(slot.child.id)));
    return;
  }
  const childDefault = defaultChildLocationForSlot(location, slot.code);
  if (!slot.assignment && childDefault) {
    $('#storage-slot-detail').innerHTML = `
      <span class="storage-slot-badge">${slot.code}</span>
      <h3 class="h5 mt-2">空位置</h3>
      <p>在这里创建 ${childDefault.kind === 'drawer' ? '抽屉' : '盒子'}。</p>
      <button id="storage-create-child" class="btn btn-primary btn-sm" type="button">创建并进入</button>
    `;
    $('#storage-create-child').addEventListener('click', async () => {
      const created = await api('locations', {
        method: 'POST',
        body: JSON.stringify({ ...childDefault, parent_id: state.selectedLocationId })
      });
      await loadLocations();
      await selectLocation(Number(created.id));
    });
    return;
  }
  if (!slot.assignment) {
    $('#storage-slot-detail').innerHTML = `
      <span class="storage-slot-badge">${slot.code}</span>
      <h3 class="h5 mt-2">空孔位</h3>
      <p>把一个 eLabFTW Resource 链接到当前盒子的 ${slot.code}。</p>
      <button id="storage-assign-slot" class="btn btn-primary btn-sm" type="button">填入 Resource</button>
    `;
    $('#storage-assign-slot').addEventListener('click', () => openAssignmentDialog(slot));
    return;
  }
  const movements = await api(`movements?item_id=${slot.assignment.item_id}`);
  $('#storage-slot-detail').innerHTML = `
    <span class="storage-slot-badge">${slot.code}</span>
    <h3 class="h5 mt-2">${escapeHtml(slot.assignment.item_title)}</h3>
    <p>${slot.assignment.qty_stored} ${escapeHtml(slot.assignment.qty_unit)} · <a href="/database.php?mode=view&id=${slot.assignment.item_id}">打开 Resource</a></p>
    ${slot.assignment.note ? `<p>${escapeHtml(slot.assignment.note)}</p>` : ''}
    <div class="btn-group btn-group-sm mb-3">
      <button id="storage-edit-assignment" class="btn btn-secondary" type="button">修改</button>
      <button id="storage-remove-assignment" class="btn btn-danger" type="button">取用/删除</button>
    </div>
    <div class="storage-movement-list">
      ${movements.map((movement) => `
        <article>
          <strong>${escapeHtml(movement.action)}</strong>
          <p class="mb-1 text-muted">${escapeHtml(movement.created_at)} · ${escapeHtml(movement.user_name || '')}</p>
          <p class="mb-0">${escapeHtml(movement.from_location_name || '')}${movement.from_slot_code ? ` / ${movement.from_slot_code}` : ''} → ${escapeHtml(movement.to_location_name || '')}${movement.to_slot_code ? ` / ${movement.to_slot_code}` : ''}</p>
        </article>
      `).join('') || '<p class="text-muted">暂无历史</p>'}
    </div>
  `;
  $('#storage-edit-assignment').addEventListener('click', () => openAssignmentDialog(slot));
  $('#storage-remove-assignment').addEventListener('click', async () => {
    if (!confirm('从这个孔位取用/删除记录？Resource 本身不会被删除。')) return;
    await api(`assignments/${slot.assignment.id}`, { method: 'DELETE' });
    await selectLocation(state.selectedLocationId);
  });
}

async function searchItems(query = '') {
  const categoryId = selectedCategoryId();
  const items = await api(`items?q=${encodeURIComponent(query)}${categoryId ? `&category_id=${categoryId}` : ''}`);
  renderItemResults(items, query);
}

function updateItemSelection(item = null) {
  const field = itemField();
  const selectedId = item?.id || field?.value || '';
  if (field) field.value = selectedId;
  const selection = $('#storage-item-selection');
  if (selection) {
    selection.textContent = item
      ? `已选择：${item.title} · #${item.id}${item.category_title ? ` · ${item.category_title}` : ''}`
      : '搜索并选择一个 Resource。';
  }
  $$('.storage-item-result').forEach((button) => {
    button.classList.toggle('active', Number(button.dataset.itemId) === Number(selectedId));
  });
}

function renderItemResults(items = [], query = '') {
  const field = itemField();
  const results = prepareStorageItemResults(items, field?.value || '');
  const resultList = $('#storage-item-results');
  if (!resultList) {
    const legacySelect = $('#storage-item-select');
    if (!legacySelect) return;
    legacySelect.innerHTML = results.map((item) => `<option value="${item.id}"${item.selected ? ' selected' : ''}>${escapeHtml(item.title)} · #${item.id}</option>`).join('');
    return;
  }
  const trimmedQuery = query.trim();
  resultList.innerHTML = results.length ? results.map((item) => `
    <button class="storage-item-result${item.selected ? ' active' : ''}" data-item-id="${item.id}" data-item-title="${escapeHtml(item.title)}" data-category-id="${item.category_id || ''}" data-category-title="${escapeHtml(item.category_title || '')}" type="button" role="option" aria-selected="${item.selected ? 'true' : 'false'}">
      <strong>${escapeHtml(item.title)}</strong>
      <span>#${item.id}${item.category_title ? ` · ${escapeHtml(item.category_title)}` : ''}</span>
    </button>
  `).join('') : `
    <div class="storage-item-empty">
      ${trimmedQuery ? `没有找到“${escapeHtml(trimmedQuery)}”。` : '暂无可选 Resource。'}
      ${trimmedQuery ? `<button class="btn btn-primary btn-sm mt-2" id="storage-create-item-from-query" type="button">新建 Resource：${escapeHtml(trimmedQuery)}${selectedCategoryId() ? ` · ${escapeHtml(categoryField()?.selectedOptions[0]?.textContent || '')}` : ''}</button>` : '<span>可以先输入样品名搜索或新建。</span>'}
    </div>
  `;
  $$('.storage-item-result').forEach((button) => button.addEventListener('click', () => {
    updateItemSelection({
      id: button.dataset.itemId,
      title: button.dataset.itemTitle,
      category_id: button.dataset.categoryId || null,
      category_title: button.dataset.categoryTitle || ''
    });
  }));
  $('#storage-create-item-from-query')?.addEventListener('click', async () => {
    const item = await api('items', {
      method: 'POST',
      body: JSON.stringify({ title: trimmedQuery, category_id: selectedCategoryId() || null })
    });
    $('#storage-item-search').value = item.title;
    renderItemResults([item], item.title);
    updateItemSelection(item);
  });
}

function bindControls() {
  ensureItemPicker();
  $('#storage-detail-close').addEventListener('click', closeSlotDetail);
  $('#storage-new-freezer').addEventListener('click', () => openLocationDialog(null, {
    name: '-80 冰箱',
    kind: 'freezer',
    layout_type: 'grid',
    rows: 4,
    columns: 6
  }));
  $('#storage-edit-location').addEventListener('click', () => {
    const location = state.locations.find((item) => Number(item.id) === Number(state.selectedLocationId));
    if (location) openLocationDialog(location);
  });
  $('#storage-delete-location').addEventListener('click', async () => {
    if (!state.selectedLocationId || !confirm('删除选中位置？需要先清空子位置和孔位记录。')) return;
    await api(`locations/${state.selectedLocationId}`, { method: 'DELETE' });
    state.selectedLocationId = null;
    updateLocationActions();
    await loadLocations();
  });
  $$('[data-dialog-close]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
  $('#storage-location-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = formData(event.currentTarget);
    const id = data.id;
    const path = id ? `locations/${id}` : 'locations';
    await api(path, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(data) });
    $('#storage-location-dialog').close();
    await loadLocations();
  });
  $('#storage-item-search').addEventListener('input', (event) => searchItems(event.target.value));
  categoryField()?.addEventListener('change', () => {
    const field = itemField();
    if (field) field.value = '';
    updateItemSelection(null);
    searchItems($('#storage-item-search').value);
  });
  $('#storage-assignment-dialog').addEventListener('toggle', (event) => {
    if (!event.target.open) return;
    const selectedItem = state.selectedSlot?.assignment ? {
      id: state.selectedSlot.assignment.item_id,
      title: state.selectedSlot.assignment.item_title,
      category_id: state.selectedSlot.assignment.item_category_id,
      category_title: state.selectedSlot.assignment.item_category_title || ''
    } : state.initialItem;
    if (selectedItem) {
      renderItemResults([selectedItem], selectedItem.title);
      updateItemSelection(selectedItem);
      return;
    }
    searchItems('');
  });
  $('#storage-assignment-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = formData(event.currentTarget);
    if (!data.item_id) {
      showAssignmentError('请先从搜索结果里选择一个 Resource。');
      return;
    }
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    showAssignmentError('');
    try {
      await api('assignments', { method: 'POST', body: JSON.stringify(data) });
      $('#storage-assignment-dialog').close();
      await selectLocation(state.selectedLocationId);
    } catch (error) {
      showAssignmentError(error.message || '保存失败');
    } finally {
      submitButton.disabled = false;
    }
  });
}

bindControls();
async function init() {
  await loadCategories();
  await loadInitialItem();
  await loadLocations();
}

init().catch((error) => {
  $('#storage-grid').textContent = error.message;
  console.error(error);
});
