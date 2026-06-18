import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlan, filterPlansByRange, updatePlan } from '../src/planner.js';

test('createPlan normalizes a valid experiment plan', () => {
  const plan = createPlan({
    title: 'Day 1 transfection',
    type: 'transfection',
    start: '2026-06-16T09:30',
    end: '2026-06-16T10:30',
    note: 'Use mRNA condition A',
    experimentUrl: 'https://eln.heyrickishere.com/experiments.php?mode=edit&id=1'
  });

  assert.equal(plan.title, 'Day 1 transfection');
  assert.equal(plan.type, 'transfection');
  assert.equal(plan.status, 'planned');
  assert.equal(plan.start, '2026-06-16T09:30');
  assert.equal(plan.end, '2026-06-16T10:30');
  assert.ok(plan.id);
  assert.ok(plan.createdAt);
});

test('createPlan rejects plans without title or with invalid ranges', () => {
  assert.throws(() => createPlan({ start: '2026-06-16T09:30', end: '2026-06-16T10:00' }), /title/i);
  assert.throws(
    () => createPlan({ title: 'bad', start: '2026-06-16T11:30', end: '2026-06-16T10:00' }),
    /end/i
  );
});

test('updatePlan changes status and preserves immutable fields', () => {
  const plan = createPlan({ title: 'Passage cells', type: 'cell_passage', start: '2026-06-16T09:30' });
  const updated = updatePlan(plan, { status: 'done', title: 'Passage cells P4' });

  assert.equal(updated.id, plan.id);
  assert.equal(updated.status, 'done');
  assert.equal(updated.title, 'Passage cells P4');
  assert.equal(updated.createdAt, plan.createdAt);
  assert.notEqual(updated.updatedAt, plan.updatedAt);
});

test('filterPlansByRange includes plans overlapping a calendar range', () => {
  const plans = [
    createPlan({ title: 'PCR', start: '2026-06-16T09:00', end: '2026-06-16T11:00' }),
    createPlan({ title: 'Observe cells', start: '2026-06-18T09:00' }),
    createPlan({ title: 'Old', start: '2026-05-01T09:00' })
  ];

  const result = filterPlansByRange(plans, '2026-06-16T00:00', '2026-06-17T00:00');

  assert.deepEqual(result.map((plan) => plan.title), ['PCR']);
});
