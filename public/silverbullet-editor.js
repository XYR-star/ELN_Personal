(function () {
  const root = document.querySelector('[data-silverbullet-editor-root]');
  if (!root) return;

  const textarea = root.querySelector('[data-silverbullet-markdown]');
  const previewButton = root.querySelector('[data-silverbullet-preview]');
  const nativeButton = root.querySelector('[data-silverbullet-native]');
  const saveButton = root.querySelector('[data-silverbullet-save]');
  const helpOpenButton = root.querySelector('[data-silverbullet-help-open]');
  const helpDialog = document.querySelector('[data-silverbullet-help-dialog]');
  const helpCloseButton = document.querySelector('[data-silverbullet-help-close]');
  const previewBox = root.querySelector('[data-silverbullet-preview-box]');
  const statusBox = root.querySelector('[data-silverbullet-status]');
  const initialNode = root.querySelector('[data-silverbullet-initial]');
  const titleNode = root.querySelector('[data-silverbullet-title]');
  const apiBase = root.dataset.apiBase || '/silverbullet-sync-api.php';
  const entityType = root.dataset.entityType || 'experiments';
  const entityId = root.dataset.entityId || '';
  const mainTextDiv = document.querySelector('#mainTextDiv');

  function csrfHeaders(hasBody = false) {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
    return {
      'X-Requested-With': 'XMLHttpRequest',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...(hasBody ? { 'Content-Type': 'application/json' } : {})
    };
  }

  function endpoint() {
    return `${apiBase}?entity_type=${encodeURIComponent(entityType)}&id=${encodeURIComponent(entityId)}`;
  }

  async function request(options = {}) {
    const response = await fetch(endpoint(), {
      credentials: 'same-origin',
      headers: csrfHeaders(Boolean(options.body)),
      ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `Request failed: ${response.status}`);
    return data;
  }

  function parseJsonNode(node, fallback = '') {
    try {
      return JSON.parse(node?.textContent || '""') || fallback;
    } catch {
      return fallback;
    }
  }

  function htmlToMarkdown(html) {
    const template = document.createElement('template');
    template.innerHTML = html || '';
    const text = template.content.textContent || '';
    return text.trim();
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
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[\[Evidence:\s*([A-Za-z0-9_-]+)#([A-Za-z0-9_-]+)\]\]/g, (_match, paperKey, evidenceId) => {
        const href = `/literature.php?paper=${encodeURIComponent(paperKey)}&evidence=${encodeURIComponent(evidenceId)}`;
        return `<a class="silverbullet-evidence-ref" href="${href}">[[Evidence:${paperKey}#${evidenceId}]]</a>`;
      })
      .replace(/\[\[(Experiment|Resource):\s*(\d+)\]\]/gi, (_match, type, id) => {
        const href = type.toLowerCase() === 'experiment' ? `/experiments.php?mode=view&id=${id}` : `/database.php?mode=view&id=${id}`;
        return `<a href="${href}">[[${type}:${id}]]</a>`;
      });
  }

  function markdownToHtml(markdown) {
    const lines = String(markdown || '').split(/\r?\n/);
    const blocks = [];
    let paragraph = [];
    const flush = () => {
      if (!paragraph.length) return;
      blocks.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
      paragraph = [];
    };
    for (const line of lines) {
      if (!line.trim()) {
        flush();
      } else if (line.startsWith('### ')) {
        flush();
        blocks.push(`<h3>${inlineMarkdown(line.slice(4))}</h3>`);
      } else if (line.startsWith('## ')) {
        flush();
        blocks.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`);
      } else if (line.startsWith('# ')) {
        flush();
        blocks.push(`<h1>${inlineMarkdown(line.slice(2))}</h1>`);
      } else if (line.startsWith('- ')) {
        flush();
        blocks.push(`<ul><li>${inlineMarkdown(line.slice(2))}</li></ul>`);
      } else {
        paragraph.push(line);
      }
    }
    flush();
    return blocks.join('\n') || '<p></p>';
  }

  function inlineNodeToMarkdown(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName.toLowerCase();
    const text = Array.from(node.childNodes).map(inlineNodeToMarkdown).join('');
    if (tag === 'strong' || tag === 'b') return `**${text}**`;
    if (tag === 'code') return `\`${text}\``;
    if (tag === 'a') return node.textContent || text;
    if (tag === 'br') return '\n';
    return text;
  }

  function blockNodeToMarkdown(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName.toLowerCase();
    const text = Array.from(node.childNodes).map(inlineNodeToMarkdown).join('').trim();
    if (!text) return '';
    if (tag === 'h1') return `# ${text}`;
    if (tag === 'h2') return `## ${text}`;
    if (tag === 'h3') return `### ${text}`;
    if (tag === 'li') return `- ${text}`;
    if (tag === 'ul' || tag === 'ol') {
      return Array.from(node.children).map(blockNodeToMarkdown).filter(Boolean).join('\n');
    }
    return text;
  }

  function editableToMarkdown() {
    const blocks = Array.from(previewBox.childNodes).map(blockNodeToMarkdown).filter(Boolean);
    return (blocks.length ? blocks.join('\n\n') : previewBox.innerText || '').trim();
  }

  function syncSourceFromEditable() {
    textarea.value = editableToMarkdown();
  }

  function setStatus(message = '', isError = false) {
    statusBox.textContent = message;
    statusBox.className = `small mt-2 ${isError ? 'text-danger' : 'text-muted'}`;
  }

  function setNativeBody(markdown) {
    const bodyArea = document.querySelector('#body_area');
    if (!bodyArea) throw new Error('Native main text editor is not available.');
    const contentType = document.querySelector('#entityBodyEditorDiv')?.dataset.contentType;
    const nextValue = contentType === '2' ? markdown : markdownToHtml(markdown);
    bodyArea.value = nextValue;
    bodyArea.dispatchEvent(new Event('input', { bubbles: true }));
    bodyArea.dispatchEvent(new Event('change', { bubbles: true }));
    const tiny = window.tinymce?.get?.('body_area');
    if (tiny) {
      tiny.setContent(nextValue);
      tiny.save();
    }
  }

  function nativeSaveButton() {
    return document.querySelector('#mainTextDiv [data-action="update-entity-body"]:not([data-redirect])');
  }

  function refreshPreview() {
    if (!previewBox) return;
    previewBox.hidden = false;
    previewBox.innerHTML = markdownToHtml(textarea.value);
  }

  async function loadMarkdown() {
    setStatus('Loading Markdown source...');
    const initialBody = parseJsonNode(initialNode, '');
    try {
      const data = await request();
      textarea.value = data.markdown || htmlToMarkdown(initialBody);
      setStatus(data.relative_path ? `Source: ${data.relative_path}` : '');
    } catch (error) {
      textarea.value = htmlToMarkdown(initialBody);
      setStatus(error.message || 'Could not load Markdown source.', true);
    }
    refreshPreview();
    mainTextDiv.hidden = true;
  }

  async function saveMarkdown() {
    syncSourceFromEditable();
    const markdown = textarea.value.trim();
    if (!markdown) {
      setStatus('Markdown text is required.', true);
      textarea.focus();
      return;
    }
    saveButton.disabled = true;
    try {
      setNativeBody(markdown);
      const nativeSave = nativeSaveButton();
      if (!nativeSave) throw new Error('Native save button is not available.');
      nativeSave.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await request({
        method: 'POST',
        body: JSON.stringify({
          entity_type: entityType,
          id: Number(entityId),
          title: parseJsonNode(titleNode, ''),
          markdown
        })
      });
      setStatus('Saved to eLabFTW and Markdown source.');
    } catch (error) {
      setStatus(error.message || 'Could not save Markdown source.', true);
    } finally {
      saveButton.disabled = false;
    }
  }

  previewButton?.addEventListener('click', refreshPreview);
  helpOpenButton?.addEventListener('click', () => helpDialog?.showModal());
  helpCloseButton?.addEventListener('click', () => helpDialog?.close());
  helpDialog?.addEventListener('click', (event) => {
    if (event.target === helpDialog) helpDialog.close();
  });
  nativeButton?.addEventListener('click', () => {
    mainTextDiv.hidden = !mainTextDiv.hidden;
  });
  saveButton?.addEventListener('click', saveMarkdown);
  textarea?.addEventListener('input', () => {
    refreshPreview();
  });
  previewBox?.addEventListener('input', () => {
    syncSourceFromEditable();
  });

  loadMarkdown();
})();
