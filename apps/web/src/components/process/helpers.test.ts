import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueLabel, stepPosition } from './helpers.ts';

test('due dates include overdue and the seven day boundary', () => {
  const now = new Date(2026, 10, 11);
  assert.deepEqual(dueLabel('2026-11-18T12:00:00', now), { text: 'เหลือ 7 วัน', urgent: true });
  assert.deepEqual(dueLabel('2026-11-10T12:00:00', now), { text: 'เลยกำหนด 1 วัน', urgent: true });
  assert.equal(dueLabel('invalid', now), null);
});
test('step position uses current step', () => {
  assert.equal(stepPosition([{ key: 'a', label: 'A', state: 'done' }, { key: 'b', label: 'B', state: 'current' }]).position, 2);
});

test('daysUntil counts calendar days and rejects invalid dates', async () => {
  const { daysUntil } = await import('./helpers.ts');
  const now = new Date(2026, 10, 11, 23, 45);
  assert.equal(daysUntil('2026-11-11T01:00:00', now), 0);
  assert.equal(daysUntil('2026-11-10T23:59:00', now), -1);
  assert.equal(daysUntil('2026-11-13T00:00:00', now), 2);
  assert.equal(daysUntil('invalid', now), null);
});
