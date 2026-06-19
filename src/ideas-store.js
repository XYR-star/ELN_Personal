import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function shanghaiDate(date) {
  return DATE_FORMAT.format(date);
}

function stripFrontmatter(raw) {
  if (!raw.startsWith('---')) return raw.trim();
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return raw.trim();
  return raw.slice(end + 4).trim();
}

function parseFrontmatter(raw) {
  if (!raw.startsWith('---')) return {};
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return {};
  const frontmatter = {};
  for (const line of raw.slice(4, end).split('\n')) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    frontmatter[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return frontmatter;
}

function parseListValue(value = '') {
  const match = String(value).match(/^\[(.*)\]$/);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueNumbers(values) {
  return [...new Set(values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
}

function uniqueTags(values) {
  const tags = [];
  const seen = new Set();
  for (const value of values) {
    const tag = String(value || '').trim().replace(/^#/, '');
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

export function extractIdeaTags(markdown = '') {
  return uniqueTags([...String(markdown || '').matchAll(/(^|\s)#([A-Za-z0-9_-]+)/g)].map((match) => match[2]));
}

export function extractIdeaLinks(markdown = '') {
  const experiments = [];
  const resources = [];
  for (const match of markdown.matchAll(/\[\[\s*(Experiment|Resource)\s*:\s*(\d+)\s*\]\]/gi)) {
    if (match[1].toLowerCase() === 'experiment') experiments.push(match[2]);
    if (match[1].toLowerCase() === 'resource') resources.push(match[2]);
  }
  return {
    linked_experiments: uniqueNumbers(experiments),
    linked_resources: uniqueNumbers(resources),
  };
}

function frontmatter(idea) {
  return [
    '---',
    'type: idea',
    `id: ${idea.id}`,
    `created_at: ${idea.created_at}`,
    `updated_at: ${idea.updated_at}`,
    `tags: [${idea.tags.join(', ')}]`,
    `experiments: [${idea.linked_experiments.join(', ')}]`,
    `resources: [${idea.linked_resources.join(', ')}]`,
    `location: ${idea.location || ''}`,
    '---',
    '',
  ].join('\n');
}

export class IdeasStore {
  constructor(rootDir, { now = () => new Date() } = {}) {
    this.rootDir = rootDir;
    this.now = now;
  }

  ideasDir(date) {
    return path.join(this.rootDir, 'Ideas', date);
  }

  ideaPath(date, id) {
    return path.join(this.ideasDir(date), `${id}.md`);
  }

  async nextId(date) {
    await mkdir(this.ideasDir(date), { recursive: true });
    const files = await readdir(this.ideasDir(date));
    const prefix = date.replaceAll('-', '');
    const max = files
      .map((file) => file.match(new RegExp(`^${prefix}-(\\d{3})\\.md$`))?.[1])
      .filter(Boolean)
      .map(Number)
      .reduce((highest, value) => Math.max(highest, value), 0);
    return `${prefix}-${String(max + 1).padStart(3, '0')}`;
  }

  async create(input) {
    const now = this.now();
    const date = shanghaiDate(now);
    const id = await this.nextId(date);
    const idea = this.normalize({
      id,
      date,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      ...input,
    });
    await this.write(idea);
    return idea;
  }

  normalize(input) {
    const markdown = String(input.markdown || '').trim();
    const links = extractIdeaLinks(markdown);
    const hasExplicitTags = Object.prototype.hasOwnProperty.call(input, 'tags_explicit') ? input.tags_explicit : Object.prototype.hasOwnProperty.call(input, 'tags');
    const hasExplicitExperiments = Object.prototype.hasOwnProperty.call(input, 'linked_experiments_explicit') ? input.linked_experiments_explicit : Object.prototype.hasOwnProperty.call(input, 'linked_experiments');
    const hasExplicitResources = Object.prototype.hasOwnProperty.call(input, 'linked_resources_explicit') ? input.linked_resources_explicit : Object.prototype.hasOwnProperty.call(input, 'linked_resources');
    return {
      id: input.id,
      date: input.date,
      created_at: input.created_at,
      updated_at: input.updated_at,
      markdown,
      tags: hasExplicitTags && Array.isArray(input.tags) ? uniqueTags([...input.tags, ...extractIdeaTags(markdown)]) : extractIdeaTags(markdown),
      linked_experiments: hasExplicitExperiments && Array.isArray(input.linked_experiments) ? uniqueNumbers(input.linked_experiments) : links.linked_experiments,
      linked_resources: hasExplicitResources && Array.isArray(input.linked_resources) ? uniqueNumbers(input.linked_resources) : links.linked_resources,
      location: String(input.location || '').trim(),
    };
  }

  async write(idea) {
    await mkdir(this.ideasDir(idea.date), { recursive: true });
    await writeFile(this.ideaPath(idea.date, idea.id), `${frontmatter(idea)}${idea.markdown}\n`);
  }

  async list({ date } = {}) {
    const root = date ? this.ideasDir(date) : path.join(this.rootDir, 'Ideas');
    try {
      if (date) {
        const files = await readdir(root);
        const ideas = await Promise.all(files.filter((file) => file.endsWith('.md')).map((file) => this.read(date, file.replace(/\.md$/, ''))));
        return ideas.sort((a, b) => b.created_at.localeCompare(a.created_at));
      }
      const dates = await readdir(root);
      const nested = await Promise.all(dates.map((day) => this.list({ date: day }).catch(() => [])));
      return nested.flat().sort((a, b) => b.created_at.localeCompare(a.created_at));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async read(date, id) {
    const raw = await readFile(this.ideaPath(date, id), 'utf8');
    const metadata = parseFrontmatter(raw);
    const markdown = stripFrontmatter(raw);
    return this.normalize({
      id,
      date,
      created_at: metadata.created_at || `${date}T00:00:00+08:00`,
      updated_at: metadata.updated_at || `${date}T00:00:00+08:00`,
      markdown,
      tags: parseListValue(metadata.tags),
      linked_experiments: parseListValue(metadata.experiments),
      linked_resources: parseListValue(metadata.resources),
      location: metadata.location || '',
    });
  }

  async update(id, input) {
    const date = `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}`;
    const existing = await this.read(date, id);
    const now = this.now().toISOString();
    const idea = this.normalize({
      ...existing,
      ...input,
      id,
      date,
      created_at: existing.created_at,
      updated_at: now,
      tags_explicit: Object.prototype.hasOwnProperty.call(input, 'tags'),
      linked_experiments_explicit: Object.prototype.hasOwnProperty.call(input, 'linked_experiments'),
      linked_resources_explicit: Object.prototype.hasOwnProperty.call(input, 'linked_resources'),
    });
    await this.write(idea);
    return idea;
  }

  async delete(id) {
    const date = `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}`;
    await rm(this.ideaPath(date, id), { force: false });
  }
}
