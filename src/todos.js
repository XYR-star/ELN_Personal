import crypto from 'node:crypto';

function nowIso() {
  return new Date().toISOString();
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('dueDate is invalid');
  const date = new Date(`${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) throw new Error('dueDate is invalid');
  return text;
}

function nextUpdatedAt(previous) {
  const current = nowIso();
  if (!previous || Date.parse(current) > Date.parse(previous)) return current;
  return new Date(Date.parse(previous) + 1).toISOString();
}

function compareDueDate(a, b, today) {
  const aDue = a.dueDate || '';
  const bDue = b.dueDate || '';
  if (!aDue && !bDue) return 0;
  if (!aDue) return 1;
  if (!bDue) return -1;
  const aOverdue = aDue < today ? 0 : 1;
  const bOverdue = bDue < today ? 0 : 1;
  return aOverdue - bOverdue || aDue.localeCompare(bDue);
}

export function createTodo(input = {}) {
  const title = String(input.title || '').trim();
  if (!title) throw new Error('title is required');
  const createdAt = nowIso();
  return {
    id: crypto.randomUUID(),
    title,
    note: String(input.note || '').trim(),
    dueDate: normalizeDate(input.dueDate),
    pinned: Boolean(input.pinned),
    done: Boolean(input.done),
    createdAt,
    updatedAt: createdAt,
    completedAt: input.done ? createdAt : ''
  };
}

export function updateTodo(existing, input = {}) {
  if (!existing?.id) throw new Error('existing todo is required');
  const done = input.done !== undefined ? Boolean(input.done) : Boolean(existing.done);
  const wasDone = Boolean(existing.done);
  const updatedAt = nextUpdatedAt(existing.updatedAt);
  const next = {
    ...existing,
    title: input.title !== undefined ? String(input.title || '').trim() : existing.title,
    note: input.note !== undefined ? String(input.note || '').trim() : existing.note,
    dueDate: input.dueDate !== undefined ? normalizeDate(input.dueDate) : existing.dueDate,
    pinned: input.pinned !== undefined ? Boolean(input.pinned) : Boolean(existing.pinned),
    done,
    updatedAt,
    completedAt: done ? (wasDone ? existing.completedAt || updatedAt : updatedAt) : ''
  };
  if (!next.title) throw new Error('title is required');
  return next;
}

export function sortTodos(todos, today = new Date().toISOString().slice(0, 10)) {
  return [...todos].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return compareDueDate(a, b, today)
      || String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
      || a.title.localeCompare(b.title);
  });
}

export function dashboardTodos(todos, today = new Date().toISOString().slice(0, 10), limit = 5) {
  return sortTodos(todos.filter((todo) => !todo.done), today).slice(0, limit);
}
