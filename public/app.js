import { createI18n, langFromUrl } from './i18n.js?v=20260721-calendar1';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const plannerRoot = $('[data-planner-root]') || document.body;

const i18n = createI18n(plannerRoot.dataset.lang || langFromUrl());
const { t } = i18n;
const apiBase = plannerRoot.dataset.apiBase || 'api';
const WEEKDAY_KEYS = ['weekday.mon', 'weekday.tue', 'weekday.wed', 'weekday.thu', 'weekday.fri', 'weekday.sat', 'weekday.sun'];
const APP_TIME_ZONE = 'Asia/Shanghai';
const CALENDAR_START_HOUR = 7;
const CALENDAR_END_HOUR = 22;
const HOUR_HEIGHT = 60;

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
  view: window.matchMedia('(max-width: 767px)').matches ? 'day' : 'week',
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
  const day = date.getDate();
  const next = new Date(date.getFullYear(), date.getMonth() + count, 1, date.getHours(), date.getMinutes());
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

function addMinutes(date, count) {
  return new Date(date.getTime() + count * 60 * 1000);
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

function planStartTime(plan) {
  const start = fromInputValue(plan.start);
  return `${pad(start.getHours())}:${pad(start.getMinutes())}`;
}

function planDurationMinutes(plan) {
  const start = fromInputValue(plan.start);
  const end = plan.end ? fromInputValue(plan.end) : addMinutes(start, 60);
  return Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000));
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
      <span class="plan-chip-time">${planTime(plan)}</span>
      <span class="plan-chip-title">${escapeHtml(plan.title)}</span>
    </button>
  `;
}

function renderDayAddButton(day) {
  return `<button class="day-add-button" data-new-date="${dateKey(day)}" type="button" title="${t('action.newPlan')}" aria-label="${t('action.newPlan')}"><i class="fas fa-plus"></i></button>`;
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
          <span class="day-head-actions">${plans.length ? `<small>${plans.length}</small>` : ''}${renderDayAddButton(day)}</span>
        </div>
        ${plans.slice(0, 4).map(renderPlanChip).join('')}
        ${plans.length > 4 ? `<small class="muted">+${plans.length - 4}</small>` : ''}
      </section>
    `;
  }).join('');
}

