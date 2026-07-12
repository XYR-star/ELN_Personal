import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ExperimentRecordsStore,
  extractRecordLinks,
  normalizeRecordTitle,
} from '../src/experiment-records-store.js';

test('ExperimentRecordsStore persists per-experiment record markdown files', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'experiment-records-'));
  try {
    const store = new ExperimentRecordsStore(dir, {
      now: () => new Date('2026-06-20T09:45:00+08:00'),
    });

    const created = await store.create(12, {
      title: 'FAPS sort run',
      record_date: '2026-06-20',
      record_type: 'facs',
      markdown: [
        'Sorted HCT116 with [[Resource:11]].',
        'Followed idea [[Idea:20260619-001]].',
        'See [[Evidence:IAQBQDVN#ev-1]] and [[PaperAnnotation:IAQBQDVN#ann-2]].',
      ].join('\n'),
    });

    assert.equal(created.id, '20260620-001');
    assert.equal(created.experiment_id, 12);
    assert.equal(created.title, 'FAPS sort run');
    assert.deepEqual(created.resources, [11]);
    assert.deepEqual(created.ideas, ['20260619-001']);
    assert.deepEqual(created.evidence, ['IAQBQDVN#ev-1']);
    assert.deepEqual(created.annotations, ['IAQBQDVN#ann-2']);

    const saved = await readFile(path.join(dir, 'ELN', 'Experiments', '12', 'Records', '20260620-001.md'), 'utf8');
    assert.match(saved, /type: experiment_record/);
    assert.match(saved, /experiment_id: 12/);
    assert.match(saved, /title: FAPS sort run/);
    assert.match(saved, /record_date: 2026-06-20/);
    assert.match(saved, /record_type: facs/);
    assert.match(saved, /resources: \[11\]/);
    assert.match(saved, /ideas: \[20260619-001\]/);
    assert.match(saved, /evidence: \[IAQBQDVN#ev-1\]/);
    assert.match(saved, /annotations: \[IAQBQDVN#ann-2\]/);

    const listed = await store.list(12);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].markdown, created.markdown);

    const updated = await store.update(12, created.id, {
      title: 'Updated run',
      markdown: 'Moved cells to [[Resource:7]]',
    });
    assert.equal(updated.title, 'Updated run');
    assert.deepEqual(updated.resources, [7]);
    assert.deepEqual(updated.ideas, []);

    await store.delete(12, created.id);
    assert.equal((await store.list(12)).length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('ExperimentRecordsStore sorts records by date and modification time', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'experiment-records-'));
  let now = new Date('2026-06-18T10:00:00+08:00');
  try {
    const store = new ExperimentRecordsStore(dir, { now: () => now });
    await store.create(3, { title: 'Earlier', record_date: '2026-06-18', markdown: 'A' });
    now = new Date('2026-06-20T10:00:00+08:00');
    await store.create(3, { title: 'Later', record_date: '2026-06-20', markdown: 'B' });

    const listed = await store.list(3);
    assert.deepEqual(listed.map((record) => record.title), ['Later', 'Earlier']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('record helpers normalize titles and extract cross-links', () => {
  assert.equal(normalizeRecordTitle('   '), 'Untitled record');
  assert.equal(normalizeRecordTitle('  A very small run  '), 'A very small run');
  assert.deepEqual(
    extractRecordLinks('[[Resource:11]] [[Experiment:4]] [[Idea:20260619-001]] [[Evidence:ABC123#ev-2]] [[PaperAnnotation:ABC123#ann-3]]'),
    {
      resources: [11],
      experiments: [4],
      ideas: ['20260619-001'],
      evidence: ['ABC123#ev-2'],
      annotations: ['ABC123#ann-3'],
    },
  );
});
