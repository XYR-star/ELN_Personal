import { createI18n, langFromUrl } from './i18n.js?v=20260617-init-guard1';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const plannerRoot = $('[data-planner-root]') || document.body;

const i18n = createI18n(plannerRoot.dataset.lang || langFromUrl());
const { t } = i18n;
const apiBase = plannerRoot.dataset.apiBase || 'api';
const WEEKDAY_KEYS = ['weekday.mon', 'weekday.tue', 'weekday.wed', 'weekday.thu', 'weekday.fri', 'weekday.sat', 'weekday.sun'];
const APP_TIME_ZONE = 'Asia/Shanghai';

function todayInAppTimeZone() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(`${value.year}-${value.month}-${value.day}T00:00`);
}

const state = {
  view: 'month',
  cursor: todayInAppTimeZone(),
  selectedDate: todayInAppTimeZone(),
  plans: [],
  meta: {
    types: ['pcr', 'cloning', 'cell_passage', 'transfection', 'mrna_transfection', 'observation', 'sampling', 'sequencing', 'meeting', 'other'],
    statuses: ['planned', 'done', 'delayed', 'cancelled']
  }
};

function typeLabel(type) {
  return t(`type.${type}`);
}

function statusLabel(status) {
  return t(`status.${status}`);
}

function weekdayLabel(date) {
  return t(WEEKDAY_KEYS[(date.getDay() + 6) % 7]);
}

function applyTranslations() {
  document.documentElement.lang = i18n.lang.replace('_', '-');
  document.title = `${t('app.title')} - eLabFTW`;
  $$('[data-planner-link]').forEach((node) => {
    node.setAttribute('href', `/planner/?lang=${encodeURIComponent(i18n.lang)}`);
  });
  $$('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  $$('[data-i18n-attr]').forEach((node) => {
    node.dataset.i18nAttr.split(',').forEach((binding) => {
      const [attr, key] = binding.split(':');
      node.setAttribute(attr, t(key));
    });
  });
}

async function api(path, options = {}) {
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
  const headers = {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };
  const response = await fetch(apiUrl(path), {
    ...options,
    headers
  });
  if (response.status === 204) return null;
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Planner API returned a non-JSON response (${response.status}). Please refresh and try again.`);
  }
  if (!response.ok) {
    throw new Error(data?.error || `Request failed: ${response.status}`);
  }
  return data;
}

function apiUrl(path) {
  if (apiBase === 'api') return path;
  return `${apiBase}?path=${encodeURIComponent(`/${path}`)}`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toInputValue(date) {
  return `${dateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromInputValue(value) {
  return new Date(value);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, count) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function addMonths(date, count) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + count);
  return next;
}

function mondayOf(date) {
  const day = date.getDay() || 7;
  return addDays(startOfDay(date), 1 - day);
}

function startOfMonthGrid(date) {
  return mondayOf(new Date(date.getFullYear(), date.getMonth(), 1));
}

