import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { TodoStore } from '../src/store.js';

test('TodoStore persists todos and supports CRUD', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'todo-store-'));
  try {
    const store = new TodoStore(path.join(dir, 'todos.json'));
    const created = await store.create({ title: 'Check cells', dueDate: '2026-06-24' });

    assert.equal((await store.list()).length, 1);
    assert.equal((await store.get(created.id)).title, 'Check cells');

    const updated = await store.update(created.id, { done: true, note: 'healthy' });
    assert.equal(updated.done, true);
    assert.equal(updated.note, 'healthy');

    await store.delete(created.id);
    assert.equal((await store.list()).length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
