(() => {
  const root = document.getElementById('dashboardPlanner');
  if (!root) return;

  const apiBase = root.dataset.apiBase || '/planner-api.php';
  const timeZone = 'Asia/Shanghai';

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function dateInTimeZone(offsetDays = 0) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const date = new Date(`${values.year}-${values.month}-${values.day}T00:00:00`);
    date.setDate(date.getDate() + offsetDays);
    return date;
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function inputDateTime(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function planTime(plan) {
    const start = new Date(plan.start);
    const label = `${pad(start.getMonth() + 1)}-${pad(start.getDate())} ${pad(start.getHours())}:${pad(start.getMinutes())}`;
    return plan.end ? `${label} - ${plan.end.slice(11, 16)}` : label;
  }

  function statusClass(status) {
    if (status === 'done') return ' text-muted';
    if (status === 'delayed') return ' text-warning';
    if (status === 'cancelled') return ' text-muted';
    return '';
  }

  async function loadPlans() {
    const start = inputDateTime(dateInTimeZone(0));
    const end = inputDateTime(dateInTimeZone(7));
    const path = `/api/plans?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    const response = await fetch(`${apiBase}?path=${encodeURIComponent(path)}`, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    const data = await response.json().catch(() => []);
    if (!response.ok) throw new Error(data.error || `Planner request failed: ${response.status}`);
    return Array.isArray(data) ? data : [];
  }

  function render(plans) {
    const visible = plans
      .slice()
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .slice(0, 5);

    if (!visible.length) {
      root.innerHTML = `
        <a href='planner.php' class='list-group-item hl-hover-gray breakable text-muted'>
          No upcoming plans. Open Planner to add one.
        </a>
      `;
      return;
    }

    root.innerHTML = visible.map((plan) => `
      <a href='planner.php' class='list-group-item hl-hover-gray breakable color-strong'>
        <span class='font-weight-bold${statusClass(plan.status)}'>${escapeHtml(plan.title)}</span>
        <span class='text-nowrap smallgray ml-1'>${escapeHtml(planTime(plan))}</span>
      </a>
    `).join('');
  }

  loadPlans()
    .then(render)
    .catch((error) => {
      root.innerHTML = `<div class='list-group-item text-danger'>${escapeHtml(error.message)}</div>`;
    });
})();
