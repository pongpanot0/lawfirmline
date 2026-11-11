import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOverdue } from './process-overdue.ts';

test('overdue starts after the due day and ignores invalid dates', () => {
  const now = new Date(2026, 10, 11, 12);
  assert.equal(isOverdue('2026-11-10T12:00:00', now), true);
  assert.equal(isOverdue('2026-11-11T00:00:00', now), false);
  assert.equal(isOverdue('invalid', now), false);
  assert.equal(isOverdue(null, now), false);
});