function layoutTimedPlans(plans) {
  const sorted = [...plans].sort((a, b) => fromInputValue(a.start) - fromInputValue(b.start));
  const positioned = [];
  let index = 0;
  while (index < sorted.length) {
    const group = [sorted[index]];
    let groupEnd = fromInputValue(sorted[index].start).getTime() + planDurationMinutes(sorted[index]) * 60000;
    let next = index + 1;
    while (next < sorted.length && fromInputValue(sorted[next].start).getTime() < groupEnd) {
      group.push(sorted[next]);
      groupEnd = Math.max(groupEnd, fromInputValue(sorted[next].start).getTime() + planDurationMinutes(sorted[next]) * 60000);
      next += 1;
    }
    const laneEnds = [];
    const entries = group.map((plan) => {
      const start = fromInputValue(plan.start).getTime();
      let lane = laneEnds.findIndex((end) => end <= start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = start + planDurationMinutes(plan) * 60000;
      return { plan, lane };
    });
    entries.forEach((entry) => positioned.push({ ...entry, lanes: laneEnds.length }));
    index = next;
  }
  return positioned;
}

function renderTimedEvent({ plan, lane, lanes }) {
  const start = fromInputValue(plan.start);
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const visibleStart = Math.min(
    Math.max(startMinutes, CALENDAR_START_HOUR * 60),
    CALENDAR_END_HOUR * 60 - 15
  );
  const visibleEnd = Math.max(
    visibleStart + 15,
    Math.min(startMinutes + planDurationMinutes(plan), CALENDAR_END_HOUR * 60)
  );
  const top = ((visibleStart - CALENDAR_START_HOUR * 60) / 60) * HOUR_HEIGHT;
  const height = Math.max(24, ((visibleEnd - visibleStart) / 60) * HOUR_HEIGHT - 2);
  const width = 100 / lanes;
  return `
    <button class="timed-event ${escapeHtml(plan.type)} ${escapeHtml(plan.status)}" data-id="${plan.id}" type="button" title="${planTime(plan)} ${escapeHtml(plan.title)}"
      style="top:${top}px;height:${height}px;left:calc(${lane * width}% + 2px);width:calc(${width}% - 4px)">
      <span>${planStartTime(plan)}</span><strong>${escapeHtml(plan.title)}</strong>
    </button>
  `;
}

function renderTimeColumn(day) {
  const plans = plansForDate(day);
  const slots = Array.from({ length: CALENDAR_END_HOUR - CALENDAR_START_HOUR }, (_, index) => {
    const hour = CALENDAR_START_HOUR + index;
    return `<button class="time-slot" type="button" data-time-date="${dateKey(day)}" data-time-hour="${hour}" aria-label="${dateKey(day)} ${pad(hour)}:00"></button>`;
  }).join('');
  return `<div class="time-day-column${dateKey(day) === dateKey(state.selectedDate) ? ' selected' : ''}" data-date="${dateKey(day)}">${slots}${layoutTimedPlans(plans).map(renderTimedEvent).join('')}</div>`;
}

function renderTimeline(days) {
  const grid = $('#calendar-grid');
  grid.className = `calendar-grid timeline ${state.view}`;
  grid.style.setProperty('--calendar-days', days.length);
  const labels = Array.from({ length: CALENDAR_END_HOUR - CALENDAR_START_HOUR }, (_, index) => {
    const hour = CALENDAR_START_HOUR + index;
    return `<span style="top:${index * HOUR_HEIGHT}px">${pad(hour)}:00</span>`;
  }).join('');
  grid.innerHTML = `
    <div class="timeline-header-spacer"></div>
    <div class="timeline-day-headers">${days.map((day) => `
      <button class="timeline-day-header${dateKey(day) === dateKey(state.selectedDate) ? ' selected' : ''}" data-date="${dateKey(day)}" type="button">
        <span>${weekdayLabel(day)}</span><strong>${day.getDate()}</strong>
      </button>`).join('')}</div>
    <div class="timeline-scroll">
      <div class="timeline-track">
        <div class="time-axis">${labels}</div>
        <div class="timeline-columns">${days.map(renderTimeColumn).join('')}</div>
      </div>
    </div>`;
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
      <div class="plan-card-time"><strong>${planTime(plan)}</strong><span>${typeLabel(plan.type)}</span></div>
      <div class="plan-card-body">
        <h3>${escapeHtml(plan.title)}</h3>
        <p><span class="plan-status ${escapeHtml(plan.status)}">${statusLabel(plan.status)}</span></p>
        ${plan.note ? `<p>${escapeHtml(plan.note)}</p>` : ''}
      </div>
      <div class="plan-card-actions">
        <button class="btn btn-sm btn-secondary" type="button" data-plan-edit data-id="${plan.id}" title="${t('action.edit')}" aria-label="${t('action.edit')}"><i class="fas fa-pen fa-fw"></i></button>
        <button class="btn btn-sm btn-primary" type="button" data-plan-action="done" data-id="${plan.id}" title="${t('action.quickDone')}" aria-label="${t('action.quickDone')}" ${plan.status === 'done' ? 'disabled' : ''}><i class="fas fa-check fa-fw"></i></button>
        <button class="btn btn-sm btn-danger" type="button" data-plan-action="delete" data-id="${plan.id}" title="${t('action.delete')}" aria-label="${t('action.delete')}"><i class="fas fa-trash fa-fw"></i></button>
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
    const end = addDays(start, 6);
    if (i18n.lang === 'zh_CN') {
      const endLabel = start.getMonth() === end.getMonth()
        ? `${end.getDate()} 日`
        : `${end.getMonth() + 1} 月 ${end.getDate()} 日`;
      $('#calendar-title').textContent = `${start.getFullYear()} 年 ${start.getMonth() + 1} 月 ${start.getDate()} - ${endLabel}`;
    } else {
      const month = start.toLocaleString(i18n.lang.replace('_', '-'), { month: 'short' });
      const endLabel = start.getMonth() === end.getMonth()
        ? String(end.getDate())
        : end.toLocaleString(i18n.lang.replace('_', '-'), { month: 'short', day: 'numeric' });
      $('#calendar-title').textContent = `${month} ${start.getDate()}-${endLabel}, ${start.getFullYear()}`;
    }
  } else {
    $('#calendar-title').textContent = state.cursor.toLocaleDateString(i18n.lang.replace('_', '-'), {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
    });
  }
}

function render() {
  renderTitle();
  if (state.view === 'month') renderMonth();
  if (state.view === 'week') renderTimeline(Array.from({ length: 7 }, (_, index) => addDays(mondayOf(state.cursor), index)));
  if (state.view === 'day') renderTimeline([state.cursor]);
  renderSelectedList();
  bindRendered();
}

