import test from 'node:test';
import assert from 'node:assert/strict';
import { createTodo, updateTodo, dashboardTodos } from '../src/todos.js';

test('createTodo normalizes a mixed todo with optional due date and pinned flag', () => {
  const todo = createTodo({ title: '  thaw cells  ', dueDate: '2026-06-24', pinned: true, note: 'check C4' });

  assert.equal(todo.title, 'thaw cells');
  assert.equal(todo.dueDate, '2026-06-24');
  assert.equal(todo.pinned, true);
  assert.equal(todo.done, false);
  assert.ok(todo.id);
  assert.ok(todo.createdAt);
});

test('updateTodo can complete and reopen a todo without losing optional fields', () => {
  const todo = createTodo({ title: 'order primers', dueDate: '2026-06-25', pinned: true });
  const done = updateTodo(todo, { done: true });
  const reopened = updateTodo(done, { done: false });

  assert.equal(done.done, true);
  assert.ok(done.completedAt);
  assert.equal(reopened.done, false);
  assert.equal(reopened.completedAt, '');
  assert.equal(reopened.dueDate, '2026-06-25');
  assert.equal(reopened.pinned, true);
});

test('dashboardTodos shows unfinished pinned and dated todos before undated work', () => {
  const items = [
    createTodo({ title: 'no date' }),
    createTodo({ title: 'future', dueDate: '2026-06-30' }),
    createTodo({ title: 'done today', dueDate: '2026-06-24' }),
    createTodo({ title: 'overdue', dueDate: '2026-06-20' }),
    createTodo({ title: 'pinned later', dueDate: '2026-07-01', pinned: true }),
  ];
  const done = updateTodo(items[2], { done: true });
  const result = dashboardTodos([items[0], items[1], done, items[3], items[4]], '2026-06-24', 4);

  assert.deepEqual(result.map((todo) => todo.title), ['pinned later', 'overdue', 'future', 'no date']);
});
