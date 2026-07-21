import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createPlan, filterPlansByRange, updatePlan } from './planner.js';
import { createTodo, sortTodos, updateTodo } from './todos.js';

export class PlannerStore {
  constructor(filePath) {
    this.filePath = filePath;
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

  async writeData(data) {
    await this.ensureFile();
    await writeFile(this.filePath, JSON.stringify(data, null, 2));
  }

  async mutateData(operation) {
    const mutation = this.operationQueue.then(async () => {
      const data = await this.readData();
      const result = await operation(data);
      await this.writeData(data);
      return result;
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
    });
  }

  async update(id, input) {
    return this.mutateData((data) => {
      const index = data.plans.findIndex((item) => item.id === id);
      if (index === -1) throw new Error('plan not found');
      const plan = updatePlan(data.plans[index], input);
      data.plans[index] = plan;
      return plan;
    });
  }

  async delete(id) {
    return this.mutateData((data) => {
      const index = data.plans.findIndex((item) => item.id === id);
      if (index === -1) throw new Error('plan not found');
      data.plans.splice(index, 1);
    });
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
