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
  const emptyRefreshButton = root.querySelector('[data-literature-empty-refresh]');
  const configButton = root.querySelector('[data-literature-config]');
  const configDialog = root.querySelector('[data-literature-config-dialog]');
  const configForm = root.querySelector('[data-literature-config-form]');
  const configStatus = root.querySelector('[data-literature-config-status]');
  const configError = root.querySelector('[data-literature-config-error]');
  const newPaperButton = root.querySelector('[data-literature-new-paper]');
  const emptyNewPaperButton = root.querySelector('[data-literature-empty-new-paper]');
  const paperDialog = root.querySelector('[data-literature-paper-dialog]');
  const paperForm = root.querySelector('[data-literature-paper-form]');
  const paperError = root.querySelector('[data-literature-paper-error]');
  const pdfDialog = root.querySelector('[data-literature-pdf-dialog]');
  const pdfTitle = root.querySelector('[data-literature-pdf-title]');
  const pdfAttachments = root.querySelector('[data-literature-pdf-attachments]');
  const pdfStatus = root.querySelector('[data-literature-pdf-status]');
  const pdfCanvasWrap = root.querySelector('[data-literature-pdf-canvas-wrap]');
  const pdfCanvas = root.querySelector('[data-literature-pdf-canvas]');
  const attachmentImage = root.querySelector('[data-literature-attachment-image]');
  let attachmentHtml = root.querySelector('[data-literature-attachment-html]');
  const pdfOverlay = root.querySelector('[data-literature-pdf-overlay]');
  const pdfPageLabel = root.querySelector('[data-literature-pdf-page]');
  const pdfToolButtons = root.querySelectorAll('[data-literature-pdf-tool]');
  const pdfPrevButton = root.querySelector('[data-literature-pdf-prev]');
  const pdfNextButton = root.querySelector('[data-literature-pdf-next]');
  const pdfZoomInButton = root.querySelector('[data-literature-pdf-zoom-in]');
  const pdfZoomOutButton = root.querySelector('[data-literature-pdf-zoom-out]');
  const pdfNoteInput = root.querySelector('[data-literature-pdf-note]');
  const pdfQuoteInput = root.querySelector('[data-literature-pdf-quote]');
  const pdfAnnotationList = root.querySelector('[data-literature-pdf-annotations]');

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
    annotations: {},
    selectedKey: '',
    collection: '',
    tag: '',
    q: '',
  };

  let pdfState = {
    item: null,
    attachments: [],
    annotations: [],
    selectedAttachment: null,
    pdfDoc: null,
    pdfjs: null,
    viewKind: '',
    page: 1,
    scale: 1.25,
    tool: 'highlight',
    drawing: null,
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

  function annotationsFor(key) {
    return state.annotations[key] || [];
  }

  function statusLabel(status) {
    return ({
      unread: isZh ? '未读' : 'Unread',
      reading: isZh ? '阅读中' : 'Reading',
      read: isZh ? '已读' : 'Read',
      important: isZh ? '重要' : 'Important',
    })[status] || status;
  }

  function cleanInline(value) {
    return String(value || '').trim();
  }

  function authorSummary(creators = []) {
    const names = Array.isArray(creators) ? creators.filter(Boolean) : [];
    if (!names.length) return '';
    return names.length === 1 ? names[0] : `${names[0]} et al.`;
  }

  function quoteBlock(value = '') {
    return cleanInline(value).split(/\r?\n/).map((line) => `> ${line}`).join('\n');
  }

  function evidenceMarkdown(evidence, item) {
    const blocks = [];
    const quote = quoteBlock(evidence.original_text || '');
    if (quote.trim()) blocks.push(quote);

    const metadata = [];
    if (evidence.reference) metadata.push(`Evidence: ${evidence.reference}`);
    const source = [
      cleanInline(item?.title),
      authorSummary(item?.creators),
      cleanInline(item?.year),
      cleanInline(evidence.section),
      evidence.page ? `p.${cleanInline(evidence.page)}` : '',
      item?.doi ? `DOI:${cleanInline(item.doi)}` : '',
    ].filter(Boolean).join(' · ');
    if (source) metadata.push(`Source: ${source}`);
    if (evidence.my_note) metadata.push(`Note: ${cleanInline(evidence.my_note)}`);
    if (metadata.length) blocks.push(metadata.join('\n'));

    return blocks.join('\n\n');
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
      if (annotationsFor(item.key).length) chips.append(text('span', 'literature-chip', `${annotationsFor(item.key).length} ${isZh ? '标注' : 'marks'}`));
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
    const pdfButton = document.createElement('button');
    pdfButton.type = 'button';
    pdfButton.className = 'btn btn-primary btn-sm';
    pdfButton.dataset.literatureOpenPdf = item.key;
    pdfButton.innerHTML = `<i class="fas fa-highlighter fa-fw mr-1"></i>${isZh ? '附件标注' : 'Annotate files'}`;
    actions.append(pdfButton);
    if (actions.childElementCount) detail.append(actions);
    if (item.abstractNote) {
      detail.append(text('h3', 'h5 mt-4', 'Abstract'));
      detail.append(text('p', 'small', item.abstractNote));
    }

    const evidenceSection = document.createElement('section');
    evidenceSection.className = 'literature-evidence mt-4';
    const evidenceCards = evidenceFor(item.key);
    const evidenceHead = document.createElement('div');
    evidenceHead.className = 'literature-section-head';
    evidenceHead.append(text('h3', 'h5 mb-0', isZh ? '摘录工作台' : 'Quote workspace'));
    evidenceHead.append(text('span', 'badge badge-light', `${evidenceCards.length} ${isZh ? '条' : 'saved'}`));
    evidenceSection.append(evidenceHead);
    const intro = text('p', 'text-muted small', isZh
      ? '边看文献边保存原句、图注或关键发现；复制 Markdown 块后可直接粘到实验/资源记录里。'
      : 'Capture a quote, figure caption, or finding while reading; copy the Markdown block into experiments/resources.');
    evidenceSection.append(intro);

    const evidenceForm = document.createElement('form');
    evidenceForm.className = 'literature-evidence-form';
    evidenceForm.dataset.literatureEvidenceForm = item.key;
    evidenceForm.innerHTML = `
      <div class="row">
        <div class="col-md-4">
          <label>${isZh ? '类型' : 'Type'}
            <select class="form-control" name="type">
              <option value="quote">${isZh ? '原文摘录' : 'Quote'}</option>
              <option value="figure">${isZh ? '图片 / 图注' : 'Figure'}</option>
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
          <label>${isZh ? '章节 / 图号' : 'Section / figure'}
            <input class="form-control" name="section" placeholder="Fig. 2B">
          </label>
        </div>
      </div>
      <label>${isZh ? '原文 / 图注 / 方法段落' : 'Original text / caption / method'}
        <textarea class="form-control literature-evidence-textarea" name="original_text" rows="6" placeholder="${isZh ? '粘贴一句话、一段原文、图注，或你想回溯的材料方法细节。' : 'Paste the exact sentence, paragraph, figure caption, or method detail.'}"></textarea>
      </label>
      <label>${isZh ? '图片或来源 URL（可选）' : 'Figure/source URL (optional)'}
        <input class="form-control" name="image_url" type="url" placeholder="https://...">
      </label>
      <label>${isZh ? '我的理解 / 为什么重要' : 'My note / why it matters'}
        <textarea class="form-control" name="my_note" rows="3" placeholder="${isZh ? '例如：可作为某个实验的对照，或解释某个现象。' : 'Example: use as a control, or explains a phenotype.'}"></textarea>
      </label>
      <button type="submit" class="btn btn-primary"><i class="fas fa-plus fa-fw mr-1"></i>${isZh ? '保存摘录' : 'Save quote'}</button>
    `;
    evidenceSection.append(evidenceForm);

    const evidenceList = document.createElement('div');
    evidenceList.className = 'literature-evidence-list mt-3';
    evidenceList.append(text('h4', 'h6 mb-0', isZh ? '已保存证据' : 'Saved evidence'));
    if (!evidenceCards.length) {
      evidenceList.append(text('div', 'text-muted small', isZh ? '还没有摘录。保存后可以复制 Markdown 引用块。' : 'No captures yet. Saved entries can be copied as Markdown citation blocks.'));
    }
    for (const evidence of evidenceCards) {
      const cardNode = document.createElement('article');
      cardNode.className = 'literature-evidence-card';
      const head = document.createElement('div');
      head.className = 'literature-evidence-card-head';
      head.append(text('strong', '', `${evidence.type}${evidence.page ? ` · p.${evidence.page}` : ''}${evidence.section ? ` · ${evidence.section}` : ''}`));
      const copyGroup = document.createElement('div');
      copyGroup.className = 'btn-group btn-group-sm';
      const copyBlock = document.createElement('button');
      copyBlock.type = 'button';
      copyBlock.className = 'btn btn-secondary';
      copyBlock.dataset.literatureCopyEvidenceMarkdown = evidenceMarkdown(evidence, item);
      copyBlock.innerHTML = `<i class="fas fa-quote-left fa-fw mr-1"></i>${isZh ? '复制块' : 'Copy block'}`;
      const copyRef = document.createElement('button');
      copyRef.type = 'button';
      copyRef.className = 'btn btn-secondary';
      copyRef.dataset.literatureCopyEvidence = evidence.reference;
      copyRef.innerHTML = `<i class="fas fa-link fa-fw mr-1"></i>${isZh ? '短引用' : 'Ref'}`;
      copyGroup.append(copyBlock, copyRef);
      head.append(copyGroup);
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
      cardNode.append(text('code', 'literature-evidence-reference small', evidence.reference));
      evidenceList.append(cardNode);
    }
    evidenceSection.append(evidenceList);
    detail.append(evidenceSection);

    const form = document.createElement('form');
    form.className = 'literature-card-form mt-4';
    form.dataset.literatureCardForm = item.key;
    form.innerHTML = `
      <div class="literature-section-head">
        <h3 class="h5 mb-0">${isZh ? '阅读卡片' : 'Reading card'}</h3>
      </div>
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
        <textarea class="form-control" name="note" rows="4"></textarea>
      </label>
      <div class="row">
        <div class="col-md-6">
          <label>${isZh ? '关联 Experiments' : 'Linked experiments'}
            <input class="form-control" name="linked_experiments" placeholder="12, 18">
          </label>
        </div>
        <div class="col-md-6 mt-2 mt-md-0">
          <label>${isZh ? '关联 Resources' : 'Linked resources'}
            <input class="form-control" name="linked_resources" placeholder="11, 24">
          </label>
        </div>
      </div>
      <button type="submit" class="btn btn-secondary justify-self-start"><i class="fas fa-save fa-fw mr-1"></i>${isZh ? '保存阅读卡片' : 'Save reading card'}</button>
    `;
    form.elements.status.value = card.status;
    form.elements.summary.value = card.summary || '';
    form.elements.note.value = card.note || '';
    form.elements.linked_experiments.value = card.linked_experiments.join(', ');
    form.elements.linked_resources.value = card.linked_resources.join(', ');
    detail.append(form);
  }

  function setPdfStatus(message = '') {
    if (!pdfStatus) return;
    pdfStatus.textContent = message;
    pdfStatus.hidden = !message;
  }

  async function loadPdfJs() {
    if (pdfState.pdfjs) return pdfState.pdfjs;
    const pdfjs = await import('/planner-assets/pdfjs.js');
    pdfjs.GlobalWorkerOptions.workerSrc = '/planner-assets/pdf.worker.js';
    pdfState.pdfjs = pdfjs;
    return pdfjs;
  }

  function attachmentIcon(kind) {
    return ({
      pdf: 'fa-file-pdf',
      image: 'fa-file-image',
      html: 'fa-file-code',
      other: 'fa-file',
    })[kind] || 'fa-file';
  }

  function renderAttachmentButtons() {
    if (!pdfAttachments) return;
    pdfAttachments.replaceChildren();
    if (!pdfState.attachments.length) {
      pdfAttachments.append(text('div', 'text-muted small', isZh ? '这个条目没有 Zotero 附件。' : 'No Zotero attachments for this item.'));
      return;
    }
    for (const attachment of pdfState.attachments) {
      const kind = attachment.kind || (attachment.is_pdf ? 'pdf' : 'other');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `btn btn-sm ${pdfState.selectedAttachment?.key === attachment.key ? 'btn-primary' : 'btn-secondary'}`;
      button.dataset.literaturePdfAttachment = attachment.key;
      button.disabled = !attachment.available;
      button.innerHTML = `<i class="fas ${attachmentIcon(kind)} fa-fw mr-1"></i>${attachment.filename || attachment.title || attachment.key}`;
      if (!attachment.available) button.title = isZh ? 'WebDAV 上还没有这个附件文件' : 'Attachment file is not available in WebDAV yet';
      else if (!attachment.annotatable) button.title = isZh ? '可打开或下载，暂不支持标注' : 'Can be opened or downloaded; annotation is not supported yet';
      pdfAttachments.append(button);
    }
  }

  function renderPdfAnnotationList() {
    if (!pdfAnnotationList) return;
    pdfAnnotationList.replaceChildren();
    const annotations = pdfState.annotations.filter((annotation) => annotation.attachmentKey === pdfState.selectedAttachment?.key);
    if (!annotations.length) {
      pdfAnnotationList.append(text('div', 'text-muted small', isZh ? '还没有标注。选择工具后在 PDF 页面上拖拽。' : 'No marks yet. Pick a tool and drag on the PDF page.'));
      return;
    }
    for (const annotation of annotations) {
      const card = document.createElement('article');
      card.className = 'literature-pdf-annotation-card';
      card.innerHTML = `
        <div class="d-flex justify-content-between align-items-start">
          <strong>${annotation.tool} · p.${annotation.page}</strong>
          <div class="btn-group btn-group-sm">
            <button type="button" class="btn btn-secondary" data-literature-copy-annotation="${annotation.reference}"><i class="fas fa-copy fa-fw"></i></button>
            <button type="button" class="btn btn-danger" data-literature-delete-annotation="${annotation.id}"><i class="fas fa-trash fa-fw"></i></button>
          </div>
        </div>
        ${annotation.quote ? `<blockquote class="literature-evidence-quote mt-2 mb-1"></blockquote>` : ''}
        ${annotation.note ? `<p class="small mb-1"></p>` : ''}
        <code class="small"></code>
      `;
      const quote = card.querySelector('blockquote');
      if (quote) quote.textContent = annotation.quote;
      const note = card.querySelector('p');
      if (note) note.textContent = annotation.note;
      card.querySelector('code').textContent = annotation.reference;
      pdfAnnotationList.append(card);
    }
  }

  function renderPdfMarks() {
    if (!pdfOverlay) return;
    pdfOverlay.querySelectorAll('.literature-pdf-mark').forEach((node) => node.remove());
    const annotations = pdfState.annotations.filter((annotation) => annotation.attachmentKey === pdfState.selectedAttachment?.key && annotation.page === pdfState.page);
    for (const annotation of annotations) {
      const mark = document.createElement('button');
      mark.type = 'button';
      mark.className = `literature-pdf-mark is-${annotation.tool}`;
      mark.style.left = `${annotation.rect.x * 100}%`;
      mark.style.top = `${annotation.rect.y * 100}%`;
      mark.style.width = `${annotation.rect.width * 100}%`;
      mark.style.height = `${annotation.rect.height * 100}%`;
      mark.style.borderColor = annotation.color || '#29aeb9';
      mark.style.backgroundColor = annotation.tool === 'highlight' ? `${annotation.color || '#ffe066'}66` : 'transparent';
      mark.title = annotation.note || annotation.quote || annotation.reference;
      pdfOverlay.append(mark);
    }
  }

  async function renderPdfPage() {
    if (!pdfState.pdfDoc || !pdfCanvas || !pdfOverlay) return;
    setPdfStatus(isZh ? '渲染 PDF...' : 'Rendering PDF...');
    pdfState.viewKind = 'pdf';
    pdfCanvas.hidden = false;
    if (attachmentImage) attachmentImage.hidden = true;
    if (attachmentHtml) attachmentHtml.hidden = true;
    const page = await pdfState.pdfDoc.getPage(pdfState.page);
    const viewport = page.getViewport({ scale: pdfState.scale });
    const outputScale = Math.min(window.devicePixelRatio || 1, 3);
    const cssWidth = Math.floor(viewport.width);
    const cssHeight = Math.floor(viewport.height);
    const context = pdfCanvas.getContext('2d');
    pdfCanvas.width = Math.floor(cssWidth * outputScale);
    pdfCanvas.height = Math.floor(cssHeight * outputScale);
    pdfCanvas.style.width = `${cssWidth}px`;
    pdfCanvas.style.height = `${cssHeight}px`;
    pdfOverlay.style.width = pdfCanvas.style.width;
    pdfOverlay.style.height = pdfCanvas.style.height;
    if (pdfPageLabel) pdfPageLabel.textContent = `${pdfState.page} / ${pdfState.pdfDoc.numPages}`;
    if (pdfPrevButton) pdfPrevButton.disabled = pdfState.page <= 1;
    if (pdfNextButton) pdfNextButton.disabled = pdfState.page >= pdfState.pdfDoc.numPages;
    const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
    const renderTask = page.render({ canvasContext: context, viewport, transform });
    await Promise.race([
      renderTask.promise,
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]);
    renderPdfMarks();
    renderPdfAnnotationList();
    setPdfStatus('');
  }

  function renderImagePage() {
    if (!attachmentImage || !pdfOverlay || !pdfState.selectedAttachment) return;
    if (!attachmentImage.naturalWidth || !attachmentImage.naturalHeight) return;
    pdfState.viewKind = 'image';
    pdfState.pdfDoc = null;
    pdfState.page = 1;
    if (pdfCanvas) pdfCanvas.hidden = true;
    if (attachmentHtml) attachmentHtml.hidden = true;
    attachmentImage.hidden = false;
    const cssWidth = Math.max(1, Math.floor(attachmentImage.naturalWidth * pdfState.scale));
    const cssHeight = Math.max(1, Math.floor(attachmentImage.naturalHeight * pdfState.scale));
    attachmentImage.style.width = `${cssWidth}px`;
    attachmentImage.style.height = `${cssHeight}px`;
    pdfOverlay.style.width = attachmentImage.style.width;
    pdfOverlay.style.height = attachmentImage.style.height;
    if (pdfPageLabel) pdfPageLabel.textContent = isZh ? '图片' : 'Image';
    if (pdfPrevButton) pdfPrevButton.disabled = true;
    if (pdfNextButton) pdfNextButton.disabled = true;
    renderPdfMarks();
    renderPdfAnnotationList();
    setPdfStatus('');
  }

  function htmlPreviewDocument(rawHtml = '') {
    const sanitizedHtml = String(rawHtml || '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
      .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
      .replace(/<embed\b[^>]*>/gi, '');
    const baseStyle = `
      <style>
        html, body { margin: 0; padding: 16px; background: #fff; color: #212529; font-family: Arial, sans-serif; }
        img, video, canvas, svg, table { max-width: 100%; }
        pre { white-space: pre-wrap; }
      </style>
    `;
    return sanitizedHtml.includes('</head>')
      ? sanitizedHtml.replace('</head>', `${baseStyle}</head>`)
      : `${baseStyle}${sanitizedHtml}`;
  }

  function ensureAttachmentHtml() {
    if (attachmentHtml) return attachmentHtml;
    if (!pdfCanvasWrap || !pdfOverlay) return null;
    attachmentHtml = document.createElement('iframe');
    attachmentHtml.className = 'literature-attachment-html';
    attachmentHtml.dataset.literatureAttachmentHtml = '';
    attachmentHtml.setAttribute('sandbox', 'allow-same-origin');
    attachmentHtml.setAttribute('title', 'HTML snapshot preview');
    attachmentHtml.hidden = true;
    pdfCanvasWrap.insertBefore(attachmentHtml, pdfOverlay);
    return attachmentHtml;
  }

  function renderHtmlPage() {
    if (!attachmentHtml || !pdfOverlay || !pdfState.selectedAttachment) return;
    pdfState.viewKind = 'html';
    pdfState.pdfDoc = null;
    pdfState.page = 1;
    if (pdfCanvas) pdfCanvas.hidden = true;
    if (attachmentImage) attachmentImage.hidden = true;
    attachmentHtml.hidden = false;
    const cssWidth = Math.floor(980 * pdfState.scale);
    attachmentHtml.style.width = `${cssWidth}px`;
    const doc = attachmentHtml.contentDocument;
    const height = Math.max(
      640,
      doc?.documentElement?.scrollHeight || 0,
      doc?.body?.scrollHeight || 0,
    );
    attachmentHtml.style.height = `${height}px`;
    pdfOverlay.style.width = attachmentHtml.style.width;
    pdfOverlay.style.height = attachmentHtml.style.height;
    if (pdfPageLabel) pdfPageLabel.textContent = 'HTML';
    if (pdfPrevButton) pdfPrevButton.disabled = true;
    if (pdfNextButton) pdfNextButton.disabled = true;
    renderPdfMarks();
    renderPdfAnnotationList();
    setPdfStatus('');
  }

  async function loadImageAttachment(attachment) {
    if (!attachment?.preview_url || !attachmentImage) return;
    if (pdfState.viewKind !== 'image') pdfState.scale = 1;
    pdfState.selectedAttachment = attachment;
    pdfState.page = 1;
    pdfState.pdfDoc = null;
    renderAttachmentButtons();
    setPdfStatus(isZh ? '加载图片...' : 'Loading image...');
    await new Promise((resolve, reject) => {
      attachmentImage.onload = () => {
        renderImagePage();
        resolve();
      };
      attachmentImage.onerror = () => reject(new Error(isZh ? '图片加载失败。' : 'Could not load image.'));
      attachmentImage.src = attachment.preview_url;
    });
  }

  async function loadHtmlAttachment(attachment) {
    const htmlFrame = ensureAttachmentHtml();
    if (!attachment?.preview_url || !htmlFrame) return;
    if (pdfState.viewKind !== 'html') pdfState.scale = 1;
    pdfState.selectedAttachment = attachment;
    pdfState.page = 1;
    pdfState.pdfDoc = null;
    renderAttachmentButtons();
    setPdfStatus(isZh ? '加载 HTML 快照...' : 'Loading HTML snapshot...');
    const response = await fetch(attachment.preview_url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(isZh ? 'HTML 快照加载失败。' : 'Could not load HTML snapshot.');
    const rawHtml = await response.text();
    await new Promise((resolve) => {
      htmlFrame.onload = () => {
        renderHtmlPage();
        setTimeout(renderHtmlPage, 250);
        resolve();
      };
      htmlFrame.srcdoc = htmlPreviewDocument(rawHtml);
    });
  }

  async function loadPreviewAttachment(attachment) {
    if (!attachment) return;
    if (!attachment.annotatable) {
      if (attachment.file_url) window.open(attachment.file_url, '_blank', 'noopener');
      return;
    }
    if (attachment.kind === 'image' || attachment.is_image) {
      await loadImageAttachment(attachment);
      return;
    }
    if (attachment.kind === 'html') {
      await loadHtmlAttachment(attachment);
      return;
    }
    if (!attachment.preview_url && !attachment.pdf_url) return;
    pdfState.selectedAttachment = attachment;
    if (pdfState.viewKind !== 'pdf') pdfState.scale = 1.25;
    pdfState.page = 1;
    renderAttachmentButtons();
    setPdfStatus(isZh ? '加载 PDF...' : 'Loading PDF...');
    if (attachmentImage) attachmentImage.hidden = true;
    if (attachmentHtml) attachmentHtml.hidden = true;
    if (pdfCanvas) pdfCanvas.hidden = false;
    const pdfjs = await loadPdfJs();
    pdfState.pdfDoc = await pdfjs.getDocument({ url: attachment.preview_url || attachment.pdf_url, withCredentials: true }).promise;
    await renderPdfPage();
  }

  function renderCurrentPreview() {
    if (pdfState.viewKind === 'image') {
      renderImagePage();
      return;
    }
    if (pdfState.viewKind === 'html') {
      renderHtmlPage();
      return;
    }
    renderPdfPage().catch((error) => setPdfStatus(error.message || 'Could not render page.'));
  }

  async function openPdfWorkspace(item) {
    if (!pdfDialog || !item) return;
    pdfState = {
      ...pdfState,
      item,
      attachments: [],
      annotations: annotationsFor(item.key),
      selectedAttachment: null,
      pdfDoc: null,
      viewKind: '',
      page: 1,
      scale: 1,
      drawing: null,
    };
    if (pdfTitle) pdfTitle.textContent = item.title || item.key;
    renderAttachmentButtons();
    renderPdfAnnotationList();
    setPdfStatus(isZh ? '读取 Zotero 附件...' : 'Loading Zotero attachments...');
    if (typeof pdfDialog.showModal === 'function') pdfDialog.showModal();
    else pdfDialog.setAttribute('open', '');
    try {
      const params = new URLSearchParams({ action: 'attachments', paper_key: item.key });
      const data = await request({}, `?${params}`);
      pdfState.attachments = data.attachments || [];
      pdfState.annotations = data.annotations || [];
      state.annotations[item.key] = pdfState.annotations;
      const firstPreview = pdfState.attachments.find((attachment) => attachment.annotatable && attachment.available);
      renderAttachmentButtons();
      if (firstPreview) {
        await loadPreviewAttachment(firstPreview);
      } else {
        setPdfStatus(isZh ? '没有可标注的 PDF 或图片。其他附件可从左侧打开或下载。' : 'No annotatable PDF or image. Other attachments can be opened or downloaded from the left.');
      }
      render();
    } catch (error) {
      setPdfStatus(error.message || (isZh ? '无法打开 PDF 工作区。' : 'Could not open PDF workspace.'));
    }
  }

  function pointFromEvent(event) {
    const rect = pdfOverlay.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }

  function removeDraftMark() {
    pdfOverlay?.querySelector('[data-literature-pdf-draft]')?.remove();
  }

  function renderDraftMark(start, end) {
    if (!pdfOverlay) return;
    removeDraftMark();
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    const draft = document.createElement('div');
    draft.className = `literature-pdf-mark is-${pdfState.tool} is-draft`;
    draft.dataset.literaturePdfDraft = 'true';
    draft.style.left = `${left * 100}%`;
    draft.style.top = `${top * 100}%`;
    draft.style.width = `${width * 100}%`;
    draft.style.height = `${height * 100}%`;
    pdfOverlay.append(draft);
  }

  async function savePdfAnnotation(rect) {
    const payload = {
      action: 'annotation',
      paperKey: pdfState.item.key,
      attachmentKey: pdfState.selectedAttachment.key,
      tool: pdfState.tool,
      page: pdfState.page,
      rect,
      color: pdfState.tool === 'highlight' ? '#ffe066' : '#29aeb9',
      quote: pdfQuoteInput?.value || '',
      note: pdfNoteInput?.value || '',
    };
    const data = await request({ method: 'POST', body: JSON.stringify(payload) });
    const annotation = data.annotation;
    pdfState.annotations = [annotation, ...pdfState.annotations.filter((item) => item.id !== annotation.id)];
    state.annotations[annotation.paperKey] = pdfState.annotations;
    if (pdfNoteInput) pdfNoteInput.value = '';
    if (pdfQuoteInput) pdfQuoteInput.value = '';
    renderPdfMarks();
    renderPdfAnnotationList();
    renderItems();
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
      state.annotations = data.annotations || {};
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
    const pdfButton = event.target.closest('[data-literature-open-pdf]');
    if (pdfButton) {
      const item = state.items.find((candidate) => candidate.key === pdfButton.dataset.literatureOpenPdf);
      openPdfWorkspace(item);
      return;
    }
    const button = event.target.closest('[data-literature-copy-evidence-markdown], [data-literature-copy-evidence]');
    if (!button) return;
    const value = button.dataset.literatureCopyEvidenceMarkdown || button.dataset.literatureCopyEvidence || '';
    try {
      await navigator.clipboard?.writeText(value);
      button.textContent = isZh ? '已复制' : 'Copied';
      setTimeout(render, 900);
    } catch {
      window.prompt(isZh ? '复制这段引用' : 'Copy this reference', value);
    }
  });

  root.querySelectorAll('[data-literature-pdf-close]').forEach((button) => {
    button.addEventListener('click', () => {
      if (typeof pdfDialog?.close === 'function') pdfDialog.close();
      else pdfDialog?.removeAttribute('open');
    });
  });

  pdfAttachments?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-literature-pdf-attachment]');
    if (!button) return;
    const attachment = pdfState.attachments.find((candidate) => candidate.key === button.dataset.literaturePdfAttachment);
    loadPreviewAttachment(attachment).catch((error) => setPdfStatus(error.message || 'Could not load attachment.'));
  });

  pdfToolButtons.forEach((button) => {
    button.addEventListener('click', () => {
      pdfState.tool = button.dataset.literaturePdfTool || 'highlight';
      pdfToolButtons.forEach((candidate) => candidate.classList.toggle('active', candidate === button));
    });
  });

  pdfPrevButton?.addEventListener('click', () => {
    if (!pdfState.pdfDoc || pdfState.page <= 1) return;
    pdfState.page -= 1;
    renderPdfPage().catch((error) => setPdfStatus(error.message || 'Could not render page.'));
  });

  pdfNextButton?.addEventListener('click', () => {
    if (!pdfState.pdfDoc || pdfState.page >= pdfState.pdfDoc.numPages) return;
    pdfState.page += 1;
    renderPdfPage().catch((error) => setPdfStatus(error.message || 'Could not render page.'));
  });

  pdfZoomInButton?.addEventListener('click', () => {
    pdfState.scale = Math.min(2.5, pdfState.scale + 0.15);
    renderCurrentPreview();
  });

  pdfZoomOutButton?.addEventListener('click', () => {
    pdfState.scale = Math.max(0.75, pdfState.scale - 0.15);
    renderCurrentPreview();
  });

  pdfOverlay?.addEventListener('pointerdown', (event) => {
    if (!pdfState.selectedAttachment?.annotatable) return;
    if (event.button !== 0) return;
    pdfOverlay.setPointerCapture(event.pointerId);
    pdfState.drawing = { start: pointFromEvent(event), end: pointFromEvent(event) };
    renderDraftMark(pdfState.drawing.start, pdfState.drawing.end);
  });

  pdfOverlay?.addEventListener('pointermove', (event) => {
    if (!pdfState.drawing) return;
    pdfState.drawing.end = pointFromEvent(event);
    renderDraftMark(pdfState.drawing.start, pdfState.drawing.end);
  });

  pdfOverlay?.addEventListener('pointerup', async (event) => {
    if (!pdfState.drawing) return;
    pdfState.drawing.end = pointFromEvent(event);
    const { start, end } = pdfState.drawing;
    pdfState.drawing = null;
    removeDraftMark();
    const rect = {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    };
    if (rect.width < 0.005 || rect.height < 0.005) return;
    try {
      await savePdfAnnotation(rect);
    } catch (error) {
      setPdfStatus(error.message || (isZh ? '保存标注失败。' : 'Could not save annotation.'));
    }
  });

  pdfAnnotationList?.addEventListener('click', async (event) => {
    const copy = event.target.closest('[data-literature-copy-annotation]');
    if (copy) {
      const value = copy.dataset.literatureCopyAnnotation || '';
      try {
        await navigator.clipboard?.writeText(value);
        copy.textContent = isZh ? '已复制' : 'Copied';
        setTimeout(renderPdfAnnotationList, 900);
      } catch {
        window.prompt(isZh ? '复制这段引用' : 'Copy this reference', value);
      }
      return;
    }
    const del = event.target.closest('[data-literature-delete-annotation]');
    if (!del || !pdfState.item) return;
    const annotationId = del.dataset.literatureDeleteAnnotation || '';
    try {
      await request({
        method: 'DELETE',
      }, `?action=annotation&paper_key=${encodeURIComponent(pdfState.item.key)}&id=${encodeURIComponent(annotationId)}`);
      pdfState.annotations = pdfState.annotations.filter((annotation) => annotation.id !== annotationId);
      state.annotations[pdfState.item.key] = pdfState.annotations;
      renderPdfMarks();
      renderPdfAnnotationList();
      renderItems();
    } catch (error) {
      setPdfStatus(error.message || (isZh ? '删除标注失败。' : 'Could not delete annotation.'));
    }
  });

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    state.q = searchInput.value.trim();
    load();
  });

  refreshButton.addEventListener('click', load);
  emptyRefreshButton?.addEventListener('click', load);
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
  const openPaperDialog = () => {
    if (!paperDialog || !paperForm) return;
    paperForm.reset();
    if (paperError) paperError.hidden = true;
    if (typeof paperDialog.showModal === 'function') {
      paperDialog.showModal();
    } else {
      paperDialog.setAttribute('open', '');
    }
  };
  newPaperButton?.addEventListener('click', openPaperDialog);
  emptyNewPaperButton?.addEventListener('click', openPaperDialog);
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
