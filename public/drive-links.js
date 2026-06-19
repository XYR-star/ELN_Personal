(function () {
  const root = document.querySelector('[data-drive-links-root]');
  if (!root) return;

  const apiBase = root.dataset.apiBase || '/drive-links-api.php';
  const entityType = root.dataset.entityType || 'experiments';
  const entityId = root.dataset.entityId || '';
  const list = root.querySelector('[data-drive-links-list]');
  const empty = root.querySelector('[data-drive-links-empty]');
  const errorBox = root.querySelector('[data-drive-links-error]');
  const dialog = document.querySelector('[data-drive-links-dialog]');
  const form = document.querySelector('[data-drive-links-form]');
  const titleInput = document.querySelector('[data-drive-link-title]');
  const urlInput = document.querySelector('[data-drive-link-url]');
  const noteInput = document.querySelector('[data-drive-link-note]');
  const addButton = root.querySelector('[data-drive-link-add]');
  const saveButton = document.querySelector('[data-drive-link-save]');
  const closeButton = document.querySelector('[data-drive-link-close]');

  const endpoint = (extra = '') => `${apiBase}?entity=${encodeURIComponent(entityType)}&id=${encodeURIComponent(entityId)}${extra}`;

  function csrfHeaders(hasBody = false) {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
    return {
      'X-Requested-With': 'XMLHttpRequest',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...(hasBody ? { 'Content-Type': 'application/json' } : {})
    };
  }

  async function request(options = {}, extra = '') {
    const response = await fetch(endpoint(extra), {
      credentials: 'same-origin',
      headers: csrfHeaders(Boolean(options.body)),
      ...options
    });
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `Request failed: ${response.status}`);
    return data;
  }

  function setError(message = '') {
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.hidden = !message;
  }

  function hostLabel(url) {
    try {
      return new URL(url).host;
    } catch {
      return 'Drive file';
    }
  }

  function createText(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text || '';
    return element;
  }

  function renderLinks(links = []) {
    if (!list) return;
    list.querySelectorAll('[data-drive-link-card]').forEach((card) => card.remove());
    if (empty) empty.hidden = links.length > 0;

    for (const link of links) {
      const card = document.createElement('article');
      card.className = 'drive-link-card';
      card.dataset.driveLinkCard = String(link.id);

      const top = document.createElement('div');
      top.className = 'd-flex justify-content-between align-items-start';

      const content = document.createElement('div');
      content.append(createText('div', 'drive-link-title', link.title || 'Cloud drive file'));
      content.append(createText('div', 'drive-link-url text-muted small mt-1', hostLabel(link.url)));
      if (link.note) content.append(createText('div', 'mt-2', link.note));

      const actions = document.createElement('div');
      actions.className = 'drive-link-actions btn-group';

      const open = document.createElement('a');
      open.className = 'btn btn-primary';
      open.href = link.url;
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      open.innerHTML = '<i class="fas fa-external-link-alt fa-fw mr-1"></i>Open';

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-danger';
      remove.dataset.driveLinkDelete = String(link.id);
      remove.innerHTML = '<i class="fas fa-trash fa-fw mr-1"></i>Delete';

      actions.append(open, remove);
      top.append(content, actions);
      card.append(top);
      list.append(card);
    }
  }

  async function loadLinks() {
    setError('');
    try {
      const data = await request();
      renderLinks(data.links || []);
    } catch (error) {
      setError(error.message || 'Could not load Drive links.');
    }
  }

  function openDialog() {
    form?.reset();
    setError('');
    dialog?.showModal();
    setTimeout(() => titleInput?.focus(), 0);
  }

  async function saveLink() {
    setError('');
    if (!urlInput?.value.trim()) {
      setError('Drive URL is required.');
      urlInput?.focus();
      return;
    }
    saveButton.disabled = true;
    try {
      await request({
        method: 'POST',
        body: JSON.stringify({
          title: titleInput?.value || '',
          url: urlInput.value,
          note: noteInput?.value || ''
        })
      });
      dialog?.close();
      await loadLinks();
    } catch (error) {
      setError(error.message || 'Could not save Drive link.');
    } finally {
      saveButton.disabled = false;
    }
  }

  async function deleteLink(id) {
    setError('');
    try {
      await request({ method: 'DELETE' }, `&link=${encodeURIComponent(id)}`);
      await loadLinks();
    } catch (error) {
      setError(error.message || 'Could not delete Drive link.');
    }
  }

  addButton?.addEventListener('click', openDialog);
  closeButton?.addEventListener('click', () => dialog?.close());
  saveButton?.addEventListener('click', saveLink);
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    saveLink();
  });
  root.addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-drive-link-delete]');
    if (!removeButton) return;
    deleteLink(removeButton.dataset.driveLinkDelete);
  });

  loadLinks();
})();
