import { buildStorageView, generateSlotGrid } from './storage-map-core.js?v=20260616-ui1';

const info = document.querySelector('#info[data-page="show"][data-type="items"]');

if (info) {
  const apiBase = '/storage-map-api.php';
  const isChinese = document.documentElement.lang.toLowerCase().startsWith('zh');
  const copy = isChinese ? {
    resource: '资源', category: '分类', status: '状态', updated: '更新', location: '存放位置', actions: '操作',
    unassigned: '未分配', loading: '读取中', storageLocation: '存放位置', noSelection: '尚未选择资源',
    noAssignment: '该资源尚未分配存放位置', assigned: '处存放位置', quantity: '数量', openResource: '打开资源',
    manageStorage: '管理存放', close: '关闭位置详情', emptyGrid: '该位置没有网格', loadFailed: '位置读取失败',
    edit: '编辑', pin: '置顶', selectedSlot: '当前孔位', otherSlot: '已占用', childSlot: '下级位置',
    filters: '筛选', moreFilters: '高级筛选', selected: '已选', bulkActions: '批量操作', closeBulk: '关闭批量操作',
    deleteSelected: '删除选中资源', freezer: '冰箱', drawer: '抽屉', box: '盒子', localRows: '局部孔位'
  } : {
    resource: 'Resource', category: 'Category', status: 'Status', updated: 'Updated', location: 'Location', actions: 'Actions',
    unassigned: 'Unassigned', loading: 'Loading', storageLocation: 'Storage location', noSelection: 'No resource selected',
    noAssignment: 'No storage location assigned', assigned: 'assigned locations', quantity: 'Quantity', openResource: 'Open resource',
    manageStorage: 'Manage storage', close: 'Close location details', emptyGrid: 'This location has no grid', loadFailed: 'Could not load location',
    edit: 'Edit', pin: 'Pin', selectedSlot: 'Selected slot', otherSlot: 'Occupied', childSlot: 'Child location',
    filters: 'Filters', moreFilters: 'More filters', selected: 'selected', bulkActions: 'Batch actions', closeBulk: 'Close batch actions',
    deleteSelected: 'Delete selected resources', freezer: 'Freezer', drawer: 'Drawer', box: 'Box', localRows: 'Local slots'
  };

  const state = {
    locations: [],
    assignmentsByItem: new Map(),
    resourcesById: new Map(),
    selectedItemId: null,
    selectedAssignmentId: null,
    panel: null,
    backdrop: null,
    selectionControl: null,
    bulkDialog: null,
    refreshToken: 0
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function api(path) {
    const [cleanPath, query = ''] = String(path).split('?');
    const suffix = query ? `&${query}` : '';
    return fetch(`${apiBase}?path=${encodeURIComponent(cleanPath)}${suffix}`, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
      return data;
    });
  }

  function plainText(element) {
    return element?.textContent?.replace(/\s+/g, ' ').trim() || '';
  }

  function findViewLink(entity) {
    return entity.querySelector('a[href*="database.php?mode=view"], a[href*="database.php?mode=view" i]');
  }

  function parseResources(source) {
    return [...source.querySelectorAll('.entity')].map((entity) => {
      const checkbox = entity.querySelector('[data-action="checkbox-entity"][data-id]');
      const viewLink = findViewLink(entity);
      if (!checkbox || !viewLink) return null;
      const dateCells = [...entity.querySelectorAll('.item-date')];
      const relativeMoment = entity.querySelector('.relative-moment');
      const categoryButton = entity.querySelector('.category-btn');
      const statusButton = entity.querySelector('.status-btn');
      const editLink = entity.querySelector('a[href*="database.php?mode=edit"]');
      const pinButton = entity.querySelector('[data-action="toggle-pin"]');
      const id = Number(checkbox.dataset.id);
      const dateTitle = relativeMoment?.getAttribute('title') || '';
      return {
        id,
        title: plainText(viewLink) || `Resource #${id}`,
        viewHref: viewLink.getAttribute('href') || `/database.php?mode=view&id=${id}`,
        editHref: editLink?.getAttribute('href') || `/database.php?mode=edit&id=${id}`,
        date: plainText(relativeMoment) || dateTitle.split(' ')[0] || plainText(dateCells.at(-1) || dateCells[0]),
        dateTitle,
        category: plainText(categoryButton),
        status: plainText(statusButton),
        sourceEntity: entity,
        checkbox,
        categoryButton,
        statusButton,
        pinButton
      };
    }).filter(Boolean);
  }

  function iconButton(href, icon, label, className = 'btn-secondary') {
    const link = document.createElement('a');
    link.href = href;
    link.className = `btn btn-sm ${className} resource-row-action`;
    link.title = label;
    link.setAttribute('aria-label', label);
    link.innerHTML = `<i class="fas ${icon} fa-fw" aria-hidden="true"></i>`;
    return link;
  }

  function makeCell(className, text = '') {
    const cell = document.createElement('td');
    cell.className = className;
    cell.textContent = text;
    return cell;
  }

  function makeResourceRow(resource) {
    const row = document.createElement('tr');
    row.className = 'entity resource-workspace-row';
    resource.sourceEntity.classList.remove('entity');
    row.dataset.resourceId = String(resource.id);
    row.tabIndex = 0;
    row.setAttribute('aria-selected', 'false');

    const selectCell = makeCell('resource-col-select');
    resource.checkbox.classList.remove('mr-3');
    selectCell.append(resource.checkbox);

    const titleCell = makeCell('resource-col-title');
    const titleLink = document.createElement('a');
    titleLink.href = resource.viewHref;
    titleLink.className = 'resource-title-link';
    titleLink.textContent = resource.title;
    const mobileMeta = document.createElement('span');
    mobileMeta.className = 'resource-mobile-meta';
    mobileMeta.textContent = [resource.category, resource.status].filter(Boolean).join(' · ');
    titleCell.append(titleLink, mobileMeta);

    const categoryCell = makeCell('resource-col-category');
    if (resource.categoryButton) categoryCell.append(resource.categoryButton.cloneNode(true));
    else categoryCell.append(document.createTextNode('—'));

    const statusCell = makeCell('resource-col-status');
    if (resource.statusButton) statusCell.append(resource.statusButton.cloneNode(true));
    else statusCell.append(document.createTextNode('—'));

    const updatedCell = makeCell('resource-col-updated', resource.date || '—');
    if (resource.dateTitle) updatedCell.title = resource.dateTitle;

    const locationCell = makeCell('resource-col-location');
    locationCell.dataset.locationFor = String(resource.id);
    locationCell.innerHTML = `<span class="resource-location-state is-loading"><i class="fas fa-location-dot fa-fw" aria-hidden="true"></i>${escapeHtml(copy.loading)}</span>`;

    const actionsCell = makeCell('resource-col-actions');
    actionsCell.append(iconButton(resource.editHref, 'fa-pen', copy.edit));
    if (resource.pinButton) {
      resource.pinButton.classList.remove('mr-2', 'p-2', 'border-0');
      resource.pinButton.classList.add('btn-sm', 'btn-secondary', 'resource-row-action');
      resource.pinButton.title = copy.pin;
      resource.pinButton.setAttribute('aria-label', copy.pin);
      actionsCell.append(resource.pinButton);
    }

    row.append(selectCell, titleCell, categoryCell, statusCell, updatedCell, locationCell, actionsCell);
    const select = () => selectResource(resource.id, true);
    resource.checkbox.addEventListener('change', () => {
      if (resource.checkbox.checked) select();
      updateSelectionTools();
    });
    titleLink.addEventListener('click', (event) => {
      if (!window.matchMedia('(max-width: 767.98px)').matches) return;
      event.preventDefault();
      select();
    });
    row.addEventListener('click', (event) => {
      if (!event.target.closest('a, button, input, select, textarea, [data-action]')) select();
    });
    row.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target === row) {
        event.preventDefault();
        select();
      }
    });
    return row;
  }

  function createPanel() {
    const panel = document.createElement('aside');
    panel.className = 'resource-location-panel';
    panel.id = 'resource-location-panel';
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = `
      <div class="resource-location-panel-head">
        <div><span>${escapeHtml(copy.storageLocation)}</span></div>
        <button class="btn btn-sm btn-secondary resource-location-close" type="button" title="${escapeHtml(copy.close)}" aria-label="${escapeHtml(copy.close)}"><i class="fas fa-xmark fa-fw" aria-hidden="true"></i></button>
      </div>
      <div class="resource-location-panel-body">
        <div class="resource-location-empty">
          <i class="fas fa-map-location-dot" aria-hidden="true"></i>
          <strong>${escapeHtml(copy.noSelection)}</strong>
        </div>
      </div>`;
    panel.querySelector('.resource-location-close').addEventListener('click', closeMobilePanel);
    return panel;
  }

  function selectedCountLabel(count) {
    return isChinese ? `${copy.selected} ${count}` : `${count} ${copy.selected}`;
  }

  function updateSelectionTools() {
    if (!state.selectionControl) return;
    const count = document.querySelectorAll('[data-action="checkbox-entity"]:checked').length;
    const withSelected = document.getElementById('withSelected');
    state.selectionControl.hidden = count === 0;
    state.selectionControl.querySelector('[data-resource-selected-count]').textContent = selectedCountLabel(count);
    if (withSelected) withSelected.classList.toggle('d-none', count === 0);
    if (count === 0 && state.bulkDialog?.open) state.bulkDialog.close();
  }

  function createSelectionTools(workspace) {
    const withSelected = document.getElementById('withSelected');
    if (!withSelected || !state.panel) return;

    state.selectionControl = document.createElement('div');
    state.selectionControl.className = 'resource-selection-control';
    state.selectionControl.hidden = true;
    state.selectionControl.innerHTML = `
      <button class="btn btn-sm btn-secondary resource-bulk-trigger" type="button" title="${escapeHtml(copy.bulkActions)}" aria-label="${escapeHtml(copy.bulkActions)}">
        <i class="fas fa-list-check fa-fw" aria-hidden="true"></i>
        <span data-resource-selected-count>${escapeHtml(selectedCountLabel(0))}</span>
      </button>
      <button class="btn btn-sm btn-danger resource-selection-delete" type="button" data-action="patch-selected-entities" data-what="destroy" title="${escapeHtml(copy.deleteSelected)}" aria-label="${escapeHtml(copy.deleteSelected)}"><i class="fas fa-trash fa-fw" aria-hidden="true"></i></button>`;
    const panelHead = state.panel.querySelector('.resource-location-panel-head');
    panelHead.insertBefore(state.selectionControl, panelHead.querySelector('.resource-location-close'));

    state.bulkDialog = document.createElement('dialog');
    state.bulkDialog.className = 'resource-bulk-dialog';
    state.bulkDialog.innerHTML = `
      <header class="resource-bulk-dialog-head">
        <h2>${escapeHtml(copy.bulkActions)}</h2>
        <button class="btn btn-sm btn-secondary" type="button" data-resource-bulk-close title="${escapeHtml(copy.closeBulk)}" aria-label="${escapeHtml(copy.closeBulk)}"><i class="fas fa-xmark fa-fw" aria-hidden="true"></i></button>
      </header>
      <div class="resource-bulk-dialog-body"></div>`;
    state.bulkDialog.querySelector('.resource-bulk-dialog-body').append(withSelected);
    state.bulkDialog.querySelector('[data-resource-bulk-close]').addEventListener('click', () => state.bulkDialog.close());
    state.selectionControl.querySelector('.resource-bulk-trigger').addEventListener('click', () => {
      updateSelectionTools();
      if (!state.bulkDialog.open) state.bulkDialog.showModal();
    });
    workspace.append(state.bulkDialog);
    updateSelectionTools();
  }

  function renderWorkspace(source, resources) {
    const host = source.closest('.table-container') || source;
    host.hidden = true;
    host.classList.add('resource-native-list');

    const workspace = document.createElement('section');
    workspace.className = 'resource-workspace';
    workspace.setAttribute('aria-label', copy.resource);
    const tablePanel = document.createElement('div');
    tablePanel.className = 'resource-table-panel';
    const table = document.createElement('table');
    table.className = 'table resource-workspace-table';
    table.innerHTML = `
      <thead><tr>
        <th class="resource-col-select" aria-label="Select"></th>
        <th class="resource-col-title">${escapeHtml(copy.resource)}</th>
        <th class="resource-col-category">${escapeHtml(copy.category)}</th>
        <th class="resource-col-status">${escapeHtml(copy.status)}</th>
        <th class="resource-col-updated">${escapeHtml(copy.updated)}</th>
        <th class="resource-col-location">${escapeHtml(copy.location)}</th>
        <th class="resource-col-actions"><span class="sr-only">${escapeHtml(copy.actions)}</span></th>
      </tr></thead>`;
    const body = document.createElement('tbody');
    resources.forEach((resource) => body.append(makeResourceRow(resource)));
    table.append(body);
    tablePanel.append(table);
    state.panel = createPanel();
    workspace.append(tablePanel, state.panel);
    createSelectionTools(workspace);
    host.before(workspace);
    updateSelectionTools();

    state.backdrop = document.createElement('button');
    state.backdrop.type = 'button';
    state.backdrop.className = 'resource-location-backdrop';
    state.backdrop.setAttribute('aria-label', copy.close);
    state.backdrop.addEventListener('click', closeMobilePanel);
    document.body.append(state.backdrop);
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

  function assignmentPath(assignment, compact = false) {
    const trail = locationTrail(assignment.location_id);
    if (compact) {
      const location = trail.at(-1);
      return [location?.name || assignment.location_name, assignment.slot_code].filter(Boolean).join(' · ');
    }
    return [...trail.map((location) => location.name), assignment.slot_code].filter(Boolean);
  }

  function groupAssignments(assignments) {
    const grouped = new Map();
    assignments.forEach((assignment) => {
      const itemId = Number(assignment.item_id);
      if (!grouped.has(itemId)) grouped.set(itemId, []);
      grouped.get(itemId).push(assignment);
    });
    return grouped;
  }

  function assignmentCountLabel(count) {
    if (isChinese) return `${count} ${copy.assigned}`;
    return `${count} assigned ${count === 1 ? 'location' : 'locations'}`;
  }

  function updateLocationCells() {
    state.resourcesById.forEach((resource, itemId) => {
      const cell = document.querySelector(`[data-location-for="${itemId}"]`);
      if (!cell) return;
      const assignments = state.assignmentsByItem.get(itemId) || [];
      if (!assignments.length) {
        cell.innerHTML = `<span class="resource-location-state is-empty"><i class="fas fa-location-dot fa-fw" aria-hidden="true"></i>${escapeHtml(copy.unassigned)}</span>`;
        return;
      }
      const extra = assignments.length > 1 ? `<small>+${assignments.length - 1}</small>` : '';
      cell.innerHTML = `<span class="resource-location-state is-assigned"><i class="fas fa-location-dot fa-fw" aria-hidden="true"></i><span>${escapeHtml(assignmentPath(assignments[0], true))}</span>${extra}</span>`;
    });
  }

  function renderPanelLoading(resource) {
    state.panel.querySelector('.resource-location-panel-body').innerHTML = `
      <div class="resource-location-summary">
        <span class="resource-location-eyebrow">${escapeHtml(copy.storageLocation)}</span>
        <h2>${escapeHtml(resource.title)}</h2>
      </div>
      <div class="resource-location-loading"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i>${escapeHtml(copy.loading)}</div>`;
  }

  function renderUnassigned(resource) {
    state.panel.querySelector('.resource-location-panel-body').innerHTML = `
      <div class="resource-location-summary">
        <span class="resource-location-eyebrow">${escapeHtml(copy.storageLocation)}</span>
        <h2>${escapeHtml(resource.title)}</h2>
      </div>
      <div class="resource-location-empty is-unassigned">
        <i class="fas fa-location-dot" aria-hidden="true"></i>
        <strong>${escapeHtml(copy.noAssignment)}</strong>
      </div>
      <div class="resource-location-actions">
        <a class="btn btn-secondary" href="${escapeHtml(resource.viewHref)}"><i class="fas fa-arrow-up-right-from-square fa-fw mr-1" aria-hidden="true"></i>${escapeHtml(copy.openResource)}</a>
        <a class="btn btn-primary" href="/storage-map.php?item_id=${resource.id}"><i class="fas fa-map-location-dot fa-fw mr-1" aria-hidden="true"></i>${escapeHtml(copy.manageStorage)}</a>
      </div>`;
  }

  function locationKindLabel(location) {
    return ({ freezer: copy.freezer, drawer: copy.drawer, box: copy.box })[location?.kind] || copy.location;
  }

  function visibleRange(selected, total, size) {
    const safeSize = Math.min(Math.max(1, size), total);
    const start = Math.max(1, Math.min(selected - Math.floor(safeSize / 2), total - safeSize + 1));
    return Array.from({ length: safeSize }, (_, index) => start + index);
  }

  function renderLocatorGrid(location, highlightCode) {
    const rows = Number(location?.row_count || 0);
    const columns = Number(location?.column_count || 0);
    if (!rows || !columns) return '';
    const slots = generateSlotGrid(rows, columns);
    const cells = ['<span class="resource-context-axis resource-context-corner"></span>'];
    for (let column = 1; column <= columns; column += 1) cells.push(`<span class="resource-context-axis">${column}</span>`);
    for (let row = 1; row <= rows; row += 1) {
      const rowSlots = slots.filter((slot) => slot.row === row);
      cells.push(`<span class="resource-context-axis">${escapeHtml(rowSlots[0]?.rowLabel || '')}</span>`);
      rowSlots.forEach((slot) => {
        const selected = slot.code === String(highlightCode || '').toUpperCase();
        cells.push(`<span class="resource-context-slot${selected ? ' is-selected' : ''}" title="${escapeHtml(slot.code)}">${selected ? escapeHtml(slot.code) : ''}</span>`);
      });
    }
    return `<div class="resource-context-grid" style="--resource-context-columns:${columns}">${cells.join('')}</div>`;
  }

  function renderLocationContext(assignment) {
    const trail = locationTrail(assignment.location_id);
    const steps = [];
    for (let index = 0; index < trail.length - 1; index += 1) {
      const location = trail[index];
      const child = trail[index + 1];
      if (!location.row_count || !location.column_count || !child.position_code) continue;
      const icon = location.kind === 'freezer' ? 'fa-temperature-low' : 'fa-layer-group';
      steps.push(`
        <section class="resource-context-locator">
          <header><span><i class="fas ${icon} fa-fw" aria-hidden="true"></i>${escapeHtml(location.name)}</span><small>${escapeHtml(locationKindLabel(location))} · ${escapeHtml(child.position_code)}</small></header>
          ${renderLocatorGrid(location, child.position_code)}
        </section>`);
    }
    return steps.length ? `<div class="resource-location-context">${steps.join('')}</div>` : '';
  }

  function renderMiniGrid(view, assignment) {
    if (!view?.slots?.length || !view.columns) {
      return `<div class="resource-mini-grid-empty">${escapeHtml(copy.emptyGrid)}</div>`;
    }
    const selectedSlot = view.slots.find((slot) => slot.code === String(assignment.slot_code).toUpperCase()) || view.slots[0];
    const visibleRows = visibleRange(selectedSlot.row, view.rows, 4);
    const visibleColumns = visibleRange(selectedSlot.column, view.columns, 9);
    const cells = ['<span class="resource-grid-axis resource-grid-corner"></span>'];
    for (const column of visibleColumns) {
      cells.push(`<span class="resource-grid-axis">${column}</span>`);
    }
    for (const row of visibleRows) {
      const rowSlots = view.slots.filter((slot) => slot.row === row && visibleColumns.includes(slot.column));
      cells.push(`<span class="resource-grid-axis is-row">${escapeHtml(rowSlots[0]?.rowLabel || '')}</span>`);
      rowSlots.forEach((slot) => {
        const selected = slot.code === String(assignment.slot_code).toUpperCase();
        const classes = ['resource-mini-slot'];
        if (slot.child) classes.push('is-child');
        if (slot.assignment) classes.push('is-occupied');
        if (selected) classes.push('is-selected');
        const label = selected ? copy.selectedSlot : slot.child ? copy.childSlot : slot.assignment ? copy.otherSlot : slot.code;
        cells.push(`<span class="${classes.join(' ')}" title="${escapeHtml(`${slot.code} · ${label}`)}"><span>${escapeHtml(slot.code)}</span></span>`);
      });
    }
    const rowLabel = `${view.slots.find((slot) => slot.row === visibleRows[0])?.rowLabel || ''}–${view.slots.find((slot) => slot.row === visibleRows.at(-1))?.rowLabel || ''}`;
    return `
      <section class="resource-box-locator">
        <header><span><i class="fas fa-border-all fa-fw" aria-hidden="true"></i>${escapeHtml(view.location.name)}</span><small>${escapeHtml(copy.localRows)} · ${escapeHtml(rowLabel)}</small></header>
        <div class="resource-mini-grid" style="--resource-grid-columns:${visibleColumns.length}">${cells.join('')}</div>
      </section>`;
  }

  async function renderAssignment(resource, assignment, assignments) {
    const renderToken = `${resource.id}:${assignment.id}:${state.refreshToken}`;
    state.selectedAssignmentId = Number(assignment.id);
    const panelBody = state.panel.querySelector('.resource-location-panel-body');
    const path = assignmentPath(assignment);
    const tabs = assignments.length > 1 ? `
      <div class="resource-location-tabs" role="tablist" aria-label="${escapeHtml(copy.storageLocation)}">
        ${assignments.map((item, index) => `<button type="button" role="tab" aria-selected="${Number(item.id) === Number(assignment.id)}" class="${Number(item.id) === Number(assignment.id) ? 'active' : ''}" data-assignment-id="${item.id}">${index + 1}</button>`).join('')}
      </div>` : '';
    panelBody.innerHTML = `
      <div class="resource-location-summary">
        <span class="resource-location-eyebrow">${escapeHtml(copy.storageLocation)}</span>
        <h2>${escapeHtml(resource.title)}</h2>
        <span class="resource-assignment-count">${escapeHtml(assignmentCountLabel(assignments.length))}</span>
      </div>
      ${tabs}
      <nav class="resource-location-path" aria-label="${escapeHtml(copy.storageLocation)}">
        ${path.map((part, index) => `${index ? '<i class="fas fa-chevron-right" aria-hidden="true"></i>' : ''}<span>${escapeHtml(part)}</span>`).join('')}
      </nav>
      <div class="resource-location-facts">
        <span><small>${escapeHtml(copy.quantity)}</small><strong>${escapeHtml(assignment.qty_stored)} ${escapeHtml(assignment.qty_unit)}</strong></span>
        <span><small>${escapeHtml(copy.selectedSlot)}</small><strong>${escapeHtml(assignment.slot_code)}</strong></span>
      </div>
      ${renderLocationContext(assignment)}
      <div class="resource-mini-grid-loading"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i></div>
      <div class="resource-location-actions">
        <a class="btn btn-secondary" href="${escapeHtml(resource.viewHref)}"><i class="fas fa-arrow-up-right-from-square fa-fw mr-1" aria-hidden="true"></i>${escapeHtml(copy.openResource)}</a>
        <a class="btn btn-primary" href="/storage-map.php?item_id=${resource.id}"><i class="fas fa-map-location-dot fa-fw mr-1" aria-hidden="true"></i>${escapeHtml(copy.manageStorage)}</a>
      </div>`;
    panelBody.querySelectorAll('[data-assignment-id]').forEach((button) => button.addEventListener('click', () => {
      const next = assignments.find((item) => Number(item.id) === Number(button.dataset.assignmentId));
      if (next) renderAssignment(resource, next, assignments);
    }));
    try {
      const payload = await api(`locations/${assignment.location_id}/view`);
      if (`${state.selectedItemId}:${state.selectedAssignmentId}:${state.refreshToken}` !== renderToken) return;
      const grid = buildStorageView(payload);
      panelBody.querySelector('.resource-mini-grid-loading')?.replaceWith(document.createRange().createContextualFragment(renderMiniGrid(grid, assignment)));
    } catch (error) {
      if (`${state.selectedItemId}:${state.selectedAssignmentId}:${state.refreshToken}` !== renderToken) return;
      const loading = panelBody.querySelector('.resource-mini-grid-loading');
      if (loading) loading.textContent = copy.loadFailed;
      console.error(error);
    }
  }

  function openMobilePanel() {
    if (!window.matchMedia('(max-width: 767.98px)').matches) return;
    state.panel.classList.add('is-open');
    state.backdrop.classList.add('is-open');
    document.body.classList.add('resource-location-sheet-open');
  }

  function closeMobilePanel() {
    state.panel?.classList.remove('is-open');
    state.backdrop?.classList.remove('is-open');
    document.body.classList.remove('resource-location-sheet-open');
  }

  function selectResource(itemId, shouldOpenMobile = false) {
    const resource = state.resourcesById.get(Number(itemId));
    if (!resource || !state.panel) return;
    state.selectedItemId = Number(itemId);
    document.querySelectorAll('.resource-workspace-row').forEach((row) => {
      const selected = Number(row.dataset.resourceId) === Number(itemId);
      row.classList.toggle('is-selected', selected);
      row.setAttribute('aria-selected', String(selected));
    });
    renderPanelLoading(resource);
    if (shouldOpenMobile) openMobilePanel();
    const assignments = state.assignmentsByItem.get(Number(itemId)) || [];
    if (!assignments.length) {
      renderUnassigned(resource);
      return;
    }
    const assignment = assignments.find((item) => Number(item.id) === Number(state.selectedAssignmentId)) || assignments[0];
    renderAssignment(resource, assignment, assignments);
  }

  async function hydrateLocations(resources, token) {
    try {
      const ids = resources.map((resource) => resource.id).join(',');
      const [locations, assignments] = await Promise.all([
        api('locations'),
        ids ? api(`resource-locations?item_ids=${encodeURIComponent(ids)}`) : Promise.resolve([])
      ]);
      if (token !== state.refreshToken) return;
      state.locations = locations;
      state.assignmentsByItem = groupAssignments(assignments);
      updateLocationCells();
      if (state.selectedItemId && state.resourcesById.has(state.selectedItemId)) selectResource(state.selectedItemId);
    } catch (error) {
      if (token !== state.refreshToken) return;
      document.querySelectorAll('.resource-location-state.is-loading').forEach((node) => {
        node.classList.remove('is-loading');
        node.classList.add('is-error');
        node.textContent = copy.loadFailed;
      });
      console.error(error);
    }
  }

  function initializeWorkspace() {
    const showContent = document.getElementById('showModeContent');
    if (!showContent || showContent.querySelector('.resource-workspace')) return;
    document.querySelectorAll('.resource-location-backdrop').forEach((node) => node.remove());
    closeMobilePanel();
    const source = showContent.querySelector('#itemList');
    if (!source) return;
    const resources = parseResources(source);
    if (!resources.length) return;
    state.refreshToken += 1;
    state.resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
    document.getElementById('realContainer')?.classList.add('resource-container-wide');
    const layoutToggle = document.querySelector('[data-action="toggle-items-layout"]');
    if (layoutToggle) layoutToggle.hidden = true;
    renderWorkspace(source, resources);
    hydrateLocations(resources, state.refreshToken);
  }

  function setupResourceFilters() {
    const mainSearchForm = document.getElementById('mainSearchForm');
    const visibleFilters = document.getElementById('visibleFiltersDiv');
    const advancedFilters = document.getElementById('filtersDiv');
    const filterToggle = document.querySelector('[data-toggle-target="filtersDiv"]');
    if (!mainSearchForm || !visibleFilters || !advancedFilters || !filterToggle || document.querySelector('.resource-filter-toggle')) return;

    const searchRow = mainSearchForm.parentElement;
    const commonRow = visibleFilters.closest('.d-flex.form-group');
    const filterSection = commonRow?.parentElement;
    const toggleWrapper = filterToggle.parentElement;
    if (!searchRow || !commonRow || !filterSection || !toggleWrapper) return;

    searchRow.classList.add('resource-search-row');
    commonRow.classList.add('resource-common-filter-row');
    filterSection.classList.add('resource-filter-section');
    filterSection.hidden = true;
    advancedFilters.hidden = true;

    filterToggle.removeAttribute('data-action');
    filterToggle.removeAttribute('data-toggle-target');
    filterToggle.removeAttribute('data-closed-icon');
    filterToggle.removeAttribute('data-opened-icon');
    filterToggle.classList.add('resource-filter-toggle');
    filterToggle.title = copy.filters;
    filterToggle.setAttribute('aria-label', copy.filters);
    filterToggle.setAttribute('aria-expanded', 'false');

    const filterKeys = ['category', 'status', 'owner', 'tags[]', 'metakey', 'metavalue', 'date', 'dateTo', 'visibility', 'locked', 'timestamped', 'rating'];
    const query = new URLSearchParams(window.location.search);
    const activeCount = filterKeys.filter((key) => query.has(key) && query.getAll(key).some(Boolean)).length;
    filterToggle.innerHTML = `<i class="fas fa-sliders fa-fw" aria-hidden="true"></i>${activeCount ? `<span class="resource-filter-count">${activeCount}</span>` : ''}`;
    toggleWrapper.className = 'resource-filter-toggle-wrap';
    const helpWrapper = mainSearchForm.nextElementSibling;
    searchRow.insertBefore(toggleWrapper, helpWrapper);

    const moreWrapper = document.createElement('div');
    moreWrapper.className = 'resource-more-filter-wrap';
    moreWrapper.innerHTML = `<button class="btn btn-sm btn-secondary resource-more-filter-toggle" type="button" aria-expanded="false"><i class="fas fa-ellipsis fa-fw mr-1" aria-hidden="true"></i>${escapeHtml(copy.moreFilters)}</button>`;
    commonRow.append(moreWrapper);
    const moreToggle = moreWrapper.querySelector('button');

    filterToggle.addEventListener('click', () => {
      const open = filterSection.hidden;
      filterSection.hidden = !open;
      filterToggle.setAttribute('aria-expanded', String(open));
      filterToggle.classList.toggle('active', open);
      if (!open) {
        advancedFilters.hidden = true;
        moreToggle.setAttribute('aria-expanded', 'false');
        moreToggle.classList.remove('active');
      }
    });
    moreToggle.addEventListener('click', () => {
      const open = advancedFilters.hidden;
      advancedFilters.hidden = !open;
      moreToggle.setAttribute('aria-expanded', String(open));
      moreToggle.classList.toggle('active', open);
    });
  }

  function simplifyNativeToolbar() {
    const selectAll = document.querySelector('[data-action="toggle-select-all-entities"]');
    const invertSelection = document.querySelector('[data-action="invert-entities-selection"]');
    const expandAll = document.querySelector('[data-action="expand-all-entities"]');
    const scopeButton = document.getElementById('scopeBtn');
    const layoutToggle = document.querySelector('[data-action="toggle-items-layout"]');
    const sortButton = document.querySelector('button[aria-label="Sort"]');
    const resultsButton = document.querySelector('button[aria-label="Results per page"]');
    if (!selectAll || !sortButton) return;

    const hideControl = (element) => {
      if (!element) return;
      element.hidden = true;
      element.classList.add('d-none');
      element.setAttribute('aria-hidden', 'true');
    };

    hideControl(invertSelection);
    hideControl(expandAll);
    hideControl(expandAll?.previousElementSibling);
    const scopeWrapper = scopeButton?.parentElement;
    hideControl(scopeWrapper);
    hideControl(scopeWrapper?.nextElementSibling);
    hideControl(layoutToggle);
    hideControl(layoutToggle?.nextElementSibling);
    hideControl(resultsButton?.closest('.btn-group'));
    sortButton.closest('.btn-group')?.parentElement?.parentElement?.classList.add('ml-auto');
  }

  let refreshQueued = false;
  const observer = new MutationObserver(() => {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      initializeWorkspace();
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMobilePanel();
  });
  setupResourceFilters();
  simplifyNativeToolbar();
  observer.observe(document.getElementById('showModeContent'), { childList: true, subtree: true });
  initializeWorkspace();
}
