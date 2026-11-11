import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { dayGroup, dayOffset } from './today-helpers.ts';

test('groups due dates across month boundaries and leaves undated work for later', () => {
  assert.equal(dayGroup(dayOffset('2026-10-31', '2026-11-01')), 'เกินกำหนด');
  assert.equal(dayGroup(dayOffset('2026-11-01', '2026-11-01')), 'วันนี้');
  assert.equal(dayGroup(dayOffset('2026-11-02', '2026-11-01')), 'พรุ่งนี้');
  assert.equal(dayGroup(dayOffset('2026-11-03', '2026-11-01')), 'ถัดไป');
  assert.equal(dayGroup(null), 'ถัดไป');
});
