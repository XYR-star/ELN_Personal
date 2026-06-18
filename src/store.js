import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createPlan, filterPlansByRange, updatePlan } from './planner.js';

export class PlannerStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.writeQueue = Promise.resolve();
  }

  async ensureFile() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await writeFile(this.filePath, JSON.stringify({ plans: [] }, null, 2));
    }
  }

  async readData() {
    await this.ensureFile();
    const raw = await readFile(this.filePath, 'utf8');
    const data = JSON.parse(raw || '{}');
    return { plans: Array.isArray(data.plans) ? data.plans : [] };
  }

  async writeData(data) {
    await this.ensureFile();
    this.writeQueue = this.writeQueue.then(() => writeFile(this.filePath, JSON.stringify(data, null, 2)));
    await this.writeQueue;
  }

  async list({ start, end } = {}) {
    const data = await this.readData();
    if (start && end) return filterPlansByRange(data.plans, start, end);
    return data.plans.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }

  async get(id) {
    const data = await this.readData();
    const plan = data.plans.find((item) => item.id === id);
    if (!plan) throw new Error('plan not found');
    return plan;
  }

  async create(input) {
    const data = await this.readData();
    const plan = createPlan(input);
    data.plans.push(plan);
    await this.writeData(data);
    return plan;
  }

  async update(id, input) {
    const data = await this.readData();
    const index = data.plans.findIndex((item) => item.id === id);
    if (index === -1) throw new Error('plan not found');
    const plan = updatePlan(data.plans[index], input);
    data.plans[index] = plan;
    await this.writeData(data);
    return plan;
  }

  async delete(id) {
    const data = await this.readData();
    const next = data.plans.filter((item) => item.id !== id);
    if (next.length === data.plans.length) throw new Error('plan not found');
    await this.writeData({ plans: next });
  }
}
