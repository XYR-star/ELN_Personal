import crypto from 'node:crypto';
import { appendFile, mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createPlan, filterPlansByRange, updatePlan } from './planner.js';
import { createTodo, sortTodos, updateTodo } from './todos.js';

const LOCK_RETRY_MS = 50;
const LOCK_TIMEOUT_MS = 5000;
const STALE_LOCK_MS = 30000;

export class PlannerStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.historyPath = `${filePath}.history.jsonl`;
    this.lockPath = `${filePath}.lock`;
    this.operationQueue = Promise.resolve();
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

  async writeData(data, { before, operation } = {}) {
    await this.ensureFile();
    if (before) {
      await appendFile(this.historyPath, `${JSON.stringify({
        savedAt: new Date().toISOString(),
        operation,
        plans: before.plans
      })}\n`, { encoding: 'utf8', mode: 0o600 });
    }
    const tempPath = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await writeFile(tempPath, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
      await rename(tempPath, this.filePath);
    } finally {
      await unlink(tempPath).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  }

  async acquireLock() {
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const handle = await open(this.lockPath, 'wx', 0o600);
        try {
          await handle.writeFile(JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }));
        } catch (error) {
          await handle.close();
          await unlink(this.lockPath).catch(() => {});
          throw error;
        }
        return async () => {
          await handle.close();
          await unlink(this.lockPath).catch((error) => {
            if (error.code !== 'ENOENT') throw error;
          });
        };
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        try {
          const lock = await stat(this.lockPath);
          if (Date.now() - lock.mtimeMs > STALE_LOCK_MS) {
            await unlink(this.lockPath);
            continue;
          }
        } catch (lockError) {
          if (lockError.code === 'ENOENT') continue;
          throw lockError;
        }
        await delay(LOCK_RETRY_MS);
      }
    }
    throw new Error('planner data is busy; please retry');
  }

  validateMutation(before, after, operation, result) {
    const beforeIds = before.plans.map((plan) => plan.id);
    const afterIds = after.plans.map((plan) => plan.id);
    if (new Set(afterIds).size !== afterIds.length) throw new Error('planner mutation produced duplicate plan ids');
    const missingIds = beforeIds.filter((id) => !afterIds.includes(id));
    const addedIds = afterIds.filter((id) => !beforeIds.includes(id));
    if (operation.kind === 'create') {
      if (missingIds.length || addedIds.length !== 1 || addedIds[0] !== result?.id) {
        throw new Error('planner create would overwrite existing plans');
      }
      return;
    }
    if (operation.kind === 'update') {
      if (missingIds.length || addedIds.length || !afterIds.includes(operation.targetId)) {
        throw new Error('planner update would overwrite unrelated plans');
      }
      return;
    }
    if (operation.kind === 'delete') {
      if (addedIds.length || missingIds.length !== 1 || missingIds[0] !== operation.targetId) {
        throw new Error('planner delete would remove unrelated plans');
      }
    }
  }

  async mutateData(operation, mutationInfo) {
    const mutation = this.operationQueue.then(async () => {
      const releaseLock = await this.acquireLock();
      try {
        const data = await this.readData();
        const before = JSON.parse(JSON.stringify(data));
        const result = await operation(data);
        const operationDetails = {
          ...mutationInfo,
          targetId: mutationInfo.targetId || result?.id || null
        };
        this.validateMutation(before, data, operationDetails, result);
        await this.writeData(data, { before, operation: operationDetails });
        return result;
      } finally {
        await releaseLock();
      }
    });
    this.operationQueue = mutation.catch(() => {});
    return mutation;
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
    return this.mutateData((data) => {
      const plan = createPlan(input);
      data.plans.push(plan);
      return plan;
    }, { kind: 'create' });
  }

  async update(id, input) {
    return this.mutateData((data) => {
      const index = data.plans.findIndex((item) => item.id === id);
      if (index === -1) throw new Error('plan not found');
      const plan = updatePlan(data.plans[index], input);
      data.plans[index] = plan;
      return plan;
    }, { kind: 'update', targetId: id });
  }

  async delete(id) {
    return this.mutateData((data) => {
      const index = data.plans.findIndex((item) => item.id === id);
      if (index === -1) throw new Error('plan not found');
      data.plans.splice(index, 1);
    }, { kind: 'delete', targetId: id });
  }
}

export class TodoStore {
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
      await writeFile(this.filePath, JSON.stringify({ todos: [] }, null, 2));
    }
  }

  async readData() {
    await this.ensureFile();
    const raw = await readFile(this.filePath, 'utf8');
    const data = JSON.parse(raw || '{}');
    return { todos: Array.isArray(data.todos) ? data.todos : [] };
  }

  async writeData(data) {
    await this.ensureFile();
    this.writeQueue = this.writeQueue.then(() => writeFile(this.filePath, JSON.stringify(data, null, 2)));
    await this.writeQueue;
  }

  async list({ today } = {}) {
    const data = await this.readData();
    return sortTodos(data.todos, today);
  }

  async get(id) {
    const data = await this.readData();
    const todo = data.todos.find((item) => item.id === id);
    if (!todo) throw new Error('todo not found');
    return todo;
  }

  async create(input) {
    const data = await this.readData();
    const todo = createTodo(input);
    data.todos.push(todo);
    await this.writeData(data);
    return todo;
  }

  async update(id, input) {
    const data = await this.readData();
    const index = data.todos.findIndex((item) => item.id === id);
    if (index === -1) throw new Error('todo not found');
    const todo = updateTodo(data.todos[index], input);
    data.todos[index] = todo;
    await this.writeData(data);
    return todo;
  }

  async delete(id) {
    const data = await this.readData();
    const next = data.todos.filter((item) => item.id !== id);
    if (next.length === data.todos.length) throw new Error('todo not found');
    await this.writeData({ todos: next });
  }
}
