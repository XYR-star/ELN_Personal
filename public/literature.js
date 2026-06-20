(function () {
  const root = document.querySelector('[data-literature-root]');
  if (!root) return;

  const apiBase = root.dataset.apiBase || '/literature-api.php';
  const isZh = String(root.dataset.lang || '').startsWith('zh');
  const list = root.querySelector('[data-literature-list]');
  const empty = root.querySelector('[data-literature-empty]');
  const detail = root.querySelector('[data-literature-detail]');
  const count = root.querySelector('[data-literature-count]');
  const collectionsBox = root.querySelector('[data-literature-collections]');
  const tagsBox = root.querySelector('[data-literature-tags]');
  const searchForm = root.querySelector('[data-literature-search-form]');
  const searchInput = root.querySelector('[data-literature-search]');
  const setupBox = root.querySelector('[data-literature-setup]');
  const configPath = root.querySelector('[data-literature-config-path]');
  const errorBox = root.querySelector('[data-literature-error]');
  const refreshButton = root.querySelector('[data-literature-refresh]');

  let state = {
    configured: false,
    items: [],
    collections: [],
    tags: [],
    cards: {},
    selectedKey: '',
    collection: '',
    tag: '',
    q: '',
  };

  function csrfHeaders(hasBody = false) {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
    return {
      'X-Requested-With': 'XMLHttpRequest',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...(hasBody ? { 'Content-Type': 'application/json' } : {})
    };
  }

  async function request(options = {}, query = '') {
    const response = await fetch(`${apiBase}${query}`, {
      credentials: 'same-origin',
      headers: csrfHeaders(Boolean(options.body)),
      ...options
    });
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `Request failed: ${response.status}`);
    return data;
  }

  function setError(message = '') {
    errorBox.textContent = message;
    errorBox.hidden = !message;
  }

  function text(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value || '';
    return element;
  }

  function parseIds(value) {
    return String(value || '').split(/[\s,，]+/).map((part) => Number(part.trim())).filter((id, index, arr) => Number.isInteger(id) && id > 0 && arr.indexOf(id) === index);
  }

  function cardFor(key) {
    return state.cards[key] || {
      itemKey: key,
      status: 'unread',
      summary: '',
      note: '',
      linked_experiments: [],
      linked_resources: [],
    };
  }

  function statusLabel(status) {
    return ({
      unread: isZh ? '未读' : 'Unread',
      reading: isZh ? '阅读中' : 'Reading',
      read: isZh ? '已读' : 'Read',
      important: isZh ? '重要' : 'Important',
    })[status] || status;
  }

  function itemSubtitle(item) {
    return [
      item.creators?.slice(0, 3).join(', '),
      item.year,
      item.publicationTitle,
    ].filter(Boolean).join(' · ');
  }

  function renderCollections() {
    collectionsBox.querySelectorAll('[data-literature-collection]').forEach((node) => node.remove());
    const all = document.createElement('button');
    all.type = 'button';
    all.className = `list-group-item list-group-item-action${state.collection === '' ? ' active' : ''}`;
    all.dataset.literatureCollection = '';
    all.textContent = isZh ? '全部文献' : 'All papers';
    collectionsBox.append(all);

    for (const collection of state.collections) {
      const data = collection.data || collection;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `list-group-item list-group-item-action${state.collection === data.key ? ' active' : ''}`;
      button.dataset.literatureCollection = data.key || '';
      button.textContent = data.name || 'Collection';
      collectionsBox.append(button);
    }
  }

  function renderTags() {
    tagsBox.replaceChildren();
    if (!state.tags.length) {
      tagsBox.append(text('span', 'text-muted small', isZh ? '暂无标签' : 'No tags yet'));
      return;
    }
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = `btn btn-sm literature-tag${state.tag === '' ? ' is-active' : ''}`;
    clear.dataset.literatureTag = '';
    clear.textContent = isZh ? '全部' : 'All';
    tagsBox.append(clear);
    for (const tag of state.tags.slice(0, 40)) {
      const value = tag.tag || tag;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `btn btn-sm literature-tag${state.tag === value ? ' is-active' : ''}`;
      button.dataset.literatureTag = value;
      button.textContent = `#${value}`;
      tagsBox.append(button);
    }
  }

  function renderItems() {
    list.querySelectorAll('[data-literature-item]').forEach((node) => node.remove());
    empty.hidden = state.items.length > 0;
    count.textContent = `${state.items.length}`;
    for (const item of state.items) {
      const card = cardFor(item.key);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `literature-item${state.selectedKey === item.key ? ' is-selected' : ''}`;
      button.dataset.literatureItem = item.key;
      button.append(text('div', 'literature-item-title', item.title));
      const meta = text('div', 'literature-meta mt-1', itemSubtitle(item));
      button.append(meta);
      const chips = document.createElement('div');
      chips.className = 'literature-chips mt-2';
      chips.append(text('span', `literature-chip status-${card.status}`, statusLabel(card.status)));
      for (const tag of item.tags.slice(0, 4)) chips.append(text('span', 'literature-chip', `#${tag}`));
      if (card.linked_experiments.length) chips.append(text('span', 'literature-chip', `Exp ${card.linked_experiments.join(', ')}`));
      if (card.linked_resources.length) chips.append(text('span', 'literature-chip', `Res ${card.linked_resources.join(', ')}`));
      button.append(chips);
      list.append(button);
    }
  }

  function linkButton(label, href, icon) {
    if (!href) return null;
    const link = document.createElement('a');
    link.className = 'btn btn-secondary btn-sm';
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener';
    link.innerHTML = `<i class="${icon} fa-fw mr-1"></i>${label}`;
    return link;
  }

  function renderDetail() {
    const item = state.items.find((candidate) => candidate.key === state.selectedKey);
    detail.replaceChildren();
    if (!item) {
      detail.append(text('p', 'text-muted mb-0', isZh ? '选择一篇文献查看详情，并填写本地阅读卡片。' : 'Select a paper to inspect metadata and fill the local reading card.'));
      return;
    }
    const card = cardFor(item.key);
    detail.append(text('div', 'literature-detail-title', item.title));
    detail.append(text('div', 'literature-meta mt-1', itemSubtitle(item)));
    const actions = document.createElement('div');
    actions.className = 'btn-group flex-wrap mt-3';
    [linkButton('Zotero', item.zoteroUrl, 'fas fa-arrow-up-right-from-square'), linkButton('DOI', item.doi ? `https://doi.org/${item.doi}` : '', 'fas fa-fingerprint'), linkButton(isZh ? '原文链接' : 'URL', item.url, 'fas fa-link')].filter(Boolean).forEach((node) => actions.append(node));
    if (actions.childElementCount) detail.append(actions);
    if (item.abstractNote) {
      detail.append(text('h3', 'h5 mt-4', 'Abstract'));
      detail.append(text('p', 'small', item.abstractNote));
    }

    const form = document.createElement('form');
    form.className = 'literature-card-form mt-4';
    form.dataset.literatureCardForm = item.key;
    form.innerHTML = `
      <label>${isZh ? '阅读状态' : 'Reading status'}
        <select class="form-control" name="status">
          <option value="unread">${statusLabel('unread')}</option>
          <option value="reading">${statusLabel('reading')}</option>
          <option value="read">${statusLabel('read')}</option>
          <option value="important">${statusLabel('important')}</option>
        </select>
      </label>
      <label>${isZh ? '一句话总结' : 'One-line summary'}
        <input class="form-control" name="summary">
      </label>
      <label>${isZh ? '阅读笔记 / 实验启发' : 'Reading note / experiment context'}
        <textarea class="form-control" name="note" rows="5"></textarea>
      </label>
      <label>${isZh ? '关联 Experiments' : 'Linked experiments'}
        <input class="form-control" name="linked_experiments" placeholder="12, 18">
      </label>
      <label>${isZh ? '关联 Resources' : 'Linked resources'}
        <input class="form-control" name="linked_resources" placeholder="11, 24">
      </label>
      <button type="submit" class="btn btn-primary justify-self-start"><i class="fas fa-save fa-fw mr-1"></i>${isZh ? '保存阅读卡片' : 'Save reading card'}</button>
    `;
    form.elements.status.value = card.status;
    form.elements.summary.value = card.summary || '';
    form.elements.note.value = card.note || '';
    form.elements.linked_experiments.value = card.linked_experiments.join(', ');
    form.elements.linked_resources.value = card.linked_resources.join(', ');
    detail.append(form);
  }

  function render() {
    renderCollections();
    renderTags();
    renderItems();
    renderDetail();
  }

  async function load() {
    setError('');
    const params = new URLSearchParams();
    if (state.collection) params.set('collection', state.collection);
    if (state.tag) params.set('tag', state.tag);
    if (state.q) params.set('q', state.q);
    try {
      const data = await request({}, params.toString() ? `?${params}` : '');
      state.configured = Boolean(data.configured);
      state.items = data.items || [];
      state.collections = data.collections || [];
      state.tags = data.tags || [];
      state.cards = data.cards || {};
      if (setupBox) setupBox.hidden = state.configured;
      if (configPath && data.setup?.config_path) configPath.textContent = data.setup.config_path;
      if (state.selectedKey && !state.items.some((item) => item.key === state.selectedKey)) state.selectedKey = '';
      if (!state.selectedKey && state.items[0]) state.selectedKey = state.items[0].key;
      render();
    } catch (error) {
      setError(error.message || 'Could not load Zotero library.');
    }
  }

  collectionsBox.addEventListener('click', (event) => {
    const button = event.target.closest('[data-literature-collection]');
    if (!button) return;
    state.collection = button.dataset.literatureCollection || '';
    load();
  });

  tagsBox.addEventListener('click', (event) => {
    const button = event.target.closest('[data-literature-tag]');
    if (!button) return;
    state.tag = button.dataset.literatureTag || '';
    load();
  });

  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-literature-item]');
    if (!button) return;
    state.selectedKey = button.dataset.literatureItem;
    render();
  });

  detail.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-literature-card-form]');
    if (!form) return;
    event.preventDefault();
    const payload = {
      itemKey: form.dataset.literatureCardForm,
      status: form.elements.status.value,
      summary: form.elements.summary.value,
      note: form.elements.note.value,
      linked_experiments: parseIds(form.elements.linked_experiments.value),
      linked_resources: parseIds(form.elements.linked_resources.value),
    };
    try {
      const card = await request({ method: 'POST', body: JSON.stringify(payload) });
      state.cards[card.itemKey] = card;
      render();
    } catch (error) {
      setError(error.message || 'Could not save reading card.');
    }
  });

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    state.q = searchInput.value.trim();
    load();
  });

  refreshButton.addEventListener('click', load);
  load();
})();
