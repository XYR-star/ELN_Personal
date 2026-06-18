export function rowLabelForIndex(index) {
  let value = Number(index || 0);
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label || 'A';
}

export function generateSlotGrid(rows = 8, columns = 12) {
  const safeRows = Math.max(1, Math.min(Number(rows || 8), 26));
  const safeColumns = Math.max(1, Math.min(Number(columns || 12), 48));
  const slots = [];
  for (let row = 1; row <= safeRows; row += 1) {
    const rowLabel = rowLabelForIndex(row);
    for (let column = 1; column <= safeColumns; column += 1) {
      slots.push({ row, column, rowLabel, columnLabel: String(column), code: `${rowLabel}${column}` });
    }
  }
  return slots;
}

export function validateSlotCode(slotCode, rows = 8, columns = 12) {
  const normalized = String(slotCode || '').trim().toUpperCase();
  if (!/^[A-Z]+[0-9]+$/.test(normalized)) return null;
  return generateSlotGrid(rows, columns).some((slot) => slot.code === normalized) ? normalized : null;
}

export function assignmentState(assignment) {
  if (!assignment) return 'empty';
  if (Number(assignment.qty_stored || 0) <= 0) return 'depleted';
  return 'occupied';
}

export function buildStorageView({ location, assignments = [], children = [] }) {
  const rows = Number(location?.rows ?? location?.row_count ?? 8);
  const columns = Number(location?.columns ?? location?.column_count ?? 12);
  const bySlot = new Map(assignments.filter((assignment) => assignment.slot_code).map((assignment) => [String(assignment.slot_code).toUpperCase(), assignment]));
  const childBySlot = new Map(children.filter((child) => child.position_code).map((child) => [String(child.position_code).toUpperCase(), child]));
  return {
    location,
    rows,
    columns,
    slots: generateSlotGrid(rows, columns).map((slot) => {
      const child = childBySlot.get(slot.code) || null;
      const assignment = bySlot.get(slot.code) || null;
      return { ...slot, child, assignment, state: child ? 'child' : assignmentState(assignment) };
    })
  };
}

export function defaultChildLocationForSlot(parentLocation, slotCode) {
  const code = String(slotCode || '').trim().toUpperCase();
  if (!code) return null;
  if (parentLocation?.kind === 'freezer') {
    return { name: `抽屉 ${code}`, kind: 'drawer', layout_type: 'grid', rows: 5, columns: 5, position_code: code };
  }
  if (parentLocation?.kind === 'drawer' || parentLocation?.kind === 'rack') {
    return { name: `盒子 ${code}`, kind: 'box', layout_type: 'grid', rows: 9, columns: 9, position_code: code };
  }
  return null;
}

export function prepareStorageItemResults(items = [], selectedItemId = null) {
  const selected = selectedItemId === null || selectedItemId === undefined || selectedItemId === ''
    ? null
    : Number(selectedItemId);
  return items.map((item) => ({
    id: Number(item.id),
    title: String(item.title || `Resource #${item.id}`),
    selected: selected !== null && Number(item.id) === selected
  }));
}