function endOfMonthGrid(date) {
  return addDays(startOfMonthGrid(date), 42);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function planTime(plan) {
  const start = fromInputValue(plan.start);
  const end = plan.end ? fromInputValue(plan.end) : null;
  return `${pad(start.getHours())}:${pad(start.getMinutes())}${end ? `-${pad(end.getHours())}:${pad(end.getMinutes())}` : ''}`;
}

function rangeForView() {
  if (state.view === 'month') {
    return [startOfMonthGrid(state.cursor), endOfMonthGrid(state.cursor)];
  }
  if (state.view === 'week') {
    const start = mondayOf(state.cursor);
    return [start, addDays(start, 7)];
  }
  return [startOfDay(state.cursor), addDays(startOfDay(state.cursor), 1)];
}

function planMatchesFilters(plan) {
  const type = $('#type-filter').value;
  const status = $('#status-filter').value;
  const q = $('#search-input').value.trim().toLowerCase();
  if (type && plan.type !== type) return false;
  if (status && plan.status !== status) return false;
  if (!q) return true;
  return [plan.title, plan.note, plan.experimentUrl, plan.itemUrl].some((field) => String(field || '').toLowerCase().includes(q));
}

async function loadMeta() {
  state.meta = await api('api/meta');
  $('#type-filter').innerHTML = `<option value="">${t('filter.all')}</option>` + state.meta.types.map((type) => `<option value="${type}">${typeLabel(type)}</option>`).join('');
  $('#status-filter').innerHTML = `<option value="">${t('filter.all')}</option>` + state.meta.statuses.map((status) => `<option value="${status}">${statusLabel(status)}</option>`).join('');
  $('#type-select').innerHTML = state.meta.types.map((type) => `<option value="${type}">${typeLabel(type)}</option>`).join('');
  $('#status-select').innerHTML = state.meta.statuses.map((status) => `<option value="${status}">${statusLabel(status)}</option>`).join('');
}

async function loadPlans() {
  const [start, end] = rangeForView();
  state.plans = await api(`api/plans?start=${encodeURIComponent(toInputValue(start))}&end=${encodeURIComponent(toInputValue(end))}`);
  render();
}

function plansForDate(date) {
  const key = dateKey(date);
  return state.plans.filter((plan) => dateKey(fromInputValue(plan.start)) === key && planMatchesFilters(plan));
}

function renderPlanChip(plan) {
  return `
    <button class="plan-chip ${escapeHtml(plan.type)} ${escapeHtml(plan.status)}" data-id="${plan.id}" type="button">
      ${planTime(plan)} ${escapeHtml(plan.title)}
    </button>
  `;
}

function renderMonth() {
  const grid = $('#calendar-grid');
  const start = startOfMonthGrid(state.cursor);
  const days = Array.from({ length: 42 }, (_, index) => addDays(start, index));
  grid.className = 'calendar-grid month';
  grid.innerHTML = WEEKDAY_KEYS.map((key) => `<div class="weekday">${t(key)}</div>`).join('') + days.map((day) => {
    const outside = day.getMonth() !== state.cursor.getMonth() ? ' outside' : '';
    const selected = dateKey(day) === dateKey(state.selectedDate) ? ' selected' : '';
    const plans = plansForDate(day);
    return `
      <section class="day-cell${outside}${selected}" data-date="${dateKey(day)}">
        <div class="day-head">
          <span class="day-number">${day.getDate()}</span>
          <small>${plans.length || ''}</small>
        </div>
        ${plans.slice(0, 4).map(renderPlanChip).join('')}
        ${plans.length > 4 ? `<small class="muted">+${plans.length - 4}</small>` : ''}
      </section>
    `;
  }).join('');
}

function renderAgenda(days) {
  const grid = $('#calendar-grid');
  grid.className = `calendar-grid ${state.view}`;
  grid.innerHTML = days.map((day) => {
    const plans = plansForDate(day);
    return `
      <section class="agenda-day" data-date="${dateKey(day)}">
        <h3>${dateKey(day)} ${weekdayLabel(day)}</h3>
        ${plans.length ? plans.map(renderPlanChip).join('') : `<p class="muted">${t('empty.noPlans')}</p>`}
      </section>
    `;
  }).join('');
}

function renderSelectedList() {
  const list = $('#selected-list');
  const plans = plansForDate(state.selectedDate);
  const selectedDate = $('#selected-date');
  const selectedCount = $('#selected-count');
  if (selectedDate) selectedDate.textContent = dateKey(state.selectedDate);
  if (selectedCount) selectedCount.textContent = t('side.planCount', { count: plans.length });
  list.innerHTML = plans.length ? plans.map((plan) => `
    <article class="plan-card" data-id="${plan.id}">
      <div class="plan-card-body">
        <h3>${escapeHtml(plan.title)}</h3>
        <p>${typeLabel(plan.type)} · ${statusLabel(plan.status)}</p>
        <p>${dateKey(fromInputValue(plan.start))} ${planTime(plan)}</p>
        ${plan.note ? `<p>${escapeHtml(plan.note)}</p>` : ''}
      </div>
      <div class="plan-card-actions">
        <button class="btn btn-sm btn-primary" type="button" data-plan-action="done" data-id="${plan.id}" ${plan.status === 'done' ? 'disabled' : ''}>${t('action.quickDone')}</button>
        <button class="btn btn-sm btn-secondary" type="button" data-plan-action="backfill" data-id="${plan.id}">${t('action.backfill')}</button>
        <button class="btn btn-sm btn-danger" type="button" data-plan-action="delete" data-id="${plan.id}">${t('action.delete')}</button>
      </div>
    </article>
  `).join('') : `<p class="muted">${t('empty.noPlansInDay')}</p>`;
}

function renderLoadError(error) {
  const list = $('#selected-list');
  if (!list) return;
  list.innerHTML = `<p class="muted">${escapeHtml(error.message || t('error.loadFailed'))}</p>`;
}

function showFormError(message = '') {
  const error = $('#planner-form-error');
  if (!error) {
    if (message) alert(message);
    return;
  }
  error.textContent = message;
  error.hidden = !message;
}

function renderTitle() {
  if (state.view === 'month') {
    const month = i18n.lang === 'zh_CN'
      ? String(state.cursor.getMonth() + 1)
      : state.cursor.toLocaleString(i18n.lang.replace('_', '-'), { month: 'long' });
    $('#calendar-title').textContent = t('calendar.monthTitle', {
      year: state.cursor.getFullYear(),
      month
    });
  } else if (state.view === 'week') {
    const start = mondayOf(state.cursor);
    $('#calendar-title').textContent = `${dateKey(start)} - ${dateKey(addDays(start, 6))}`;
  } else {
    $('#calendar-title').textContent = dateKey(state.cursor);
  }
}

function render() {
  renderTitle();
  if (state.view === 'month') renderMonth();
  if (state.view === 'week') renderAgenda(Array.from({ length: 7 }, (_, index) => addDays(mondayOf(state.cursor), index)));
  if (state.view === 'day') renderAgenda([state.cursor]);
  renderSelectedList();
  bindRendered();
}

function bindRendered() {
  $$('[data-plan-action]').forEach((node) => {
    node.addEventListener('click', async (event) => {
      event.stopPropagation();
      const id = node.dataset.id;
      const plan = state.plans.find((item) => item.id === id);
      try {
        if (node.dataset.planAction === 'done') {
          node.disabled = true;
          await markPlanDone(id);
        } else if (node.dataset.planAction === 'delete') {
          await deletePlan(id);
        } else if (node.dataset.planAction === 'backfill' && plan) {
          openDialog(plan, { status: 'done', focus: 'note' });
        }
      } catch (error) {
        renderLoadError(error);
      }
    });
  });
  $$('.day-cell, .agenda-day').forEach((node) => {
    node.addEventListener('click', (event) => {
      if (event.target.closest('.plan-chip')) return;
      state.selectedDate = startOfDay(new Date(`${node.dataset.date}T00:00`));
      render();
    });
  });
  $$('.plan-chip, .plan-card').forEach((node) => {
    node.addEventListener('click', () => {
      const plan = state.plans.find((item) => item.id === node.dataset.id);
      if (plan) openDialog(plan);
    });
  });
}

function openDialog(plan = null, options = {}) {
  const form = $('#plan-form');
  form.reset();
  showFormError('');
  if (plan) {
    form.id.value = plan.id;
    form.title.value = plan.title;
    form.type.value = plan.type;
    form.start.value = plan.start;
    form.end.value = plan.end || '';
    form.status.value = options.status || plan.status;
    form.experimentUrl.value = plan.experimentUrl || '';
    form.itemUrl.value = plan.itemUrl || '';
    form.note.value = plan.note || '';
    $('#dialog-title').textContent = t('dialog.edit');
    $('#delete-button').hidden = false;
    $('#mark-done-button').hidden = false;
    $('#delay-button').hidden = false;
  } else {
    const start = new Date(state.selectedDate);
    start.setHours(9, 0, 0, 0);
    form.start.value = toInputValue(start);
    form.status.value = 'planned';
    form.type.value = 'other';
    $('#dialog-title').textContent = t('dialog.new');
    $('#delete-button').hidden = true;
    $('#mark-done-button').hidden = true;
    $('#delay-button').hidden = true;
  }
  $('#plan-dialog').showModal();
  if (options.focus === 'note') {
    form.note.focus();
  } else {
    form.title.focus();
  }
}

function formPayload() {
  return Object.fromEntries(new FormData($('#plan-form')));
}

async function savePlan(event) {
  event.preventDefault();
  const data = formPayload();
  const submitButton = event.currentTarget.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  showFormError('');
  try {
    if (data.id) {
      await api(`api/plans/${data.id}`, { method: 'PATCH', body: JSON.stringify(data) });
    } else {
      await api('api/plans', { method: 'POST', body: JSON.stringify(data) });
    }
    $('#plan-dialog').close();
    await loadPlans();
  } catch (error) {
    showFormError(error.message || t('error.loadFailed'));
  } finally {
    submitButton.disabled = false;
  }
}

async function patchCurrent(data) {
  const id = $('#plan-form').id.value;
  if (!id) return;
  showFormError('');
  try {
    await api(`api/plans/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    $('#plan-dialog').close();
    await loadPlans();
  } catch (error) {
    showFormError(error.message || t('error.loadFailed'));
  }
}

async function markPlanDone(id) {
  const plan = state.plans.find((item) => item.id === id);
  if (!plan || plan.status === 'done') return;
  await api(`api/plans/${id}`, { method: 'PATCH', body: JSON.stringify({ ...plan, status: 'done' }) });
  await loadPlans();
}

async function deletePlan(id) {
  if (!id || !confirm(t('confirm.delete'))) return false;
  await api(`api/plans/${id}`, { method: 'DELETE' });
  await loadPlans();
  return true;
}

function bindControls() {
  $('#new-plan-button').addEventListener('click', () => openDialog());
  $('#selected-new-plan-button')?.addEventListener('click', () => openDialog());
  $('#today-button').addEventListener('click', async () => {
    state.cursor = todayInAppTimeZone();
    state.selectedDate = state.cursor;
    await loadPlans();
  });
  $('#prev-button').addEventListener('click', async () => {
    state.cursor = state.view === 'month' ? addMonths(state.cursor, -1) : addDays(state.cursor, state.view === 'week' ? -7 : -1);
    await loadPlans();
  });
  $('#next-button').addEventListener('click', async () => {
    state.cursor = state.view === 'month' ? addMonths(state.cursor, 1) : addDays(state.cursor, state.view === 'week' ? 7 : 1);
    await loadPlans();
  });
  $$('.segmented button').forEach((button) => {
    button.addEventListener('click', async () => {
      $$('.segmented button').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      state.view = button.dataset.view;
      await loadPlans();
    });
  });
  ['type-filter', 'status-filter', 'search-input'].forEach((id) => {
    $(`#${id}`).addEventListener('input', render);
  });
  $('#plan-form').addEventListener('submit', savePlan);
  $('#dialog-close').addEventListener('click', () => $('#plan-dialog').close());
  $('#mark-done-button').addEventListener('click', () => patchCurrent({ ...formPayload(), status: 'done' }));
  $('#delay-button').addEventListener('click', () => patchCurrent({ ...formPayload(), status: 'delayed' }));
  $('#delete-button').addEventListener('click', async () => {
    const id = $('#plan-form').id.value;
    if (!id) return;
    showFormError('');
    try {
      if (await deletePlan(id)) {
        $('#plan-dialog').close();
      }
    } catch (error) {
      showFormError(error.message || t('error.loadFailed'));
    }
  });
}

async function init() {
  applyTranslations();
  bindControls();
  render();
  try {
    await loadMeta();
    await loadPlans();
  } catch (error) {
    console.error(error);
    renderLoadError(error);
  }
}

await init();
