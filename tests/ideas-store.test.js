import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { IdeasStore, extractIdeaLinks, extractIdeaTags } from '../src/ideas-store.js';

test('IdeasStore persists memo markdown files with frontmatter', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ideas-store-'));
  try {
    const store = new IdeasStore(dir, {
      now: () => new Date('2026-06-19T10:30:00+08:00'),
    });

    const created = await store.create({
      markdown: 'Try FAPS sorting again #faps [[Experiment:12]] [[Resource:11]]',
      location: 'cell room',
    });

    assert.equal(created.id, '20260619-001');
    assert.equal(created.date, '2026-06-19');
    assert.deepEqual(created.tags, ['faps']);
    assert.deepEqual(created.linked_experiments, [12]);
    assert.deepEqual(created.linked_resources, [11]);

    const saved = await readFile(path.join(dir, 'Ideas', '2026-06-19', '20260619-001.md'), 'utf8');
    assert.match(saved, /type: idea/);
    assert.match(saved, /id: 20260619-001/);
    assert.match(saved, /tags: \[faps\]/);
    assert.match(saved, /experiments: \[12\]/);
    assert.match(saved, /resources: \[11\]/);
    assert.match(saved, /location: cell room/);
    assert.match(saved, /Try FAPS sorting again/);

    const listed = await store.list({ date: '2026-06-19' });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].markdown, created.markdown);

    const updated = await store.update(created.id, {
      markdown: 'Different idea #rna [[Experiment:7]]',
      location: '',
    });
    assert.deepEqual(updated.tags, ['rna']);
    assert.deepEqual(updated.linked_experiments, [7]);
    assert.deepEqual(updated.linked_resources, []);

    await store.delete(created.id);
    assert.equal((await store.list({ date: '2026-06-19' })).length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('idea markdown helpers extract tags and eLab links', () => {
  assert.deepEqual(extractIdeaTags('alpha #faps #cell-line #faps'), ['faps', 'cell-line']);
  assert.deepEqual(extractIdeaLinks('[[Experiment:12]] [[experiment:7]] [[Resource:11]]'), {
    linked_experiments: [12, 7],
    linked_resources: [11],
  });
});

test('IdeasStore merges manual tags with markdown hash tags', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ideas-store-'));
  try {
    const store = new IdeasStore(dir, {
      now: () => new Date('2026-06-19T11:15:00+08:00'),
    });

    const created = await store.create({
      markdown: 'Check cells tomorrow #cell #faps',
      tags: ['manual', 'cell'],
    });

    assert.deepEqual(created.tags, ['manual', 'cell', 'faps']);

    const listed = await store.list({ date: '2026-06-19' });
    assert.deepEqual(listed[0].tags, ['manual', 'cell', 'faps']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
