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

function uniqueNumbers(values) {
  return [...new Set(values.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
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

function stripFrontmatter(raw) {
  if (!raw.startsWith('---')) return raw.trim();
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return raw.trim();
  return raw.slice(end + 4).trim();
}

function parseListValue(value = '') {
  const match = String(value).trim().match(/^\[(.*)\]$/);
  if (!match) return [];
  return match[1].split(',').map((item) => item.trim()).filter(Boolean);
}

function validDate(value, fallback) {
  const date = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : fallback;
}

export function normalizeRecordTitle(value) {
  const title = String(value || '').trim();
  return title || 'Untitled record';
}

export function extractRecordLinks(markdown = '') {
  const text = String(markdown || '');
  const resources = [...text.matchAll(/\[\[\s*Resource\s*:\s*(\d+)\s*\]\]/gi)].map((match) => match[1]);
  const experiments = [...text.matchAll(/\[\[\s*Experiment\s*:\s*(\d+)\s*\]\]/gi)].map((match) => match[1]);
  const ideas = [...text.matchAll(/\[\[\s*Idea\s*:\s*([A-Za-z0-9_-]+)\s*\]\]/gi)].map((match) => match[1]);
  const evidence = [...text.matchAll(/\[\[\s*Evidence\s*:\s*([A-Za-z0-9_-]+#[A-Za-z0-9_-]+)\s*\]\]/gi)].map((match) => match[1]);
  const annotations = [...text.matchAll(/\[\[\s*PaperAnnotation\s*:\s*([A-Za-z0-9_-]+#[A-Za-z0-9_-]+)\s*\]\]/gi)].map((match) => match[1]);
  return {
    resources: uniqueNumbers(resources),
    experiments: uniqueNumbers(experiments),
    ideas: uniqueStrings(ideas),
    evidence: uniqueStrings(evidence),
    annotations: uniqueStrings(annotations),
  };
}

function frontmatter(record) {
  return [
    '---',
    'type: experiment_record',
    `id: ${record.id}`,
    `experiment_id: ${record.experiment_id}`,
    `title: ${record.title}`,
    `record_date: ${record.record_date}`,
    `record_type: ${record.record_type}`,
    `created_at: ${record.created_at}`,
    `updated_at: ${record.updated_at}`,
    `resources: [${record.resources.join(', ')}]`,
    `experiments: [${record.experiments.join(', ')}]`,
    `ideas: [${record.ideas.join(', ')}]`,
    `evidence: [${record.evidence.join(', ')}]`,
    `annotations: [${record.annotations.join(', ')}]`,
    '---',
    '',
  ].join('\n');
}

export class ExperimentRecordsStore {
  constructor(rootDir, { now = () => new Date() } = {}) {
    this.rootDir = rootDir;
    this.now = now;
  }

  recordsDir(experimentId) {
    return path.join(this.rootDir, 'ELN', 'Experiments', String(Number(experimentId)), 'Records');
  }

  recordPath(experimentId, id) {
    return path.join(this.recordsDir(experimentId), `${id}.md`);
  }

  async nextId(experimentId, date) {
    await mkdir(this.recordsDir(experimentId), { recursive: true });
    const files = await readdir(this.recordsDir(experimentId));
    const prefix = date.replaceAll('-', '');
    const max = files
      .map((file) => file.match(new RegExp(`^${prefix}-(\\d{3})\\.md$`))?.[1])
      .filter(Boolean)
      .map(Number)
      .reduce((highest, value) => Math.max(highest, value), 0);
    return `${prefix}-${String(max + 1).padStart(3, '0')}`;
  }

  normalize(experimentId, input) {
    const nowDate = shanghaiDate(this.now());
    const recordDate = validDate(input.record_date, nowDate);
    const markdown = String(input.markdown || '').trim();
    const links = extractRecordLinks(markdown);
    return {
      id: input.id,
      experiment_id: Number(experimentId),
      title: normalizeRecordTitle(input.title),
      record_date: recordDate,
      record_type: String(input.record_type || 'other').trim() || 'other',
      created_at: input.created_at,
      updated_at: input.updated_at,
      markdown,
      resources: links.resources,
      experiments: links.experiments,
      ideas: links.ideas,
      evidence: links.evidence,
      annotations: links.annotations,
    };
  }

  async create(experimentId, input) {
    const now = this.now();
    const recordDate = validDate(input.record_date, shanghaiDate(now));
    const id = await this.nextId(experimentId, recordDate);
    const record = this.normalize(experimentId, {
      ...input,
      id,
      record_date: recordDate,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
    await this.write(record);
    return record;
  }

  async write(record) {
    await mkdir(this.recordsDir(record.experiment_id), { recursive: true });
    await writeFile(this.recordPath(record.experiment_id, record.id), `${frontmatter(record)}${record.markdown}\n`);
  }

  async read(experimentId, id) {
    const raw = await readFile(this.recordPath(experimentId, id), 'utf8');
    const metadata = parseFrontmatter(raw);
    return this.normalize(experimentId, {
      id,
      title: metadata.title || '',
      record_date: metadata.record_date || '',
      record_type: metadata.record_type || 'other',
      created_at: metadata.created_at || new Date(0).toISOString(),
      updated_at: metadata.updated_at || metadata.created_at || new Date(0).toISOString(),
      markdown: stripFrontmatter(raw),
    });
  }

  async list(experimentId) {
    try {
      const files = await readdir(this.recordsDir(experimentId));
      const records = await Promise.all(files.filter((file) => file.endsWith('.md')).map((file) => this.read(experimentId, file.replace(/\.md$/, ''))));
      return records.sort((a, b) => {
        const byDate = b.record_date.localeCompare(a.record_date);
        return byDate || b.updated_at.localeCompare(a.updated_at);
      });
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async update(experimentId, id, input) {
    const existing = await this.read(experimentId, id);
    const record = this.normalize(experimentId, {
      ...existing,
      ...input,
      id,
      created_at: existing.created_at,
      updated_at: this.now().toISOString(),
    });
    await this.write(record);
    return record;
  }

  async delete(experimentId, id) {
    await rm(this.recordPath(experimentId, id), { force: false });
  }
}
