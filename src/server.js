import { createReadStream } from 'node:fs';
import { access, mkdir } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PlannerStore, TodoStore } from './store.js';
import { PLAN_STATUSES, PLAN_TYPES } from './planner.js';
import { dashboardTodos } from './todos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '..', 'public');
const dataDir = process.env.PLANNER_DATA_DIR || '/www/elabftw-data/planner';
const port = Number(process.env.PORT || 4044);
const host = process.env.HOST || '127.0.0.1';
const store = new PlannerStore(path.join(dataDir, 'plans.json'));
const todoStore = new TodoStore(path.join(dataDir, 'todos.json'));

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon'
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendStatic(req, res) {
  const url = new URL(req.url, 'http://planner.local');
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.resolve(publicDir, `.${pathname}`);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  const ext = path.extname(filePath);
  access(filePath).then(() => {
    res.writeHead(200, {
      'Content-Type': contentTypes[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    createReadStream(filePath)
      .on('error', () => {
        res.writeHead(404);
        res.end('Not found');
      })
      .pipe(res);
  }).catch(() => {
    res.writeHead(404);
    res.end('Not found');
  });
}

async function handleApi(req, res) {
  const url = new URL(req.url, 'http://planner.local');
  try {
    if (url.pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, app: 'elabftw-planner', data_dir: dataDir });
    }
    if (url.pathname === '/api/meta') {
      return sendJson(res, 200, { types: PLAN_TYPES, statuses: PLAN_STATUSES });
    }
    if (url.pathname === '/api/todos' && req.method === 'GET') {
      const today = url.searchParams.get('today') || undefined;
      const todos = await todoStore.list({ today });
      if (url.searchParams.get('scope') === 'dashboard') {
        const limit = Number(url.searchParams.get('limit') || 5);
        return sendJson(res, 200, dashboardTodos(todos, today, Number.isFinite(limit) ? limit : 5));
      }
      return sendJson(res, 200, todos);
    }
    if (url.pathname === '/api/todos' && req.method === 'POST') {
      const todo = await todoStore.create(await readBody(req));
      return sendJson(res, 201, todo);
    }
    if (url.pathname === '/api/plans' && req.method === 'GET') {
      const plans = await store.list({
        start: url.searchParams.get('start'),
        end: url.searchParams.get('end')
      });
      return sendJson(res, 200, plans);
    }
    if (url.pathname === '/api/plans' && req.method === 'POST') {
      const plan = await store.create(await readBody(req));
      return sendJson(res, 201, plan);
    }
    const match = url.pathname.match(/^\/api\/plans\/([0-9a-f-]+)$/);
    if (match && req.method === 'GET') {
      return sendJson(res, 200, await store.get(match[1]));
    }
    if (match && req.method === 'PATCH') {
      return sendJson(res, 200, await store.update(match[1], await readBody(req)));
    }
    if (match && req.method === 'DELETE') {
      await store.delete(match[1]);
      res.writeHead(204);
      res.end();
      return;
    }
    const todoMatch = url.pathname.match(/^\/api\/todos\/([0-9a-f-]+)$/);
    if (todoMatch && req.method === 'GET') {
      return sendJson(res, 200, await todoStore.get(todoMatch[1]));
    }
    if (todoMatch && req.method === 'PATCH') {
      return sendJson(res, 200, await todoStore.update(todoMatch[1], await readBody(req)));
    }
    if (todoMatch && req.method === 'DELETE') {
      await todoStore.delete(todoMatch[1]);
      res.writeHead(204);
      res.end();
      return;
    }
    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    sendJson(res, error.message.includes('not found') ? 404 : 400, { error: error.message });
  }
}

await mkdir(dataDir, { recursive: true });

http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    handleApi(req, res);
    return;
  }
  sendStatic(req, res);
}).listen(port, host, () => {
  console.log(`elabftw-planner listening on ${host}:${port}`);
});
