(() => {
  const roots = [...document.querySelectorAll('[data-todos-root]')];
  if (!roots.length) return;

  const timeZone = 'Asia/Shanghai';

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function todayKey() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function apiUrl(root, path) {
    const apiBase = root.dataset.apiBase || '/planner-api.php';
    return `${apiBase}?path=${encodeURIComponent(path)}`;
  }

  async function api(root, path, options = {}) {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
    const response = await fetch(apiUrl(root, path), {
      credentials: 'same-origin',
      ...options,
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `Todo request failed: ${response.status}`);
    return data;
  }

  function dueLabel(todo) {
    if (!todo.dueDate) return 'No date';
    const today = todayKey();
    if (todo.dueDate < today) return `Overdue ${todo.dueDate}`;
    if (todo.dueDate === today) return `Today ${todo.dueDate}`;
    return todo.dueDate;
  }

  function renderDashboard(root, todos) {
    if (!todos.length) {
      root.innerHTML = `
        <div class="dashboard-todos-head">
          <h4 class="mb-0"><i class="fas fa-list-check mr-1"></i>Todo</h4>
          <a class="btn btn-secondary btn-sm" href="planner.php">Edit in Planner</a>
        </div>
        <div class="list-group mt-2">
          <a href="planner.php" class="list-group-item hl-hover-gray text-muted">No open todos. Add one in Planner.</a>
        </div>
      `;
      return;
    }
    root.innerHTML = `
      <div class="dashboard-todos-head">
        <h4 class="mb-0"><i class="fas fa-list-check mr-1"></i>Todo</h4>
        <a class="btn btn-secondary btn-sm" href="planner.php">Edit in Planner</a>
      </div>
      <div class="list-group mt-2">
        ${todos.map((todo) => `
          <a href="planner.php" class="list-group-item hl-hover-gray dashboard-todo-item" data-dashboard-todo-item>
            <span class="font-weight-bold">${todo.pinned ? '<i class="fas fa-thumbtack fa-fw mr-1"></i>' : ''}${escapeHtml(todo.title)}</span>
            <span class="text-nowrap smallgray ml-1">${escapeHtml(dueLabel(todo))}</span>
            ${todo.note ? `<div class="small text-muted mt-1">${escapeHtml(todo.note)}</div>` : ''}
          </a>
        `).join('')}
      </div>
    `;
  }

  async function initDashboard(root) {
    try {
      const todos = await api(root, `/api/todos?scope=dashboard&limit=5&today=${encodeURIComponent(todayKey())}`);
      renderDashboard(root, todos);
    } catch (error) {
      root.innerHTML = `<div class="alert alert-danger py-2">${escapeHtml(error.message)}</div>`;
    }
  }

  function renderEditor(root, todos) {
    const list = root.querySelector('[data-todo-list]');
    const empty = root.querySelector('[data-todo-empty]');
    empty.hidden = todos.length > 0;
    list.innerHTML = todos.map((todo) => `
      <article class="todo-item${todo.done ? ' is-done' : ''}" data-todo-item data-id="${escapeHtml(todo.id)}">
        <button type="button" class="todo-check" data-todo-toggle aria-label="${todo.done ? 'Reopen todo' : 'Complete todo'}">
          <i class="fas ${todo.done ? 'fa-check-circle' : 'fa-circle'} fa-fw"></i>
        </button>
        <div class="todo-item-main">
          <div class="todo-title">${todo.pinned ? '<i class="fas fa-thumbtack fa-fw mr-1"></i>' : ''}${escapeHtml(todo.title)}</div>
          <div class="todo-meta">${escapeHtml(dueLabel(todo))}</div>
          ${todo.note ? `<div class="todo-note">${escapeHtml(todo.note)}</div>` : ''}
        </div>
        <div class="todo-actions">
          <button type="button" class="btn btn-secondary btn-sm" data-todo-edit>Edit</button>
          <button type="button" class="btn btn-danger btn-sm" data-todo-delete>Delete</button>
        </div>
      </article>
    `).join('');
  }

  function formPayload(root) {
    return {
      title: root.querySelector('[data-todo-title]').value,
      dueDate: root.querySelector('[data-todo-due-date]').value,
      note: root.querySelector('[data-todo-note]').value,
      pinned: root.querySelector('[data-todo-pinned]').checked
    };
  }

  function resetForm(root) {
    root.querySelector('[data-todo-id]').value = '';
    root.querySelector('[data-todo-title]').value = '';
    root.querySelector('[data-todo-due-date]').value = '';
    root.querySelector('[data-todo-note]').value = '';
    root.querySelector('[data-todo-pinned]').checked = false;
    root.querySelector('[data-todo-save]').textContent = 'Add todo';
    root.querySelector('[data-todo-cancel]').hidden = true;
  }

  function setError(root, message = '') {
    const error = root.querySelector('[data-todo-error]');
    error.textContent = message;
    error.hidden = !message;
  }

  async function loadEditor(root) {
    const todos = await api(root, `/api/todos?today=${encodeURIComponent(todayKey())}`);
    root.todoState = todos;
    renderEditor(root, todos);
  }

  async function initEditor(root) {
    const form = root.querySelector('[data-todo-form]');
    const cancel = root.querySelector('[data-todo-cancel]');
    const composer = root.querySelector('[data-todo-composer]');

    if (composer && window.matchMedia('(max-width: 575.98px)').matches) {
      composer.open = false;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const id = root.querySelector('[data-todo-id]').value;
      const button = root.querySelector('[data-todo-save]');
      button.disabled = true;
      setError(root);
      try {
        if (id) {
          await api(root, `/api/todos/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(formPayload(root)) });
        } else {
          await api(root, '/api/todos', { method: 'POST', body: JSON.stringify(formPayload(root)) });
        }
        resetForm(root);
        await loadEditor(root);
      } catch (error) {
        setError(root, error.message);
      } finally {
        button.disabled = false;
      }
    });

    cancel.addEventListener('click', () => resetForm(root));

    root.addEventListener('click', async (event) => {
      const item = event.target.closest('[data-todo-item]');
      if (!item) return;
      const todo = (root.todoState || []).find((entry) => entry.id === item.dataset.id);
      if (!todo) return;
      setError(root);
      try {
        if (event.target.closest('[data-todo-toggle]')) {
          await api(root, `/api/todos/${encodeURIComponent(todo.id)}`, { method: 'PATCH', body: JSON.stringify({ done: !todo.done }) });
          await loadEditor(root);
        } else if (event.target.closest('[data-todo-delete]')) {
          await api(root, `/api/todos/${encodeURIComponent(todo.id)}`, { method: 'DELETE' });
          await loadEditor(root);
        } else if (event.target.closest('[data-todo-edit]')) {
          if (composer) composer.open = true;
          root.querySelector('[data-todo-id]').value = todo.id;
          root.querySelector('[data-todo-title]').value = todo.title;
          root.querySelector('[data-todo-due-date]').value = todo.dueDate || '';
          root.querySelector('[data-todo-note]').value = todo.note || '';
          root.querySelector('[data-todo-pinned]').checked = Boolean(todo.pinned);
          root.querySelector('[data-todo-save]').textContent = 'Save todo';
          root.querySelector('[data-todo-cancel]').hidden = false;
          root.querySelector('[data-todo-title]').focus();
        }
      } catch (error) {
        setError(root, error.message);
      }
    });

    try {
      await loadEditor(root);
    } catch (error) {
      setError(root, error.message);
    }
  }

  for (const root of roots) {
    if (root.dataset.todoMode === 'dashboard') {
      initDashboard(root);
    } else {
      initEditor(root);
    }
  }
})();
