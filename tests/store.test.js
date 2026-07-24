import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
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

test('PlannerStore preserves same-day plans of different types across independent instances', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'planner-store-multi-instance-'));
  const file = path.join(dir, 'plans.json');
  try {
    const firstStore = new PlannerStore(file);
    const secondStore = new PlannerStore(file);
    const existing = await firstStore.create({
      title: 'Existing Friday plan',
      type: 'other',
      start: '2026-07-24T09:00'
    });

    await Promise.all([
      firstStore.create({ title: 'Cell passage', type: 'cell_passage', start: '2026-07-24T10:30' }),
      secondStore.create({ title: 'PCR', type: 'pcr', start: '2026-07-24T13:00' })
    ]);

    const plans = await firstStore.list();
    assert.deepEqual(new Set(plans.map((plan) => plan.title)), new Set(['Existing Friday plan', 'Cell passage', 'PCR']));
    assert.equal((await firstStore.get(existing.id)).type, 'other');

    const history = (await readFile(`${file}.history.jsonl`, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.ok(history.some((snapshot) => snapshot.plans.some((plan) => plan.id === existing.id)));
    assert.deepEqual((await readdir(dir)).filter((name) => name.endsWith('.tmp') || name.endsWith('.lock')), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
