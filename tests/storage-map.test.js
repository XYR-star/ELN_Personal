import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStorageView, defaultChildLocationForSlot, prepareStorageItemResults, validateSlotCode } from '../src/storage-map.js';

test('buildStorageView maps child locations and eLabFTW resources into slots', () => {
  const view = buildStorageView({
    location: { id: 1, name: 'Drawer C4', kind: 'drawer', rows: 5, columns: 5 },
    children: [{ id: 2, name: 'Box D5', kind: 'box', position_code: 'D5' }],
    assignments: [{ id: 9, item_id: 12, item_title: 'HEK293T P12', slot_code: 'A1', qty_stored: '1.00', qty_unit: 'tube' }]
  });

  assert.equal(view.rows, 5);
  assert.equal(view.columns, 5);
  assert.equal(view.slots.length, 25);
  assert.equal(view.slots.find((slot) => slot.code === 'D5').state, 'child');
  assert.equal(view.slots.find((slot) => slot.code === 'A1').state, 'occupied');
  assert.equal(view.slots.find((slot) => slot.code === 'A1').assignment.item_title, 'HEK293T P12');
});

test('defaultChildLocationForSlot suggests freezer drawers and drawer boxes', () => {
  assert.deepEqual(defaultChildLocationForSlot({ kind: 'freezer' }, 'C4'), {
    name: '抽屉 C4',
    kind: 'drawer',
    layout_type: 'grid',
    rows: 5,
    columns: 5,
    position_code: 'C4'
  });

  assert.deepEqual(defaultChildLocationForSlot({ kind: 'drawer' }, 'D5'), {
    name: '盒子 D5',
    kind: 'box',
    layout_type: 'grid',
    rows: 9,
    columns: 9,
    position_code: 'D5'
  });
});

test('validateSlotCode accepts only slots inside a layout', () => {
  assert.equal(validateSlotCode('a1', 9, 9), 'A1');
  assert.equal(validateSlotCode('I9', 9, 9), 'I9');
  assert.equal(validateSlotCode('J1', 9, 9), null);
  assert.equal(validateSlotCode('A10', 9, 9), null);
});

test('prepareStorageItemResults marks the selected eLabFTW resource', () => {
  const results = prepareStorageItemResults([
    { id: 7, title: 'HEK293T P12' },
    { id: 8, title: 'Plasmid pCMV' }
  ], 8);

  assert.deepEqual(results, [
    { id: 7, title: 'HEK293T P12', selected: false },
    { id: 8, title: 'Plasmid pCMV', selected: true }
  ]);
});
