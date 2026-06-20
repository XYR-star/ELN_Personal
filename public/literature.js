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
  const configButton = root.querySelector('[data-literature-config]');
  const configDialog = root.querySelector('[data-literature-config-dialog]');
  const configForm = root.querySelector('[data-literature-config-form]');
  const configStatus = root.querySelector('[data-literature-config-status]');
  const configError = root.querySelector('[data-literature-config-error]');
  const newPaperButton = root.querySelector('[data-literature-new-paper]');
  const paperDialog = root.querySelector('[data-literature-paper-dialog]');
  const paperForm = root.querySelector('[data-literature-paper-form]');
  const paperError = root.querySelector('[data-literature-paper-error]');

  let state = {
    configured: false,
    config: {
      configured: false,
      library_id: '',
      library_type: 'user',
      has_api_key: false,
      config_path: '',
    },
    items: [],
    collections: [],
    tags: [],
    cards: {},
    evidence: {},
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

  function setConfigError(message = '') {
    if (!configError) return;
    configError.textContent = message;
    configError.hidden = !message;
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

  function parseTags(value) {
    return String(value || '').split(/[\s,，#]+/).map((part) => part.trim().replace(/[^A-Za-z0-9_-]/g, '').toLowerCase()).filter((tag, index, arr) => tag && arr.indexOf(tag) === index);
  }

  function paperKeyFromTitle(title, fallback = 'Paper') {
    const cleaned = String(title || fallback).replace(/[^A-Za-z0-9_-]/g, '');
    return (cleaned || fallback).slice(0, 48);
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

  function evidenceFor(key) {
    return state.evidence[key] || [];
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
      item.local ? (isZh ? '本地' : 'Local') : '',
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
      if (evidenceFor(item.key).length) chips.append(text('span', 'literature-chip', `${evidenceFor(item.key).length} ${isZh ? '证据' : 'evidence'}`));
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

    const evidenceSection = document.createElement('section');
    evidenceSection.className = 'literature-evidence mt-4';
    const evidenceCards = evidenceFor(item.key);
    evidenceSection.append(text('h3', 'h5 mb-2', isZh ? '证据卡片' : 'Evidence cards'));
    const intro = text('p', 'text-muted small', isZh
      ? '保存文献中的某段话、某张图或关键发现，然后把引用插入实验/资源 Markdown。'
      : 'Save a quoted paragraph, figure, or finding, then insert the reference into experiment/resource Markdown.');
    evidenceSection.append(intro);

    const evidenceList = document.createElement('div');
    evidenceList.className = 'literature-evidence-list';
    if (!evidenceCards.length) {
      evidenceList.append(text('div', 'text-muted small mb-2', isZh ? '还没有证据卡片。' : 'No evidence cards yet.'));
    }
    for (const evidence of evidenceCards) {
      const cardNode = document.createElement('article');
      cardNode.className = 'literature-evidence-card';
      const head = document.createElement('div');
      head.className = 'd-flex justify-content-between align-items-start';
      head.append(text('strong', '', `${evidence.type}${evidence.page ? ` · p.${evidence.page}` : ''}${evidence.section ? ` · ${evidence.section}` : ''}`));
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'btn btn-sm btn-secondary';
      copy.dataset.literatureCopyEvidence = evidence.reference;
      copy.innerHTML = `<i class="fas fa-copy fa-fw mr-1"></i>${isZh ? '复制引用' : 'Copy ref'}`;
      head.append(copy);
      cardNode.append(head);
      if (evidence.image_url) {
        const imageLink = document.createElement('a');
        imageLink.href = evidence.image_url;
        imageLink.target = '_blank';
        imageLink.rel = 'noopener';
        imageLink.className = 'small d-inline-block mt-2';
        imageLink.textContent = isZh ? '打开图片/图源' : 'Open figure/source';
        cardNode.append(imageLink);
      }
      if (evidence.original_text) cardNode.append(text('blockquote', 'literature-evidence-quote mt-2 mb-2', evidence.original_text));
      if (evidence.my_note) cardNode.append(text('p', 'mb-1', evidence.my_note));
      cardNode.append(text('code', 'small', evidence.reference));
      evidenceList.append(cardNode);
    }
    evidenceSection.append(evidenceList);

    const evidenceForm = document.createElement('form');
    evidenceForm.className = 'literature-evidence-form mt-3';
    evidenceForm.dataset.literatureEvidenceForm = item.key;
    evidenceForm.innerHTML = `
      <div class="row">
        <div class="col-md-4">
          <label>${isZh ? '类型' : 'Type'}
            <select class="form-control" name="type">
              <option value="quote">${isZh ? '段落引用' : 'Quote'}</option>
              <option value="figure">${isZh ? '图片/图' : 'Figure'}</option>
              <option value="finding">${isZh ? '关键发现' : 'Finding'}</option>
              <option value="protocol">${isZh ? '方法提示' : 'Protocol hint'}</option>
            </select>
          </label>
        </div>
        <div class="col-md-3 mt-2 mt-md-0">
          <label>${isZh ? '页码' : 'Page'}
            <input class="form-control" name="page" placeholder="3">
          </label>
        </div>
        <div class="col-md-5 mt-2 mt-md-0">
          <label>${isZh ? '章节/图号' : 'Section / figure'}
            <input class="form-control" name="section" placeholder="Fig. 2B">
          </label>
        </div>
      </div>
      <label>${isZh ? '原文段落 / 图注' : 'Original text / caption'}
        <textarea class="form-control" name="original_text" rows="4"></textarea>
      </label>
      <label>${isZh ? '图片或来源 URL（可选）' : 'Figure/source URL (optional)'}
        <input class="form-control" name="image_url" type="url" placeholder="https://...">
      </label>
      <label>${isZh ? '我的备注 / 为什么重要' : 'My note / why it matters'}
        <textarea class="form-control" name="my_note" rows="3"></textarea>
      </label>
      <button type="submit" class="btn btn-primary"><i class="fas fa-plus fa-fw mr-1"></i>${isZh ? '保存证据' : 'Save evidence'}</button>
    `;
    evidenceSection.append(evidenceForm);
    detail.append(evidenceSection);
  }

  function render() {
    renderCollections();
    renderTags();
    renderItems();
    renderDetail();
  }

  function renderConfigStatus() {
    if (!configStatus) return;
    const config = state.config || {};
    const parts = [];
    parts.push(config.config_path || '');
    if (config.configured) {
      parts.push(`${config.library_type || 'user'}:${config.library_id || ''}`);
      if (config.has_api_key) parts.push(isZh ? 'API key 已保存' : 'API key saved');
    } else {
      parts.push(isZh ? '尚未配置' : 'Not configured');
    }
    configStatus.textContent = parts.filter(Boolean).join(' · ');
  }

  function closeConfigDialog() {
    if (!configDialog) return;
    if (typeof configDialog.close === 'function') {
      configDialog.close();
    } else {
      configDialog.removeAttribute('open');
    }
  }

  function openConfigDialog() {
    if (!configDialog || !configForm) return;
    const config = state.config || {};
    setConfigError('');
    configForm.elements.api_key.value = '';
    configForm.elements.api_key.placeholder = config.has_api_key
      ? (isZh ? '已保存；如需更换请重新粘贴' : 'Saved; paste again to replace')
      : (isZh ? '从 Zotero 生成的 private key' : 'Private key generated by Zotero');
    configForm.elements.library_type.value = config.library_type || 'user';
    configForm.elements.library_id.value = config.library_id || '';
    renderConfigStatus();
    if (typeof configDialog.showModal === 'function') {
      configDialog.showModal();
    } else {
      configDialog.setAttribute('open', '');
    }
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
      state.config = data.config || state.config;
      state.items = data.items || [];
      state.collections = data.collections || [];
      state.tags = data.tags || [];
      state.cards = data.cards || {};
      state.evidence = data.evidence || {};
      if (setupBox) setupBox.hidden = state.configured;
      if (configPath && data.setup?.config_path) configPath.textContent = data.setup.config_path;
      renderConfigStatus();
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

  detail.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-literature-evidence-form]');
    if (!form) return;
    event.preventDefault();
    const item = state.items.find((candidate) => candidate.key === form.dataset.literatureEvidenceForm);
    const payload = {
      action: 'evidence',
      paperKey: form.dataset.literatureEvidenceForm,
      paper: item ? {
        key: item.key,
        title: item.title,
        creators: item.creators || [],
        year: item.year || '',
        publicationTitle: item.publicationTitle || '',
        doi: item.doi || '',
        url: item.url || '',
        tags: item.tags || [],
      } : null,
      type: form.elements.type.value,
      page: form.elements.page.value,
      section: form.elements.section.value,
      original_text: form.elements.original_text.value,
      image_url: form.elements.image_url.value,
      my_note: form.elements.my_note.value,
    };
    try {
      const data = await request({ method: 'POST', body: JSON.stringify(payload) });
      const evidence = data.evidence;
      state.evidence[evidence.paperKey] = [evidence, ...evidenceFor(evidence.paperKey).filter((item) => item.id !== evidence.id)];
      render();
    } catch (error) {
      setError(error.message || 'Could not save evidence.');
    }
  });

  detail.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-literature-copy-evidence]');
    if (!button) return;
    const value = button.dataset.literatureCopyEvidence || '';
    try {
      await navigator.clipboard?.writeText(value);
      button.textContent = isZh ? '已复制' : 'Copied';
      setTimeout(render, 900);
    } catch {
      window.prompt(isZh ? '复制这段引用' : 'Copy this reference', value);
    }
  });

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    state.q = searchInput.value.trim();
    load();
  });

  refreshButton.addEventListener('click', load);
  configButton?.addEventListener('click', openConfigDialog);
  root.querySelectorAll('[data-literature-config-close]').forEach((button) => {
    button.addEventListener('click', closeConfigDialog);
  });
  configForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    setConfigError('');
    const formData = new FormData(configForm);
    const payload = {
      action: 'config',
      api_key: String(formData.get('api_key') || '').trim(),
      library_type: String(formData.get('library_type') || 'user'),
      library_id: String(formData.get('library_id') || '').trim(),
    };
    try {
      const data = await request({ method: 'POST', body: JSON.stringify(payload) });
      state.config = data.config || state.config;
      closeConfigDialog();
      await load();
    } catch (error) {
      setConfigError(error.message || 'Could not save Zotero config.');
    }
  });
  newPaperButton?.addEventListener('click', () => {
    if (!paperDialog || !paperForm) return;
    paperForm.reset();
    if (paperError) paperError.hidden = true;
    if (typeof paperDialog.showModal === 'function') {
      paperDialog.showModal();
    } else {
      paperDialog.setAttribute('open', '');
    }
  });
  root.querySelectorAll('[data-literature-paper-close]').forEach((button) => {
    button.addEventListener('click', () => {
      if (typeof paperDialog?.close === 'function') paperDialog.close();
      else paperDialog?.removeAttribute('open');
    });
  });
  paperForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (paperError) paperError.hidden = true;
    const formData = new FormData(paperForm);
    const title = String(formData.get('title') || '').trim();
    const payload = {
      action: 'paper',
      key: paperKeyFromTitle(formData.get('key') || title),
      title,
      doi: String(formData.get('doi') || '').trim(),
      year: String(formData.get('year') || '').trim(),
      url: String(formData.get('url') || '').trim(),
      tags: parseTags(formData.get('tags')),
    };
    try {
      const data = await request({ method: 'POST', body: JSON.stringify(payload) });
      const paper = data.paper;
      state.items = [paper, ...state.items.filter((item) => item.key !== paper.key)];
      state.evidence[paper.key] = state.evidence[paper.key] || [];
      state.selectedKey = paper.key;
      if (typeof paperDialog?.close === 'function') paperDialog.close();
      else paperDialog?.removeAttribute('open');
      render();
    } catch (error) {
      if (paperError) {
        paperError.textContent = error.message || 'Could not save local paper.';
        paperError.hidden = false;
      }
    }
  });
  load();
})();
