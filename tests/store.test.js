import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PlannerStore } from '../src/store.js';

test('PlannerStore persists plans and supports CRUD', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'planner-store-'));
  try {
    const store = new PlannerStore(path.join(dir, 'plans.json'));
    const created = await store.create({
      title: 'PCR setup',
      type: 'pcr',
      start: '2026-06-16T10:00'
    });

    assert.equal((await store.list()).length, 1);
    assert.equal((await store.get(created.id)).title, 'PCR setup');

    const updated = await store.update(created.id, { status: 'done' });
    assert.equal(updated.status, 'done');

    await store.delete(created.id);
    assert.equal((await store.list()).length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('PlannerStore keeps concurrent plans instead of overwriting the same snapshot', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'planner-store-concurrent-'));
  try {
    const store = new PlannerStore(path.join(dir, 'plans.json'));
    const titles = Array.from({ length: 12 }, (_, index) => `Concurrent plan ${index + 1}`);

    await Promise.all(titles.map((title) => store.create({
      title,
      start: '2026-07-22T09:00'
    })));

    const plans = await store.list();
    assert.equal(plans.length, titles.length);
    assert.deepEqual(new Set(plans.map((plan) => plan.title)), new Set(titles));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
