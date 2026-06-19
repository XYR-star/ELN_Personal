(function () {
  const root = document.querySelector('[data-ideas-root]');
  if (!root) return;

  const apiBase = root.dataset.apiBase || '/ideas-api.php';
  const form = root.querySelector('[data-idea-form]');
  const markdownInput = root.querySelector('[data-idea-markdown]');
  const tagsInput = root.querySelector('[data-idea-tags]');
  const locationInput = root.querySelector('[data-idea-location]');
  const editingInput = root.querySelector('[data-idea-editing-id]');
  const saveButton = root.querySelector('[data-idea-save]');
  const cancelButton = root.querySelector('[data-idea-cancel]');
  const list = root.querySelector('[data-ideas-list]');
  const empty = root.querySelector('[data-ideas-empty]');
  const errorBox = root.querySelector('[data-ideas-error]');
  const dateInput = root.querySelector('[data-ideas-date]');
  const clearDateButton = root.querySelector('[data-ideas-clear-date]');
  const calendar = root.querySelector('[data-ideas-calendar]');
  const tagFilters = root.querySelector('[data-ideas-tag-filters]');
  const locationFilters = root.querySelector('[data-ideas-location-filters]');
  const clearFiltersButton = root.querySelector('[data-ideas-clear-filters]');

  let allIdeas = [];
  let ideas = [];
  let selectedDate = '';
  let selectedTag = '';
  let selectedLocation = '';

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
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.hidden = !message;
  }

  function createText(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text || '';
    return element;
  }

  function parseTags(value) {
    const tags = [];
    const seen = new Set();
    for (const item of String(value || '').split(/[\s,，]+/)) {
      const tag = item.trim().replace(/^#/, '');
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      tags.push(tag);
    }
    return tags;
  }

  function ideaSummary(markdown) {
    return String(markdown || '').split(/\r?\n/).find(Boolean) || 'Idea';
  }

  function renderMarkdownText(markdown) {
    const fragment = document.createDocumentFragment();
    const text = String(markdown || '');
    const pattern = /(#([A-Za-z0-9_-]+)|\[\[(Experiment|Resource):\s*(\d+)\]\])/gi;
    let lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      fragment.append(document.createTextNode(text.slice(lastIndex, match.index)));
      if (match[2]) {
        const tag = createText('span', 'idea-chip', `#${match[2]}`);
        tag.dataset.ideasFilterTag = match[2];
        fragment.append(tag);
      } else if (match[3]) {
        const href = match[3].toLowerCase() === 'experiment'
          ? `/experiments.php?mode=view&id=${match[4]}`
          : `/database.php?mode=view&id=${match[4]}`;
        const link = document.createElement('a');
        link.href = href;
        link.textContent = `[[${match[3]}:${match[4]}]]`;
        fragment.append(link);
      }
      lastIndex = match.index + match[0].length;
    }
    fragment.append(document.createTextNode(text.slice(lastIndex)));
    return fragment;
  }

  function renderIdeas() {
    list.querySelectorAll('[data-idea-card]').forEach((card) => card.remove());
    empty.hidden = ideas.length > 0;
    for (const idea of ideas) {
      const card = document.createElement('article');
      card.className = 'card idea-card';
      card.dataset.ideaCard = idea.id;

      const body = document.createElement('div');
      body.className = 'card-body';
      const top = document.createElement('div');
      top.className = 'd-flex justify-content-between align-items-start flex-wrap';

      const metaWrap = document.createElement('div');
      metaWrap.append(createText('div', 'font-weight-bold', ideaSummary(idea.markdown)));
      const meta = createText('div', 'idea-meta mt-1', new Date(idea.created_at).toLocaleString());
      if (idea.location) {
        const location = createText('span', 'idea-chip idea-chip-clickable', idea.location);
        location.dataset.ideasFilterLocation = idea.location;
        meta.append(location);
      }
      metaWrap.append(meta);

      const actions = document.createElement('div');
      actions.className = 'btn-group';
      actions.innerHTML = `
        <button type="button" class="btn btn-secondary btn-sm" data-idea-edit="${idea.id}"><i class="fas fa-pencil-alt fa-fw"></i></button>
        <button type="button" class="btn btn-secondary btn-sm" data-idea-copy="${idea.id}"><i class="fas fa-link fa-fw"></i></button>
        <button type="button" class="btn btn-danger btn-sm" data-idea-delete="${idea.id}"><i class="fas fa-trash fa-fw"></i></button>
      `;
      actions.querySelector('[data-idea-edit]')?.addEventListener('click', (event) => {
        event.stopPropagation();
        editIdea(idea.id);
      });
      actions.querySelector('[data-idea-copy]')?.addEventListener('click', (event) => {
        event.stopPropagation();
        copyIdeaLink(idea.id);
      });
      actions.querySelector('[data-idea-delete]')?.addEventListener('click', (event) => {
        event.stopPropagation();
        deleteIdea(idea.id);
      });

      top.append(metaWrap, actions);
      const markdown = document.createElement('div');
      markdown.className = 'idea-markdown mt-3';
      markdown.append(renderMarkdownText(idea.markdown));
      body.append(top, markdown);

      const chips = document.createElement('div');
      chips.className = 'idea-meta mt-3';
      for (const tag of idea.tags || []) {
        const chip = createText('span', 'idea-chip idea-chip-clickable', `#${tag}`);
        chip.dataset.ideasFilterTag = tag;
        chips.append(chip);
      }
      for (const id of idea.linked_experiments || []) {
        const link = createText('a', 'idea-chip', `Experiment ${id}`);
        link.href = `/experiments.php?mode=view&id=${id}`;
        chips.append(link);
      }
      for (const id of idea.linked_resources || []) {
        const link = createText('a', 'idea-chip', `Resource ${id}`);
        link.href = `/database.php?mode=view&id=${id}`;
        chips.append(link);
      }
      if (chips.childElementCount) body.append(chips);

      card.append(body);
      list.append(card);
    }
  }

  function renderCalendar() {
    if (!calendar) return;
    calendar.replaceChildren();
    const base = selectedDate ? new Date(`${selectedDate}T00:00:00`) : new Date();
    const year = base.getFullYear();
    const month = base.getMonth();
    const first = new Date(year, month, 1);
    const weekdayOffset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const marked = new Set(allIdeas.map((idea) => idea.date));
    for (const label of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      calendar.append(createText('div', 'ideas-calendar-weekday', label));
    }
    for (let i = 0; i < weekdayOffset; i += 1) {
      calendar.append(createText('div', 'ideas-calendar-day', ''));
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `ideas-calendar-day${date === selectedDate ? ' is-selected' : ''}${marked.has(date) ? ' has-idea' : ''}`;
      button.dataset.ideasCalendarDate = date;
      button.textContent = String(day);
      calendar.append(button);
    }
  }

  function renderFilterButtons(container, values, type) {
    if (!container) return;
    container.replaceChildren();
    if (!values.length) {
      container.append(createText('div', 'text-muted small', type === 'tag' ? 'No tags yet.' : 'No locations yet.'));
      return;
    }
    for (const value of values) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-ghost btn-sm ideas-filter-chip';
      const active = type === 'tag' ? value === selectedTag : value === selectedLocation;
      if (active) button.classList.add('is-active');
      button.dataset[type === 'tag' ? 'ideasFilterTag' : 'ideasFilterLocation'] = value;
      button.textContent = type === 'tag' ? `#${value}` : value;
      container.append(button);
    }
  }

  function renderFilters() {
    const tags = [...new Set(allIdeas.flatMap((idea) => idea.tags || []))].sort((a, b) => a.localeCompare(b));
    const locations = [...new Set(allIdeas.map((idea) => idea.location).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    renderFilterButtons(tagFilters, tags, 'tag');
    renderFilterButtons(locationFilters, locations, 'location');
  }

  function applyFilters() {
    ideas = allIdeas.filter((idea) => {
      if (selectedDate && idea.date !== selectedDate) return false;
      if (selectedTag && !(idea.tags || []).includes(selectedTag)) return false;
      if (selectedLocation && idea.location !== selectedLocation) return false;
      return true;
    });
    renderIdeas();
    renderCalendar();
    renderFilters();
  }

  async function loadIdeas() {
    setError('');
    try {
      const data = await request();
      allIdeas = data.ideas || [];
      applyFilters();
    } catch (error) {
      setError(error.message || 'Could not load ideas.');
    }
  }

  function resetForm() {
    editingInput.value = '';
    form.dataset.editingId = '';
    markdownInput.value = '';
    tagsInput.value = '';
    locationInput.value = '';
    cancelButton.hidden = true;
    saveButton.innerHTML = '<i class="fas fa-paper-plane fa-fw mr-1"></i>Save idea';
  }

  async function saveIdea(event) {
    event?.preventDefault();
    setError('');
    const markdown = markdownInput.value.trim();
    if (!markdown) {
      setError('Idea text is required.');
      markdownInput.focus();
      return;
    }
    saveButton.disabled = true;
    try {
      const id = editingInput.value || form.dataset.editingId || '';
      await request({
        method: 'POST',
        body: JSON.stringify({
          id,
          markdown,
          tags: parseTags(tagsInput.value),
          location: locationInput.value
        })
      });
      resetForm();
      await loadIdeas();
    } catch (error) {
      setError(error.message || 'Could not save idea.');
    } finally {
      saveButton.disabled = false;
    }
  }

  async function deleteIdea(id) {
    setError('');
    try {
      await request({
        method: 'POST',
        body: JSON.stringify({ action: 'delete', id })
      });
      await loadIdeas();
    } catch (error) {
      setError(error.message || 'Could not delete idea.');
    }
  }

  function editIdea(id) {
    const idea = ideas.find((item) => item.id === id);
    if (!idea) return;
    editingInput.value = idea.id;
    form.dataset.editingId = idea.id;
    markdownInput.value = idea.markdown;
    tagsInput.value = (idea.tags || []).map((tag) => `#${tag}`).join(', ');
    locationInput.value = idea.location || '';
    cancelButton.hidden = false;
    saveButton.innerHTML = '<i class="fas fa-save fa-fw mr-1"></i>Save changes';
    markdownInput.focus();
  }

  async function copyIdeaLink(id) {
    const text = `[[Idea:${id}]]`;
    await navigator.clipboard?.writeText(text).catch(() => {});
  }

  form?.addEventListener('submit', saveIdea);
  cancelButton?.addEventListener('click', resetForm);
  dateInput?.addEventListener('change', () => {
    selectedDate = dateInput.value;
    applyFilters();
  });
  clearDateButton?.addEventListener('click', () => {
    selectedDate = '';
    dateInput.value = '';
    applyFilters();
  });
  calendar?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-ideas-calendar-date]');
    if (!button) return;
    selectedDate = button.dataset.ideasCalendarDate;
    dateInput.value = selectedDate;
    applyFilters();
  });
  root.addEventListener('click', (event) => {
    const tagButton = event.target.closest('[data-ideas-filter-tag]');
    const locationButton = event.target.closest('[data-ideas-filter-location]');
    if (tagButton) {
      selectedTag = selectedTag === tagButton.dataset.ideasFilterTag ? '' : tagButton.dataset.ideasFilterTag;
      applyFilters();
    }
    if (locationButton) {
      selectedLocation = selectedLocation === locationButton.dataset.ideasFilterLocation ? '' : locationButton.dataset.ideasFilterLocation;
      applyFilters();
    }
  });
  clearFiltersButton?.addEventListener('click', () => {
    selectedTag = '';
    selectedLocation = '';
    applyFilters();
  });
  list?.addEventListener('click', (event) => {
    const editButton = event.target.closest('[data-idea-edit]');
    const copyButton = event.target.closest('[data-idea-copy]');
    const deleteButton = event.target.closest('[data-idea-delete]');
    if (editButton) editIdea(editButton.dataset.ideaEdit);
    if (copyButton) copyIdeaLink(copyButton.dataset.ideaCopy);
    if (deleteButton) deleteIdea(deleteButton.dataset.ideaDelete);
  });

  loadIdeas();
})();