function bindRendered() {
  $$('[data-plan-action]').forEach((node) => {
    node.addEventListener('click', async (event) => {
      event.stopPropagation();
      const id = node.dataset.id;
      try {
        if (node.dataset.planAction === 'done') {
          node.disabled = true;
          await markPlanDone(id);
        } else if (node.dataset.planAction === 'delete') {
          await deletePlan(id);
        }
      } catch (error) {
        renderLoadError(error);
      }
    });
  });
  $$('.day-cell').forEach((node) => {
    node.addEventListener('click', (event) => {
      if (event.target.closest('.plan-chip, .day-add-button')) return;
      state.selectedDate = startOfDay(new Date(`${node.dataset.date}T00:00`));
      render();
    });
  });
  $$('[data-new-date]').forEach((node) => {
    node.addEventListener('click', (event) => {
      event.stopPropagation();
      state.selectedDate = startOfDay(new Date(`${node.dataset.newDate}T00:00`));
      openDialog();
    });
  });
  $$('.timeline-day-header').forEach((node) => {
    node.addEventListener('click', () => {
      state.selectedDate = startOfDay(new Date(`${node.dataset.date}T00:00`));
      render();
    });
  });
  $$('.time-slot').forEach((node) => {
    node.addEventListener('click', () => {
      const start = new Date(`${node.dataset.timeDate}T${pad(node.dataset.timeHour)}:00`);
      state.selectedDate = startOfDay(start);
      openDialog(null, { start });
    });
  });
  $$('.plan-chip, .timed-event, [data-plan-edit]').forEach((node) => {
    node.addEventListener('click', () => {
      const plan = state.plans.find((item) => item.id === node.dataset.id);
      if (plan) openDialog(plan);
    });
  });
}

function nextAvailableStart(date = state.selectedDate) {
  const sameDayPlans = state.plans
    .filter((plan) => dateKey(fromInputValue(plan.start)) === dateKey(date))
    .sort((a, b) => fromInputValue(a.start) - fromInputValue(b.start));
  if (!sameDayPlans.length) {
    const start = new Date(date);
    start.setHours(9, 0, 0, 0);
    return start;
  }
  const last = sameDayPlans.at(-1);
  const lastStart = fromInputValue(last.start);
  const proposed = last.end ? fromInputValue(last.end) : addMinutes(lastStart, 60);
  const minutes = proposed.getMinutes();
  proposed.setSeconds(0, 0);
  if (minutes > 0 && minutes <= 30) proposed.setMinutes(30);
  if (minutes > 30) proposed.setHours(proposed.getHours() + 1, 0);
  return proposed;
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
    $('#save-another-button').hidden = true;
  } else {
    const start = options.start ? new Date(options.start) : nextAvailableStart();
    form.start.value = toInputValue(start);
    form.end.value = toInputValue(addMinutes(start, 60));
    form.status.value = 'planned';
    form.type.value = 'other';
    $('#dialog-title').textContent = t('dialog.new');
    $('#delete-button').hidden = true;
    $('#mark-done-button').hidden = true;
    $('#delay-button').hidden = true;
    $('#save-another-button').hidden = false;
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
  const saveAnother = Boolean(event.submitter?.dataset.saveAnother !== undefined) && !data.id;
  const submitButtons = [...event.currentTarget.querySelectorAll('button[type="submit"]')];
  submitButtons.forEach((button) => { button.disabled = true; });
  showFormError('');
  try {
    if (data.id) {
      await api(`api/plans/${data.id}`, { method: 'PATCH', body: JSON.stringify(data) });
    } else {
      await api('api/plans', { method: 'POST', body: JSON.stringify(data) });
    }
    const savedDate = startOfDay(fromInputValue(data.start));
    state.selectedDate = savedDate;
    state.cursor = savedDate;
    $('#plan-dialog').close();
    await loadPlans();
    if (saveAnother) openDialog(null, { start: nextAvailableStart(savedDate) });
  } catch (error) {
    showFormError(error.message || t('error.loadFailed'));
  } finally {
    submitButtons.forEach((button) => { button.disabled = false; });
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
  $('#selected-new-plan-button')?.addEventListener('click', () => openDialog());
  $('#today-button').addEventListener('click', async () => {
    state.cursor = todayInAppTimeZone();
    state.selectedDate = state.cursor;
    await loadPlans();
  });
  $('#prev-button').addEventListener('click', async () => {
    if (state.view === 'month') {
      state.cursor = addMonths(state.cursor, -1);
      state.selectedDate = addMonths(state.selectedDate, -1);
    } else {
      const offset = state.view === 'week' ? -7 : -1;
      state.cursor = addDays(state.cursor, offset);
      state.selectedDate = addDays(state.selectedDate, offset);
    }
    await loadPlans();
  });
  $('#next-button').addEventListener('click', async () => {
    if (state.view === 'month') {
      state.cursor = addMonths(state.cursor, 1);
      state.selectedDate = addMonths(state.selectedDate, 1);
    } else {
      const offset = state.view === 'week' ? 7 : 1;
      state.cursor = addDays(state.cursor, offset);
      state.selectedDate = addDays(state.selectedDate, offset);
    }
    await loadPlans();
  });
  $$('.segmented button').forEach((button) => {
    button.addEventListener('click', async () => {
      state.cursor = new Date(state.selectedDate);
      state.view = button.dataset.view;
      syncViewButtons();
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

function syncViewButtons() {
  $$('.segmented button').forEach((button) => {
    const active = button.dataset.view === state.view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

async function init() {
  applyTranslations();
  syncViewButtons();
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
