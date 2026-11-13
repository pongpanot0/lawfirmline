import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greeting, toggleChip } from './standup-helpers.ts';

test('greeting changes at noon and evening', () => {
  assert.deepEqual([greeting(11), greeting(12), greeting(17)], ['อรุณสวัสดิ์', 'สวัสดีตอนบ่าย', 'สวัสดีตอนเย็น']);
});
test('chip selection adds and removes without changing other selections', () => {
  assert.deepEqual(toggleChip(['a'], 'b'), ['a', 'b']);
  assert.deepEqual(toggleChip(['a', 'b'], 'a'), ['b']);
});
