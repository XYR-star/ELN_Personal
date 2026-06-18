import crypto from 'node:crypto';

export const PLAN_TYPES = [
  'pcr',
  'cloning',
  'cell_passage',
  'transfection',
  'mrna_transfection',
  'observation',
  'sampling',
  'sequencing',
  'meeting',
  'other'
];

export const PLAN_STATUSES = ['planned', 'done', 'delayed', 'cancelled'];

function nowIso() {
  return new Date().toISOString();
}

function normalizeDateTime(value, field) {
  const text = String(value || '').trim();
  if (!text) {
    if (field === 'end') return '';
    throw new Error(`${field} is required`);
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} is invalid`);
  return text.slice(0, 16);
}

function compareDateTime(a, b) {
  return new Date(a).getTime() - new Date(b).getTime();
}

function nextUpdatedAt(previous) {
  const current = nowIso();
  if (!previous || Date.parse(current) > Date.parse(previous)) return current;
  return new Date(Date.parse(previous) + 1).toISOString();
}

export function createPlan(input = {}) {
  const title = String(input.title || '').trim();
  if (!title) throw new Error('title is required');

  const start = normalizeDateTime(input.start, 'start');
  const end = input.end ? normalizeDateTime(input.end, 'end') : '';
  if (end && compareDateTime(end, start) <= 0) {
    throw new Error('end must be after start');
  }

  const createdAt = nowIso();
  const type = PLAN_TYPES.includes(input.type) ? input.type : 'other';
  const status = PLAN_STATUSES.includes(input.status) ? input.status : 'planned';

  return {
    id: crypto.randomUUID(),
    title,
    type,
    status,
    start,
    end,
    note: String(input.note || '').trim(),
    experimentUrl: String(input.experimentUrl || '').trim(),
    itemUrl: String(input.itemUrl || '').trim(),
    createdAt,
    updatedAt: createdAt
  };
}

export function updatePlan(existing, input = {}) {
  if (!existing?.id) throw new Error('existing plan is required');
  const next = {
    ...existing,
    title: input.title !== undefined ? String(input.title || '').trim() : existing.title,
    type: input.type !== undefined && PLAN_TYPES.includes(input.type) ? input.type : existing.type,
    status: input.status !== undefined && PLAN_STATUSES.includes(input.status) ? input.status : existing.status,
    start: input.start !== undefined ? normalizeDateTime(input.start, 'start') : existing.start,
    end: input.end !== undefined && input.end !== '' ? normalizeDateTime(input.end, 'end') : (input.end === '' ? '' : existing.end),
    note: input.note !== undefined ? String(input.note || '').trim() : existing.note,
    experimentUrl: input.experimentUrl !== undefined ? String(input.experimentUrl || '').trim() : existing.experimentUrl,
    itemUrl: input.itemUrl !== undefined ? String(input.itemUrl || '').trim() : existing.itemUrl,
    updatedAt: nextUpdatedAt(existing.updatedAt)
  };
  if (!next.title) throw new Error('title is required');
  if (next.end && compareDateTime(next.end, next.start) <= 0) {
    throw new Error('end must be after start');
  }
  return next;
}

export function filterPlansByRange(plans, start, end) {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  return plans
    .filter((plan) => {
      const planStart = new Date(plan.start).getTime();
      const planEnd = plan.end ? new Date(plan.end).getTime() : planStart + 60 * 60 * 1000;
      return planStart < endMs && planEnd > startMs;
    })
    .sort((a, b) => compareDateTime(a.start, b.start) || a.title.localeCompare(b.title));
}
