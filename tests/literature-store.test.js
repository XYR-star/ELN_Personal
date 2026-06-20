import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { LiteratureCardStore, normalizeLiteratureCard, normalizeZoteroItem } from '../src/literature-store.js';

test('normalizeZoteroItem flattens Zotero API item data', () => {
  const item = normalizeZoteroItem({
    key: 'ABC123',
    links: { alternate: { href: 'https://www.zotero.org/users/1/items/ABC123' } },
    data: {
      key: 'ABC123',
      version: 12,
      itemType: 'journalArticle',
      title: 'A useful method',
      creators: [{ firstName: 'Ada', lastName: 'Lovelace' }, { name: 'Research Team' }],
      date: '2026-06-19',
      publicationTitle: 'Journal of Tests',
      DOI: '10.1234/test',
      url: 'https://example.org/paper',
      tags: [{ tag: 'faps' }, { tag: 'cell' }],
      collections: ['COL1'],
    },
  });

  assert.deepEqual(item, {
    key: 'ABC123',
    version: 12,
    itemType: 'journalArticle',
    title: 'A useful method',
    creators: ['Ada Lovelace', 'Research Team'],
    year: '2026',
    publicationTitle: 'Journal of Tests',
    date: '2026-06-19',
    doi: '10.1234/test',
    url: 'https://example.org/paper',
    abstractNote: '',
    tags: ['faps', 'cell'],
    collections: ['COL1'],
    dateModified: '',
    zoteroUrl: 'https://www.zotero.org/users/1/items/ABC123',
  });
});

test('LiteratureCardStore persists local reading cards', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'literature-store-'));
  try {
    const store = new LiteratureCardStore(dir, {
      now: () => new Date('2026-06-19T12:00:00+08:00'),
    });

    const saved = await store.save({
      itemKey: 'ABC123',
      status: 'reading',
      summary: 'Useful for FAPS controls',
      note: 'Check against [[Experiment:12]]',
      linked_experiments: [12, '12', 7],
      linked_resources: ['11'],
    });

    assert.equal(saved.itemKey, 'ABC123');
    assert.equal(saved.status, 'reading');
    assert.deepEqual(saved.linked_experiments, [12, 7]);
    assert.deepEqual(saved.linked_resources, [11]);

    const raw = await readFile(path.join(dir, 'Literature', 'cards', 'ABC123.json'), 'utf8');
    assert.match(raw, /Useful for FAPS controls/);

    const read = await store.read('ABC123');
    assert.equal(read.summary, 'Useful for FAPS controls');
    assert.equal((await store.list()).length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('normalizeLiteratureCard defaults invalid status and rejects missing key', () => {
  assert.equal(normalizeLiteratureCard({ itemKey: 'KEY1', status: 'odd' }).status, 'unread');
  assert.throws(() => normalizeLiteratureCard({ status: 'read' }), /itemKey is required/);
});
