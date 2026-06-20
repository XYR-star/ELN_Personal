import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LiteratureCardStore,
  LiteratureAnnotationStore,
  LiteratureEvidenceStore,
  isAnnotatableAttachmentKind,
  normalizeLiteratureAnnotation,
  normalizeLiteratureCard,
  normalizeLiteratureEvidence,
  normalizeLiteraturePaper,
  normalizeAttachmentKind,
  normalizeZoteroItem,
  formatEvidenceMarkdown,
  tagsFromVisibleItems,
} from '../src/literature-store.js';

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

test('tagsFromVisibleItems derives tags only from currently visible papers', () => {
  const tags = tagsFromVisibleItems([
    { key: 'KEEP1', tags: ['Cells', 'proteomics', 'cells'] },
    { key: 'KEEP2', tags: ['mitochondria'] },
  ]);

  assert.deepEqual(tags, [
    { tag: 'Cells' },
    { tag: 'proteomics' },
    { tag: 'mitochondria' },
  ]);
});

test('normalizeAttachmentKind classifies previewable literature attachments', () => {
  assert.equal(normalizeAttachmentKind('application/pdf', 'paper.PDF'), 'pdf');
  assert.equal(normalizeAttachmentKind('image/png', 'figure.png'), 'image');
  assert.equal(normalizeAttachmentKind('', 'microscope-photo.jpeg'), 'image');
  assert.equal(normalizeAttachmentKind('text/html', 'snapshot.html'), 'html');
  assert.equal(normalizeAttachmentKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'table.xlsx'), 'other');
});

test('isAnnotatableAttachmentKind allows pdf, image, and html previews only', () => {
  assert.equal(isAnnotatableAttachmentKind('pdf'), true);
  assert.equal(isAnnotatableAttachmentKind('image'), true);
  assert.equal(isAnnotatableAttachmentKind('html'), true);
  assert.equal(isAnnotatableAttachmentKind('other'), false);
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

test('LiteratureEvidenceStore persists local papers and evidence cards', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'literature-evidence-'));
  try {
    const store = new LiteratureEvidenceStore(dir, {
      now: () => new Date('2026-06-20T09:30:00+08:00'),
    });

    const paper = await store.savePaper({
      key: 'Local Paper 1',
      title: 'FAPS reference',
      doi: '10.1000/example',
      url: 'https://example.org/paper',
      tags: ['faps', 'cell'],
    });

    assert.equal(paper.key, 'LocalPaper1');
    assert.equal(paper.title, 'FAPS reference');
    assert.deepEqual(paper.tags, ['faps', 'cell']);

    const evidence = await store.saveEvidence({
      paperKey: paper.key,
      type: 'figure',
      page: '3',
      section: 'Fig. 2B',
      original_text: 'Cells sort cleanly after fixation.',
      my_note: 'Useful control for [[Experiment:12]].',
    });

    assert.equal(evidence.paperKey, 'LocalPaper1');
    assert.match(evidence.id, /^fig-/);
    assert.equal(evidence.reference, `[[Evidence:LocalPaper1#${evidence.id}]]`);

    const raw = await readFile(path.join(dir, 'Literature', 'evidence', 'LocalPaper1', `${evidence.id}.json`), 'utf8');
    assert.match(raw, /Cells sort cleanly/);

    const listed = await store.listEvidence('LocalPaper1');
    assert.equal(listed.length, 1);
    assert.equal(listed[0].my_note, 'Useful control for [[Experiment:12]].');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('literature evidence normalizers reject missing keys and clean invalid types', () => {
  assert.equal(normalizeLiteraturePaper({ key: 'A B/C', title: 'Paper' }).key, 'ABC');
  assert.throws(() => normalizeLiteraturePaper({ title: 'No key' }), /paper key is required/);
  assert.equal(normalizeLiteratureEvidence({ paperKey: 'KEY', id: 'manual-1', type: 'odd' }).type, 'quote');
  assert.throws(() => normalizeLiteratureEvidence({ type: 'quote' }), /paperKey is required/);
});

test('formatEvidenceMarkdown creates a paste-ready citation block', () => {
  const block = formatEvidenceMarkdown({
    reference: '[[Evidence:ABC123#quote-20260620093000]]',
    type: 'quote',
    page: '3',
    section: 'Fig. 2B',
    original_text: 'Line one.\nLine two.',
    my_note: 'Use this as a control for [[Experiment:12]].',
  }, {
    title: 'FAPS reference',
    creators: ['Ada Lovelace', 'Research Team'],
    year: '2026',
    doi: '10.1000/example',
  });

  assert.equal(block, [
    '> Line one.',
    '> Line two.',
    '',
    'Evidence: [[Evidence:ABC123#quote-20260620093000]]',
    'Source: FAPS reference · Ada Lovelace et al. · 2026 · Fig. 2B · p.3 · DOI:10.1000/example',
    'Note: Use this as a control for [[Experiment:12]].',
  ].join('\n'));
});

test('normalizeLiteratureAnnotation records normalized PDF drawing coordinates', () => {
  const annotation = normalizeLiteratureAnnotation({
    paperKey: 'Paper 1',
    attachmentKey: 'Attach 1',
    tool: 'ellipse',
    page: '2',
    rect: { x: '0.25', y: '-1', width: '2', height: '0.5' },
    color: '#ffcc00',
    note: 'Important area for [[Experiment:12]].',
    quote: 'A visible phrase.',
  }, {
    now: () => new Date('2026-06-20T16:00:00+08:00'),
  });

  assert.equal(annotation.paperKey, 'Paper1');
  assert.equal(annotation.attachmentKey, 'Attach1');
  assert.equal(annotation.tool, 'ellipse');
  assert.equal(annotation.page, 2);
  assert.deepEqual(annotation.rect, { x: 0.25, y: 0, width: 1, height: 0.5 });
  assert.equal(annotation.reference, `[[PaperAnnotation:Paper1#${annotation.id}]]`);
});

test('LiteratureAnnotationStore persists annotation cards per paper', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'literature-annotation-'));
  try {
    const store = new LiteratureAnnotationStore(dir, {
      now: () => new Date('2026-06-20T16:00:00+08:00'),
    });

    const saved = await store.save({
      paperKey: 'ABC123',
      attachmentKey: 'PDF456',
      tool: 'highlight',
      page: 1,
      rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.04 },
      note: 'This supports the screen design.',
    });

    assert.equal(saved.paperKey, 'ABC123');
    assert.equal(saved.attachmentKey, 'PDF456');
    assert.match(saved.id, /^ann-/);

    const raw = await readFile(path.join(dir, 'Literature', 'annotations', 'ABC123', `${saved.id}.json`), 'utf8');
    assert.match(raw, /screen design/);

    const listed = await store.list('ABC123');
    assert.equal(listed.length, 1);
    assert.equal(listed[0].reference, saved.reference);

    assert.equal(await store.delete('ABC123', saved.id), true);
    assert.equal(await store.delete('ABC123', saved.id), false);
    assert.equal((await store.list('ABC123')).length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
