(function () {
  const root = document.querySelector('[data-experiment-records-root]');
  if (!root) return;

  const apiBase = root.dataset.apiBase || '/experiment-records-api.php';
  const experimentId = root.dataset.experimentId || '';
  const list = root.querySelector('[data-record-list]');
  const empty = root.querySelector('[data-record-empty]');
  const errorBox = root.querySelector('[data-record-error]');
  const newButton = root.querySelector('[data-record-new]');
  const modal = root.querySelector('[data-record-modal]');
  const modalTitle = root.querySelector('[data-record-modal-title]');
  const idInput = root.querySelector('[data-record-id]');
  const titleInput = root.querySelector('[data-record-title]');
  const dateInput = root.querySelector('[data-record-date]');
  const typeInput = root.querySelector('[data-record-type]');
  const markdownInput = root.querySelector('[data-record-markdown]');
  const previewBox = root.querySelector('[data-record-preview]');
  const editorGrid = root.querySelector('.experiment-records-editor-grid');
  const statusBox = root.querySelector('[data-record-status]');
  const saveButton = root.querySelector('[data-record-save]');
  const deleteButton = root.querySelector('[data-record-delete]');
  const sourceButton = root.querySelector('[data-record-toggle-source]');
  const uploadButton = root.querySelector('[data-record-upload-trigger]');
  const uploadInput = root.querySelector('[data-record-upload]');

  let records = [];
  let activeRecord = null;

  function csrfHeaders(hasBody = false) {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
    return {
      'X-Requested-With': 'XMLHttpRequest',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...(hasBody ? { 'Content-Type': 'application/json' } : {})
    };
  }

  function endpoint(extra = '') {
    const separator = extra ? '&' : '';
    return `${apiBase}?experiment_id=${encodeURIComponent(experimentId)}${separator}${extra}`;
  }

  async function request(options = {}, query = '') {
    const response = await fetch(endpoint(query), {
      credentials: 'same-origin',
      headers: csrfHeaders(Boolean(options.body) && !(options.body instanceof FormData)),
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

  function setStatus(message = '', isError = false) {
    if (!statusBox) return;
    statusBox.textContent = message;
    statusBox.className = `small mt-2 ${isError ? 'text-danger' : 'text-muted'}`;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[char]));
  }

  function inlineMarkdown(value) {
    return escapeHtml(value)
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[\[Evidence:\s*([A-Za-z0-9_-]+)#([A-Za-z0-9_-]+)\]\]/g, (_match, paperKey, evidenceId) => {
        const href = `/literature.php?paper=${encodeURIComponent(paperKey)}&evidence=${encodeURIComponent(evidenceId)}`;
        return `<a href="${href}" class="experiment-record-chip">Evidence:${paperKey}#${evidenceId}</a>`;
      })
      .replace(/\[\[PaperAnnotation:\s*([A-Za-z0-9_-]+)#([A-Za-z0-9_-]+)\]\]/g, (_match, paperKey, annotationId) => {
        const href = `/literature.php?paper=${encodeURIComponent(paperKey)}&annotation=${encodeURIComponent(annotationId)}`;
        return `<a href="${href}" class="experiment-record-chip">PaperAnnotation:${paperKey}#${annotationId}</a>`;
      })
      .replace(/\[\[Idea:\s*([A-Za-z0-9_-]+)\]\]/g, (_match, id) => `<a href="/ideas.php?idea=${encodeURIComponent(id)}" class="experiment-record-chip">Idea:${id}</a>`)
      .replace(/\[\[(Experiment|Resource):\s*(\d+)\]\]/gi, (_match, type, id) => {
        const href = type.toLowerCase() === 'experiment' ? `/experiments.php?mode=view&id=${id}` : `/database.php?mode=view&id=${id}`;
        return `<a href="${href}" class="experiment-record-chip">${type}:${id}</a>`;
      });
  }

  function markdownToHtml(markdown) {
    const lines = String(markdown || '').split(/\r?\n/);
    const blocks = [];
    let paragraph = [];
    const listItems = [];
    const flushParagraph = () => {
      if (!paragraph.length) return;
      blocks.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
      paragraph = [];
    };
    const flushList = () => {
      if (!listItems.length) return;
      blocks.push(`<ul>${listItems.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</ul>`);
      listItems.length = 0;
    };

    for (const line of lines) {
      if (!line.trim()) {
        flushParagraph();
        flushList();
      } else if (line.startsWith('### ')) {
        flushParagraph();
        flushList();
        blocks.push(`<h3>${inlineMarkdown(line.slice(4))}</h3>`);
      } else if (line.startsWith('## ')) {
        flushParagraph();
        flushList();
        blocks.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`);
      } else if (line.startsWith('# ')) {
        flushParagraph();
        flushList();
        blocks.push(`<h1>${inlineMarkdown(line.slice(2))}</h1>`);
      } else if (line.startsWith('- ')) {
        flushParagraph();
        listItems.push(line.slice(2));
      } else {
        flushList();
        paragraph.push(line);
      }
    }
    flushParagraph();
    flushList();
    return blocks.join('\n') || '<p><br></p>';
  }

  function refreshPreview() {
    previewBox.innerHTML = markdownToHtml(markdownInput.value);
  }

  function setSourceVisible(isVisible) {
    markdownInput.hidden = !isVisible;
    editorGrid.classList.toggle('is-source-open', isVisible);
    if (sourceButton) {
      sourceButton.innerHTML = isVisible
        ? '<i class="fas fa-code fa-fw mr-1"></i>Hide source'
        : '<i class="fas fa-code fa-fw mr-1"></i>Markdown';
    }
  }

  function today() {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
  }

  function summary(markdown) {
    return String(markdown || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) || 'No text yet.';
  }

  function chip(label, href) {
    const element = href ? document.createElement('a') : document.createElement('span');
    element.className = 'experiment-record-chip';
    element.textContent = label;
    if (href) element.href = href;
    return element;
  }

  function renderRecords() {
    list.replaceChildren();
    empty.hidden = records.length > 0;
    for (const record of records) {
      const card = document.createElement('article');
      card.className = 'experiment-record-card';
      card.dataset.recordId = record.id;

      const main = document.createElement('div');
      main.className = 'experiment-record-card-main';
      const title = document.createElement('div');
      title.className = 'experiment-record-card-title';
      title.textContent = record.title;
      const meta = document.createElement('div');
      meta.className = 'experiment-record-meta';
      meta.textContent = `${record.record_date} · ${record.record_type || 'other'} · ${record.id}`;
      const text = document.createElement('div');
      text.className = 'experiment-record-summary mt-1';
      text.textContent = summary(record.markdown);
      const chips = document.createElement('div');
      chips.className = 'mt-1';
      for (const id of record.resources || []) chips.append(chip(`Resource ${id}`, `/database.php?mode=view&id=${id}`));
      for (const id of record.ideas || []) chips.append(chip(`Idea ${id}`, `/ideas.php?idea=${id}`));
      for (const id of record.evidence || []) chips.append(chip(`Evidence ${id}`, `/literature.php?evidence=${encodeURIComponent(id)}`));
      for (const id of record.annotations || []) chips.append(chip(`Annotation ${id}`, `/literature.php?annotation=${encodeURIComponent(id)}`));
      main.append(title, meta, text);
      if (chips.childElementCount) main.append(chips);

      const actions = document.createElement('div');
      actions.className = 'align-self-center';
      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'btn btn-secondary btn-sm';
      openButton.innerHTML = '<i class="fas fa-pencil-alt fa-fw mr-1"></i>Open';
      openButton.addEventListener('click', () => openRecord(record));
      actions.append(openButton);

      card.append(main, actions);
      card.addEventListener('dblclick', () => openRecord(record));
      list.append(card);
    }
  }

  async function loadRecords() {
    setError('');
    try {
      const data = await request();
      records = data.records || [];
      renderRecords();
    } catch (error) {
      setError(error.message || 'Could not load records.');
    }
  }

  function openModal() {
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    titleInput?.focus();
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('modal-open');
  }

  function openRecord(record = null) {
    activeRecord = record;
    idInput.value = record?.id || '';
    titleInput.value = record?.title || '';
    dateInput.value = record?.record_date || today();
    typeInput.value = record?.record_type || 'other';
    markdownInput.value = record?.markdown || '';
    setSourceVisible(true);
    modalTitle.textContent = record ? 'Edit record' : 'New record';
    deleteButton.hidden = !record;
    setStatus('');
    refreshPreview();
    openModal();
  }

  function payload() {
    return {
      ...(idInput.value ? { id: idInput.value } : {}),
      title: titleInput.value,
      record_date: dateInput.value,
      record_type: typeInput.value,
      markdown: markdownInput.value,
    };
  }

  async function saveRecord({ keepOpen = true } = {}) {
    saveButton.disabled = true;
    try {
      const saved = await request({
        method: 'POST',
        body: JSON.stringify(payload())
      });
      activeRecord = saved;
      idInput.value = saved.id;
      deleteButton.hidden = false;
      setStatus(`Saved ${saved.updated_at}`);
      await loadRecords();
      if (!keepOpen) closeModal();
      return saved;
    } catch (error) {
      setStatus(error.message || 'Could not save record.', true);
      throw error;
    } finally {
      saveButton.disabled = false;
    }
  }

  async function deleteRecord() {
    if (!idInput.value) return;
    if (!confirm('Delete this record?')) return;
    deleteButton.disabled = true;
    try {
      await request({
        method: 'POST',
        body: JSON.stringify({ action: 'delete', id: idInput.value })
      });
      closeModal();
      await loadRecords();
    } catch (error) {
      setStatus(error.message || 'Could not delete record.', true);
    } finally {
      deleteButton.disabled = false;
    }
  }

  function appendMarkdown(snippet) {
    const prefix = markdownInput.value.trim() ? '\n\n' : '';
    markdownInput.value = `${markdownInput.value.trim()}${prefix}${snippet}`;
    refreshPreview();
  }

  async function uploadFiles(files) {
    if (!files.length) return;
    try {
      let record = activeRecord;
      if (!idInput.value) {
        record = await saveRecord();
      }
      for (const file of files) {
        const body = new FormData();
        body.append('experiment_id', experimentId);
        body.append('id', record.id);
        body.append('file', file);
        const uploaded = await request({ method: 'POST', body }, `action=upload&id=${encodeURIComponent(record.id)}`);
        appendMarkdown(uploaded.is_image ? `![${uploaded.name}](${uploaded.url})` : `[${uploaded.name}](${uploaded.url})`);
      }
      await saveRecord();
    } catch (error) {
      setStatus(error.message || 'Could not upload file.', true);
    } finally {
      uploadInput.value = '';
    }
  }

  newButton?.addEventListener('click', () => openRecord());
  root.querySelectorAll('[data-record-close]').forEach((button) => button.addEventListener('click', closeModal));
  saveButton?.addEventListener('click', () => saveRecord({ keepOpen: false }).catch(() => {}));
  deleteButton?.addEventListener('click', deleteRecord);
  sourceButton?.addEventListener('click', () => {
    setSourceVisible(markdownInput.hidden);
  });
  root.querySelectorAll('[data-record-insert]').forEach((button) => button.addEventListener('click', () => appendMarkdown(button.dataset.recordInsert || '')));
  uploadButton?.addEventListener('click', () => uploadInput?.click());
  uploadInput?.addEventListener('change', () => uploadFiles(Array.from(uploadInput.files || [])));
  markdownInput?.addEventListener('input', refreshPreview);

  loadRecords();
})();
