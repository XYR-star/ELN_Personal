import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const VALID_STATUSES = new Set(['unread', 'reading', 'read', 'important']);
const VALID_EVIDENCE_TYPES = new Set(['quote', 'figure', 'finding', 'protocol']);
const VALID_ANNOTATION_TOOLS = new Set(['highlight', 'box', 'ellipse']);

function uniqueNumbers(values = []) {
  return [...new Set(values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
}

function cleanText(value = '', maxLength = 20000) {
  return String(value || '').trim().slice(0, maxLength);
}

function safeKey(key) {
  return String(key || '').replace(/[^A-Za-z0-9_-]/g, '');
}

function cleanTags(values = []) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => safeKey(String(value).replace(/^#/, '').toLowerCase())).filter(Boolean))];
}

function clampUnit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

function evidencePrefix(type) {
  return ({
    figure: 'fig',
    finding: 'finding',
    protocol: 'protocol',
    quote: 'quote',
  })[type] || 'quote';
}

export function normalizeAttachmentKind(contentType = '', filename = '') {
  const type = String(contentType || '').toLowerCase();
  const name = String(filename || '').toLowerCase();
  if (type.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (
    type.startsWith('image/png')
    || type.startsWith('image/jpeg')
    || type.startsWith('image/jpg')
    || type.startsWith('image/gif')
    || type.startsWith('image/webp')
    || type.startsWith('image/bmp')
    || /\.(png|jpe?g|gif|webp|bmp)$/.test(name)
  ) {
    return 'image';
  }
  if (type.includes('html') || /\.(html?|xhtml)$/.test(name)) return 'html';
  return 'other';
}

export function isAnnotatableAttachmentKind(kind = '') {
  return ['pdf', 'image', 'html'].includes(String(kind || '').toLowerCase());
}

export function sanitizeHtmlPreview(rawHtml = '') {
  return String(rawHtml || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '');
}

function authorSummary(creators = []) {
  const names = Array.isArray(creators) ? creators.filter(Boolean) : [];
  if (!names.length) return '';
  return names.length === 1 ? names[0] : `${names[0]} et al.`;
}

function quoteBlock(value = '') {
  return cleanText(value, 20000)
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');
}

export function formatEvidenceMarkdown(evidence = {}, paper = {}) {
  const blocks = [];
  const quote = quoteBlock(evidence.original_text);
  if (quote.trim()) blocks.push(quote);

  const metadata = [];
  const reference = cleanText(evidence.reference || '');
  if (reference) metadata.push(`Evidence: ${reference}`);

  const source = [
    cleanText(paper.title || ''),
    authorSummary(paper.creators),
    cleanText(paper.year || ''),
    cleanText(evidence.section || ''),
    evidence.page ? `p.${cleanText(evidence.page, 80)}` : '',
    paper.doi ? `DOI:${cleanText(paper.doi, 255)}` : '',
  ].filter(Boolean).join(' · ');
  if (source) metadata.push(`Source: ${source}`);

  const note = cleanText(evidence.my_note || '');
  if (note) metadata.push(`Note: ${note}`);
  if (metadata.length) blocks.push(metadata.join('\n'));

  return blocks.join('\n\n');
}

export function normalizeZoteroItem(item = {}) {
  const data = item.data || item;
  const creators = Array.isArray(data.creators)
    ? data.creators.map((creator) => {
      if (creator.name) return creator.name;
      return [creator.firstName, creator.lastName].filter(Boolean).join(' ');
    }).filter(Boolean)
    : [];
  const date = String(data.date || '');
  const year = date.match(/\b(18|19|20)\d{2}\b/)?.[0] || '';
  return {
    key: data.key || item.key || '',
    version: data.version || item.version || 0,
    itemType: data.itemType || '',
    title: data.title || 'Untitled',
    creators,
    year,
    publicationTitle: data.publicationTitle || data.bookTitle || data.websiteTitle || '',
    date,
    doi: data.DOI || '',
    url: data.url || '',
    abstractNote: data.abstractNote || '',
    tags: Array.isArray(data.tags) ? data.tags.map((tag) => tag.tag || tag).filter(Boolean) : [],
    collections: Array.isArray(data.collections) ? data.collections : [],
    dateModified: data.dateModified || '',
    zoteroUrl: item.links?.alternate?.href || '',
  };
}

export function tagsFromVisibleItems(items = []) {
  const seen = new Set();
  const tags = [];
  for (const item of items) {
    for (const tag of Array.isArray(item.tags) ? item.tags : []) {
      const value = String(tag?.tag || tag || '').trim();
      const key = value.toLowerCase();
      if (!value || seen.has(key)) continue;
      seen.add(key);
      tags.push({ tag: value });
    }
  }
  return tags;
}

export function normalizeLiteratureCard(input = {}, { now = () => new Date() } = {}) {
  const itemKey = safeKey(input.itemKey || input.item_key);
  if (!itemKey) throw new Error('itemKey is required');
  const status = VALID_STATUSES.has(input.status) ? input.status : 'unread';
  return {
    itemKey,
    status,
    summary: cleanText(input.summary, 4000),
    note: cleanText(input.note, 12000),
    linked_experiments: uniqueNumbers(input.linked_experiments),
    linked_resources: uniqueNumbers(input.linked_resources),
    modified_at: input.modified_at || now().toISOString(),
  };
}

export function normalizeLiteraturePaper(input = {}, { now = () => new Date() } = {}) {
  const key = safeKey(input.key || input.itemKey || input.item_key);
  if (!key) throw new Error('paper key is required');
  return {
    key,
    title: cleanText(input.title || 'Untitled paper', 500),
    creators: Array.isArray(input.creators) ? input.creators.map((creator) => cleanText(creator, 120)).filter(Boolean) : [],
    year: cleanText(input.year, 16),
    publicationTitle: cleanText(input.publicationTitle || input.publication_title, 300),
    doi: cleanText(input.doi || input.DOI, 255),
    url: cleanText(input.url, 1000),
    tags: cleanTags(input.tags),
    created_at: input.created_at || now().toISOString(),
    modified_at: input.modified_at || now().toISOString(),
    local: input.local !== false,
  };
}

export function normalizeLiteratureEvidence(input = {}, { now = () => new Date() } = {}) {
  const paperKey = safeKey(input.paperKey || input.paper_key);
  if (!paperKey) throw new Error('paperKey is required');
  const type = VALID_EVIDENCE_TYPES.has(input.type) ? input.type : 'quote';
  const createdAt = input.created_at || now().toISOString();
  const id = safeKey(input.id) || `${evidencePrefix(type)}-${createdAt.replace(/[^0-9]/g, '').slice(0, 14)}`;
  return {
    id,
    paperKey,
    type,
    page: cleanText(input.page, 80),
    section: cleanText(input.section, 200),
    original_text: cleanText(input.original_text, 20000),
    my_note: cleanText(input.my_note, 12000),
    image_path: cleanText(input.image_path, 1000),
    linked_experiments: uniqueNumbers(input.linked_experiments),
    linked_resources: uniqueNumbers(input.linked_resources),
    created_at: createdAt,
    modified_at: input.modified_at || now().toISOString(),
    reference: `[[Evidence:${paperKey}#${id}]]`,
  };
}

export function normalizeLiteratureAnnotation(input = {}, { now = () => new Date() } = {}) {
  const paperKey = safeKey(input.paperKey || input.paper_key);
  if (!paperKey) throw new Error('paperKey is required');
  const attachmentKey = safeKey(input.attachmentKey || input.attachment_key);
  if (!attachmentKey) throw new Error('attachmentKey is required');
  const tool = VALID_ANNOTATION_TOOLS.has(input.tool) ? input.tool : 'highlight';
  const createdAt = input.created_at || now().toISOString();
  const id = safeKey(input.id) || `ann-${createdAt.replace(/[^0-9]/g, '').slice(0, 14)}`;
  const rect = input.rect || {};
  return {
    id,
    paperKey,
    attachmentKey,
    tool,
    page: Math.max(1, Number.parseInt(input.page, 10) || 1),
    rect: {
      x: clampUnit(rect.x),
      y: clampUnit(rect.y),
      width: clampUnit(rect.width),
      height: clampUnit(rect.height),
    },
    color: cleanText(input.color || '#29aeb9', 32),
    quote: cleanText(input.quote, 20000),
    note: cleanText(input.note, 12000),
    created_at: createdAt,
    modified_at: input.modified_at || now().toISOString(),
    reference: `[[PaperAnnotation:${paperKey}#${id}]]`,
  };
}

export class LiteratureCardStore {
  constructor(rootDir, { now = () => new Date() } = {}) {
    this.rootDir = rootDir;
    this.now = now;
  }

  cardsDir() {
    return path.join(this.rootDir, 'Literature', 'cards');
  }

  cardPath(itemKey) {
    return path.join(this.cardsDir(), `${safeKey(itemKey)}.json`);
  }

  async read(itemKey) {
    try {
      const raw = await readFile(this.cardPath(itemKey), 'utf8');
      return normalizeLiteratureCard(JSON.parse(raw), { now: this.now });
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async list() {
    try {
      const files = await readdir(this.cardsDir());
      const cards = await Promise.all(files.filter((file) => file.endsWith('.json')).map(async (file) => {
        const raw = await readFile(path.join(this.cardsDir(), file), 'utf8');
        return normalizeLiteratureCard(JSON.parse(raw), { now: this.now });
      }));
      return cards.sort((a, b) => b.modified_at.localeCompare(a.modified_at));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async save(input) {
    await mkdir(this.cardsDir(), { recursive: true });
    const card = normalizeLiteratureCard({
      ...input,
      modified_at: this.now().toISOString(),
    }, { now: this.now });
    await writeFile(this.cardPath(card.itemKey), `${JSON.stringify(card, null, 2)}\n`);
    return card;
  }
}

export class LiteratureEvidenceStore {
  constructor(rootDir, { now = () => new Date() } = {}) {
    this.rootDir = rootDir;
    this.now = now;
  }

  literatureDir() {
    return path.join(this.rootDir, 'Literature');
  }

  papersDir() {
    return path.join(this.literatureDir(), 'papers');
  }

  evidenceDir(paperKey = '') {
    return paperKey
      ? path.join(this.literatureDir(), 'evidence', safeKey(paperKey))
      : path.join(this.literatureDir(), 'evidence');
  }

  paperPath(key) {
    return path.join(this.papersDir(), `${safeKey(key)}.json`);
  }

  evidencePath(paperKey, id) {
    return path.join(this.evidenceDir(paperKey), `${safeKey(id)}.json`);
  }

  async savePaper(input) {
    await mkdir(this.papersDir(), { recursive: true });
    const existing = await this.readPaper(input.key || input.itemKey || input.item_key);
    const paper = normalizeLiteraturePaper({
      ...existing,
      ...input,
      created_at: existing?.created_at,
      modified_at: this.now().toISOString(),
    }, { now: this.now });
    await writeFile(this.paperPath(paper.key), `${JSON.stringify(paper, null, 2)}\n`);
    return paper;
  }

  async readPaper(key) {
    try {
      const raw = await readFile(this.paperPath(key), 'utf8');
      return normalizeLiteraturePaper(JSON.parse(raw), { now: this.now });
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async listPapers() {
    try {
      const files = await readdir(this.papersDir());
      const papers = await Promise.all(files.filter((file) => file.endsWith('.json')).map(async (file) => {
        const raw = await readFile(path.join(this.papersDir(), file), 'utf8');
        return normalizeLiteraturePaper(JSON.parse(raw), { now: this.now });
      }));
      return papers.sort((a, b) => b.modified_at.localeCompare(a.modified_at));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async saveEvidence(input) {
    const evidence = normalizeLiteratureEvidence({
      ...input,
      modified_at: this.now().toISOString(),
      created_at: input.created_at || this.now().toISOString(),
    }, { now: this.now });
    await mkdir(this.evidenceDir(evidence.paperKey), { recursive: true });
    await writeFile(this.evidencePath(evidence.paperKey, evidence.id), `${JSON.stringify(evidence, null, 2)}\n`);
    return evidence;
  }

  async listEvidence(paperKey) {
    try {
      const dir = this.evidenceDir(paperKey);
      const files = await readdir(dir);
      const cards = await Promise.all(files.filter((file) => file.endsWith('.json')).map(async (file) => {
        const raw = await readFile(path.join(dir, file), 'utf8');
        return normalizeLiteratureEvidence(JSON.parse(raw), { now: this.now });
      }));
      return cards.sort((a, b) => b.modified_at.localeCompare(a.modified_at));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }
}

export class LiteratureAnnotationStore {
  constructor(rootDir, { now = () => new Date() } = {}) {
    this.rootDir = rootDir;
    this.now = now;
  }

  literatureDir() {
    return path.join(this.rootDir, 'Literature');
  }

  annotationsDir(paperKey = '') {
    return paperKey
      ? path.join(this.literatureDir(), 'annotations', safeKey(paperKey))
      : path.join(this.literatureDir(), 'annotations');
  }

  annotationPath(paperKey, id) {
    return path.join(this.annotationsDir(paperKey), `${safeKey(id)}.json`);
  }

  async save(input) {
    const annotation = normalizeLiteratureAnnotation({
      ...input,
      modified_at: this.now().toISOString(),
      created_at: input.created_at || this.now().toISOString(),
    }, { now: this.now });
    await mkdir(this.annotationsDir(annotation.paperKey), { recursive: true });
    await writeFile(this.annotationPath(annotation.paperKey, annotation.id), `${JSON.stringify(annotation, null, 2)}\n`);
    return annotation;
  }

  async list(paperKey) {
    try {
      const dir = this.annotationsDir(paperKey);
      const files = await readdir(dir);
      const annotations = await Promise.all(files.filter((file) => file.endsWith('.json')).map(async (file) => {
        const raw = await readFile(path.join(dir, file), 'utf8');
        return normalizeLiteratureAnnotation(JSON.parse(raw), { now: this.now });
      }));
      return annotations.sort((a, b) => b.modified_at.localeCompare(a.modified_at));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async delete(paperKey, id) {
    try {
      await unlink(this.annotationPath(paperKey, id));
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  }
}
