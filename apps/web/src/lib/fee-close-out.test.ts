import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { closeOutItems } from './fee-close-out.ts';
test('close-out sends only fields relevant to each action', () => {
  assert.deepEqual(closeOutItems([{ id: 'a' }, { id: 'b' }, { id: 'c' }], {
    a: { action: 'FULL', amount: '10', reason: '' }, b: { action: 'PARTIAL', amount: '2.5', reason: '' }, c: { action: 'WAIVE', amount: '10', reason: ' ตกลงแล้ว ' },
  }), [{ milestoneId: 'a', action: 'FULL' }, { milestoneId: 'b', action: 'PARTIAL', amount: 2.5 }, { milestoneId: 'c', action: 'WAIVE', reason: 'ตกลงแล้ว' }]);
});
