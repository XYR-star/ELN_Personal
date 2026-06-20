import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const VALID_STATUSES = new Set(['unread', 'reading', 'read', 'important']);

function uniqueNumbers(values = []) {
  return [...new Set(values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
}

function cleanText(value = '', maxLength = 20000) {
  return String(value || '').trim().slice(0, maxLength);
}

function safeKey(key) {
  return String(key || '').replace(/[^A-Za-z0-9_-]/g, '');
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
